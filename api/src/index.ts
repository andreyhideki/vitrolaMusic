import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import './db.js';
import { HttpError } from './http.js';
import net from 'node:net';
import { authRouter, requireAuth } from './auth.js';
import { searchRouter } from './routes/search.js';
import { catalogRouter } from './routes/catalog.js';
import { importRouter } from './routes/import.js';
import { tracksRouter } from './routes/tracks.js';
import { playlistsRouter } from './routes/playlists.js';
import { libraryRouter } from './routes/library.js';
import { settingsRouter } from './routes/settings.js';
import { previewRouter } from './routes/preview.js';
import { playsRouter } from './routes/plays.js';
import { analyticsRouter } from './routes/analytics.js';
import { resumeDownloads } from './services/downloader.js';
import { startCleanupScheduler } from './services/cleanup.js';
import { analyzeMissingLoudness } from './services/loudness.js';

const app = express();

app.disable('x-powered-by');

// Headers de segurança básicos (a API só devolve JSON e áudio).
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  next();
});

// Proteção contra DNS rebinding: só aceita requisições endereçadas a hosts conhecidos
// ou a IPs literais (rebinding depende de um nome de domínio controlado pelo atacante).
app.use((req, _res, next) => {
  const host = (req.headers.host ?? '').toLowerCase().replace(/:\d+$/, '');
  if (config.allowedHosts.includes(host) || net.isIP(host.replace(/^\[|\]$/g, ''))) return next();
  next(new HttpError(403, 'Host não permitido'));
});

app.use(cors({ origin: config.corsOrigin }));

// Proteção contra CSRF: requisições que alteram estado precisam ser JSON. Esse
// Content-Type força o preflight do CORS, que bloqueia outras origens.
app.use((req, _res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  const type = (req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
  if (type === 'application/json') return next();
  next(new HttpError(415, 'Content-Type deve ser application/json'));
});

app.use(express.json({ limit: '100kb' }));
app.use(requireAuth);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/auth', authRouter);
app.use('/api/search', searchRouter);
app.use('/api/import', importRouter);
app.use('/api/tracks', tracksRouter);
app.use('/api/playlists', playlistsRouter);
app.use('/api/library', libraryRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/preview', previewRouter);
app.use('/api/plays', playsRouter);
app.use('/api/analytics', analyticsRouter);
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
  void analyzeMissingLoudness();
});
