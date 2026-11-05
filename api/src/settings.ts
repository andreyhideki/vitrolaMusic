import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { db } from './db.js';
import { config } from './config.js';

export type AudioQuality = 'low' | 'medium' | 'high';

export interface AppSettings {
  audioQuality: AudioQuality;
  mediaDir: string;
  streamWithoutDownload: boolean;
  cleanupUnusedAfterDays: number;
  youtubeCookiesPath: string;
}

const DEFAULTS: AppSettings = {
  audioQuality: 'medium',
  mediaDir: '',
  streamWithoutDownload: false,
  cleanupUnusedAfterDays: 0,
  youtubeCookiesPath: '',
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
    youtubeCookiesPath: get('youtubeCookiesPath') || DEFAULTS.youtubeCookiesPath,
  };
}

export function updateSettings(s: Partial<AppSettings> & { youtubeCookiesContent?: string }): AppSettings {
  if (s.audioQuality !== undefined) set('audioQuality', s.audioQuality);
  if (s.mediaDir !== undefined) {
    const dir = s.mediaDir.trim();
    set('mediaDir', dir);
    if (dir) fs.mkdirSync(dir, { recursive: true });
  }
  if (s.streamWithoutDownload !== undefined) set('streamWithoutDownload', s.streamWithoutDownload ? '1' : '0');
  if (s.cleanupUnusedAfterDays !== undefined) set('cleanupUnusedAfterDays', String(Math.floor(s.cleanupUnusedAfterDays)));

  if (s.youtubeCookiesContent !== undefined) {
    const content = s.youtubeCookiesContent.trim();
    const cookiesFile = path.join(config.dataDir, 'youtube-cookies.txt');
    if (content) {
      fsp.writeFile(cookiesFile, content, 'utf-8').catch(() => {});
      set('youtubeCookiesPath', cookiesFile);
    } else {
      fsp.rm(cookiesFile, { force: true }).catch(() => {});
      set('youtubeCookiesPath', '');
    }
  } else if (s.youtubeCookiesPath !== undefined) {
    set('youtubeCookiesPath', s.youtubeCookiesPath.trim());
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

export function getEffectiveMediaDir(): string {
  const configured = getSettings().mediaDir;
  const dir = configured ? path.resolve(configured) : config.mediaDir;
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
