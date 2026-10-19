import { Router } from 'express';
import * as repo from '../repo.js';
import { importAlbum, importTrack } from '../services/importer.js';
import { HttpError } from '../http.js';

export const importRouter = Router();

const DEEZER_ID = /^\d{1,20}$/;

function deezerId(value: unknown): string {
  const s = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  if (!DEEZER_ID.test(s)) throw new HttpError(400, 'deezerId inválido');
  return s;
}

importRouter.post('/track', async (req, res) => {
  const id = await importTrack(deezerId(req.body?.deezerId));
  res.status(201).json({ track: repo.getTrack(id) });
});

importRouter.post('/album', async (req, res) => {
  const albumId = await importAlbum(deezerId(req.body?.deezerId));
  res.status(201).json({ albumId });
});
