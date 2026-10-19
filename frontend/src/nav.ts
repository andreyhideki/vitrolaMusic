import { create } from 'zustand';

export type View =
  | { kind: 'library' }
  | { kind: 'search' }
  | { kind: 'album'; id: number }
  | { kind: 'albumPreview'; deezerId: string }
  | { kind: 'artist'; id: number }
  | { kind: 'playlists' }
  | { kind: 'playlist'; id: number };

export const useNav = create<{ view: View; go: (v: View) => void }>((set) => ({
  view: { kind: 'library' },
  go: (view) => set({ view }),
}));
