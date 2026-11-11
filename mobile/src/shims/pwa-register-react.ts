/**
 * Substitui `virtual:pwa-register/react` no APK. Os arquivos do app vêm dentro do
 * APK, então não há Service Worker: o `PwaReloadPrompt` nunca aparece.
 */
type Pair = [boolean, (value: boolean) => void];

export interface RegisterSWOptions {
  onRegisteredSW?: (swUrl: string, registration: ServiceWorkerRegistration | undefined) => void;
  onRegisterError?: (error: unknown) => void;
}

export function useRegisterSW(_options?: RegisterSWOptions): {
  needRefresh: Pair;
  offlineReady: Pair;
  updateServiceWorker: (reload?: boolean) => Promise<void>;
} {
  return {
    needRefresh: [false, () => {}],
    offlineReady: [false, () => {}],
    updateServiceWorker: async () => {},
  };
}
