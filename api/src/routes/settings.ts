import { Router } from 'express';
import { getSettings, updateSettings } from '../settings.js';

export const settingsRouter = Router();

settingsRouter.get('/', (_req, res) => {
  res.json(getSettings());
});

settingsRouter.post('/', (req, res) => {
  const { audioQuality, mediaDir, streamWithoutDownload } = req.body ?? {};
  const updates: Partial<{
    audioQuality: 'low' | 'medium' | 'high';
    mediaDir: string;
    streamWithoutDownload: boolean;
  }> = {};
  if (audioQuality === 'low' || audioQuality === 'medium' || audioQuality === 'high') {
    updates.audioQuality = audioQuality;
  }
  if (typeof mediaDir === 'string') {
    updates.mediaDir = mediaDir;
  }
  if (typeof streamWithoutDownload === 'boolean') {
    updates.streamWithoutDownload = streamWithoutDownload;
  }
  res.json(updateSettings(updates));
});
