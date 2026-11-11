import { useCallback, useEffect, useRef, useState } from 'react';
import { platform, type AudioOutputDevice, type AudioOutputKind } from '../platform';
import { browserAudioOutput } from '../player/audioOutput';
import { useNotice } from '../notice';

const KIND_ICON: Record<AudioOutputKind, string> = {
  speaker: '🔈',
  wired: '🎧',
  bluetooth: 'ᛒ',
  usb: '⌁',
  hdmi: '📺',
  other: '🔈',
};

/** Ícone de "saída de áudio": caixa de som com um aparelho ao lado. */
function OutputIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="11" height="18" rx="2" />
      <circle cx="8.5" cy="14" r="3" />
      <line x1="8.5" y1="7" x2="8.51" y2="7" />
      <path d="M18 8a5 5 0 0 1 0 8" />
      <path d="M20.5 5.5a8.5 8.5 0 0 1 0 13" />
    </svg>
  );
}

/**
 * Botão "Tocar em" do player: lista as saídas de áudio (alto-falante, fone, Bluetooth,
 * Alexa/Echo pareado por Bluetooth...) e troca a saída. No APK a troca é feita pelo
 * seletor do Android; no navegador do computador, direto pelo app.
 */
export function AudioOutputButton() {
  const hooks = platform.audioOutput ?? browserAudioOutput();
  const [open, setOpen] = useState(false);
  const [devices, setDevices] = useState<AudioOutputDevice[]>([]);
  const [needsPermission, setNeedsPermission] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    if (!hooks) return;
    try {
      setDevices(await hooks.list());
      setNeedsPermission((await hooks.needsPermission?.()) ?? false);
    } catch {
      setDevices([]);
    }
  }, [hooks]);

  // Mantém a lista atualizada (o ícone fica verde fora do alto-falante do aparelho).
  useEffect(() => {
    void refresh();
    return hooks?.onChange?.(() => void refresh());
  }, [hooks, refresh]);

  useEffect(() => {
    if (!open) return;
    void refresh();
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, refresh]);

  if (!hooks) return null;

  const active = devices.find((d) => d.active);
  const external = !!active && active.kind !== 'speaker';

  const run = async (action: () => Promise<void>, closeAfter = true) => {
    try {
      await action();
      if (closeAfter) setOpen(false);
      await refresh();
    } catch (err) {
      useNotice.getState().show(`Não foi possível trocar a saída de áudio: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  };

  const choose = (d: AudioOutputDevice) => {
    if (d.active) return setOpen(false);
    if (hooks.select) return void run(() => hooks.select!(d.id));
    if (hooks.openSystemPicker) return void run(() => hooks.openSystemPicker!());
  };

  return (
    <div className="audio-output" ref={ref}>
      <button
        className={`icon ${external ? 'active' : ''}`}
        onClick={() => setOpen((v) => !v)}
        title={active ? `Tocando em: ${active.name}` : 'Saída de áudio'}
        aria-label="Saída de áudio"
        aria-expanded={open}
      >
        <OutputIcon />
      </button>
      {open && (
        <div className="audio-output-menu" role="menu">
          <div className="audio-output-title">Tocar em</div>
          {devices.length === 0 && <div className="muted audio-output-empty">Nenhuma saída encontrada.</div>}
          {devices.map((d) => (
            <button
              key={d.id}
              role="menuitemradio"
              aria-checked={d.active}
              className={`audio-output-item ${d.active ? 'is-active' : ''}`}
              onClick={() => choose(d)}
            >
              <span className="audio-output-kind" aria-hidden="true">{KIND_ICON[d.kind]}</span>
              <span className="audio-output-name">{d.name}</span>
              {d.active && <span aria-hidden="true">✓</span>}
            </button>
          ))}
          {needsPermission && hooks.requestPermission && (
            <button className="audio-output-action" onClick={() => void run(() => hooks.requestPermission!(), false)}>
              Mostrar todas as saídas…
            </button>
          )}
          {hooks.openSystemPicker && (
            <button className="audio-output-action" onClick={() => void run(() => hooks.openSystemPicker!())}>
              Escolher outra saída…
            </button>
          )}
          {hooks.openBluetoothSettings && (
            <button className="audio-output-action" onClick={() => void run(() => hooks.openBluetoothSettings!())}>
              Bluetooth (caixas, fones, Alexa)…
            </button>
          )}
          <p className="muted audio-output-hint">
            <strong>Alexa/Echo:</strong> diga "Alexa, parear Bluetooth" e conecte{' '}
            {platform.audioOutput ? 'este aparelho' : 'este computador'} ao Echo pelo Bluetooth. Depois ele aparece nesta lista.
          </p>
          {needsPermission && hooks.requestPermission && (
            <p className="muted audio-output-hint">
              O navegador só mostra os nomes das saídas depois de liberar o microfone. Ele é fechado na hora: nada é gravado.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
