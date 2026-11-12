import { useEffect, useRef, useState } from 'react';
import { api, AlbumDto, AlbumPreviewResponse, errorMessage, send, TrackDto } from '../api';
import { useLibrary } from '../library';
import { useNav } from '../nav';
import { playerControls } from '../player/usePlayerAudio';
import { fmtBitrate, fmtDuration, STATUS_LABEL } from '../format';
import { usePlayerStore } from '../player/store';
import { usePlayback } from '../player/playback';
import { PlayingIcon, TrackPlayButton } from '../components/TrackPlayButton';

interface ProgressInfo {
  percent: number;
  status: TrackDto['downloadStatus'];
}

/** Prévia de um álbum ou de uma playlist do catálogo externo, com importação. */
export function AlbumPreviewView({ catalogId, type = 'album' }: { catalogId: string; type?: 'album' | 'playlist' }) {
  const isPlaylist = type === 'playlist';
  const currentTrackId = usePlayerStore((s) => s.currentTrackId);
  const playing = usePlayback((s) => s.playing);
  const [data, setData] = useState<AlbumPreviewResponse | null>(null);
  const [error, setError] = useState('');
  const [importingAlbum, setImportingAlbum] = useState(false);
  const [importedTrackIds, setImportedTrackIds] = useState<Set<number>>(new Set());
  const [progressMap, setProgressMap] = useState<Record<number, ProgressInfo>>({});
  const replace = useNav((s) => s.replace);
  const pollingRef = useRef<Set<number>>(new Set());
  const startedRef = useRef<Set<number>>(new Set());
  const mountedRef = useRef(true);

  async function load() {
    try {
      const d = await api<AlbumPreviewResponse>(`/preview/${type}?catalogId=${catalogId}`);
      useLibrary.getState().upsert(d.tracks.filter((t) => t.localTrackId !== null));
      setData(d);
      setError('');
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  useEffect(() => {
    mountedRef.current = true;
    setData(null);
    setError('');
    setProgressMap({});
    pollingRef.current.clear();
    startedRef.current.clear();
    load();
    return () => {
      mountedRef.current = false;
      pollingRef.current.clear();
      startedRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogId, type]);

  useEffect(() => {
    if (!data) return;
    data.tracks.forEach((t) => {
      const localId = t.localTrackId;
      if (localId && (t.downloadStatus === 'downloading' || t.downloadStatus === 'pending')) {
        if (startedRef.current.has(localId)) return;
        startedRef.current.add(localId);
        startPolling(localId);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  function startPolling(trackId: number) {
    if (pollingRef.current.has(trackId)) return;
    pollingRef.current.add(trackId);

    const tick = async () => {
      if (!pollingRef.current.has(trackId) || !mountedRef.current) return;
      try {
        const info = await api<ProgressInfo>(`/tracks/${trackId}/progress`);
        if (!mountedRef.current) return;
        setProgressMap((prev) => ({ ...prev, [trackId]: info }));
        if (info.status === 'ready' || info.status === 'failed') {
          pollingRef.current.delete(trackId);
          setData((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              tracks: prev.tracks.map((t) =>
                t.localTrackId === trackId ? { ...t, downloadStatus: info.status as TrackDto['downloadStatus'] } : t,
              ),
            };
          });
          // Garante que o player enxergue a faixa como pronta.
          api<TrackDto>(`/tracks/${trackId}`)
            .then((t) => useLibrary.getState().upsert([t]))
            .catch(() => {});
          return;
        }
      } catch {
        // ignora erro temporário
      }
      setTimeout(tick, 2000);
    };
    tick();
  }

  async function importAlbum() {
    if (!data || importingAlbum) return;
    setImportingAlbum(true);
    try {
      if (isPlaylist) {
        const { playlistId } = await send<{ playlistId: number }>('POST', '/import/playlist', { catalogId: data.catalogId });
        // Substitui a prévia: o "voltar" da playlist importada leva de volta à busca.
        replace({ kind: 'playlist', id: playlistId });
        return;
      }
      const { albumId } = await send<{ albumId: number }>('POST', '/import/album', { catalogId: data.catalogId });
      replace({ kind: 'album', id: albumId });
    } catch (e) {
      setError(errorMessage(e));
      setImportingAlbum(false);
    }
  }

  async function importTrack(trackCatalogId: string) {
    try {
      const { track } = await send<{ track: TrackDto }>('POST', '/import/track', { catalogId: trackCatalogId });
      useLibrary.getState().upsert([track]);
      setImportedTrackIds((prev) => new Set(prev).add(track.id));
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          tracks: prev.tracks.map((t) =>
            t.catalogId === trackCatalogId ? { ...t, localTrackId: track.id, downloadStatus: track.downloadStatus } : t,
          ),
        };
      });
      startPolling(track.id);
      load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  function playTrack(trackId: number, index: number) {
    const ids = data?.tracks.map((t) => String(t.localTrackId ?? 0)).filter((id) => id !== '0') ?? [];
    playerControls.playFrom(ids, Math.max(0, ids.indexOf(String(trackId))));
  }

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Carregando…</p>;

  const { album, tracks } = data;

  return (
    <section>
      <div className="header">
        {album.coverUrl && <img src={album.coverUrl} alt={`Capa de ${album.title}`} />}
        <div>
          <div className="muted">{isPlaylist ? 'Pré-visualização da playlist' : 'Pré-visualização do álbum'}</div>
          <h1>{album.title}</h1>
          <div>
            {isPlaylist && album.artistName ? 'por ' : ''}
            {album.artistName}
            {album.releaseYear ? ` · ${album.releaseYear}` : ''} · {tracks.length} faixas
          </div>
        </div>
      </div>
      <div className="actions">
        <button className="primary" onClick={importAlbum} disabled={importingAlbum}>
          {importingAlbum ? 'Importando…' : isPlaylist ? 'Importar playlist' : 'Importar álbum'}
        </button>
      </div>

      <ol className="tracks">
        {tracks.map((t, i) => {
          const localId = t.localTrackId;
          const progress = localId ? progressMap[localId] : undefined;
          const effectiveStatus = progress?.status ?? t.downloadStatus;
          const ready = effectiveStatus === 'ready' && localId !== null;
          const downloading = localId !== null && effectiveStatus !== 'ready' && effectiveStatus !== 'failed';
          const showProgress = downloading && (progress?.percent ?? 0) < 100;
          const imported = localId !== null && importedTrackIds.has(localId);

          return (
            <li key={t.catalogId} className={`track ${ready ? '' : 'unavailable'} ${localId !== null && String(localId) === currentTrackId ? 'playing' : ''}`}>
              <TrackPlayButton trackId={localId} title={t.title} ready={ready} onPlay={() => localId && playTrack(localId, i)} />
              <span className="num muted">
                {localId !== null && String(localId) === currentTrackId && playing ? <PlayingIcon /> : (t.trackNumber ?? i + 1)}
              </span>
              <div className="info">
                <div className="title">{t.title}</div>
                <div className="muted">{isPlaylist && t.albumTitle ? `${t.artistName} · ${t.albumTitle}` : t.artistName}</div>
                {showProgress && (
                  <div className="track-progress">
                    <div className="track-progress-bar">
                      <div className="track-progress-fill" style={{ width: `${progress?.percent ?? 0}%` }} />
                    </div>
                    <span className="muted">{progress?.percent ?? 0}%</span>
                  </div>
                )}
              </div>
              {ready && (
                <>
                  <span className="status ready">{STATUS_LABEL.ready}</span>
                  {t.bitrateKbps && <span className="muted bitrate">{fmtBitrate(t.bitrateKbps)}</span>}
                </>
              )}
              <span className="muted">{fmtDuration(t.durationSeconds)}</span>
              <button
                disabled={ready || imported}
                onClick={() => importTrack(t.catalogId)}
              >
                {ready ? 'Baixada' : imported ? 'Importando…' : 'Importar'}
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
