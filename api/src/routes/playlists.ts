import { Router } from 'express';
import * as repo from '../repo.js';
import { HttpError, idList, parseId, requireString } from '../http.js';

export const playlistsRouter = Router();

function ensurePlaylist(id: number): void {
  if (!repo.playlistExists(id)) throw new HttpError(404, 'Playlist não encontrada');
}

playlistsRouter.get('/', (_req, res) => {
  res.json(repo.listPlaylists());
});

playlistsRouter.post('/', (req, res) => {
  const name = requireString(req.body?.name, 'name', 100);
  const description = typeof req.body?.description === 'string' ? req.body.description.slice(0, 500) : null;
  const id = repo.createPlaylist(name, description);
  res.status(201).json(repo.getPlaylist(id));
});

playlistsRouter.get('/:id', (req, res) => {
  const playlist = repo.getPlaylist(parseId(req.params.id));
  if (!playlist) throw new HttpError(404, 'Playlist não encontrada');
  res.json(playlist);
});

playlistsRouter.get('/:id/suggestions', (req, res) => {
  const id = parseId(req.params.id);
  ensurePlaylist(id);
  const suggestions = repo.playlistSuggestions(id);
  res.json(suggestions);
});

playlistsRouter.patch('/:id', (req, res) => {
  const id = parseId(req.params.id);
  ensurePlaylist(id);
  const name = req.body?.name !== undefined ? requireString(req.body.name, 'name', 100) : undefined;
  const description = typeof req.body?.description === 'string' ? req.body.description.slice(0, 500) : undefined;
  repo.updatePlaylist(id, { name, description });
  res.json(repo.getPlaylist(id));
});

playlistsRouter.delete('/:id', (req, res) => {
  const id = parseId(req.params.id);
  ensurePlaylist(id);
  repo.deletePlaylist(id);
  res.status(204).end();
});

playlistsRouter.post('/:id/tracks', (req, res) => {
  const id = parseId(req.params.id);
  ensurePlaylist(id);
  repo.addTracks(id, idList(req.body?.trackIds, 'trackIds'));
  res.status(201).json(repo.getPlaylist(id));
});

playlistsRouter.delete('/:id/entries/:entryId', (req, res) => {
  const id = parseId(req.params.id);
  ensurePlaylist(id);
  if (!repo.removeEntry(id, parseId(req.params.entryId))) throw new HttpError(404, 'Item não encontrado');
  res.json(repo.getPlaylist(id));
});

playlistsRouter.patch('/:id/order', (req, res) => {
  const id = parseId(req.params.id);
  ensurePlaylist(id);
  repo.reorderEntries(id, idList(req.body?.entryIds, 'entryIds'));
  res.json(repo.getPlaylist(id));
});
