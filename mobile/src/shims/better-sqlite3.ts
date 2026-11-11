/**
 * Adaptador de `better-sqlite3` sobre o sql.js (SQLite compilado para WASM).
 *
 * O better-sqlite3 é síncrono, e o sql.js também. Por isso `api/src/db.ts`,
 * `repo.ts` e `settings.ts` rodam sem alterações. O banco fica em memória e é gravado
 * no arquivo do app (`persist.ts`) logo depois de cada alteração.
 *
 * Só implementa a parte da API que o projeto usa: prepare().get/all/run, exec,
 * pragma e transaction.
 */
import type { Database as SqlJsDatabase, SqlValue } from 'sql.js';
import { openDatabase, scheduleSave } from '../server/persist';

type Param = SqlValue | boolean | undefined;

function bindable(params: Param[]): SqlValue[] {
  return params.map((p) => (p === undefined ? null : typeof p === 'boolean' ? (p ? 1 : 0) : p));
}

/** Comandos que não alteram dados e por isso não precisam ser gravados. */
const READ_ONLY = /^\s*(SELECT|PRAGMA)\b/i;

class Statement {
  constructor(private readonly owner: Database, private readonly sql: string) {}

  /** Cada execução prepara e libera o statement: o `export()` do sql.js invalida statements abertos. */
  private execute<T>(params: Param[], fn: (stmt: ReturnType<SqlJsDatabase['prepare']>) => T): T {
    const stmt = this.owner.raw.prepare(this.sql);
    try {
      stmt.bind(bindable(params));
      return fn(stmt);
    } finally {
      stmt.free();
      if (!READ_ONLY.test(this.sql)) this.owner.changed();
    }
  }

  get(...params: Param[]): Record<string, SqlValue> | undefined {
    return this.execute(params, (stmt) => (stmt.step() ? stmt.getAsObject() : undefined));
  }

  all(...params: Param[]): Record<string, SqlValue>[] {
    return this.execute(params, (stmt) => {
      const rows: Record<string, SqlValue>[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      return rows;
    });
  }

  run(...params: Param[]): { changes: number; lastInsertRowid: number } {
    return this.execute(params, (stmt) => {
      while (stmt.step()) {
        // consome eventuais linhas de RETURNING
      }
      const changes = this.owner.raw.getRowsModified();
      const last = this.owner.raw.exec('SELECT last_insert_rowid() AS id')[0]?.values[0]?.[0];
      return { changes, lastInsertRowid: Number(last ?? 0) };
    });
  }
}

export default class Database {
  readonly raw: SqlJsDatabase;
  private readonly pragmas: string[] = [];
  private inTransaction = false;

  constructor(readonly file: string) {
    this.raw = openDatabase(file, () => this.reapplyPragmas());
  }

  prepare(sql: string): Statement {
    return new Statement(this, sql);
  }

  exec(sql: string): this {
    this.raw.exec(sql);
    this.changed();
    return this;
  }

  /** `journal_mode` não se aplica a banco em memória; os demais (foreign_keys) são reaplicados após cada gravação. */
  pragma(source: string): unknown {
    if (/^\s*journal_mode/i.test(source)) return 'memory';
    this.pragmas.push(source);
    return this.raw.exec(`PRAGMA ${source}`)[0]?.values ?? [];
  }

  transaction<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
    return (...args: A) => {
      if (this.inTransaction) return fn(...args);
      this.raw.exec('BEGIN');
      this.inTransaction = true;
      try {
        const result = fn(...args);
        this.raw.exec('COMMIT');
        return result;
      } catch (err) {
        this.raw.exec('ROLLBACK');
        throw err;
      } finally {
        this.inTransaction = false;
        this.changed();
      }
    };
  }

  /** Marca o banco como alterado; a gravação acontece fora de transações. */
  changed(): void {
    if (!this.inTransaction) scheduleSave(this.file);
  }

  private reapplyPragmas(): void {
    for (const p of this.pragmas) this.raw.exec(`PRAGMA ${p}`);
  }
}
