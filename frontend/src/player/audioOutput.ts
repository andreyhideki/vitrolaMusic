import type { AudioOutputDevice, AudioOutputHooks, AudioOutputKind } from '../platform';
import { playerControls } from './usePlayerAudio';

/**
 * Escolha da saída de áudio no navegador do computador (`HTMLMediaElement.setSinkId`,
 * Chrome/Edge/Firefox). Só existe em contexto seguro (localhost/HTTPS): acessando pelo IP
 * da rede o navegador esconde `navigator.mediaDevices`, e o botão some.
 *
 * Alexa/Echo não recebe transmissão de outros apps: funciona pareando o Echo por
 * Bluetooth com o computador, e aí ele aparece aqui como mais uma saída.
 */
const STORAGE_KEY = 'vitrola.audioOutput';

type SelectAudioOutput = () => Promise<MediaDeviceInfo>;

function guessKind(label: string): AudioOutputKind {
  if (/bluetooth|airpods|buds|echo|alexa|jbl|bose|sony wh|wf-/i.test(label)) return 'bluetooth';
  if (/hdmi|display|monitor|\btv\b|nvidia high definition/i.test(label)) return 'hdmi';
  if (/usb/i.test(label)) return 'usb';
  if (/fone|headphone|headset|earphone/i.test(label)) return 'wired';
  return 'speaker';
}

function supported(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    typeof HTMLMediaElement.prototype.setSinkId === 'function' &&
    !!navigator.mediaDevices?.enumerateDevices &&
    // No Chrome do Android a rota é do sistema; o APK tem a versão nativa.
    !/Android/i.test(navigator.userAgent)
  );
}

let hooks: AudioOutputHooks | null | undefined;

/** Hooks do navegador, ou `null` quando o navegador não deixa escolher a saída. */
export function browserAudioOutput(): AudioOutputHooks | null {
  if (hooks !== undefined) return hooks;
  if (!supported()) return (hooks = null);

  let current = localStorage.getItem(STORAGE_KEY) ?? '';
  if (current) {
    // A saída salva pode ter sido desconectada: volta para a padrão.
    playerControls.setOutputDevice(current).catch(() => {
      current = '';
      localStorage.removeItem(STORAGE_KEY);
      void playerControls.setOutputDevice('').catch(() => undefined);
    });
  }

  const outputs = async () =>
    (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audiooutput' && d.deviceId !== 'communications');

  const select = async (id: string) => {
    const deviceId = id === 'default' ? '' : id;
    await playerControls.setOutputDevice(deviceId);
    current = deviceId;
    if (deviceId) localStorage.setItem(STORAGE_KEY, deviceId);
    else localStorage.removeItem(STORAGE_KEY);
  };

  const selectAudioOutput = (navigator.mediaDevices as MediaDevices & { selectAudioOutput?: SelectAudioOutput }).selectAudioOutput;

  hooks = {
    async list(): Promise<AudioOutputDevice[]> {
      const devices = await outputs();
      const activeId = current || 'default';
      const hasDefault = devices.some((d) => d.deviceId === 'default');
      return devices.map((d, i) => {
        const name = d.label || (d.deviceId === 'default' || !d.deviceId ? 'Saída padrão do sistema' : `Saída ${i + 1}`);
        return {
          id: d.deviceId || 'default',
          name,
          kind: guessKind(name),
          active: d.deviceId === activeId || (!hasDefault && !current && i === 0),
        };
      });
    },
    select,
    // Firefox: o próprio navegador mostra a lista de saídas.
    openSystemPicker: selectAudioOutput
      ? async () => {
          const device = await selectAudioOutput.call(navigator.mediaDevices);
          await select(device.deviceId);
        }
      : undefined,
    onChange(fn) {
      navigator.mediaDevices.addEventListener('devicechange', fn);
      return () => navigator.mediaDevices.removeEventListener('devicechange', fn);
    },
    async needsPermission() {
      return (await outputs()).some((d) => !d.label);
    },
    // Chrome/Edge só mostram os nomes das saídas depois da permissão do microfone.
    // O microfone é fechado na hora: nada é gravado.
    async requestPermission() {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
    },
  };
  return hooks;
}
