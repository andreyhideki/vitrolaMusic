/**
 * Pontos de extensão para outras plataformas (ex.: o APK em `mobile/`).
 * No navegador nada é configurado e o app usa os endpoints HTTP da API.
 */
export interface PlatformHooks {
  /**
   * Converte a URL de áudio de uma faixa (`/api/tracks/:id/stream` ou `/stream-url`)
   * em outra URL. O `<audio>` não passa pelo `fetch`, então quem roda a API localmente
   * (sem servidor HTTP) precisa trocar a URL por um arquivo local ou um stream direto.
   */
  resolveStreamUrl?: (trackId: string, apiUrl: string) => string | Promise<string>;
  /** Saídas de áudio do aparelho. Sem isto, o player usa a versão do navegador (`player/audioOutput.ts`). */
  audioOutput?: AudioOutputHooks;
}

export type AudioOutputKind = 'speaker' | 'wired' | 'bluetooth' | 'usb' | 'hdmi' | 'other';

export interface AudioOutputDevice {
  id: string;
  name: string;
  kind: AudioOutputKind;
  /** É a saída que está tocando agora. */
  active: boolean;
}

export interface AudioOutputHooks {
  list(): Promise<AudioOutputDevice[]>;
  /** Troca a saída direto pelo app. Sem isto, tocar num dispositivo abre o seletor do sistema. */
  select?(id: string): Promise<void>;
  /** Abre o seletor de saída do sistema (Android: "Tocar em"). */
  openSystemPicker?(): Promise<void>;
  /** Abre as configurações de Bluetooth (parear caixas, fones, Alexa/Echo). */
  openBluetoothSettings?(): Promise<void>;
  /** Avisa quando um dispositivo conecta/desconecta. Devolve a função para cancelar. */
  onChange?(fn: () => void): () => void;
  /** Navegador sem permissão: os nomes dos dispositivos ficam ocultos até liberar. */
  needsPermission?(): Promise<boolean>;
  requestPermission?(): Promise<void>;
}

export const platform: PlatformHooks = {};
