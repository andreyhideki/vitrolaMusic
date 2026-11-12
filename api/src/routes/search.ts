import { Router } from 'express';
import * as repo from '../repo.js';
import { catalogApi } from '../services/catalogApi.js';
import { HttpError } from '../http.js';

export const searchRouter = Router();

searchRouter.get('/', async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  if (q.length < 2) throw new HttpError(400, 'Informe ao menos 2 caracteres');

  // scope=local responde na hora (só SQLite); scope=external espera o catálogo. Sem scope: os dois.
  const scope = req.query.scope === 'local' || req.query.scope === 'external' ? req.query.scope : 'all';
  const local = scope === 'external' ? { tracks: [], albums: [], artists: [], playlists: [] } : repo.searchLocal(q);
  let warning: string | undefined;
  let external: { tracks: object[]; albums: object[]; artists: object[]; playlists: object[] } = { tracks: [], albums: [], artists: [], playlists: [] };

  if (scope !== 'local') try {
    const [tracks, albums, artists, playlists] = await Promise.all([
      catalogApi.search('track', q, 25),
      catalogApi.search('album', q, 100),
      catalogApi.search('artist', q),
      // Playlists são opcionais: se só elas falharem, o resto da busca continua.
      catalogApi.search('playlist', q, 25).catch(() => []),
    ]);
    external = {
      tracks: tracks.map((t: any) => ({
        catalogId: String(t.id),
        title: t.title,
        artistName: t.artist?.name ?? '',
        albumTitle: t.album?.title ?? '',
        coverUrl: t.album?.cover_medium ?? null,
        durationSeconds: t.duration ?? null,
      })),
      albums: albums.map((a: any) => ({
        catalogId: String(a.id),
        title: a.title,
        artistName: a.artist?.name ?? '',
        coverUrl: a.cover_medium ?? null,
      })),
      artists: artists.map((a: any) => ({
        catalogId: String(a.id),
        name: a.name,
        imageUrl: a.picture_medium ?? null,
      })),
      playlists: playlists.map((p: any) => ({
        catalogId: String(p.id),
        title: p.title,
        ownerName: p.user?.name ?? p.creator?.name ?? '',
        coverUrl: p.picture_medium ?? null,
        trackCount: p.nb_tracks ?? 0,
      })),
    };
  } catch {
    warning = 'Não foi possível consultar o catálogo externo agora. Mostrando apenas a biblioteca local.';
  }

  res.json({ local, external, warning });
});
