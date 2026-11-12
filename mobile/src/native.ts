import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

/** Programas nativos empacotados no APK (via youtubedl-android). */
export type NativeCommand = 'yt-dlp' | 'ffmpeg' | 'ffprobe';

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface VitrolaPlugin {
  /**
   * Roda um programa nativo e espera terminar. Com `streamOutput`, cada linha do stdout
   * também chega pelo evento `execOutput` enquanto o programa roda (progresso do yt-dlp).
   */
  exec(options: { id: string; cmd: NativeCommand; args: string[]; timeoutMs?: number; streamOutput?: boolean }): Promise<ExecResult>;
  /** Interrompe um `exec` em andamento. */
  kill(options: { id: string }): Promise<void>;
  /** Liga/desliga o serviço em primeiro plano que mantém o app vivo com a tela apagada. */
  setKeepAlive(options: {
    playing: boolean;
    downloading: boolean;
    /** Posição na leva de downloads ("Baixando 2 de 100"). */
    downloadCurrent?: number;
    downloadTotal?: number;
  }): Promise<void>;
  /** Atualiza o yt-dlp (o YouTube muda com frequência). */
  updateYtDlp(): Promise<{ status: string; version: string }>;
  addListener(event: 'execOutput', fn: (e: { id: string; line: string }) => void): Promise<PluginListenerHandle>;
}

export const Vitrola = registerPlugin<VitrolaPlugin>('Vitrola');

/** Saídas de áudio do aparelho (`AudioOutputPlugin.java`). */
export interface AudioOutputPlugin {
  list(): Promise<{ outputs: { id: string; name: string; kind: 'speaker' | 'wired' | 'bluetooth' | 'usb' | 'hdmi' | 'other'; active: boolean }[] }>;
  /** Abre o seletor "Tocar em" do Android (ou o Bluetooth, se a ROM não tiver o seletor). */
  showSystemPicker(): Promise<{ shown: boolean }>;
  openBluetoothSettings(): Promise<{ shown: boolean }>;
  addListener(event: 'outputsChanged', fn: () => void): Promise<PluginListenerHandle>;
}

export const AudioOutput = registerPlugin<AudioOutputPlugin>('AudioOutput');

/** Sessão de mídia nativa e integração com o carro (`MediaPlugin.java`). */
export interface MediaPlugin {
  /** Estado do player para o carro (Bluetooth), a notificação e a tela de bloqueio. */
  update(options: {
    hasTrack: boolean;
    playing: boolean;
    title: string;
    artist: string;
    album: string;
    artworkUrl?: string;
    durationMs: number;
    positionMs: number;
  }): Promise<void>;
  getCarState(): Promise<{ connected: boolean; name: string; permission: boolean }>;
  requestCarPermission(): Promise<{ connected: boolean; name: string; permission: boolean }>;
  /** Botões do carro, do fone ou da notificação. */
  addListener(event: 'action', fn: (e: { action: 'play' | 'pause' | 'next' | 'previous' | 'seekTo'; positionMs: number }) => void): Promise<PluginListenerHandle>;
  /** O áudio ia sair pelo alto-falante: Bluetooth do carro desligou ou o fone saiu. */
  addListener(event: 'noisy', fn: () => void): Promise<PluginListenerHandle>;
  addListener(event: 'carChanged', fn: (e: { connected: boolean; name: string; permission: boolean }) => void): Promise<PluginListenerHandle>;
}

export const Media = registerPlugin<MediaPlugin>('Media');
