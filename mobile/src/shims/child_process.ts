/**
 * Adaptador de `node:child_process` sobre o plugin nativo `Vitrola.exec`.
 * Permite reaproveitar `api/src/services/external.ts` (yt-dlp) e `audio-meta.ts`
 * (ffmpeg/ffprobe) sem alterações: os mesmos argumentos vão para os binários
 * empacotados no APK.
 */
import { Vitrola, type ExecResult, type NativeCommand } from '../native';

const SUPPORTED = new Set<NativeCommand>(['yt-dlp', 'ffmpeg', 'ffprobe']);

type Listener = (...args: any[]) => void;

/** EventEmitter mínimo (on/emit), suficiente para stdout/stderr/close/error. */
class Emitter {
  private listeners = new Map<string, Listener[]>();
  on(event: string, fn: Listener): this {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), fn]);
    return this;
  }
  once(event: string, fn: Listener): this {
    const wrap: Listener = (...args) => {
      this.off(event, wrap);
      fn(...args);
    };
    return this.on(event, wrap);
  }
  off(event: string, fn: Listener): this {
    this.listeners.set(event, (this.listeners.get(event) ?? []).filter((l) => l !== fn));
    return this;
  }
  emit(event: string, ...args: unknown[]): void {
    for (const fn of this.listeners.get(event) ?? []) fn(...args);
  }
}

/** Imita um Buffer de Node só no que o código usa (`toString()`). */
const chunk = (text: string) => ({ toString: () => text });

let seq = 0;
const nextId = () => `exec-${Date.now()}-${++seq}`;

/** Linhas de stdout de cada processo, entregues pelo plugin enquanto ele roda. */
const lineHandlers = new Map<string, (line: string) => void>();
let listening: Promise<unknown> | null = null;
function ensureListener(): Promise<unknown> {
  listening ??= Vitrola.addListener('execOutput', (e) => lineHandlers.get(e.id)?.(e.line));
  return listening;
}

function checkCommand(cmd: string): NativeCommand {
  if (!SUPPORTED.has(cmd as NativeCommand)) throw new Error(`Programa não disponível no Android: ${cmd}`);
  return cmd as NativeCommand;
}

async function run(cmd: string, args: string[], timeoutMs: number | undefined, id: string, onLine?: (line: string) => void): Promise<ExecResult> {
  const command = checkCommand(cmd);
  if (onLine) {
    await ensureListener();
    lineHandlers.set(id, onLine);
  }
  try {
    return await Vitrola.exec({ id, cmd: command, args, timeoutMs, streamOutput: !!onLine });
  } finally {
    lineHandlers.delete(id);
  }
}

class ChildProcess extends Emitter {
  readonly stdout = new Emitter();
  readonly stderr = new Emitter();
  private readonly id = nextId();

  constructor(cmd: string, args: string[], timeoutMs?: number) {
    super();
    run(cmd, args, timeoutMs, this.id, (line) => this.stdout.emit('data', chunk(line + '\n')))
      .then((r) => {
        if (r.stderr) this.stderr.emit('data', chunk(r.stderr));
        this.emit('close', r.exitCode);
      })
      .catch((err) => this.emit('error', err));
  }

  kill(): boolean {
    void Vitrola.kill({ id: this.id });
    return true;
  }
}

export function spawn(cmd: string, args: string[] = [], opts?: { timeout?: number }): ChildProcess {
  return new ChildProcess(cmd, args, opts?.timeout);
}

type ExecFileCallback = (err: Error | null, stdout: string, stderr: string) => void;

/** Erro no formato do Node: `stdout`/`stderr` anexados, como o `execFile` faz. */
function execError(cmd: string, r: ExecResult): Error {
  const err = new Error(`Comando falhou: ${cmd} (código ${r.exitCode})\n${r.stderr}`) as Error & {
    code: number;
    stdout: string;
    stderr: string;
  };
  err.code = r.exitCode;
  err.stdout = r.stdout;
  err.stderr = r.stderr;
  return err;
}

async function execFilePromise(cmd: string, args: string[] = [], opts?: { timeout?: number }): Promise<{ stdout: string; stderr: string }> {
  const r = await run(cmd, args, opts?.timeout, nextId());
  if (r.exitCode !== 0) throw execError(cmd, r);
  return { stdout: r.stdout, stderr: r.stderr };
}

export function execFile(cmd: string, args?: string[] | ExecFileCallback, opts?: object | ExecFileCallback, cb?: ExecFileCallback): void {
  const callback = [args, opts, cb].find((a): a is ExecFileCallback => typeof a === 'function');
  const argList = Array.isArray(args) ? args : [];
  const options = typeof opts === 'object' ? (opts as { timeout?: number }) : undefined;
  execFilePromise(cmd, argList, options).then(
    (r) => callback?.(null, r.stdout, r.stderr),
    (err) => callback?.(err, err.stdout ?? '', err.stderr ?? ''),
  );
}
// `promisify(execFile)` devolve `{ stdout, stderr }`, como no Node.
(execFile as unknown as Record<symbol, unknown>)[Symbol.for('nodejs.util.promisify.custom')] = execFilePromise;

export default { spawn, execFile };
