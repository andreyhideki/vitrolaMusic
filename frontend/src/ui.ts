import { create } from 'zustand';

const STORAGE_KEY = 'vitrola-ui';

interface UiState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
}

function load(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return parsed.sidebarCollapsed === true;
  } catch {
    return false;
  }
}

function save(collapsed: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ sidebarCollapsed: collapsed }));
  } catch {
    // ignora
  }
}

export const useUi = create<UiState>((set, get) => ({
  sidebarCollapsed: load(),
  toggleSidebar: () => {
    const next = !get().sidebarCollapsed;
    save(next);
    set({ sidebarCollapsed: next });
  },
  setSidebarCollapsed: (collapsed) => {
    save(collapsed);
    set({ sidebarCollapsed: collapsed });
  },
}));
