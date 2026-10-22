import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

const ToastContext = createContext(null);

let seedId = 0;
const nextId = () => ++seedId;

/* 同时最多展示的提示条数，超出挤掉最旧的一条 */
const MAX_ITEMS = 3;
/* 默认存活时长（ms）：错误给更长时间以便读完，可被 opts.duration 覆盖，<=0 表示不自动消失 */
const DEFAULT_DURATION = { error: 6000, success: 2600, info: 2600, warn: 4000 };

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const timers = useRef(new Map());
  /* items 的镜像：push 去重/限流时需要同步读取当前列表，避免在 setState 更新函数里写副作用 */
  const itemsRef = useRef([]);

  const commit = useCallback((next) => {
    itemsRef.current = next;
    setItems(next);
  }, []);

  const dismiss = useCallback((id) => {
    const t = timers.current.get(id);
    if (t) { clearTimeout(t); timers.current.delete(id); }
    commit(itemsRef.current.filter(x => x.id !== id));
  }, [commit]);

  const push = useCallback((type, text, opts = {}) => {
    const duration = opts.duration ?? DEFAULT_DURATION[type] ?? 3000;

    // 同类型同文案去重：刷新存活时间，不再叠加一条
    const dup = itemsRef.current.find(x => x.type === type && x.text === text);
    if (dup) {
      const t0 = timers.current.get(dup.id);
      if (t0) { clearTimeout(t0); timers.current.delete(dup.id); }
      if (duration > 0) timers.current.set(dup.id, setTimeout(() => dismiss(dup.id), duration));
      return dup.id;
    }

    const id = nextId();
    const next = [...itemsRef.current, { id, type, text }];
    while (next.length > MAX_ITEMS) {
      const dropped = next.shift();
      const td = timers.current.get(dropped.id);
      if (td) { clearTimeout(td); timers.current.delete(dropped.id); }
    }
    commit(next);
    if (duration > 0) {
      timers.current.set(id, setTimeout(() => dismiss(id), duration));
    }
    return id;
  }, [commit, dismiss]);

  /* api 必须 memo：toast 弹出/消失会让 Provider 重渲染，若每次生成新对象，
     所有依赖 toast 的 useCallback/effect（如 loadLogs）都会重建并重新触发，
     造成「操作成功后列表莫名重载一两次」的闪烁（2026-10 换盆记录踩坑修复） */
  const api = useMemo(() => ({
    error: (msg, opts) => push('error', msg, opts),
    success: (msg, opts) => push('success', msg, opts),
    info: (msg, opts) => push('info', msg, opts),
    warn: (msg, opts) => push('warn', msg, opts),
    dismiss,
  }), [push, dismiss]);

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
        <div
          key={it.id}
          className={`toast-item toast-${it.type}`}
          role={it.type === 'error' ? 'alert' : 'status'}
        >
          <span className="toast-icon" aria-hidden="true">{ICON[it.type] || '💬'}</span>
          <span className="toast-text">{it.text}</span>
          <button
            type="button"
            className="toast-close"
            aria-label="关闭提示"
            onClick={() => onClose(it.id)}
          >✕</button>
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