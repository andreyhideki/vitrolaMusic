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

/** Depois deste tempo a cópia do catálogo é atualizada em segundo plano (faixas novas, títulos). */
const CATALOG_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const refreshing = new Set<number>();

/** Busca a lista de faixas no catálogo e guarda em `album_catalog`. Não lança erro (sem rede, tenta depois). */
async function refreshAlbumCatalog(albumId: number, catalogAlbumId: string): Promise<void> {
  if (refreshing.has(albumId)) return;
  refreshing.add(albumId);
  try {
    const remote = await catalogApi.album(catalogAlbumId);
    const tracks = remote?.tracks?.data;
    if (Array.isArray(tracks) && repo.getAlbum(albumId)) repo.saveAlbumCatalog(albumId, repo.toCatalogTracks(tracks));
  } catch {
    // Sem rede ou catálogo fora do ar: a tela continua com a cópia salva (ou só as faixas locais).
  } finally {
    refreshing.delete(albumId);
  }
}

function isStale(fetchedAt: string): boolean {
  const time = Date.parse(fetchedAt.replace(' ', 'T') + 'Z');
  return !Number.isFinite(time) || Date.now() - time > CATALOG_MAX_AGE_MS;
}

/**
 * Álbum com as faixas baixadas e as que ainda não foram. Nunca espera a rede: a lista do
 * catálogo vem da cópia salva na importação (`album_catalog`). Sem cópia (álbuns importados
 * antes dela) ou com cópia antiga, responde com o que tem e atualiza em segundo plano.
 */
catalogRouter.get('/albums/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const album = repo.getAlbum(id);
  if (!album) throw new HttpError(404, 'Álbum não encontrado');

  const extId = repo.getAlbumExtId(id);
  const catalogAlbumId = extId?.startsWith('catalog:album:') ? extId.slice('catalog:album:'.length) : null;
  const cached = catalogAlbumId ? repo.getAlbumCatalog(id) : null;
  if (catalogAlbumId && (!cached || isStale(cached.fetchedAt))) void refreshAlbumCatalog(id, catalogAlbumId);

  if (!cached) {
    const tracks = await Promise.all(repo.albumTracks(id).map(normalizeLocalTrack));
    res.json({ album, tracks });
    return;
  }

  const tracks = await Promise.all(cached.tracks.map(async (t) => {
    const local = repo.getTrackByExtId(`catalog:track:${t.catalogId}`);
    if (local) return normalizeLocalTrack(local);
    return {
      id: 0,
      title: t.title,
      durationSeconds: t.durationSeconds,
      trackNumber: t.trackNumber,
      downloadStatus: 'pending' as const,
      error: null,
      albumId: id,
      albumTitle: album.title,
      coverUrl: album.coverUrl,
      releaseYear: album.releaseYear,
      artistId: album.artistId,
      artistName: t.artistName ?? album.artistName,
      genreId: album.genreId,
      genreName: album.genreName,
      bitrateKbps: null,
      loudnessLufs: null,
      catalogId: t.catalogId,
    };
  }));
  res.json({ album, tracks });
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
