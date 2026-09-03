import { useMemo } from 'react';
import { calendarGrid, toISODate, today as getToday, fromISODate, startOfWeek, endOfWeek } from '../../utils/date.js';
import { WEEK_LABELS_MON, scheduleModule } from '../../utils/categoryMapping.js';
import lunarLib from '../../vendor/lunar.js';

/* 每格农历标注：优先级 节日 > 节气 > 农历日（初一显示农历月名）
   · 节日：红（春节/端午/中秋/国庆…，农历+公历都取）
   · 节气：青（白露/立春…）
   · 农历日：灰（初一那格显示"八月"月名，略深一档做月份锚点） */
function lunarBadge(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const solar = lunarLib.Solar.fromYmd(y, m, d);
  const lunar = solar.getLunar();
  const full = `农历${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`;
  const fests = [...lunar.getFestivals(), ...solar.getFestivals()];
  if (fests.length > 0) {
    // 显示名：三字以上去尾"节"（端午/中秋/国庆），特殊映射（劳动节→五一），二字保留（春节/元旦）
    const ALIAS = { '劳动节': '五一', '建军节': '建军', '青年节': '青年', '妇女节': '妇女' };
    const raw = fests[0];
    const text = ALIAS[raw] || (raw.length >= 3 && raw.endsWith('节') ? raw.slice(0, -1) : raw);
    return { text, full, color: '#FF3B30', weight: 600 };
  }
  const jq = lunar.getJieQi();
  if (jq) return { text: jq, full, color: '#30B0C7', weight: 600 };
  if (lunar.getDay() === 1) {
    return { text: (lunar.getMonth() < 0 ? '闰' : '') + lunar.getMonthInChinese() + '月', full, color: '#6D6D72', weight: 600 };
  }
  return { text: lunar.getDayInChinese(), full, color: '#8E8E93', weight: 500 };
}

/**
 * 月历网格组件（v2 交互升级）
 * - 周一起
 * - 日格三层结构：日期 / 事项行(复选框+标题) / 习惯热力点
 * - 交互分区：
 *    · 事项行：复选框点击 = 勾选（同步左卡 done）；标题点击 = 打开对应编辑面板
 *    · 非事项区域（空白 / 日期 / 今日徽章 / 热力点 / +更多）= 开当日事项面板
 * - 当周 周一-周五：浅蓝行背景；周六/周日列统一白色（需求：从浅灰→白色）
 *
 * @param {Object} props
 * @param {number} props.year
 * @param {number} props.month
 * @param {string} props.selectedDate
 * @param {Function} props.onSelectDate - 被 onCellOpenDay 取代后仍然保留，用于兼容日视图高亮
 * @param {Array} props.events - 当月事项 [{date, title, category, is_done, id, moduleKey, ...}]
 * @param {Object} props.habitsMap
 * @param {number} props.habitTarget
 * @param {Function} props.onEventToggle - (event, date) 复选框勾选 —— 仅复选框触发
 * @param {Function} props.onEventClick  - (event, date) 标题点击 —— 打开编辑面板
 * @param {Function} props.onCellOpenDay  - (date, { source }) 日格"非事项交互区"点击 —— 开当日事项面板
 */
export default function MonthCalendarGrid({
  year,
  month,
  selectedDate,
  onSelectDate,
  events = [],
  habitsMap = {},
  habitTarget = 4,
  onEventToggle,
  onEventClick,
  onCellOpenDay,
}) {
  const todayISO = getToday();
  const grid = useMemo(() => calendarGrid(year, month - 1), [year, month]);
  const weekStartISO = useMemo(() => toISODate(startOfWeek(todayISO)), [todayISO]);
  const weekEndISO   = useMemo(() => toISODate(endOfWeek(todayISO)),   [todayISO]);
  const inCurrentWeek = (iso) => iso >= weekStartISO && iso <= weekEndISO;
  const CURRENT_WEEK_BG_MONFRI = 'rgba(0,122,255,0.08)'; // 当周 周一-周五 浅蓝
  // 周六/周日列：需求 3 明确「周六日两列灰色→白色」
  const WEEKEND_BG = '#ffffff';

  const eventsByDate = useMemo(() => {
    const m = {};
    for (const ev of events) {
      const d = ev.date || ev.schedule_date;
      if (!d) continue;
      if (!m[d]) m[d] = [];
      m[d].push(ev);
    }
    return m;
  }, [events]);

  const habitDotsForDate = (dateISO) => {
    const count = habitsMap[dateISO] || 0;
    const dots = [];
    for (let i = 0; i < habitTarget; i++) dots.push(i < count);
    return dots;
  };

  /* 圆复选框：与 FocusPanel 左卡规格同构
       18×18 round-full / 1.5px border / 完成时模块色填充+白勾+投影 */
  function EventCheckbox({ ev, mod, date }) {
    const done = Boolean(ev.is_done || ev.done);
    const handleToggle = (e) => {
      e.stopPropagation();
      e.preventDefault();
      onEventToggle?.(ev, date);
    };
    return (
      <div
        onClick={handleToggle}
        role="checkbox"
        aria-checked={done}
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') handleToggle(e); }}
        className="w-[16px] h-[16px] rounded-full flex-shrink-0 border-[1.5px] flex items-center justify-center transition select-none"
        style={{
          borderColor: done ? mod.color : `${mod.color}55`,
          background: done ? mod.color : '#ffffff',
          boxShadow: done ? `0 2px 5px ${mod.color}4A` : 'none',
        }}
      >
        {done && (
          <svg width="7" height="9" viewBox="0 0 8 10" fill="none">
            <path d="M1 4.5L3.5 7L7 1.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-0">
      {/* 表头：周一起 */}
      <div className="grid grid-cols-7 px-4 pt-4 pb-2">
        {WEEK_LABELS_MON.map((w, i) => (
          <div key={i} className="text-center text-[11px] font-bold uppercase tracking-wider text-[#8E8E93]">
            {w}
          </div>
        ))}
      </div>

      <div
        className="grid grid-cols-7 gap-0 mx-4 mb-4 rounded-2xl overflow-hidden"
        style={{ boxShadow: '0 0 0 1px rgba(0,0,0,0.04)' }}
      >
        {grid.map((cell, i) => {
          const dateObj = fromISODate(cell.date);
          const day = dateObj.getDate();
          const dow = dateObj.getDay(); // 0=Sun
          const isWeekend = dow === 0 || dow === 6;
          const isToday = cell.date === todayISO;
          const isSelected = cell.date === selectedDate;
          const dayEvents = eventsByDate[cell.date] || [];
          const habitDots = habitDotsForDate(cell.date);
          const habitDone = habitsMap[cell.date] || 0;
          const weekInRange = inCurrentWeek(cell.date);

          /* 背景：需求 3 周末格灰色→白
               平日白底 ← 周末白 ← 当周 Mon-Fri 浅蓝 ← 选中浅蓝（选中态最高优） */
          let cellBg = '#ffffff';
          if (isWeekend) cellBg = WEEKEND_BG;
          if (!isWeekend && weekInRange) cellBg = CURRENT_WEEK_BG_MONFRI;
          if (isSelected && !isToday) cellBg = 'rgba(0,122,255,0.08)';

          const date = cell.date;
          const emitOpenDay = (source, e) => {
            if (e) { e.stopPropagation(); e.preventDefault(); }
            // 先 setSelectedDate 同步高亮再开面板，与点击语义一致
            onSelectDate?.(date);
            onCellOpenDay?.(date, { source });
          };

          return (
            <div
              key={i}
              className={`min-h-[88px] p-2 flex flex-col gap-1 transition-colors relative ${
                !cell.inMonth ? 'opacity-40' : ''
              }`}
              style={{
                background: cellBg,
                cursor: 'pointer',
                boxShadow: isSelected && !isToday
                  ? 'inset 0 0 0 2px rgba(0,122,255,0.45)'
                  : 'inset -1px -1px 0 rgba(0,0,0,0.04)',
              }}
              /* 整个日格背景/空白兜底点击 → 开当日事项面板
                   事件行内部会自行 stopPropagation，防止冒泡到这里 */
              onClick={(e) => emitOpenDay('cell', e)}
            >
              {/* Layer 1: 日期数字（左上） + 农历/节气/节日（右上） + 今日徽章（点击 → 当日面板） */}
              <div
                className="flex items-center justify-between gap-1"
                onClick={(e) => emitOpenDay('dateBadge', e)}
              >
                <span
                  className="inline-flex items-center justify-center text-[14px] font-semibold tabular-nums leading-none px-[5px] py-[3px] rounded-md transition"
                  style={{
                    color: isToday ? '#fff' : isSelected ? '#0040DD' : '#1C1C1E',
                    background: isToday
                      ? '#007AFF'
                      : isSelected
                      ? 'rgba(0,122,255,0.12)'
                      : 'transparent',
                    fontWeight: isToday || isSelected ? 700 : 600,
                  }}
                >
                  {day}
                </span>
                <span className="flex items-center gap-1 min-w-0">
                  {(() => {
                    const lb = lunarBadge(cell.date);
                    return (
                      <span
                        className="text-[10.5px] leading-none truncate"
                        style={{ color: lb.color, fontWeight: lb.weight }}
                        title={lb.full}
                      >
                        {lb.text}
                      </span>
                    );
                  })()}
                  {isToday && (
                    <span
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
                      style={{ color: '#fff', background: '#007AFF' }}
                    >
                      今日
                    </span>
                  )}
                </span>
              </div>

              {/* Layer 2: 事项行 · 小圆点 → 复选框（与左FocusPanel同构） */}
              <div
                className="flex flex-col gap-[3px] flex-1 min-h-0"
                onClick={(e) => { /* 阻止冒泡到 cell，避免点击事件行空白处也开当日面板（点击事件行空白处按「非事项区」统一：不弹编辑） */ }}
              >
                {dayEvents.slice(0, 3).map((ev, j) => {
                  const mod = scheduleModule(ev);
                  const done = Boolean(ev.is_done || ev.done);
                  return (
                    <div
                      key={ev.id || `${date}-${j}`}
                      className="flex items-center gap-1.5 text-[12px] leading-tight px-1.5 py-0.5 rounded-md cursor-pointer"
                      style={{
                        background: mod.soft,
                        color: done ? '#8E8E93' : '#48484A',
                        fontWeight: 500,
                        textDecoration: done ? 'line-through' : 'none',
                      }}
                      onClick={(e) => {
                        // 整行（除复选框外）点击 = 编辑该事项；阻止冒泡避免开 day-detail 面板
                        e.stopPropagation();
                        onEventClick?.(ev, date);
                      }}
                    >
                      {/* 复选框：独立 stopPropagation，只点它才 toggle 勾选，不触发编辑 / 不触发 day-detail */}
                      <div onClick={(e) => e.stopPropagation()}>
                        <EventCheckbox ev={ev} mod={mod} date={date} />
                      </div>
                      <span className="truncate flex-1 min-w-0">{ev.title || ev.name || ''}</span>
                    </div>
                  );
                })}
                {dayEvents.length > 3 && (
                  <span
                    onClick={(e) => emitOpenDay('more', e)}
                    className="text-[11px] font-semibold px-1.5 py-0.5 rounded-md self-start cursor-pointer"
                    style={{ color: '#0040DD', background: 'rgba(0,122,255,0.08)' }}
                  >
                    +{dayEvents.length - 3} 更多…
                  </span>
                )}
              </div>

              {/* Layer 3: 习惯热力点（点击 → 当日面板） */}
              {cell.inMonth && (
                <div
                  className="flex items-center gap-1.5 mt-auto"
                  onClick={(e) => emitOpenDay('habitBar', e)}
                >
                  <div className="flex gap-0.5">
                    {habitDots.map((on, j) => (
                      <span
                        key={j}
                        className="w-1 h-1 rounded-full"
                        style={{ background: on ? '#34C759' : 'rgba(0,122,255,0.12)' }}
                      />
                    ))}
                  </div>
                  <span className="ml-auto text-[10px] font-medium tabular-nums" style={{ color: habitDone > 0 ? '#34C759' : 'rgba(0,122,255,0.5)' }}>
                    {habitDone > 0 ? `${habitDone}/${habitTarget}` : ''}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
