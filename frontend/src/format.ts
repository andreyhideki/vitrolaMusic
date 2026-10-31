import type { DownloadStatus } from './api';

export function fmtTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export const fmtDuration = (seconds: number | null): string =>
  seconds == null ? '' : fmtTime(seconds);

export const STATUS_LABEL: Record<DownloadStatus, string> = {
  pending: 'Na fila',
  downloading: 'Baixando…',
  ready: 'Baixado',
  failed: 'Falhou',
};

export function fmtBitrate(kbps: number | null): string {
  if (!kbps || kbps <= 0) return '';
  return `${kbps} kbps`;
}

export function fmtBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** i;
  return `${value.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

export function fmtTotalSeconds(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return '0min';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}min`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}min`;
}
