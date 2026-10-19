import { Router } from 'express';
import * as repo from '../repo.js';

export const libraryRouter = Router();

libraryRouter.get('/genres', (_req, res) => {
  res.json(repo.getGenres());
});

libraryRouter.get('/', (req, res) => {
  const genreId = req.query.genre ? Number(req.query.genre) : undefined;
  res.json({
    albums: repo.listLibraryAlbums(genreId),
    tracks: repo.listLibraryTracks(genreId),
  });
});

libraryRouter.get('/search', (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!q) {
    res.json({ tracks: [] });
    return;
  }
  res.json({ tracks: repo.searchLocal(q, 20).tracks });
});
