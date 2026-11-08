import fs from 'node:fs';
import path from 'node:path';
import { db } from '../db.js';
import { deleteTrack } from '../repo.js';
import { getEffectiveMediaDir, getSettings, resolveTrackFile } from '../settings.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface CleanupResult {
  deleted: number;
  freedBytes: number;
}

export function cleanupUnusedTracks(days: number): CleanupResult {
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
        const stat = fs.statSync(filePath);
        freedBytes += stat.size;
        fs.rmSync(filePath, { force: true });
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

export function mediaUsage(): { bytes: number; trackCount: number } {
  const dir = getEffectiveMediaDir();
  let bytes = 0;
  let trackCount = 0;

  function walk(current: string): void {
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        try {
          bytes += fs.statSync(full).size;
          trackCount++;
        } catch {
          // ignora arquivos removidos durante a leitura
        }
      }
    }
  }

  try {
    walk(dir);
  } catch {
    // pasta ainda não existe
  }

  return { bytes, trackCount };
}

function runCleanup(): void {
  const days = getSettings().cleanupUnusedAfterDays;
  if (!days || days <= 0) return;
  const result = cleanupUnusedTracks(days);
  if (result.deleted > 0) {
    console.log(`Cleanup: ${result.deleted} faixas removidas, ${result.freedBytes} bytes liberados.`);
  }
}

export function startCleanupScheduler(): void {
  runCleanup();
  setInterval(runCleanup, DAY_MS);
}
