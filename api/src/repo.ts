import { db } from './db.js';
import { HttpError } from './http.js';

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
  /** Loudness integrada em LUFS (null = ainda não analisada). */
  loudnessLufs: number | null;
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

export interface ArtistDto {
  id: number;
  name: string;
  imageUrl: string | null;
}

export interface GenreDto {
  id: number;
  name: string;
}

const TRACK_SELECT = `
SELECT t.id, t.title, t.duration_seconds, t.track_number, t.download_status, t.error,
       t.album_id, al.title AS album_title, al.cover_url, al.release_year,
       t.artist_id, ar.name AS artist_name,
       al.genre_id, g.name AS genre_name,
       t.bitrate_kbps, t.loudness_lufs
FROM tracks t
JOIN albums al ON al.id = t.album_id
JOIN artists ar ON ar.id = t.artist_id
LEFT JOIN genres g ON g.id = al.genre_id`;

const ALBUM_SELECT = `
SELECT al.id, al.title, al.cover_url, al.release_year, al.artist_id, al.genre_id,
       ar.name AS artist_name, g.name AS genre_name
FROM albums al
JOIN artists ar ON ar.id = al.artist_id
LEFT JOIN genres g ON g.id = al.genre_id`;

const toTrack = (r: any): TrackDto => ({
  id: r.id,
  title: r.title,
  durationSeconds: r.duration_seconds,
  trackNumber: r.track_number,
  downloadStatus: r.download_status,
  error: r.error,
  albumId: r.album_id,
  albumTitle: r.album_title,
  coverUrl: r.cover_url,
  releaseYear: r.release_year,
  artistId: r.artist_id,
  artistName: r.artist_name,
  genreId: r.genre_id ?? null,
  genreName: r.genre_name ?? null,
  bitrateKbps: r.bitrate_kbps ?? null,
  loudnessLufs: r.loudness_lufs ?? null,
});

const toAlbum = (r: any): AlbumDto => ({
  id: r.id,
  title: r.title,
  coverUrl: r.cover_url,
  releaseYear: r.release_year,
  artistId: r.artist_id,
  artistName: r.artist_name,
  genreId: r.genre_id ?? null,
  genreName: r.genre_name ?? null,
});

const toArtist = (r: any): ArtistDto => ({ id: r.id, name: r.name, imageUrl: r.image_url });

// ---------- leitura ----------

export function getTrack(id: number): TrackDto | null {
  const r = db.prepare(`${TRACK_SELECT} WHERE t.id = ?`).get(id);
  return r ? toTrack(r) : null;
}

export function getTrackFile(id: number) {
  return db.prepare('SELECT download_status, file_path FROM tracks WHERE id = ?').get(id) as
    | { download_status: DownloadStatus; file_path: string | null }
    | undefined;
}

export function getAlbum(id: number): AlbumDto | null {
  const r = db.prepare(`${ALBUM_SELECT} WHERE al.id = ?`).get(id);
  return r ? toAlbum(r) : null;
}

export function getAlbumExtId(id: number): string | null {
  const r = db.prepare('SELECT ext_id FROM albums WHERE id = ?').get(id) as { ext_id: string } | undefined;
  return r?.ext_id ?? null;
}

export function getTrackByExtId(extId: string): TrackDto | null {
  const r = db.prepare(`${TRACK_SELECT} WHERE t.ext_id = ?`).get(extId);
  return r ? toTrack(r) : null;
}

export function albumTracks(albumId: number): TrackDto[] {
  return (db.prepare(`${TRACK_SELECT} WHERE t.album_id = ? ORDER BY t.track_number, t.id`).all(albumId) as any[]).map(toTrack);
}

export function getArtist(id: number): ArtistDto | null {
  const r = db.prepare('SELECT id, name, image_url FROM artists WHERE id = ?').get(id);
  return r ? toArtist(r) : null;
}

export function artistAlbums(artistId: number): AlbumDto[] {
  return (db.prepare(`${ALBUM_SELECT} WHERE al.artist_id = ? ORDER BY al.release_year DESC, al.id DESC`).all(artistId) as any[]).map(toAlbum);
}

export function artistPlaylists(artistId: number): { id: number; name: string; description: string | null; trackCount: number }[] {
  return (db.prepare(`
    SELECT p.id, p.name, p.description,
      (SELECT COUNT(*) FROM playlist_entries e WHERE e.playlist_id = p.id) AS track_count
    FROM playlists p
    WHERE EXISTS (
      SELECT 1 FROM playlist_entries pe
      JOIN tracks t ON t.id = pe.track_id
      WHERE pe.playlist_id = p.id AND t.artist_id = ?
    )
    ORDER BY p.updated_at DESC, p.id DESC`).all(artistId) as any[])
    .map((r) => ({ id: r.id, name: r.name, description: r.description, trackCount: r.track_count }));
}

export function searchLocal(q: string, limit = 20) {
  const like = `%${q}%`;
  return {
    tracks: (db.prepare(`${TRACK_SELECT} WHERE t.title LIKE ? OR ar.name LIKE ? OR al.title LIKE ? ORDER BY t.title LIMIT ?`)
      .all(like, like, like, limit) as any[]).map(toTrack),
    albums: (db.prepare(`${ALBUM_SELECT} WHERE al.title LIKE ? OR ar.name LIKE ? ORDER BY al.title LIMIT ?`)
      .all(like, like, limit) as any[]).map(toAlbum),
    artists: (db.prepare('SELECT id, name, image_url FROM artists WHERE name LIKE ? ORDER BY name LIMIT ?')
      .all(like, limit) as any[]).map(toArtist),
    playlists: (db.prepare(`
      SELECT p.id, p.name, p.description,
        (SELECT COUNT(*) FROM playlist_entries e WHERE e.playlist_id = p.id) AS track_count
      FROM playlists p
      WHERE p.name LIKE ? OR p.description LIKE ?
      ORDER BY p.name LIMIT ?`)
      .all(like, like, limit) as any[])
      .map((r) => ({ id: r.id, name: r.name, description: r.description, trackCount: r.track_count })),
  };
}

// ---------- biblioteca local ----------

export function getGenres(): GenreDto[] {
  return (db.prepare('SELECT id, name FROM genres ORDER BY name').all() as any[]).map((r) => ({
    id: r.id,
    name: r.name,
  }));
}

export function listLibraryAlbums(genreId?: number): AlbumDto[] {
  const sql = genreId === undefined
    ? `${ALBUM_SELECT} WHERE EXISTS (SELECT 1 FROM tracks t WHERE t.album_id = al.id AND t.download_status = 'ready') ORDER BY al.title`
    : `${ALBUM_SELECT} WHERE al.genre_id = ? AND EXISTS (SELECT 1 FROM tracks t WHERE t.album_id = al.id AND t.download_status = 'ready') ORDER BY al.title`;
  const stmt = db.prepare(sql);
  return (genreId === undefined ? stmt.all() : stmt.all(genreId)).map(toAlbum) as AlbumDto[];
}

export function listLibraryTracks(genreId?: number): TrackDto[] {
  const sql = genreId === undefined
    ? `${TRACK_SELECT} WHERE t.download_status = 'ready' ORDER BY t.title`
    : `${TRACK_SELECT} WHERE t.download_status = 'ready' AND al.genre_id = ? ORDER BY t.title`;
  const stmt = db.prepare(sql);
  return (genreId === undefined ? stmt.all() : stmt.all(genreId)).map(toTrack) as TrackDto[];
}

// ---------- upserts (identificados por ext_id, ex.: "catalog:track:123") ----------

export function upsertArtist(extId: string, name: string, imageUrl: string | null): number {
  const row = db.prepare(`
    INSERT INTO artists (ext_id, name, image_url) VALUES (?, ?, ?)
    ON CONFLICT(ext_id) DO UPDATE SET name = excluded.name, image_url = excluded.image_url
    RETURNING id`).get(extId, name, imageUrl) as { id: number };
  return row.id;
}

export function upsertAlbum(
  extId: string,
  a: { title: string; artistId: number; genreId?: number | null; releaseYear: number | null; coverUrl: string | null },
): number {
  const row = db.prepare(`
    INSERT INTO albums (ext_id, title, artist_id, genre_id, release_year, cover_url)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(ext_id) DO UPDATE SET title = excluded.title, artist_id = excluded.artist_id,
      genre_id = excluded.genre_id, release_year = excluded.release_year, cover_url = excluded.cover_url
    RETURNING id`).get(extId, a.title, a.artistId, a.genreId ?? null, a.releaseYear, a.coverUrl) as { id: number };
  return row.id;
}

export function upsertGenre(name: string): number | null {
  if (!name) return null;
  const row = db.prepare(`
    INSERT INTO genres (name) VALUES (?)
    ON CONFLICT(name) DO UPDATE SET name = excluded.name
    RETURNING id`).get(name) as { id: number };
  return row.id;
}

export function upsertTrack(
  extId: string,
  t: { title: string; albumId: number; artistId: number; durationSeconds: number | null; trackNumber: number | null },
): number {
  // Não altera download_status: o estado do arquivo é gerenciado pelo downloader.
  const row = db.prepare(`
    INSERT INTO tracks (ext_id, title, album_id, artist_id, duration_seconds, track_number)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(ext_id) DO UPDATE SET title = excluded.title, album_id = excluded.album_id,
      artist_id = excluded.artist_id, duration_seconds = excluded.duration_seconds,
      track_number = excluded.track_number
    RETURNING id`).get(extId, t.title, t.albumId, t.artistId, t.durationSeconds, t.trackNumber) as { id: number };
  return row.id;
}

export function resetAttempts(id: number): void {
  db.prepare('UPDATE tracks SET attempts = 0 WHERE id = ?').run(id);
}

export function setTrackBitrate(id: number, bitrateKbps: number): void {
  db.prepare('UPDATE tracks SET bitrate_kbps = ? WHERE id = ?').run(bitrateKbps, id);
}

export function updateLastPlayed(id: number): void {
  db.prepare("UPDATE tracks SET last_played_at = datetime('now') WHERE id = ?").run(id);
}

export function deleteTrack(id: number): { filePath: string | null } {
  const row = db.prepare('SELECT file_path FROM tracks WHERE id = ?').get(id) as { file_path: string | null } | undefined;
  db.prepare('DELETE FROM tracks WHERE id = ?').run(id);
  return { filePath: row?.file_path ?? null };
}

export function deleteAlbum(id: number): { filePaths: string[] } {
  const tracks = db.prepare('SELECT id, file_path FROM tracks WHERE album_id = ?').all(id) as { id: number; file_path: string | null }[];
  const filePaths = tracks.map((t) => t.file_path).filter((p): p is string => !!p);
  for (const t of tracks) {
    db.prepare('DELETE FROM tracks WHERE id = ?').run(t.id);
  }
  db.prepare('DELETE FROM albums WHERE id = ?').run(id);
  return { filePaths };
}

// ---------- analytics ----------

export interface PlayInput {
  trackId: number;
  playedSeconds: number;
  durationSeconds: number | null;
  skipped: boolean;
}

export function recordPlay(input: PlayInput) {
  const track = getTrack(input.trackId);
  const row = db
    .prepare(
      `INSERT INTO plays (track_id, track_title, artist_name, album_title, genre_name, played_seconds, duration_seconds, skipped, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now')) RETURNING id`
    )
    .get(
      track?.id ?? input.trackId,
      track?.title ?? '',
      track?.artistName ?? null,
      track?.albumTitle ?? null,
      track?.genreName ?? null,
      input.playedSeconds,
      input.durationSeconds,
      input.skipped ? 1 : 0,
    ) as { id: number };
  return row.id;
}

export type AnalyticsPeriod = 'day' | 'week' | 'month' | 'year';

export interface AnalyticsResponse {
  totalPlays: number;
  totalSkipped: number;
  totalSeconds: number;
  topTracks: { trackTitle: string; artistName: string | null; plays: number; seconds: number }[];
  topArtists: { name: string | null; plays: number; seconds: number }[];
  topAlbums: { albumTitle: string | null; artistName: string | null; plays: number; seconds: number }[];
  topGenres: { name: string | null; plays: number; seconds: number }[];
  timeline: { bucket: string; plays: number; seconds: number; skipped: number }[];
}

function bucketFormat(period: AnalyticsPeriod): string {
  switch (period) {
    case 'day':
      return "strftime('%Y-%m-%d', created_at)";
    case 'week':
      return "strftime('%Y-W%W', created_at)";
    case 'month':
      return "strftime('%Y-%m', created_at)";
    case 'year':
      return "strftime('%Y', created_at)";
  }
}

export function getAnalytics(period: AnalyticsPeriod): AnalyticsResponse {
  const fmt = bucketFormat(period);
  const limit = 10;

  const totals = db
    .prepare('SELECT COUNT(*) c, COALESCE(SUM(skipped),0) s, COALESCE(SUM(played_seconds),0) sec FROM plays')
    .get() as { c: number; s: number; sec: number };

  const topTracks = db
    .prepare(
      `SELECT track_title, artist_name, COUNT(*) plays, COALESCE(SUM(played_seconds),0) seconds
       FROM plays GROUP BY track_title, artist_name ORDER BY plays DESC LIMIT ?`
    )
    .all(limit) as { track_title: string; artist_name: string | null; plays: number; seconds: number }[];

  const topArtists = db
    .prepare(
      `SELECT artist_name, COUNT(*) plays, COALESCE(SUM(played_seconds),0) seconds
       FROM plays GROUP BY artist_name ORDER BY plays DESC LIMIT ?`
    )
    .all(limit) as { artist_name: string | null; plays: number; seconds: number }[];

  const topAlbums = db
    .prepare(
      `SELECT album_title, artist_name, COUNT(*) plays, COALESCE(SUM(played_seconds),0) seconds
       FROM plays GROUP BY album_title, artist_name ORDER BY plays DESC LIMIT ?`
    )
    .all(limit) as { album_title: string | null; artist_name: string | null; plays: number; seconds: number }[];

  const topGenres = db
    .prepare(
      `SELECT genre_name, COUNT(*) plays, COALESCE(SUM(played_seconds),0) seconds
       FROM plays GROUP BY genre_name ORDER BY plays DESC LIMIT ?`
    )
    .all(limit) as { genre_name: string | null; plays: number; seconds: number }[];

  const timeline = db
    .prepare(
      `SELECT ${fmt} bucket, COUNT(*) plays, COALESCE(SUM(played_seconds),0) seconds, COALESCE(SUM(skipped),0) skipped
       FROM plays GROUP BY bucket ORDER BY bucket`
    )
    .all() as { bucket: string; plays: number; seconds: number; skipped: number }[];

  return {
    totalPlays: totals.c,
    totalSkipped: totals.s,
    totalSeconds: totals.sec,
    topTracks: topTracks.map((r) => ({
      trackTitle: r.track_title,
      artistName: r.artist_name,
      plays: r.plays,
      seconds: r.seconds,
    })),
    topArtists: topArtists.map((r) => ({ name: r.artist_name, plays: r.plays, seconds: r.seconds })),
    topAlbums: topAlbums.map((r) => ({
      albumTitle: r.album_title,
      artistName: r.artist_name,
      plays: r.plays,
      seconds: r.seconds,
    })),
    topGenres: topGenres.map((r) => ({ name: r.genre_name, plays: r.plays, seconds: r.seconds })),
    timeline,
  };
}

// ---------- playlists ----------

function touchPlaylist(id: number): void {
  db.prepare("UPDATE playlists SET updated_at = datetime('now') WHERE id = ?").run(id);
}

export function listPlaylists() {
  return (db.prepare(`
    SELECT p.id, p.name, p.description,
      (SELECT COUNT(*) FROM playlist_entries e WHERE e.playlist_id = p.id) AS track_count
    FROM playlists p ORDER BY p.updated_at DESC, p.id DESC`).all() as any[])
    .map((r) => ({ id: r.id, name: r.name, description: r.description, trackCount: r.track_count }));
}

export function playlistExists(id: number): boolean {
  return !!db.prepare('SELECT 1 FROM playlists WHERE id = ?').get(id);
}

export function getPlaylist(id: number) {
  const p = db.prepare('SELECT id, name, description FROM playlists WHERE id = ?').get(id) as
    | { id: number; name: string; description: string | null }
    | undefined;
  if (!p) return null;

  const rows = db.prepare('SELECT id, track_id, position FROM playlist_entries WHERE playlist_id = ? ORDER BY position')
    .all(id) as { id: number; track_id: number; position: number }[];

  const entries = rows.map((e) => ({
    entryId: e.id,
    position: e.position,
    track: getTrack(e.track_id)!,
  }));
  return { id: p.id, name: p.name, description: p.description, entries };
}

export function playlistSuggestions(playlistId: number, limit = 10): TrackDto[] {
  // Gênero mais comum entre as faixas já na playlist.
  const genreRow = db.prepare(`
    SELECT al.genre_id AS genre_id, COUNT(*) AS c
    FROM playlist_entries pe
    JOIN tracks t ON t.id = pe.track_id
    JOIN albums al ON al.id = t.album_id
    WHERE pe.playlist_id = ? AND al.genre_id IS NOT NULL
    GROUP BY al.genre_id
    ORDER BY c DESC, al.genre_id
    LIMIT 1
  `).get(playlistId) as { genre_id: number } | undefined;

  const genreId = genreRow?.genre_id;
  if (!genreId) return [];

  const existing = db.prepare('SELECT track_id FROM playlist_entries WHERE playlist_id = ?')
    .all(playlistId) as { track_id: number }[];
  const existingIds = new Set(existing.map((r) => r.track_id));

  const candidates = listLibraryTracks(genreId);
  return candidates
    .filter((t) => t.downloadStatus === 'ready' && !existingIds.has(t.id))
    .slice(0, limit);
}

export function createPlaylist(name: string, description: string | null): number {
  const row = db.prepare('INSERT INTO playlists (name, description) VALUES (?, ?) RETURNING id')
    .get(name, description) as { id: number };
  return row.id;
}

export function updatePlaylist(id: number, fields: { name?: string; description?: string }): void {
  db.prepare(`UPDATE playlists SET name = COALESCE(?, name), description = COALESCE(?, description),
    updated_at = datetime('now') WHERE id = ?`).run(fields.name ?? null, fields.description ?? null, id);
}

export function deletePlaylist(id: number): void {
  db.prepare('DELETE FROM playlists WHERE id = ?').run(id);
}

export function addTracks(playlistId: number, trackIds: number[]): void {
  const insert = db.prepare('INSERT INTO playlist_entries (playlist_id, track_id, position) VALUES (?, ?, ?)');
  const maxPos = db.prepare('SELECT COALESCE(MAX(position), 0) AS m FROM playlist_entries WHERE playlist_id = ?');

  db.transaction(() => {
    let pos = (maxPos.get(playlistId) as { m: number }).m;
    for (const trackId of trackIds) {
      if (!getTrack(trackId)) throw new HttpError(404, `Faixa ${trackId} não encontrada`);
      insert.run(playlistId, trackId, ++pos);
    }
    touchPlaylist(playlistId);
  })();
}

export function removeEntry(playlistId: number, entryId: number): boolean {
  const r = db.prepare('DELETE FROM playlist_entries WHERE id = ? AND playlist_id = ?').run(entryId, playlistId);
  if (r.changes > 0) touchPlaylist(playlistId);
  return r.changes > 0;
}

export function reorderEntries(playlistId: number, entryIds: number[]): void {
  const current = (db.prepare('SELECT id FROM playlist_entries WHERE playlist_id = ?').all(playlistId) as { id: number }[])
    .map((r) => r.id);
  const valid =
    current.length === entryIds.length &&
    new Set(entryIds).size === entryIds.length &&
    entryIds.every((id) => current.includes(id));
  if (!valid) throw new HttpError(400, 'A nova ordem deve conter exatamente os itens da playlist');

  const update = db.prepare('UPDATE playlist_entries SET position = ? WHERE id = ?');
  db.transaction(() => {
    entryIds.forEach((id, i) => update.run(i + 1, id));
    touchPlaylist(playlistId);
  })();
}
