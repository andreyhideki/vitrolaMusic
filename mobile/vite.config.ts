import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * Build do APK. Reaproveita o código existente sem copiá-lo:
 *  - a interface vem de `../frontend/src`;
 *  - a "API" vem de `../api/src` e roda dentro do WebView. Os módulos de Node que ela
 *    usa (better-sqlite3, express, node:fs, node:child_process...) são trocados abaixo
 *    por adaptadores em `src/shims/`, que usam SQLite WASM, o Filesystem do Capacitor
 *    e o plugin nativo (yt-dlp/ffmpeg).
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const shim = (name: string) => path.join(here, 'src/shims', name);
const apiSrc = path.resolve(here, '../api/src');
const frontendDir = path.resolve(here, '../frontend');
const require = createRequire(import.meta.url);

/**
 * Módulos de `api/src` que não dá para adaptar só trocando dependências (usam fs
 * síncrono) e por isso têm uma versão própria no mobile.
 */
const API_OVERRIDES: Record<string, string> = {
  [path.join(apiSrc, 'services/cleanup.ts')]: path.join(here, 'src/server/cleanup.ts'),
};

function apiOverrides(): Plugin {
  return {
    name: 'vitrola-api-overrides',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!importer?.startsWith(apiSrc)) return null;
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      const target = resolved && API_OVERRIDES[resolved.id];
      return target ?? null;
    },
  };
}

export default defineConfig(({ command }) => ({
  root: here,
  base: './',
  // Ícones e imagens são os mesmos do frontend.
  publicDir: path.join(frontendDir, 'public'),
  // Mesmas variáveis do frontend (ex.: URL_BUY_ME_A_COFFEE em frontend/.env).
  envDir: frontendDir,
  envPrefix: ['VITE_', 'URL_'],
  plugins: [apiOverrides(), react()],
  // No build o Vite troca `process.env` por `{}`, e `api/src/config.ts` perderia o
  // DATA_DIR/IMPORT_DIR que o bootstrap define em tempo de execução. Aqui ele passa a ler
  // o `process` criado pelo bootstrap. (Nos testes roda no Node, com o `process` real.)
  define: command === 'build' ? { 'process.env': '(globalThis.process?.env ?? {})' } : {},
  resolve: {
    alias: [
      { find: /^better-sqlite3$/, replacement: shim('better-sqlite3.ts') },
      { find: /^express$/, replacement: shim('express.ts') },
      { find: /^cors$/, replacement: shim('noop.ts') },
      { find: /^(node:)?fs\/promises$/, replacement: shim('fs-promises.ts') },
      { find: /^(node:)?fs$/, replacement: shim('fs.ts') },
      { find: /^(node:)?path$/, replacement: require.resolve('path-browserify') },
      { find: /^(node:)?child_process$/, replacement: shim('child_process.ts') },
      { find: /^(node:)?util$/, replacement: shim('util.ts') },
      { find: /^(node:)?stream(\/web)?$/, replacement: shim('stream.ts') },
      { find: /^virtual:pwa-register\/react$/, replacement: shim('pwa-register-react.ts') },
    ],
    // O código de ../frontend e ../api não tem node_modules no host (ficam nos volumes
    // do Docker): força as dependências a virem de mobile/node_modules, numa cópia só.
    dedupe: ['react', 'react-dom', 'zustand', '@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
  },
  server: {
    port: 5174,
    fs: { allow: [path.resolve(here, '..')] },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Top-level await no bootstrap (carregar o banco antes de importar a API).
    target: 'es2022',
  },
  test: { environment: 'node' },
}));
