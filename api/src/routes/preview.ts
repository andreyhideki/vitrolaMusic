import { Router } from 'express';
import { catalogApi } from '../services/catalogApi.js';
import { db } from '../db.js';
import { HttpError } from '../http.js';

const yearOf = (date?: string | null): number | null => (date ? Number(date.slice(0, 4)) || null : null);

export const previewRouter = Router();

/** Faixas do catálogo no formato de TrackDto, marcando as que já existem na biblioteca. */
function previewTracks(list: any[], extra: (t: any) => { albumTitle: string; coverUrl: string | null; artistName: string }) {
  return list.map((t: any, i: number) => {
    const extId = `catalog:track:${t.id}`;
    const local = db.prepare('SELECT id, download_status, file_path, bitrate_kbps, loudness_lufs FROM tracks WHERE ext_id = ?').get(extId) as
      | { id: number; download_status: string; file_path: string | null; bitrate_kbps: number | null; loudness_lufs: number | null }
      | undefined;
    const isReady = local?.download_status === 'ready';
    const { albumTitle, coverUrl, artistName } = extra(t);
    return {
      id: local?.id ?? 0,
      title: t.title,
      durationSeconds: t.duration ?? null,
      trackNumber: t.track_position ?? i + 1,
      downloadStatus: isReady ? ('ready' as const) : ('pending' as const),
      error: null,
      albumId: 0,
      albumTitle,
      coverUrl,
      releaseYear: null,
      artistId: 0,
      artistName,
      genreId: null,
      genreName: null,
      bitrateKbps: isReady ? (local?.bitrate_kbps ?? null) : null,
      loudnessLufs: isReady ? (local?.loudness_lufs ?? null) : null,
      catalogId: String(t.id),
      localTrackId: local?.id ?? null,
    };
  });
}

previewRouter.get('/album', async (req, res) => {
  const catalogId = String(req.query.catalogId ?? '');
  if (!/^\d{1,20}$/.test(catalogId)) throw new HttpError(400, 'catalogId inválido');

  const a = await catalogApi.album(catalogId).catch(() => null);
  if (!a?.id) throw new HttpError(404, 'Álbum não encontrado no catálogo');

  const album = {
    id: 0,
    title: a.title,
    coverUrl: a.cover_big ?? a.cover_medium ?? null,
    releaseYear: yearOf(a.release_date),
    artistId: 0,
    artistName: a.artist?.name ?? '',
    genreId: null,
    genreName: (a.genres?.data ?? [])[0]?.name ?? null,
  };

  const tracks = previewTracks(a.tracks?.data ?? [], (t) => ({ albumTitle: a.title, coverUrl: album.coverUrl, artistName: t.artist?.name ?? a.artist?.name ?? '' }));
  res.json({ album, tracks, catalogId });
});

previewRouter.get('/playlist', async (req, res) => {
  const catalogId = String(req.query.catalogId ?? '');
  if (!/^\d{1,20}$/.test(catalogId)) throw new HttpError(400, 'catalogId inválido');

  const p = await catalogApi.playlist(catalogId).catch(() => null);
  if (!p?.id) throw new HttpError(404, 'Playlist não encontrada no catálogo');

  // Mesmo formato da prévia de álbum: "album" é o cabeçalho (título, capa, criador).
  const album = {
    id: 0,
    title: p.title,
    coverUrl: p.picture_big ?? p.picture_medium ?? null,
    releaseYear: null,
    artistId: 0,
    artistName: p.creator?.name ?? '',
    genreId: null,
    genreName: null,
  };
  const tracks = previewTracks(p.tracks?.data ?? [], (t) => ({
    albumTitle: t.album?.title ?? '',
    coverUrl: t.album?.cover_medium ?? null,
    artistName: t.artist?.name ?? '',
  }));
  res.json({ album, tracks, catalogId });
});
