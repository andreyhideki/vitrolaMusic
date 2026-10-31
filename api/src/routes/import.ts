import { Router } from 'express';
import * as repo from '../repo.js';
import { importAlbum, importTrack } from '../services/importer.js';
import { HttpError } from '../http.js';

export const importRouter = Router();

const CATALOG_ID = /^\d{1,20}$/;

function catalogId(value: unknown): string {
  const s = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  if (!CATALOG_ID.test(s)) throw new HttpError(400, 'catalogId inválido');
  return s;
}

importRouter.post('/track', async (req, res) => {
  const id = await importTrack(catalogId(req.body?.catalogId));
  res.status(201).json({ track: repo.getTrack(id) });
});

importRouter.post('/album', async (req, res) => {
  const albumId = await importAlbum(catalogId(req.body?.catalogId));
  res.status(201).json({ albumId });
});
