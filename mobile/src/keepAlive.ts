/**
 * Liga o serviço em primeiro plano do Android enquanto há música tocando ou downloads
 * na fila. Sem ele, o sistema pode encerrar o app (e o WebView) com a tela apagada.
 */
import { Capacitor } from '@capacitor/core';
import { usePlayback } from '../../frontend/src/player/playback';
import { Vitrola } from './native';

const CHECK_MS = 3000;

export function startKeepAlive(hasActiveDownloads: () => boolean): void {
  if (!Capacitor.isNativePlatform()) return;

  let last = '';
  const update = () => {
    const state = { playing: usePlayback.getState().playing, downloading: hasActiveDownloads() };
    const key = `${state.playing}|${state.downloading}`;
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
