import { createContext, useCallback, useContext, useRef, useState } from 'react';

const ToastContext = createContext(null);

let seedId = 0;
const nextId = () => ++seedId;

const DEFAULT_DURATION = 3000;

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    const t = timers.current.get(id);
    if (t) { clearTimeout(t); timers.current.delete(id); }
    setItems(prev => prev.filter(x => x.id !== id));
  }, []);

  const push = useCallback((type, text, opts = {}) => {
    const id = nextId();
    const duration = opts.duration ?? DEFAULT_DURATION;
    setItems(prev => [...prev, { id, type, text }]);
    if (duration > 0) {
      const t = setTimeout(() => dismiss(id), duration);
      timers.current.set(id, t);
    }
    return id;
  }, [dismiss]);

  const api = {
    error: (msg, opts) => push('error', msg, opts),
    success: (msg, opts) => push('success', msg, opts),
    info: (msg, opts) => push('info', msg, opts),
    warn: (msg, opts) => push('warn', msg, opts),
    dismiss,
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastLayer items={items} onClose={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // 兜底：未在 Provider 下时退化为原生 alert + noop
    return {
      error: (m) => { try { alert(m); } catch {} },
      success: () => {},
      info: () => {},
      warn: (m) => { try { alert(m); } catch {} },
      dismiss: () => {},
    };
  }
  return ctx;
}

function ToastLayer({ items, onClose }) {
  if (items.length === 0) return null;
  return (
    <div className="toast-layer" aria-live="polite" aria-atomic="false">
      {items.map(it => (
        <div key={it.id} className={`toast-item toast-${it.type}`} onClick={() => onClose(it.id)}>
          <span className="toast-icon">{ICON[it.type] || '💬'}</span>
          <span className="toast-text">{it.text}</span>
        </div>
      ))}
    </div>
  );
}

const ICON = {
  error: '⚠️',
  success: '✅',
  info: 'ℹ️',
  warn: '⚡',
};
