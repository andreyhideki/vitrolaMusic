import { useState } from 'react';
import { useNav } from '../nav';
import { SettingsModal } from './SettingsModal';

export function Sidebar() {
  const view = useNav((s) => s.view);
  const go = useNav((s) => s.go);
  const inPlaylists = view.kind === 'playlists' || view.kind === 'playlist';
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <aside className="sidebar">
      <div className="brand">Vitrola</div>
      <nav>
        <button className={view.kind === 'library' ? 'active' : ''} onClick={() => go({ kind: 'library' })}>
          Biblioteca
        </button>
        <button className={view.kind === 'search' ? 'active' : ''} onClick={() => go({ kind: 'search' })}>
          Buscar
        </button>
        <button className={inPlaylists ? 'active' : ''} onClick={() => go({ kind: 'playlists' })}>
          Playlists
        </button>
      </nav>
      <div style={{ marginTop: 'auto' }}>
        <button onClick={() => setSettingsOpen(true)}>⚙ Configurações</button>
      </div>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </aside>
  );
}
