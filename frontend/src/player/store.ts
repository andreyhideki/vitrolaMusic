import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { createQueue, QueueState } from './queue';
import type { View } from '../nav';

/** Estado da fila e da faixa atual. Persistido em localStorage para restaurar após recarregar. */
/** `source`: tela de origem do que está tocando (álbum/playlist), usada ao clicar no player. */
export type PlayerState = QueueState & { currentTrackId: string | null; source?: View | null };

export const usePlayerStore = create<PlayerState>()(
  persist(
    (): PlayerState => ({ ...createQueue(), currentTrackId: null, source: null }),
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
        source: s.source,
      }),
    },
  ),
);
