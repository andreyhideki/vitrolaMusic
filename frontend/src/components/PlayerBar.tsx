import { useEffect, useRef, useState } from 'react';
import { usePlayerStore } from '../player/store';
import { usePlayback } from '../player/playback';
import { playerControls } from '../player/usePlayerAudio';
import { useLibrary } from '../library';
import { useNav } from '../nav';
import { fmtBitrate, fmtTime } from '../format';

export function PlayerBar() {
  const currentId = usePlayerStore((s) => s.currentTrackId);
  const shuffle = usePlayerStore((s) => s.shuffle);
  const repeat = usePlayerStore((s) => s.repeat);
  const { position, duration, playing } = usePlayback();
  const track = useLibrary((s) => (currentId ? s.byId[currentId] : undefined));
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const lastVolume = useRef(1);
  const source = usePlayerStore((s) => s.source);
  const go = useNav((s) => s.go);

  // Vai para a origem do que está tocando (playlist/álbum/lista); sem origem, abre o álbum da faixa.
  const target = source ?? (track ? { kind: 'album' as const, id: track.albumId } : null);
  const openSource = () => {
    if (target) go(target);
  };

  useEffect(() => {
    playerControls.setVolume(muted ? 0 : volume);
  }, [volume, muted]);

  const progress = duration ? (position / duration) * 100 : 0;
  const volumePercent = muted ? 0 : volume * 100;

  return (
    <footer className="player">
      <div
        className={`now ${target ? 'clickable' : ''}`}
        role={target ? 'button' : undefined}
        tabIndex={target ? 0 : undefined}
        title={target ? 'Ir para o que está tocando' : undefined}
        onClick={openSource}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openSource();
          }
        }}
      >
        {track?.coverUrl && <img src={track.coverUrl} alt="" />}
        <div style={{ minWidth: 0 }}>
          <div className="title">{track?.title ?? 'Nada tocando'}</div>
          <div className="muted">
            {track?.artistName ?? ''}
            {track?.bitrateKbps ? ` · ${fmtBitrate(track.bitrateKbps)}` : ''}
          </div>
        </div>
      </div>

      <div className="controls">
        <div className="buttons">
          <button
            className={`icon ${shuffle ? 'active' : ''}`}
            onClick={() => playerControls.setShuffle(!shuffle)}
            title="Aleatório"
            aria-label="Aleatório"
          >
            ⇄
          </button>
          <button className="icon" onClick={() => playerControls.previous()} aria-label="Anterior">
            {'|<'}
          </button>
          <button
            className={`play ${playing ? 'is-pause' : 'is-play'}`}
            disabled={!currentId}
            onClick={() => playerControls.togglePlay()}
            aria-label={playing ? 'Pausar' : 'Tocar'}
          >
            {playing ? '❚❚' : '▶'}
          </button>
          <button className="icon" onClick={() => playerControls.next()} aria-label="Próxima">
            {'>|'}
          </button>
          <button
            className={`icon ${repeat !== 'off' ? 'active' : ''}`}
            onClick={() => playerControls.cycleRepeat()}
            title={`Repetir: ${repeat}`}
            aria-label="Repetir"
          >
            {repeat === 'one' ? '1↻' : '↻'}
          </button>
        </div>
        <div className="progress">
          <span>{fmtTime(position)}</span>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.1}
              value={position}
              onChange={(e) => playerControls.seek(Number(e.target.value))}
              aria-label="Posição"
            />
          </div>
          <span>{fmtTime(duration)}</span>
        </div>
      </div>

      <div className="volume">
        <button
          className="icon"
          onClick={() => {
            if (muted) {
              setMuted(false);
              setVolume(lastVolume.current || 0.5);
            } else {
              lastVolume.current = volume || 1;
              setMuted(true);
            }
          }}
          aria-label={muted ? 'Desmutar' : 'Mutar'}
        >
          {muted || volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}
        </button>
        <div className="volume-bar">
          <div className="volume-fill" style={{ width: `${volumePercent}%` }} />
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={muted ? 0 : volume}
            onChange={(e) => {
              const v = Number(e.target.value);
              setVolume(v);
              if (v > 0) setMuted(false);
            }}
            aria-label="Volume"
          />
        </div>
      </div>
    </footer>
  );
}
