import { Router } from 'express';
import * as repo from '../repo.js';
import { HttpError, parseId } from '../http.js';

export const playsRouter = Router();

playsRouter.post('/', (req, res) => {
  const trackId = parseId(req.body?.trackId);
  const playedSeconds = Math.max(0, Math.floor(Number(req.body?.playedSeconds ?? 0)));
  const durationSeconds = req.body?.durationSeconds == null ? null : Math.max(0, Math.floor(Number(req.body.durationSeconds)));
  const skipped = !!req.body?.skipped;

  if (!repo.getTrack(trackId)) throw new HttpError(404, 'Faixa não encontrada');
  repo.recordPlay({ trackId, playedSeconds, durationSeconds, skipped });
  res.status(204).end();
});
