import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, AppSettings, errorMessage, send } from '../api';
import { useAuth } from '../auth';

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
  const authDisabled = useAuth((s) => s.disabled);
  const [settings, setSettings] = useState<AppSettings>({
    audioQuality: 'medium',
    mediaDir: '',
    streamWithoutDownload: false,
    cleanupUnusedAfterDays: 0,
    youtubeCookiesPath: '',
  });
  const [showCookiesHelp, setShowCookiesHelp] = useState(false);
  const [cookiesText, setCookiesText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const cookiesFileInputRef = useRef<HTMLInputElement>(null);

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
      // Só envia cookies quando o usuário colou/carregou algo: string vazia remove
      // os cookies no backend, e isso tem botão próprio (removeCookies).
      const { youtubeCookiesPath: _ignored, ...rest } = settings;
      const s = await send<AppSettings>('POST', '/settings', {
        ...rest,
        ...(cookiesText.trim() ? { youtubeCookiesContent: cookiesText } : {}),
      });
      setSettings(s);
      setCookiesText('');
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

  /** Carrega o conteúdo do cookies.txt exportado direto no campo de texto. */
  async function handleCookiesFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 1024 * 1024) {
      setError('Arquivo de cookies muito grande (máx. 1 MB)');
      return;
    }
    setError('');
    setCookiesText(await file.text());
  }

  async function removeCookies() {
    setLoading(true);
    setError('');
    try {
      const s = await send<AppSettings>('POST', '/settings', { youtubeCookiesContent: '' });
      setSettings(s);
      setCookiesText('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  const modal = (
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
                placeholder="Padrão: media (relativo à pasta data/)"
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

          <div className="form-group">
            <label>Cookies do YouTube (opcional)</label>
            <textarea
              rows={5}
              value={cookiesText}
              onChange={(e) => setCookiesText(e.target.value)}
              placeholder={"Passo a passo:\n" +
                "1) Faça login no YouTube no navegador.\n" +
                "2) Instale a extensão 'Get cookies.txt' e exporte os cookies de youtube.com.\n" +
                "3) Abra o arquivo .txt, copie todo o conteúdo e cole aqui.\n" +
                "O Vitrola salvará automaticamente o arquivo no container."}
            />
            <div className="folder-input">
              <button type="button" className="small" onClick={() => cookiesFileInputRef.current?.click()}>
                Carregar arquivo .txt
              </button>
              {settings.youtubeCookiesPath && (
                <button type="button" className="small danger" onClick={removeCookies} disabled={loading}>
                  Remover cookies
                </button>
              )}
              <input
                ref={cookiesFileInputRef}
                type="file"
                accept=".txt,text/plain"
                style={{ display: 'none' }}
                onChange={handleCookiesFileSelect}
              />
            </div>
            {settings.youtubeCookiesPath && cookiesText === '' && (
              <p className="success">Cookies configurados.</p>
            )}
            <p className="hint">
              Cole o conteúdo completo do arquivo de cookies exportado do navegador. O Vitrola salva
              automaticamente o arquivo no container e o utiliza nos downloads.
            </p>
            <button
              type="button"
              className="small"
              onClick={() => setShowCookiesHelp((v) => !v)}
            >
              {showCookiesHelp ? 'Ocultar instruções' : 'Como obter o arquivo de cookies'}
            </button>
            {showCookiesHelp && (
              <div className="hint-box">
                <ol>
                  <li>Abra o YouTube no navegador e faça login na conta desejada.</li>
                  <li>
                    Instale uma extensão de exportação de cookies. Recomendadas:
                    <ul>
                      <li>
                        <strong>Chrome/Edge:</strong> <em>Get cookies.txt</em> (ou <em>cookies.txt</em>).
                      </li>
                      <li>
                        <strong>Firefox:</strong> <em>cookies.txt</em>.
                      </li>
                    </ul>
                  </li>
                  <li>
                    Com a aba do YouTube aberta e logada, clique no ícone da extensão e escolha exportar
                    os cookies do domínio <code>youtube.com</code>.
                  </li>
                  <li>
                    Salve o arquivo como <code>youtube-cookies.txt</code>. O conteúdo deve conter linhas
                    começando com <code>youtube.com</code> e campos como <code>SID</code>, <code>SSID</code>,{' '}
                    <code>APISID</code>, <code>SAPISID</code> e <code>LOGIN_INFO</code>.
                  </li>
                  <li>
                    Abra o arquivo de texto exportado, selecione todo o conteúdo (<kbd>Ctrl+A</kbd> /{' '}
                    <kbd>Cmd+A</kbd>) e copie (<kbd>Ctrl+C</kbd> / <kbd>Cmd+C</kbd>).
                  </li>
                  <li>
                    Cole o conteúdo no campo <strong>Cookies do YouTube</strong> acima e clique em{' '}
                    <strong>Salvar</strong>. O Vitrola grava o arquivo automaticamente no container.
                  </li>
                </ol>
                <div className="warning-box">
                  <strong>Atenção:</strong> usar cookies de uma conta Google pode, em teoria, resultar em
                  advertências, limitações temporárias ou até bloqueio da conta pelo YouTube, especialmente
                  se houver muitos downloads automatizados. Use por sua conta e risco.
                </div>
              </div>
            )}
          </div>

          <div className="form-group">
            <label>Acesso</label>
            <p className="hint">
              Para usar no celular, defina <code>VITROLA_BIND=0.0.0.0</code> no arquivo <code>.env</code> da
              raiz, rode <code>make up</code> e abra <code>http://IP-deste-computador:5173</code>. O token é
              exibido com <code>make token</code>. No Android, permita <strong>Dispositivos próximos / Rede
              local</strong> nas permissões do navegador; sem isso aparece <code>ERR_TOO_MANY_RETRIES</code>.
            </p>
            {authDisabled ? (
              <p className="error">Autenticação desativada (AUTH_DISABLED=true). Use só para testes.</p>
            ) : (
              <button type="button" className="small danger" onClick={() => useAuth.getState().logout()}>
                Sair deste aparelho
              </button>
            )}
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

  return createPortal(modal, document.body);
}
