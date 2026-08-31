import { useMemo } from 'react';
import { calendarGrid, toISODate, today as getToday, fromISODate, startOfWeek, endOfWeek } from '../../utils/date.js';
import { WEEK_LABELS_MON, scheduleModule } from '../../utils/categoryMapping.js';

/**
 * 月历网格组件
 * - 周一起
 * - 日格三层结构：日期 / 事项胶囊 / 习惯热力点
 * - 今日蓝底白字、选中蓝描边、周末浅灰、跨月淡化
 *
 * @param {Object} props
 * @param {number} props.year  - 当前年
 * @param {number} props.month - 当前月 (1-12)
 * @param {string} props.selectedDate - ISO 选中日
 * @param {Function} props.onSelectDate - 点击日格回调
 * @param {Array} props.events - 当月事项列表 [{date, title, category, is_done, ...}]
 * @param {Object} props.habitsMap - 习惯打卡 { 'YYYY-MM-DD': count } 按日打卡数
 * @param {number} props.habitTarget - 每日习惯目标数（用于热力点渲染）
 */
export default function MonthCalendarGrid({
  year,
  month,
  selectedDate,
  onSelectDate,
  events = [],
  habitsMap = {},
  habitTarget = 4,
}) {
  const todayISO = getToday();
  const grid = useMemo(() => calendarGrid(year, month - 1), [year, month]);
  const weekStartISO = useMemo(() => toISODate(startOfWeek(todayISO)), [todayISO]);
  const weekEndISO   = useMemo(() => toISODate(endOfWeek(todayISO)),   [todayISO]);
  const inCurrentWeek = (iso) => iso >= weekStartISO && iso <= weekEndISO;
  // 周六/周日列统一灰色：原 weekend 之前用淡蓝，改为浅灰（60/67 级透明度）；优先级低于选中/今日
  const CURRENT_WEEK_BG_MONFRI = 'rgba(0,122,255,0.08)'; // 当周 周一-周五 浅蓝
  const WEEKEND_BG            = 'rgba(60,60,67,0.06)';   // 周六/周日列 浅灰（替代原浅蓝 2.5%）

  // 按日期分组事项
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
    for (let i = 0; i < habitTarget; i++) {
      dots.push(i < count);
    }
    return dots;
  };

  return (
    <div className="flex flex-col min-h-0">
      {/* 表头：周一起 */}
      <div className="grid grid-cols-7 px-4 pt-4 pb-2">
        {WEEK_LABELS_MON.map((w, i) => (
          <div
            key={i}
            className="text-center text-[11px] font-bold uppercase tracking-wider text-[#8E8E93]"
          >
            {w}
          </div>
        ))}
      </div>

      {/* 网格 —— 改用阴影 + 淡色分割代替大面积灰色背景分割 */}
      <div className="grid grid-cols-7 gap-0 mx-4 mb-4 rounded-2xl overflow-hidden" style={{ boxShadow: '0 0 0 1px rgba(0,0,0,0.04)' }}>
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
          /* 日格背景优先级（从低到高覆盖，后面的条件越重越先写）：
               ① 平日白底  ←  ② 周末列浅灰（替代原浅蓝）  ←  ③ 当周周一-周五叠加浅蓝
                                                             ←  ④ 选中浅蓝(已存在)
                                                             ←  ⑤ 今日不影响外背景(只改数字徽章)
          */
          const weekInRange = inCurrentWeek(cell.date);
          let cellBg = '#ffffff';
          if (isWeekend) cellBg = WEEKEND_BG;
          if (!isWeekend && weekInRange) cellBg = CURRENT_WEEK_BG_MONFRI;
          // 当周周六/周日：不要浅蓝填充，仍保持浅灰（需求：周末列从浅蓝改成浅灰）
          if (isSelected && !isToday) cellBg = 'rgba(0,122,255,0.08)'; // 选中覆盖优先

          const cellClasses = [
            'cell',
            !cell.inMonth ? 'adj' : '',
            isWeekend ? 'weekend' : '',
            isToday ? 'today' : '',
            isSelected && !isToday ? 'selected' : '',
            weekInRange ? 'week-now' : '',
          ].filter(Boolean).join(' ');

          return (
            <div
              key={i}
              className={`min-h-[88px] p-2 flex flex-col gap-1 cursor-pointer transition-colors relative ${
                !cell.inMonth ? 'opacity-40' : ''
              }`}
              style={{
                background: cellBg,
                boxShadow: isSelected && !isToday
                  ? 'inset 0 0 0 2px rgba(0,122,255,0.45)'
                  : 'inset -1px -1px 0 rgba(0,0,0,0.04)',
              }}
              onClick={() => onSelectDate?.(cell.date)}
            >
              {/* Layer 1: 日期数字 —— 极简，不用圆形徽章背景/投影，仅靠颜色区分 */}
              <div className="flex items-center justify-between">
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
                {isToday && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ color: '#fff', background: '#007AFF' }}>
                    今日
                  </span>
                )}
              </div>

              {/* Layer 2: 事项胶囊 */}
              <div className="flex flex-col gap-[3px] flex-1 min-h-0">
                {dayEvents.slice(0, 3).map((ev, j) => {
                  const mod = scheduleModule(ev);
                  return (
                    <div
                      key={j}
                      className="flex items-center gap-1.5 text-[12px] leading-tight font-medium text-[#48484A] px-1.5 py-0.5 rounded-md truncate"
                      style={{ background: mod.soft }}
                    >
                      <span
                        className="w-1 h-1 rounded-full flex-shrink-0"
                        style={{ background: mod.color }}
                      />
                      <span className="truncate">{ev.title || ev.name || ''}</span>
                    </div>
                  );
                })}
                {dayEvents.length > 3 && (
                  <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-md self-start" style={{ color: '#0040DD', background: 'rgba(0,122,255,0.08)' }}>
                    +{dayEvents.length - 3} 更多…
                  </span>
                )}
              </div>

              {/* Layer 3: 习惯热力点 —— 未点用软蓝代替灰色 */}
              {cell.inMonth && (
                <div className="flex items-center gap-1.5 mt-auto">
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
