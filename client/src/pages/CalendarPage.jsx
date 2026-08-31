import { useState, useMemo, useCallback } from 'react';
import { today as getToday, fromISODate, startOfWeek, endOfWeek, addDaysISO, toISODate } from '../utils/date.js';
import { MODULES, paceStatus } from '../utils/categoryMapping.js';
import MonthCalendarGrid from '../components/calendar/MonthCalendarGrid.jsx';
import FocusPanel from '../components/calendar/FocusPanel.jsx';

/* ============================================================
 * 日历页面 · 月视图容器
 * - 顶部 Header（月份导航 + 月周分段 + 节奏胶囊 + 今天 + 新建）
 * - 左栏：本月主线 + 本周主线（按精力→生活五块分组）
 * - 右栏：月历 7×N 网格（周一起 + 日格三层结构）
 * - Phase 1：纯前端本地模拟数据，后续接真实 API
 * ============================================================ */

// ===== Phase 1 本地模拟数据 =====
const MOCK_MONTH_TASKS = [
  // 精力
  { id: 'm1', moduleKey: 'energy', title: '睡眠 23点前 · ≥ 23天 / 月', done: true,  progress: 0.78, srcTag: '≡ 关联 Annual: 精力基建',   srcTagColor: 'rgba(52,199,89,0.08)',  srcTagTextColor: '#34C759' },
  { id: 'm2', moduleKey: 'energy', title: '体检 + 买复合维生素',         done: false, progress: 0.60, dueDate: '截止 8/31' },
  { id: 'm3', moduleKey: 'energy', title: '喝水 ≥ 2L · 打卡 20天',       done: false, progress: 0.60, srcTag: '≡ 习惯同步',           srcTagColor: 'rgba(52,199,89,0.08)',  srcTagTextColor: '#34C759' },
  // 知力
  { id: 'm4', moduleKey: 'cognition', title: '本月读 2 本书',                    done: true,  progress: 1.00, srcTag: '≡ 关联知力 KR1', srcTagColor: 'rgba(0,122,255,0.08)', srcTagTextColor: '#0040DD' },
  { id: 'm5', moduleKey: 'cognition', title: '《纳瓦尔宝典》· 输出 3 组洞察',   done: false, progress: 0.45, note: '进度 第 2 章' },
  // 能力
  { id: 'm6', moduleKey: 'ability', title: '英语口语 M3 · Pronunciation Mastery', done: false, progress: 0.30, srcTag: '⇣ 拆解为 4 个本周任务', srcTagColor: 'rgba(255,149,0,0.08)', srcTagTextColor: '#FF9500' },
  // 工作
  { id: 'm7', moduleKey: 'work', title: '主业营收 · Q3 达成 K1/K2/K3',  done: false, progress: 0.22, srcTag: '≡ 关联 Work O1', srcTagColor: 'rgba(255,59,48,0.08)', srcTagTextColor: '#FF3B30' },
  { id: 'm8', moduleKey: 'work', title: '副业上线 · 产品 MVP + 50 激活', done: false, progress: 0.00, srcTag: '⇣ 拆解模式',       srcTagColor: 'rgba(255,59,48,0.08)', srcTagTextColor: '#FF3B30' },
  // 生活
  { id: 'm9', moduleKey: 'life', title: '9月东京出行 · 机+酒+签证预订', done: false, progress: 0.55, note: '截止 9/10' },
];

const MOCK_WEEK_TASKS = [
  // 知力（继承月主线）
  { id: 'w1', moduleKey: 'cognition', title: '《纳瓦尔》第 5-6 章 · 做卡片笔记', done: false, progress: 0.50, srcTag: '≡ 继承月主线', srcTagColor: 'rgba(0,122,255,0.08)', srcTagTextColor: '#0040DD', dueDate: '周三 9/2' },
  // 能力（拆解自月主线）
  { id: 'w2', moduleKey: 'ability', title: '① Shadowing 连读训练 5 天', done: true,  progress: 1.00 },
  { id: 'w3', moduleKey: 'ability', title: '② 音标纠音 · R/L/TH 发音',   done: false, progress: 0.28, note: '2/7' },
  // 工作（副业拆解）
  { id: 'w4', moduleKey: 'work', title: '买域名 + 后端基础骨架',  done: false, progress: 0.30, dueDate: '周二' },
  { id: 'w5', moduleKey: 'work', title: '写 PRD v0.1 · 核心用户故事', done: false, progress: 0.00, dueDate: '周四' },
];

const MOCK_EVENTS = [
  { date: '2026-08-31', title: '体检复合维生素', category: 6 },
  { date: '2026-08-31', title: '纳瓦尔 5-6 章',   category: 7 },
  { date: '2026-08-31', title: 'OKR Q3 复盘',      category: 1 },
  { date: '2026-08-31', title: '写 PRD v0.1',      category: 1 },
  { date: '2026-09-01', title: '发音练习 R/L',     category: 2 },
  { date: '2026-09-02', title: '买域名 + 后端骨架', category: 1 },
  { date: '2026-09-02', title: '纳瓦尔笔记',       category: 7 },
  { date: '2026-09-04', title: 'OKR Q3 复盘会 14:00', category: 1 },
  { date: '2026-09-05', title: '写 PRD v0.1',      category: 1 },
  { date: '2026-09-05', title: '签证资料提交',     category: 5 },
  { date: '2026-09-06', title: 'Shadowing 50min', category: 2 },
  { date: '2026-09-07', title: '露营 · 延庆',      category: 5 },
  { date: '2026-09-07', title: '徒步 8km',        category: 6 },
  { date: '2026-09-08', title: '体检医院 · 9:30',  category: 6 },
  { date: '2026-09-10', title: '东京行机票出签',   category: 5 },
  { date: '2026-09-12', title: '客户 Demo',        category: 1 },
  { date: '2026-09-15', title: '读完《纳瓦尔宝典》', category: 7 },
  { date: '2026-09-17', title: '英语口语 M3 测评',  category: 2 },
  { date: '2026-09-19', title: '洞察组 + 践行发布', category: 7 },
  { date: '2026-09-21', title: '家族聚会',          category: 5 },
  { date: '2026-09-24', title: '副业 MVP v0.1 上线', category: 1 },
  { date: '2026-09-27', title: 'Q3 月末结算',       category: 1 },
  { date: '2026-09-29', title: '✈ 出发东京',        category: 5 },
  { date: '2026-09-30', title: '月度复盘 · 知力输出', category: 7 },
  { date: '2026-09-31', title: '8月主线完成度核查',  category: 1 },
];

// 习惯打卡模拟（8月下半月部分数据）
const MOCK_HABITS = {};
for (let d = 16; d <= 31; d++) {
  const dateISO = `2026-08-${String(d).padStart(2, '0')}`;
  MOCK_HABITS[dateISO] = Math.floor(Math.random() * 3) + 1; // 1-3
}
for (let d = 1; d <= 15; d++) {
  const dateISO = `2026-09-${String(d).padStart(2, '0')}`;
  MOCK_HABITS[dateISO] = Math.floor(Math.random() * 4) + 1; // 1-4
}

export default function CalendarPage({ onEditSchedule }) {
  const todayISO = getToday();
  const todayObj = fromISODate(todayISO);

  const [year, setYear] = useState(todayObj.getFullYear());
  const [month, setMonth] = useState(todayObj.getMonth() + 1);
  const [selectedDate, setSelectedDate] = useState(todayISO);
  const [tabView, setTabView] = useState('month'); // month | week | day

  // 本地状态：主线任务（Phase 1 纯前端模拟）
  const [monthTasks, setMonthTasks] = useState(MOCK_MONTH_TASKS);
  const [weekTasks, setWeekTasks] = useState(MOCK_WEEK_TASKS);

  const monthProgress = Math.round(
    (monthTasks.reduce((s, t) => s + (t.done ? 1 : t.progress), 0) / monthTasks.length) * 100
  );
  const monthTimePct = 55; // 模拟：8月下旬约 55% 时间已过

  const weekProgress = Math.round(
    (weekTasks.reduce((s, t) => s + (t.done ? 1 : t.progress), 0) / weekTasks.length) * 100
  );
  const weekTimePct = 48; // 模拟：本周约 48% 时间已过

  // 月份导航
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

  const goToday = useCallback(() => {
    setYear(todayObj.getFullYear());
    setMonth(todayObj.getMonth() + 1);
    setSelectedDate(todayISO);
  }, [todayObj, todayISO]);

  // 勾选主线任务
  const toggleTask = useCallback((taskId, isMonth) => {
    const setter = isMonth ? setMonthTasks : setWeekTasks;
    setter(prev => prev.map(t =>
      t.id === taskId
        ? { ...t, done: !t.done, progress: !t.done ? 1 : t.progress }
        : t
    ));
  }, []);

  // 周时间胶囊
  const weekStart = startOfWeek(todayISO);
  const weekEnd = endOfWeek(todayISO);
  const weekStartStr = `${weekStart.getMonth() + 1}/${weekStart.getDate()}`;
  const weekEndStr = `${weekEnd.getMonth() + 1}/${weekEnd.getDate()}`;
  const weekStartDay = ['日', '一', '二', '三', '四', '五', '六'][weekStart.getDay()];
  const weekEndDay = ['日', '一', '二', '三', '四', '五', '六'][weekEnd.getDay()];

  // 计算第几周
  const weekNum = Math.ceil(
    ((todayObj - new Date(todayObj.getFullYear(), 0, 1)) / 86400000 + new Date(todayObj.getFullYear(), 0, 1).getDay() + 1) / 7
  );

  // 当月事项过滤
  const monthEvents = useMemo(() => {
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    return MOCK_EVENTS.filter(e => e.date && e.date.startsWith(prefix));
  }, [year, month]);

  return (
    <div className="flex-1 min-w-0 max-w-[1320px] flex flex-col gap-4">
      {/* ===== Header ===== */}
      <div className="glass-card px-5 py-3.5">
        <div className="flex items-center gap-4 flex-wrap">
          {/* 月份导航 */}
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

          {/* 月周分段 */}
          <div className="tab-group">
            <button className={tabView === 'month' ? 'active' : ''} onClick={() => setTabView('month')}>月</button>
            <button className={tabView === 'week' ? 'active' : ''} onClick={() => setTabView('week')}>周</button>
            <button className={tabView === 'day' ? 'active' : ''} onClick={() => setTabView('day')}>日</button>
          </div>

          {/* 节奏胶囊 */}
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[12px] font-bold bg-[rgba(0,122,255,0.08)] text-[#0040DD]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#0040DD]" />
            本月主线 · 已完成 {monthProgress}%
          </span>

          <div className="flex-1" />

          {/* 今天 */}
          <button
            onClick={goToday}
            className="px-3.5 py-1.5 rounded-[9px] text-[13px] font-semibold text-[#1c1c1e] bg-[rgba(120,120,128,0.12)] hover:bg-[rgba(120,120,128,0.18)] transition border-none cursor-pointer"
          >
            今天
          </button>

          {/* 新建 */}
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
        {/* 左栏：本月 + 本周 */}
        <div className="col-span-12 lg:col-span-4 flex flex-col gap-4">
          <FocusPanel
            type="month"
            accentColor="#007AFF"
            title="本月主线"
            tasks={monthTasks}
            progressPct={monthProgress}
            timePct={monthTimePct}
            onToggle={(id) => toggleTask(id, true)}
            onAdd={() => onEditSchedule?.()}
          />

          <FocusPanel
            type="week"
            accentColor="#FF9500"
            title="本周主线"
            tasks={weekTasks}
            progressPct={weekProgress}
            timePct={weekTimePct}
            onToggle={(id) => toggleTask(id, false)}
            onAdd={() => onEditSchedule?.()}
            headerExtra={
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-[10px] border border-[rgba(60,60,67,0.10)] text-[12px] font-medium text-[#6C6C70] bg-white">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
                  </svg>
                  {weekStartStr} 周{weekStartDay} – {weekEndStr} 周{weekEndDay}
                </span>
                <span className="inline-flex items-center px-2.5 py-1 rounded-[10px] text-[12px] font-medium bg-[rgba(0,122,255,0.08)] text-[#0040DD] border border-transparent">
                  第 {weekNum} 周 · 节奏 {weekTimePct}%时间 / {weekProgress}%完成
                </span>
              </div>
            }
          />
        </div>

        {/* 右栏：月历网格 */}
        <div className="col-span-12 lg:col-span-8">
          <div className="card" style={{ background: '#fff', border: '1px solid rgba(60,60,67,0.10)', borderRadius: '18px' }}>
            <MonthCalendarGrid
              year={year}
              month={month}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              events={monthEvents}
              habitsMap={MOCK_HABITS}
              habitTarget={4}
            />

            {/* 图例 */}
            <div className="flex items-center gap-4 px-5 py-3 pb-4 flex-wrap">
              {MODULES.filter(m => m.key !== 'others').map(m => (
                <span key={m.key} className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#6C6C70]">
                  <span className="w-2 h-2 rounded-full" style={{ background: m.color }} />
                  {m.label}
                </span>
              ))}
              <div className="flex-1" />
              <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#6C6C70]">
                <span className="w-2 h-2 rounded-full" style={{ background: '#007AFF', boxShadow: '0 2px 6px rgba(0,122,255,0.35)' }} />
                今日
              </span>
              <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#6C6C70]">
                <span className="w-2 h-2 rounded-full" style={{ background: 'transparent', boxShadow: 'inset 0 0 0 2px rgba(0,122,255,0.45)' }} />
                选中
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
