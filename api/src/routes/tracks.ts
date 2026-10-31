import { Router, type Response } from 'express';
import { createReadStream } from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import * as repo from '../repo.js';
import { enqueueDownload } from '../services/downloader.js';
import { getEffectiveMediaDir } from '../settings.js';
import { getStreamUrl, downloadProgress } from '../services/external.js';
import { HttpError, parseId } from '../http.js';

export const tracksRouter = Router();

const MIME: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/opus',
  '.wav': 'audio/wav',
};

function rangeNotSatisfiable(res: Response, size: number): void {
  res.status(416);
  res.setHeader('Content-Range', `bytes */${size}`);
  res.end();
}

tracksRouter.get('/:id', (req, res) => {
  const track = repo.getTrack(parseId(req.params.id));
  if (!track) throw new HttpError(404, 'Faixa não encontrada');
  res.json(track);
});

tracksRouter.post('/:id/played', (req, res) => {
  const id = parseId(req.params.id);
  if (!repo.getTrack(id)) throw new HttpError(404, 'Faixa não encontrada');
  repo.updateLastPlayed(id);
  res.status(204).end();
});

tracksRouter.post('/:id/download', (req, res) => {
  const id = parseId(req.params.id);
  if (!repo.getTrack(id)) throw new HttpError(404, 'Faixa não encontrada');
  repo.resetAttempts(id);
  enqueueDownload(id);
  res.status(202).json(repo.getTrack(id));
});

tracksRouter.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!repo.getTrack(id)) throw new HttpError(404, 'Faixa não encontrada');
  const { filePath } = repo.deleteTrack(id);
  if (filePath) await fsp.rm(filePath, { force: true });
  res.status(204).end();
});

async function trackFileExists(id: number): Promise<boolean> {
  const file = repo.getTrackFile(id);
  if (!file?.file_path) return false;
  try {
    await fsp.access(path.join(getEffectiveMediaDir(), file.file_path));
    return true;
  } catch {
    return false;
  }
}

tracksRouter.get('/:id/progress', async (req, res) => {
  const id = parseId(req.params.id);
  const track = repo.getTrack(id);
  if (!track) throw new HttpError(404, 'Faixa não encontrada');

  const hasFile = await trackFileExists(id);
  if (hasFile) {
    res.json({ percent: 100, status: 'ready' });
    return;
  }

  const percent = downloadProgress.get(id) ?? (track.downloadStatus === 'ready' ? 100 : 0);
  res.json({ percent, status: track.downloadStatus });
});

tracksRouter.get('/:id/stream-url', async (req, res) => {
  const id = parseId(req.params.id);
  const track = repo.getTrack(id);
  if (!track) throw new HttpError(404, 'Faixa não encontrada');
  const url = await getStreamUrl({ id, title: track.title, artistName: track.artistName });
  if (!url) throw new HttpError(502, 'Não foi possível obter o stream da fonte externa');

  try {
    const upstream = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!upstream.ok || !upstream.body) throw new Error('upstream failed');
    res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'audio/mpeg');
    res.setHeader('Accept-Ranges', 'bytes');
    const reader = upstream.body.getReader();
    const pump = async () => {
      const { done, value } = await reader.read();
      if (done) {
        res.end();
        return;
      }
      res.write(Buffer.from(value));
      await pump();
    };
    pump().catch(() => res.destroy());
  } catch {
    throw new HttpError(502, 'Não foi possível reproduzir o stream da fonte externa');
  }
});

tracksRouter.get('/:id/stream', async (req, res) => {
  const id = parseId(req.params.id);
  const file = repo.getTrackFile(id);
  if (!file || file.download_status !== 'ready' || !file.file_path) {
    throw new HttpError(409, 'Faixa ainda não disponível');
  }

  const filePath = file.file_path;
  const size = await fsp.stat(filePath).then((s) => s.size).catch(() => -1);
  if (size < 0) throw new HttpError(404, 'Arquivo de áudio não encontrado');

  res.setHeader('Content-Type', MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream');
  res.setHeader('Accept-Ranges', 'bytes');

  const range = req.headers.range;
  if (!range) {
    res.setHeader('Content-Length', size);
    createReadStream(filePath).pipe(res);
    return;
  }

  const m = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!m || (m[1] === '' && m[2] === '')) {
    rangeNotSatisfiable(res, size);
    return;
  }

  let start: number;
  let end: number;
  if (m[1] === '') {
    // sufixo: bytes=-500 (últimos 500 bytes)
    start = Math.max(size - Number(m[2]), 0);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }

  if (start >= size || start > end) {
    rangeNotSatisfiable(res, size);
    return;
  }

  res.status(206);
  res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
  res.setHeader('Content-Length', end - start + 1);

  const stream = createReadStream(filePath, { start, end });
  stream.on('error', () => res.destroy());
  res.on('close', () => stream.destroy());
  stream.pipe(res);
});
