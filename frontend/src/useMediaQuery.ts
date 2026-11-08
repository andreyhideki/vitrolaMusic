import { useEffect, useState } from 'react';

/** Breakpoints do layout responsivo (manter em sincronia com styles.css). */
export const MOBILE_QUERY = '(max-width: 640px)';
export const TABLET_QUERY = '(min-width: 641px) and (max-width: 1024px)';

function matches(query: string): boolean {
  return typeof window !== 'undefined' && window.matchMedia(query).matches;
}

/** Retorna se a media query casa, atualizando ao redimensionar/girar a tela. */
export function useMediaQuery(query: string): boolean {
  const [value, setValue] = useState(() => matches(query));

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setValue(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return value;
}

export type ScreenSize = 'mobile' | 'tablet' | 'desktop';

export function useScreenSize(): ScreenSize {
  const mobile = useMediaQuery(MOBILE_QUERY);
  const tablet = useMediaQuery(TABLET_QUERY);
  return mobile ? 'mobile' : tablet ? 'tablet' : 'desktop';
}
