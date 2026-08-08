// 成长类型配置：精力(绿) / 知力(蓝) / 能力(金)
export const GROWTH_TYPES = {
  energy: { label: '精力型', color: '#34c759', bg: '#e5f6ea', borderColor: '#5dd57a', doneColor: '#5dd57a', lineColor: '#34c759' },
  mind:   { label: '知力型', color: '#007aff', bg: '#e0ecff', borderColor: '#4a9bff', doneColor: '#4a9bff', lineColor: '#007aff' },
  skill:  { label: '能力型', color: '#d4a017', bg: '#fbf3d8', borderColor: '#e0b94a', doneColor: '#e0b94a', lineColor: '#d4a017' },
};

// 仅用于习惯分类色选择器（圆圈色块）
export const GROWTH_TYPE_COLORS = {
  energy: '#34c759',
  mind:   '#007aff',
  skill:  '#d4a017',
};

// 事项分类颜色：紧急度 / 常规 / 习惯日程
export const CATEGORY_COLORS = {
  1: { color: '#ff3b30', bg: '#ffe8e8', borderColor: '#ff6b64', doneColor: '#ff6b64', lineColor: '#ff3b30', timeColor: '#ff3b30' },
  2: { color: '#ff9500', bg: '#fff4d8', borderColor: '#ffa635', doneColor: '#ffa635', lineColor: '#ff9500', timeColor: '#ff9500' },
  3: { color: '#8e8e93', bg: '#f2f2f7', borderColor: '#a6a6ad', doneColor: '#a6a6ad', lineColor: '#8e8e93', timeColor: '#8e8e93' },
  4: { color: '#34c759', bg: '#e5f6ea', borderColor: '#5dd57a', doneColor: '#5dd57a', lineColor: '#34c759', timeColor: '#34c759' },
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

// 根据习惯名称/图标自动推断成长类型
export function inferGrowthType(habit) {
  const text = ((habit?.name || '') + ' ' + (habit?.emoji || '')).toLowerCase();
  if (/睡眠|运动|喝水|饮食|健身|跑步|游泳|瑜伽|冥想|休息|😴|🏃|💧|🍎/.test(text)) return 'energy';
  if (/看书|阅读|思考|学习|📖|🧠|📚/.test(text)) return 'mind';
  if (/英语|口语|表达|演讲|沟通|写作|🗣️|🎤|✍️/.test(text)) return 'skill';
  // 用户显式设置的类型优先（但默认值 energy 不算显式）
  if (habit?.growth_type && habit.growth_type !== 'energy') return habit.growth_type;
  return 'energy';
}

// 将 hex 颜色与白色混合，生成浅色背景
export function lighten(hex, whiteRatio = 0.82) {
  const h = (hex || '#34c759').replace('#', '');
  if (h.length !== 6) return '#f2f2f7';
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const mix = c => Math.round(c * (1 - whiteRatio) + 255 * whiteRatio);
  const toHex = n => n.toString(16).padStart(2, '0');
  return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`;
}
