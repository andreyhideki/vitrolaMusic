import { usePlayerStore } from '../player/store';
import { usePlayback } from '../player/playback';
import { playerControls } from '../player/usePlayerAudio';

/** Estado de uma faixa no player: é a atual? Está tocando? */
export function useTrackPlayState(trackId: number | string | null | undefined) {
  const currentTrackId = usePlayerStore((s) => s.currentTrackId);
  const playing = usePlayback((s) => s.playing);
  const isCurrent = trackId !== null && trackId !== undefined && String(trackId) === currentTrackId;
  return { isCurrent, isPlaying: isCurrent && playing };
}

/** Ícone animado de equalizador para a faixa que está tocando. */
export function PlayingIcon() {
  return (
    <span className="playing-icon" aria-label="Tocando">
      <span />
      <span />
      <span />
    </span>
  );
}

interface Props {
  trackId: number | string | null | undefined;
  title: string;
  ready: boolean;
  /** Começa a tocar esta faixa (com a fila da tela). Só é chamado se ela não for a faixa atual. */
  onPlay: () => void;
}

/**
 * Botão de play de uma faixa nas listas. Na faixa atual vira pausa (❚❚) enquanto toca,
 * e o ▶ continua de onde parou em vez de recomeçar a faixa.
 */
export function TrackPlayButton({ trackId, title, ready, onPlay }: Props) {
  const { isCurrent, isPlaying } = useTrackPlayState(trackId);

  const onClick = () => {
    if (!ready) return;
    if (isPlaying) playerControls.pause();
    else if (isCurrent) playerControls.play();
    else onPlay();
  };

  return (
    <button
      className={`play-btn ${isCurrent ? 'is-current' : ''}`}
      disabled={!ready}
      onClick={onClick}
      aria-label={isPlaying ? `Pausar ${title}` : `Tocar ${title}`}
    >
      {!ready ? '·' : isPlaying ? '❚❚' : '▶'}
    </button>
  );
}
