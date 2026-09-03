import { useState, useEffect, useRef } from 'react';
import { toISODate, today as getToday, fromISODate, cachedLoad, cachePeek, loadingGate } from '../utils/date.js';
import { API } from '../api/client.js';

const weekLabels = ['日', '一', '二', '三', '四', '五', '六'];

export default function WeekCalendar({ selectedDate, onSelectDate, refreshSignal, view, onViewChange }) {
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

  // 滚动到当前日
  useEffect(() => {
    if (year === todayYear && month === todayMonth && scrollRef.current) {
      setTimeout(() => {
        const todayEl = scrollRef.current?.querySelector('.cal-day.today');
        if (todayEl && scrollRef.current) {
          const scrollLeft = todayEl.offsetLeft - scrollRef.current.clientWidth / 2 + todayEl.offsetWidth / 2;
          scrollRef.current.scrollTo({ left: scrollLeft, behavior: 'auto' });
        }
      }, 50);
    }
  }, [year, month, dots]);

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

    // 按规则决定圆点颜色（单个圆点）
    let dotColor = null;
    if (hasPriority || hasNormal) {
      if (isPast) dotColor = '#c7c7cc';
      else if (isToday) dotColor = '#ffffff';
      else if (hasPriority) dotColor = '#FF3B30';
      else if (hasNormal) dotColor = '#8e8e93';
    }
    const dotsHtml = dotColor
      ? <div className="cal-dot" style={{ width: '6px', height: '6px', background: dotColor, borderRadius: '50%', marginTop: '2px' }}></div>
      : <div className="cal-dots"></div>;

    days.push(
      <div
        key={day}
        className={`cal-day ${todayClass} ${pastClass} ${selectedClass}`}
        onClick={() => onSelectDate(toISODate(d))}
        style={isSelected && !isToday ? { background: 'rgba(var(--s-rgb),0.08)', boxShadow: 'inset 0 0 0 2px rgba(var(--s-rgb),0.45)' } : undefined}
      >
        <div className="cal-weekday">{weekLabels[w]}</div>
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
      {/* 左右布局：左侧 = ＜ 9月 ＞ 导航(上) + 今日/本周/本月 tab(下)；右侧 = 横向日期条 */}
      <div className="flex items-center gap-4">
        <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
          <div className="flex items-center gap-0.5">
            <button onClick={prevMonth} className="w-7 h-7 rounded-xl hover:bg-black/5 flex items-center justify-center text-[#8e8e93] flex-shrink-0 transition">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"></path></svg>
            </button>
            <span className="text-[14px] font-semibold text-[#1c1c1e] min-w-[36px] text-center">{month}月</span>
            <button onClick={nextMonth} className="w-7 h-7 rounded-xl hover:bg-black/5 flex items-center justify-center text-[#8e8e93] flex-shrink-0 transition">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"></path></svg>
            </button>
          </div>

          {/* 今日/本周/本月 视图切换（紧凑版，紧跟 ＜ 9月 ＞ 下方） */}
          <div className="tab-group compact">
            <button className={view === 'today' ? 'active' : ''} onClick={() => onViewChange?.('today')}>今日</button>
            <button className={view === 'week' ? 'active' : ''} onClick={() => onViewChange?.('week')}>本周</button>
            <button className={view === 'month' ? 'active' : ''} onClick={() => onViewChange?.('month')}>本月</button>
          </div>
        </div>

        <div className="flex-1 overflow-x-auto pb-1.5 self-center" ref={scrollRef}>
          <div className="flex items-center gap-1 px-2">{days}</div>
        </div>
      </div>
    </div>
  );
}
