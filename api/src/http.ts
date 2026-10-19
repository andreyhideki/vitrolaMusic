export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function parseId(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, 'Id inválido');
  return n;
}

export function requireString(value: unknown, field: string, max = 200): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new HttpError(400, `Campo "${field}" é obrigatório`);
  }
  return value.trim().slice(0, max);
}

export function idList(value: unknown, field: string): number[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 500) {
    throw new HttpError(400, `"${field}" deve ser uma lista de ids (1 a 500)`);
  }
  return value.map((v) => parseId(v));
}
