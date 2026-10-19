import { useEffect, useState } from 'react';
import { api, AlbumDto, ArtistDto, errorMessage, PlaylistSummary } from '../api';
import { useLibrary } from '../library';
import { useNav } from '../nav';
import { playerControls } from '../player/usePlayerAudio';

interface ArtistResponse {
  artist: ArtistDto;
  albums: AlbumDto[];
  playlists: PlaylistSummary[];
}

export function ArtistView({ id }: { id: number }) {
  const [data, setData] = useState<ArtistResponse | null>(null);
  const [error, setError] = useState('');
  const go = useNav((s) => s.go);

  useEffect(() => {
    setData(null);
    setError('');
    api<ArtistResponse>(`/artists/${id}`)
      .then((d) => {
        useLibrary.getState().upsert(d.albums.map((a) => ({
          id: -a.id,
          title: '',
          durationSeconds: null,
          trackNumber: null,
          downloadStatus: 'ready' as const,
          error: null,
          albumId: a.id,
          albumTitle: a.title,
          coverUrl: a.coverUrl,
          releaseYear: a.releaseYear,
          artistId: a.artistId,
          artistName: a.artistName,
          genreId: a.genreId,
          genreName: a.genreName,
          bitrateKbps: null,
        })));
        setData(d);
      })
      .catch((e) => setError(errorMessage(e)));
  }, [id]);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Carregando…</p>;

  const { artist, albums, playlists } = data;

  return (
    <section>
      <div className="header">
        {artist.imageUrl && <img src={artist.imageUrl} alt={artist.name} />}
        <div>
          <div className="muted">Artista</div>
          <h1>{artist.name}</h1>
          <div>{albums.length} álbuns</div>
        </div>
      </div>

      <h2>Álbuns</h2>
      {albums.length === 0 ? (
        <p className="muted">Nenhum álbum baixado deste artista.</p>
      ) : (
        <div className="cards">
          {albums.map((a) => (
            <button key={a.id} className="card" onClick={() => go({ kind: 'album', id: a.id })}>
              {a.coverUrl ? <img src={a.coverUrl} alt="" /> : <div className="card-placeholder">💿</div>}
              <div>{a.title}</div>
              <div className="muted">{a.releaseYear ?? ''}</div>
            </button>
          ))}
        </div>
      )}

      <h2>Playlists</h2>
      {playlists.length === 0 ? (
        <p className="muted">Este artista não aparece em nenhuma playlist.</p>
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
    </section>
  );
}
