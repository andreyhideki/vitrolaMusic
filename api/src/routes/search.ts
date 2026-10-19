import { Router } from 'express';
import * as repo from '../repo.js';
import { deezer } from '../services/deezer.js';
import { HttpError } from '../http.js';

export const searchRouter = Router();

searchRouter.get('/', async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  if (q.length < 2) throw new HttpError(400, 'Informe ao menos 2 caracteres');

  const local = repo.searchLocal(q);
  let warning: string | undefined;
  let external: { tracks: object[]; albums: object[]; artists: object[] } = { tracks: [], albums: [], artists: [] };

  try {
    const [tracks, albums, artists] = await Promise.all([
      deezer.search('track', q),
      deezer.search('album', q),
      deezer.search('artist', q),
    ]);
    external = {
      tracks: tracks.map((t: any) => ({
        deezerId: String(t.id),
        title: t.title,
        artistName: t.artist?.name ?? '',
        albumTitle: t.album?.title ?? '',
        coverUrl: t.album?.cover_medium ?? null,
        durationSeconds: t.duration ?? null,
      })),
      albums: albums.map((a: any) => ({
        deezerId: String(a.id),
        title: a.title,
        artistName: a.artist?.name ?? '',
        coverUrl: a.cover_medium ?? null,
      })),
      artists: artists.map((a: any) => ({
        deezerId: String(a.id),
        name: a.name,
        imageUrl: a.picture_medium ?? null,
      })),
    };
  } catch {
    warning = 'Não foi possível consultar o catálogo externo agora. Mostrando apenas a biblioteca local.';
  }

  res.json({ local, external, warning });
});
