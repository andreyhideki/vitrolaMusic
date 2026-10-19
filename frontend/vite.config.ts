/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Em Docker, API_TARGET aponta para o serviço "api". Localmente, usa localhost.
const apiTarget = process.env.API_TARGET ?? 'http://localhost:3001';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // escuta em 0.0.0.0, necessário dentro do container
    port: 5173,
    proxy: { '/api': apiTarget },
  },
  test: { environment: 'node' },
});
