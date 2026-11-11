/**
 * Saídas de áudio no APK. O `<audio>` do WebView segue a rota de mídia do Android, então
 * a troca é feita pelo seletor do sistema ("Tocar em"); o app lista as saídas e mostra a atual.
 */
import type { AudioOutputHooks } from '../../frontend/src/platform';
import { AudioOutput } from './native';

export const androidAudioOutput: AudioOutputHooks = {
  async list() {
    return (await AudioOutput.list()).outputs;
  },
  async openSystemPicker() {
    await AudioOutput.showSystemPicker();
  },
  async openBluetoothSettings() {
    await AudioOutput.openBluetoothSettings();
  },
  onChange(fn) {
    const handle = AudioOutput.addListener('outputsChanged', fn);
    return () => void handle.then((h) => h.remove());
  },
};
