/**
 * Liga o player (frontend/src) à sessão de mídia nativa do Android (`MediaPlugin.java`):
 * - manda título, artista, álbum, capa, duração, posição e tocando/pausado para o carro
 *   (Bluetooth/AVRCP), a notificação e a tela de bloqueio;
 * - recebe os botões do carro, do fone e da notificação (tocar, pausar, avançar, voltar);
 * - pausa quando o áudio ia sair pelo alto-falante (carro desligou, Bluetooth caiu, fone saiu);
 * - detecta o carro para o modo carro (`platform.car`).
 */
import { Capacitor } from '@capacitor/core';
import { usePlayerStore } from '../../frontend/src/player/store';
import { usePlayback } from '../../frontend/src/player/playback';
import { playerControls } from '../../frontend/src/player/usePlayerAudio';
import { useLibrary } from '../../frontend/src/library';
import type { CarHooks } from '../../frontend/src/platform';
import { Media } from './native';

/** Monta o estado enviado ao Android (exportado para teste). */
export function mediaState() {
  const id = usePlayerStore.getState().currentTrackId;
  const track = id ? useLibrary.getState().byId[id] : undefined;
  const { playing, position, duration } = usePlayback.getState();
  return {
    hasTrack: !!track,
    playing: !!track && playing,
    title: track?.title ?? '',
    artist: track?.artistName ?? '',
    album: track?.albumTitle ?? '',
    artworkUrl: track?.coverUrl ?? undefined,
    durationMs: Math.round((duration || track?.durationSeconds || 0) * 1000),
    positionMs: Math.round((position || 0) * 1000),
  };
}

export function startMediaSession(): void {
  if (!Capacitor.isNativePlatform()) return;

  let lastKey = '';
  const push = (force = false) => {
    const state = mediaState();
    const key = JSON.stringify({ ...state, positionMs: 0 });
    if (!force && key === lastKey) return;
    lastKey = key;
    Media.update(state).catch((err) => console.error('Falha ao atualizar a sessão de mídia', err));
  };

  usePlayerStore.subscribe((s, prev) => {
    if (s.currentTrackId !== prev.currentTrackId) push();
  });
  usePlayback.subscribe((s, prev) => {
    if (s.playing !== prev.playing || s.duration !== prev.duration) return push();
    // Seek: a posição pulou entre dois timeupdate (o Android extrapola o tempo sozinho enquanto toca).
    if (Math.abs(s.position - prev.position) > 3) push(true);
  });
  // Capa/título podem chegar depois (biblioteca carregada após restaurar a fila).
  useLibrary.subscribe(() => push());
  push(true);

  void Media.addListener('action', ({ action, positionMs }) => {
    if (action === 'play') playerControls.play();
    else if (action === 'pause') playerControls.pause();
    else if (action === 'next') void playerControls.next();
    else if (action === 'previous') void playerControls.previous();
    else if (action === 'seekTo') playerControls.seek(positionMs / 1000);
  });

  void Media.addListener('noisy', () => {
    if (usePlayback.getState().playing) playerControls.pause();
  });
}

/** Detecção do carro para o modo carro do frontend. */
export const androidCar: CarHooks = {
  getState: () => Media.getCarState(),
  requestPermission: () => Media.requestCarPermission(),
  onChange(fn) {
    const handle = Media.addListener('carChanged', fn);
    return () => void handle.then((h) => h.remove());
  },
};
