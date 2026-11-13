import { useEffect, useState } from 'react';
import { api, errorMessage, PlaylistSummary, send, TrackDto } from '../api';
import { retryDownload, useLibrary } from '../library';
import { fmtBitrate, fmtDuration, STATUS_LABEL } from '../format';
import { playerControls } from '../player/usePlayerAudio';
import { usePlayerStore } from '../player/store';
import { usePlayback } from '../player/playback';
import { PlayingIcon, TrackPlayButton } from './TrackPlayButton';
import { useBackHandler } from '../backButton';

interface Props {
  tracks: TrackDto[];
  showAlbum?: boolean;
  onDelete?: (trackId: number) => void;
}

export function TrackList({ tracks, showAlbum = false, onDelete }: Props) {
  const byId = useLibrary((s) => s.byId);
  const currentTrackId = usePlayerStore((s) => s.currentTrackId);
  const playing = usePlayback((s) => s.playing);
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [notice, setNotice] = useState('');
  // Linha com ações expandidas no mobile (menu "⋯").
  const [openRow, setOpenRow] = useState<number | null>(null);
  useBackHandler(openRow !== null, () => setOpenRow(null));

  // Usa a versão mais recente do cache (status de download atualizado).
  const list = tracks.map((t) => byId[String(t.id)] ?? t);
  const ids = list.map((t) => String(t.id));

  useEffect(() => {
    api<PlaylistSummary[]>('/playlists').then(setPlaylists).catch(() => {});
  }, []);

  const flash = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 2500);
  };

  async function addToPlaylist(playlistId: number, trackId: number) {
    try {
      await send('POST', `/playlists/${playlistId}/tracks`, { trackIds: [trackId] });
      flash('Adicionada à playlist');
    } catch (err) {
      flash(errorMessage(err));
    }
  }

  async function retry(trackId: number) {
    try {
      await retryDownload(trackId);
    } catch (err) {
      flash(errorMessage(err));
    }
  }

  return (
    <>
      <ol className="tracks">
        {list.map((t, i) => {
          const ready = t.downloadStatus === 'ready';
          const isCurrent = String(t.id) === currentTrackId;
          return (
            <li
              key={`${t.id}-${i}`}
              className={`track ${ready ? '' : 'unavailable'} ${isCurrent ? 'playing' : ''} ${
                openRow === i ? 'actions-open' : ''
              }`}
            >
              <TrackPlayButton trackId={t.id} title={t.title} ready={ready} onPlay={() => playerControls.playFrom(ids, i)} />
              <span className="num muted">
                {isCurrent && playing ? <PlayingIcon /> : (t.trackNumber ?? i + 1)}
              </span>
              <div className="info">
                <div className="title">{t.title}</div>
                <div className="muted">
                  {t.artistName}
                  {showAlbum ? ` · ${t.albumTitle}` : ''}
                </div>
              </div>
              <span className={`status ${t.downloadStatus}`} title={t.error ?? ''}>
                {STATUS_LABEL[t.downloadStatus]}
              </span>
              {t.bitrateKbps && <span className="muted bitrate">{fmtBitrate(t.bitrateKbps)}</span>}
              <span className="muted duration">{fmtDuration(t.durationSeconds)}</span>
              <button
                className="icon more-toggle"
                onClick={() => setOpenRow(openRow === i ? null : i)}
                aria-label="Mais ações"
                aria-expanded={openRow === i}
              >
                ⋯
              </button>
              <div className="track-actions">
              {t.downloadStatus === 'failed' && <button onClick={() => retry(t.id)}>Tentar de novo</button>}
              <button disabled={!ready} onClick={() => playerControls.playNext(String(t.id))}>
                Tocar a seguir
              </button>
              <button disabled={!ready} onClick={() => playerControls.addToQueue(String(t.id))}>
                Na fila
              </button>
              <select
                value=""
                disabled={!ready || playlists.length === 0}
                onChange={(e) => {
                  const pid = Number(e.target.value);
                  if (pid) addToPlaylist(pid, t.id);
                }}
              >
                <option value="">+ Playlist</option>
                {playlists.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {onDelete && (
                <button
                  className="danger"
                  onClick={() => onDelete(t.id)}
                >
                  Excluir
                </button>
              )}
              </div>
            </li>
          );
        })}
      </ol>
      {notice && <div className="notice">{notice}</div>}
    </>
  );
}
