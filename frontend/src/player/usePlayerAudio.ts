import { useEffect } from 'react';
import { send } from '../api';
import { usePlayerStore } from './store';
import { usePlayback } from './playback';
import * as Q from './queue';
import type { View } from '../nav';

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
  /** Loudness integrada da faixa em LUFS (null = desconhecida). Usada na normalização. */
  getLoudness?: (trackId: string) => number | null;
}

export interface PlayerSettings {
  /** Segundos de crossfade entre faixas (0 = desativado). */
  crossfadeSeconds: number;
  /** Equaliza o volume entre faixas pela loudness medida. */
  normalizeVolume: boolean;
}

type Advance = (s: Q.QueueState) => Q.Step;

const MAX_SKIPS = 500;
const defaultStreamUrl = (id: string) => `/api/tracks/${id}/stream`;

/**
 * Normalização: alvo de loudness em LUFS. O volume do <audio> não passa de 1,
 * então só é possível abaixar faixas mais altas que o alvo; -16 LUFS equilibra
 * músicas atuais (bem altas) sem deixar o volume geral baixo demais.
 */
const TARGET_LUFS = -16;
/** Loudness assumida para faixas ainda não analisadas (ex.: streaming), típica de músicas atuais. */
const UNKNOWN_LUFS = -11;
/** Limite de atenuação, para faixas muito comprimidas não ficarem quase mudas. */
const MIN_GAIN_DB = -15;

// Dois <audio> para o app inteiro: um toca, o outro entra no crossfade.
let config: PlayerAudioConfig = { isReady: () => true };
let settings: PlayerSettings = { crossfadeSeconds: 0, normalizeVolume: true };
let players: [HTMLAudioElement, HTMLAudioElement] | null = null;
let activeIndex = 0;
let preloader: HTMLAudioElement | null = null;
let masterVolume = 1;
let masterMuted = false;

/** Faixa carregada em cada <audio> (para recalcular a normalização). */
const elTrack = new Map<HTMLAudioElement, string>();
/** Nível do fade de cada <audio>, de 0 a 1 (1 = sem fade). */
const fadeLevel = new Map<HTMLAudioElement, number>();
interface Fade {
  from: number;
  to: number;
  start: number;
  ms: number;
  done?: () => void;
}
const fades = new Map<HTMLAudioElement, Fade>();
let fadeTimer: ReturnType<typeof setInterval> | null = null;

const store = usePlayerStore;

function getPlayers(): [HTMLAudioElement, HTMLAudioElement] {
  if (!players) {
    const make = () => {
      const el = new Audio();
      el.preload = 'auto';
      return el;
    };
    players = [make(), make()];
  }
  return players;
}

/** O <audio> que está tocando a faixa atual. */
function getAudio(): HTMLAudioElement {
  return getPlayers()[activeIndex];
}

/** O <audio> que está terminando um crossfade (se houver). */
function getOutgoing(): HTMLAudioElement {
  return getPlayers()[1 - activeIndex];
}

function normalizationGain(trackId: string | undefined): number {
  if (!settings.normalizeVolume || !trackId) return 1;
  const lufs = config.getLoudness?.(trackId) ?? UNKNOWN_LUFS;
  const db = Math.max(MIN_GAIN_DB, Math.min(0, TARGET_LUFS - lufs));
  return Math.pow(10, db / 20);
}

/** Volume final = volume geral × normalização da faixa × curva do fade. */
function applyVolume(el: HTMLAudioElement) {
  if (masterMuted) {
    el.volume = 0;
    return;
  }
  const level = fadeLevel.get(el) ?? 1;
  // Curva de potência constante: o volume percebido fica estável durante o crossfade.
  const fade = Math.sin((level * Math.PI) / 2);
  el.volume = Math.min(1, Math.max(0, masterVolume * normalizationGain(elTrack.get(el)) * fade));
}

function tickFades() {
  const now = performance.now();
  for (const [el, f] of fades) {
    const t = f.ms > 0 ? Math.min(1, (now - f.start) / f.ms) : 1;
    fadeLevel.set(el, f.from + (f.to - f.from) * t);
    applyVolume(el);
    if (t >= 1) {
      fades.delete(el);
      f.done?.();
    }
  }
  if (fades.size === 0 && fadeTimer !== null) {
    clearInterval(fadeTimer);
    fadeTimer = null;
  }
}

function fadeTo(el: HTMLAudioElement, to: number, ms: number, done?: () => void) {
  fades.set(el, { from: fadeLevel.get(el) ?? 1, to, start: performance.now(), ms, done });
  fadeTimer ??= setInterval(tickFades, 50);
  tickFades();
}

function resetFade(el: HTMLAudioElement, level = 1) {
  fades.delete(el);
  fadeLevel.set(el, level);
  applyVolume(el);
}

function unload(el: HTMLAudioElement) {
  fades.delete(el);
  fadeLevel.set(el, 1);
  elTrack.delete(el);
  el.pause();
  el.removeAttribute('src');
  el.load();
}

/** Interrompe a faixa que estava saindo num crossfade (ex.: usuário pulou ou pausou). */
function stopOutgoing() {
  const out = getOutgoing();
  if (out.getAttribute('src')) unload(out);
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

let endedNaturally = false;

async function recordPlay(skipped: boolean) {
  const id = store.getState().currentTrackId;
  if (!id) return;
  const el = getAudio();
  const playedSeconds = Math.floor(el.currentTime || 0);
  const durationSeconds = Number.isFinite(el.duration) ? Math.floor(el.duration) : null;
  send('POST', '/plays', {
    trackId: Number(id),
    playedSeconds,
    durationSeconds,
    skipped,
  }).catch(() => {});
}

async function loadTrack(id: string, autoplay: boolean, fadeInMs = 0) {
  endedNaturally = false;
  const el = getAudio();
  try {
    el.src = await urlFor(id);
    elTrack.set(el, id);
    resetFade(el, fadeInMs > 0 ? 0 : 1);
    updateMediaSession(id);
    if (autoplay) {
      el.play().catch(() => {});
      if (fadeInMs > 0) fadeTo(el, 1, fadeInMs);
      send('POST', `/tracks/${id}/played`).catch(() => {});
    }
  } catch {
    playerControls.next();
  }
}

function clearTrack() {
  getPlayers().forEach(unload);
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
async function go(from: Q.QueueState, advance: Advance, fadeInMs = 0): Promise<string | null> {
  // Troca manual de faixa durante um crossfade: corta a faixa que estava saindo.
  if (fadeInMs === 0) stopOutgoing();
  if (!endedNaturally) {
    void recordPlay(true);
  }
  endedNaturally = false;

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

  if (id) await loadTrack(id, true, fadeInMs);
  else clearTrack();

  preloadNext();
  return id;
}

/**
 * Chamado a cada `timeupdate`: perto do fim da faixa, começa a próxima no outro
 * <audio> enquanto esta perde volume. Faixas curtas, repeat 'one' e fim da fila
 * seguem o fluxo normal (evento 'ended').
 */
function maybeStartCrossfade(el: HTMLAudioElement) {
  const secs = settings.crossfadeSeconds;
  if (secs <= 0 || el !== getAudio() || el.paused || fades.has(el)) return;
  const duration = el.duration;
  if (!Number.isFinite(duration) || duration < secs * 2 + 1) return;
  const remaining = duration - el.currentTime;
  if (remaining > secs || remaining <= 0.3) return;

  const state = store.getState();
  if (state.repeat === 'one') return;
  const upcoming = Q.next(state).trackId;
  if (!upcoming || !config.isReady(upcoming)) return;

  void recordPlay(false);
  endedNaturally = true;

  const ms = remaining * 1000;
  fadeTo(el, 0, ms, () => unload(el));
  activeIndex = 1 - activeIndex;
  void go(state, Q.next, ms);
}

/** Ações do player. Use estas funções na interface (elas tocam o áudio). */
export const playerControls = {
  playPlaylist(trackIds: string[], shuffle: boolean, source: View | null = null): Promise<string | null> {
    store.setState({ source });
    return go(Q.startPlaylist(store.getState(), trackIds, shuffle), Q.next);
  },

  /** Toca a partir de um índice, em ordem sequencial. */
  playFrom(trackIds: string[], index: number, source: View | null = null): Promise<string | null> {
    store.setState({ source });
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
    else playerControls.pause();
  },

  play(): void {
    const el = getAudio();
    if (el.getAttribute('src')) el.play().catch(() => {});
    else void playerControls.togglePlay();
  },

  pause(): void {
    stopOutgoing();
    const el = getAudio();
    // Pausar no meio do fade de entrada: volta ao volume cheio ao retomar.
    if (fades.has(el)) resetFade(el, 1);
    el.pause();
  },

  seek(seconds: number): void {
    getAudio().currentTime = seconds;
  },

  setVolume(volume: number): void {
    masterVolume = volume;
    masterMuted = volume === 0;
    getPlayers().forEach(applyVolume);
  },

  /** Aplica as configurações de crossfade/normalização (vindas de /api/settings). */
  configure(next: Partial<PlayerSettings>): void {
    settings = { ...settings, ...next };
    getPlayers().forEach(applyVolume);
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
    const cleanups = getPlayers().map((el) => {
      // Só o <audio> ativo conversa com a interface; o outro está saindo num crossfade.
      const isActive = () => el === getAudio();

      const sync = () => {
        if (!isActive()) return;
        usePlayback.setState({
          position: el.currentTime,
          duration: Number.isFinite(el.duration) ? el.duration : 0,
          playing: !el.paused,
        });
      };
      const onTime = () => {
        sync();
        maybeStartCrossfade(el);
      };

      // Faixa com erro de reprodução (ou removida do servidor): pula para a próxima.
      const onError = () => {
        if (isActive() && el.getAttribute('src')) playerControls.next();
      };
      const onEnded = () => {
        if (!isActive()) return;
        void recordPlay(false);
        endedNaturally = true;
        void playerControls.ended();
      };

      const events: [keyof HTMLMediaElementEventMap, () => void][] = [
        ['ended', onEnded],
        ['error', onError],
        ['timeupdate', onTime],
        ['durationchange', sync],
        ['play', sync],
        ['pause', sync],
      ];
      events.forEach(([name, fn]) => el.addEventListener(name, fn));
      return () => events.forEach(([name, fn]) => el.removeEventListener(name, fn));
    });

    if ('mediaSession' in navigator) {
      const ms = navigator.mediaSession;
      ms.setActionHandler('play', () => playerControls.play());
      ms.setActionHandler('pause', () => playerControls.pause());
      ms.setActionHandler('nexttrack', () => {
        playerControls.next();
      });
      ms.setActionHandler('previoustrack', () => {
        playerControls.previous();
      });
    }

    return () => cleanups.forEach((fn) => fn());
  }, []);
}
