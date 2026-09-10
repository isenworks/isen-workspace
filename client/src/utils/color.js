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

/* ===== 模块色统一生成（六大模块 key：energy/cognition/ability/work/life/finance） =====
 * 全项目模块色相关 rgba(var(--m-xxx-rgb),α) 应由此生成，勿在手写——拼写错误防护 + 单一数据源
 *  - moduleColor('work')            → 'var(--m-work)'
 *  - moduleRgba('work', 0.08)      → 'rgba(var(--m-work-rgb),0.08)'
 *  - moduleTone('work')             → { color/bg/borderColor/doneColor/lineColor/timeColor } 样式组
 */
export const moduleColor = (moduleKey) => `var(--m-${moduleKey})`;
export const moduleRgba = (moduleKey, a = 0.08) => `rgba(var(--m-${moduleKey}-rgb),${a})`;
export function moduleTone(moduleKey, a = 0.08) {
  const color = moduleColor(moduleKey);
  return {
    color,
    bg: moduleRgba(moduleKey, a),
    borderColor: color,
    doneColor: color,
    lineColor: color,
    timeColor: color,
  };
}
