import { useEffect } from 'react';
import { usePlayerStore } from './store';
import { usePlayback } from './playback';
import * as Q from './queue';

export interface TrackMeta {
  title: string;
  artist: string;
  album: string;
  coverUrl?: string;
}

export interface PlayerAudioConfig {
  /** true quando o arquivo já foi baixado (downloadStatus === 'ready') ou pode tocar via stream */
  isReady: (trackId: string) => boolean;
  getMeta?: (trackId: string) => TrackMeta | null;
  /** Retorna a URL do áudio. Pode ser síncrona ou assíncrona. */
  streamUrl?: (trackId: string) => string | Promise<string>;
}

type Advance = (s: Q.QueueState) => Q.Step;

const MAX_SKIPS = 500;
const defaultStreamUrl = (id: string) => `/api/tracks/${id}/stream`;

// Há um único <audio> para o app inteiro.
let config: PlayerAudioConfig = { isReady: () => true };
let audio: HTMLAudioElement | null = null;
let preloader: HTMLAudioElement | null = null;

const store = usePlayerStore;

function getAudio(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio();
    audio.preload = 'auto';
  }
  return audio;
}

async function urlFor(id: string): Promise<string> {
  const result = (config.streamUrl ?? defaultStreamUrl)(id);
  return await result;
}

function updateMediaSession(id: string) {
  if (!('mediaSession' in navigator)) return;
  const meta = config.getMeta?.(id);
  if (!meta) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: meta.title,
    artist: meta.artist,
    album: meta.album,
    artwork: meta.coverUrl ? [{ src: meta.coverUrl, sizes: '512x512', type: 'image/jpeg' }] : [],
  });
}

async function loadTrack(id: string, autoplay: boolean) {
  const el = getAudio();
  try {
    el.src = await urlFor(id);
    updateMediaSession(id);
    if (autoplay) el.play().catch(() => {});
  } catch {
    playerControls.next();
  }
}

function clearTrack() {
  const el = getAudio();
  el.pause();
  el.removeAttribute('src');
  el.load();
  usePlayback.setState({ position: 0, duration: 0, playing: false });
}

/** Pré-carrega a próxima faixa, se ela já estiver pronta. */
async function preloadNext() {
  const { trackId } = Q.next(store.getState());
  if (!trackId || !config.isReady(trackId)) return;
  preloader ??= new Audio();
  preloader.preload = 'auto';
  preloader.src = await urlFor(trackId);
}

/**
 * Avança a partir de `from` com as funções puras da fila, pulando faixas
 * que ainda não estão prontas. Só o resultado final entra no store.
 */
async function go(from: Q.QueueState, advance: Advance): Promise<string | null> {
  let step = advance(from);

  for (
    let i = 0;
    i < MAX_SKIPS && step.trackId !== null && !config.isReady(step.trackId);
    i++
  ) {
    const nextStep = advance(step.state);
    if (nextStep.state === step.state) break; // início da lista: não há para onde voltar
    step = nextStep;
  }

  const id = step.trackId !== null && config.isReady(step.trackId) ? step.trackId : null;
  store.setState({ ...step.state, currentTrackId: id });

  if (id) await loadTrack(id, true);
  else clearTrack();

  preloadNext();
  return id;
}

/** Ações do player. Use estas funções na interface (elas tocam o áudio). */
export const playerControls = {
  playPlaylist(trackIds: string[], shuffle: boolean): Promise<string | null> {
    return go(Q.startPlaylist(store.getState(), trackIds, shuffle), Q.next);
  },

  /** Toca a partir de um índice, em ordem sequencial. */
  playFrom(trackIds: string[], index: number): Promise<string | null> {
    const started = Q.startPlaylist(store.getState(), trackIds, false);
    return go({ ...started, cursor: index - 1 }, Q.next);
  },

  next(): Promise<string | null> {
    return go(store.getState(), Q.next);
  },

  previous(): Promise<string | null> {
    return go(store.getState(), Q.previous);
  },

  /** Chamado pelo evento 'ended' do <audio>. */
  async ended(): Promise<string | null> {
    const s = store.getState();
    if (s.repeat === 'one' && s.currentTrackId) {
      const el = getAudio();
      el.currentTime = 0;
      el.play().catch(() => {});
      return s.currentTrackId;
    }
    return go(s, Q.next);
  },

  async togglePlay(): Promise<void> {
    const el = getAudio();
    if (!el.getAttribute('src')) {
      // Após recarregar a página, a faixa atual existe mas o src ainda não foi carregado.
      const id = store.getState().currentTrackId;
      if (id && config.isReady(id)) await loadTrack(id, true);
      return;
    }
    if (el.paused) el.play().catch(() => {});
    else el.pause();
  },

  seek(seconds: number): void {
    getAudio().currentTime = seconds;
  },

  setVolume(volume: number): void {
    getAudio().volume = volume;
  },

  setShuffle(enabled: boolean): void {
    store.setState(Q.setShuffle(store.getState(), enabled));
    preloadNext();
  },

  cycleRepeat(): void {
    store.setState({ repeat: Q.nextRepeat(store.getState().repeat) });
    preloadNext();
  },

  playNext(trackId: string): void {
    store.setState(Q.playNext(store.getState(), trackId));
    preloadNext();
  },

  addToQueue(trackId: string): void {
    store.setState(Q.addToQueue(store.getState(), trackId));
    preloadNext();
  },
};

/** Monta o áudio e os listeners. Use uma única vez, no componente raiz. */
export function usePlayerAudio(cfg: PlayerAudioConfig) {
  useEffect(() => {
    config = cfg;
  }, [cfg]);

  useEffect(() => {
    const el = getAudio();

    const sync = () =>
      usePlayback.setState({
        position: el.currentTime,
        duration: Number.isFinite(el.duration) ? el.duration : 0,
        playing: !el.paused,
      });

    // Faixa com erro de reprodução (ou removida do servidor): pula para a próxima.
    const onError = () => {
      if (el.getAttribute('src')) playerControls.next();
    };
    const onEnded = () => {
      void playerControls.ended();
    };

    const events: [keyof HTMLMediaElementEventMap, () => void][] = [
      ['ended', onEnded],
      ['error', onError],
      ['timeupdate', sync],
      ['durationchange', sync],
      ['play', sync],
      ['pause', sync],
    ];
    events.forEach(([name, fn]) => el.addEventListener(name, fn));

    if ('mediaSession' in navigator) {
      const ms = navigator.mediaSession;
      ms.setActionHandler('play', () => {
        el.play().catch(() => {});
      });
      ms.setActionHandler('pause', () => el.pause());
      ms.setActionHandler('nexttrack', () => {
        playerControls.next();
      });
      ms.setActionHandler('previoustrack', () => {
        playerControls.previous();
      });
    }

    return () => {
      events.forEach(([name, fn]) => el.removeEventListener(name, fn));
    };
  }, []);
}
