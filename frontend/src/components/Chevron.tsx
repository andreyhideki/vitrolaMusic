/** Seta em "chevron" (‹ ›) dos botões Voltar/Avançar e de recolher o menu. */
export function Chevron({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg className="chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points={direction === 'left' ? '15 5 8 12 15 19' : '9 5 16 12 9 19'} />
    </svg>
  );
}
