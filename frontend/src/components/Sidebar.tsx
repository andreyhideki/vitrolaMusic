import { useState } from 'react';
import { useNav } from '../nav';
import { useUi } from '../ui';
import { BUY_ME_A_COFFEE_URL } from '../config';
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
              (item.kind === 'playlists' && inPlaylists) || view.kind === item.kind
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
        <button
          className={view.kind === 'analytics' ? 'active' : ''}
          onClick={() => go({ kind: 'analytics' })}
          title="Paranoic"
        >
          <span className="menu-icon">📊</span>
          {!collapsed && <span className="menu-label">Paranoic</span>}
        </button>
        <button onClick={() => setSettingsOpen(true)} title="Configurações">
          <span className="menu-icon">⚙</span>
          {!collapsed && <span className="menu-label">Configurações</span>}
        </button>
        <a
          className="buy-me-a-coffee"
          href={BUY_ME_A_COFFEE_URL}
          target="_blank"
          rel="noopener noreferrer"
          title="Buy me a coffee"
        >
          <span className="menu-icon">☕</span>
          {!collapsed && <span className="menu-label">Buy me a coffee</span>}
        </a>
      </div>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </aside>
  );
}
