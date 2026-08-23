import { useEffect } from 'react';

export default function Modal({ open, onClose, title, children, footer, maxWidth }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* 遮罩层 */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        style={{ background: 'rgba(0,0,0,0.4)' }}
        onClick={onClose}
      />

      {/* 模态内容 */}
      <div
        className="relative w-full max-h-[90vh] flex flex-col"
        style={{
          maxWidth: maxWidth || 480,
          background: 'rgba(255,255,255,0.88)',
          backdropFilter: 'saturate(180%) blur(24px)',
          WebkitBackdropFilter: 'saturate(180%) blur(24px)',
          border: '1px solid rgba(255,255,255,0.6)',
          borderRadius: '18px',
          boxShadow: '0 0 0 1px rgba(0,0,0,0.06), 0 24px 64px rgba(0,0,0,0.18)',
        }}
      >
        {/* 标题栏 */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid rgba(60,60,67,0.1)' }}
        >
          <h3 className="text-[17px] font-semibold text-[#1c1c1e] tracking-tight">{title}</h3>
          <button
            onClick={onClose}
            className="text-[#8e8e93] hover:text-[#1c1c1e] text-2xl leading-none flex items-center justify-center w-7 h-7 rounded-full hover:bg-black/5 transition"
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
