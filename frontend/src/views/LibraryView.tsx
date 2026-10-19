import { useEffect, useState } from 'react';
import { api, AlbumDto, errorMessage, GenreDto, LibraryResponse, PlaylistSummary, send, TrackDto } from '../api';
import { ConfirmModal } from '../components/ConfirmModal';
import { useLibrary } from '../library';
import { useNav } from '../nav';
import { playerControls } from '../player/usePlayerAudio';
import { TrackList } from '../components/TrackList';

export function LibraryView() {
  const [library, setLibrary] = useState<LibraryResponse | null>(null);
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [genres, setGenres] = useState<GenreDto[]>([]);
  const [genre, setGenre] = useState<number | ''>('');
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<{ open: boolean; title: string; message: string; onConfirm: () => void } | null>(null);
  const go = useNav((s) => s.go);

  async function load() {
    try {
      const [lib, plist, glist] = await Promise.all([
        api<LibraryResponse>(genre === '' ? '/library' : `/library?genre=${genre}`),
        api<PlaylistSummary[]>('/playlists'),
        api<GenreDto[]>('/library/genres'),
      ]);
      useLibrary.getState().upsert(lib.tracks);
      setLibrary(lib);
      setPlaylists(plist);
      setGenres(glist);
      setError('');
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  useEffect(() => {
    load();
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
      <h1>Biblioteca</h1>

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
          {library?.albums.map((a) => (
            <div key={a.id} className="card">
              <button className="card-content" onClick={() => go({ kind: 'album', id: a.id })}>
                {a.coverUrl ? <img src={a.coverUrl} alt="" /> : <div className="card-placeholder">💿</div>}
                <div>{a.title}</div>
                <div className="muted">{a.artistName}</div>
              </button>
              <button
                className="danger small"
                onClick={() => askDeleteAlbum(a)}
              >
                Excluir
              </button>
            </div>
          ))}
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
