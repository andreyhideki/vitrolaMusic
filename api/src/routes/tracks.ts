import { Router, type Response } from 'express';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import fsp from 'node:fs/promises';
import path from 'node:path';
import * as repo from '../repo.js';
import { enqueueDownload } from '../services/downloader.js';
import { resolveTrackFile } from '../settings.js';
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
  const filePath = resolveTrackFile(repo.deleteTrack(id).filePath);
  if (filePath) await fsp.rm(filePath, { force: true });
  res.status(204).end();
});

async function trackFileExists(id: number): Promise<boolean> {
  const filePath = resolveTrackFile(repo.getTrackFile(id)?.file_path);
  if (!filePath) return false;
  try {
    await fsp.access(filePath);
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

/** Limita processos simultâneos do yt-dlp disparados por streaming. */
const MAX_CONCURRENT_STREAMS = 3;
let activeStreams = 0;

tracksRouter.get('/:id/stream-url', async (req, res) => {
  const id = parseId(req.params.id);
  const track = repo.getTrack(id);
  if (!track) throw new HttpError(404, 'Faixa não encontrada');
  if (activeStreams >= MAX_CONCURRENT_STREAMS) throw new HttpError(429, 'Muitos streams simultâneos, tente novamente');

  activeStreams++;
  let released = false;
  const release = () => {
    if (!released) {
      released = true;
      activeStreams--;
    }
  };
  res.on('close', release);

  try {
    const url = await getStreamUrl({ id, title: track.title, artistName: track.artistName });
    if (!url) throw new HttpError(502, 'Não foi possível obter o stream da fonte externa');

    const abort = new AbortController();
    res.on('close', () => abort.abort());

    let upstream: globalThis.Response;
    try {
      upstream = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: abort.signal });
    } catch {
      throw new HttpError(502, 'Não foi possível reproduzir o stream da fonte externa');
    }
    if (!upstream.ok || !upstream.body) throw new HttpError(502, 'Não foi possível reproduzir o stream da fonte externa');

    // Só repassa tipos de áudio; qualquer outra coisa vira audio/mpeg.
    const type = upstream.headers.get('content-type') ?? '';
    res.setHeader('Content-Type', /^audio\/[\w.+-]+$/i.test(type.split(';')[0].trim()) ? type : 'audio/mpeg');
    const length = upstream.headers.get('content-length');
    if (length && /^\d+$/.test(length)) res.setHeader('Content-Length', length);

    // pipe respeita backpressure; erros/desconexões encerram os dois lados.
    const body = Readable.fromWeb(upstream.body as unknown as WebReadableStream);
    body.on('error', () => res.destroy());
    body.pipe(res);
  } catch (err) {
    release();
    throw err;
  }
});

tracksRouter.get('/:id/stream', async (req, res) => {
  const id = parseId(req.params.id);
  const file = repo.getTrackFile(id);
  if (!file || file.download_status !== 'ready' || !file.file_path) {
    throw new HttpError(409, 'Faixa ainda não disponível');
  }

  const filePath = resolveTrackFile(file.file_path);
  if (!filePath) throw new HttpError(404, 'Arquivo de áudio não encontrado');
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
