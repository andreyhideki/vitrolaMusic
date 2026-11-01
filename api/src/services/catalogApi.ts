// Catálogo público externo: fornece metadados, capas e ids. Não fornece áudio.
const BASE = process.env.CATALOG_API_URL ?? 'https://api.deezer.com';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Catálogo externo respondeu ${res.status}`);
  const data = (await res.json()) as T & { error?: { message: string } };
  if (data.error) throw new Error(data.error.message);
  return data;
}

export const catalogApi = {
  search: (type: 'track' | 'album' | 'artist', q: string): Promise<any[]> =>
    get<{ data?: any[] }>(`/search/${type}?q=${encodeURIComponent(q)}&limit=10`).then((r) => r.data ?? []),
  track: (id: string): Promise<any> => get<any>(`/track/${id}`),
  album: (id: string): Promise<any> => get<any>(`/album/${id}`),
};
