import { CSSProperties, useEffect, useState } from 'react';
import { usePlayerStore } from '../player/store';
import { usePlayback } from '../player/playback';
import { playerControls } from '../player/usePlayerAudio';
import { useLibrary } from '../library';
import { useCarMode } from '../carMode';
import { fmtTime } from '../format';
import { AudioOutputButton } from './AudioOutputButton';
import { useBackHandler } from '../backButton';

/**
 * Player de tela cheia para usar no carro: capa grande e botões grandes (voltar,
 * tocar/pausar, avançar). Abre sozinho quando o Bluetooth do carro conecta (APK)
 * ou pelo botão 🚗 do player.
 */
export function CarPlayer() {
  const open = useCarMode((s) => s.open);
  const close = useCarMode((s) => s.close);
  const carName = useCarMode((s) => s.carName);
  const currentId = usePlayerStore((s) => s.currentTrackId);
  const track = useLibrary((s) => (currentId ? s.byId[currentId] : undefined));
  const { position, duration, playing } = usePlayback();
  const shuffle = usePlayerStore((s) => s.shuffle);
  const repeat = usePlayerStore((s) => s.repeat);
  const color = useCoverColor(open ? track?.coverUrl : null);

  // Tela sempre acesa enquanto o player do carro está aberto (quando o navegador permite).
  useEffect(() => {
    if (!open || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const request = () =>
      navigator.wakeLock
        .request('screen')
        .then((l) => {
          if (cancelled) void l.release();
          else lock = l;
        })
        .catch(() => {});
    void request();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void request();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release();
    };
  }, [open]);

  useBackHandler(open, close);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  if (!open) return null;

  const progress = duration ? (position / duration) * 100 : 0;
  const sourceLabel = track?.albumTitle ?? '';

  return (
    <div
      className="car-player"
      role="dialog"
      aria-modal="true"
      aria-label="Player do carro"
      style={color ? ({ '--car-bg': color } as CSSProperties) : undefined}
    >
      <div className="car-top">
        <span className="car-badge">🚗 {carName || 'Modo carro'}</span>
        <div className="car-top-actions">
          <AudioOutputButton />
          <button className="car-close" onClick={close} aria-label="Sair do modo carro">
            ✕
          </button>
        </div>
      </div>

      <div className="car-card">
        <div className="car-main">
          <div className="car-cover">
            {track?.coverUrl ? <img src={track.coverUrl} alt={`Capa de ${track.albumTitle}`} /> : <div className="car-cover-empty">♪</div>}
          </div>
          <div className="car-info">
            {sourceLabel && <div className="car-source">{sourceLabel}</div>}
            <div className="car-title">{track?.title ?? 'Nada tocando'}</div>
            <div className="car-artist">{track?.artistName ?? ''}</div>
          </div>
        </div>

        <div className="car-progress">
          <div className="car-progress-bar">
            <div className="car-progress-fill" style={{ width: `${progress}%` }} />
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={1}
              value={position}
              onChange={(e) => playerControls.seek(Number(e.target.value))}
              aria-label="Posição"
            />
          </div>
          <div className="car-times">
            <span>{fmtTime(position)}</span>
            <span>{fmtTime(duration)}</span>
          </div>
        </div>

        <div className="car-buttons">
          <button
            className={`car-btn small ${shuffle ? 'active' : ''}`}
            onClick={() => playerControls.setShuffle(!shuffle)}
            aria-label="Aleatório"
            aria-pressed={shuffle}
          >
            ⇄
          </button>
          <button className="car-btn" onClick={() => playerControls.previous()} aria-label="Anterior">
            ⏮
          </button>
          <button
            className="car-btn car-play"
            disabled={!currentId}
            onClick={() => playerControls.togglePlay()}
            aria-label={playing ? 'Pausar' : 'Tocar'}
          >
            {playing ? '❚❚' : '▶'}
          </button>
          <button className="car-btn" onClick={() => playerControls.next()} aria-label="Próxima">
            ⏭
          </button>
          <button
            className={`car-btn small ${repeat !== 'off' ? 'active' : ''}`}
            onClick={() => playerControls.cycleRepeat()}
            aria-label={`Repetir: ${repeat}`}
          >
            {repeat === 'one' ? '1↻' : '↻'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Cor de fundo do player a partir da capa (média dos pixels, escurecida para o texto
 * branco ter contraste). As capas do catálogo liberam CORS; sem isso, fica a cor padrão.
 */
function useCoverColor(url: string | null | undefined): string | null {
  const [color, setColor] = useState<string | null>(null);
  useEffect(() => {
    setColor(null);
    if (!url) return;
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const size = 16;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;
        let r = 0, g = 0, b = 0;
        for (let i = 0; i < data.length; i += 4) {
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
        }
        const n = data.length / 4;
        // Escurece até a luminância ficar baixa o bastante para texto branco.
        let [cr, cg, cb] = [r / n, g / n, b / n];
        const lum = 0.2126 * cr + 0.7152 * cg + 0.0722 * cb;
        const k = lum > 90 ? 90 / lum : 1;
        [cr, cg, cb] = [cr * k, cg * k, cb * k].map(Math.round);
        if (!cancelled) setColor(`rgb(${cr}, ${cg}, ${cb})`);
      } catch {
        // imagem sem CORS: mantém a cor padrão
      }
    };
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [url]);
  return color;
}
