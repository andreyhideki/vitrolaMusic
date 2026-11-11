/**
 * Prepara o ambiente que `api/src` espera de um processo Node, antes de importá-la:
 *  - `process.env.DATA_DIR` / `IMPORT_DIR` (lidos por `api/src/config.ts`);
 *  - as pastas de dados, mídia e importação;
 *  - o SQLite (WASM) com o conteúdo do banco já carregado, para `new Database()` ser síncrono.
 */
import path from 'node:path';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { loadDatabaseEngine } from './server/persist';
import { mkdir } from './shims/fs-promises';

async function dirPath(directory: Directory, sub: string): Promise<string | null> {
  try {
    const { uri } = await Filesystem.getUri({ directory, path: sub });
    return decodeURIComponent(new URL(uri).pathname);
  } catch {
    return null;
  }
}

export interface Paths {
  dataDir: string;
  importDir: string;
}

export async function bootstrap(): Promise<Paths> {
  // Banco e músicas baixadas: pasta privada do app.
  const dataDir = (await dirPath(Directory.Data, 'vitrola')) ?? '/vitrola';
  // Pasta de importação ("Artista - Título.mp3"): armazenamento externo do app, acessível
  // pelo cabo USB em Android/data/app.vitrola.music/files/import.
  const importDir = (await dirPath(Directory.External, 'import')) ?? path.join(dataDir, 'import');

  const env: Record<string, string> = { DATA_DIR: dataDir, IMPORT_DIR: importDir };
  const g = globalThis as unknown as { process?: { env?: Record<string, string> } };
  if (g.process?.env) {
    Object.assign(g.process.env, env); // testes (Node): mantém o process real
  } else {
    g.process = { env, cwd: () => '/', platform: 'android' } as typeof g.process;
  }

  await Promise.all([mkdir(dataDir), mkdir(path.join(dataDir, 'media')), mkdir(importDir)]);
  await loadDatabaseEngine(path.join(dataDir, 'vitrola.db'));
  return { dataDir, importDir };
}
