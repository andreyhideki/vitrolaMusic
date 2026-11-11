import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { db } from './db.js';
import { config } from './config.js';
import { HttpError } from './http.js';

/** Caminho fixo do arquivo de cookies. Nunca aceitamos caminho vindo do cliente:
 *  o yt-dlp lê E regrava o arquivo passado em --cookies. */
export const COOKIES_FILE = path.join(config.dataDir, 'youtube-cookies.txt');

// Corrige permissões de arquivos de cookies criados por versões anteriores (0644).
try {
  fs.chmodSync(COOKIES_FILE, 0o600);
} catch {
  // arquivo ainda não existe
}

/** Resolve `mediaDir` (relativo a DATA_DIR) e garante que fique dentro de DATA_DIR. */
function resolveMediaDir(dir: string): string | null {
  const resolved = path.resolve(config.dataDir, dir);
  const rel = path.relative(config.dataDir, resolved);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return resolved;
}

export type AudioQuality = 'low' | 'medium' | 'high';

export interface AppSettings {
  audioQuality: AudioQuality;
  mediaDir: string;
  streamWithoutDownload: boolean;
  cleanupUnusedAfterDays: number;
  youtubeCookiesPath: string;
  /** Duração do crossfade entre faixas, em segundos (0 = desativado). */
  crossfadeSeconds: number;
  /** Equaliza o volume entre faixas usando a loudness medida de cada uma. */
  normalizeVolume: boolean;
}

export const MAX_CROSSFADE_SECONDS = 12;

const DEFAULTS: AppSettings = {
  audioQuality: 'medium',
  mediaDir: '',
  streamWithoutDownload: false,
  cleanupUnusedAfterDays: 0,
  youtubeCookiesPath: '',
  crossfadeSeconds: 0,
  normalizeVolume: true,
};

function get(key: keyof AppSettings): string {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? '';
}

function set(key: keyof AppSettings, value: string): void {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}

function boolOf(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return value === '1' || value === 'true';
}

function numberOf(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function getSettings(): AppSettings {
  return {
    audioQuality: (get('audioQuality') || DEFAULTS.audioQuality) as AudioQuality,
    mediaDir: get('mediaDir') || DEFAULTS.mediaDir,
    streamWithoutDownload: boolOf(get('streamWithoutDownload'), DEFAULTS.streamWithoutDownload),
    cleanupUnusedAfterDays: numberOf(get('cleanupUnusedAfterDays'), DEFAULTS.cleanupUnusedAfterDays),
    youtubeCookiesPath: get('youtubeCookiesPath') ? COOKIES_FILE : DEFAULTS.youtubeCookiesPath,
    crossfadeSeconds: Math.min(MAX_CROSSFADE_SECONDS, numberOf(get('crossfadeSeconds'), DEFAULTS.crossfadeSeconds)),
    normalizeVolume: boolOf(get('normalizeVolume'), DEFAULTS.normalizeVolume),
  };
}

export async function updateSettings(s: Partial<Omit<AppSettings, 'youtubeCookiesPath'>> & { youtubeCookiesContent?: string }): Promise<AppSettings> {
  if (s.mediaDir !== undefined) {
    const dir = s.mediaDir.trim();
    const resolved = dir ? resolveMediaDir(dir) : null;
    if (dir && !resolved) throw new HttpError(400, 'A pasta de mídia deve ficar dentro da pasta de dados (data/)');
    if (resolved) fs.mkdirSync(resolved, { recursive: true });
    set('mediaDir', dir);
  }
  if (s.audioQuality !== undefined) set('audioQuality', s.audioQuality);
  if (s.streamWithoutDownload !== undefined) set('streamWithoutDownload', s.streamWithoutDownload ? '1' : '0');
  if (s.cleanupUnusedAfterDays !== undefined) set('cleanupUnusedAfterDays', String(Math.floor(s.cleanupUnusedAfterDays)));

  if (s.crossfadeSeconds !== undefined) {
    set('crossfadeSeconds', String(Math.min(MAX_CROSSFADE_SECONDS, Math.max(0, Math.round(s.crossfadeSeconds)))));
  }
  if (s.normalizeVolume !== undefined) set('normalizeVolume', s.normalizeVolume ? '1' : '0');

  if (s.youtubeCookiesContent !== undefined) {
    const content = s.youtubeCookiesContent.trim();
    if (content) {
      // 0600: o arquivo contém credenciais da conta Google.
      await fsp.writeFile(COOKIES_FILE, content, { encoding: 'utf-8', mode: 0o600 });
      await fsp.chmod(COOKIES_FILE, 0o600);
      set('youtubeCookiesPath', COOKIES_FILE);
    } else {
      await fsp.rm(COOKIES_FILE, { force: true });
      set('youtubeCookiesPath', '');
    }
  }

  return getSettings();
}

export function audioQualityArg(quality: AudioQuality): string {
  switch (quality) {
    case 'low': return '5';
    case 'medium': return '3';
    case 'high': return '0';
  }
}

const AUDIO_FILE_EXT = new Set(['.mp3', '.m4a', '.flac', '.ogg', '.opus', '.wav']);

/**
 * Converte o `file_path` salvo no banco em caminho absoluto. Aceita caminhos
 * absolutos (formato atual) e relativos à pasta de mídia (formato antigo).
 * Retorna null se o arquivo estiver fora de DATA_DIR ou não for áudio, para que nenhuma rota
 * leia ou apague arquivos fora da área de dados.
 */
export function resolveTrackFile(filePath: string | null | undefined): string | null {
  if (!filePath) return null;
  const abs = path.isAbsolute(filePath) ? path.resolve(filePath) : path.resolve(getEffectiveMediaDir(), filePath);
  const rel = path.relative(config.dataDir, abs);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  if (!AUDIO_FILE_EXT.has(path.extname(abs).toLowerCase())) return null;
  return abs;
}

export function getEffectiveMediaDir(): string {
  const configured = getSettings().mediaDir;
  // Valor inválido (fora de DATA_DIR) salvo por versões antigas cai no padrão.
  const dir = (configured && resolveMediaDir(configured)) || config.mediaDir;
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
