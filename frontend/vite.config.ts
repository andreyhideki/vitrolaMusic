/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Em Docker, API_TARGET aponta para o serviço "api". Localmente, usa localhost.
const apiTarget = process.env.API_TARGET ?? 'http://localhost:5172';

export default defineConfig({
  // URL_* também é exposto ao navegador (ex.: URL_BUY_ME_A_COFFEE). Nunca use esses prefixos para segredos.
  envPrefix: ['VITE_', 'URL_'],
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: [
        'logo-icon.png',
        'apple-touch-icon.png',
        'pwa-192x192.png',
        'pwa-512x512.png',
        'pwa-maskable-192x192.png',
        'pwa-maskable-512x512.png',
      ],
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.(?:png|jpg|jpeg|webp|svg)$/i,
            handler: 'CacheFirst',
            options: { cacheName: 'images' },
          },
        ],
      },
      devOptions: {
        enabled: true,
      },
    }),
  ],
  server: {
    host: true, // escuta em 0.0.0.0, necessário dentro do container
    port: 5173,
    proxy: { '/api': apiTarget },
  },
  test: { environment: 'node' },
});
