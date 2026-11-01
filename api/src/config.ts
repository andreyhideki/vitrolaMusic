import fs from 'node:fs';
import path from 'node:path';

const dataDir = path.resolve(process.env.DATA_DIR ?? './data');

export const config = {
  port: Number(process.env.PORT ?? 5172),
  dataDir,
  mediaDir: path.join(dataDir, 'media'),
  importDir: path.resolve(process.env.IMPORT_DIR ?? path.join(dataDir, 'import')),
  dbFile: path.join(dataDir, 'vitrola.db'),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
};

fs.mkdirSync(config.mediaDir, { recursive: true });
fs.mkdirSync(config.importDir, { recursive: true });
