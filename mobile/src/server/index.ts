/**
 * "API" local do APK: os mesmos routers e serviços de `api/src`, montados como em
 * `api/src/index.ts`, mas atendidos sem servidor HTTP (ver `installLocalFetch`).
 *
 * Só deve ser importado depois do `bootstrap()`: `api/src/config.ts` e `db.ts` leem
 * `process.env` e abrem o banco no momento do import.
 */
import { createApp } from '../shims/express';
import { authRouter } from './auth';
import { searchRouter } from '../../../api/src/routes/search';
import { importRouter } from '../../../api/src/routes/import';
import { tracksRouter } from '../../../api/src/routes/tracks';
import { playlistsRouter } from '../../../api/src/routes/playlists';
import { libraryRouter } from '../../../api/src/routes/library';
import { settingsRouter } from '../../../api/src/routes/settings';
import { previewRouter } from '../../../api/src/routes/preview';
import { playsRouter } from '../../../api/src/routes/plays';
import { analyticsRouter } from '../../../api/src/routes/analytics';
import { catalogRouter } from '../../../api/src/routes/catalog';
import { resumeDownloads } from '../../../api/src/services/downloader';
import { analyzeMissingLoudness } from '../../../api/src/services/loudness';
import { getStreamUrl } from '../../../api/src/services/external';
import { startCleanupScheduler } from './cleanup';
import * as repo from '../../../api/src/repo';
import { db } from '../../../api/src/db';
import { resolveTrackFile } from '../../../api/src/settings';
import { playableFileUrl } from '../shims/paths';
import type { RouterImpl } from '../shims/express';

const app = createApp();
// Mesma ordem de `api/src/index.ts`. Os tipos são os do Express real (para o tsc);
// no build, `express` é o adaptador local.
const mount = (prefix: string, router: unknown) => app.use(prefix, router as RouterImpl);
mount('/api/auth', authRouter);
mount('/api/search', searchRouter);
mount('/api/import', importRouter);
mount('/api/tracks', tracksRouter);
mount('/api/playlists', playlistsRouter);
mount('/api/library', libraryRouter);
mount('/api/settings', settingsRouter);
mount('/api/preview', previewRouter);
mount('/api/plays', playsRouter);
mount('/api/analytics', analyticsRouter);
mount('/api', catalogRouter);

/** Faz `fetch('/api/...')` do frontend ir para os routers locais; o resto segue normal. */
export function installLocalFetch(): void {
  const original = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const path = url.startsWith(location.origin) ? url.slice(location.origin.length) : url;
    if (path === '/api' || path.startsWith('/api/') || path.startsWith('/api?')) {
      return app.handle(path, init);
    }
    return original(input, init);
  };
}

/** Mesmas tarefas que a API roda no `app.listen` de `api/src/index.ts`. */
export function startBackgroundTasks(): void {
  resumeDownloads();
  startCleanupScheduler();
  void analyzeMissingLoudness();
}

/**
 * URL de áudio para o `<audio>` (ver `frontend/src/platform.ts`):
 * faixa baixada → arquivo local; streaming sem download → URL direta da fonte externa.
 */
export async function resolveStreamUrl(trackId: string, apiUrl: string): Promise<string> {
  const id = Number(trackId);
  if (apiUrl.endsWith('/stream-url')) {
    const track = repo.getTrack(id);
    if (!track) throw new Error('Faixa não encontrada');
    const url = await getStreamUrl({ id, title: track.title, artistName: track.artistName });
    if (!url) throw new Error('Não foi possível obter o stream da fonte externa');
    return url;
  }
  const file = repo.getTrackFile(id);
  const filePath = file?.download_status === 'ready' ? resolveTrackFile(file.file_path) : null;
  if (!filePath) throw new Error('Faixa ainda não disponível');
  return playableFileUrl(filePath);
}

/** Há downloads na fila ou em andamento? (enquanto houver, o app fica vivo em segundo plano) */
export function hasActiveDownloads(): boolean {
  const r = db.prepare("SELECT COUNT(*) AS c FROM tracks WHERE download_status IN ('pending', 'downloading')").get() as { c: number };
  return r.c > 0;
}
