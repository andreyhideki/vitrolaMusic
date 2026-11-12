import { describe, expect, it, vi } from 'vitest';

vi.mock('./native', () => ({ Vitrola: { setKeepAlive: vi.fn() } }));
const { DownloadBatch } = await import('./keepAlive');

describe('DownloadBatch (contador "Baixando X de N")', () => {
  it('avança conforme a fila diminui e zera quando esvazia', () => {
    const b = new DownloadBatch();
    expect(b.update(100)).toEqual({ current: 1, total: 100 });
    expect(b.update(100)).toEqual({ current: 1, total: 100 });
    expect(b.update(99)).toEqual({ current: 2, total: 100 });
    expect(b.update(97)).toEqual({ current: 4, total: 100 });
    expect(b.update(1)).toEqual({ current: 100, total: 100 });
    expect(b.update(0)).toEqual({ current: 0, total: 0 });
    expect(b.update(3)).toEqual({ current: 1, total: 3 });
  });

  it('aumenta o total quando outro álbum entra na fila', () => {
    const b = new DownloadBatch();
    b.update(10);
    b.update(8); // 2 concluídas
    expect(b.update(20)).toEqual({ current: 3, total: 22 });
  });
});
