import { useState, useEffect, useRef } from 'react';
import { toISODate, today as getToday, fromISODate, cachedLoad, cachePeek, loadingGate } from '../utils/date.js';
import { API } from '../api/client.js';

const weekLabels = ['日', '一', '二', '三', '四', '五', '六'];

export default function WeekCalendar({ selectedDate, onSelectDate, refreshSignal }) {
  const today = getToday();
  const todayObj = fromISODate(today);
  const todayYear = todayObj.getFullYear();
  const todayMonth = todayObj.getMonth() + 1;
  const todayDate = todayObj.getDate();

  const [year, setYear] = useState(todayYear);
  const [month, setMonth] = useState(todayMonth);
  const [dots, setDots] = useState({}); // key: "month-day" -> {hasPriority, hasNormal}
  const [loading, setLoading] = useState(false);
  const [hasData, setHasData] = useState(false);
  const scrollRef = useRef(null);
  const inFlightRef = useRef(null);
  const cacheRef = useRef(new Map());

  function loadDots() {
    const daysInMonth = new Date(year, month, 0).getDate();
    const from = toISODate(new Date(year, month - 1, 1));
    const to = toISODate(new Date(year, month - 1, daysInMonth));
    const cacheKey = `wc:${from}:${to}`;
    const CACHE_TTL = 120000;
    const peeked = cachePeek(cacheKey, cacheRef, CACHE_TTL);
    if (peeked) {
      setDots(peeked.value);
      setHasData(true);
      return;
    }
    const gate = loadingGate(setLoading, hasData ? 120 : 0);
    gate.require();

    cachedLoad(cacheKey, async () => {
      const r = await API.schedules.list({ from, to });
      const map = {};
      for (const s of r.schedules) {
        const d = new Date(s.date);
        const key = `${d.getMonth() + 1}-${d.getDate()}`;
        if (!map[key]) map[key] = { hasPriority: false, hasNormal: false };
        if (s.is_key) map[key].hasPriority = true;
        else map[key].hasNormal = true;
      }
      return map;
    }, inFlightRef, cacheRef, CACHE_TTL).then(map => {
      setDots(map);
      setHasData(true);
      gate.done();
    }).catch(e => { console.error(e); gate.done(); });
  }

  useEffect(() => { loadDots(); }, [year, month, refreshSignal]);

  // 居中定位今天：getBoundingClientRect 计算相对位置（不依赖 offsetParent，避免定位祖先陷阱）。
  // 移动端浏览器恢复页面时会用记住的滚动位置覆盖早期程序化滚动（刷新/返回常见），
  // 单次 50ms 定位会被吞掉 → 打开页面看不到今天（线上已踩坑），故多时机重试直至就位
  function centerToday() {
    if (year !== todayYear || month !== todayMonth || !scrollRef.current) return;
    const cont = scrollRef.current;
    const todayEl = cont.querySelector('.cal-day.today');
    if (!todayEl) return;
    const cRect = cont.getBoundingClientRect();
    const eRect = todayEl.getBoundingClientRect();
    if (cRect.width < 40 || eRect.width < 10) return; // 布局未就绪（抽屉动画/隐藏态），留给下次重试
    const target = cont.scrollLeft + (eRect.left - cRect.left) - (cRect.width - eRect.width) / 2;
    if (Math.abs(target - cont.scrollLeft) < 2) return; // 已就位
    cont.scrollTo({ left: target, behavior: 'auto' });
  }

  // 滚动到当前日：渲染帧 + 300ms + 1000ms 三次重试（覆盖浏览器滚动位置恢复的时序）
  useEffect(() => {
    if (year !== todayYear || month !== todayMonth) return;
    const raf = requestAnimationFrame(centerToday);
    const t1 = setTimeout(centerToday, 300);
    const t2 = setTimeout(centerToday, 1000);
    return () => { cancelAnimationFrame(raf); clearTimeout(t1); clearTimeout(t2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, dots]);

  // 「回到今天」：重置月份与选中日期，并兜底滚回今天（同月内 effect 不触发，需手动滚）
  function backToToday() {
    setYear(todayYear);
    setMonth(todayMonth);
    onSelectDate(today);
    setTimeout(centerToday, 60);
    setTimeout(centerToday, 350);
  }

  function prevMonth() {
    let m = month - 1, y = year;
    if (m < 1) { m = 12; y -= 1; }
    setMonth(m); setYear(y);
  }
  function nextMonth() {
    let m = month + 1, y = year;
    if (m > 12) { m = 1; y += 1; }
    setMonth(m); setYear(y);
  }

  const daysInMonth = new Date(year, month, 0).getDate();
  const days = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month - 1, day);
    const w = d.getDay();
    const isToday = (year === todayYear && month === todayMonth && day === todayDate);
    const isPast = !isToday && (year < todayYear || (year === todayYear && month < todayMonth) || (year === todayYear && month === todayMonth && day < todayDate));
    const isSelected = selectedDate === toISODate(d);
    const dKey = `${month}-${day}`;
    const { hasPriority, hasNormal } = dots[dKey] || { hasPriority: false, hasNormal: false };

    const todayClass = isToday ? 'today' : '';
    const pastClass = isPast ? 'past' : '';
    const selectedClass = isSelected && !isToday ? 'selected' : '';

    // 今天格子三重保险标识（移动端曾出现 CSS 类样式未达预期的设备，导致"看不出哪天是今天"）：
    // ① weekday 文字直接显示「今」（文字级，任何渲染路径都可见）
    // ② 内联样式兜底实心填充（不依赖外部 CSS 是否生效）
    // ③ CSS 类 .cal-day.today（正常路径）
    const weekdayText = isToday ? '今' : weekLabels[w];

    // 按规则决定圆点颜色（单个圆点）
    let dotColor = null;
    if (hasPriority || hasNormal) {
      if (isPast) dotColor = 'var(--ink-300)';
      else if (isToday) dotColor = 'var(--surface-card)';
      else if (hasPriority) dotColor = 'var(--danger)';
      else if (hasNormal) dotColor = 'var(--text-muted)';
    }
    const dotsHtml = dotColor
      ? <div className="cal-dot" style={{ width: '4px', height: '4px', background: dotColor, borderRadius: '50%' }}></div>
      : <div className="cal-dots"></div>;

    days.push(
      <div
        key={day}
        className={`cal-day ${todayClass} ${pastClass} ${selectedClass}`}
        style={isToday ? { background: 'var(--s-main, #007AFF)', color: '#fff' } : undefined}
        onClick={() => onSelectDate(toISODate(d))}
      >
        <div className="cal-weekday">{weekdayText}</div>
        <div className="cal-date">{day}</div>
        <div className="cal-dots">{dotsHtml}</div>
      </div>
    );
  }

  return (
    <div
      className="glass-card px-5 py-3.5"
      style={{ opacity: loading && !hasData ? 0.7 : 1, transition: 'opacity .2s ease' }}
    >
      {/* 左右布局：左侧 = ＜ 9月 ＞ 月份导航；右侧 = 横向日期条 */}
      <div className="flex items-center gap-4">
        <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
          <div className="flex items-center gap-0.5">
            <button onClick={prevMonth} className="w-7 h-7 rounded-xl hover:bg-black/5 flex items-center justify-center text-[var(--text-muted)] flex-shrink-0 transition">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"></path></svg>
            </button>
            <span className="text-[14px] font-semibold text-[var(--text-1)] min-w-[36px] text-center">{month}月</span>
            <button onClick={nextMonth} className="w-7 h-7 rounded-xl hover:bg-black/5 flex items-center justify-center text-[var(--text-muted)] flex-shrink-0 transition">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"></path></svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-x-auto pb-1.5 self-center" ref={scrollRef}>
          <div className="flex items-center gap-1 px-2">{days}</div>
        </div>

        {/* 查看非今天时显示：一键回到今天（P1 迷路恢复出口） */}
        {selectedDate !== today && (
          <button className="cal-back-today" onClick={backToToday} title="回到今天">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path></svg>
            回到今天
          </button>
        )}
      </div>
    </div>
  );
}
