import { describe, it, expect } from 'vitest';
import { fisherYates, buildShuffleOrder, identityOrder } from './shuffle';
import { mulberry32 } from './rng';
import * as Q from './queue';

describe('mulberry32', () => {
  it('é determinístico para a mesma semente', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 20; i++) expect(a()).toBe(b());
  });
});

describe('fisherYates', () => {
  it('mantém os mesmos elementos e não altera o original', () => {
    const original = [1, 2, 3, 4, 5, 6];
    const result = fisherYates(original, mulberry32(7));
    expect([...result].sort()).toEqual([...original].sort());
    expect(original).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe('buildShuffleOrder', () => {
  it('coloca a faixa atual primeiro e cobre todos os índices', () => {
    const order = buildShuffleOrder(5, 3, [], 123);
    expect(order[0]).toBe(3);
    expect([...order].sort()).toEqual([0, 1, 2, 3, 4]);
  });

  it('põe as faixas já tocadas por último', () => {
    const order = buildShuffleOrder(6, 2, [0, 1], 99);
    expect(order[0]).toBe(2);
    expect(new Set(order.slice(1, 4))).toEqual(new Set([3, 4, 5]));
    expect(new Set(order.slice(4))).toEqual(new Set([0, 1]));
  });
});

describe('queue', () => {
  const tracks = ['a', 'b', 'c'];

  it('reproduz em sequência e para no fim com repeat off', () => {
    let s = Q.startPlaylist(Q.createQueue(), tracks, false);
    const played: (string | null)[] = [];
    for (let i = 0; i < 4; i++) {
      const step = Q.next(s);
      s = step.state;
      played.push(step.trackId);
    }
    expect(played).toEqual(['a', 'b', 'c', null]);
  });

  it('repeat all reinicia a playlist', () => {
    let s = Q.startPlaylist(Q.createQueue(), tracks, false);
    s = { ...s, repeat: 'all' };
    const ids: (string | null)[] = [];
    for (let i = 0; i < 4; i++) {
      const step = Q.next(s);
      s = step.state;
      ids.push(step.trackId);
    }
    expect(ids).toEqual(['a', 'b', 'c', 'a']);
  });

  it('ligar o shuffle não muda a faixa atual', () => {
    let s = Q.startPlaylist(Q.createQueue(), tracks, false);
    s = Q.next(s).state;
    s = Q.next(s).state;
    const before = Q.currentTrackId(s);
    s = Q.setShuffle(s, true);
    expect(Q.currentTrackId(s)).toBe(before);
  });

  it('desligar o shuffle continua a partir da faixa atual', () => {
    let s = Q.startPlaylist(Q.createQueue(), tracks, true);
    s = Q.next(s).state;
    const current = Q.currentTrackId(s);
    s = Q.setShuffle(s, false);
    expect(Q.currentTrackId(s)).toBe(current);
    expect(s.order).toEqual(identityOrder(3));
  });

  it('fila avulsa tem prioridade e a playlist retoma depois', () => {
    let s = Q.startPlaylist(Q.createQueue(), tracks, false);
    s = Q.next(s).state;
    s = Q.playNext(s, 'x');
    const step1 = Q.next(s);
    expect(step1.trackId).toBe('x');
    const step2 = Q.next(step1.state);
    expect(step2.trackId).toBe('b');
  });
});
