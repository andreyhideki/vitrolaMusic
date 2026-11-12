// Catálogo público externo: fornece metadados, capas e ids. Não fornece áudio.
const BASE = process.env.CATALOG_API_URL ?? 'https://api.deezer.com';

const MAX_PLAYLIST_TRACKS = 1000;

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Catálogo externo respondeu ${res.status}`);
  const data = (await res.json()) as T & { error?: { message: string } };
  if (data.error) throw new Error(data.error.message);
  return data;
}

export const catalogApi = {
  search: (type: 'track' | 'album' | 'artist' | 'playlist', q: string, limit = 10): Promise<any[]> =>
    get<{ data?: any[] }>(`/search/${type}?q=${encodeURIComponent(q)}&limit=${limit}`).then((r) => r.data ?? []),
  track: (id: string): Promise<any> => get<any>(`/track/${id}`),
  album: (id: string): Promise<any> => get<any>(`/album/${id}`),
  /** Playlist com todas as faixas (a lista embutida no /playlist pode vir cortada; segue a paginação). */
  playlist: async (id: string): Promise<any> => {
    const p = await get<any>(`/playlist/${id}`);
    const tracks: any[] = [];
    for (let index = 0; index < MAX_PLAYLIST_TRACKS; index += 100) {
      const page = await get<{ data?: any[]; next?: string }>(`/playlist/${id}/tracks?index=${index}&limit=100`);
      tracks.push(...(page.data ?? []));
      if (!page.next || !page.data?.length) break;
    }
    return { ...p, tracks: { data: tracks.length ? tracks : (p.tracks?.data ?? []) } };
  },
};
