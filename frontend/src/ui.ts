import { create } from 'zustand';
import type { ScreenSize } from './useMediaQuery';

const STORAGE_KEY = 'vitrola-ui';

interface UiState {
  /** Preferência do usuário no desktop (persistida). */
  sidebarCollapsed: boolean;
  /** Tamanho de tela atual; definido pelo App via matchMedia. */
  screen: ScreenSize;
  /** Gaveta do menu aberta (somente mobile). */
  drawerOpen: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setScreen: (screen: ScreenSize) => void;
  openDrawer: () => void;
  closeDrawer: () => void;
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
  screen: 'desktop',
  drawerOpen: false,
  toggleSidebar: () => {
    // No tablet o menu fica sempre recolhido; no mobile o botão fecha a gaveta.
    const { screen } = get();
    if (screen === 'mobile') {
      set({ drawerOpen: false });
      return;
    }
    if (screen === 'tablet') return;
    const next = !get().sidebarCollapsed;
    save(next);
    set({ sidebarCollapsed: next });
  },
  setSidebarCollapsed: (collapsed) => {
    save(collapsed);
    set({ sidebarCollapsed: collapsed });
  },
  setScreen: (screen) => set({ screen, drawerOpen: false }),
  openDrawer: () => set({ drawerOpen: true }),
  closeDrawer: () => set({ drawerOpen: false }),
}));

/**
 * Estado efetivo de recolhimento (não persistido): tablet sempre recolhido,
 * mobile usa a gaveta com o menu completo, desktop segue a preferência.
 */
export function useSidebarCollapsed(): boolean {
  return useUi((s) => (s.screen === 'tablet' ? true : s.screen === 'mobile' ? false : s.sidebarCollapsed));
}
