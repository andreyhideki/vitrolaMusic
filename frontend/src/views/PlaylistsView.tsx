import { FormEvent, useEffect, useState } from 'react';
import { api, errorMessage, PlaylistDetail, PlaylistSummary, send } from '../api';
import { useNav } from '../nav';

export function PlaylistsView() {
  const [items, setItems] = useState<PlaylistSummary[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const go = useNav((s) => s.go);

  const load = () => api<PlaylistSummary[]>('/playlists').then(setItems).catch((e) => setError(errorMessage(e)));

  useEffect(() => {
    load();
  }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    try {
      const p = await send<PlaylistDetail>('POST', '/playlists', { name: n });
      setName('');
      go({ kind: 'playlist', id: p.id });
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <section>
      <h1>Playlists</h1>
      <form className="create" onSubmit={create}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome da playlist" maxLength={100} />
        <button>Criar</button>
      </form>
      {error && <p className="error">{error}</p>}
      {items.length === 0 && <p className="muted">Nenhuma playlist ainda.</p>}
      {items.map((p) => (
        <button key={p.id} className="playlist-item" onClick={() => go({ kind: 'playlist', id: p.id })}>
          <span>{p.name}</span>
          <span className="muted">{p.trackCount} faixas</span>
        </button>
      ))}
    </section>
  );
}
