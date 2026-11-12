import { FormEvent, useEffect, useRef, useState } from 'react';
import { api, errorMessage, ExternalAlbum, ExternalPlaylist, ExternalTrack, SearchResponse, send, TrackDto } from '../api';
import { useLibrary } from '../library';
import { useNav } from '../nav';
import { TrackList } from '../components/TrackList';

const HISTORY_KEY = 'vitrola-search-history';
const HISTORY_LIMIT = 10;

type SearchFilter = 'all' | 'albums' | 'playlists' | 'tracks';

const FILTERS: { id: SearchFilter; label: string }[] = [
  { id: 'all', label: 'Tudo' },
  { id: 'albums', label: 'Álbuns' },
  { id: 'playlists', label: 'Playlists' },
  { id: 'tracks', label: 'Músicas' },
];

interface SearchViewState {
  query: string;
  result: SearchResponse | null;
  filter?: SearchFilter;
}

/** Toque como entrada principal (celular/tablet): lá o foco automático abre o teclado. */
function isTouchScreen(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true;
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
  const [filter, setFilter] = useState<SearchFilter>(saved?.filter ?? 'all');
  const show = (section: Exclude<SearchFilter, 'all'>) => filter === 'all' || filter === section;
  /** O catálogo externo ainda não respondeu (os resultados locais já aparecem). */
  const [catalogBusy, setCatalogBusy] = useState(false);
  /** Descarta respostas de buscas antigas quando o usuário busca de novo. */
  const searchSeq = useRef(0);
  const [error, setError] = useState('');
  const [imported, setImported] = useState<Set<string>>(new Set());
  const go = useNav((s) => s.go);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  useEffect(() => {
    saveState({ kind: 'search' }, { query, result, filter });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, result, filter]);

  /** Quantos resultados cada filtro mostra (local + catálogo). */
  function countFor(f: SearchFilter): number | null {
    if (!result) return null;
    const albums = result.local.albums.length + result.external.albums.length;
    const playlists = (result.local.playlists ?? []).length + (result.external.playlists ?? []).length;
    const tracks = result.local.tracks.length + result.external.tracks.length;
    if (f === 'albums') return albums;
    if (f === 'playlists') return playlists;
    if (f === 'tracks') return tracks;
    return null;
  }

  async function doSearch(q: string) {
    const trimmed = q.trim();
    if (trimmed.length < 2) return;
    const seq = ++searchSeq.current;
    const current = () => seq === searchSeq.current;
    const qs = encodeURIComponent(trimmed);
    setQuery(trimmed);
    setBusy(true);
    setCatalogBusy(true);
    setError('');
    setHistory((prev) => {
      const next = [trimmed, ...prev.filter((h) => h.toLowerCase() !== trimmed.toLowerCase())].slice(0, HISTORY_LIMIT);
      saveHistory(next);
      return next;
    });

    // Biblioteca local responde na hora; o catálogo pode demorar (ou esgotar o tempo sem internet).
    const external = api<SearchResponse>(`/search?q=${qs}&scope=external`);
    external.catch(() => undefined);
    try {
      const r = await api<SearchResponse>(`/search?q=${qs}&scope=local`);
      if (!current()) return;
      useLibrary.getState().upsert(r.local.tracks);
      setResult({ ...r, external: { tracks: [], albums: [], artists: [], playlists: [] } });
    } catch (err) {
      if (current()) setError(errorMessage(err));
    } finally {
      if (current()) setBusy(false);
    }

    try {
      const r = await external;
      if (!current()) return;
      setResult((prev) => (prev ? { ...prev, external: r.external, warning: r.warning } : prev));
    } catch (err) {
      if (current()) setError(errorMessage(err));
    } finally {
      if (current()) setCatalogBusy(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    // No celular, fecha o teclado para mostrar os resultados.
    if (isTouchScreen() && document.activeElement instanceof HTMLElement) document.activeElement.blur();
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

  function openPlaylistPreview(p: ExternalPlaylist) {
    go({ kind: 'playlistPreview', catalogId: p.catalogId });
  }

  return (
    <section>
      <div className="search-sticky">
        <form className="search" onSubmit={onSubmit}>
          <div className="search-input-wrap">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Música, artista ou álbum"
              // Em tela de toque o foco automático abre o teclado ao voltar para a busca:
              // só foca sozinho no desktop e quando ainda não há resultado na tela.
              autoFocus={!result && !isTouchScreen()}
            />
            {query && (
              <button
                type="button"
                className="clear-input"
                onClick={() => setQuery('')}
                aria-label="Limpar busca"
                title="Limpar busca"
              >
                ×
              </button>
            )}
          </div>
          <button disabled={busy}>{busy ? 'Buscando…' : 'Buscar'}</button>
        </form>
        {result && (
          <div className="chips search-filters" role="tablist" aria-label="Filtrar resultados">
            {FILTERS.map((f) => {
              const n = countFor(f.id);
              return (
                <button
                  key={f.id}
                  type="button"
                  role="tab"
                  aria-selected={filter === f.id}
                  className={`badge ${filter === f.id ? 'active' : ''}`}
                  onClick={() => setFilter(f.id)}
                >
                  {f.label}
                  {n !== null && !catalogBusy ? ` (${n})` : ''}
                </button>
              );
            })}
          </div>
        )}
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
          {catalogBusy && <p className="muted">Buscando no catálogo externo…</p>}
          {result.warning && <p className="muted">{result.warning}</p>}

          {show('albums') && (<>
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
            !catalogBusy && <p className="muted">Nenhum álbum encontrado.</p>
          )}
          </>)}

          {show('playlists') && (<>
          <h2>Playlists</h2>
          {(result.local.playlists ?? []).length > 0 || (result.external.playlists ?? []).length > 0 ? (
            <>
            {(result.local.playlists ?? []).length > 0 && <div className="cards">
              {(result.local.playlists ?? []).map((p) => (
                <button key={p.id} className="card" onClick={() => go({ kind: 'playlist', id: p.id })}>
                  <div className="card-placeholder">🎵</div>
                  <div>{p.name}</div>
                  <div className="muted">{p.trackCount} faixas</div>
                </button>
              ))}
            </div>}
            {(result.external.playlists ?? []).map((p) => (
              <button
                key={p.catalogId}
                className="ext-row"
                onClick={() => openPlaylistPreview(p)}
                style={{ width: '100%', textAlign: 'left' }}
              >
                {p.coverUrl && <img src={p.coverUrl} alt="" />}
                <div className="info">
                  <div>{p.title}</div>
                  <div className="muted">
                    {p.ownerName ? `${p.ownerName} · ` : ''}playlist · {p.trackCount} faixas
                  </div>
                </div>
              </button>
            ))}
            </>
          ) : (
            !catalogBusy && <p className="muted">Nenhuma playlist encontrada.</p>
          )}
          </>)}

          {show('tracks') && (<>
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
          {!catalogBusy && result.local.tracks.length === 0 && result.external.tracks.length === 0 && (
            <p className="muted">Nenhuma música encontrada.</p>
          )}
          </>)}

          {filter === 'all' && result.external.artists.length > 0 && (
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
