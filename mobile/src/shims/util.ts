/** Adaptador mínimo de `node:util`: só `promisify`, respeitando `promisify.custom`. */
const custom = Symbol.for('nodejs.util.promisify.custom');

type AnyFn = (...args: any[]) => any;

export function promisify<T extends AnyFn>(fn: T): (...args: any[]) => Promise<any> {
  const own = (fn as unknown as Record<symbol, AnyFn | undefined>)[custom];
  if (typeof own === 'function') return own;
  return (...args: any[]) =>
    new Promise((resolve, reject) => {
      fn(...args, (err: unknown, value: unknown) => (err ? reject(err) : resolve(value)));
    });
}
promisify.custom = custom;

export default { promisify };
