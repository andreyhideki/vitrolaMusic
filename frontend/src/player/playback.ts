import { create } from 'zustand';

/** Progresso do áudio para a interface. Atualizado pelo usePlayerAudio. */
export const usePlayback = create<{ position: number; duration: number; playing: boolean }>(() => ({
  position: 0,
  duration: 0,
  playing: false,
}));
