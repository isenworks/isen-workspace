/* 颜色工具（全局唯一实现，勿在组件内重复定义）
 * hexToRgba：hex 或 CSS 变量色 → rgba 字符串
 *  - '#34C759' → 'rgba(52,199,89,0.08)'
 *  - '#F00'（3 位）→ 'rgba(255,0,0,0.08)'
 *  - 'var(--m-work)' → 'rgba(var(--m-work-rgb), 0.08)'（模块色变量透明底）
 *  - 非法输入 → 'rgba(0,122,255,a)' 兜底
 */
export function hexToRgba(hex, a = 0.08) {
  const s = String(hex || '');
  // CSS 变量：var(--m-xxx) → rgba(var(--m-xxx-rgb), a)（注意必须带 var() 包裹才能被子值解析）
  if (s.startsWith('var(')) {
    const inner = s.slice(4, -1); // --m-xxx
    return `rgba(var(${inner}-rgb), ${a})`;
  }
  let h = s.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) return `rgba(0,122,255,${a})`;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/* 分类 chip 描边色（dot 色同源 55% 透明） */
export const tintBorder = (dot) => hexToRgba(dot, 0.55);
