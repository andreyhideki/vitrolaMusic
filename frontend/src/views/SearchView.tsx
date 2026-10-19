import { FormEvent, useEffect, useState } from 'react';
import { api, errorMessage, ExternalAlbum, ExternalTrack, SearchResponse, send, TrackDto } from '../api';
import { useLibrary } from '../library';
import { useNav } from '../nav';
import { TrackList } from '../components/TrackList';

const HISTORY_KEY = 'vitrola-search-history';
const HISTORY_LIMIT = 10;

function loadHistory(): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

function saveHistory(history: string[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, HISTORY_LIMIT)));
  } catch {
    // ignora erros de storage
  }
}

export function SearchView() {
  const [query, setQuery] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [imported, setImported] = useState<Set<string>>(new Set());
  const go = useNav((s) => s.go);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  async function doSearch(q: string) {
    const trimmed = q.trim();
    if (trimmed.length < 2) return;
    setQuery(trimmed);
    setBusy(true);
    setError('');
    try {
      const r = await api<SearchResponse>(`/search?q=${encodeURIComponent(trimmed)}`);
      useLibrary.getState().upsert(r.local.tracks);
      setResult(r);
      setHistory((prev) => {
        const next = [trimmed, ...prev.filter((h) => h.toLowerCase() !== trimmed.toLowerCase())].slice(0, HISTORY_LIMIT);
        saveHistory(next);
        return next;
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    doSearch(query);
  }

  async function importTrack(t: ExternalTrack) {
    try {
      const { track } = await send<{ track: TrackDto }>('POST', '/import/track', { deezerId: t.deezerId });
      useLibrary.getState().upsert([track]);
      setImported((prev) => new Set(prev).add(t.deezerId));
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  function openAlbumPreview(a: ExternalAlbum) {
    go({ kind: 'albumPreview', deezerId: a.deezerId });
  }

  return (
    <section>
      <form className="search" onSubmit={onSubmit}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Música, artista ou álbum"
          autoFocus
        />
        <button disabled={busy}>{busy ? 'Buscando…' : 'Buscar'}</button>
      </form>

      {error && <p className="error">{error}</p>}

      {!result && history.length > 0 && (
        <div className="search-history">
          <h2>Buscas recentes</h2>
          <div className="chips">
            {history.map((h) => (
              <button key={h} className="badge" onClick={() => doSearch(h)}>
                {h}
              </button>
            ))}
          </div>
        </div>
      )}

      {result && (
        <>
          {result.warning && <p className="muted">{result.warning}</p>}

          <h2>Na sua biblioteca</h2>
          {result.local.albums.length > 0 && (
            <div className="cards">
              {result.local.albums.map((a) => (
                <button key={a.id} className="card" onClick={() => go({ kind: 'album', id: a.id })}>
                  {a.coverUrl && <img src={a.coverUrl} alt="" />}
                  <div>{a.title}</div>
                  <div className="muted">{a.artistName}</div>
                </button>
              ))}
            </div>
          )}
          {result.local.tracks.length > 0 ? (
            <TrackList tracks={result.local.tracks} showAlbum />
          ) : (
            <p className="muted">Nenhuma faixa disponível localmente.</p>
          )}

          <h2>Catálogo</h2>
          {result.external.albums.map((a) => (
            <button
              key={a.deezerId}
              className="ext-row"
              onClick={() => openAlbumPreview(a)}
              style={{ width: '100%', textAlign: 'left' }}
            >
              {a.coverUrl && <img src={a.coverUrl} alt="" />}
              <div className="info">
                <div>{a.title}</div>
                <div className="muted">{a.artistName} · álbum</div>
              </div>
              <span className="muted">Ver álbum</span>
            </button>
          ))}
          {result.external.tracks.map((t) => (
            <div key={t.deezerId} className="ext-row">
              {t.coverUrl && <img src={t.coverUrl} alt="" />}
              <div className="info">
                <div>{t.title}</div>
                <div className="muted">
                  {t.artistName} · {t.albumTitle}
                </div>
              </div>
              <button disabled={imported.has(t.deezerId)} onClick={() => importTrack(t)}>
                {imported.has(t.deezerId) ? 'Importada' : 'Importar'}
              </button>
            </div>
          ))}
          {result.external.artists.length > 0 && (
            <div className="chips">
              {result.external.artists.map((a) => (
                <span key={a.deezerId}>{a.name}</span>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
