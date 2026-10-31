export type DownloadStatus = 'pending' | 'downloading' | 'ready' | 'failed';

export interface TrackDto {
  id: number;
  title: string;
  durationSeconds: number | null;
  trackNumber: number | null;
  downloadStatus: DownloadStatus;
  error: string | null;
  albumId: number;
  albumTitle: string;
  coverUrl: string | null;
  releaseYear: number | null;
  artistId: number;
  artistName: string;
  genreId: number | null;
  genreName: string | null;
  bitrateKbps: number | null;
}

export interface AlbumDto {
  id: number;
  title: string;
  coverUrl: string | null;
  releaseYear: number | null;
  artistId: number;
  artistName: string;
  genreId: number | null;
  genreName: string | null;
}

export interface GenreDto {
  id: number;
  name: string;
}

export interface LibraryResponse {
  albums: AlbumDto[];
  tracks: TrackDto[];
}

export interface AlbumPreviewResponse {
  album: AlbumDto;
  tracks: (TrackDto & { catalogId: string; localTrackId: number | null })[];
  catalogId: string;
}

export interface AppSettings {
  audioQuality: 'low' | 'medium' | 'high';
  mediaDir: string;
  streamWithoutDownload: boolean;
  cleanupUnusedAfterDays: number;
}

export interface ArtistDto {
  id: number;
  name: string;
  imageUrl: string | null;
}

export interface PlaylistSummary {
  id: number;
  name: string;
  description: string | null;
  trackCount: number;
}

export interface PlaylistDetail {
  id: number;
  name: string;
  description: string | null;
  entries: { entryId: number; position: number; track: TrackDto }[];
}

export interface ExternalTrack {
  catalogId: string;
  title: string;
  artistName: string;
  albumTitle: string;
  coverUrl: string | null;
  durationSeconds: number | null;
}

export interface ExternalAlbum {
  catalogId: string;
  title: string;
  artistName: string;
  coverUrl: string | null;
}

export interface SearchResponse {
  local: { tracks: TrackDto[]; albums: AlbumDto[]; artists: ArtistDto[]; playlists: PlaylistSummary[] };
  external: {
    tracks: ExternalTrack[];
    albums: ExternalAlbum[];
    artists: { catalogId: string; name: string; imageUrl: string | null }[];
  };
  warning?: string;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json' },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Erro ${res.status}`);
  return data as T;
}

export function send<T>(method: string, path: string, body?: unknown): Promise<T> {
  return api<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : 'Erro inesperado';
}
