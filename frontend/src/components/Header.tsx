import { useNav } from '../nav';
import { useTheme } from '../theme';
import { useUi } from '../ui';

export function Header() {
  const { canGoBack, canGoForward, back, forward } = useNav();
  const { theme, toggle } = useTheme();
  const isMobile = useUi((s) => s.screen === 'mobile');
  const openDrawer = useUi((s) => s.openDrawer);

  return (
    <header className="top-bar">
      <div className="nav-buttons">
        {isMobile && (
          <button className="menu-toggle" onClick={openDrawer} aria-label="Abrir menu">
            ☰
          </button>
        )}
        <button onClick={() => back()} disabled={!canGoBack} aria-label="Voltar">←</button>
        <button onClick={() => forward()} disabled={!canGoForward} aria-label="Avançar">→</button>
      </div>
      <button className="theme-toggle" onClick={toggle} aria-label="Alternar tema">
        {theme === 'dark' ? '☀' : '☾'}
      </button>
    </header>
  );
}
