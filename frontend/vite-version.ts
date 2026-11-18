import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Versão do app, gravada no bundle (`import.meta.env.VITROLA_VERSION`) e servida em
 * `/version.json`. A tela de Configurações compara as duas para saber se o que está
 * rodando no navegador (que pode vir do cache do Service Worker) é o que o servidor
 * entrega hoje. Usado também pelo `mobile/vite.config.ts`.
 */
export interface AppVersion {
  version: string;
  commit: string;
  builtAt: string;
}

const here = path.dirname(fileURLToPath(import.meta.url));

function gitCommit(): string {
  // No container não há `.git`: o Makefile passa o commit em VITROLA_COMMIT.
  if (process.env.VITROLA_COMMIT) return process.env.VITROLA_COMMIT;
  try {
    const run = (cmd: string) => execSync(cmd, { cwd: here, stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim();
    const hash = run('git rev-parse --short HEAD');
    const dirty = run('git status --porcelain') !== '';
    return dirty ? `${hash}+alterações` : hash;
  } catch {
    return 'dev';
  }
}

/** Tipos mínimos (o arquivo também é usado pelo `mobile/`, que resolve o `vite` de outra pasta). */
interface Res {
  setHeader(name: string, value: string): void;
  end(body: string): void;
}
interface DevServer {
  middlewares: { use(path: string, fn: (req: unknown, res: Res) => void): void };
}
interface Emitter {
  emitFile(file: { type: 'asset'; fileName: string; source: string }): string;
}

export function appVersion() {
  const pkg = JSON.parse(readFileSync(path.join(here, 'package.json'), 'utf8')) as { version: string };
  const info: AppVersion = { version: pkg.version, commit: gitCommit(), builtAt: new Date().toISOString() };
  const body = JSON.stringify(info);
  return {
    name: 'vitrola-app-version',
    config: () => ({ define: { 'import.meta.env.VITROLA_VERSION': body } }),
    configureServer(server: DevServer) {
      server.middlewares.use('/version.json', (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(body);
      });
    },
    generateBundle(this: Emitter) {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: body });
    },
  };
}
