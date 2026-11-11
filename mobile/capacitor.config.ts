import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.vitrola.music',
  appName: 'Vitrola Music',
  webDir: 'dist',
  android: {
    // Deixa o WebView continuar tocando quando o app vai para segundo plano.
    backgroundColor: '#121212',
  },
  plugins: {
    // fetch/XHR externos (catálogo Deezer) passam pela camada nativa: sem CORS.
    CapacitorHttp: { enabled: true },
  },
};

export default config;
