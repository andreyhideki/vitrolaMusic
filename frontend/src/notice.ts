import { create } from 'zustand';

export type NoticeType = 'info' | 'success' | 'error';

export interface Notice {
  id: string;
  message: string;
  type: NoticeType;
}

interface NoticeState {
  notices: Notice[];
  show: (message: string, type?: NoticeType) => void;
  dismiss: (id: string) => void;
}

export const useNotice = create<NoticeState>((set, get) => ({
  notices: [],
  show: (message, type = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    set({ notices: [...get().notices, { id, message, type }] });
    setTimeout(() => {
      get().dismiss(id);
    }, 6000);
  },
  dismiss: (id) => {
    set({ notices: get().notices.filter((n) => n.id !== id) });
  },
}));
