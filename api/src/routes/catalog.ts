import { Router } from 'express';
import fsp from 'node:fs/promises';
import * as repo from '../repo.js';
import { catalogApi } from '../services/catalogApi.js';
import { resolveTrackFile } from '../settings.js';
import { HttpError, parseId } from '../http.js';

export const catalogRouter = Router();

async function fileExists(stored: string | null): Promise<boolean> {
  const filePath = resolveTrackFile(stored);
  if (!filePath) return false;
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/** Normaliza o status pela existência real do arquivo local. */
async function normalizeLocalTrack(local: repo.TrackDto): Promise<repo.TrackDto> {
  const file = repo.getTrackFile(local.id);
  const exists = await fileExists(file?.file_path ?? null);
  if (exists) return { ...local, downloadStatus: 'ready' };
  // Se não há arquivo, nunca pode estar ready: mostra como pending.
  if (local.downloadStatus === 'ready') return { ...local, downloadStatus: 'pending', bitrateKbps: null, loudnessLufs: null };
  return local;
}

catalogRouter.get('/albums/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const album = repo.getAlbum(id);
  if (!album) throw new HttpError(404, 'Álbum não encontrado');

  const localTracks = repo.albumTracks(id);
  const extId = repo.getAlbumExtId(id);
  const catalogAlbumId = extId?.replace('catalog:album:', '');

  if (!catalogAlbumId) {
    const tracks = await Promise.all(localTracks.map(normalizeLocalTrack));
    res.json({ album, tracks });
    return;
  }

  try {
    const remote = await catalogApi.album(catalogAlbumId);
    const remoteTracks = await Promise.all((remote?.tracks?.data ?? []).map(async (t: any, i: number) => {
      const trackExtId = `catalog:track:${t.id}`;
      const local = repo.getTrackByExtId(trackExtId);
      if (local) return normalizeLocalTrack(local);
      return {
        id: 0,
        title: t.title,
        durationSeconds: t.duration ?? null,
        trackNumber: t.track_position ?? i + 1,
        downloadStatus: 'pending' as const,
        error: null,
        albumId: id,
        albumTitle: album.title,
        coverUrl: album.coverUrl,
        releaseYear: album.releaseYear,
        artistId: album.artistId,
        artistName: t.artist?.name ?? album.artistName,
        genreId: album.genreId,
        genreName: album.genreName,
        bitrateKbps: null,
        loudnessLufs: null,
        catalogId: String(t.id),
      };
    }));
    res.json({ album, tracks: remoteTracks });
  } catch {
    const tracks = await Promise.all(localTracks.map(normalizeLocalTrack));
    res.json({ album, tracks });
  }
});

catalogRouter.delete('/albums/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!repo.getAlbum(id)) throw new HttpError(404, 'Álbum não encontrado');
  const { filePaths } = repo.deleteAlbum(id);
  const safe = filePaths.map(resolveTrackFile).filter((p): p is string => !!p);
  await Promise.all(safe.map((p) => fsp.rm(p, { force: true })));
  res.status(204).end();
});

catalogRouter.get('/artists/:id', (req, res) => {
  const id = parseId(req.params.id);
  const artist = repo.getArtist(id);
  if (!artist) throw new HttpError(404, 'Artista não encontrado');
  res.json({ artist, albums: repo.artistAlbums(id), playlists: repo.artistPlaylists(id) });
});
