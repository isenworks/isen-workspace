import { useMemo } from 'react';
import { calendarGrid, toISODate, today as getToday, fromISODate, startOfWeek, endOfWeek } from '../../utils/date.js';
import { WEEK_LABELS_MON, scheduleModule } from '../../utils/categoryMapping.js';
import { useMediaQuery } from '../../utils/useMediaQuery.js';
import lunarLib from '../../vendor/lunar.js';

/* 每格农历标注：优先级 节日 > 节气 > 农历日（初一显示农历月名）
   · 节日：红（春节/端午/中秋/国庆…，农历+公历都取）
   · 节气：深灰（白露/立春…）
   · 农历日：灰（初一那格显示"八月"月名，略深一档做月份锚点） */
function lunarBadge(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const solar = lunarLib.Solar.fromYmd(y, m, d);
  const lunar = solar.getLunar();
  const full = `农历${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`;
  const fests = [...lunar.getFestivals(), ...solar.getFestivals()];
  if (fests.length > 0) {
    // 显示名：直接使用节日全称（国庆节/劳动节/建军节…）
    const text = fests[0];
    return { text, full, color: 'var(--danger)', weight: 600 };
  }
  const jq = lunar.getJieQi();
  if (jq) return { text: jq, full, color: '#6D6D72', weight: 600 };
  if (lunar.getDay() === 1) {
    return { text: (lunar.getMonth() < 0 ? '闰' : '') + lunar.getMonthInChinese() + '月', full, color: '#6D6D72', weight: 600 };
  }
  return { text: lunar.getDayInChinese(), full, color: 'var(--text-muted)', weight: 500 };
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
  // 手机紧凑模式（<640px）：7 列格子每列仅 ~48px，完整事项行（复选框+换行标题）
  // 会被挤成一列一个字的"竖排"并撑爆格子 —— 切换为 iOS/Google 日历式紧凑条：
  // 色点 + 单行省略标题（无复选框，勾选去当日面板做），每格最多 2 条 + "+N"
  const isTiny = useMediaQuery('(max-width: 639px)');
  const grid = useMemo(() => calendarGrid(year, month - 1), [year, month]);
  const weekStartISO = useMemo(() => toISODate(startOfWeek(todayISO)), [todayISO]);
  const weekEndISO   = useMemo(() => toISODate(endOfWeek(todayISO)),   [todayISO]);
  const inCurrentWeek = (iso) => iso >= weekStartISO && iso <= weekEndISO;
  const CURRENT_WEEK_BG_MONFRI = 'rgba(var(--s-rgb),0.03)'; // 当周整周浅色（与上月格 opacity-40 后的视觉深度一致）
  // 周六/周日列：需求 3 明确「周六日两列灰色→白色」
  const WEEKEND_BG = 'var(--surface-card)';

  const eventsByDate = useMemo(() => {
    const m = {};
    // 多日事项范围铺开：[start_date, end_date] 覆盖的每一天都显示同一事件（同一引用，
    // 勾选/完成态两格天然同步）；范围裁剪到当前网格，防跨月长循环
    const first = grid[0]?.date;
    const last = grid[grid.length - 1]?.date;
    if (!first || !last) return m;
    for (const ev of events) {
      const start = ev.start_date || ev.date || ev.schedule_date;
      if (!start) continue;
      const end = ev.end_date || start;
      const s = start < first ? first : start;
      const e = end > last ? last : end;
      if (s > e) continue;
      const cur = new Date(`${s}T00:00:00`);
      const stop = new Date(`${e}T00:00:00`);
      while (cur <= stop) {
        const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
        if (!m[key]) m[key] = [];
        m[key].push(ev);
        cur.setDate(cur.getDate() + 1);
      }
    }
    return m;
  }, [events, grid]);

  const habitDotsForDate = (dateISO) => {
    const count = habitsMap[dateISO] || 0;
    const dots = [];
    for (let i = 0; i < habitTarget; i++) dots.push(i < count);
    return dots;
  };

  /* 圆复选框：与 FocusPanel 左卡规格同构，三态语义与 KeyTasks cb-failed 同款
       16×16 round-full / 1.5px border
       · 完成：模块色填充 + 白勾 + 投影
       · 标记未完成（is_failed 且未完成）：红边 + 8% 红底 + 红 ✕（今日计划右键"标记未完成"同步展示）
       · 未完成：模块色描边空心 */
  function EventCheckbox({ ev, mod, date }) {
    const done = Boolean(ev.is_done || ev.done);
    const failed = !!ev.is_failed && !done;
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
        aria-label={failed ? '已标记未完成' : done ? '已完成' : '未完成'}
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') handleToggle(e); }}
        className="w-[16px] h-[16px] rounded-full flex-shrink-0 border-[1.5px] flex items-center justify-center transition select-none"
        style={{
          // 线框直接用模块色实色（跟随事项类型）；此前 rgba 缺 var() 包裹在 CSS 变量下非法被丢弃
          borderColor: failed ? 'var(--danger)' : mod.color,
          background: done ? mod.color : (failed ? 'rgba(var(--danger-rgb),0.08)' : 'var(--surface-card)'),
          boxShadow: done
            ? (mod.color.startsWith('var(')
              ? `0 2px 5px rgba(var(${mod.color.slice(4, -1)}-rgb), 0.29)`
              : `0 2px 5px ${mod.color}4A`)
            : 'none',
        }}
      >
        {done && (
          <svg width="7" height="9" viewBox="0 0 8 10" fill="none">
            <path d="M1 4.5L3.5 7L7 1.5" stroke="var(--surface-card)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
        {failed && (
          <svg width="6" height="6" viewBox="0 0 8 8" fill="none">
            <path d="M1.5 1.5L6.5 6.5M6.5 1.5L1.5 6.5" stroke="var(--danger)" strokeWidth="1.6" strokeLinecap="round"/>
          </svg>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-0">
      {/* 表头：周一起。下缘 hairline 锚定列轴（全宽，与年月条/图例栏的分隔线同一节奏） */}
      <div
        className={`grid grid-cols-7 pt-4 pb-2 ${isTiny ? 'px-0' : 'px-4'}`}
        style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}
      >
        {WEEK_LABELS_MON.map((w, i) => (
          <div key={i} className="text-center text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            {w}
          </div>
        ))}
      </div>

      <div className={`grid grid-cols-7 gap-0 mb-4 rounded-2xl overflow-hidden ${isTiny ? 'mx-0' : 'mx-4'}`}>
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
          let cellBg = 'var(--surface-card)';
          if (isWeekend) cellBg = WEEKEND_BG;
          if (weekInRange) cellBg = CURRENT_WEEK_BG_MONFRI;
          if (isSelected && !isToday) cellBg = 'rgba(var(--s-rgb),0.08)';

          const date = cell.date;
          const emitOpenDay = (source, e) => {
            if (e) { e.stopPropagation(); e.preventDefault(); }
            // 先 setSelectedDate 同步高亮再开面板，与点击语义一致
            onSelectDate?.(date);
            onCellOpenDay?.(date, { source });
          };

          /* 四角格子：与容器 rounded-2xl(16px) 同弧度，避免选中描边(inset ring)在圆角处被
             overflow-hidden 裁掉一角（如"日"列首个选中格右上角缺失） */
          const corner = i === 0
            ? 'rounded-tl-2xl'
            : i === 6
            ? 'rounded-tr-2xl'
            : i === grid.length - 7
            ? 'rounded-bl-2xl'
            : i === grid.length - 1
            ? 'rounded-br-2xl'
            : '';

          return (
            <div
              key={i}
              className={`${isTiny ? 'min-h-[60px] p-[2px] gap-[2px]' : 'min-h-[88px] p-2 gap-1'} flex flex-col transition-colors relative ${corner} ${
                !cell.inMonth ? 'opacity-40' : ''
              }`}
              style={{
                background: cellBg,
                cursor: 'pointer',
                // 常态无框（去格线，开放网格；行带感由当周浅蓝背景提供），选中态保留 inset ring
                boxShadow: isSelected && !isToday ? 'inset 0 0 0 2px rgba(var(--s-rgb),0.45)' : 'none',
              }}
              /* 整个日格背景/空白兜底点击 → 开当日事项面板
                   事件行内部会自行 stopPropagation，防止冒泡到这里 */
              onClick={(e) => emitOpenDay('cell', e)}
            >
              {/* Layer 1: 日期数字（左上） + 农历/节气/节日（右上/手机第二行） + 今日徽章（点击 → 当日面板）
                  手机：节日不与日期挤同一行，wrap 后 w-full 落到第二行顶格 */}
              <div
                className={isTiny ? 'flex flex-wrap items-center gap-x-1' : 'flex items-center justify-between gap-1'}
                onClick={(e) => emitOpenDay('dateBadge', e)}
              >
                <span
                  className={`inline-flex items-center justify-center font-semibold tabular-nums leading-none rounded-md transition ${isTiny ? 'text-[11px] px-[3px] py-[1.5px]' : 'text-[14px] px-[5px] py-[3px]'}`}
                  style={{
                    color: isToday ? 'var(--surface-card)' : isSelected ? 'var(--s-deep)' : 'var(--text-1)',
                    background: isToday
                      ? 'var(--s-main)'
                      : isSelected
                      ? 'rgba(var(--s-rgb),0.12)'
                      : 'transparent',
                    fontWeight: isToday || isSelected ? 700 : 600,
                  }}
                >
                  {day}
                </span>
                <span className={`flex items-center gap-1 min-w-0 ${isTiny ? 'w-full' : ''}`}>
                  {(() => {
                    const lb = lunarBadge(cell.date);
                    // 手机紧凑模式：普通农历日（初一/十五等）在 48px 格里是纯噪音，只保留
                    // 节日/节气/农历月名（weight 600），换行到第二行顶格展示
                    if (isTiny && lb.weight < 600) return null;
                    return (
                      <span
                        className={`leading-none truncate ${isTiny ? 'text-[9px]' : 'text-[10.5px]'}`}
                        style={{ color: lb.color, fontWeight: lb.weight }}
                        title={lb.full}
                      >
                        {lb.text}
                      </span>
                    );
                  })()}
                  {/* 今日徽章：手机上日期数字已有主题色实底标识，省掉胶囊避免与农历挤爆格子 */}
                  {isToday && !isTiny && (
                    <span
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
                      style={{ color: 'var(--surface-card)', background: 'var(--s-main)' }}
                    >
                      今日
                    </span>
                  )}
                </span>
              </div>

              {/* Layer 2: 事项行 · 小圆点 → 复选框（与左FocusPanel同构）；手机紧凑条见 isTiny 分支 */}
              <div
                className={`flex flex-col flex-1 min-h-0 ${isTiny ? 'gap-[2px]' : 'gap-[3px]'}`}
                onClick={(e) => { /* 阻止冒泡到 cell，避免点击事件行空白处也开当日面板（点击事件行空白处按「非事项区」统一：不弹编辑） */ }}
              >
                {(isTiny ? dayEvents.slice(0, 3) : dayEvents.slice(0, 3)).map((ev, j) => {
                  const mod = scheduleModule(ev);
                  const done = Boolean(ev.is_done || ev.done);
                  const failed = !!ev.is_failed && !done; // 标记未完成（三态，与 KeyTasks/FocusPanel 同语义）
                  // 多日事项起止标记：首日 ›、末日 ‹（轻量角标，中间日不标——首尾包裹已表意）
                  const evStart = ev.start_date || ev.date || ev.schedule_date;
                  const evEnd = ev.end_date;
                  let spanMark = '';
                  if (evEnd && evEnd !== evStart) {
                    if (date === evStart) spanMark = '›';
                    else if (date === evEnd) spanMark = '‹';
                  }
                  // 模块色 12% 透明度背景：在 8%（色相趋同难辨）与 16%（偏深）之间取平衡
                  // 注意 CSS 变量必须 var() 包裹：rgba(var(--m-xxx-rgb), 0.12)，缺 var() 是非法值会被丢弃
                  const bg = mod.color.startsWith?.('var(')
                    ? `rgba(var(${mod.color.slice(4, -1)}-rgb), 0.12)`
                    : `${mod.color}1F`;
                  const title = ev.title || ev.name || '';

                  /* 手机紧凑条：无圆点纯文字（色块背景已承担模块归属），内边距压到 2px（与事项间距同级）；
                     单行硬截断（无省略号、不溢出）——超长标题看当日面板。勾选交互移步当日面板；点击条仍直接打开编辑 */
                  if (isTiny) {
                    return (
                      <div
                        key={ev.id || `${date}-${j}`}
                        className="flex items-center min-w-0 px-[2px] py-[1.5px] rounded cursor-pointer"
                        style={{ background: failed ? 'rgba(var(--danger-rgb),0.08)' : bg }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onEventClick?.(ev, date);
                        }}
                      >
                        {failed && (
                          <svg width="6" height="6" viewBox="0 0 8 8" fill="none" className="flex-shrink-0 mr-[2px]">
                            <path d="M1.5 1.5L6.5 6.5M6.5 1.5L1.5 6.5" stroke="var(--danger)" strokeWidth="1.6" strokeLinecap="round"/>
                          </svg>
                        )}
                        <span
                          className="min-w-0 flex-1 text-[9px] leading-[12px] overflow-hidden whitespace-nowrap"
                          style={{
                            textOverflow: 'clip',
                            color: done ? 'var(--text-muted)' : 'var(--ink-700)',
                            fontWeight: 500,
                            textDecoration: done ? 'line-through' : 'none',
                          }}
                        >
                          {spanMark}{title}
                        </span>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={ev.id || `${date}-${j}`}
                      className="flex items-start gap-1.5 text-[12px] leading-tight px-1.5 py-0.5 rounded-md cursor-pointer md:items-center"
                      style={{
                        background: bg,
                        color: done ? 'var(--text-muted)' : 'var(--ink-700)',
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
                      <div className="mt-[1px] md:mt-0 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                        <EventCheckbox ev={ev} mod={mod} date={date} />
                      </div>
                      {spanMark && <span className="flex-shrink-0 opacity-70">{spanMark}</span>}
                      <span className="min-w-0 flex-1 leading-snug break-words md:truncate">{title}</span>
                    </div>
                  );
                })}
                {dayEvents.length > (isTiny ? 2 : 3) && (
                  <span
                    onClick={(e) => emitOpenDay('more', e)}
                    className="font-semibold rounded-md self-start cursor-pointer"
                    style={{
                      color: 'var(--s-deep)',
                      background: 'rgba(var(--s-rgb),0.08)',
                      fontSize: isTiny ? '9px' : '11px',
                      padding: isTiny ? '1px 4px' : '2px 6px',
                    }}
                  >
                    +{dayEvents.length - 3} 更多
                  </span>
                )}
              </div>

              {/* Layer 3: 习惯热力点（点击 → 当日面板）。数字 2/4 仅桌面显示：
                  手机格子窄，数字时有时无导致各行底部参差；统一纯圆点行后每格节奏一致 */}
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
                        style={{ background: on ? 'var(--success)' : 'rgba(var(--s-rgb),0.12)' }}
                      />
                    ))}
                  </div>
                  {!isTiny && (
                    <span className="ml-auto text-[10px] font-medium tabular-nums" style={{ color: habitDone > 0 ? 'var(--success)' : 'rgba(var(--s-rgb),0.5)' }}>
                      {habitDone > 0 ? `${habitDone}/${habitTarget}` : ''}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
