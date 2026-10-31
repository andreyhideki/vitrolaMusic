import fs from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { db } from '../db.js';
import * as repo from '../repo.js';
import { getEffectiveMediaDir } from '../settings.js';
import { externalProvider, isTmpExternal } from './external.js';
import { getAudioBitrate } from './audio-meta.js';

export interface TrackForDownload {
  id: number;
  title: string;
  artistName: string;
}

/**
 * Fonte de áudio. Recebe a faixa e devolve o caminho de um arquivo local
 * (ou null). Novas fontes entram na lista `providers`.
 */
export interface AudioProvider {
  name: string;
  find(track: TrackForDownload): Promise<string | null>;
}

const AUDIO_EXT = new Set(['.mp3', '.m4a', '.flac', '.ogg', '.opus', '.wav']);

const normalize = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function sanitizeFileName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\\/:*?"<>|]/g, '-')
    .trim()
    .replace(/\s+/g, ' ')
    || String(Date.now());
}

/** Procura arquivos na pasta IMPORT_DIR cujo nome contenha título e artista. */
export const localFolderProvider: AudioProvider = {
  name: 'local-folder',
  async find(track) {
    const entries = await fs.readdir(config.importDir, { withFileTypes: true }).catch((): Dirent[] => []);
    const files = entries
      .filter((e) => e.isFile() && AUDIO_EXT.has(path.extname(e.name).toLowerCase()))
      .map((e) => ({ file: path.join(config.importDir, e.name), name: normalize(path.parse(e.name).name) }));

    const title = normalize(track.title);
    const artist = normalize(track.artistName);

    const exact = files.find((f) => f.name.includes(title) && f.name.includes(artist));
    if (exact) return exact.file;

    const byTitle = files.filter((f) => f.name.includes(title));
    return byTitle.length === 1 ? byTitle[0].file : null;
  },
};

const providers: AudioProvider[] = [localFolderProvider, externalProvider];

const CONCURRENCY = 2;
const MAX_ATTEMPTS = 3;

const waiting: number[] = [];
const scheduled = new Set<number>();
let active = 0;

async function findSource(track: TrackForDownload): Promise<string | null> {
  for (const provider of providers) {
    const found = await provider.find(track);
    if (found) return found;
  }
  return null;
}

export function enqueueDownload(trackId: number): void {
  const row = repo.getTrackFile(trackId);
  if (!row || row.download_status === 'ready' || scheduled.has(trackId)) return;

  db.prepare("UPDATE tracks SET download_status = 'pending' WHERE id = ?").run(trackId);
  scheduled.add(trackId);
  waiting.push(trackId);
  pump();
}

function pump(): void {
  while (active < CONCURRENCY && waiting.length > 0) {
    const id = waiting.shift()!;
    active++;
    run(id).finally(() => {
      active--;
      scheduled.delete(id);
      pump();
    });
  }
}

async function run(trackId: number): Promise<void> {
  const track = repo.getTrack(trackId);
  if (!track) return;

  db.prepare("UPDATE tracks SET download_status = 'downloading', attempts = attempts + 1 WHERE id = ?").run(trackId);

  try {
    const source = await findSource({ id: trackId, title: track.title, artistName: track.artistName });
    if (!source) throw new Error('Nenhuma fonte de áudio encontrada para a faixa');

    const fileName = sanitizeFileName(`${track.artistName} - ${track.albumTitle} - ${track.title}`);
    const dest = path.join(getEffectiveMediaDir(), `${fileName}${path.extname(source).toLowerCase()}`);
    await fs.copyFile(source, dest);

    // Se a origem foi um download temporário da fonte externa, remove para não duplicar.
    if (isTmpExternal(source)) {
      await fs.rm(source, { force: true });
    }

    const bitrateKbps = await getAudioBitrate(dest);

    db.prepare("UPDATE tracks SET download_status = 'ready', file_path = ?, bitrate_kbps = ?, error = NULL WHERE id = ?")
      .run(dest, bitrateKbps, trackId);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido';
    const { attempts } = db.prepare('SELECT attempts FROM tracks WHERE id = ?').get(trackId) as { attempts: number };

    if (attempts < MAX_ATTEMPTS) {
      db.prepare("UPDATE tracks SET download_status = 'pending', error = ? WHERE id = ?").run(message, trackId);
      setTimeout(() => enqueueDownload(trackId), 5000 * attempts);
    } else {
      db.prepare("UPDATE tracks SET download_status = 'failed', error = ? WHERE id = ?").run(message, trackId);
    }
  }
}

/** Ao iniciar, retoma downloads que ficaram pendentes ou em andamento. */
export function resumeDownloads(): void {
  db.prepare("UPDATE tracks SET download_status = 'pending' WHERE download_status = 'downloading'").run();
  const rows = db.prepare("SELECT id FROM tracks WHERE download_status = 'pending'").all() as { id: number }[];
  for (const r of rows) enqueueDownload(r.id);
}
