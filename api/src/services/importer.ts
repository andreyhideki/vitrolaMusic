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
  // Guarda a lista de faixas: a tela do álbum abre sem consultar o catálogo pela rede.
  repo.saveAlbumCatalog(albumId, repo.toCatalogTracks(tracks));
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
  if (full?.tracks?.data) repo.saveAlbumCatalog(albumId, repo.toCatalogTracks(full.tracks.data));

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

/**
 * Importa uma playlist do catálogo: cria a playlist local (ou atualiza a já importada,
 * sem duplicar faixas), cadastra as faixas e enfileira os downloads.
 */
export async function importPlaylist(catalogId: string): Promise<number> {
  const p = await catalogApi.playlist(catalogId).catch(() => null);
  if (!p?.id) throw new HttpError(404, 'Playlist não encontrada no catálogo');

  const extId = `catalog:playlist:${p.id}`;
  const description = typeof p.description === 'string' && p.description.trim() ? p.description.trim() : null;
  const playlistId = repo.findPlaylistByExtId(extId) ?? repo.createCatalogPlaylist(extId, p.title, description);
  const existing = repo.playlistTrackIds(playlistId);

  const albums = new Set<string>();
  const trackIds: number[] = [];
  for (const t of (p.tracks?.data ?? []) as any[]) {
    if (!t?.id || !t.artist?.id || !t.album?.id) continue;
    const artistId = repo.upsertArtist(`catalog:artist:${t.artist.id}`, t.artist.name, t.artist.picture_medium ?? null);
    const albumId = repo.ensureAlbum(`catalog:album:${t.album.id}`, {
      title: t.album.title,
      artistId,
      coverUrl: t.album.cover_big ?? t.album.cover_medium ?? null,
    });
    albums.add(String(t.album.id));
    const trackId = repo.upsertTrack(`catalog:track:${t.id}`, {
      title: t.title,
      albumId,
      artistId,
      durationSeconds: t.duration ?? null,
      trackNumber: null,
    });
    if (!existing.has(trackId) && !trackIds.includes(trackId)) trackIds.push(trackId);
  }

  if (trackIds.length) repo.addTracks(playlistId, trackIds);
  trackIds.forEach((id) => enqueueDownload(id));
  void completeAlbums([...albums]);
  return playlistId;
}

/**
 * Faixas de playlist trazem só um resumo do álbum. Completa em segundo plano, um por vez,
 * os álbuns sem a cópia do catálogo: artista do álbum, gênero, ano e lista de faixas.
 */
async function completeAlbums(catalogIds: string[]): Promise<void> {
  for (const id of catalogIds) {
    const albumId = repo.findAlbumIdByExtId(`catalog:album:${id}`);
    if (!albumId || repo.getAlbumCatalog(albumId)) continue;
    const a = await catalogApi.album(id).catch(() => null);
    if (!a?.id) continue;
    const artistId = repo.upsertArtist(`catalog:artist:${a.artist.id}`, a.artist.name, a.artist.picture_medium ?? null);
    repo.upsertAlbum(`catalog:album:${a.id}`, {
      title: a.title,
      artistId,
      genreId: firstGenre(a),
      releaseYear: yearOf(a.release_date),
      coverUrl: a.cover_big ?? a.cover_medium ?? null,
    });
    repo.saveAlbumCatalog(albumId, repo.toCatalogTracks(a.tracks?.data ?? []));
    // Número da faixa no álbum (a playlist não informa).
    for (const t of (a.tracks?.data ?? []) as any[]) {
      if (t.track_position) repo.setTrackNumber(`catalog:track:${t.id}`, t.track_position);
    }
    await new Promise((r) => setTimeout(r, 250)); // não estoura o limite de requisições do catálogo
  }
}
