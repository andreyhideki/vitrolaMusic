import { useEffect, useRef, useState } from 'react';
import { api, AlbumDto, errorMessage, send, TrackDto } from '../api';
import { ConfirmModal } from '../components/ConfirmModal';
import { useLibrary } from '../library';
import { useNav } from '../nav';
import { playerControls } from '../player/usePlayerAudio';
import { fmtBitrate, fmtDuration, STATUS_LABEL } from '../format';

interface AlbumResponse {
  album: AlbumDto;
  tracks: (TrackDto & { catalogId?: string })[];
}

interface ProgressInfo {
  percent: number;
  status: TrackDto['downloadStatus'];
}

export function AlbumView({ id }: { id: number }) {
  const [data, setData] = useState<AlbumResponse | null>(null);
  const [error, setError] = useState('');
  const [importingTracks, setImportingTracks] = useState<Set<string>>(new Set());
  const [progressMap, setProgressMap] = useState<Record<number, ProgressInfo>>({});
  const [confirm, setConfirm] = useState<{ open: boolean; title: string; message: string; onConfirm: () => void } | null>(null);
  const go = useNav((s) => s.go);
  const pollingRef = useRef<Set<number>>(new Set());
  const startedRef = useRef<Set<number>>(new Set());
  const mountedRef = useRef(true);

  async function load() {
    try {
      const d = await api<AlbumResponse>(`/albums/${id}`);
      if (!mountedRef.current) return;
      setData(d);
      setError('');
    } catch (e) {
      if (!mountedRef.current) return;
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
  }, [id]);

  useEffect(() => {
    if (!data) return;
    data.tracks.forEach((t) => {
      if (t.id > 0 && (t.downloadStatus === 'downloading' || t.downloadStatus === 'pending')) {
        if (startedRef.current.has(t.id)) return;
        startedRef.current.add(t.id);
        startPolling(t.id);
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
          // Atualiza o status local imediatamente para trocar a UI sem esperar load().
          setData((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              tracks: prev.tracks.map((t) =>
                t.id === trackId ? { ...t, downloadStatus: info.status as TrackDto['downloadStatus'] } : t,
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

  function askDeleteAlbum() {
    if (!data) return;
    setConfirm({
      open: true,
      title: 'Excluir álbum',
      message: `Excluir o álbum "${data.album.title}"? Todas as faixas serão removidas.`,
      onConfirm: async () => {
        setConfirm(null);
        try {
          await send('DELETE', `/albums/${id}`);
          go({ kind: 'library' });
        } catch (e) {
          setError(errorMessage(e));
        }
      },
    });
  }

  function askDeleteTrack(trackId: number) {
    const track = data?.tracks.find((t) => t.id === trackId);
    if (!track) return;
    setConfirm({
      open: true,
      title: 'Excluir faixa',
      message: `Excluir "${track.title}"?`,
      onConfirm: async () => {
        setConfirm(null);
        try {
          await send('DELETE', `/tracks/${trackId}`);
          load();
        } catch (e) {
          setError(errorMessage(e));
        }
      },
    });
  }

  async function importTrack(catalogId: string) {
    setImportingTracks((prev) => new Set(prev).add(catalogId));
    try {
      const { track } = await send<{ track: TrackDto }>('POST', '/import/track', { catalogId });
      // Atualiza a lista localmente enquanto o load() busca dados frescos.
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          tracks: prev.tracks.map((t) =>
            t.catalogId === catalogId ? { ...track, catalogId } : t,
          ),
        };
      });
      startPolling(track.id);
      load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setImportingTracks((prev) => {
        const next = new Set(prev);
        next.delete(catalogId);
        return next;
      });
    }
  }

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Carregando…</p>;

  const { album, tracks } = data;
  const readyIds = tracks.filter((t) => t.downloadStatus === 'ready' && t.id > 0).map((t) => String(t.id));

  return (
    <section>
      <div className="header">
        {album.coverUrl && <img src={album.coverUrl} alt={`Capa de ${album.title}`} />}
        <div>
          <div className="muted">Álbum</div>
          <h1>{album.title}</h1>
          <div>
            {album.artistName}
            {album.releaseYear ? ` · ${album.releaseYear}` : ''} · {tracks.length} faixas
          </div>
        </div>
      </div>
      <div className="actions">
        <button className="primary" disabled={readyIds.length === 0} onClick={() => playerControls.playPlaylist(readyIds, false)}>Tocar</button>
        <button disabled={readyIds.length === 0} onClick={() => playerControls.playPlaylist(readyIds, true)}>Aleatório</button>
        <button className="danger" onClick={askDeleteAlbum}>Excluir álbum</button>
      </div>

      <ol className="tracks">
        {tracks.map((t, i) => {
          const isLocal = t.id > 0;
          const isRemote = t.id === 0 && t.catalogId;
          const progress = isLocal ? progressMap[t.id] : undefined;
          const effectiveStatus = progress?.status ?? t.downloadStatus;
          const ready = isLocal && effectiveStatus === 'ready';
          const downloading = isLocal && effectiveStatus !== 'ready' && effectiveStatus !== 'failed';
          const showProgress = downloading && (progress?.percent ?? 0) < 100;

          return (
            <li key={`${t.id}-${i}`} className={`track ${ready ? '' : 'unavailable'}`}>
              <button
                className="play-btn"
                disabled={!ready}
                onClick={() => ready && playerControls.playFrom(readyIds, readyIds.indexOf(String(t.id)))}
                aria-label={`Tocar ${t.title}`}
              >
                {ready ? '▶' : '·'}
              </button>
              <span className="num muted">{t.trackNumber ?? i + 1}</span>
              <div className="info">
                <div>{t.title}</div>
                <div className="muted">{t.artistName}</div>
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
              {isRemote && <span className="status pending">Não baixada</span>}
              <span className="muted">{fmtDuration(t.durationSeconds)}</span>
              {ready ? (
                <button className="danger" onClick={() => askDeleteTrack(t.id)}>Excluir</button>
              ) : isRemote ? (
                <button
                  disabled={importingTracks.has(t.catalogId!)}
                  onClick={() => t.catalogId && importTrack(t.catalogId)}
                >
                  {importingTracks.has(t.catalogId!) ? 'Importando…' : 'Importar'}
                </button>
              ) : null}
            </li>
          );
        })}
      </ol>

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
