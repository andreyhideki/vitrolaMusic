import { useNav } from '../nav';
import { useTheme } from '../theme';
import { useUi } from '../ui';
import { Chevron } from './Chevron';

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
        <button onClick={() => back()} disabled={!canGoBack} aria-label="Voltar" title="Voltar">
          <Chevron direction="left" />
        </button>
        <button onClick={() => forward()} disabled={!canGoForward} aria-label="Avançar" title="Avançar">
          <Chevron direction="right" />
        </button>
      </div>
      <button className="theme-toggle" onClick={toggle} aria-label="Alternar tema">
        {theme === 'dark' ? '☀' : '☾'}
      </button>
    </header>
  );
}
