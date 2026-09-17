/* ============================================================
 * P0-P3 重要紧急标签 · 日程/事项选择了紧急程度后的展示态
 *   P0 紧急且重要(红) / P1 重要不紧急(橙) / P2 紧急不重要(蓝) / P3 不重要不紧急(灰)
 * ============================================================ */
const P_META = {
  0: { label: 'P0', color: '#FF3B30', bg: 'rgba(255,59,48,0.10)' },
  1: { label: 'P1', color: '#FF9500', bg: 'rgba(255,149,0,0.10)' },
  2: { label: 'P2', color: '#007AFF', bg: 'rgba(0,122,255,0.10)' },
  3: { label: 'P3', color: '#8E8E93', bg: 'rgba(142,142,147,0.12)' },
};

export default function PTag({ p, className = '' }) {
  const m = P_META[Number(p)];
  if (!m) return null;
  return (
    <span
      className={`inline-flex items-center justify-center px-1 rounded-[4px] text-[9px] font-extrabold leading-[14px] tabular-nums flex-shrink-0 select-none ${className}`}
      style={{ background: m.bg, color: m.color }}
    >{m.label}</span>
  );
}
