import { useState, useMemo, useCallback } from 'react';
import { today as getToday, fromISODate, startOfWeek, endOfWeek, toISODate } from '../utils/date.js';
import { MODULES, keyToModule } from '../utils/categoryMapping.js';
import MonthCalendarGrid from '../components/calendar/MonthCalendarGrid.jsx';
import FocusPanel from '../components/calendar/FocusPanel.jsx';
import Modal from '../components/Modal.jsx';

/* ============================================================
 * 日历页面 · 月视图容器（v2 交互升级）
 *   - 1) FocusPanel 事项标题点击 → 对应编辑面板
 *   - 2) 复选框独立 stopPropagation，只点它才勾选
 *   - 3) 月历事件 w-1 小圆点 → 复选框，done 状态与主线同步；周末列灰→白
 *   - 4) 日格空白/日期/今日徽章/热力点/+更多 点击 → 当日事项详情弹层（FocusPanel 复用 + 18px card 风格）
 * ============================================================ */

// ===== Phase 1 本地模拟数据 =====
const MOCK_MONTH_TASKS = [
  { id: 'm1', moduleKey: 'energy',    title: '睡眠 23点前 · ≥ 23天 / 月',               done: true,  progress: 0.78, srcTag: '≡ 关联 Annual: 精力基建',   srcTagColor: 'rgba(52,199,89,0.08)',  srcTagTextColor: '#34C759' },
  { id: 'm2', moduleKey: 'energy',    title: '体检 + 买复合维生素',                       done: false, progress: 0.60, dueDate: '截止 8/31' },
  { id: 'm3', moduleKey: 'energy',    title: '喝水 ≥ 2L · 打卡 20天',                     done: false, progress: 0.60, srcTag: '≡ 习惯同步',           srcTagColor: 'rgba(52,199,89,0.08)',  srcTagTextColor: '#34C759' },
  { id: 'm4', moduleKey: 'cognition', title: '本月读 2 本书',                              done: true,  progress: 1.00, srcTag: '≡ 关联知力 KR1',         srcTagColor: 'rgba(0,122,255,0.08)', srcTagTextColor: '#0040DD' },
  { id: 'm5', moduleKey: 'cognition', title: '《纳瓦尔宝典》· 输出 3 组洞察',              done: false, progress: 0.45, note: '进度 第 2 章' },
  { id: 'm6', moduleKey: 'ability',   title: '英语口语 M3 · Pronunciation Mastery',        done: false, progress: 0.30, srcTag: '⇣ 拆解为 4 个本周任务',   srcTagColor: 'rgba(255,149,0,0.08)', srcTagTextColor: '#FF9500' },
  { id: 'm7', moduleKey: 'work',      title: '主业营收 · Q3 达成 K1/K2/K3',                done: false, progress: 0.22, srcTag: '≡ 关联 Work O1',         srcTagColor: 'rgba(255,59,48,0.08)', srcTagTextColor: '#FF3B30' },
  { id: 'm8', moduleKey: 'work',      title: '副业上线 · 产品 MVP + 50 激活',               done: false, progress: 0.00, srcTag: '⇣ 拆解模式',             srcTagColor: 'rgba(255,59,48,0.08)', srcTagTextColor: '#FF3B30' },
  { id: 'm9', moduleKey: 'life',      title: '9月东京出行 · 机+酒+签证预订',               done: false, progress: 0.55, note: '截止 9/10' },
];

const MOCK_WEEK_TASKS = [
  { id: 'w1', moduleKey: 'cognition', title: '《纳瓦尔》第 5-6 章 · 做卡片笔记', done: false, progress: 0.50, srcTag: '≡ 继承月主线', srcTagColor: 'rgba(0,122,255,0.08)', srcTagTextColor: '#0040DD', dueDate: '周三 9/2' },
  { id: 'w2', moduleKey: 'ability',   title: '① Shadowing 连读训练 5 天',         done: true,  progress: 1.00 },
  { id: 'w3', moduleKey: 'ability',   title: '② 音标纠音 · R/L/TH 发音',          done: false, progress: 0.28, note: '2/7' },
  { id: 'w4', moduleKey: 'work',      title: '买域名 + 后端基础骨架',              done: false, progress: 0.30, dueDate: '周二' },
  { id: 'w5', moduleKey: 'work',      title: '写 PRD v0.1 · 核心用户故事',         done: false, progress: 0.00, dueDate: '周四' },
];

/**
 * 月历事项（右侧）：
 *   - 每条事件都加上 moduleKey & taskId 以便与左右卡同步勾选状态（Phase 1 用 title 做模糊匹配）
 *   - 事件本身也保留 is_done 状态，左卡勾选时右侧对应事件行立刻同步（反之亦然）
 */
function buildEventsWithTaskLink(raw, tasks) {
  return raw.map(ev => {
    const mod = keyToModule(
      ({ 1:'work', 2:'ability', 5:'life', 6:'energy', 7:'cognition' })[Number(ev.category)] || 'others'
    );
    const match = tasks.find(t => t.moduleKey === mod.key && (ev.title || '').includes(t.title.slice(0, 4)));
    return { ...ev, moduleKey: mod.key, taskId: match?.id, is_done: match?.done ?? Boolean(ev.is_done) };
  });
}

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

// 习惯打卡模拟
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
  return {
    id: ev.id,
    title: ev.title || ev.name,
    category: mod.cat,
    is_key: true,
    note: ev.note || '',
    start_time: ev.start_time || '09:00',
    end_time: ev.end_time || '10:00',
    schedule_date: date || ev.date,
  };
}

/* ========= CalendarPage 容器 ========= */
export default function CalendarPage({ onEditSchedule }) {
  const todayISO = getToday();
  const todayObj = fromISODate(todayISO);

  const [year, setYear] = useState(todayObj.getFullYear());
  const [month, setMonth] = useState(todayObj.getMonth() + 1);
  const [selectedDate, setSelectedDate] = useState(todayISO);
  const [tabView, setTabView] = useState('month'); // month | week | day

  const [monthTasks, setMonthTasks] = useState(MOCK_MONTH_TASKS);
  const [weekTasks, setWeekTasks] = useState(MOCK_WEEK_TASKS);

  // 需求 4：当日详情弹层 Modal —— 点击日格空白/日期/今日/热力点/+更多 打开
  const [dayDetail, setDayDetail] = useState(null); // { date } | null

  const monthProgress = Math.round(
    (monthTasks.reduce((s, t) => s + (t.done ? 1 : t.progress), 0) / monthTasks.length) * 100
  );
  const monthTimePct = 55;

  const weekProgress = Math.round(
    (weekTasks.reduce((s, t) => s + (t.done ? 1 : t.progress), 0) / weekTasks.length) * 100
  );
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

  /* === 勾选主线任务：仅复选框触发（来自 FocusPanel onToggle）=== */
  const toggleTask = useCallback((taskId, isMonth) => {
    const setter = isMonth ? setMonthTasks : setWeekTasks;
    setter(prev => prev.map(t =>
      t.id === taskId ? { ...t, done: !t.done, progress: !t.done ? 1 : t.progress } : t
    ));
  }, []);

  /* === 点击 FocusPanel 标题/非复选框区域 → 开对应编辑面板 === */
  const openEditorForTask = useCallback((task, { isMonth = true } = {}) => {
    // 需求 1：点击「纳瓦尔宝典」→ 书籍编辑面板，其他用 ScheduleForm 复用
    const title = task.title || '';
    const mod = keyToModule(task.moduleKey);
    if (task.moduleKey === 'cognition' && /《.+》|宝典|书|读/.test(title)) {
      onEditSchedule?.(
        { type: 'book', title: title.replace(/[《》]/g, ''), author: '', progress: (task.progress || 0) * 100, tab: 'insights' },
        { module: task.moduleKey, source: 'focusTask' }
      );
      return;
    }
    if (task.moduleKey === 'ability') {
      onEditSchedule?.(
        { type: 'milestone', title, dueDate: task.dueDate, color: mod.color },
        { module: task.moduleKey, source: 'focusTask' }
      );
      return;
    }
    if (task.moduleKey === 'work') {
      onEditSchedule?.(
        { type: 'kr', title, color: mod.color, progress: Math.round((task.progress || 0) * 100) },
        { module: task.moduleKey, source: 'focusTask' }
      );
      return;
    }
    if (task.moduleKey === 'life') {
      onEditSchedule?.(
        { type: 'schedule', ...taskToScheduleInitial(task, todayISO) },
        { module: task.moduleKey, source: 'focusTask' }
      );
      return;
    }
    // 精力 / 兜底
    onEditSchedule?.(
      { type: 'schedule', ...taskToScheduleInitial(task, todayISO) },
      { module: task.moduleKey, source: 'focusTask', isMonth }
    );
  }, [onEditSchedule, todayISO]);

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
    setMonth(n => n /* noop 不会触发；改用下面的 tick 状态 */);
    setTick(v => v + 1);
  }, []);

  // 事件勾选状态需要强制刷新 monthEvents 的引用
  const [tick, setTick] = useState(0);

  /* === 月历事件标题点击 → 开对应编辑面板（左卡同映射逻辑） === */
  const handleEventClick = useCallback((ev, date) => {
    const mod = keyToModule(ev.moduleKey || 'others');
    const title = ev.title || ev.name || '';
    if (ev.moduleKey === 'cognition' && /《.+》|宝典|书|读|纳瓦尔|笔记/.test(title)) {
      onEditSchedule?.(
        { type: 'book', title: title.replace(/[《》]/g, ''), progress: ev.is_done ? 100 : 30, tab: 'basic' },
        { module: ev.moduleKey, source: 'calendarEvent', date }
      );
      return;
    }
    if (ev.moduleKey === 'ability') {
      onEditSchedule?.(
        { type: 'milestone', title, color: mod.color },
        { module: ev.moduleKey, source: 'calendarEvent', date }
      );
      return;
    }
    if (ev.moduleKey === 'work') {
      onEditSchedule?.(
        { type: 'kr', title, color: mod.color, progress: ev.is_done ? 100 : 30 },
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

  /* === 月历事项：加入 taskId/is_done 引用同步左卡 === */
  const allTasks = useMemo(() => [...monthTasks, ...weekTasks], [monthTasks, weekTasks, tick]);
  const monthEvents = useMemo(() => {
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    const raw = MOCK_EVENTS_RAW.filter(e => e.date && e.date.startsWith(prefix));
    return buildEventsWithTaskLink(raw, allTasks);
  }, [year, month, allTasks]);

  const weekdayZh = ['日','一','二','三','四','五','六'];
  const detailDateObj = dayDetail?.date ? fromISODate(dayDetail.date) : null;
  const detailEvents = useMemo(() => {
    if (!dayDetail?.date) return [];
    return buildEventsWithTaskLink(
      MOCK_EVENTS_RAW.filter(e => e.date === dayDetail.date),
      allTasks
    );
  }, [dayDetail?.date, allTasks]);

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
              tasks={monthTasks}
              progressPct={monthProgress}
              timePct={monthTimePct}
              onToggle={(id) => toggleTask(id, true)}
              onAdd={() => onEditSchedule?.()}
              onEditTask={(task) => openEditorForTask(task, { isMonth: true })}
              compact={tabView !== 'month'}
            />
          )}

          {tabView === 'week' && (
            <FocusPanel
              type="week"
              accentColor="#007AFF"
              title={`本周主线 · ${weekStartStr}-${weekEndStr}`}
              tasks={weekTasks}
              progressPct={weekProgress}
              timePct={weekTimePct}
              onToggle={(id) => toggleTask(id, false)}
              onAdd={() => onEditSchedule?.()}
              onEditTask={(task) => openEditorForTask(task, { isMonth: false })}
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
