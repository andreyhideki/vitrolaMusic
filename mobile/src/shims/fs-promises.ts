/**
 * Adaptador de `node:fs/promises` sobre o Filesystem do Capacitor, só com o que
 * `api/src` usa. Caminhos são absolutos (dentro da pasta do app).
 */
import { Encoding, Filesystem } from '@capacitor/filesystem';
import { fileUri } from './paths';

function notFound(path: string, cause?: unknown): Error {
  const err = new Error(`ENOENT: arquivo não encontrado, ${path}`) as Error & { code: string; cause?: unknown };
  err.code = 'ENOENT';
  err.cause = cause;
  return err;
}

export interface DirentLike {
  name: string;
  isFile(): boolean;
  isDirectory(): boolean;
}

export async function access(path: string): Promise<void> {
  try {
    await Filesystem.stat({ path: fileUri(path) });
  } catch (e) {
    throw notFound(path, e);
  }
}

export async function stat(path: string): Promise<{ size: number; mtimeMs: number; isFile(): boolean; isDirectory(): boolean }> {
  try {
    const s = await Filesystem.stat({ path: fileUri(path) });
    return {
      size: s.size,
      mtimeMs: Number(s.mtime) || 0,
      isFile: () => s.type === 'file',
      isDirectory: () => s.type === 'directory',
    };
  } catch (e) {
    throw notFound(path, e);
  }
}

export async function readdir(path: string, _opts?: { withFileTypes?: boolean }): Promise<DirentLike[]> {
  try {
    const { files } = await Filesystem.readdir({ path: fileUri(path) });
    return files.map((f) => ({
      name: f.name,
      isFile: () => f.type === 'file',
      isDirectory: () => f.type === 'directory',
    }));
  } catch (e) {
    throw notFound(path, e);
  }
}

/** Lista arquivos com tamanho (usado pelo cálculo de espaço em disco). */
export async function readdirWithSize(path: string): Promise<{ name: string; type: 'file' | 'directory'; size: number }[]> {
  const { files } = await Filesystem.readdir({ path: fileUri(path) });
  return files.map((f) => ({ name: f.name, type: f.type, size: f.size }));
}

/** Como no Node, sobrescreve o destino se ele já existir. */
export async function copyFile(src: string, dest: string): Promise<void> {
  if (src === dest) return;
  await Filesystem.deleteFile({ path: fileUri(dest) }).catch(() => {});
  await Filesystem.copy({ from: fileUri(src), to: fileUri(dest) });
}

export async function rename(src: string, dest: string): Promise<void> {
  await Filesystem.rename({ from: fileUri(src), to: fileUri(dest) });
}

export async function rm(path: string, opts?: { force?: boolean; recursive?: boolean }): Promise<void> {
  try {
    if (opts?.recursive) {
      const s = await Filesystem.stat({ path: fileUri(path) });
      if (s.type === 'directory') {
        await Filesystem.rmdir({ path: fileUri(path), recursive: true });
        return;
      }
    }
    await Filesystem.deleteFile({ path: fileUri(path) });
  } catch (e) {
    if (!opts?.force) throw notFound(path, e);
  }
}

export async function mkdir(path: string, _opts?: { recursive?: boolean }): Promise<void> {
  try {
    await Filesystem.mkdir({ path: fileUri(path), recursive: true });
  } catch {
    // já existe
  }
}

export async function writeFile(path: string, data: string, _opts?: unknown): Promise<void> {
  await Filesystem.writeFile({ path: fileUri(path), data, encoding: Encoding.UTF8, recursive: true });
}

export async function readFile(path: string, _opts?: unknown): Promise<string> {
  const r = await Filesystem.readFile({ path: fileUri(path), encoding: Encoding.UTF8 });
  return typeof r.data === 'string' ? r.data : await r.data.text();
}

/** No Android a pasta do app já é privada; permissões Unix não se aplicam. */
export async function chmod(_path: string, _mode: number): Promise<void> {}

const fsp = { access, stat, readdir, copyFile, rename, rm, mkdir, writeFile, readFile, chmod };
export default fsp;
