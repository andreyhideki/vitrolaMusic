/**
 * Liga o serviço em primeiro plano do Android enquanto há música tocando ou downloads
 * na fila. Sem ele, o sistema pode encerrar o app (e o WebView) com a tela apagada.
 * A notificação mostra a posição na leva de downloads ("Baixando 2 de 100").
 */
import { Capacitor } from '@capacitor/core';
import { usePlayback } from '../../frontend/src/player/playback';
import { Vitrola } from './native';

const CHECK_MS = 3000;

/**
 * Conta uma "leva" de downloads: começa quando a fila sai do zero, cresce se entram
 * faixas novas (outro álbum importado) e zera quando a fila esvazia.
 */
export class DownloadBatch {
  private done = 0;
  private lastRemaining = 0;

  update(remaining: number): { current: number; total: number } {
    if (remaining === 0) {
      this.done = 0;
    } else if (remaining < this.lastRemaining) {
      this.done += this.lastRemaining - remaining;
    }
    this.lastRemaining = remaining;
    const total = this.done + remaining;
    return { current: remaining === 0 ? 0 : Math.min(this.done + 1, total), total };
  }
}

export function startKeepAlive(pendingDownloads: () => number): void {
  if (!Capacitor.isNativePlatform()) return;

  const batch = new DownloadBatch();
  let last = '';
  const update = () => {
    const { current, total } = batch.update(pendingDownloads());
    const state = {
      playing: usePlayback.getState().playing,
      downloading: total > 0,
      downloadCurrent: current,
      downloadTotal: total,
    };
    const key = `${state.playing}|${current}|${total}`;
    if (key === last) return;
    last = key;
    Vitrola.setKeepAlive(state).catch((err) => console.error('Falha no serviço em primeiro plano', err));
  };

  usePlayback.subscribe((s, prev) => {
    if (s.playing !== prev.playing) update();
  });
  setInterval(update, CHECK_MS);
  update();
}
