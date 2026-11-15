// ============================================================
// 关系记录：标签元数据 + 周期相位计算
//   首页「关系」卡与「关系 · 数据」弹层共用，保证两处口径一致
// ============================================================
import { addDaysISO } from './date.js';

// 默认标签：后端首次使用时写入 ethan_relation_tags，之后以接口返回为准（可增删改）
export const REL_TAGS = [
  { key: 'harmony', label: '融洽', color: '#34C759' },
  { key: 'normal', label: '一般', color: '#FFCC00' },
  { key: 'friction', label: '有摩擦', color: '#FF3B30' },
  { key: 'unwell', label: '她不舒服', color: '#AF52DE' },
];

// 心情预设（默认四档；与相处标签一样存在 ethan_relation_tags，可改名/换色/增删）
export const MOODS = [
  { key: 'happy', label: '开心', color: '#FF9500' },
  { key: 'steady', label: '平稳', color: '#34C759' },
  { key: 'low', label: '低落', color: '#5E5CE6' },
  { key: 'irritable', label: '烦躁', color: '#FF3B30' },
];
export const MOOD_MAP = Object.fromEntries(MOODS.map(m => [m.key, m]));

const kindOf = t => (t?.kind === 'mood' ? 'mood' : 'tag');

// 接口没返回标签时（老缓存 / 请求失败）退回默认四态，避免空白
export const resolveTags = (tags) => {
  const list = (Array.isArray(tags) ? tags : []).filter(t => kindOf(t) === 'tag');
  return list.length ? list : REL_TAGS;
};
export const resolveMoods = (tags) => {
  const list = (Array.isArray(tags) ? tags : []).filter(t => kindOf(t) === 'mood');
  return list.length ? list : MOODS;
};
export const tagMapOf = (tags) => Object.fromEntries(resolveTags(tags).map(t => [t.key, t]));
// 已删除的标签仍出现在历史记录里：给出中性占位，不隐藏、不改写数据
export const tagOf = (map, key) => map[key] || { key, label: '已删除', color: '#C7C7CC' };

export const TAG_MAP = Object.fromEntries(REL_TAGS.map(t => [t.key, t]));

// 未记录：比卡片底色深一点的灰，表示「空着」而不是「融洽」
export const BLANK_COLOR = '#E5E5EA';

const DAY = 86400000;

export function dayNum(s) {
  const [y, m, d] = String(s).split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY);
}

// 经期区间是否覆盖某天
function covers(p, dateStr) {
  if (!p?.start_date) return false;
  if (dateStr < p.start_date) return false;
  const end = p.end_date || null;
  return !end || dateStr <= end;
}

/**
 * 今天处于周期的哪个阶段
 * @returns {{key:'period'|'pre'|'post'|'normal'|'none', label:string}}
 */
export function cycleInfo(periods, todayStr) {
  const list = [...(periods || [])].filter(p => p?.start_date).sort((a, b) => (a.start_date < b.start_date ? 1 : -1));
  if (!list.length) return { key: 'none', label: '周期未标记' };

  const cur = list.find(p => covers(p, todayStr));
  if (cur) {
    const day = dayNum(todayStr) - dayNum(cur.start_date) + 1;
    return { key: 'period', label: `经期第 ${day} 天` };
  }

  // 最近一段已结束的经期
  const lastEnded = list.find(p => p.end_date && p.end_date < todayStr);
  if (lastEnded) {
    const after = dayNum(todayStr) - dayNum(lastEnded.end_date);
    if (after >= 1 && after <= 3) return { key: 'post', label: `经后第 ${after} 天` };
  }

  // 用历史平均周期预测下一次开始（无历史时按 28 天）
  const starts = list.map(p => dayNum(p.start_date)).sort((a, b) => a - b);
  let cycle = 28;
  if (starts.length >= 2) {
    const gaps = [];
    for (let i = 1; i < starts.length; i++) {
      const g = starts[i] - starts[i - 1];
      if (g >= 18 && g <= 45) gaps.push(g);
    }
    if (gaps.length) cycle = Math.round(gaps.reduce((s, n) => s + n, 0) / gaps.length);
  }
  const lastStart = starts[starts.length - 1];
  const toNext = lastStart + cycle - dayNum(todayStr);
  if (toNext >= 1 && toNext <= 3) return { key: 'pre', label: `预计经前 ${toNext} 天` };
  if (toNext <= 0) return { key: 'pre', label: '预计经期已到' };

  const day = dayNum(todayStr) - lastStart + 1;
  return { key: 'normal', label: `周期第 ${day} 天` };
}

/**
 * 某天在统计中归属的相位（只用真实区间，不做预测 —— 归因不能建立在猜测上）
 * @returns {'period'|'pre'|'post'|'other'}
 */
export function phaseOf(dateStr, periods) {
  const list = periods || [];
  if (list.some(p => covers(p, dateStr))) return 'period';
  for (const p of list) {
    if (dateStr < p.start_date) {
      const gap = dayNum(p.start_date) - dayNum(dateStr);
      if (gap >= 1 && gap <= 3) return 'pre';
    }
    if (p.end_date && dateStr > p.end_date) {
      const gap = dayNum(dateStr) - dayNum(p.end_date);
      if (gap >= 1 && gap <= 3) return 'post';
    }
  }
  return 'other';
}

export const PHASES = [
  { key: 'pre', label: '经前 3 天' },
  { key: 'period', label: '经期' },
  { key: 'post', label: '经后 3 天' },
  { key: 'other', label: '其余日子' },
];

// 最近 n 天（含今天）的日期数组，从旧到新
export function lastDays(n, todayStr) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(addDaysISO(todayStr, -i));
  return out;
}
