import { useEffect, useState } from 'react';
import { useNav } from '../nav';
import { useSidebarCollapsed, useUi } from '../ui';
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
  const collapsed = useSidebarCollapsed();
  const toggleSidebar = useUi((s) => s.toggleSidebar);
  const screen = useUi((s) => s.screen);
  const drawerOpen = useUi((s) => s.drawerOpen);
  const isMobile = screen === 'mobile';
  const closeDrawer = useUi((s) => s.closeDrawer);

  // Botão "voltar" do aparelho fecha a gaveta em vez de sair da página.
  useEffect(() => {
    if (!isMobile || !drawerOpen) return;
    history.pushState({ vitrolaDrawer: true }, '');
    const onPop = () => closeDrawer();
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      // Fechou por outro meio (toque fora, navegação): remove a entrada extra.
      if (history.state?.vitrolaDrawer) history.back();
    };
  }, [isMobile, drawerOpen, closeDrawer]);

  // Fecha a gaveta com Esc.
  useEffect(() => {
    if (!isMobile || !drawerOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeDrawer();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isMobile, drawerOpen, closeDrawer]);

  return (
    <aside
      className={`sidebar ${collapsed ? 'collapsed' : ''} ${isMobile ? 'drawer' : ''} ${
        isMobile && drawerOpen ? 'open' : ''
      }`}
      aria-hidden={isMobile && !drawerOpen ? true : undefined}
    >
      <div className="brand">
        <img
          src={collapsed ? '/logo-icon.png' : '/logo-vertical.png'}
          alt="Vitrola Music"
          className="brand-logo"
        />
      </div>
      {screen !== 'tablet' && (
        <button
          className="collapse-toggle"
          onClick={toggleSidebar}
          aria-label={isMobile ? 'Fechar menu' : collapsed ? 'Expandir menu' : 'Colapsar menu'}
          title={isMobile ? 'Fechar menu' : collapsed ? 'Expandir menu' : 'Colapsar menu'}
        >
          {isMobile ? '✕' : collapsed ? '→' : '←'}
        </button>
      )}
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
        <button onClick={() => {
            closeDrawer();
            setSettingsOpen(true);
          }} title="Configurações">
          <span className="menu-icon">⚙</span>
          {!collapsed && <span className="menu-label">Configurações</span>}
        </button>
        {BUY_ME_A_COFFEE_URL && (
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
        )}
      </div>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </aside>
  );
}
