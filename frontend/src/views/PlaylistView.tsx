import { CSSProperties, FormEvent, ReactNode, useEffect, useState } from 'react';
import { closestCenter, DndContext, DragEndEvent, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { api, errorMessage, PlaylistDetail, send, TrackDto } from '../api';
import { ConfirmModal } from '../components/ConfirmModal';
import { useLibrary } from '../library';
import { useNav } from '../nav';
import { playerControls } from '../player/usePlayerAudio';
import { fmtBitrate, fmtDuration, STATUS_LABEL } from '../format';

/** Linha da playlist reordenável por arrastar (pela alça ⋮⋮). */
function SortableRow({ id, className, children }: { id: number; className: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : undefined,
    position: 'relative',
    zIndex: isDragging ? 1 : undefined,
  };
  return (
    <li ref={setNodeRef} style={style} className={`${className} ${isDragging ? 'dragging' : ''}`}>
      <button ref={setActivatorNodeRef} className="drag-handle" aria-label="Arrastar para reordenar" title="Arrastar para reordenar" {...attributes} {...listeners}>
        ⋮⋮
      </button>
      {children}
    </li>
  );
}

interface PlaylistViewState {
  query: string;
  searchResults: TrackDto[];
}

export function PlaylistView({ id }: { id: number }) {
  const { saveState, getState } = useNav();
  const saved = getState<PlaylistViewState>({ kind: 'playlist', id });
  const [detail, setDetail] = useState<PlaylistDetail | null>(null);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<{ open: boolean; title: string; message: string; onConfirm: () => void } | null>(null);
  const [query, setQuery] = useState(saved?.query ?? '');
  const [searchResults, setSearchResults] = useState<TrackDto[]>(saved?.searchResults ?? []);
  const [suggestions, setSuggestions] = useState<TrackDto[]>([]);
  const [adding, setAdding] = useState<Set<number>>(new Set());
  const go = useNav((s) => s.go);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const byId = useLibrary((s) => s.byId);

  async function load() {
    try {
      const d = await api<PlaylistDetail>(`/playlists/${id}`);
      useLibrary.getState().upsert(d.entries.map((e) => e.track));
      setDetail(d);
      setError('');
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function loadSuggestions() {
    try {
      const s = await api<TrackDto[]>(`/playlists/${id}/suggestions`);
      setSuggestions(s);
    } catch {
      setSuggestions([]);
    }
  }

  useEffect(() => {
    setDetail(null);
    setError('');
    load();
    loadSuggestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    saveState({ kind: 'playlist', id }, { query, searchResults });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, searchResults]);

  if (!detail) return error ? <p className="error">{error}</p> : <p className="muted">Carregando…</p>;

  const entries = detail.entries;
  const ids = entries.map((e) => String(e.track.id));

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
      setError('');
      await load();
      await loadSuggestions();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const source = { kind: 'playlist' as const, id };

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id || !detail) return;
    const from = entries.findIndex((e) => e.entryId === active.id);
    const to = entries.findIndex((e) => e.entryId === over.id);
    if (from < 0 || to < 0) return;
    const reordered = arrayMove(entries, from, to);
    setDetail({ ...detail, entries: reordered }); // otimista: evita a linha "pular" de volta
    run(() => send('PATCH', `/playlists/${id}/order`, { entryIds: reordered.map((e) => e.entryId) }));
  }

  const remove = (entryId: number) => run(() => send('DELETE', `/playlists/${id}/entries/${entryId}`));

  async function addTrack(trackId: number) {
    setAdding((prev) => new Set(prev).add(trackId));
    try {
      await run(() => send('POST', `/playlists/${id}/tracks`, { trackIds: [trackId] }));
    } finally {
      setAdding((prev) => {
        const next = new Set(prev);
        next.delete(trackId);
        return next;
      });
    }
  }

  async function onSearch(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (q.length < 2) return;
    try {
      const r = await api<{ tracks: TrackDto[] }>(`/library/search?q=${encodeURIComponent(q)}`);
      const existing = new Set(entries.map((e) => e.track.id));
      setSearchResults(r.tracks.filter((t) => !existing.has(t.id)));
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  function askDeletePlaylist() {
    setConfirm({
      open: true,
      title: 'Excluir playlist',
      message: 'Excluir esta playlist? As faixas não são apagadas.',
      onConfirm: async () => {
        setConfirm(null);
        try {
          await send('DELETE', `/playlists/${id}`);
          go({ kind: 'playlists' });
        } catch (e) {
          setError(errorMessage(e));
        }
      },
    });
  }

  return (
    <section>
      <div className="header">
        <div>
          <div className="muted">Playlist</div>
          <h1>{detail.name}</h1>
          <div>{entries.length} faixas</div>
        </div>
      </div>

      <div className="actions">
        <button className="primary" disabled={entries.length === 0} onClick={() => playerControls.playPlaylist(ids, false, source)}>
          Tocar
        </button>
        <button disabled={entries.length === 0} onClick={() => playerControls.playPlaylist(ids, true, source)}>
          Aleatório
        </button>
        <button onClick={askDeletePlaylist}>Excluir playlist</button>
      </div>

      {error && <p className="error">{error}</p>}

      {entries.length === 0 && <p className="muted">Adicione faixas pela busca abaixo ou pela tela do álbum.</p>}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={entries.map((e) => e.entryId)} strategy={verticalListSortingStrategy}>
      <ol className="tracks">
        {entries.map((e, i) => {
          const t = byId[String(e.track.id)] ?? e.track;
          const ready = t.downloadStatus === 'ready';
          return (
            <SortableRow key={e.entryId} id={e.entryId} className={`track ${ready ? '' : 'unavailable'}`}>
              <button className="play-btn" disabled={!ready} onClick={() => playerControls.playFrom(ids, i, source)} aria-label={`Tocar ${t.title}`}>
                {ready ? '▶' : '·'}
              </button>
              <span className="num muted">{i + 1}</span>
              <div className="info">
                <div>{t.title}</div>
                <div className="muted">
                  {t.artistName} · {t.albumTitle}
                </div>
              </div>
              <span className={`status ${t.downloadStatus}`}>{STATUS_LABEL[t.downloadStatus]}</span>
              {t.bitrateKbps && <span className="muted bitrate">{fmtBitrate(t.bitrateKbps)}</span>}
              <span className="muted">{fmtDuration(t.durationSeconds)}</span>
              <button onClick={() => remove(e.entryId)}>Remover</button>
            </SortableRow>
          );
        })}
      </ol>
      </SortableContext>
      </DndContext>

      <h2>Adicionar músicas</h2>
      <form className="search" onSubmit={onSearch}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar na biblioteca"
        />
        <button type="submit">Buscar</button>
      </form>

      {searchResults.length > 0 && (
        <ol className="tracks">
          {searchResults.map((t) => (
            <li key={t.id} className="track">
              <button className="play-btn" disabled={t.downloadStatus !== 'ready'} onClick={() => playerControls.playFrom([String(t.id)], 0)} aria-label={`Tocar ${t.title}`}>
                {t.downloadStatus === 'ready' ? '▶' : '·'}
              </button>
              <div className="info">
                <div>{t.title}</div>
                <div className="muted">{t.artistName} · {t.albumTitle}</div>
              </div>
              <span className={`status ${t.downloadStatus}`}>{STATUS_LABEL[t.downloadStatus]}</span>
              <span className="muted">{fmtDuration(t.durationSeconds)}</span>
              <button onClick={() => addTrack(t.id)} disabled={adding.has(t.id)}>
                {adding.has(t.id) ? 'Adicionando…' : 'Adicionar'}
              </button>
            </li>
          ))}
        </ol>
      )}

      {suggestions.length > 0 && (
        <>
          <h2>Sugestões</h2>
          <ol className="tracks">
            {suggestions.map((t) => (
              <li key={t.id} className="track">
                <button className="play-btn" disabled={t.downloadStatus !== 'ready'} onClick={() => playerControls.playFrom([String(t.id)], 0)} aria-label={`Tocar ${t.title}`}>
                  {t.downloadStatus === 'ready' ? '▶' : '·'}
                </button>
                <div className="info">
                  <div>{t.title}</div>
                  <div className="muted">{t.artistName} · {t.albumTitle}</div>
                </div>
                <span className={`status ${t.downloadStatus}`}>{STATUS_LABEL[t.downloadStatus]}</span>
                <span className="muted">{fmtDuration(t.durationSeconds)}</span>
                <button onClick={() => addTrack(t.id)} disabled={adding.has(t.id)}>
                  {adding.has(t.id) ? 'Adicionando…' : 'Adicionar'}
                </button>
              </li>
            ))}
          </ol>
        </>
      )}

      {confirm && (
        <ConfirmModal
          open={confirm.open}
          title={confirm.title}
          message={confirm.message}
          confirmText="Excluir"
          cancelText="Cancelar"
          danger
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </section>
  );
}
