/**
 * No APK a "API" roda dentro do próprio app: não há rede nem outros clientes, então
 * a autenticação fica desligada. Responde igual a `api/src/auth.ts` com
 * `AUTH_DISABLED=true`, e o frontend pula o login e esconde o botão "Sair".
 */
import { Router } from 'express';

export const authRouter = Router();

authRouter.get('/status', (_req, res) => {
  res.json({ authenticated: true, disabled: true });
});

authRouter.post('/login', (_req, res) => {
  res.status(204).end();
});

authRouter.post('/logout', (_req, res) => {
  res.status(204).end();
});
