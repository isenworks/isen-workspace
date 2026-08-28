// 成长类型配置：精力(绿) / 知力(蓝) / 能力(金)
export const GROWTH_TYPES = {
  energy: { label: '精力型', color: '#34C759', bg: '#e5f6ea', borderColor: '#34C759', doneColor: '#34C759', lineColor: '#34C759' },
  mind:   { label: '知力型', color: '#007AFF', bg: '#e0ecff', borderColor: '#007AFF', doneColor: '#007AFF', lineColor: '#007AFF' },
  skill:  { label: '能力型', color: '#FF9500', bg: '#fbf3d8', borderColor: '#FF9500', doneColor: '#FF9500', lineColor: '#FF9500' },
};

// 仅用于习惯分类色选择器（圆圈色块）
export const GROWTH_TYPE_COLORS = {
  energy: '#34C759',
  mind:   '#007AFF',
  skill:  '#FF9500',
};

// 事项分类颜色：紧急度 / 常规 / 习惯日程
export const CATEGORY_COLORS = {
  1: { color: '#FF3B30', bg: '#ffe8e8', borderColor: '#FF3B30', doneColor: '#FF3B30', lineColor: '#FF3B30', timeColor: '#FF3B30' },
  2: { color: '#FF9500', bg: '#fff4d8', borderColor: '#FF9500', doneColor: '#FF9500', lineColor: '#FF9500', timeColor: '#FF9500' },
  3: { color: '#8e8e93', bg: '#e5e5ea', borderColor: '#8e8e93', doneColor: '#8e8e93', lineColor: '#8e8e93', timeColor: '#8e8e93' },
  4: { color: '#34C759', bg: '#e5f6ea', borderColor: '#34C759', doneColor: '#34C759', lineColor: '#34C759', timeColor: '#34C759' },
  5: { color: '#AF52DE', bg: '#f3e8ff', borderColor: '#AF52DE', doneColor: '#AF52DE', lineColor: '#AF52DE', timeColor: '#AF52DE' },
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
