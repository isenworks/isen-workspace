import Modal from './Modal.jsx';

/* ============================================================
 * ConfirmDialog · 通用二次确认弹窗（替换原生 window.confirm）
 *   用法：<ConfirmDialog open={!!confirming} title="删除" message="确定删除？"
 *           confirmText="删除" danger onConfirm={...} onCancel={...} />
 *   · danger=true 时确认按钮为红色，否则为主题色
 *   · 支持 Enter 确认、Esc 取消（Modal 自带 Esc）
 * ============================================================ */
export default function ConfirmDialog({
  open, title = '确认', message, children,
  confirmText = '确定', cancelText = '取消',
  danger = false, onConfirm, onCancel,
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      maxWidth={400}
      footer={
        <>
          <button
            onClick={onCancel}
            className="px-4 py-1.5 rounded-lg text-[13px] font-medium text-ink-600 bg-ink-100 hover:bg-ink-200/70 transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-1.5 rounded-lg text-[13px] font-semibold text-white transition-all active:scale-[0.98] ${
              danger
                ? 'bg-[#FF3B30] hover:brightness-105 shadow-[0_2px_6px_rgba(255,59,48,0.25)]'
                : 'bg-[var(--s-main)] hover:brightness-105 shadow-[0_2px_6px_rgba(var(--s-rgb),0.25)]'
            }`}
          >
            {confirmText}
          </button>
        </>
      }
    >
      {children || <div className="text-[13.5px] leading-relaxed text-ink-600">{message}</div>}
    </Modal>
  );
}
