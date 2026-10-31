import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import './db.js';
import { HttpError } from './http.js';
import { searchRouter } from './routes/search.js';
import { catalogRouter } from './routes/catalog.js';
import { importRouter } from './routes/import.js';
import { tracksRouter } from './routes/tracks.js';
import { playlistsRouter } from './routes/playlists.js';
import { libraryRouter } from './routes/library.js';
import { settingsRouter } from './routes/settings.js';
import { previewRouter } from './routes/preview.js';
import { resumeDownloads } from './services/downloader.js';
import { startCleanupScheduler } from './services/cleanup.js';

const app = express();

app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: '100kb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/search', searchRouter);
app.use('/api/import', importRouter);
app.use('/api/tracks', tracksRouter);
app.use('/api/playlists', playlistsRouter);
app.use('/api/library', libraryRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/preview', previewRouter);
app.use('/api', catalogRouter);

app.use((_req, _res, next) => {
  next(new HttpError(404, 'Rota não encontrada'));
});

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  const status = (err as { status?: number })?.status;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    res.status(status).json({ error: 'Requisição inválida' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Erro interno' });
});

app.listen(config.port, () => {
  console.log(`Vitrola API em http://localhost:${config.port}`);
  resumeDownloads();
  startCleanupScheduler();
});
