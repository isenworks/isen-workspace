/* ============================================================
 * P0-P3 重要紧急标签 · 日程/事项选择了紧急程度后的展示态
 *   P0 紧急且重要(红) / P1 重要不紧急(橙) / P2 紧急不重要(蓝) / P3 不重要不紧急(灰)
 *   实底填色 + 白字，沿用 iOS 原色，优先保证四个级别之间的辨识度
 * ============================================================ */
export const P_META = {
  0: { label: 'P0', color: '#FF3B30' },
  1: { label: 'P1', color: '#FF9500' },
  2: { label: 'P2', color: '#007AFF' },
  3: { label: 'P3', color: '#8E8E93' },
};

export default function PTag({ p, className = '' }) {
  // null/undefined/空串 = 未选择紧急程度，不渲染任何标签（Number(null)===0 会误命中 P0，须先挡）
  if (p == null || p === '') return null;
  const m = P_META[Number(p)];
  if (!m) return null;
  return (
    <span
      className={`inline-flex items-center justify-center px-1 rounded-[4px] text-[9px] font-extrabold leading-[14px] tabular-nums flex-shrink-0 select-none ${className}`}
      style={{ background: m.color, color: '#fff' }}
    >{m.label}</span>
  );
}
