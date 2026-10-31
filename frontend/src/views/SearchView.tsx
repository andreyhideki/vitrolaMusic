import { FormEvent, useEffect, useState } from 'react';
import { api, errorMessage, ExternalAlbum, ExternalTrack, SearchResponse, send, TrackDto } from '../api';
import { useLibrary } from '../library';
import { useNav } from '../nav';
import { TrackList } from '../components/TrackList';

const HISTORY_KEY = 'vitrola-search-history';
const HISTORY_LIMIT = 10;

interface SearchViewState {
  query: string;
  result: SearchResponse | null;
}

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
  const { saveState, getState } = useNav();
  const saved = getState<SearchViewState>({ kind: 'search' });
  const [query, setQuery] = useState(saved?.query ?? '');
  const [history, setHistory] = useState<string[]>([]);
  const [result, setResult] = useState<SearchResponse | null>(saved?.result ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [imported, setImported] = useState<Set<string>>(new Set());
  const go = useNav((s) => s.go);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  useEffect(() => {
    saveState({ kind: 'search' }, { query, result });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, result]);

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
      const { track } = await send<{ track: TrackDto }>('POST', '/import/track', { catalogId: t.catalogId });
      useLibrary.getState().upsert([track]);
      setImported((prev) => new Set(prev).add(t.catalogId));
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  function openAlbumPreview(a: ExternalAlbum) {
    go({ kind: 'albumPreview', catalogId: a.catalogId });
  }

  return (
    <section>
      <div className="search-sticky">
        <form className="search" onSubmit={onSubmit}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Música, artista ou álbum"
            autoFocus
          />
          <button disabled={busy}>{busy ? 'Buscando…' : 'Buscar'}</button>
        </form>
      </div>

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

          <h2>Álbuns</h2>
          {(result.local.albums.length > 0 || result.external.albums.length > 0) ? (
            <>
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
              {result.external.albums.map((a) => (
                <button
                  key={a.catalogId}
                  className="ext-row"
                  onClick={() => openAlbumPreview(a)}
                  style={{ width: '100%', textAlign: 'left' }}
                >
                  {a.coverUrl && <img src={a.coverUrl} alt="" />}
                  <div className="info">
                    <div>{a.title}</div>
                    <div className="muted">{a.artistName} · álbum</div>
                  </div>
                </button>
              ))}
            </>
          ) : (
            <p className="muted">Nenhum álbum encontrado.</p>
          )}

          <h2>Playlists</h2>
          {(result.local.playlists ?? []).length > 0 ? (
            <div className="cards">
              {(result.local.playlists ?? []).map((p) => (
                <button key={p.id} className="card" onClick={() => go({ kind: 'playlist', id: p.id })}>
                  <div className="card-placeholder">🎵</div>
                  <div>{p.name}</div>
                  <div className="muted">{p.trackCount} faixas</div>
                </button>
              ))}
            </div>
          ) : (
            <p className="muted">Nenhuma playlist encontrada.</p>
          )}

          <h2>Músicas</h2>
          {result.local.tracks.length > 0 && <TrackList tracks={result.local.tracks} showAlbum />}
          {result.external.tracks.map((t) => (
            <div key={t.catalogId} className="ext-row">
              {t.coverUrl && <img src={t.coverUrl} alt="" />}
              <div className="info">
                <div>{t.title}</div>
                <div className="muted">
                  {t.artistName} · {t.albumTitle}
                </div>
              </div>
              <button disabled={imported.has(t.catalogId)} onClick={() => importTrack(t)}>
                {imported.has(t.catalogId) ? 'Importada' : 'Importar'}
              </button>
            </div>
          ))}
          {result.local.tracks.length === 0 && result.external.tracks.length === 0 && (
            <p className="muted">Nenhuma música encontrada.</p>
          )}

          {result.external.artists.length > 0 && (
            <>
              <h2>Artistas</h2>
              <div className="chips">
                {result.external.artists.map((a) => (
                  <button
                    key={a.catalogId}
                    className="badge"
                    onClick={() => doSearch(a.name)}
                    title={`Buscar ${a.name}`}
                  >
                    {a.name}
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
