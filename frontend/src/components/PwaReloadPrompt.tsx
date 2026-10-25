import { useState, useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

export function PwaReloadPrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, r) {
      console.log('Service Worker registrado:', swUrl);
      // Verifica atualizações a cada hora quando o app está ativo.
      setInterval(() => {
        r?.update().catch(() => {});
      }, 60 * 60 * 1000);
    },
    onRegisterError(error) {
      console.error('Erro ao registrar Service Worker:', error);
    },
  });

  const [dismissed, setDismissed] = useState(false);

  const close = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
    setDismissed(true);
  };

  useEffect(() => {
    if (needRefresh) setDismissed(false);
  }, [needRefresh]);

  if (dismissed) return null;

  if (offlineReady) {
    return (
      <div className="pwa-toast">
        <span>App pronto para funcionar offline.</span>
        <button onClick={close} aria-label="Fechar">✕</button>
      </div>
    );
  }

  if (needRefresh) {
    return (
      <div className="pwa-toast">
        <span>Nova versão disponível.</span>
        <button onClick={() => updateServiceWorker(true)}>Atualizar</button>
        <button onClick={close} aria-label="Fechar">✕</button>
      </div>
    );
  }

  return null;
}
