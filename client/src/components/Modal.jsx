import { useDialogA11y } from './useDialogA11y.js';

export default function Modal({ open, onClose, title, children, footer, maxWidth }) {
  // 焦点陷阱 + 锁背景滚动 + Esc 关闭（hook 内部按 open 生效，须在提前 return 之前调用）
  const dialogRef = useDialogA11y(open, { onClose });

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: 'var(--z-modal)' }}
    >
      {/* 遮罩层 */}
      <div
        className="absolute inset-0"
        style={{ background: 'var(--overlay)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
        onClick={onClose}
      />

      {/* 模态内容 */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        className="relative w-full max-h-[90vh] flex flex-col"
        style={{
          maxWidth: maxWidth || 480,
          background: 'var(--surface-modal)',
          backdropFilter: 'saturate(180%) blur(24px)',
          WebkitBackdropFilter: 'saturate(180%) blur(24px)',
          border: '1px solid var(--border-modal)',
          borderRadius: '18px',
          boxShadow: '0 0 0 1px rgba(0,0,0,0.06), 0 24px 64px rgba(0,0,0,0.18)',
          outline: 'none',
        }}
      >
        {/* 标题栏 */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid rgba(60,60,67,0.1)' }}
        >
          <h3 className="text-[17px] font-semibold text-[var(--text-1)] tracking-tight">{title}</h3>
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text-1)] text-2xl leading-none flex items-center justify-center w-9 h-9 -mr-1 shrink-0 rounded-full hover:bg-black/5 transition"
            aria-label="关闭"
          >×</button>
        </div>

        {/* 主体 */}
        <div className="px-6 py-4 overflow-y-auto flex-1">
          {children}
        </div>

        {/* 底部按钮栏（可覆盖） */}
        {footer && (
          <div
            className="px-6 py-3 flex justify-end gap-2"
            style={{ borderTop: '1px solid rgba(60,60,67,0.1)' }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}