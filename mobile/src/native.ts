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
  setKeepAlive(options: { playing: boolean; downloading: boolean }): Promise<void>;
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
