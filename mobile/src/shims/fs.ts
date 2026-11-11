/**
 * Adaptador de `node:fs` (API síncrona). O Filesystem do Capacitor só é assíncrono,
 * então aqui ficam apenas as chamadas que `api/src` usa e que podem virar
 * "dispara e segue". Módulos que dependem de leitura síncrona de arquivos
 * (services/cleanup.ts) têm versão própria em `src/server/`.
 */
import { mkdir } from './fs-promises';

/** As pastas principais já são criadas no bootstrap; aqui só garante subpastas novas. */
export function mkdirSync(path: string, _opts?: unknown): void {
  void mkdir(path, { recursive: true });
}

/** Sem efeito no Android: a pasta do app já é privada. */
export function chmodSync(_path: string, _mode: number): void {}

function unsupported(name: string): never {
  throw new Error(`fs.${name} não está disponível no app Android`);
}

export function createReadStream(): never {
  return unsupported('createReadStream');
}
export function statSync(): never {
  return unsupported('statSync');
}
export function readdirSync(): never {
  return unsupported('readdirSync');
}
export function rmSync(): never {
  return unsupported('rmSync');
}

export type Dirent = { name: string; isFile(): boolean; isDirectory(): boolean };

const fs = { mkdirSync, chmodSync, createReadStream, statSync, readdirSync, rmSync };
export default fs;
