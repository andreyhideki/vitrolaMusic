/**
 * Versão do app em execução (gravada no bundle por `frontend/vite-version.ts`) e
 * comparação com a versão que o servidor entrega agora (`/version.json`).
 */
export interface AppVersion {
  version: string;
  commit: string;
  builtAt: string;
}

export const APP_VERSION: AppVersion = (import.meta.env.VITROLA_VERSION as AppVersion | undefined) ?? {
  version: '?',
  commit: 'dev',
  builtAt: '',
};

export function formatVersion(v: AppVersion): string {
  const date = v.builtAt ? new Date(v.builtAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';
  return `${v.version} (${v.commit})${date ? ` · ${date}` : ''}`;
}

export function sameVersion(a: AppVersion, b: AppVersion): boolean {
  return a.version === b.version && a.commit === b.commit && a.builtAt === b.builtAt;
}

/** Versão que o servidor entrega hoje, sem passar por cache (nem do Service Worker). */
export async function fetchServerVersion(): Promise<AppVersion> {
  const res = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as AppVersion;
}

/** Remove o Service Worker e os caches e recarrega: a página volta com a versão atual do servidor. */
export async function forceUpdate(): Promise<void> {
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations()) ?? [];
    await Promise.all(regs.map((r) => r.unregister()));
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } finally {
    window.location.reload();
  }
}
