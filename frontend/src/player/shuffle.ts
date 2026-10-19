import { mulberry32 } from './rng';

/** Embaralha uma cópia do array com Fisher-Yates. Não altera o original. */
export function fisherYates<T>(items: readonly T[], rng: () => number): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Monta a ordem de reprodução (índices da playlist original).
 * 1. faixa atual (se houver); 2. não tocadas, embaralhadas; 3. já tocadas, por último.
 */
export function buildShuffleOrder(
  length: number,
  currentIdx: number,
  playedIdxs: readonly number[],
  seed: number,
): number[] {
  const rng = mulberry32(seed);
  const played = new Set(playedIdxs);

  const unplayed: number[] = [];
  const alreadyPlayed: number[] = [];

  for (let i = 0; i < length; i++) {
    if (i === currentIdx) continue;
    (played.has(i) ? alreadyPlayed : unplayed).push(i);
  }

  const head = currentIdx >= 0 ? [currentIdx] : [];
  return [...head, ...fisherYates(unplayed, rng), ...fisherYates(alreadyPlayed, rng)];
}

/** Ordem sequencial: 0, 1, 2, ... n-1 */
export function identityOrder(length: number): number[] {
  return Array.from({ length }, (_, i) => i);
}
