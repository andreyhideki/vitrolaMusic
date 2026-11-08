import { create } from 'zustand';

export type AuthStatus = 'unknown' | 'authenticated' | 'unauthenticated';

interface AuthState {
  status: AuthStatus;
  /** true quando a API roda com AUTH_DISABLED=true (sem login). */
  disabled: boolean;
  /** Consulta a API para saber se o cookie de sessão é válido. */
  check: () => Promise<void>;
  login: (token: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Chamado pelo cliente HTTP quando a API responde 401. */
  expired: () => void;
}

// Estas chamadas usam fetch direto (e não o helper `api`) para não criar um ciclo
// de import com api.ts, que chama `expired()` ao receber 401.
async function post(path: string, body?: unknown): Promise<Response> {
  return fetch(`/api/auth${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export const useAuth = create<AuthState>((set) => ({
  status: 'unknown',
  disabled: false,
  check: async () => {
    try {
      const res = await fetch('/api/auth/status');
      const data = (await res.json()) as { authenticated?: boolean; disabled?: boolean };
      set({ status: data.authenticated ? 'authenticated' : 'unauthenticated', disabled: !!data.disabled });
    } catch {
      set({ status: 'unauthenticated' });
    }
  },
  login: async (token) => {
    const res = await post('/login', { token });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? `Erro ${res.status}`);
    }
    set({ status: 'authenticated' });
  },
  logout: async () => {
    await post('/logout').catch(() => {});
    set({ status: 'unauthenticated' });
  },
  expired: () => set({ status: 'unauthenticated' }),
}));

/**
 * Lê um token de `#token=...` na URL (link de acesso rápido para o celular) e o
 * remove da barra de endereço imediatamente, para não ficar no histórico.
 */
export function takeTokenFromUrl(): string | null {
  const match = /(?:^|[#&])token=([^&]+)/.exec(window.location.hash);
  if (!match) return null;
  history.replaceState(null, '', window.location.pathname + window.location.search);
  return decodeURIComponent(match[1]);
}
