/**
 * Roda a API de `api/src` pelos adaptadores do APK (mesmos aliases do build), com o
 * Filesystem do Capacitor e o plugin nativo simulados em memória.
 */
import { createRequire } from 'node:module';
import { beforeAll, describe, expect, it, vi } from 'vitest';

const files = new Map<string, string>();
const dirs = new Set<string>();
const pathOf = (uri: string) => decodeURIComponent(uri.replace(/^file:\/\//, ''));
const missing = () => Promise.reject(new Error('File does not exist'));

vi.mock('@capacitor/filesystem', () => ({
  Directory: { Data: 'DATA', External: 'EXTERNAL' },
  Encoding: { UTF8: 'utf8' },
  Filesystem: {
    getUri: async ({ directory, path }: { directory: string; path: string }) => ({
      uri: `file:///app/${directory === 'DATA' ? 'files' : 'external'}/${path}`,
    }),
    mkdir: async ({ path }: { path: string }) => void dirs.add(pathOf(path)),
    stat: async ({ path }: { path: string }) => {
      const p = pathOf(path);
      if (files.has(p)) return { type: 'file', size: files.get(p)!.length, mtime: 0 };
      if (dirs.has(p)) return { type: 'directory', size: 0, mtime: 0 };
      return missing();
    },
    readFile: async ({ path }: { path: string }) => (files.has(pathOf(path)) ? { data: files.get(pathOf(path))! } : missing()),
    writeFile: async ({ path, data }: { path: string; data: string }) => void files.set(pathOf(path), data),
    deleteFile: async ({ path }: { path: string }) => (files.delete(pathOf(path)) ? undefined : missing()),
    rename: async ({ from, to }: { from: string; to: string }) => {
      files.set(pathOf(to), files.get(pathOf(from))!);
      files.delete(pathOf(from));
    },
    copy: async ({ from, to }: { from: string; to: string }) => void files.set(pathOf(to), files.get(pathOf(from))!),
    readdir: async ({ path }: { path: string }) => {
      const dir = pathOf(path).replace(/\/$/, '');
      if (!dirs.has(dir)) return missing();
      const list = [...files.keys()].filter((f) => f.startsWith(dir + '/') && !f.slice(dir.length + 1).includes('/'));
      return { files: list.map((f) => ({ name: f.slice(dir.length + 1), type: 'file', size: files.get(f)!.length })) };
    },
  },
}));

const exec = vi.fn(async ({ cmd, args }: { cmd: string; args: string[] }) => {
  if (cmd === 'yt-dlp' && args[0] === '--version') return { exitCode: 0, stdout: '2026.10.26', stderr: '' };
  if (cmd === 'yt-dlp' && args.includes('-g')) return { exitCode: 0, stdout: 'https://stream.example/audio\n', stderr: '' };
  if (cmd === 'yt-dlp') {
    files.set(args[args.indexOf('-o') + 1], 'mp3-bytes');
    return { exitCode: 0, stdout: '', stderr: '' };
  }
  if (cmd === 'ffprobe') return { exitCode: 0, stdout: '192000\n', stderr: '' };
  return { exitCode: 0, stdout: '', stderr: '{ "input_i" : "-9.50" }' };
});

vi.mock('../native', () => ({
  Vitrola: { exec, kill: vi.fn(), setKeepAlive: vi.fn(), addListener: vi.fn(async () => ({ remove: vi.fn() })) },
}));

// No Node o sql.js acha o WASM sozinho (ao lado do .js); o `locateFile` do app é para o WebView.
vi.mock('sql.js', async () => {
  const real = createRequire(import.meta.url)('sql.js') as (opts?: object) => Promise<unknown>;
  return { default: () => real() };
});

const catalogAlbum = {
  id: 10,
  title: 'Disco',
  release_date: '1999-01-01',
  cover_big: 'https://img/c.jpg',
  artist: { id: 7, name: 'Banda', picture_medium: null },
  genres: { data: [{ name: 'Rock' }] },
  tracks: { data: [{ id: 101, title: 'Faixa #1', duration: 200, track_position: 1, artist: { name: 'Banda' } }] },
};

let server: typeof import('./index');
let call: (path: string, init?: { method?: string; body?: unknown }) => Promise<{ status: number; body: any }>;

beforeAll(async () => {
  const { bootstrap } = await import('../bootstrap');
  await bootstrap();
  server = await import('./index');

  // fetch externo (catálogo): simulado. /api/*: vai para os routers locais.
  const external = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/album/10')) return new Response(JSON.stringify(catalogAlbum));
    if (url.includes('/search/')) return new Response(JSON.stringify({ data: [] }));
    return new Response('{}', { status: 404 });
  });
  (globalThis as any).window = { fetch: external };
  (globalThis as any).location = { origin: 'https://localhost' };
  globalThis.fetch = external as typeof fetch;
  server.installLocalFetch();

  call = async (path, init) => {
    const res = await (globalThis as any).window.fetch(path, {
      method: init?.method ?? 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
});

describe('API local do APK', () => {
  it('responde auth desligada, como AUTH_DISABLED', async () => {
    expect(await call('/api/auth/status')).toEqual({ status: 200, body: { authenticated: true, disabled: true } });
  });

  it('cria, lista e exclui playlists (repo.ts + better-sqlite3 sobre sql.js)', async () => {
    const created = await call('/api/playlists', { method: 'POST', body: { name: 'Favoritas' } });
    expect(created.status).toBe(201);
    expect(created.body.name).toBe('Favoritas');

    const list = await call('/api/playlists');
    expect(list.body.map((p: any) => p.name)).toEqual(['Favoritas']);

    const del = await call(`/api/playlists/${created.body.id}`, { method: 'DELETE' });
    expect(del.status).toBe(204);
    expect((await call(`/api/playlists/${created.body.id}`)).status).toBe(404);
  });

  it('valida entrada com HttpError, como o middleware da API', async () => {
    expect(await call('/api/playlists', { method: 'POST', body: {} })).toEqual({
      status: 400,
      body: { error: 'Campo "name" é obrigatório' },
    });
    expect((await call('/api/nao-existe')).body).toEqual({ error: 'Rota não encontrada' });
  });

  it('salva configurações e cookies no arquivo fixo', async () => {
    const saved = await call('/api/settings', { method: 'POST', body: { crossfadeSeconds: 5, youtubeCookiesContent: 'cookie' } });
    expect(saved.body.crossfadeSeconds).toBe(5);
    expect(saved.body.youtubeCookiesPath).toBe('/app/files/vitrola/youtube-cookies.txt');
    expect(files.get('/app/files/vitrola/youtube-cookies.txt')).toBe('cookie');
  });

  it('importa um álbum, baixa pelo yt-dlp nativo e mede bitrate/loudness', async () => {
    const imported = await call('/api/import/album', { method: 'POST', body: { catalogId: '10' } });
    expect(imported.status).toBe(201);

    await vi.waitFor(async () => {
      const lib = await call('/api/library');
      expect(lib.body.tracks).toHaveLength(1);
    }, { timeout: 5000 });

    const track = (await call('/api/library')).body.tracks[0];
    expect(track).toMatchObject({ title: 'Faixa #1', downloadStatus: 'ready', bitrateKbps: 192, loudnessLufs: -9.5, genreName: 'Rock' });
    expect(files.has('/app/files/vitrola/media/Banda - Disco - Faixa #1.mp3')).toBe(true);

    const progress = await call(`/api/tracks/${track.id}/progress`);
    expect(progress.body).toEqual({ percent: 100, status: 'ready' });

    const usage = await call('/api/library/usage');
    expect(usage.body).toEqual({ bytes: 'mp3-bytes'.length, trackCount: 1 });

    // Arquivo local: URL do WebView com o nome codificado (o "#" não pode virar fragmento).
    const src = await server.resolveStreamUrl(String(track.id), `/api/tracks/${track.id}/stream`);
    expect(src).toContain('Faixa%20%231.mp3');
    // Streaming sem download: URL direta do yt-dlp.
    expect(await server.resolveStreamUrl(String(track.id), `/api/tracks/${track.id}/stream-url`)).toBe('https://stream.example/audio');
  });

  it('grava o banco no arquivo do app e recarrega', async () => {
    const { flushAll } = await import('./persist');
    await flushAll();
    const saved = files.get('/app/files/vitrola/vitrola.db');
    expect(saved && saved.length).toBeGreaterThan(100);

    const initSqlJs = (await import('sql.js')).default;
    const SQL = await initSqlJs();
    const copy = new SQL.Database(Uint8Array.from(atob(saved!), (c) => c.charCodeAt(0)));
    expect(copy.exec('SELECT title FROM tracks')[0].values).toEqual([['Faixa #1']]);
    expect(copy.exec('SELECT value FROM settings WHERE key = ?', ['crossfadeSeconds'])[0].values).toEqual([['5']]);
  });

  it('remove a faixa e o arquivo', async () => {
    const track = (await call('/api/library')).body.tracks[0];
    expect((await call(`/api/tracks/${track.id}`, { method: 'DELETE' })).status).toBe(204);
    expect(files.has('/app/files/vitrola/media/Banda - Disco - Faixa #1.mp3')).toBe(false);
  });
});
