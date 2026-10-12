/* ============================================================
 * ConfirmAlert · 内联 iOS 风格二次确认浮层（供「已在 Modal 内」的表单/面板使用）
 *
 *   与 ConfirmDialog 的分工：
 *     · ConfirmDialog → 页面级二次确认（自带 Modal 容器 + Esc 关闭）
 *     · ConfirmAlert  → 弹窗/表单内的二次确认：不套 Modal、不接管 Esc，
 *       避免嵌套 Modal 时按 Esc 同时关闭「确认层 + 外层表单」两个弹窗。
 *
 *   视觉与 FocusPanel / AnnualPlan / ScheduleForm 现有内联确认浮层一致
 *   （fixed 遮罩 + 360px 白卡 + 取消/确认双按钮）。
 *
 *   用法：{confirmOpen && (
 *     <ConfirmAlert danger title="删除" message="确定删除？"
 *       confirmText="删除"
 *       onConfirm={...} onCancel={() => setConfirmOpen(false)} />
 *   )}
 * ============================================================ */
export default function ConfirmAlert({
  title = '确认', message, children,
  confirmText = '确定', cancelText = '取消',
  danger = false, onConfirm, onCancel,
}) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 80,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(28,28,30,0.40)',
        backdropFilter: 'blur(4px) saturate(180%)',
        WebkitBackdropFilter: 'blur(4px) saturate(180%)',
      }}
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
    >
      <div
        style={{
          width: 360, background: '#ffffff', borderRadius: '16px', overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.22), 0 4px 14px rgba(0,0,0,0.10)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: '20px 20px 18px', textAlign: 'center' }}>
          <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#1C1C1E', letterSpacing: '-0.01em', margin: 0 }}>
            {title}
          </h3>
          {(children || message) && (
            <p style={{
              whiteSpace: 'pre-line', marginTop: '6px', marginBottom: 0,
              fontSize: '13px', lineHeight: 1.55, color: '#8E8E93',
            }}>{children || message}</p>
          )}
        </div>
        <div style={{ display: 'flex', borderTop: '0.5px solid rgba(60,60,67,0.18)' }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              flex: 1, padding: '14px 0', fontSize: '15px', fontWeight: 600,
              color: 'var(--s-main)', background: 'transparent',
              border: 'none', borderRight: '0.5px solid rgba(60,60,67,0.18)',
              cursor: 'pointer', transition: 'background .15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.035)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >{cancelText}</button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              flex: 1, padding: '14px 0', fontSize: '15px',
              fontWeight: danger ? 700 : 600,
              color: danger ? '#FF3B30' : 'var(--s-main)',
              background: 'transparent', border: 'none', cursor: 'pointer',
              transition: 'background .15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = danger
                ? 'rgba(255,59,48,0.06)' : 'rgba(var(--s-rgb),0.06)';
            }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >{confirmText}</button>
        </div>
      </div>
    </div>
  );
}