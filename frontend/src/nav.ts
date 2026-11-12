import { create } from 'zustand';

export type View =
  | { kind: 'library' }
  | { kind: 'search' }
  | { kind: 'album'; id: number }
  | { kind: 'albumPreview'; catalogId: string }
  | { kind: 'playlistPreview'; catalogId: string }
  | { kind: 'artist'; id: number }
  | { kind: 'playlists' }
  | { kind: 'playlist'; id: number }
  | { kind: 'analytics' };

interface NavState {
  view: View;
  history: View[];
  future: View[];
  states: Map<string, unknown>;
  go: (v: View, state?: unknown) => void;
  /** Troca a tela atual sem empilhar (o "voltar" pula a tela substituída). */
  replace: (v: View) => void;
  back: () => boolean;
  forward: () => boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  saveState: (view: View, state: unknown) => void;
  getState: <T>(view: View) => T | undefined;
}

function viewKey(v: View): string {
  switch (v.kind) {
    case 'album': return `album:${v.id}`;
    case 'albumPreview': return `albumPreview:${v.catalogId}`;
    case 'playlistPreview': return `playlistPreview:${v.catalogId}`;
    case 'artist': return `artist:${v.id}`;
    case 'playlist': return `playlist:${v.id}`;
    case 'analytics': return 'analytics';
    default: return v.kind;
  }
}

export const useNav = create<NavState>((set, get) => ({
  view: { kind: 'library' },
  history: [],
  future: [],
  states: new Map(),
  canGoBack: false,
  canGoForward: false,

  go: (view, state) => {
    set((s) => {
      const nextStates = new Map(s.states);
      if (state !== undefined) nextStates.set(viewKey(view), state);
      return {
        view,
        history: [...s.history, s.view],
        future: [],
        states: nextStates,
        canGoBack: true,
        canGoForward: false,
      };
    });
  },

  replace: (view) => {
    set((s) => {
      const nextStates = new Map(s.states);
      nextStates.delete(viewKey(s.view));
      return { view, future: [], states: nextStates, canGoForward: false };
    });
  },

  back: () => {
    const { history, view, future, states } = get();
    if (history.length === 0) return false;
    const previous = history[history.length - 1];
    set({
      view: previous,
      history: history.slice(0, -1),
      future: [view, ...future],
      states,
      canGoBack: history.length > 1,
      canGoForward: true,
    });
    return true;
  },

  forward: () => {
    const { history, view, future, states } = get();
    if (future.length === 0) return false;
    const next = future[0];
    set({
      view: next,
      history: [...history, view],
      future: future.slice(1),
      states,
      canGoBack: true,
      canGoForward: future.length > 1,
    });
    return true;
  },

  saveState: (view, state) => {
    set((s) => {
      const nextStates = new Map(s.states);
      nextStates.set(viewKey(view), state);
      return { states: nextStates };
    });
  },

  getState: <T>(view: View) => get().states.get(viewKey(view)) as T | undefined,
}));
