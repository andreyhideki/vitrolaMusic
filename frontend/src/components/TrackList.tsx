import { useEffect, useState } from 'react';
import { api, errorMessage, PlaylistSummary, send, TrackDto } from '../api';
import { retryDownload, useLibrary } from '../library';
import { fmtBitrate, fmtDuration, STATUS_LABEL } from '../format';
import { playerControls } from '../player/usePlayerAudio';
import { usePlayerStore } from '../player/store';
import { usePlayback } from '../player/playback';

interface Props {
  tracks: TrackDto[];
  showAlbum?: boolean;
  onDelete?: (trackId: number) => void;
}

/** Ícone animado de equalizador para a faixa que está tocando. */
function PlayingIcon() {
  return (
    <span className="playing-icon" aria-label="Tocando">
      <span />
      <span />
      <span />
    </span>
  );
}

export function TrackList({ tracks, showAlbum = false, onDelete }: Props) {
  const byId = useLibrary((s) => s.byId);
  const currentTrackId = usePlayerStore((s) => s.currentTrackId);
  const playing = usePlayback((s) => s.playing);
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [notice, setNotice] = useState('');

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
            <li key={`${t.id}-${i}`} className={`track ${ready ? '' : 'unavailable'} ${isCurrent ? 'playing' : ''}`}>
              <button
                className="play-btn"
                disabled={!ready}
                onClick={() => playerControls.playFrom(ids, i)}
                aria-label={`Tocar ${t.title}`}
              >
                {ready ? '▶' : '·'}
              </button>
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
              {t.downloadStatus === 'failed' && <button onClick={() => retry(t.id)}>Tentar de novo</button>}
              <span className="muted">{fmtDuration(t.durationSeconds)}</span>
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
            </li>
          );
        })}
      </ol>
      {notice && <div className="notice">{notice}</div>}
    </>
  );
}
