/* ============================================================
 * 统一分类映射 · 五大模块 ↔ schedule.category ↔ iOS 色彩
 * 精力/知力/能力/工作/生活 + 常规
 * 日历页面、计划总结、年度规划共用此单一真相源
 * ============================================================ */

export const MODULES = [
  { key: 'energy',    label: '精力', cat: 6, color: '#34C759', soft: 'rgba(52,199,89,0.08)',   weight: 0.15 },
  { key: 'cognition', label: '知力', cat: 7, color: '#007AFF', soft: 'rgba(0,122,255,0.08)',   weight: 0.20 },
  { key: 'ability',   label: '能力', cat: 2, color: '#FF9500', soft: 'rgba(255,149,0,0.08)',   weight: 0.25 },
  { key: 'work',      label: '工作', cat: 1, color: '#FF3B30', soft: 'rgba(255,59,48,0.08)',   weight: 0.25 },
  { key: 'life',      label: '生活', cat: 5, color: '#AF52DE', soft: 'rgba(175,82,222,0.08)',   weight: 0.15 },
  { key: 'others',    label: '常规', cat: 3, color: '#8E8E93', soft: 'rgba(142,142,147,0.08)', weight: 0    },
];

const CAT_MAP = MODULES.reduce((m, mod) => { m[mod.cat] = mod; return m; }, {});

/** schedule.category(数字) → 模块对象 */
export function catToModule(cat) {
  const c = Number(cat);
  return CAT_MAP[c] || CAT_MAP[3]; // 兜底常规
}

/** 模块 key → 模块对象 */
export function keyToModule(key) {
  return MODULES.find(m => m.key === key) || CAT_MAP[3];
}

/** schedule → 模块对象（兼容旧数据 cat=4 降级为 3） */
export function scheduleModule(s) {
  const cat = Number(s?.category);
  if (cat === 4) return CAT_MAP[3];  // 旧习惯数据降级
  if (cat === 6) return CAT_MAP[6];
  if (cat === 7) return CAT_MAP[7];
  if (cat === 1) return CAT_MAP[1];
  if (cat === 2) return CAT_MAP[2];
  if (cat === 5) return CAT_MAP[5];
  // 旧数据无 category 按 is_key 推断
  if (s?.is_key) {
    const st = s.start_time;
    if (st && Number(st.split(':')[0]) <= 12) return CAT_MAP[1]; // 上午=工作
    return CAT_MAP[2]; // 下午=能力
  }
  return CAT_MAP[3];
}

/** 表头：周一起 */
export const WEEK_LABELS_MON = ['一', '二', '三', '四', '五', '六', '日'];

/** 日历页面用的节奏胶囊判定 */
export function paceStatus(progressPct, timePct) {
  const diff = progressPct - timePct;
  if (diff >= 5)  return { type: 'ahead', label: `↑ 超前 ${Math.round(diff)}%`, color: '#1DC981', bg: 'rgba(29,201,129,0.10)' };
  if (diff <= -5) return { type: 'behind', label: `↓ 落后 ${Math.round(-diff)}%`, color: '#E8463A', bg: 'rgba(232,70,58,0.10)' };
  return { type: 'ontrack', label: `· 持平`, color: '#007AFF', bg: 'rgba(0,122,255,0.08)' };
}
