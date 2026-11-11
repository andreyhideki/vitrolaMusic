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
}

export const platform: PlatformHooks = {};
