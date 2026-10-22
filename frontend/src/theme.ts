import { create } from 'zustand';

const STORAGE_KEY = 'vitrola-theme';
type Theme = 'dark' | 'light';

function loadTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // ignora erro de storage
  }
  return 'dark';
}

function saveTheme(theme: Theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // ignora erro de storage
  }
}

interface ThemeState {
  theme: Theme;
  toggle: () => void;
  setTheme: (theme: Theme) => void;
}

export const useTheme = create<ThemeState>()((set, get) => ({
  theme: loadTheme(),
  toggle: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark';
    saveTheme(next);
    set({ theme: next });
  },
  setTheme: (theme) => {
    saveTheme(theme);
    set({ theme });
  },
}));
