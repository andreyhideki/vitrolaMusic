import { useNotice } from '../notice';

export function NoticeContainer() {
  const notices = useNotice((s) => s.notices);
  const dismiss = useNotice((s) => s.dismiss);

  if (notices.length === 0) return null;

  return (
    <div className="notice-stack" aria-live="polite">
      {notices.map((n) => (
        <div key={n.id} className={`notice notice-${n.type}`}>
          <span>{n.message}</span>
          <button onClick={() => dismiss(n.id)} aria-label="Fechar">
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
