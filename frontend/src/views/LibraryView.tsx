import { useEffect, useState } from 'react';
import { api, AlbumDto, errorMessage, GenreDto, LibraryResponse, PlaylistSummary, send, TrackDto } from '../api';
import { ConfirmModal } from '../components/ConfirmModal';
import { useLibrary } from '../library';
import { useNav } from '../nav';
import { playerControls } from '../player/usePlayerAudio';
import { TrackList } from '../components/TrackList';
import { fmtBytes } from '../format';

interface LibraryState {
  genre: number | '';
}

export function LibraryView() {
  const { saveState, getState } = useNav();
  const saved = getState<LibraryState>({ kind: 'library' });
  const [library, setLibrary] = useState<LibraryResponse | null>(null);
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [genres, setGenres] = useState<GenreDto[]>([]);
  const [usage, setUsage] = useState<{ bytes: number; trackCount: number } | null>(null);
  const [genre, setGenre] = useState<number | ''>(saved?.genre ?? '');
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<{ open: boolean; title: string; message: string; onConfirm: () => void } | null>(null);
  const go = useNav((s) => s.go);

  async function load() {
    try {
      const [lib, plist, glist, u] = await Promise.all([
        api<LibraryResponse>(genre === '' ? '/library' : `/library?genre=${genre}`),
        api<PlaylistSummary[]>('/playlists'),
        api<GenreDto[]>('/library/genres'),
        api<{ bytes: number; trackCount: number }>('/library/usage'),
      ]);
      useLibrary.getState().upsert(lib.tracks);
      setLibrary(lib);
      setPlaylists(plist);
      setGenres(glist);
      setUsage(u);
      setError('');
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  useEffect(() => {
    load();
    saveState({ kind: 'library' }, { genre });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [genre]);

  async function deleteTrack(trackId: number) {
    try {
      await send('DELETE', `/tracks/${trackId}`);
      load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function deleteAlbum(albumId: number) {
    try {
      await send('DELETE', `/albums/${albumId}`);
      load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  function askDeleteAlbum(a: AlbumDto) {
    setConfirm({
      open: true,
      title: 'Excluir álbum',
      message: `Excluir o álbum "${a.title}"? Todas as faixas serão removidas.`,
      onConfirm: async () => {
        setConfirm(null);
        await deleteAlbum(a.id);
      },
    });
  }

  const [pendingTrack, setPendingTrack] = useState<TrackDto | null>(null);

  const readyTrackIds = (library?.tracks ?? [])
    .filter((t) => t.downloadStatus === 'ready')
    .map((t) => String(t.id));

  function albumTrackIds(albumId: number): string[] {
    return (library?.tracks ?? [])
      .filter((t) => t.albumId === albumId && t.downloadStatus === 'ready')
      .map((t) => String(t.id));
  }

  function greeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'Bom dia';
    if (hour < 18) return 'Boa tarde';
    return 'Boa noite';
  }

  function askDeleteTrack(trackId: number) {
    const t = library?.tracks.find((x) => x.id === trackId) ?? null;
    if (!t) return;
    setPendingTrack(t);
    setConfirm({
      open: true,
      title: 'Excluir faixa',
      message: `Excluir "${t.title}"?`,
      onConfirm: async () => {
        setConfirm(null);
        setPendingTrack(null);
        await deleteTrack(t.id);
      },
    });
  }

  return (
    <section>
      <div className="home-hero">
        <div>
          <div className="muted">Início</div>
          <h1>{greeting()}</h1>
          <p className="muted">
            {library
              ? `${library.albums.length} álbuns · ${library.tracks.length} faixas${
                  playlists.length > 0 ? ` · ${playlists.length} playlists` : ''
                }`
              : 'Carregando…'}
            {usage && (
              <>
                <br />
                {fmtBytes(usage.bytes)} usados ({usage.trackCount} faixas baixadas)
              </>
            )}
          </p>
        </div>
        <div className="actions">
          <button
            className="primary"
            disabled={readyTrackIds.length === 0}
            onClick={() => playerControls.playPlaylist(readyTrackIds, false)}
          >
            Tocar tudo
          </button>
          <button
            disabled={readyTrackIds.length === 0}
            onClick={() => playerControls.playPlaylist(readyTrackIds, true)}
          >
            Aleatório
          </button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="filter-bar">
        <span className="muted">Gêneros:</span>
        <button className={`badge ${genre === '' ? 'active' : ''}`} onClick={() => setGenre('')}>
          Todos
        </button>
        {genres.map((g) => (
          <button
            key={g.id}
            className={`badge ${genre === g.id ? 'active' : ''}`}
            onClick={() => setGenre(g.id)}
          >
            {g.name}
          </button>
        ))}
      </div>

      <h2>Playlists</h2>
      {playlists.length === 0 ? (
        <p className="muted">Nenhuma playlist ainda.</p>
      ) : (
        <div className="cards">
          {playlists.map((p) => (
            <button key={p.id} className="card" onClick={() => go({ kind: 'playlist', id: p.id })}>
              <div className="card-placeholder">🎵</div>
              <div>{p.name}</div>
              <div className="muted">{p.trackCount} faixas</div>
            </button>
          ))}
        </div>
      )}

      <h2>Álbuns</h2>
      {library && library.albums.length === 0 ? (
        <p className="muted">Nenhum álbum baixado ainda.</p>
      ) : (
        <div className="cards">
          {library?.albums.map((a) => {
            const ids = albumTrackIds(a.id);
            return (
              <div key={a.id} className="card album-card">
                <div className="card-cover">
                  <button
                    className="card-cover-btn"
                    onClick={() => go({ kind: 'album', id: a.id })}
                    aria-label={`Abrir álbum ${a.title}`}
                  >
                    {a.coverUrl ? <img src={a.coverUrl} alt="" /> : <div className="card-placeholder">💿</div>}
                  </button>
                  <button
                    className="cover-play"
                    disabled={ids.length === 0}
                    onClick={() => playerControls.playPlaylist(ids, false)}
                    aria-label={`Tocar álbum ${a.title}`}
                    title="Tocar álbum"
                  >
                    ▶
                  </button>
                </div>
                <button className="card-content" onClick={() => go({ kind: 'album', id: a.id })}>
                  <div>{a.title}</div>
                  <div className="muted">{a.artistName}</div>
                </button>
              </div>
            );
          })}
        </div>
      )}

      <h2>Faixas</h2>
      {library && library.tracks.length === 0 ? (
        <p className="muted">Nenhuma faixa baixada ainda. Use a busca para importar.</p>
      ) : (
        library && <TrackList tracks={library.tracks} showAlbum onDelete={askDeleteTrack} />
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
