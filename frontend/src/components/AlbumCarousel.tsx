import { useEffect, useRef, useState } from 'react';
import type { AlbumDto } from '../api';
import { playerControls } from '../player/usePlayerAudio';

interface Props {
  albums: AlbumDto[];
  albumTrackIds: (albumId: number) => string[];
  currentAlbumId?: number;
  playing: boolean;
  onOpen: (id: number) => void;
}

export function AlbumCarousel({ albums, albumTrackIds, currentAlbumId, playing, onOpen }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showArrows, setShowArrows] = useState(false);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);
  const drag = useRef({ isDragging: false, startX: 0, scrollLeft: 0 });

  function updateArrows() {
    const el = containerRef.current;
    if (!el) return;
    const hasOverflow = el.scrollWidth > el.clientWidth + 1;
    setShowArrows(hasOverflow);
    setCanLeft(el.scrollLeft > 0);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }

  useEffect(() => {
    updateArrows();
    window.addEventListener('resize', updateArrows);
    return () => window.removeEventListener('resize', updateArrows);
  }, [albums]);

  function stepSize(): number {
    const el = containerRef.current;
    if (!el) return 0;
    const card = el.querySelector('.album-card') as HTMLElement | null;
    const gap = 16;
    const cardWidth = card ? card.offsetWidth + gap : 176;
    const visible = Math.max(1, Math.floor(el.clientWidth / cardWidth));
    const scrollCards = Math.min(visible, 3);
    return scrollCards * cardWidth;
  }

  function scroll(dir: -1 | 1) {
    const el = containerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * stepSize(), behavior: 'smooth' });
  }

  function onMouseDown(e: React.MouseEvent) {
    const el = containerRef.current;
    if (!el) return;
    drag.current = { isDragging: true, startX: e.pageX - el.offsetLeft, scrollLeft: el.scrollLeft };
  }

  function onMouseMove(e: React.MouseEvent) {
    if (!drag.current.isDragging) return;
    const el = containerRef.current;
    if (!el) return;
    e.preventDefault();
    const x = e.pageX - el.offsetLeft;
    const walk = (x - drag.current.startX) * 1.5;
    el.scrollLeft = drag.current.scrollLeft - walk;
  }

  function endDrag() {
    drag.current.isDragging = false;
  }

  if (albums.length === 0) {
    return (
      <>
        <h2>Álbuns</h2>
        <p className="muted">Nenhum álbum baixado ainda.</p>
      </>
    );
  }

  return (
    <>
      <div className="album-section-header">
        <h2>Álbuns</h2>
        {showArrows && (
          <div className="carousel-arrows">
            <button onClick={() => scroll(-1)} disabled={!canLeft} aria-label="Anteriores">
              ←
            </button>
            <button onClick={() => scroll(1)} disabled={!canRight} aria-label="Próximos">
              →
            </button>
          </div>
        )}
      </div>
      <div
        ref={containerRef}
        className="album-carousel"
        onScroll={updateArrows}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={endDrag}
        onMouseLeave={endDrag}
      >
        {albums.map((a) => {
          const ids = albumTrackIds(a.id);
          const isCurrentAlbum = currentAlbumId === a.id && playing;
          return (
            <div key={a.id} className="card album-card">
              <div className="card-cover">
                <button
                  className="card-cover-btn"
                  onClick={() => onOpen(a.id)}
                  aria-label={`Abrir álbum ${a.title}`}
                >
                  {a.coverUrl ? <img src={a.coverUrl} alt="" /> : <div className="card-placeholder">💿</div>}
                </button>
                <button
                  className={`cover-play ${isCurrentAlbum ? 'is-pause' : 'is-play'}`}
                  disabled={ids.length === 0}
                  onClick={() => {
                    if (isCurrentAlbum) {
                      playerControls.togglePlay();
                    } else {
                      playerControls.playPlaylist(ids, false);
                    }
                  }}
                  aria-label={isCurrentAlbum ? `Pausar álbum ${a.title}` : `Tocar álbum ${a.title}`}
                  title={isCurrentAlbum ? 'Pausar álbum' : 'Tocar álbum'}
                >
                  {isCurrentAlbum ? '❚❚' : '▶'}
                </button>
              </div>
              <button className="card-content" onClick={() => onOpen(a.id)}>
                <div>{a.title}</div>
                <div className="muted">{a.artistName}</div>
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}
