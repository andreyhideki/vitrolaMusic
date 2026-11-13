/**
 * Entrada do APK. Ordem importa:
 *  1. bootstrap: pastas, process.env e banco carregado;
 *  2. a API local (`api/src`, via `src/server`), que abre o banco ao ser importada;
 *  3. a interface de `frontend/src`, sem alterações: o APK só preenche os hooks de `platform`
 *     (URL do áudio e saídas de áudio).
 */
import { createRoot } from 'react-dom/client';
import { App as CapApp } from '@capacitor/app';
import { handleBack } from '../../frontend/src/backButton';
import '../../frontend/src/styles.css';
import { bootstrap } from './bootstrap';
import { startKeepAlive } from './keepAlive';
import { flushAll } from './server/persist';
import { platform } from '../../frontend/src/platform';
import { androidAudioOutput } from './audioOutput';
import { androidCar, startMediaSession } from './mediaSession';
import { detectMediaRangeMode } from './shims/paths';

const root = createRoot(document.getElementById('root')!);

async function start(): Promise<void> {
  await bootstrap();

  const server = await import('./server');
  server.installLocalFetch();
  platform.resolveStreamUrl = server.resolveStreamUrl;
  // Antes de tocar qualquer faixa: define como o servidor nativo responde ao Range (seek).
  await detectMediaRangeMode();
  platform.audioOutput = androidAudioOutput;
  platform.car = androidCar;

  // Grava o banco antes de o Android poder encerrar o app.
  void CapApp.addListener('pause', () => void flushAll());
  // Botão/gesto "voltar" do Android: fecha o que está aberto ou volta uma tela no app.
  // Na primeira tela, minimiza em vez de fechar (a música continua tocando).
  void CapApp.addListener('backButton', () => {
    if (!handleBack()) void CapApp.minimizeApp();
  });

  const { App } = await import('../../frontend/src/App');
  root.render(<App />);

  server.startBackgroundTasks();
  startKeepAlive(server.pendingDownloads);
  startMediaSession();
}

start().catch((err) => {
  console.error('Falha ao iniciar o Vitrola', err);
  root.render(
    <div style={{ padding: 24, color: '#fff', fontFamily: 'sans-serif' }}>
      <h2>Não foi possível iniciar o Vitrola</h2>
      <pre style={{ whiteSpace: 'pre-wrap' }}>{err instanceof Error ? err.message : String(err)}</pre>
    </div>,
  );
});
