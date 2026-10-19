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
