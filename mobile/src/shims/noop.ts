/** Substitui middlewares HTTP (ex.: `cors`) que não fazem sentido sem servidor. */
export default function noop() {
  return (_req: unknown, _res: unknown, next?: () => void) => next?.();
}
