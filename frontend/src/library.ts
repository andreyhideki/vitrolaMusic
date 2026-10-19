import { create } from 'zustand';
import { api, TrackDto } from './api';

interface LibraryState {
  byId: Record<string, TrackDto>;
  upsert: (tracks: TrackDto[]) => void;
}

const POLL_MS = 4000;
const watching = new Set<string>();

/** Cache das faixas conhecidas pela interface. Mantém o status de download atualizado. */
export const useLibrary = create<LibraryState>()((set) => ({
  byId: {},
  upsert: (tracks) => {
    if (tracks.length === 0) return;
    set((s) => {
      const byId = { ...s.byId };
      for (const t of tracks) byId[String(t.id)] = t;
      return { byId };
    });
    for (const t of tracks) {
      if (t.downloadStatus !== 'ready' && t.downloadStatus !== 'failed') {
        watchTrack(String(t.id));
      }
    }
  },
}));

function watchTrack(id: string): void {
  if (watching.has(id)) return;
  watching.add(id);

  const tick = async () => {
    try {
      const t = await api<TrackDto>(`/tracks/${id}`);
      useLibrary.getState().upsert([t]);
      if (t.downloadStatus === 'ready' || t.downloadStatus === 'failed') {
        watching.delete(id);
        return;
      }
    } catch {
      // falha temporária: tenta de novo no próximo ciclo
    }
    setTimeout(tick, POLL_MS);
  };

  setTimeout(tick, POLL_MS);
}

export async function retryDownload(id: number): Promise<void> {
  const t = await api<TrackDto>(`/tracks/${id}/download`, { method: 'POST' });
  useLibrary.getState().upsert([t]);
}
