import Database from 'better-sqlite3';
import { config } from './config.js';

export const db = new Database(config.dbFile);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function hasColumn(table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return cols.some((c) => c.name === column);
}

if (!hasColumn('albums', 'genre_id')) {
  db.exec(`ALTER TABLE albums ADD COLUMN genre_id INTEGER REFERENCES genres(id)`);
}

if (!hasColumn('tracks', 'bitrate_kbps')) {
  db.exec(`ALTER TABLE tracks ADD COLUMN bitrate_kbps INTEGER`);
}

if (!hasColumn('tracks', 'last_played_at')) {
  db.exec(`ALTER TABLE tracks ADD COLUMN last_played_at TEXT`);
}

db.exec(`
CREATE TABLE IF NOT EXISTS artists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ext_id TEXT UNIQUE,
  name TEXT NOT NULL,
  image_url TEXT
);

CREATE TABLE IF NOT EXISTS genres (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS albums (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ext_id TEXT UNIQUE,
  title TEXT NOT NULL,
  artist_id INTEGER NOT NULL REFERENCES artists(id),
  genre_id INTEGER REFERENCES genres(id),
  release_year INTEGER,
  cover_url TEXT
);

CREATE TABLE IF NOT EXISTS tracks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ext_id TEXT UNIQUE,
  title TEXT NOT NULL,
  album_id INTEGER NOT NULL REFERENCES albums(id),
  artist_id INTEGER NOT NULL REFERENCES artists(id),
  duration_seconds INTEGER,
  track_number INTEGER,
  file_path TEXT,
  bitrate_kbps INTEGER,
  download_status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS playlists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS playlist_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  position INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_entries_playlist ON playlist_entries(playlist_id, position);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

// Migra prefixos de catálogo usados por versões anteriores.
const LEGACY_CATALOG_PREFIX = 'deezer:';
for (const table of ['artists', 'albums', 'tracks']) {
  db.prepare(
    `UPDATE OR IGNORE ${table} SET ext_id = 'catalog:' || substr(ext_id, ?) WHERE ext_id LIKE ?`,
  ).run(LEGACY_CATALOG_PREFIX.length + 1, `${LEGACY_CATALOG_PREFIX}%`);
}
