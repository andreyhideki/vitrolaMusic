import fs from 'node:fs/promises';
import { db } from '../db.js';
import { resolveTrackFile } from '../settings.js';
import { getLoudness } from './audio-meta.js';

let running = false;

/**
 * Mede a loudness das faixas baixadas antes da normalização de volume existir.
 * Roda uma faixa por vez, em segundo plano, ao iniciar a API. Faixas cuja
 * análise falha ficam com NULL e são tentadas de novo no próximo início.
 */
export async function analyzeMissingLoudness(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const rows = db
      .prepare("SELECT id, file_path FROM tracks WHERE download_status = 'ready' AND loudness_lufs IS NULL AND file_path IS NOT NULL")
      .all() as { id: number; file_path: string }[];
    if (rows.length === 0) return;
    console.log(`Analisando loudness de ${rows.length} faixa(s) para a normalização de volume…`);

    let done = 0;
    for (const row of rows) {
      const file = resolveTrackFile(row.file_path);
      if (!file) continue;
      const exists = await fs.access(file).then(() => true, () => false);
      if (!exists) continue;
      const lufs = await getLoudness(file);
      if (lufs === null) continue;
      db.prepare('UPDATE tracks SET loudness_lufs = ? WHERE id = ?').run(lufs, row.id);
      done++;
    }
    console.log(`Loudness analisada em ${done} de ${rows.length} faixa(s).`);
  } catch (err) {
    console.error('Falha ao analisar loudness das faixas', err);
  } finally {
    running = false;
  }
}
