/**
 * Adaptador mínimo de `express` para rodar os routers de `api/src/routes` dentro do
 * WebView, sem servidor HTTP. Suporta o que as rotas usam: `Router()` com
 * get/post/patch/delete, parâmetros `:nome`, `req.query`/`req.body`/`req.headers` e
 * `res.status().json()/end()/setHeader()/on('close')`.
 *
 * `createApp()` monta os routers com prefixo, como o `app.use()` de `api/src/index.ts`,
 * e `handle()` devolve um `Response` de verdade para quem chamou `fetch`.
 */
import { HttpError } from '../../../api/src/http';

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface Request {
  method: Method;
  path: string;
  params: Record<string, string>;
  query: Record<string, string>;
  body: any;
  headers: Record<string, string>;
}

type Handler = (req: Request, res: LocalResponse) => unknown;

interface Route {
  method: Method;
  pattern: RegExp;
  keys: string[];
  handler: Handler;
}

function compile(path: string): { pattern: RegExp; keys: string[] } {
  const keys: string[] = [];
  const source = path
    .split('/')
    .map((part) => {
      if (part.startsWith(':')) {
        keys.push(part.slice(1));
        return '([^/]+)';
      }
      return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  // "/" de um router montado casa com o próprio prefixo (ex.: GET /api/playlists).
  return { pattern: new RegExp(`^${source === '/' ? '/?' : source + '/?'}$`), keys };
}

export class RouterImpl {
  readonly routes: Route[] = [];

  private add(method: Method, path: string, handler: Handler): this {
    this.routes.push({ method, ...compile(path), handler });
    return this;
  }
  get(path: string, handler: Handler) { return this.add('GET', path, handler); }
  post(path: string, handler: Handler) { return this.add('POST', path, handler); }
  patch(path: string, handler: Handler) { return this.add('PATCH', path, handler); }
  put(path: string, handler: Handler) { return this.add('PUT', path, handler); }
  delete(path: string, handler: Handler) { return this.add('DELETE', path, handler); }
}

export function Router(): RouterImpl {
  return new RouterImpl();
}

export class LocalResponse {
  statusCode = 200;
  headers: Record<string, string> = {};
  body: unknown = undefined;
  finished = false;
  private closeListeners: (() => void)[] = [];
  private done!: () => void;
  readonly settled = new Promise<void>((resolve) => (this.done = resolve));

  status(code: number): this {
    this.statusCode = code;
    return this;
  }

  setHeader(name: string, value: string | number): this {
    this.headers[name.toLowerCase()] = String(value);
    return this;
  }

  /** Aceita também uma Promise: versões mobile de serviços síncronos (ex.: `mediaUsage`) são assíncronas. */
  json(body: unknown): this {
    Promise.resolve(body).then(
      (value) => this.finish(value),
      (err) => this.fail(err),
    );
    return this;
  }

  end(): this {
    this.finish(undefined);
    return this;
  }

  on(event: string, fn: () => void): this {
    if (event === 'close') this.closeListeners.push(fn);
    return this;
  }

  destroy(): void {
    this.finish(undefined);
  }

  fail(err: unknown): void {
    if (this.finished) return;
    const { status, message } = errorBody(err);
    this.statusCode = status;
    this.finish({ error: message });
  }

  private finish(body: unknown): void {
    if (this.finished) return;
    this.finished = true;
    this.body = body;
    this.done();
    for (const fn of this.closeListeners) fn();
  }
}

/** Mesmo tratamento de erros do middleware central de `api/src/index.ts`. */
function errorBody(err: unknown): { status: number; message: string } {
  if (err instanceof HttpError) return { status: err.status, message: err.message };
  const status = (err as { status?: number })?.status;
  if (typeof status === 'number' && status >= 400 && status < 500) return { status, message: 'Requisição inválida' };
  console.error(err);
  return { status: 500, message: 'Erro interno' };
}

export interface LocalApp {
  use(prefix: string, router: RouterImpl): void;
  handle(url: string, init?: RequestInit): Promise<globalThis.Response>;
}

export function createApp(): LocalApp {
  const mounts: { prefix: string; router: RouterImpl }[] = [];

  function find(method: Method, path: string): { route: Route; params: Record<string, string> } | null {
    for (const { prefix, router } of mounts) {
      if (path !== prefix && !path.startsWith(prefix + '/')) continue;
      const rest = path.slice(prefix.length) || '/';
      for (const route of router.routes) {
        if (route.method !== method) continue;
        const m = route.pattern.exec(rest);
        if (!m) continue;
        const params: Record<string, string> = {};
        route.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
        return { route, params };
      }
    }
    return null;
  }

  async function handle(url: string, init?: RequestInit): Promise<globalThis.Response> {
    const parsed = new URL(url, 'http://local');
    const method = (init?.method ?? 'GET').toUpperCase() as Method;
    const res = new LocalResponse();

    let body: unknown;
    if (typeof init?.body === 'string' && init.body !== '') {
      try {
        body = JSON.parse(init.body);
      } catch {
        res.fail(new HttpError(400, 'Requisição inválida'));
      }
    }

    if (!res.finished) {
      const match = find(method, parsed.pathname);
      if (!match) {
        res.fail(new HttpError(404, 'Rota não encontrada'));
      } else {
        const req: Request = {
          method,
          path: parsed.pathname,
          params: match.params,
          query: Object.fromEntries(parsed.searchParams),
          body,
          headers: Object.fromEntries(new Headers(init?.headers).entries()),
        };
        try {
          await match.route.handler(req, res);
        } catch (err) {
          res.fail(err);
        }
      }
    }

    await res.settled;
    const noBody = res.statusCode === 204 || res.body === undefined;
    return new globalThis.Response(noBody ? null : JSON.stringify(res.body), {
      status: res.statusCode,
      headers: noBody ? res.headers : { 'content-type': 'application/json', ...res.headers },
    });
  }

  return {
    use: (prefix, router) => mounts.push({ prefix: prefix.replace(/\/$/, ''), router }),
    handle,
  };
}

export type { LocalResponse as Response };

const express = { Router };
export default express;
