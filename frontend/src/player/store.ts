import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { createQueue, QueueState } from './queue';

/** Estado da fila e da faixa atual. Persistido em localStorage para restaurar após recarregar. */
export type PlayerState = QueueState & { currentTrackId: string | null };

export const usePlayerStore = create<PlayerState>()(
  persist(
    (): PlayerState => ({ ...createQueue(), currentTrackId: null }),
    {
      name: 'vitrola-player',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        items: s.items,
        order: s.order,
        cursor: s.cursor,
        shuffle: s.shuffle,
        seed: s.seed,
        repeat: s.repeat,
        manual: s.manual,
        nowManual: s.nowManual,
        currentTrackId: s.currentTrackId,
      }),
    },
  ),
);
