import { useNav } from '../nav';
import { useTheme } from '../theme';

export function Header() {
  const { canGoBack, canGoForward, back, forward } = useNav();
  const { theme, toggle } = useTheme();

  return (
    <header className="top-bar">
      <div className="nav-buttons">
        <button onClick={() => back()} disabled={!canGoBack} aria-label="Voltar">←</button>
        <button onClick={() => forward()} disabled={!canGoForward} aria-label="Avançar">→</button>
      </div>
      <button className="theme-toggle" onClick={toggle} aria-label="Alternar tema">
        {theme === 'dark' ? '☀' : '☾'}
      </button>
    </header>
  );
}
