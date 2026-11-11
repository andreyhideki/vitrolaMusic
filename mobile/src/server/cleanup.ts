/**
 * Versão mobile de `api/src/services/cleanup.ts` (substituída no build pelo
 * `vite.config.ts`). O original usa `fs` síncrono, que o Filesystem do Capacitor não
 * tem. Mesmos exports e mesmas queries, só que assíncrono.
 */
import path from 'node:path';
import { db } from '../../../api/src/db';
import { deleteTrack } from '../../../api/src/repo';
import { getEffectiveMediaDir, getSettings, resolveTrackFile } from '../../../api/src/settings';
import { readdirWithSize, rm, stat } from '../shims/fs-promises';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface CleanupResult {
  deleted: number;
  freedBytes: number;
}

export async function cleanupUnusedTracks(days: number): Promise<CleanupResult> {
  const rows = db
    .prepare(
      `SELECT id, file_path FROM tracks
       WHERE download_status = 'ready'
         AND file_path IS NOT NULL
         AND COALESCE(last_played_at, created_at) < datetime('now', ?)`
    )
    .all(`-${days} days`) as { id: number; file_path: string | null }[];

  let freedBytes = 0;
  for (const row of rows) {
    const filePath = resolveTrackFile(row.file_path);
    if (filePath) {
      try {
        freedBytes += (await stat(filePath)).size;
        await rm(filePath, { force: true });
      } catch {
        // arquivo pode já estar ausente
      }
    }
    deleteTrack(row.id);
  }

  // Remove álbuns que ficaram sem faixas.
  db.exec('DELETE FROM albums WHERE id NOT IN (SELECT DISTINCT album_id FROM tracks)');

  return { deleted: rows.length, freedBytes };
}

export async function mediaUsage(): Promise<{ bytes: number; trackCount: number }> {
  let bytes = 0;
  let trackCount = 0;

  async function walk(current: string): Promise<void> {
    for (const entry of await readdirWithSize(current)) {
      if (entry.type === 'directory') {
        await walk(path.join(current, entry.name));
      } else {
        bytes += entry.size;
        trackCount++;
      }
    }
  }

  try {
    await walk(getEffectiveMediaDir());
  } catch {
    // pasta ainda não existe
  }

  return { bytes, trackCount };
}

async function runCleanup(): Promise<void> {
  const days = getSettings().cleanupUnusedAfterDays;
  if (!days || days <= 0) return;
  const result = await cleanupUnusedTracks(days);
  if (result.deleted > 0) {
    console.log(`Cleanup: ${result.deleted} faixas removidas, ${result.freedBytes} bytes liberados.`);
  }
}

export function startCleanupScheduler(): void {
  void runCleanup().catch((err) => console.error('Falha na limpeza automática', err));
  setInterval(() => void runCleanup().catch(() => {}), DAY_MS);
}
