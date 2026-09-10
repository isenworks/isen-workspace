import { moduleColor, moduleTone } from './color.js';

// 成长类型配置：精力(绿) / 知力(蓝) / 能力(金) — 跟随五大模块 CSS 变量（moduleTone 统一生成）
export const GROWTH_TYPES = {
  energy: { label: '精力型', ...moduleTone('energy') },
  mind:   { label: '知力型', ...moduleTone('cognition') },
  skill:  { label: '能力型', ...moduleTone('ability') },
};

// 仅用于习惯分类色选择器（圆圈色块） — 跟随五大模块 CSS 变量
export const GROWTH_TYPE_COLORS = {
  energy: moduleColor('energy'),
  mind:   moduleColor('cognition'),
  skill:  moduleColor('ability'),
};

// 事项分类颜色：紧急度 / 常规 / 习惯日程 — cat 1=工作 2=能力 4=习惯(精力) 5=生活 跟随模块色
// （cat 3=其他 为固定中性灰，不走模块变量）
export const CATEGORY_COLORS = {
  1: { ...moduleTone('work') },
  2: { ...moduleTone('ability') },
  3: { color: '#8e8e93', bg: '#e5e5ea', borderColor: '#8e8e93', doneColor: '#8e8e93', lineColor: '#8e8e93', timeColor: '#8e8e93' },
  4: { ...moduleTone('energy') },
  5: { ...moduleTone('life') },
};

// 通用标签、输入框样式（供所有表单组件复用）
export const LABEL_STYLE = {
  display: 'block',
  fontSize: '11px',
  fontWeight: '600',
  color: '#8e8e93',
  marginBottom: '5px',
  textTransform: 'uppercase',
  letterSpacing: '0.03em'
};

export const INPUT_STYLE = {
  width: '100%',
  padding: '8px 12px',
  border: '1px solid #d1d1d6',
  borderRadius: '9px',
  fontSize: '14px',
  color: '#1c1c1e',
  background: '#fff',
  outline: 'none',
  transition: 'all .15s',
  boxSizing: 'border-box'
};

// 获取习惯的成长类型（优先级：用户显式选择 > 颜色分析 > 关键词推断 > 默认）
export function inferGrowthType(habit) {
  // 1. 用户在表单中显式选择的 growth_type（非默认 energy 即为显式设置）
  if (habit?.growth_type && habit.growth_type !== 'energy') return habit.growth_type;

  // 2. 用户显式选择的 accent_color（非默认绿色 #34C759 即为显式设置）
  const c = (habit?.accent_color || '').toLowerCase().replace('#', '');
  if (c.length === 6 && c !== '34c759') {
    const r = parseInt(c.slice(0, 2), 16);
    const g = parseInt(c.slice(2, 4), 16);
    const b = parseInt(c.slice(4, 6), 16);
    if (r > 180 && g > 140 && b < 120 && r > b && g > b) return 'skill';
    if (b > r && b > g && b > 150) return 'mind';
    if (g > r && g > b && g > 120) return 'energy';
  }

  // 3. 关键词推断（仅对无显式类型/颜色的老数据兜底）
  const text = ((habit?.name || '') + ' ' + (habit?.emoji || '')).toLowerCase();
  if (/睡眠|运动|喝水|饮食|健身|跑步|游泳|瑜伽|冥想|休息|😴|🏃|💧|🍎/.test(text)) return 'energy';
  if (/看书|阅读|思考|学习|📖|🧠|📚/.test(text)) return 'mind';
  if (/英语|口语|表达|演讲|沟通|写作|🗣️|🎤|✍️/.test(text)) return 'skill';

  // 4. 默认
  return 'energy';
}

// 将 hex 颜色与白色混合，生成浅色背景
export function lighten(hex, whiteRatio = 0.82) {
  const h = (hex || '#34C759').replace('#', '');
  if (h.length !== 6) return '#e5e5ea';
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const mix = c => Math.round(c * (1 - whiteRatio) + 255 * whiteRatio);
  const toHex = n => n.toString(16).padStart(2, '0');
  return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`;
}
