import { useEffect, useRef, useState } from 'react';
import { api, AppSettings, errorMessage, send } from '../api';

interface Props {
  open: boolean;
  onClose: () => void;
}

const QUALITY_OPTIONS: { value: AppSettings['audioQuality']; label: string }[] = [
  { value: 'low', label: 'Baixa' },
  { value: 'medium', label: 'Média' },
  { value: 'high', label: 'Alta' },
];

const CLEANUP_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: 'Não limpar' },
  { value: 180, label: '180 dias' },
];

export function SettingsModal({ open, onClose }: Props) {
  const [settings, setSettings] = useState<AppSettings>({
    audioQuality: 'medium',
    mediaDir: '',
    streamWithoutDownload: false,
    cleanupUnusedAfterDays: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const folderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setError('');
    setSaved(false);
    api<AppSettings>('/settings')
      .then(setSettings)
      .catch((e) => setError(errorMessage(e)));
  }, [open]);

  if (!open) return null;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const s = await send<AppSettings>('POST', '/settings', settings);
      setSettings(s);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  function handleFolderSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const relative = files[0].webkitRelativePath;
    const folderName = relative.split('/')[0];
    if (folderName) {
      setSettings((prev) => ({ ...prev, mediaDir: folderName }));
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Configurações</h2>
        <form onSubmit={save}>
          <div className="form-group">
            <label>Qualidade do áudio baixado</label>
            <div className="option-group">
              {QUALITY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`option ${settings.audioQuality === opt.value ? 'active' : ''}`}
                  onClick={() => setSettings({ ...settings, audioQuality: opt.value })}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="toggle">
              <input
                type="checkbox"
                checked={settings.streamWithoutDownload}
                onChange={(e) => setSettings({ ...settings, streamWithoutDownload: e.target.checked })}
              />
              <span>Tocar via streaming externo sem baixar</span>
            </label>
            <p className="hint">Quando ativo, o player toca diretamente da fonte externa se o arquivo ainda não estiver baixado.</p>
          </div>

          <div className="form-group">
            <label>Limpar faixas não tocadas após</label>
            <select
              value={settings.cleanupUnusedAfterDays}
              onChange={(e) =>
                setSettings({ ...settings, cleanupUnusedAfterDays: Number(e.target.value) })
              }
            >
              {CLEANUP_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="hint">Faixas baixadas que não forem reproduzidas nesse prazo serão removidas automaticamente.</p>
          </div>

          <div className="form-group">
            <label>Pasta dos arquivos MP3</label>
            <div className="folder-input">
              <input
                type="text"
                value={settings.mediaDir}
                onChange={(e) => setSettings({ ...settings, mediaDir: e.target.value })}
                placeholder="Padrão: data/media"
              />
              <button
                type="button"
                onClick={() => folderInputRef.current?.click()}
              >
                Selecionar pasta
              </button>
              <input
                ref={folderInputRef}
                type="file"
                {...{ webkitdirectory: 'true', directory: 'true' }}
                style={{ display: 'none' }}
                onChange={handleFolderSelect}
              />
            </div>
          </div>

          {error && <p className="error">{error}</p>}
          {saved && <p className="success">Salvo!</p>}

          <div className="modal-actions">
            <button type="button" onClick={onClose}>Fechar</button>
            <button type="submit" className="primary" disabled={loading}>
              {loading ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
