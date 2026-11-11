import { Router } from 'express';
import { getSettings, updateSettings } from '../settings.js';

export const settingsRouter = Router();

settingsRouter.get('/', (_req, res) => {
  res.json(getSettings());
});

settingsRouter.post('/', async (req, res) => {
  const {
    audioQuality, mediaDir, streamWithoutDownload, cleanupUnusedAfterDays, youtubeCookiesContent,
    crossfadeSeconds, normalizeVolume,
  } = req.body ?? {};
  const updates: Partial<{
    audioQuality: 'low' | 'medium' | 'high';
    mediaDir: string;
    streamWithoutDownload: boolean;
    cleanupUnusedAfterDays: number;
    youtubeCookiesContent: string;
    crossfadeSeconds: number;
    normalizeVolume: boolean;
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
  if (typeof cleanupUnusedAfterDays === 'number' && Number.isFinite(cleanupUnusedAfterDays) && cleanupUnusedAfterDays >= 0) {
    updates.cleanupUnusedAfterDays = cleanupUnusedAfterDays;
  }
  if (typeof crossfadeSeconds === 'number' && Number.isFinite(crossfadeSeconds) && crossfadeSeconds >= 0) {
    updates.crossfadeSeconds = crossfadeSeconds;
  }
  if (typeof normalizeVolume === 'boolean') {
    updates.normalizeVolume = normalizeVolume;
  }
  if (typeof youtubeCookiesContent === 'string') {
    updates.youtubeCookiesContent = youtubeCookiesContent;
  }
  res.json(await updateSettings(updates));
});
