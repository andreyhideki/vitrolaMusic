import { useEffect, useRef } from 'react';
import { useNav } from './nav';

/**
 * "Voltar" do aparelho (APK: botão/gesto voltar do Android). Primeiro fecha o que está por
 * cima (player do carro, modais, gaveta, menus), do mais recente para o mais antigo; sem
 * nada aberto, volta uma tela no histórico do app, igual ao botão ‹ do topo.
 */
const handlers: { current: () => void }[] = [];

/** Enquanto `active`, o "voltar" do aparelho chama `onBack` (ex.: fechar um modal). */
export function useBackHandler(active: boolean, onBack: () => void): void {
  const ref = useRef(onBack);
  ref.current = onBack;
  useEffect(() => {
    if (!active) return;
    const entry = { current: () => ref.current() };
    handlers.push(entry);
    return () => {
      const i = handlers.lastIndexOf(entry);
      if (i >= 0) handlers.splice(i, 1);
    };
  }, [active]);
}

/** Trata o "voltar". Devolve false se não havia o que fechar nem tela anterior. */
export function handleBack(): boolean {
  const top = handlers[handlers.length - 1];
  if (top) {
    top.current();
    return true;
  }
  return useNav.getState().back();
}
