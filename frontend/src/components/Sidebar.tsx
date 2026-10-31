import { useState } from 'react';
import { useNav } from '../nav';
import { useUi } from '../ui';
import { SettingsModal } from './SettingsModal';

const MENU = [
  { kind: 'library' as const, label: 'Início', icon: '🏠' },
  { kind: 'search' as const, label: 'Buscar', icon: '🔍' },
  { kind: 'playlists' as const, label: 'Playlists', icon: '🎵' },
];

export function Sidebar() {
  const view = useNav((s) => s.view);
  const go = useNav((s) => s.go);
  const inPlaylists = view.kind === 'playlists' || view.kind === 'playlist';
  const [settingsOpen, setSettingsOpen] = useState(false);
  const collapsed = useUi((s) => s.sidebarCollapsed);
  const toggleSidebar = useUi((s) => s.toggleSidebar);

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="brand">
        <img
          src={collapsed ? '/logo-icon.png' : '/logo-vertical.png'}
          alt="Vitrola Music"
          className="brand-logo"
        />
      </div>
      <button
        className="collapse-toggle"
        onClick={toggleSidebar}
        aria-label={collapsed ? 'Expandir menu' : 'Colapsar menu'}
        title={collapsed ? 'Expandir menu' : 'Colapsar menu'}
      >
        {collapsed ? '→' : '←'}
      </button>
      <nav>
        {MENU.map((item) => (
          <button
            key={item.kind}
            className={
              (item.kind === 'library' && view.kind === 'library') ||
              (item.kind === 'search' && view.kind === 'search') ||
              (item.kind === 'playlists' && inPlaylists)
                ? 'active'
                : ''
            }
            onClick={() => go({ kind: item.kind })}
            title={item.label}
          >
            <span className="menu-icon">{item.icon}</span>
            {!collapsed && <span className="menu-label">{item.label}</span>}
          </button>
        ))}
      </nav>
      <div className="sidebar-footer" style={{ marginTop: 'auto' }}>
        <button onClick={() => setSettingsOpen(true)} title="Configurações">
          <span className="menu-icon">⚙</span>
          {!collapsed && <span className="menu-label">Configurações</span>}
        </button>
      </div>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </aside>
  );
}
