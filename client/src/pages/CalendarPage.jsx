import { useState, useMemo, useCallback, useEffect } from 'react';
import { today as getToday, fromISODate, startOfWeek, endOfWeek, toISODate, startOfMonth, endOfMonth } from '../utils/date.js';
import { MODULES, keyToModule, catToModule } from '../utils/categoryMapping.js';
import MonthCalendarGrid from '../components/calendar/MonthCalendarGrid.jsx';
import FocusPanel from '../components/calendar/FocusPanel.jsx';
import Modal from '../components/Modal.jsx';
import { API } from '../api/client.js';
import { store } from '../utils/store.js';
/* ===== 需求 1-7：从年度规划 AnnualPlan 聚合同源数据 =====
   · 精力：useEnergyHabits hook 拉取真实打卡数据（作息/运动/喝水），8月数据
   · 知力：localStorage 读取书架，只显示在读书 + 自动生成读后思考/思后行动子项
   · 能力：localStorage 读取能力里程碑，只显示 st='doing' 进行中
   · 工作：localStorage 读取工作目标，只显示目标级事项（不展开 KR）
   · 生活：localStorage 读取生活记录，只显示本月事项
   · 计划总结 ethan_schedules：只进日历右栏，不进主线面板（需求 6）*/
import { HABITS, BOOKS, ABILITY, WORK, LIFE, useEnergyHabits } from './AnnualPlan.jsx';

/* ===== localStorage 读取年度规划用户真实数据（覆盖静态常量）===== */
function readAnnualState(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return fallback;
}
/* 当前用户 id（用于按用户隔离种子化完成标记）*/
function curUserId() {
  try {
    const raw = localStorage.getItem('pw_user');
    const obj = raw ? JSON.parse(raw) : null;
    return (obj && obj.id) ? String(obj.id) : 'anon';
  } catch { return 'anon'; }
}
/* 本月是否已完成种子化（持久化到 localStorage，刷新后依然生效）
   · 标记存在 → seedCreateAll 直接跳过，用户删除的种子事件不会再被复活
   · 切换月份/用户后 key 不同，对新月份仍会触发首次种子化 */
function isSeedDoneForMonth(y, m) {
  try {
    return localStorage.getItem(`seed_done_${curUserId()}_${y}_${m}`) === '1';
  } catch { return false; }
}
function markSeedDoneForMonth(y, m) {
  try { localStorage.setItem(`seed_done_${curUserId()}_${y}_${m}`, '1'); } catch { /* ignore */ }
}
/* 本地"已删除的 ethan_schedules 记录" tombstone（持久化兜底）
   · 场景：用户通过 FocusPanel 删除主线/周主线某条真实 ethan_schedules 事项时，
     正常链路会同步 API.schedules.remove；但如果 API 失败、或刷新窗口期 re-inject
     还把删除的条目又注入 monthTasks，这里用 id 黑名单做最后一道过滤。
   · create/edit 写入时应把 id 从黑名单移出（见 schedule_saved 广播） */
const DELETED_SCHEDULE_LS_KEY = () => `deleted_schedules_${curUserId()}`;
function isScheduleDeletedLocally(id) {
  if (id == null) return false;
  try {
    const raw = localStorage.getItem(DELETED_SCHEDULE_LS_KEY());
    const set = raw ? new Set(JSON.parse(raw)) : new Set();
    return set.has(String(id));
  } catch { return false; }
}
function markScheduleDeletedLocally(id) {
  if (id == null) return;
  try {
    const raw = localStorage.getItem(DELETED_SCHEDULE_LS_KEY());
    const set = raw ? new Set(JSON.parse(raw)) : new Set();
    set.add(String(id));
    localStorage.setItem(DELETED_SCHEDULE_LS_KEY(), JSON.stringify([...set]));
  } catch { /* ignore */ }
}
function unmarkScheduleDeletedLocally(id) {
  if (id == null) return;
  try {
    const raw = localStorage.getItem(DELETED_SCHEDULE_LS_KEY());
    if (!raw) return;
    const set = new Set(JSON.parse(raw));
    if (!set.has(String(id))) return;
    set.delete(String(id));
    localStorage.setItem(DELETED_SCHEDULE_LS_KEY(), JSON.stringify([...set]));
  } catch { /* ignore */ }
}
/* 周主线 WEEK_SEED 的"已删除 id"持久化（刷新后不再复活）
   · 与 ethan_schedules 分开一套：WEEK_SEED 是本地写死的字符串 id（w1..w5），
     它们不会出现在 ethan_schedules 表里，所以走另一套 LS tombstone。
   · 新建的本周主线任务（真实 ethan_schedules 记录）仍走上面 deleted_schedules_* */
const DELETED_WEEK_SEED_LS_KEY = () => `deleted_week_seed_${curUserId()}`;
function isWeekSeedDeletedLocally(id) {
  if (id == null) return false;
  try {
    const raw = localStorage.getItem(DELETED_WEEK_SEED_LS_KEY());
    const set = raw ? new Set(JSON.parse(raw)) : new Set();
    return set.has(String(id));
  } catch { return false; }
}
function markWeekSeedDeletedLocally(id) {
  if (id == null) return;
  try {
    const raw = localStorage.getItem(DELETED_WEEK_SEED_LS_KEY());
    const set = raw ? new Set(JSON.parse(raw)) : new Set();
    set.add(String(id));
    localStorage.setItem(DELETED_WEEK_SEED_LS_KEY(), JSON.stringify([...set]));
  } catch { /* ignore */ }
}
function unmarkWeekSeedDeletedLocally(id) {
  if (id == null) return;
  try {
    const raw = localStorage.getItem(DELETED_WEEK_SEED_LS_KEY());
    if (!raw) return;
    const set = new Set(JSON.parse(raw));
    if (!set.has(String(id))) return;
    set.delete(String(id));
    localStorage.setItem(DELETED_WEEK_SEED_LS_KEY(), JSON.stringify([...set]));
  } catch { /* ignore */ }
}
/* 判断任务/事项的日期 span 是否覆盖到给定周（weekStart~weekEnd 闭区间）*/
function overlapsWeek(t, weekStartISO, weekEndISO) {
  const sd = t.start_date || t.schedule_date || t.date;
  const ed = t.end_date || sd;
  if (!sd) return true; // 无日期的默认算在本周
  return sd <= weekEndISO && ed >= weekStartISO;
}
/* 初始化 weekTasks：先过滤本地已删的 WEEK_SEED，再追加 ethan_schedules 本周内属于五大模块的真实记录 */
function computeInitialWeekTasks(weekStartISO, weekEndISO, remoteSchedules = []) {
  const seed = WEEK_SEED.filter(t => !isWeekSeedDeletedLocally(t.id));
  const fromSchedules = remoteSchedules
    .filter(s => {
      const cat = Number(s.category);
      if (![1, 2, 5, 6, 7].includes(cat)) return false;
      const sd = s.start_date || s.schedule_date || s.date;
      const ed = s.end_date || sd;
      if (!sd) return false;
      return sd <= weekEndISO && ed >= weekStartISO;
    })
    .filter(s => s.id == null || !isScheduleDeletedLocally(s.id))
    .map(s => {
      const mod = catToModule(Number(s.category));
      const sd = s.start_date || s.date;
      return {
        id: s.id,
        __origin: 'api',
        __fromSchedule: true,
        moduleKey: mod.key,
        title: s.title || '',
        done: !!s.is_done,
        progress: s.is_done ? 1 : 0,
        start_date: sd,
        end_date: s.end_date || null,
        schedule_date: sd,
        date: sd,
        note: s.note || '',
        isLongTerm: false,
        start_time: s.start_time || null,
        end_time: s.end_time || null,
        category: Number(s.category),
        srcTag: `≡ ${mod.label}事项`,
        srcTagColor: mod.soft,
        srcTagTextColor: mod.color,
      };
    });
  // 去重：同 id 以 seed 优先（一般 seed 为 w1..w5 不会和数字 id 冲突）
  const seenIds = new Set();
  return [...seed, ...fromSchedules].filter(t => {
    const k = String(t.id);
    if (seenIds.has(k)) return false;
    seenIds.add(k);
    return true;
  });
}
const LS_BOOKS    = () => readAnnualState('annual_books_v12', BOOKS);
const LS_ABILITY  = () => readAnnualState('annual_abilities_v2', ABILITY);
const LS_WORK     = () => readAnnualState('annual_work', WORK);
const LS_LIFE     = () => readAnnualState('annual_life', LIFE);

/* ============================================================
 * 日历页面 · 月视图容器（v2 交互升级）
 *   - 1) FocusPanel 事项标题点击 → 对应编辑面板
 *   - 2) 复选框独立 stopPropagation，只点它才勾选
 *   - 3) 月历事件 w-1 小圆点 → 复选框，done 状态与主线同步；周末列灰→白
 *   - 4) 日格空白/日期/今日徽章/热力点/+更多 点击 → 当日事项详情弹层（FocusPanel 复用 + 18px card 风格）
 * ============================================================ */

/* ============================================================
 * 日历页面 · 月视图容器（v3 数据聚合升级）
 *   · 1) FocusPanel 事项标题点击 → 对应编辑面板
 *   · 2) 复选框独立 stopPropagation，只点它才勾选
 *   · 3) 月历事件小圆点 → 复选框，done 状态与主线同步；周末列灰→白
 *   · 4) 日格空白/日期/今日/热力点/+更多 点击 → 当日事项详情弹层
 *   · 5) 数据源：年度规划 HABITS/BOOKS/ABILITY/WORK/LIFE + 计划总结 ethan_schedules API 聚合同源（需求 3/5/6）
 * ============================================================ */

const HABIT_SHORT_LABEL = {
  sleep: '作息 23点前',
  sport: '运动 ≥30 分',
  water: '喝水 ≥2L',
};
/* 习惯子标签（与短标题对应，用于"习惯同步·作息"场景）*/
const HABIT_TAG_LABEL = {
  sleep: '作息',
  sport: '运动',
  water: '喝水',
};
/* 习惯顺序权重（需求 3：严格按 作息→运动→喝水；FocusPanel 也按此排序，isHabit=true 渲染实心圆）*/
const HABIT_WEIGHT = { sleep: 1, sport: 2, water: 3 };
/* 从习惯名推断类型 key（realHabits 的 key 是 API ID，需要按名称匹配到 sleep/sport/water）*/
function inferHabitKey(name = '') {
  const n = name.toLowerCase();
  if (/睡|sleep|作息|早睡|熬夜/.test(n)) return 'sleep';
  if (/运动|exercise|sport|健身|跑步|run|workout|锻炼/.test(n)) return 'sport';
  if (/喝|water|水|饮水|hydration/.test(n)) return 'water';
  return null;
}

/* ===== 需求 1-7 聚合器：年度规划真实数据 → 主线 task 数组（按 {year, month} 过滤）
 * · isLongTerm=true → FocusPanel 渲染实心圆（不可点击）；false → 复选框（可勾选）
 * · isSubItem=true + indent → 子项缩进（如知力②③归属于①）
 */
function monthPad(n) { return String(n).padStart(2, '0'); }
function dueByToYm(dueBy = '') {
  if (!dueBy) return null;
  if (/^\d{4}-\d{1,2}/.test(dueBy)) {
    const [y, m] = dueBy.split('-');
    return { year: Number(y), month: Number(m) };
  }
  return null;
}
function entryDateToMonth(entryD = '') {
  if (!entryD) return null;
  const m = entryD.match(/^(\d{1,2})[.\-月]/);
  return m ? Number(m[1]) : null;
}

function aggregateTasksFromAnnualPlan(year, month, realHabits = null) {
  const tasks = [];

  /* ========== [1] 精力 HABITS（需求 1：正确抓取 8 月数据 + 实心圆不可点击）
     · 数据源：realHabits（API 真实打卡数据）|| HABITS（静态回退）
     · 标题格式：{短标题}  {月完成率}%  {当月完成}/{月目标}{unit}
     · isHabit=true, isLongTerm=true → FocusPanel 渲染实心圆，不做复选框功能 */
  const habitSrc = realHabits || HABITS;
  const habitList = habitSrc.map(h => {
    const inferredKey = inferHabitKey(h.label || h.name || '');
    return { ...h, _inferredKey: inferredKey };
  }).filter(h => h._inferredKey);

  habitList.sort((a, b) =>
    (HABIT_WEIGHT[a._inferredKey] || 99) - (HABIT_WEIGHT[b._inferredKey] || 99)
  );

  for (const h of habitList) {
    const habitKey = h._inferredKey;
    const shortLabel = HABIT_SHORT_LABEL[habitKey] || (h.label || h.name || '');
    const monthCur = Number(h.month?.[month] ?? 0);
    const monthTarget = Math.max(1, Math.ceil(Number(h.target) / 12));
    const pct = Math.min(100, Math.round((monthCur / monthTarget) * 100));
    tasks.push({
      id: `hab_${year}_${monthPad(month)}_${habitKey}`,
      moduleKey: 'energy',
      habitKey,
      isHabit: true,
      isLongTerm: true,
      isFromFetch: true,
      title: `${shortLabel}  ${pct}%  ${monthCur}/${monthTarget}${h.unit}`,
      progress: pct / 100,
      done: pct >= 100,
      srcTag: `≡ 习惯同步 · ${HABIT_TAG_LABEL[habitKey] || shortLabel}`,
      srcTagColor: 'rgba(52,199,89,0.08)',
      srcTagTextColor: '#34C759',
      habitData: { ...h, monthCur, monthTarget, shortLabel },
    });
  }

  /* ========== [2] 知力 BOOKS（需求 2：只显示在读书 + 读后思考 + 思后行动，②③缩进）
     · 只抓 st='reading' 的书籍
     · 每本在读书生成 3 条：①读完《书名》 ②输出1组【核心触动+行动计划】 ③行动计划内容
     · ②③ isSubItem=true + indent=1 → FocusPanel 缩进渲染
     · 全部 isLongTerm=true → 实心圆不可点击 */
  const books = LS_BOOKS();
  for (const b of books) {
    if (b.st !== 'reading') continue;
    const bookId = b.bookId || b.t;
    // ① 读完《书名》
    tasks.push({
      id: `book_read_${bookId}`,
      moduleKey: 'cognition',
      isFromFetch: true,
      isLongTerm: true,
      title: `读完《${b.t}》`,
      progress: (Number(b.pct) || 0) / 100,
      done: (Number(b.pct) || 0) >= 100,
      note: `阅读中 · ${b.cat || '知力'}`,
      srcTag: `≡ 书架同步`,
      srcTagColor: 'rgba(0,122,255,0.08)',
      srcTagTextColor: '#0040DD',
      bookData: { ...b },
    });
    // ② 输出 1组【核心触动+行动计划】
    tasks.push({
      id: `book_think_${bookId}`,
      moduleKey: 'cognition',
      isFromFetch: true,
      isLongTerm: true,
      isSubItem: true,
      indent: 1,
      parentId: `book_read_${bookId}`,
      title: '输出 1组【核心触动+行动计划】',
      progress: b.hasInsights ? 1 : 0,
      done: b.hasInsights || false,
      srcTag: '≡ 读后思考',
      srcTagColor: 'rgba(0,122,255,0.08)',
      srcTagTextColor: '#0040DD',
    });
    // ③ 行动计划的内容
    const actionText = b.action || (b.actions && b.actions[0] ? b.actions[0].text : '');
    if (actionText) {
      tasks.push({
        id: `book_action_${bookId}`,
        moduleKey: 'cognition',
        isFromFetch: true,
        isLongTerm: true,
        isSubItem: true,
        indent: 1,
        parentId: `book_read_${bookId}`,
        title: actionText,
        progress: (b.actions && b.actions[0] && b.actions[0].done) ? 1 : 0,
        done: (b.actions && b.actions[0] && b.actions[0].done) || false,
        srcTag: '≡ 思后行动',
        srcTagColor: 'rgba(0,122,255,0.08)',
        srcTagTextColor: '#0040DD',
      });
    }
  }

  /* ========== [3] 能力 ABILITY（需求 3：只显示进行中 st='doing' 的里程碑）
     · 从 localStorage 读取用户真实数据
     · 标题：能力标题 · 里程碑标题
     · isLongTerm：dueBy 螚出本月 → true（实心圆）；否则 false（复选框可勾选）*/
  const abilities = LS_ABILITY();
  for (const ab of abilities) {
    const ms = ab.mstones || [];
    for (const m of ms) {
      if (m.st !== 'doing') continue;
      const ym = dueByToYm(m.dueBy);
      const isWithinMonth = ym && ym.year === year && ym.month === month;
      tasks.push({
        id: `ms_${ab.id}_${m.id}`,
        moduleKey: 'ability',
        isFromFetch: true,
        isLongTerm: !isWithinMonth,
        title: `${ab.title} · ${m.lb}`,
        progress: (Number(m.pct) || 0) / 100,
        done: false,
        dueDate: m.dueBy ? `截止 ${m.dueBy.slice(5).replace('-', '/')}` : undefined,
        srcTag: `≡ ${ab.title}`,
        srcTagColor: 'rgba(255,149,0,0.08)',
        srcTagTextColor: '#FF9500',
        milestoneData: { abilityId: ab.id, abilityTitle: ab.title, ...m, initial:
          { id: m.id, lb: m.lb, st: m.st, pct: Number(m.pct) || 0, dueBy: m.dueBy, abilityId: ab.id } },
      });
    }
  }

  /* ========== [4] 工作 WORK（需求 4：只显示目标级事项，不展开 KR）
     · 从 localStorage 读取用户真实数据
     · 只显示目标标题，不显示单个 KR
     · isLongTerm=true → 实心圆不可点击（年度目标）*/
  const workGoals = LS_WORK();
  for (const wk of workGoals) {
    tasks.push({
      id: `wk_goal_${wk.id}`,
      moduleKey: 'work',
      isFromFetch: true,
      isLongTerm: true,
      title: wk.title || '',
      progress: 0,
      done: false,
      dueDate: wk.deadline ? `截止 ${wk.deadline.slice(5).replace('-', '/')}` : undefined,
      srcTag: `≡ ${wk.label || '工作'}目标`,
      srcTagColor: 'rgba(255,59,48,0.08)',
      srcTagTextColor: '#FF3B30',
    });
  }

  /* ========== [5] 生活 LIFE（需求 5：自动同步本月事项）
     · 从 localStorage 读取用户真实数据
     · 只显示 entries 日期含本月的条目
     · isLongTerm=false → 复选框可勾选（单日事项）*/
  const lifeData = LS_LIFE();
  for (const lg of lifeData) {
    for (const e of lg.entries || []) {
      const em = entryDateToMonth(e.d);
      if (em !== null && em !== month) continue;
      tasks.push({
        id: `life_${lg.key || lg.lb}_${e.t || Math.random().toString(36).slice(2,7)}`,
        moduleKey: 'life',
        isFromFetch: true,
        isLongTerm: false,
        title: e.t,
        note: e.n || (em ? undefined : lg.lb),
        dueDate: e.d ? e.d : undefined,
        progress: 1,
        done: true,
        srcTag: `≡ ${lg.lb}`,
        srcTagColor: 'rgba(175,82,222,0.08)',
        srcTagTextColor: '#AF52DE',
      });
    }
  }

  return tasks;
}

/* 精力："体检 + 买复合维生素"等独立事项（用户手动创建的示例，非习惯同步）
   · 与 ethan_schedules 双向同步，FocusPanel 排序排在三个习惯前面（isHabit=false 的非习惯项自动排最前）*/
const SEED_ENERGY_NONHABIT = [
  { id: 'seed_checkup', moduleKey: 'energy', title: '体检 + 买复合维生素',
    done: false, progress: 0.60, dueDate: '截止 8/31',
    start_date: '2026-08-25', end_date: '2026-08-31' },
];

/* ===== 周主线：从月主线拆解出的"本周任务"示例（暂保留静态，后续与周拆解能力联动）===== */
const WEEK_SEED = [
  { id: 'w1', moduleKey: 'cognition', title: '《纳瓦尔》第 5-6 章 · 做卡片笔记',
    done: false, progress: 0.50, srcTag: '≡ 继承月主线',
    srcTagColor: 'rgba(0,122,255,0.08)', srcTagTextColor: '#0040DD', dueDate: '周三 9/2' },
  { id: 'w2', moduleKey: 'ability',   title: '① Shadowing 连读训练 5 天',
    done: true,  progress: 1.00 },
  { id: 'w3', moduleKey: 'ability',   title: '② 音标纠音 · R/L/TH 发音',
    done: false, progress: 0.28, note: '2/7' },
  { id: 'w4', moduleKey: 'work',      title: '买域名 + 后端基础骨架',
    done: false, progress: 0.30, dueDate: '周二' },
  { id: 'w5', moduleKey: 'work',      title: '写 PRD v0.1 · 核心用户故事',
    done: false, progress: 0.00, dueDate: '周四' },
];

/* ========= 工具：双向更强的标题匹配（解决「体检+买复合维生素」↔「体检复合维生素」左右不同步）
   - 之前用 t.title.slice(0,4) 做单侧前缀，但"体检复合维生素"前4字 = 「体检复合」，主线是「体检+买复合维生素」前4字 = 「体检+买」，前4字不重合导致永不关联
   - 新算法：将标题去符号/空格/中缀，求最长公共子串 ≥ 3 即匹配；同时做双向 exact 包含 + keyword 词典（如 纳瓦尔/宝典/体检/买复合维生素） */
function normTitle(s = '') {
  return String(s).replace(/[\s《》·+—\-\/()（）·,，。.!！?？、:：；;_【】\[\]"'"'≡⇣≥≤]/g, '').toLowerCase();
}
function titleMatches(a = '', b = '') {
  const A = normTitle(a);
  const B = normTitle(b);
  if (!A || !B) return false;
  if (A.includes(B) || B.includes(A)) return true;
  // 最长公共子串 ≥ 3 字符
  const [shorter, longer] = A.length <= B.length ? [A, B] : [B, A];
  for (let n = Math.min(6, shorter.length); n >= 3; n--) {
    for (let i = 0; i + n <= shorter.length; i++) {
      if (longer.includes(shorter.slice(i, i + n))) return true;
    }
  }
  return false;
}

function buildEventsWithTaskLink(raw, tasks) {
  return raw.map(ev => {
    const mod = keyToModule(
      ({ 1:'work', 2:'ability', 5:'life', 6:'energy', 7:'cognition' })[Number(ev.category)] || 'others'
    );
    // 先 moduleKey 一致再 titleMatches；若 moduleKey 一致也放宽（同名不同模块但跨月少见）
    let match = tasks.find(t => t.moduleKey === mod.key && titleMatches((ev.title || ''), t.title));
    if (!match) match = tasks.find(t => titleMatches((ev.title || ''), t.title));
    const done = match ? !!match.done : Boolean(ev.is_done);
    return { ...ev, moduleKey: (match?.moduleKey) || mod.key, taskId: match?.id, is_done: done };
  });
}

/* ========= 月份 span 过滤（需求 3）：
   · 类别属于五大模块或其他（就是有分类）
   · 时间覆盖到当前月（start <= monthEnd && (end || start) >= monthStart）
   · 如果是全年跨度：start 在当年 1/1 且 end 在当年 12/31 → 不显示（避免主线塞满年度目标） */
function overlapsMonth(task, year, month) {
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const monthEndObj = endOfMonth(fromISODate(monthStart));
  const monthEnd = toISODate(monthEndObj);
  const s = task.start_date || task.schedule_date || task.date || null;
  const e = task.end_date || task.due || null;
  if (!s) return true; // 没填日期：默认按"本月"显示
  const start = s;
  const end = e || s;
  if (start > monthEnd || end < monthStart) return false;
  // 全年跨度排除（Jan 1 到 Dec 31 同一年）
  const fullYearStart = `${year}-01-01`;
  const fullYearEnd   = `${year}-12-31`;
  if (start <= fullYearStart && end >= fullYearEnd) return false;
  return true;
}

/* ===== 月格事件：保留 demo 数据（月历格子内的小圆点 + 复选框直观展示）
   真实 ethan_schedules 也会在 fetch 后通过 tick 加入渲染引用
   （需求 6 已通过 aggregateTasksFromAnnualPlan + useEffect API 聚合呈现主线）*/
const MOCK_EVENTS_RAW = [
  { date: '2026-08-31', title: '体检复合维生素',             category: 6 },
  { date: '2026-08-31', title: '纳瓦尔 5-6 章',               category: 7 },
  { date: '2026-08-31', title: 'OKR Q3 复盘',                  category: 1 },
  { date: '2026-08-31', title: '写 PRD v0.1',                  category: 1 },
  { date: '2026-09-01', title: '发音练习 R/L',                 category: 2 },
  { date: '2026-09-02', title: '买域名 + 后端骨架',           category: 1 },
  { date: '2026-09-02', title: '纳瓦尔笔记',                   category: 7 },
  { date: '2026-09-04', title: 'OKR Q3 复盘会 14:00',         category: 1 },
  { date: '2026-09-05', title: '写 PRD v0.1',                  category: 1 },
  { date: '2026-09-05', title: '签证资料提交',                 category: 5 },
  { date: '2026-09-06', title: 'Shadowing 50min',             category: 2 },
  { date: '2026-09-07', title: '露营 · 延庆',                  category: 5 },
  { date: '2026-09-07', title: '徒步 8km',                    category: 6 },
  { date: '2026-09-08', title: '体检医院 · 9:30',              category: 6 },
  { date: '2026-09-10', title: '东京行机票出签',               category: 5 },
  { date: '2026-09-12', title: '客户 Demo',                    category: 1 },
  { date: '2026-09-15', title: '读完《纳瓦尔宝典》',           category: 7 },
  { date: '2026-09-17', title: '英语口语 M3 测评',             category: 2 },
  { date: '2026-09-19', title: '洞察组 + 践行发布',           category: 7 },
  { date: '2026-09-21', title: '家族聚会',                      category: 5 },
  { date: '2026-09-24', title: '副业 MVP v0.1 上线',           category: 1 },
  { date: '2026-09-27', title: 'Q3 月末结算',                   category: 1 },
  { date: '2026-09-29', title: '✈ 出发东京',                    category: 5 },
  { date: '2026-09-30', title: '月度复盘 · 知力输出',           category: 7 },
  { date: '2026-10-01', title: '8月主线完成度核查',            category: 1 },
];

/* ========= 工具：主线任务 → ScheduleForm 初始值 ========= */
function taskToScheduleInitial(task, defaultDate) {
  const mod = keyToModule(task.moduleKey);
  return {
    title: task.title,
    category: mod.cat,
    is_key: true,
    note: [task.dueDate, task.note, task.srcTag].filter(Boolean).join(' · '),
    start_time: '09:00',
    end_time: '10:00',
    schedule_date: defaultDate,
    ...(task?.schedulePayload || {}),
  };
}

function eventToScheduleInitial(ev, date) {
  const mod = keyToModule(ev.moduleKey || 'others');
  // 只保留纯数字 id（真实 ethan_schedules API 记录），聚合生成的字符串 id（life_xxx / book_xxx / ms_xxx 等）
  // 必须丢弃，否则 ScheduleForm 进入 edit 态调用 update → 服务器 Number(id) 失败报"缺少id"
  const rawId = ev.id;
  const isRealScheduleId = typeof rawId === 'number' || /^\d+$/.test(String(rawId));
  // 真实 API 日程：category 用原始数字字段（用户可能手动改成过"生活=5/工作=1/..."），不要用 keyToModule 反查的 cat，
  //   这样 ScheduleForm 能正确高亮当前类型并允许切换"管理类型"
  // 聚合事件：category 用 moduleKey 对应的默认数字
  const category = isRealScheduleId && ev.category != null ? Number(ev.category) : mod.cat;
  return {
    id: isRealScheduleId ? rawId : undefined,
    title: ev.title || ev.name,
    category,
    is_key: (category === 1 || category === 2) ? 1 : (ev.is_key ? 1 : 0),
    note: ev.note || '',
    start_time: ev.start_time || '09:00',
    end_time: ev.end_time || '10:00',
    duration_min: ev.duration_min != null ? Number(ev.duration_min) : undefined,
    is_done: ev.is_done,
    schedule_date: date || ev.date,
  };
}

/* ========= CalendarPage 容器 ========= */
export default function CalendarPage({ onEditSchedule, onJumpToAnnualView }) {
  const todayISO = getToday();
  const todayObj = fromISODate(todayISO);

  const [year, setYear] = useState(todayObj.getFullYear());
  const [month, setMonth] = useState(todayObj.getMonth() + 1);
  const [selectedDate, setSelectedDate] = useState(todayISO);
  const [tabView, setTabView] = useState('month'); // month | week | day

  /* ===== 需求 1：从 API 拉取真实精力习惯数据（含 8 月打卡数据）===== */
  const { realHabits } = useEnergyHabits();

  /* ===== 需求 1-7：月主线 — 首次初始化 + 年/月切换时重算
     · 只聚合年度规划数据（精力/知力/能力/工作/生活），不再混入 ethan_schedules（需求 6）
     · 种子独立事项（体检等手动创建）保留在主线 */
  const computeInitialMonthTasks = useCallback((y, m) => {
    const planTasks = aggregateTasksFromAnnualPlan(y, m, realHabits);
    const seedTasks = SEED_ENERGY_NONHABIT.filter(t => overlapsMonth(t, y, m));
    return [...seedTasks, ...planTasks];
  }, [realHabits]);
  const [monthTasks, setMonthTasks] = useState(() => computeInitialMonthTasks(todayObj.getFullYear(), todayObj.getMonth() + 1));
  // 本周主线：首次挂载先按 WEEK_SEED（过滤本地已删）占位；后续 API.schedules.list 拉完后
  // 再把 ethan_schedules 里"本周内的五大模块事项"追加进来（避免刷新后用户新建的本周任务丢失）
  const [weekTasks, setWeekTasks] = useState(() => {
    const todayISO = toISODate(new Date());
    const ws = toISODate(startOfWeek(todayISO));
    const we = toISODate(endOfWeek(todayISO));
    return computeInitialWeekTasks(ws, we, []);
  });

  // 回收站：被删除的主线任务（抓取的事项 isFromFetch 除外）
  const [deletedMonthTasks, setDeletedMonthTasks] = useState([]);
  const [deletedWeekTasks, setDeletedWeekTasks] = useState([]);
  // 强制刷新月历事件 done 态引用
  const [tick, setTick] = useState(0);

  // 需求 4：当日详情弹层 Modal —— 点击日格空白/日期/今日/热力点/+更多 打开
  const [dayDetail, setDayDetail] = useState(null); // { date } | null

  /* ====== 需求 6：ethan_schedules 只进日历右栏，不进主线面板 ====== */
  // 计划总结 API 拉取的日程 → 只用于日历右栏事件显示
  const [apiSchedules, setApiSchedules] = useState([]);
  // 种子化完成标记：为 true 后不再用 MOCK_EVENTS_RAW 做 fallback
  // （否则用户删除 API 事件后 MOCK 副本会重新出现 → "删除不成功"假象）
  const [seedDone, setSeedDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 1) 年度规划重算（realHabits 变化时也触发）
      const planBase = computeInitialMonthTasks(year, month);
      if (!cancelled) {
        setMonthTasks(prev => {
          const stateMap = new Map(prev.map(p => [p.id, { done: p.done, progress: p.progress }]));
          const base = planBase.map(m => {
            const st = stateMap.get(m.id);
            if (!st) return m;
            return { ...m, done: st.done, progress: st.done ? 1 : st.progress };
          });
          // 关键：保留用户通过 ScheduleForm 保存后注入的真实 API 事项（__fromSchedule），
          // 否则 realHabits 异步到达触发本 effect 重算时，会把刚建的主线条目整个冲掉（"出现没多久就不见了"）
          const injected = prev.filter(t =>
            t.__fromSchedule && !base.find(b => String(b.id) === String(t.id)) && overlapsMonth(t, year, month)
          );
          return [...base, ...injected];
        });
      }

      const monthS = `${year}-${String(month).padStart(2, '0')}-01`;
      const monthE = toISODate(endOfMonth(fromISODate(monthS)));

      // 2) 种子同步：把 seed 独立日程 + MOCK 演示事件（仅限当前月）统一写入 ethan_schedules
      //    · 第一次打开时用户能看到月历上所有示例事件；之后改类型/删除都能落到真实 API 上
      //    · 已存在的（按 title.trim 去重）跳过，避免重复插入
      //    · 持久化标记：种子化只在"本用户+本月"首次刷新时执行一次，
      //      之后用户删除的事件刷新后不会被重新种子化复活（根因修复）
      const seedCreateAll = async () => {
        if (isSeedDoneForMonth(year, month)) {
          // 已种子化过：仅刷新日历事件源，不再 create 任何 seed
          store?.broadcast?.({ type: 'reload' });
          return;
        }
        let remotes = await API.schedules.list({ from: monthS, to: monthE });
        // 清理重复：同一 title+date 可能因多次种子化产生多条，只留 id 最小的那条
        // （用户删一条还剩多条 → "删了还在"假象）
        const allSchedules = remotes?.schedules || [];
        const seenKey = new Map();
        const dupIds = [];
        for (const s of allSchedules) {
          const k = `${String(s.title || '').trim()}|${s.date || ''}`;
          if (seenKey.has(k)) {
            const prev = seenKey.get(k);
            const keep = Number(prev.id) < Number(s.id) ? prev : s;
            const kill = Number(prev.id) < Number(s.id) ? s : prev;
            dupIds.push(kill.id);
            seenKey.set(k, keep);
          } else {
            seenKey.set(k, s);
          }
        }
        for (const id of dupIds) {
          try { await API.schedules.remove(id); } catch (_) { /* ignore */ }
        }
        // 重新拉取（去重后）
        remotes = await API.schedules.list({ from: monthS, to: monthE });
        const existing = new Set((remotes?.schedules || []).map(s => String(s.title).trim()));
        const seeds = [];
        // 2a) 独立种子（体检等）
        for (const t of SEED_ENERGY_NONHABIT) {
          if (!overlapsMonth(t, year, month)) continue;
          if (existing.has(String(t.title).trim())) continue;
          const mod = keyToModule(t.moduleKey);
          const fbDate = t.start_date || monthS;
          seeds.push({
            title: t.title, start_date: fbDate, date: fbDate, end_date: t.end_date || null,
            category: mod.cat, is_key: 1,
            note: [t.dueDate, t.note].filter(Boolean).join(' · ') || null,
            start_time: null, end_time: null,
          });
        }
        // 2b) MOCK_EVENTS_RAW 当前月内的演示事件 — 写进 ethan_schedules 变成真实 API 记录
        //     （这样月历上所有"OKR Q3 复盘会 14:00"等事项点进去都是 ScheduleForm，能改类型、能删除）
        const mockPrefix = `${year}-${String(month).padStart(2, '0')}`;
        for (const ev of MOCK_EVENTS_RAW) {
          if (!ev.date?.startsWith(mockPrefix)) continue;
          const title = String(ev.title || '').trim();
          if (!title || existing.has(title)) continue;
          const cat = Number(ev.category);
          seeds.push({
            title, start_date: ev.date, date: ev.date, end_date: null,
            category: Number.isFinite(cat) ? cat : 3,
            is_key: cat === 1 || cat === 2 ? 1 : 0,
            note: null,
            start_time: null, end_time: null,
          });
        }
        for (const s of seeds) {
          try { await API.schedules.create(s); } catch (_) { /* dup */ }
        }
        // 落标记：后续刷新不再种子化，删除的事件不会被复活
        markSeedDoneForMonth(year, month);
        store?.broadcast?.({ type: 'reload' });
      };
      try { await seedCreateAll(); } catch (_) { /* ignore */ }

      // 3) 拉取 ethan_schedules → 日历事件源 + 注入五大模块事项到本月主线
      //    （切页回来后 CalendarPage 重新挂载，monthTasks 初始值为 planBase，
      //     用户新建的事项只存在 API 里，需要从这里重新注入主线）
      try {
        const remote = await API.schedules.list({ from: monthS, to: monthE });
        const remoteSchedules = remote?.schedules || [];
        const mapped = remoteSchedules.map(s => {
          const mod = catToModule(s.category);
          return {
            id: s.id,
            __origin: 'api',
            date: s.start_date || s.schedule_date || s.date,
            title: s.title,
            category: s.category,
            moduleKey: mod.key,
            is_done: !!s.is_done,
            start_time: s.start_time,
            end_time: s.end_time,
            duration_min: s.duration_min,
            note: s.note || '',
            end_date: s.end_date || null,
            start_date: s.start_date || s.date,
          };
        });
        // 从 apiSchedules 里也剔除本地 tombstone 记录（防止日历右栏/月历再显示"已删"事项）
        const cleaned = mapped.filter(s => s.id == null || !isScheduleDeletedLocally(s.id));
        if (!cancelled) { setApiSchedules(cleaned); setSeedDone(true); }

        // 只注入「用户通过 ScheduleForm 新建」的事项到 monthTasks（切页回来恢复）
        // 排除：① planBase 已有（按 title 去重，因为 planBase 用字符串 id、API 用数字 id，id 比对无效）
        //       ② 种子化的 MOCK 演示事件（按 title 匹配 MOCK_EVENTS_RAW，这些不该进主线面板）
        if (!cancelled) {
          setMonthTasks(prev => {
            const existingTitles = new Set(prev.map(t => normTitle(t.title || '')));
            const mockTitles = new Set(MOCK_EVENTS_RAW.map(e => normTitle(e.title || '')));
            const toInject = mapped
              .filter(s => {
                const cat = Number(s.category);
                return [1, 2, 5, 6, 7].includes(cat);
              })
              .filter(s => {
                const sd = s.start_date || s.date;
                if (!sd) return true;
                return sd >= monthS && sd <= monthE;
              })
              .filter(s => {
                const nt = normTitle(s.title || '');
                return !existingTitles.has(nt) && !mockTitles.has(nt);
              })
              // 兜底：本地 tombstone 里标记为已删除的 API 记录，即便拉到也不再注入主线
              .filter(s => s.id == null || !isScheduleDeletedLocally(s.id))
              .map(s => {
                const mod = catToModule(Number(s.category));
                return {
                  id: s.id,
                  __origin: 'api',
                  __fromSchedule: true,
                  moduleKey: mod.key,
                  title: s.title || '',
                  done: !!s.is_done,
                  progress: s.is_done ? 1 : 0,
                  start_date: s.start_date,
                  end_date: s.end_date || null,
                  schedule_date: s.start_date,
                  date: s.start_date,
                  note: s.note || '',
                  isLongTerm: false,
                  start_time: s.start_time || null,
                  end_time: s.end_time || null,
                  category: Number(s.category),
                  srcTag: `≡ ${mod.label}事项`,
                  srcTagColor: mod.soft,
                  srcTagTextColor: mod.color,
                };
              });
            if (toInject.length === 0) return prev;
            return [...prev, ...toInject];
          });

          // 同步重算 weekTasks：WEEK_SEED(过滤已删) + ethan_schedules 本周 span 五大模块事项
          // 解决：1) WEEK_SEED 中被删的 id 刷新后不再复活 2) 用户新建的本周 span 事项刷 新后仍存在
          const weekSISO = toISODate(startOfWeek(todayISO));
          const weekEISO = toISODate(endOfWeek(todayISO));
          setWeekTasks(prevWeek => {
            // 保留用户在 WEEK_SEED 合成任务上改过的 done/progress（否则刷新后进度丢失）
            const seedStateMap = new Map();
            prevWeek.forEach(t => {
              if (t && typeof t.id === 'string' && /^w\d+$/.test(t.id)) {
                seedStateMap.set(String(t.id), { done: !!t.done, progress: Number(t.progress || 0) });
              }
            });
            const recomputed = computeInitialWeekTasks(weekSISO, weekEISO, cleaned);
            // merge: 如果 recomputed 里已经有同 id（真实 api schedule）→ 保留；否则补上 seedState 改动
            return recomputed.map(t => {
              const st = seedStateMap.get(String(t.id));
              if (!st) return t;
              return { ...t, done: st.done, progress: st.done ? 1 : st.progress };
            });
          });
        }
      } catch (_) { if (!cancelled) setApiSchedules([]); }

      if (!cancelled) setTick(v => v + 1);
    })();
    return () => { cancelled = true; };
  }, [year, month, computeInitialMonthTasks]);

  /* ===== 跨组件同步：ScheduleForm 保存/删除事项后，实时注入或移除主线对应条目
       · 只有属于五大主线模块（精力=6/知力=7/能力=2/工作=1/生活=5）的事项才进本月主线
       · 并且时间 span 与当前月有交集（overlapsMonth），避免把 2025 年的事项塞进 2026 年视图
       · "更新"操作：先删旧（按 id）再新增，保持分类/配色/span 与最新数据一致
       · "删除"操作：按 id 移除主线条目 */
  useEffect(() => {
    function buildProxyTask(s) {
      const cat = Number(s.category);
      const mod = catToModule(cat);
      const start_date = (s.start_date || s.schedule_date || s.date) || null;
      const end_date = s.end_date || null;
      return {
        id: Number(s.id),
        __origin: 'api',
        __fromSchedule: true,
        moduleKey: mod.key,
        title: s.title || '',
        done: !!s.is_done,
        progress: s.is_done ? 1 : 0,
        start_date,
        end_date,
        schedule_date: start_date,
        date: start_date,
        note: s.note || '',
        isLongTerm: false,
        start_time: s.start_time || null,
        end_time: s.end_time || null,
        category: mod.cat,
        schedulePayload: s,
        srcTag: `≡ ${mod.label}事项`,
        srcTagColor: mod.soft,
        srcTagTextColor: mod.color,
      };
    }
    function upsertScheduleIntoMonthTasks(s) {
      if (!s) return;
      // 本地 tombstone 兜底：刚刚被用户删掉的 id 即使 API 短暂回返也不注入主线
      if (s.id != null && isScheduleDeletedLocally(s.id)) return;
      const mod = catToModule(Number(s.category));
      // 只保留五大主线模块；cat=3(其他)不进本月主线
      if (![1, 2, 5, 6, 7].includes(mod.cat)) return;
      const proxyTask = buildProxyTask(s);
      if (!overlapsMonth(proxyTask, year, month)) return;
      setMonthTasks(prev => {
        const filtered = prev.filter(t => String(t.id) !== String(proxyTask.id));
        const groupFirstIdx = filtered.findIndex(t => t.moduleKey === mod.key);
        if (groupFirstIdx < 0) return [...filtered, proxyTask];
        const copy = [...filtered];
        copy.splice(groupFirstIdx, 0, proxyTask);
        return copy;
      });
    }
    /* 与上面对称：schedule_saved 如果落在本周 span → 也注入 weekTasks，
       保证用户在"本月主线/本周主线"任一 +按钮新建的本周事项，本周面板立刻可见 */
    function upsertScheduleIntoWeekTasks(s) {
      if (!s) return;
      if (s.id != null && isScheduleDeletedLocally(s.id)) return;
      const mod = catToModule(Number(s.category));
      if (![1, 2, 5, 6, 7].includes(mod.cat)) return;
      const proxyTask = buildProxyTask(s);
      const ws = toISODate(startOfWeek(todayISO));
      const we = toISODate(endOfWeek(todayISO));
      if (!overlapsWeek(proxyTask, ws, we)) return;
      setWeekTasks(prev => {
        const filtered = prev.filter(t => String(t.id) !== String(proxyTask.id));
        const groupFirstIdx = filtered.findIndex(t => t.moduleKey === mod.key);
        if (groupFirstIdx < 0) return [...filtered, proxyTask];
        const copy = [...filtered];
        copy.splice(groupFirstIdx, 0, proxyTask);
        return copy;
      });
    }
    const unsub = store.subscribe((msg) => {
      if (!msg) return;
      if (msg.type === 'schedule_saved') {
        // 保存回来（新建 / 编辑）：从 tombstone 移出，避免用户先删再改标题新建回来时被误过滤
        if (msg.schedule?.id != null) unmarkScheduleDeletedLocally(msg.schedule.id);
        upsertScheduleIntoMonthTasks(msg.schedule);
        upsertScheduleIntoWeekTasks(msg.schedule);
        // 同步更新 apiSchedules（日历事件源），否则删除/编辑后日历格子不刷新
        setApiSchedules(prev => {
          const idx = prev.findIndex(s => String(s.id) === String(msg.schedule.id));
          const mod = catToModule(Number(msg.schedule.category));
          const mapped = {
            id: msg.schedule.id,
            __origin: 'api',
            date: msg.schedule.start_date || msg.schedule.date,
            title: msg.schedule.title,
            category: msg.schedule.category,
            moduleKey: mod.key,
            is_done: !!msg.schedule.is_done,
            start_time: msg.schedule.start_time,
            end_time: msg.schedule.end_time,
            duration_min: msg.schedule.duration_min,
            note: msg.schedule.note || '',
          };
          if (idx < 0) return [...prev, mapped];
          const copy = [...prev];
          copy[idx] = mapped;
          return copy;
        });
        setTick(v => v + 1);
      } else if (msg.type === 'schedule_deleted' && msg.schedule?.id != null) {
        const delId = String(msg.schedule.id);
        // 从主线 + 周主线 + 日历事件源 三处一起删（避免本周卡片/月历里还看得到）
        setMonthTasks(prev => prev.filter(t => String(t.id) !== delId));
        setWeekTasks(prev => prev.filter(t => String(t.id) !== delId));
        setApiSchedules(prev => prev.filter(s => String(s.id) !== delId));
        setTick(v => v + 1);
      }
    });
    return unsub;
  }, [year, month, todayISO]);

  // 经过月份 span 过滤后的主线任务（展示用）
  const visibleMonthTasks = useMemo(
    () => monthTasks.filter(t => overlapsMonth(t, year, month)),
    [monthTasks, year, month]
  );
  const visibleWeekTasks = useMemo(
    () => weekTasks, // week 维度不做全年过滤，保持简洁
    [weekTasks]
  );

  const monthProgress = (() => {
    const arr = visibleMonthTasks;
    if (!arr.length) return 0;
    return Math.round((arr.reduce((s, t) => s + (t.done ? 1 : t.progress), 0) / arr.length) * 100);
  })();
  const monthTimePct = 55;

  const weekProgress = (() => {
    const arr = visibleWeekTasks;
    if (!arr.length) return 0;
    return Math.round((arr.reduce((s, t) => s + (t.done ? 1 : t.progress), 0) / arr.length) * 100);
  })();
  const weekTimePct = 48;

  const prevMonth = useCallback(() => {
    let m = month - 1, y = year;
    if (m < 1) { m = 12; y -= 1; }
    setMonth(m); setYear(y);
  }, [year, month]);

  const nextMonth = useCallback(() => {
    let m = month + 1, y = year;
    if (m > 12) { m = 1; y += 1; }
    setMonth(m); setYear(y);
  }, [year, month]);

  /* === 组内拖拽排序（来自 FocusPanel onReorder）
       · 跨组禁止（FocusPanel 已通过 groupKey 一致门禁）
       · 仅在传入 tasks 数组内重排，isolate 到对应月/周状态
       · 习惯项 (isHabit) & 子项 (isSubItem) 不参与排序（FocusPanel 已禁 draggable） */
  const reorderTask = useCallback((groupKey, fromId, toId, { isMonth = true } = {}) => {
    const setter = isMonth ? setMonthTasks : setWeekTasks;
    setter(prev => {
      const arr = [...prev];
      const fromIdx = arr.findIndex(t => t.id === fromId);
      const toIdx = arr.findIndex(t => t.id === toId);
      if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return prev;
      // 限制：只允许同 groupKey 范围内互调
      const sameGroup = (t) => t.moduleKey === groupKey;
      // 找到 group 内的序号范围
      const first = arr.findIndex(sameGroup);
      const last = [...arr].map((t, i) => sameGroup(t) ? i : -1).filter(i => i >= 0).sort((a, b) => a - b).at(-1);
      if (first < 0 || last < 0) return prev;
      // 如果目标在 group 范围外，就夹到边界
      const safeToIdx = Math.max(first, Math.min(last, toIdx));
      const [moved] = arr.splice(fromIdx, 1);
      // 经过 splice 后索引偏回 1：再插回 safeToIdx（考虑删掉后索引收缩）
      let insertPos = safeToIdx;
      if (fromIdx < safeToIdx) insertPos -= 1;
      arr.splice(insertPos, 0, moved);
      return arr;
    });
  }, []);

  /* === 勾选主线任务：仅复选框触发（来自 FocusPanel onToggle）
       同步修改月格对应事件的 is_done（MOCK_EVENTS_RAW），保证左卡勾完右格立即变色 */
  const toggleTask = useCallback((taskId, isMonth) => {
    const setter = isMonth ? setMonthTasks : setWeekTasks;
    setter(prev => prev.map(t => {
      if (t.id !== taskId) return t;
      const nextDone = !t.done;
      // 联动：月历事件（标题匹配）的 is_done 立即同步
      const normT = normTitle(t.title);
      MOCK_EVENTS_RAW.forEach(raw => {
        if (titleMatches(raw.title, t.title)) raw.is_done = nextDone;
      });
      // 避免未使用变量告警
      void normT;
      return { ...t, done: nextDone, progress: nextDone ? 1 : t.progress };
    }));
    setTick(v => v + 1);
  }, []);

  /* === 右键删除 FocusPanel 任务 → 移入回收站
       · 合成任务（id 非纯数字、非 API 来源）：仅本地删除 + 入回收站（原行为）
       · 真实 ethan_schedules 记录（数字 id / __origin='api' / __fromSchedule）：
           同步调 API.schedules.remove 真正从 DB 删除，否则"刷新后 effect 重新拉 API
           会把该记录再次注入 monthTasks → 删不掉复活"，这是本次根因；
           同时写入本地 tombstone 双保险（极端离线/接口失败也过滤）；
           并且不放入回收站（回收站只存 AnnualPlan 合成任务，避免"还原"一个 DB 已删的东西） */
  const deleteTask = useCallback((task, { isMonth = true } = {}) => {
    const setTasks   = isMonth ? setMonthTasks   : setWeekTasks;
    const setDeleted = isMonth ? setDeletedMonthTasks : setDeletedWeekTasks;
    const tid = task?.id;
    const tidStr = String(tid || '');
    const isRealApiSchedule = (task && (task.__origin === 'api' || task.__fromSchedule === true))
      || (tid != null && /^\d+$/.test(tidStr));

    // 1) 乐观更新：从主线/周主线立即移除（UI 立刻消失）
    let removed = null;
    setTasks(prev => {
      const next = [];
      for (const t of prev) {
        if (String(t.id) === tidStr) { removed = t; continue; }
        next.push(t);
      }
      return next;
    });

    // 2) 真实 API 任务：后端删除 + 广播 + 本地 tombstone；不进回收站
    if (isRealApiSchedule) {
      // 写 tombstone（先写，防止异步删除窗口期有重注入）
      markScheduleDeletedLocally(tid);
      const category = Number(task.category ?? task.schedulePayload?.category ?? null);
      const schedulePayload = task?.schedulePayload ?? { id: tid };
      // 广播：让 apiSchedules 也立刻移除（日历右栏/月历小圆点同步消失）
      store?.broadcast?.({ type: 'schedule_deleted', schedule: { id: tid, category } });
      // 异步调后端 DELETE，完成后再广播一次确保下游 listeners 都知道
      (async () => {
        try {
          if (API?.schedules?.remove) await API.schedules.remove(tid);
        } catch (_) { /* ignore；tombstone 会兜底过滤 */ }
        store?.broadcast?.({ type: 'schedule_deleted', schedule: { id: tid, category } });
      })();
      setTick(v => v + 1);
      void schedulePayload;
      return;
    }

    // 3) 合成任务（AnnualPlan / Seed / WEEK_SEED）：
    //    - WEEK_SEED 任务（id 形如 w1..w5、且是周面板删除）→ 额外写 LS tombstone
    //      （刷新后 useState(computeInitialWeekTasks) 会按 tombstone 过滤掉 → 不再复活）
    //    - 其他 AnnualPlan 合成任务：原逻辑入回收站（可还原，不持久化删除）
    if (removed) setDeleted(prev => [removed, ...prev.filter(x => String(x.id) !== tidStr)]);
    if (!isMonth && typeof tid === 'string' && /^w\d+$/.test(tidStr)) {
      markWeekSeedDeletedLocally(tid);
    }
    setTick(v => v + 1);
  }, []);
  const restoreTask = useCallback((task, { isMonth = true } = {}) => {
    const setTasks   = isMonth ? setMonthTasks   : setWeekTasks;
    const setDeleted = isMonth ? setDeletedMonthTasks : setDeletedWeekTasks;
    // 还原 WEEK_SEED：从本地 tombstone 里一并移除，不然刷新就又消失了
    const tid = task?.id;
    if (!isMonth && typeof tid === 'string' && /^w\d+$/.test(String(tid || ''))) {
      unmarkWeekSeedDeletedLocally(tid);
    }
    setDeleted(prev => prev.filter(t => t.id !== task.id));
    setTasks(prev => (prev.find(x => x.id === task.id) ? prev : [...prev, task]));
    setTick(v => v + 1);
  }, []);
  const openEditorForTask = useCallback((task, { isMonth = true } = {}) => {
    const title = task.title || '';
    const mod = keyToModule(task.moduleKey);
    const tid = String(task.id || '');

    // 真实 ethan_schedules 记录（纯数字 id 或 __origin='api'）：统一走 ScheduleForm「编辑事项」
    const isRealApiSchedule = task.__origin === 'api'
      || (typeof task.id === 'number' || /^\d+$/.test(tid));
    if (isRealApiSchedule) {
      onEditSchedule?.(
        { type: 'schedule', ...taskToScheduleInitial(task, todayISO) },
        { module: task.moduleKey, source: 'focusTask', isMonth }
      );
      return;
    }

    // —— 以下仅处理来自 AnnualPlan 聚合层的合成任务（带 bookData/milestoneData/krData 或 id 前缀可识别）——

    // 知力：① 书籍本身 bookData 存在 OR id 前缀 book_(read|think|action)_ OR 标题含书名/宝典 OR isSubItem（②③）
    const isCognitionBook = task.moduleKey === 'cognition' &&
      (task.bookData || /^book_(read|think|action)_/.test(tid)
        || /《.+》|宝典|书|读|纳瓦尔/.test(title) || task.isSubItem || task.parentId);
    if (isCognitionBook) {
      let bookInitial = task.bookData;
      let tab = task.bookData ? 'basic' : 'insights';
      if (!bookInitial && task.parentId) {
        const parentTask = monthTasks.find(t => t.id === task.parentId)
          || weekTasks.find(t => t.id === task.parentId);
        bookInitial = parentTask?.bookData;
        if (!bookInitial) {
          const bookId = task.parentId.replace(/^book_read_/, '');
          bookInitial = LS_BOOKS().find(b => String(b.bookId) === String(bookId))
            || BOOKS.find(b => String(b.bookId) === String(bookId));
        }
        tab = 'insights';
      }
      if (!bookInitial) {
        bookInitial = BOOKS.find(b => normTitle(b.t) === normTitle(title.replace(/[《》]/g, '')))
          || LS_BOOKS().find(b => normTitle(b.t) === normTitle(title.replace(/[《》]/g, '')))
          || { t: title.replace(/[《》]/g, ''), author: '', st: 'reading', pct: Math.round((task.progress || 0) * 100) };
      }
      onEditSchedule?.(
        { type: 'book', initial: bookInitial, tab },
        { module: task.moduleKey, source: 'focusTask' }
      );
      return;
    }

    // 能力：只有携带 milestoneData.initial（来自 aggregateTasksFromAnnualPlan）才开 MilestoneForm；
    // 没有 milestoneData 的普通 category=2 任务（如用户通过 +新增 → 分类勾到"能力"的普通任务）→ 走 ScheduleForm
    if (task.moduleKey === 'ability' && (task.milestoneData?.initial || /^ms_/.test(tid))) {
      const msInitial = task.milestoneData?.initial || {
        id: task.id, lb: title, st: task.done ? 'done' : task.progress > 0 ? 'doing' : 'pending',
        pct: Math.round((task.progress || 0) * 100), dueBy: task.dueDate?.replace(/^截止 /, '')?.replace('/', '-') || undefined,
      };
      onEditSchedule?.(
        { type: 'milestone', initial: msInitial, title, dueDate: task.dueDate, color: mod.color },
        { module: task.moduleKey, source: 'focusTask' }
      );
      return;
    }

    // 工作：只有携带 krData.initial 或 id 前缀 wk_goal_ 才开 KrForm；
    // 没有 krData 的普通 category=1 任务 → 走 ScheduleForm
    if (task.moduleKey === 'work' && (task.krData?.initial || /^wk_goal_/.test(tid))) {
      const krInitial = task.krData?.initial || {
        id: task.id, t: title, v: Math.round((task.progress || 0) * 100), tgt: 100, u: '%',
        st: task.done ? 'done' : task.progress > 0 ? 'doing' : 'pending',
      };
      onEditSchedule?.(
        { type: 'kr', initial: krInitial, title, color: mod.color, progress: Math.round((task.progress || 0) * 100) },
        { module: task.moduleKey, source: 'focusTask' }
      );
      return;
    }

    // 生活 / 精力 / 以及以上所有"虽 moduleKey=ability/work 但无专属数据"的普通任务 → 统一走 ScheduleForm
    onEditSchedule?.(
      { type: 'schedule', ...taskToScheduleInitial(task, todayISO) },
      { module: task.moduleKey, source: 'focusTask', isMonth }
    );
  }, [onEditSchedule, todayISO, monthTasks, weekTasks]);

  /* === 标签点击跳转：关联/同步/习惯同步·作息 等 srcTag 胶囊
       · 依据 task.moduleKey 映射到 AnnualPlan 的 view：
         energy→energy | cognition→cognition | ability→ability | work→work | life→life */
  const MODULE_TO_ANNUAL_VIEW = {
    energy:    'energy',
    cognition: 'cognition',
    ability:   'ability',
    work:      'work',
    life:      'life',
  };
  const handleTagClick = useCallback((task) => {
    if (!task || !onJumpToAnnualView) return;
    const viewKey = MODULE_TO_ANNUAL_VIEW[task.moduleKey] || 'overview';
    onJumpToAnnualView(viewKey, { task });
  }, [onJumpToAnnualView]);

  /* === 月历勾选同步：事件行复选框 → 若有 taskId 则同步主线 done；否则仅翻转事件 is_done === */
  const handleEventToggle = useCallback((ev, date) => {
    // 1) 如果与左卡关联，先同步左卡 done
    if (ev.taskId) {
      // month/week 都尝试改一下（用户周tab也可能看上月任务）
      setMonthTasks(prev => prev.map(t =>
        t.id === ev.taskId ? { ...t, done: !t.done, progress: !t.done ? 1 : t.progress } : t
      ));
      setWeekTasks(prev => prev.map(t =>
        t.id === ev.taskId ? { ...t, done: !t.done, progress: !t.done ? 1 : t.progress } : t
      ));
    }
    // 2) 事件自身状态翻转（若未匹配到 taskId 也能独立勾选）
    MOCK_EVENTS_RAW.forEach(raw => {
      if (raw.date === date && (raw.title || '') === (ev.title || '')) {
        raw.is_done = !raw.is_done;
      }
    });
    // 强制刷新（改变引用 → useMemo 重建 monthEvents）
    setTick(v => v + 1);
  }, []);

  /* === 月历事件标题点击 → 开对应编辑面板（左卡同映射逻辑） === */
  const handleEventClick = useCallback((ev, date) => {
    const mod = keyToModule(ev.moduleKey || 'others');
    const title = ev.title || ev.name || '';
    const isRealApiSchedule = ev.__origin === 'api'
      || (typeof ev.id === 'number' || /^\d+$/.test(String(ev.id)));

    // ====== 最高优先级：真实 ethan_schedules（计划总结页创建的事项）一律走 ScheduleForm「编辑事项」
    //        标题如"给家树买生日礼物、看电影《奥德赛》" → 用户点标题时必须可直接改类型/时间/删除
    if (isRealApiSchedule) {
      onEditSchedule?.(
        { type: 'schedule', ...eventToScheduleInitial(ev, date) },
        { module: ev.moduleKey, source: 'calendarEvent', date }
      );
      return;
    }

    // ====== 非真实 API 事件（MOCK 演示数据 / AnnualPlan 聚合 overlay）：
    //        按 moduleKey + 标题特征分流到专用面板；匹配不到才走 ScheduleForm「新建事项」兜底
    if (ev.moduleKey === 'cognition' && /《.+》|宝典|书|读|纳瓦尔|笔记/.test(title)) {
      const matched = BOOKS.find(b =>
        titleMatches(b.t, title) || normTitle(title).includes(normTitle(b.t))
      );
      const bookInitial = matched || {
        t: title.replace(/[《》]/g, '').replace(/读完|第.*章|笔记|纳瓦尔/g, '').trim() || title,
        st: ev.is_done ? 'done' : 'reading', pct: ev.is_done ? 100 : 30,
      };
      onEditSchedule?.(
        { type: 'book', initial: bookInitial, tab: matched ? 'basic' : 'insights' },
        { module: ev.moduleKey, source: 'calendarEvent', date }
      );
      return;
    }
    if (ev.moduleKey === 'ability') {
      onEditSchedule?.(
        { type: 'milestone', initial: { lb: title, st: ev.is_done ? 'done' : 'doing', pct: ev.is_done ? 100 : 20 }, title, color: mod.color },
        { module: ev.moduleKey, source: 'calendarEvent', date }
      );
      return;
    }
    if (ev.moduleKey === 'work') {
      onEditSchedule?.(
        { type: 'kr', initial: { t: title, v: ev.is_done ? 100 : 30, tgt: 100, u: '%', st: ev.is_done ? 'done' : 'doing' },
          title, color: mod.color, progress: ev.is_done ? 100 : 30 },
        { module: ev.moduleKey, source: 'calendarEvent', date }
      );
      return;
    }
    onEditSchedule?.(
      { type: 'schedule', ...eventToScheduleInitial(ev, date) },
      { module: ev.moduleKey, source: 'calendarEvent', date }
    );
  }, [onEditSchedule]);

  const weekStart = startOfWeek(todayISO);
  const weekEnd = endOfWeek(todayISO);
  const weekStartStr = `${weekStart.getMonth() + 1}.${weekStart.getDate()}`;
  const weekEndStr = `${weekEnd.getMonth() + 1}.${weekEnd.getDate()}`;

  /* === 月历事项：加入 taskId/is_done 引用同步左卡
       需求 6：日历右栏显示「计划总结 ethan_schedules + 本月主线单日事项」=== */
  const allTasks = useMemo(() => [...monthTasks, ...weekTasks], [monthTasks, weekTasks, tick]);
  // MOCK 演示事件 vs API 真实日程去重：同 date+title 优先保留 API 记录（有 id → 点击走 ScheduleForm，
  // 才有左下角删除按钮 + 类型修改落库；MOCK 副本没有 id 会被路由到 KrForm/MilestoneForm）
  function dedupeMockVsApi(mockRaw, apiRaw) {
    // 先对 apiRaw 自身去重（DB 可能因多次种子化产生重复条目），按 date|title 保留第一个
    const seenApi = new Set();
    const apiDeduped = apiRaw.filter(e => {
      const k = `${e.date}|${String(e.title || '').trim()}`;
      if (seenApi.has(k)) return false;
      seenApi.add(k);
      return true;
    });
    const apiKeys = new Set(apiDeduped.map(e => `${e.date}|${String(e.title || '').trim()}`));
    const mockOnly = mockRaw.filter(e => !apiKeys.has(`${e.date}|${String(e.title || '').trim()}`));
    return [...apiDeduped, ...mockOnly];
  }
  const monthEvents = useMemo(() => {
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    const apiRaw = apiSchedules.filter(e => e.date && e.date.startsWith(prefix));
    // 种子化完成后：只用 API 数据（用户删除 API 事件后不会被 MOCK fallback 复活）
    const mockRaw = seedDone ? [] : MOCK_EVENTS_RAW.filter(e => e.date && e.date.startsWith(prefix));
    return buildEventsWithTaskLink(dedupeMockVsApi(mockRaw, apiRaw), allTasks);
  }, [year, month, allTasks, apiSchedules, seedDone]);

  /* 习惯打卡热力图：从 realHabits（API 真实数据）聚合
     · realHabits = null 时（网络/未登录）回退空对象 → 格子右下角不显示
     · realHabits[i].allDates 是该习惯所有打卡日期 ["2026-09-01", ...]
     · habitsMap[date] = 当天完成的习惯数量
     · habitTarget = 习惯总数（动态分母）*/
  const { habitsMap, habitTarget } = useMemo(() => {
    if (!realHabits || realHabits.length === 0) return { habitsMap: {}, habitTarget: 0 };
    const map = {};
    for (const h of realHabits) {
      const dates = h.allDates || [];
      for (const d of dates) map[d] = (map[d] || 0) + 1;
    }
    return { habitsMap: map, habitTarget: realHabits.length };
  }, [realHabits]);

  const weekdayZh = ['日','一','二','三','四','五','六'];
  const detailDateObj = dayDetail?.date ? fromISODate(dayDetail.date) : null;
  const detailEvents = useMemo(() => {
    if (!dayDetail?.date) return [];
    const apiRaw = apiSchedules.filter(e => e.date === dayDetail.date);
    const mockRaw = seedDone ? [] : MOCK_EVENTS_RAW.filter(e => e.date === dayDetail.date);
    return buildEventsWithTaskLink(dedupeMockVsApi(mockRaw, apiRaw), allTasks);
  }, [dayDetail?.date, allTasks, apiSchedules, seedDone]);

  return (
    <div className="flex-1 min-w-0 max-w-[1320px] flex flex-col gap-4">
      {/* ===== Header ===== */}
      <div className="glass-card px-5 py-3.5">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1">
            <button onClick={prevMonth} className="w-8 h-8 rounded-xl hover:bg-black/5 flex items-center justify-center text-[#8e8e93] flex-shrink-0 transition">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"></path></svg>
            </button>
            <span className="text-[15px] font-bold text-[#1c1c1e] min-w-[92px] text-center tracking-tight">
              {year}年{month}月
            </span>
            <button onClick={nextMonth} className="w-8 h-8 rounded-xl hover:bg-black/5 flex items-center justify-center text-[#8e8e93] flex-shrink-0 transition">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"></path></svg>
            </button>
          </div>

          <div className="tab-group">
            <button className={tabView === 'month' ? 'active' : ''} onClick={() => setTabView('month')}>月</button>
            <button className={tabView === 'week'  ? 'active' : ''} onClick={() => setTabView('week')}>周</button>
            <button className={tabView === 'day'   ? 'active' : ''} onClick={() => setTabView('day')}>日</button>
          </div>

          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[12px] font-bold bg-[rgba(0,122,255,0.08)] text-[#0040DD]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#0040DD]" />
            本月主线 · 已完成 {monthProgress}%
          </span>

          <div className="flex-1" />

          <button
            onClick={() => onEditSchedule?.()}
            className="px-3.5 py-1.5 rounded-[9px] text-[13px] font-semibold text-white bg-[#007AFF] hover:brightness-105 transition border-none cursor-pointer"
            style={{ boxShadow: '0 3px 8px rgba(0,122,255,0.25)' }}
          >
            + 新建
          </button>
        </div>
      </div>

      {/* ===== Body: 12 列网格 ===== */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-4 flex flex-col gap-4">
          {(tabView === 'month' || tabView === 'day') && (
            <FocusPanel
              type="month"
              accentColor="#007AFF"
              title={tabView === 'month' ? '本月主线' : '本月 · 上下文'}
              tasks={visibleMonthTasks}
              progressPct={monthProgress}
              timePct={monthTimePct}
              onToggle={(id) => toggleTask(id, true)}
              onAdd={() => onEditSchedule?.()}
              onEditTask={(task) => openEditorForTask(task, { isMonth: true })}
              onDeleteTask={(task) => deleteTask(task, { isMonth: true })}
              onRestoreTask={(task) => restoreTask(task, { isMonth: true })}
              onTagClick={handleTagClick}
              onReorder={(gk, fid, tid) => reorderTask(gk, fid, tid, { isMonth: true })}
              deletedTasks={deletedMonthTasks}
              compact={tabView !== 'month'}
            />
          )}

          {tabView === 'week' && (
            <FocusPanel
              type="week"
              accentColor="#007AFF"
              title={`本周主线 · ${weekStartStr}-${weekEndStr}`}
              tasks={visibleWeekTasks}
              progressPct={weekProgress}
              timePct={weekTimePct}
              onToggle={(id) => toggleTask(id, false)}
              onAdd={() => onEditSchedule?.()}
              onEditTask={(task) => openEditorForTask(task, { isMonth: false })}
              onDeleteTask={(task) => deleteTask(task, { isMonth: false })}
              onRestoreTask={(task) => restoreTask(task, { isMonth: false })}
              onTagClick={handleTagClick}
              onReorder={(gk, fid, tid) => reorderTask(gk, fid, tid, { isMonth: false })}
              deletedTasks={deletedWeekTasks}
            />
          )}
        </div>

        {/* 右栏：月日历网格（勾选/编辑/空白点击统一走上面的 handlers） */}
        <div className="col-span-12 lg:col-span-8">
          <div
            className="bg-white"
            style={{ borderRadius: '18px', boxShadow: '0 0 0 1px rgba(0,0,0,0.04), 0 8px 32px rgba(0,0,0,0.06)' }}
          >
            <MonthCalendarGrid
              year={year}
              month={month}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              events={monthEvents}
              habitsMap={habitsMap}
              habitTarget={habitTarget}
              onEventToggle={handleEventToggle}
              onEventClick={handleEventClick}
              onCellOpenDay={(date) => setDayDetail({ date })}
            />

            <div className="flex items-center gap-4 px-5 py-3 pb-4 flex-wrap">
              {MODULES.filter(m => m.key !== 'others').map(m => (
                <span key={m.key} className="inline-flex items-center gap-1.5 text-[12px] font-medium" style={{ color: m.color }}>
                  <span className="w-2 h-2 rounded-full" style={{ background: m.color }} />
                  {m.label}
                </span>
              ))}
              <div className="flex-1" />
              <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#007AFF]">
                <span className="w-2 h-2 rounded-full" style={{ background: '#007AFF', boxShadow: '0 2px 6px rgba(0,122,255,0.35)' }} />
                今日
              </span>
              <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#0040DD]">
                <span className="w-2 h-2 rounded-full" style={{ background: 'transparent', boxShadow: 'inset 0 0 0 2px rgba(0,122,255,0.45)' }} />
                选中
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ===== 需求 4：当日事项详情 Modal（复用 FocusPanel 面板样式 + 玻璃卡 18px 倒角）===== */}
      {dayDetail && detailDateObj && (
        <Modal
          open
          onClose={() => setDayDetail(null)}
          title={
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-[12px] font-bold"
                style={{ background: 'rgba(0,122,255,0.10)', color: '#0040DD' }}>
                {detailDateObj.getMonth() + 1}.{detailDateObj.getDate()} 周{weekdayZh[detailDateObj.getDay()]}
              </span>
              <span className="text-[#1c1c1e]">当日事项</span>
              <span className="text-[12px] font-bold text-[#8E8E93] ml-1">{detailEvents.length} 条</span>
            </div>
          }
          footer={
            <button
              className="px-3.5 py-1.5 rounded-[7px] text-[13px] font-semibold text-white bg-[#007AFF] hover:brightness-105 transition border-none cursor-pointer"
              style={{ boxShadow: '0 3px 8px rgba(0,122,255,0.25)' }}
              onClick={() => {
                onEditSchedule?.(
                  { type: 'schedule', schedule_date: dayDetail.date, start_time: '09:00', end_time: '10:00' },
                  { source: 'dayDetailNew', date: dayDetail.date }
                );
              }}
            >+ 新增当日事项</button>
          }
          maxWidth={720}
        >
          <div className="flex flex-col gap-4">
            {detailEvents.length === 0 ? (
              <div className="py-8 text-center">
                <div className="text-[14px] font-semibold text-[#1C1C1E]">当日还没有安排</div>
                <div className="text-[12px] text-[#8E8E93] mt-1">点击右下角「+ 新增当日事项」即可创建</div>
              </div>
            ) : (
              <FocusPanel
                type="day"
                accentColor="#007AFF"
                title={`${detailDateObj.getMonth()+1}.${detailDateObj.getDate()} 周${weekdayZh[detailDateObj.getDay()]} 事项`}
                tasks={detailEvents.map((ev, idx) => {
                  const mod = keyToModule(ev.moduleKey || 'others');
                  return {
                    id: ev.id || `${ev.date}-${idx}`,
                    moduleKey: mod.key,
                    title: ev.title,
                    done: Boolean(ev.is_done || ev.done),
                    progress: ev.is_done ? 1 : 0,
                    note: [ev.start_time, ev.end_time].filter(Boolean).join(' - ') || undefined,
                    srcTag: ev.srcTag,
                    srcTagColor: ev.srcTagColor,
                    srcTagTextColor: ev.srcTagTextColor,
                  };
                })}
                onToggle={(id) => {
                  const ev = detailEvents.find(e => (e.id || `${e.date}-${detailEvents.indexOf(e)}`) === id);
                  if (ev) handleEventToggle(ev, dayDetail.date);
                }}
                onAdd={() => onEditSchedule?.(
                  { type: 'schedule', schedule_date: dayDetail.date, start_time: '09:00', end_time: '10:00' },
                  { source: 'dayDetailAdd', date: dayDetail.date }
                )}
                onTagClick={handleTagClick}
                onEditTask={(task) => {
                  const ev = detailEvents.find(e => (e.id || `${e.date}-${detailEvents.indexOf(e)}`) === task.id);
                  if (ev) handleEventClick(ev, dayDetail.date);
                }}
              />
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
