import { create } from 'zustand';
import { platform, type CarState } from './platform';

const AUTO_KEY = 'vitrola.carModeAuto';
const ASKED_KEY = 'vitrola.carPermissionAsked';

interface CarModeState {
  /** Abrir o player de carro sozinho quando o Bluetooth do carro conectar (só no APK). */
  auto: boolean;
  /** Carro conectado agora (detectado pela plataforma). */
  connected: boolean;
  carName: string;
  permission: boolean;
  /** O player de carro está na tela. */
  open: boolean;
  setAuto: (auto: boolean) => Promise<void>;
  show: () => void;
  close: () => void;
}

function loadAuto(): boolean {
  try {
    return localStorage.getItem(AUTO_KEY) !== 'off';
  } catch {
    return true;
  }
}

export const useCarMode = create<CarModeState>((set, get) => ({
  auto: loadAuto(),
  connected: false,
  carName: '',
  permission: false,
  open: false,

  async setAuto(auto) {
    try {
      localStorage.setItem(AUTO_KEY, auto ? 'on' : 'off');
    } catch {
      // ignora erros de storage
    }
    set({ auto });
    if (auto && platform.car) apply(await platform.car.requestPermission());
    else if (!auto && get().connected) set({ open: false });
  },

  show: () => set({ open: true }),
  close: () => set({ open: false }),
}));

function apply(state: CarState) {
  const prev = useCarMode.getState();
  const patch: Partial<CarModeState> = { connected: state.connected, carName: state.name, permission: state.permission };
  // Conectou ao carro: abre o player grande. Desconectou: fecha (se foi aberto pelo carro ou não, tanto faz).
  if (state.connected && !prev.connected && prev.auto) patch.open = true;
  if (!state.connected && prev.connected) patch.open = false;
  useCarMode.setState(patch);
}

/** Liga a detecção do carro da plataforma (chamado uma vez pelo App). */
export function startCarDetection(): () => void {
  const car = platform.car;
  if (!car) return () => {};
  void car
    .getState()
    .then(async (state) => {
      apply(state);
      // Pede a permissão uma vez (Android 12+); depois o usuário liga/desliga nas Configurações.
      if (!state.permission && useCarMode.getState().auto && !localStorage.getItem(ASKED_KEY)) {
        localStorage.setItem(ASKED_KEY, '1');
        apply(await car.requestPermission());
      }
    })
    .catch(() => {});
  return car.onChange(apply);
}
