/* ============================================================
 * 统一分类映射 · 五大模块 ↔ schedule.category ↔ iOS 色彩
 * 精力/知力/能力/工作/生活 + 其他（原"常规"）
 * 日历页面、计划总结、年度规划共用此单一真相源
 *
 * 支持持久化覆盖：从 localStorage 读取 `schedule_cats_v1`
 *   按当前用户 id 隔离（ScheduleForm 的 CategoryEditor 写入同一键）
 *   内置 6 项保留 cat 值不变；自定义 cat >= 100 追加到模块表
 * ============================================================ */

const BASE_MODULES = [
  { key: 'energy',    label: '精力', cat: 6, color: 'var(--m-energy)',    soft: 'rgba(var(--m-energy-rgb),0.08)',   weight: 0.15 },
  { key: 'cognition', label: '知力', cat: 7, color: 'var(--m-cognition)', soft: 'rgba(var(--m-cognition-rgb),0.08)', weight: 0.20 },
  { key: 'ability',   label: '能力', cat: 2, color: 'var(--m-ability)',   soft: 'rgba(var(--m-ability-rgb),0.08)',   weight: 0.25 },
  { key: 'work',      label: '工作', cat: 1, color: 'var(--m-work)',      soft: 'rgba(var(--m-work-rgb),0.08)',      weight: 0.25 },
  { key: 'life',      label: '生活', cat: 5, color: 'var(--m-life)',      soft: 'rgba(var(--m-life-rgb),0.08)',      weight: 0.15 },
  { key: 'others',    label: '其他', cat: 3, color: '#8E8E93',            soft: 'rgba(142,142,147,0.08)',            weight: 0    },
];

const LS_KEY = 'schedule_cats_v1';
function curUserId() {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('pw_user') : null;
    const obj = raw ? JSON.parse(raw) : null;
    return (obj && obj.id) ? String(obj.id) : 'anon';
  } catch { return 'anon'; }
}
function readCatsOverride() {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(LS_KEY) : null;
    if (!raw) return null;
    const obj = JSON.parse(raw) || {};
    const saved = obj[curUserId()];
    if (!saved) return null;
    return saved;
  } catch { return null; }
}
function softOf(color, a = 0.08) {
  const h = (color || '').replace('#', '');
  if (h.length !== 6) return `rgba(142,142,147,${a})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}
function buildModules() {
  const saved = readCatsOverride();
  if (!saved) return BASE_MODULES.map(m => ({ ...m }));

  const merged = BASE_MODULES.map(base => {
    const ov = saved.find(s => s.v === base.cat);
    if (!ov) return { ...base };
    return {
      ...base,
      label: ov.label ?? base.label,
      color: ov.dot ?? base.color,
      soft: softOf(ov.dot ?? base.color),
    };
  });
  // 自定义 ≥ 100 追加成新的模块（key=cat-${v}）
  saved.forEach(s => {
    if (s.v >= 100 && !merged.find(m => m.cat === s.v)) {
      merged.push({
        key: `cat-${s.v}`,
        label: s.label || `自定义 ${s.v}`,
        cat: s.v,
        color: s.dot || '#8E8E93',
        soft: softOf(s.dot || '#8E8E93'),
        weight: 0.05,
      });
    }
  });
  return merged;
}

export const MODULES = buildModules();

let catMap = MODULES.reduce((m, mod) => { m[mod.cat] = mod; return m; }, {});
let CAT_MAP = catMap; // backward compatible alias

/** 响应式重建模块映射（由 ScheduleForm 类型保存时调用） */
export function reloadCategoryMapping() {
  const next = buildModules();
  // 替换 MODULES 数组内容（保持引用，已引用 MODULES 的 UI 不会自动重渲染；但 catToModule/keyToModule 取最新）
  MODULES.splice(0, MODULES.length, ...next);
  CAT_MAP = MODULES.reduce((m, mod) => { m[mod.cat] = mod; return m; }, {});
  catMap = CAT_MAP;
  return MODULES;
}

/** schedule.category(数字) → 模块对象 */
export function catToModule(cat) {
  const c = Number(cat);
  return CAT_MAP[c] || CAT_MAP[3]; // 兜底其他
}

/** 模块 key → 模块对象 */
export function keyToModule(key) {
  return MODULES.find(m => m.key === key) || CAT_MAP[3];
}

/** schedule → 模块对象（兼容旧数据 cat=4 降级为 3） */
export function scheduleModule(s) {
  const cat = Number(s?.category);
  if (cat === 4) return CAT_MAP[3];  // 旧习惯数据降级
  if (CAT_MAP[cat]) return CAT_MAP[cat];
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
