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

// 习惯打卡热力图：月历日格右下角的彩色 1-4 圆点数（保持模拟数据做直观效果）
const MOCK_HABITS = {};
for (let d = 16; d <= 31; d++) {
  const dateISO = `2026-08-${String(d).padStart(2, '0')}`;
  MOCK_HABITS[dateISO] = Math.max(1, Math.min(4, Math.floor(Math.random() * 3) + 1));
}
for (let d = 1; d <= 15; d++) {
  const dateISO = `2026-09-${String(d).padStart(2, '0')}`;
  MOCK_HABITS[dateISO] = Math.max(1, Math.min(4, Math.floor(Math.random() * 4) + 1));
}

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
  const [weekTasks, setWeekTasks] = useState(WEEK_SEED);

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 1) 年度规划重算（realHabits 变化时也触发）
      const planBase = computeInitialMonthTasks(year, month);
      if (!cancelled) {
        setMonthTasks(prev => {
          const stateMap = new Map(prev.map(p => [p.id, { done: p.done, progress: p.progress }]));
          return planBase.map(m => {
            const st = stateMap.get(m.id);
            if (!st) return m;
            return { ...m, done: st.done, progress: st.done ? 1 : st.progress };
          });
        });
      }

      // 2) 拉取 ethan_schedules → 只用于日历右栏（需求 6：不进主线面板）
      const monthS = `${year}-${String(month).padStart(2, '0')}-01`;
      const monthE = toISODate(endOfMonth(fromISODate(monthS)));
      try {
        const remote = await API.schedules.list({ from: monthS, to: monthE });
        const remoteSchedules = remote?.schedules || [];
        if (!cancelled) {
          setApiSchedules(remoteSchedules.map(s => {
            const mod = catToModule(s.category);
            return {
              // 必须保留纯数字 id（不包 api_ 前缀），否则 eventToScheduleInitial 正则 /^\d+$/ 丢弃为 undefined，
              // ScheduleForm 误走入"新建事项"模式并丢失编辑能力；同时服务器 Number(id) 也只认数字
              id: s.id,
              __origin: 'api',  // 仅本地调试标记
              date: s.start_date || s.schedule_date || s.date,
              title: s.title,
              category: s.category,
              moduleKey: mod.key,
              is_done: !!s.is_done,
              start_time: s.start_time,
              end_time: s.end_time,
              duration_min: s.duration_min,
              note: s.note || '',
            };
          }));
        }
      } catch (_) { if (!cancelled) setApiSchedules([]); }

      // 3) 同步：种子独立日程（体检等）写回 ethan_schedules（计划总结页 KeyTasks/时间线才显示）
      try {
        const remote2 = await API.schedules.list({ from: monthS, to: monthE });
        const existing = new Set((remote2?.schedules || []).map(s => String(s.title).trim()));
        for (const t of SEED_ENERGY_NONHABIT) {
          if (!overlapsMonth(t, year, month)) continue;
          if (existing.has(String(t.title).trim())) continue;
          const mod = keyToModule(t.moduleKey);
          const fbDate = t.start_date || monthS;
          try {
            await API.schedules.create({
              title: t.title, start_date: fbDate, date: fbDate, end_date: t.end_date || null,
              category: mod.cat, is_key: 1,
              note: [t.dueDate, t.note].filter(Boolean).join(' · ') || null,
              start_time: null, end_time: null,
            });
          } catch (_) { /* dup */ }
        }
        store?.broadcast?.({ type: 'reload' });
      } catch (_) { /* ignore */ }

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
    function upsertScheduleIntoMonthTasks(s) {
      if (!s) return;
      const cat = Number(s.category);
      const mod = catToModule(cat);
      // 只保留五大主线模块；cat=3(其他)不进本月主线
      if (![1, 2, 5, 6, 7].includes(mod.cat)) return;
      const scheduleDate = s.start_date || s.schedule_date || s.date;
      const start_date = scheduleDate || null;
      const end_date = s.end_date || null;
      const proxyTask = {
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
      if (!overlapsMonth(proxyTask, year, month)) return;
      setMonthTasks(prev => {
        const filtered = prev.filter(t => String(t.id) !== String(proxyTask.id));
        // 插到同 moduleKey 组的第一个位置（让用户新建的事立即能在本组顶部看到）
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
        upsertScheduleIntoMonthTasks(msg.schedule);
        setTick(v => v + 1);
      } else if (msg.type === 'schedule_deleted' && msg.schedule?.id != null) {
        setMonthTasks(prev => prev.filter(t => String(t.id) !== String(msg.schedule.id)));
        setTick(v => v + 1);
      }
    });
    return unsub;
  }, [year, month]);

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
       仅非抓取任务（!isFromFetch）可删；FocusPanel 自己已做 isFromFetch 门禁 */
  const deleteTask = useCallback((task, { isMonth = true } = {}) => {
    const setTasks   = isMonth ? setMonthTasks   : setWeekTasks;
    const setDeleted = isMonth ? setDeletedMonthTasks : setDeletedWeekTasks;
    let removed = null;
    setTasks(prev => {
      const next = [];
      for (const t of prev) {
        if (t.id === task.id) { removed = t; continue; }
        next.push(t);
      }
      return next;
    });
    if (removed) setDeleted(prev => [removed, ...prev.filter(x => x.id !== removed.id)]);
    setTick(v => v + 1);
  }, []);
  const restoreTask = useCallback((task, { isMonth = true } = {}) => {
    const setTasks   = isMonth ? setMonthTasks   : setWeekTasks;
    const setDeleted = isMonth ? setDeletedMonthTasks : setDeletedWeekTasks;
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
  const monthEvents = useMemo(() => {
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    // 合并：MOCK 演示事件 + API 真实日程（计划总结页创建的事项）
    const mockRaw = MOCK_EVENTS_RAW.filter(e => e.date && e.date.startsWith(prefix));
    const apiRaw = apiSchedules.filter(e => e.date && e.date.startsWith(prefix));
    const combined = [...mockRaw, ...apiRaw];
    return buildEventsWithTaskLink(combined, allTasks);
  }, [year, month, allTasks, apiSchedules]);

  const weekdayZh = ['日','一','二','三','四','五','六'];
  const detailDateObj = dayDetail?.date ? fromISODate(dayDetail.date) : null;
  const detailEvents = useMemo(() => {
    if (!dayDetail?.date) return [];
    const mockRaw = MOCK_EVENTS_RAW.filter(e => e.date === dayDetail.date);
    const apiRaw = apiSchedules.filter(e => e.date === dayDetail.date);
    return buildEventsWithTaskLink([...mockRaw, ...apiRaw], allTasks);
  }, [dayDetail?.date, allTasks, apiSchedules]);

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
              habitsMap={MOCK_HABITS}
              habitTarget={4}
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
