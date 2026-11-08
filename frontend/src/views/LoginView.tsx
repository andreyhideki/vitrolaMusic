import { useState } from 'react';
import { useAuth } from '../auth';
import { errorMessage } from '../api';

export function LoginView({ initialError = '' }: { initialError?: string }) {
  const login = useAuth((s) => s.login);
  const [token, setToken] = useState('');
  const [error, setError] = useState(initialError);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!token.trim()) return;
    setLoading(true);
    setError('');
    try {
      await login(token);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-screen">
      <form className="modal login-box" onSubmit={submit}>
        <img src="/logo-icon.png" alt="" className="login-logo" />
        <h2>Vitrola Music</h2>
        <p className="hint">
          Digite o token de acesso. No computador onde o Vitrola roda, veja o token com{' '}
          <code>make token</code> (ou no arquivo <code>data/auth-token.txt</code>).
        </p>
        <div className="form-group">
          <input
            type="text"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="XXXXX-XXXXX-XXXXX-XXXXX"
            autoCapitalize="characters"
            autoComplete="current-password"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
          />
        </div>
        {error && <p className="error">{error}</p>}
        <div className="modal-actions">
          <button type="submit" className="primary" disabled={loading || !token.trim()}>
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </div>
      </form>
    </div>
  );
}
