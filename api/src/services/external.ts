import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getEffectiveMediaDir, getSettings, audioQualityArg } from '../settings.js';
import type { AudioProvider, TrackForDownload } from './downloader.js';

const execFileAsync = promisify(execFile);

const DOWNLOADER_BIN = 'yt-dlp';
const TMP_PREFIX = 'tmp-download-';
const TIMEOUT_MS = 180_000;

/** Progresso atual dos downloads em andamento (0-100). */
export const downloadProgress = new Map<number, number>();

function tmpPath(trackId: number): string {
  return path.join(getEffectiveMediaDir(), `${TMP_PREFIX}${trackId}.mp3`);
}

async function downloaderAvailable(): Promise<boolean> {
  try {
    await execFileAsync(DOWNLOADER_BIN, ['--version'], { timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

function parsePercent(line: string): number | null {
  const m = /(\d{1,3}(?:\.\d+)?)%/.exec(line);
  if (!m) return null;
  const value = Math.floor(Number(m[1]));
  return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : null;
}

/**
 * Provider que busca o áudio em uma fonte externa usando a ferramenta de download.
 * A busca usa o título e artista da faixa e converte o resultado para MP3.
 */
export const externalProvider: AudioProvider = {
  name: 'external',
  async find(track: TrackForDownload): Promise<string | null> {
    if (!(await downloaderAvailable())) {
      throw new Error('A ferramenta de download não está instalada ou não está no PATH');
    }

    const query = `ytsearch1:${track.artistName} - ${track.title}`;
    const out = tmpPath(track.id);
    const quality = audioQualityArg(getSettings().audioQuality);

    // Remove arquivo temporário anterior, se existir, para evitar conflitos.
    await fs.rm(out, { force: true });
    downloadProgress.set(track.id, 0);

    try {
      await runDownloader(track.id, out, quality, query);
    } catch (err) {
      await fs.rm(out, { force: true });
      downloadProgress.delete(track.id);
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Falha na ferramenta de download: ${message}`);
    }

    downloadProgress.delete(track.id);

    try {
      await fs.access(out);
      return out;
    } catch {
      throw new Error('A ferramenta de download não gerou o arquivo de áudio');
    }
  },
};

function runDownloader(trackId: number, out: string, quality: string, query: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      DOWNLOADER_BIN,
      [
        '--no-playlist',
        '--extract-audio',
        '--audio-format', 'mp3',
        '--audio-quality', quality,
        '--no-warnings',
        '--geo-bypass',
        '--newline',
        '--progress-template', '[download] %(progress._percent_str)s',
        '-o', out,
        query,
      ],
      { timeout: TIMEOUT_MS },
    );

    let stderr = '';

    proc.stdout.on('data', (chunk: Buffer) => {
      const lines = chunk.toString().split('\n');
      for (const line of lines) {
        const pct = parsePercent(line);
        if (pct !== null) downloadProgress.set(trackId, pct);
      }
    });

    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr || `Ferramenta de download saiu com código ${code}`));
    });
  });
}

/** Indica se um caminho é um temporário gerado por este provider. */
export function isTmpExternal(filePath: string): boolean {
  const name = path.basename(filePath);
  return name.startsWith(TMP_PREFIX);
}

/**
 * Obtém uma URL de stream direto da fonte externa para a faixa.
 * As URLs externas expiram rapidamente; use imediatamente.
 */
export async function getStreamUrl(track: TrackForDownload): Promise<string | null> {
  if (!(await downloaderAvailable())) return null;

  const query = `ytsearch1:${track.artistName} - ${track.title}`;
  const quality = audioQualityArg(getSettings().audioQuality);

  try {
    const { stdout } = await execFileAsync(
      DOWNLOADER_BIN,
      [
        '--no-playlist',
        '--extract-audio',
        '--audio-format', 'mp3',
        '--audio-quality', quality,
        '--no-warnings',
        '--geo-bypass',
        '-g',
        query,
      ],
      { timeout: 60_000 },
    );
    const url = stdout.trim().split('\n')[0];
    return url || null;
  } catch {
    return null;
  }
}
