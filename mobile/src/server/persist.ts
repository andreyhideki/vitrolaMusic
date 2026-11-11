/**
 * Persistência do banco SQLite em memória (sql.js) num arquivo do app.
 *
 * `loadDatabaseEngine()` roda no bootstrap, antes de importar `api/src/db.ts`. Ele
 * carrega o WASM e o conteúdo do arquivo, para que `new Database(file)` possa ser
 * síncrono como no better-sqlite3. Depois de cada alteração, o banco é gravado
 * com debounce. A gravação é atômica (arquivo .tmp + rename).
 */
import initSqlJs, { type Database as SqlJsDatabase, type SqlJsStatic } from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { Filesystem } from '@capacitor/filesystem';
import { fileUri } from '../shims/paths';

const SAVE_DELAY_MS = 800;

let SQL: SqlJsStatic | null = null;
const initialBytes = new Map<string, Uint8Array>();

interface Open {
  db: SqlJsDatabase;
  onReopen: () => void;
  timer: ReturnType<typeof setTimeout> | null;
  saving: Promise<void> | null;
  dirty: boolean;
}
const open = new Map<string, Open>();

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
}

function fromBase64(data: string): Uint8Array {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function readBytes(file: string): Promise<Uint8Array | null> {
  try {
    const r = await Filesystem.readFile({ path: fileUri(file) });
    return typeof r.data === 'string' ? fromBase64(r.data) : new Uint8Array(await r.data.arrayBuffer());
  } catch {
    return null;
  }
}

/** Carrega o sql.js e o arquivo do banco (ou o .tmp, se uma gravação foi interrompida). */
export async function loadDatabaseEngine(file: string): Promise<void> {
  SQL ??= await initSqlJs({ locateFile: () => wasmUrl });
  const bytes = (await readBytes(file)) ?? (await readBytes(`${file}.tmp`));
  if (bytes) initialBytes.set(file, bytes);
}

export function openDatabase(file: string, onReopen: () => void): SqlJsDatabase {
  if (!SQL) throw new Error('Banco não inicializado: chame loadDatabaseEngine() no bootstrap');
  const db = new SQL.Database(initialBytes.get(file));
  initialBytes.delete(file);
  open.set(file, { db, onReopen, timer: null, saving: null, dirty: false });
  return db;
}

async function write(file: string, entry: Open): Promise<void> {
  entry.dirty = false;
  // export() fecha e reabre o banco: os PRAGMAs (foreign_keys) precisam ser reaplicados.
  const bytes = entry.db.export();
  entry.onReopen();
  const tmp = `${file}.tmp`;
  await Filesystem.writeFile({ path: fileUri(tmp), data: toBase64(bytes), recursive: true });
  await Filesystem.deleteFile({ path: fileUri(file) }).catch(() => {});
  await Filesystem.rename({ from: fileUri(tmp), to: fileUri(file) });
}

async function save(file: string): Promise<void> {
  const entry = open.get(file);
  if (!entry) return;
  if (entry.timer) {
    clearTimeout(entry.timer);
    entry.timer = null;
  }
  // Uma gravação por vez; alterações feitas durante a gravação geram outra em seguida.
  while (entry.saving) await entry.saving;
  if (!entry.dirty) return;
  entry.saving = write(file, entry)
    .catch((err) => {
      entry.dirty = true;
      console.error('Falha ao gravar o banco', err);
    })
    .finally(() => {
      entry.saving = null;
    });
  await entry.saving;
}

export function scheduleSave(file: string): void {
  const entry = open.get(file);
  if (!entry) return;
  entry.dirty = true;
  if (entry.timer) return;
  entry.timer = setTimeout(() => {
    entry.timer = null;
    void save(file);
  }, SAVE_DELAY_MS);
}

/** Grava imediatamente o que estiver pendente (ex.: quando o app vai para segundo plano). */
export async function flushAll(): Promise<void> {
  await Promise.all([...open.keys()].map(save));
}
