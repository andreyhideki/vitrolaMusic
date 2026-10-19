import { buildShuffleOrder, identityOrder } from './shuffle';
import { newSeed } from './rng';

export type RepeatMode = 'off' | 'all' | 'one';

export interface QueueState {
  items: string[];          // trackIds na ordem original da playlist
  order: number[];          // índices de items na ordem de reprodução
  cursor: number;           // posição em `order` da última faixa da playlist (-1 = nenhuma)
  shuffle: boolean;
  seed: number;
  repeat: RepeatMode;
  manual: string[];         // fila avulsa ("tocar a seguir" / "adicionar à fila")
  nowManual: string | null; // faixa avulsa que está tocando agora
}

export interface Step {
  state: QueueState;
  trackId: string | null; // null = fim da reprodução
}

export function createQueue(): QueueState {
  return {
    items: [],
    order: [],
    cursor: -1,
    shuffle: false,
    seed: 0,
    repeat: 'off',
    manual: [],
    nowManual: null,
  };
}

/** Faixa atual: a avulsa tem prioridade sobre a playlist. */
export function currentTrackId(s: QueueState): string | null {
  if (s.nowManual) return s.nowManual;
  if (s.cursor < 0) return null;
  return s.items[s.order[s.cursor]] ?? null;
}

/** Inicia uma playlist. Não toca nada: quem chama deve usar next() em seguida. */
export function startPlaylist(s: QueueState, trackIds: string[], shuffle: boolean): QueueState {
  const seed = newSeed();
  const n = trackIds.length;
  return {
    ...s,
    items: trackIds,
    order: shuffle ? buildShuffleOrder(n, -1, [], seed) : identityOrder(n),
    cursor: -1,
    shuffle,
    seed,
    manual: [],
    nowManual: null,
  };
}

/**
 * Avança para a próxima faixa.
 * Fila avulsa tem prioridade e não move o cursor da playlist.
 * No fim da playlist: repeat 'all' reinicia; 'off' encerra.
 * 'one' é tratado em onTrackEnded (no controle de áudio), não aqui.
 */
export function next(s: QueueState): Step {
  if (s.manual.length > 0) {
    const [head, ...rest] = s.manual;
    return { state: { ...s, manual: rest, nowManual: head }, trackId: head };
  }

  let base = s;
  let cursor = s.cursor + 1;

  if (cursor >= s.order.length) {
    if (s.repeat !== 'all' || s.order.length === 0) {
      return { state: { ...s, nowManual: null }, trackId: null };
    }
    if (s.shuffle) {
      const seed = newSeed();
      base = { ...s, seed, order: buildShuffleOrder(s.items.length, -1, [], seed) };
    }
    cursor = 0;
  }

  const state = { ...base, cursor, nowManual: null };
  return { state, trackId: state.items[state.order[cursor]] };
}

/** Volta para a faixa anterior na ordem de reprodução atual. */
export function previous(s: QueueState): Step {
  if (s.nowManual) {
    const state = { ...s, nowManual: null };
    return { state, trackId: currentTrackId(state) };
  }

  let cursor = s.cursor - 1;
  if (cursor < 0) {
    if (s.repeat !== 'all' || s.order.length === 0) {
      return { state: s, trackId: currentTrackId(s) };
    }
    cursor = s.order.length - 1;
  }

  const state = { ...s, cursor };
  return { state, trackId: state.items[state.order[cursor]] };
}

/**
 * Liga ou desliga o shuffle sem interromper a faixa atual.
 * Ligar: a faixa atual vira o início da nova ordem; as já tocadas ficam por último.
 * Desligar: volta à ordem original a partir da faixa atual.
 */
export function setShuffle(s: QueueState, enabled: boolean): QueueState {
  if (enabled === s.shuffle) return s;

  const n = s.items.length;
  const curIdx = s.cursor >= 0 ? s.order[s.cursor] : -1;

  if (enabled) {
    const played = s.cursor > 0 ? s.order.slice(0, s.cursor) : [];
    const seed = newSeed();
    return {
      ...s,
      shuffle: true,
      seed,
      order: buildShuffleOrder(n, curIdx, played, seed),
      cursor: curIdx >= 0 ? 0 : -1,
    };
  }

  return {
    ...s,
    shuffle: false,
    order: identityOrder(n),
    cursor: curIdx,
  };
}

export function nextRepeat(mode: RepeatMode): RepeatMode {
  return mode === 'off' ? 'all' : mode === 'all' ? 'one' : 'off';
}

/** Tocar a seguir: insere no início da fila avulsa (logo após a atual). */
export function playNext(s: QueueState, trackId: string): QueueState {
  return { ...s, manual: [trackId, ...s.manual] };
}

/** Adicionar à fila: insere no fim da fila avulsa. */
export function addToQueue(s: QueueState, trackId: string): QueueState {
  return { ...s, manual: [...s.manual, trackId] };
}
