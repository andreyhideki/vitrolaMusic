import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { config } from './config.js';
import { HttpError } from './http.js';

/**
 * Autenticação por token único (app pessoal, sem usuários).
 *
 * - O token vem de AUTH_TOKEN ou é gerado na 1ª execução em DATA_DIR/auth-token.txt (0600).
 * - O login troca o token por um cookie HttpOnly (SameSite=Strict) cujo valor é um
 *   HMAC do token: trocar o token invalida todas as sessões.
 * - Scripts podem usar `Authorization: Bearer <token>`.
 */

const TOKEN_FILE = path.join(config.dataDir, 'auth-token.txt');
const COOKIE_NAME = 'vitrola_session';
const COOKIE_MAX_AGE_S = 365 * 24 * 60 * 60;
/** Sem caracteres ambíguos (0/O, 1/I/L), fácil de digitar no celular. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateToken(): string {
  const chars: string[] = [];
  for (let i = 0; i < 20; i++) chars.push(ALPHABET[crypto.randomInt(ALPHABET.length)]);
  return chars.join('').match(/.{5}/g)!.join('-');
}

/** Normaliza o que o usuário digitou: ignora hífens/espaços e caixa. */
function normalize(token: string): string {
  return token.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function loadToken(): string {
  const fromEnv = process.env.AUTH_TOKEN?.trim();
  if (fromEnv) {
    if (normalize(fromEnv).length < 16) throw new Error('AUTH_TOKEN deve ter pelo menos 16 letras/números');
    return fromEnv;
  }
  try {
    const saved = fs.readFileSync(TOKEN_FILE, 'utf-8').trim();
    if (saved) return saved;
  } catch {
    // ainda não existe
  }
  const token = generateToken();
  fs.writeFileSync(TOKEN_FILE, `${token}\n`, { encoding: 'utf-8', mode: 0o600 });
  console.log(`Token de acesso gerado em ${TOKEN_FILE}. Veja com: make token`);
  return token;
}

/** AUTH_DISABLED=true desliga a autenticação (só para testes locais). */
export const authDisabled = /^(1|true|yes|on)$/i.test(process.env.AUTH_DISABLED?.trim() ?? '');
if (authDisabled) {
  console.warn(
    '⚠️  AUTENTICAÇÃO DESATIVADA (AUTH_DISABLED=true). Qualquer pessoa que alcance o app tem acesso total. ' +
      'Use só para testes e nunca com VITROLA_BIND=0.0.0.0.',
  );
}

const token = loadToken();
const tokenKey = normalize(token);
const sessionValue = crypto.createHmac('sha256', tokenKey).update('vitrola-session-v1').digest('base64url');

function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

function isAuthenticated(req: Request): boolean {
  if (authDisabled) return true;
  const cookie = readCookie(req, COOKIE_NAME);
  if (cookie && safeEqual(cookie, sessionValue)) return true;
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return safeEqual(normalize(auth.slice(7)), tokenKey);
  return false;
}

function setSessionCookie(req: Request, res: Response, value: string, maxAge: number): void {
  const parts = [`${COOKIE_NAME}=${value}`, 'Path=/api', 'HttpOnly', 'SameSite=Strict', `Max-Age=${maxAge}`];
  if (req.secure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

// Limite global de tentativas erradas. É global (e não por IP) porque, atrás do
// proxy do Vite, todas as requisições chegam do mesmo IP.
const FAIL_WINDOW_MS = 60_000;
const MAX_FAILS_PER_WINDOW = 10;
let failures: number[] = [];

function tooManyFailures(): boolean {
  const now = Date.now();
  failures = failures.filter((t) => now - t < FAIL_WINDOW_MS);
  return failures.length >= MAX_FAILS_PER_WINDOW;
}

export const authRouter = Router();

authRouter.get('/status', (req, res) => {
  res.json({ authenticated: isAuthenticated(req), disabled: authDisabled });
});

authRouter.post('/login', (req, res) => {
  if (tooManyFailures()) throw new HttpError(429, 'Muitas tentativas. Aguarde um minuto.');
  const given = typeof req.body?.token === 'string' ? normalize(req.body.token) : '';
  if (!given || !safeEqual(given, tokenKey)) {
    failures.push(Date.now());
    throw new HttpError(401, 'Token inválido');
  }
  setSessionCookie(req, res, sessionValue, COOKIE_MAX_AGE_S);
  res.json({ authenticated: true });
});

authRouter.post('/logout', (req, res) => {
  setSessionCookie(req, res, '', 0);
  res.json({ authenticated: false });
});

/** Rotas públicas: health e o próprio fluxo de login. */
const PUBLIC_PATHS = new Set(['/api/health', '/api/auth/status', '/api/auth/login', '/api/auth/logout']);

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (req.method === 'OPTIONS' || PUBLIC_PATHS.has(req.path)) return next();
  if (isAuthenticated(req)) return next();
  next(new HttpError(401, 'Não autenticado'));
}
