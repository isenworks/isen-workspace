import { useMemo } from 'react';
import { calendarGrid, toISODate, today as getToday, fromISODate } from '../../utils/date.js';
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

      {/* 网格 */}
      <div
        className="grid grid-cols-7 gap-px mx-2 mb-4 border-t border-b"
        style={{ borderColor: 'rgba(60,60,67,0.10)', background: 'rgba(60,60,67,0.10)' }}
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

          const cellClasses = [
            'cell',
            !cell.inMonth ? 'adj' : '',
            isWeekend ? 'weekend' : '',
            isToday ? 'today' : '',
            isSelected && !isToday ? 'selected' : '',
          ].filter(Boolean).join(' ');

          return (
            <div
              key={i}
              className={`min-h-[88px] p-2 flex flex-col gap-1 cursor-pointer transition-colors relative ${
                !cell.inMonth ? 'opacity-40' : ''
              } ${isWeekend ? 'bg-[rgba(120,120,128,0.03)]' : 'bg-white'} ${
                isSelected && !isToday ? 'bg-[rgba(0,122,255,0.08)]' : ''
              }`}
              style={isSelected && !isToday ? { boxShadow: 'inset 0 0 0 2px rgba(0,122,255,0.45)' } : undefined}
              onClick={() => onSelectDate?.(cell.date)}
            >
              {/* Layer 1: 日期数字 */}
              <div className="flex items-center justify-between">
                <span
                  className="inline-flex items-center justify-center w-[22px] h-[22px] rounded-full text-[14px] font-semibold tabular-nums"
                  style={{
                    color: isToday ? '#fff' : '#48484A',
                    background: isToday ? '#007AFF' : 'transparent',
                    boxShadow: isToday ? '0 2px 8px rgba(0,122,255,0.35)' : 'none',
                  }}
                >
                  {day}
                </span>
                {isToday && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[rgba(0,122,255,0.08)] text-[#0040DD]">
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
                  <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-md text-[#8E8E93] bg-[rgba(120,120,128,0.08)] self-start">
                    +{dayEvents.length - 3} 更多…
                  </span>
                )}
              </div>

              {/* Layer 3: 习惯热力点 */}
              {cell.inMonth && (
                <div className="flex items-center gap-1.5 mt-auto">
                  <div className="flex gap-0.5">
                    {habitDots.map((on, j) => (
                      <span
                        key={j}
                        className="w-1 h-1 rounded-full"
                        style={{ background: on ? '#34C759' : 'rgba(120,120,128,0.2)' }}
                      />
                    ))}
                  </div>
                  <span className="ml-auto text-[10px] font-medium tabular-nums text-[#8E8E93]">
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
