import { catalogApi } from './catalogApi.js';
import * as repo from '../repo.js';
import { enqueueDownload } from './downloader.js';
import { HttpError } from '../http.js';

const yearOf = (date?: string | null): number | null => (date ? Number(date.slice(0, 4)) || null : null);

function firstGenre(a: any): number | null {
  const genres = a?.genres?.data ?? [];
  const name = genres[0]?.name;
  return name ? repo.upsertGenre(name) : null;
}

/** Importa um álbum inteiro (metadados + faixas) e enfileira os downloads. */
export async function importAlbum(catalogId: string): Promise<number> {
  const a = await catalogApi.album(catalogId).catch(() => null);
  if (!a?.id) throw new HttpError(404, 'Álbum não encontrado no catálogo');

  const artistId = repo.upsertArtist(`catalog:artist:${a.artist.id}`, a.artist.name, a.artist.picture_medium ?? null);
  const genreId = firstGenre(a);
  const albumId = repo.upsertAlbum(`catalog:album:${a.id}`, {
    title: a.title,
    artistId,
    genreId,
    releaseYear: yearOf(a.release_date),
    coverUrl: a.cover_big ?? a.cover_medium ?? null,
  });

  // Observação: álbuns muito grandes podem vir paginados (tracks.next); não tratado nesta versão.
  const tracks: any[] = a.tracks?.data ?? [];
  tracks.forEach((t, i) => {
    const trackId = repo.upsertTrack(`catalog:track:${t.id}`, {
      title: t.title,
      albumId,
      artistId,
      durationSeconds: t.duration ?? null,
      trackNumber: t.track_position ?? i + 1,
    });
    enqueueDownload(trackId);
  });

  return albumId;
}

/** Importa uma faixa avulsa e enfileira o download. */
export async function importTrack(catalogId: string): Promise<number> {
  const t = await catalogApi.track(catalogId).catch(() => null);
  if (!t?.id) throw new HttpError(404, 'Faixa não encontrada no catálogo');

  const artistId = repo.upsertArtist(`catalog:artist:${t.artist.id}`, t.artist.name, t.artist.picture_medium ?? null);

  const full = await catalogApi.album(String(t.album.id)).catch(() => null);
  const albumArtistId = full?.artist
    ? repo.upsertArtist(`catalog:artist:${full.artist.id}`, full.artist.name, full.artist.picture_medium ?? null)
    : artistId;
  const genreId = firstGenre(full);

  const albumId = repo.upsertAlbum(`catalog:album:${t.album.id}`, {
    title: t.album.title,
    artistId: albumArtistId,
    genreId,
    releaseYear: yearOf(full?.release_date),
    coverUrl: full?.cover_big ?? t.album.cover_big ?? null,
  });

  const trackId = repo.upsertTrack(`catalog:track:${t.id}`, {
    title: t.title,
    albumId,
    artistId,
    durationSeconds: t.duration ?? null,
    trackNumber: t.track_position ?? null,
  });

  enqueueDownload(trackId);
  return trackId;
}
