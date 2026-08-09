import { useEffect, useRef, useState } from 'react';
import { API } from '../api/client.js';
import { formatDuration, today as getToday, fromISODate, calcDurationMin, cachedLoad } from '../utils/date.js';
import { store } from '../utils/store.js';
import { useToast } from '../context/ToastContext.jsx';

const weekLabels = ['日', '一', '二', '三', '四', '五', '六'];

// 成长类型配置
const GROWTH_TYPES = {
  energy: { color: '#34c759', bg: '#e5f6ea', borderColor: '#5dd57a', doneColor: '#5dd57a', lineColor: '#34c759' },
  mind:   { color: '#007aff', bg: '#e0ecff', borderColor: '#4a9bff', doneColor: '#4a9bff', lineColor: '#007aff' },
  skill:  { color: '#d4a017', bg: '#fbf3d8', borderColor: '#e0b94a', doneColor: '#e0b94a', lineColor: '#d4a017' },
};

// 事项分类颜色
const CAT_COLORS = {
  1: { color: '#ff3b30', bg: '#ffe8e8', borderColor: '#ff6b64', doneColor: '#ff6b64', lineColor: '#ff3b30', timeColor: '#ff3b30' },
  2: { color: '#ff9500', bg: '#fff4d8', borderColor: '#ffa635', doneColor: '#ffa635', lineColor: '#ff9500', timeColor: '#ff9500' },
  3: { color: '#8e8e93', bg: '#f2f2f7', borderColor: '#a6a6ad', doneColor: '#a6a6ad', lineColor: '#8e8e93', timeColor: '#8e8e93' },
  4: { color: '#34c759', bg: '#e5f6ea', borderColor: '#5dd57a', doneColor: '#5dd57a', lineColor: '#34c759', timeColor: '#34c759' },
};

// 根据习惯名称/图标自动推断成长类型
function inferGrowthType(habit) {
  const text = (habit.name + ' ' + (habit.emoji || '')).toLowerCase();
  // 关键词明确的优先匹配（覆盖 SQL 默认值 energy）
  if (/睡眠|运动|喝水|饮食|健身|跑步|游泳|瑜伽|冥想|休息|😴|🏃|💧|🍎/.test(text)) return 'energy';
  if (/看书|阅读|思考|学习|📖|🧠|📚/.test(text)) return 'mind';
  if (/英语|口语|表达|演讲|沟通|写作|🗣️|🎤|✍️/.test(text)) return 'skill';
  // 用户显式设置的类型才生效
  if (habit.growth_type && habit.growth_type !== 'energy') return habit.growth_type;
  return 'energy';
}

// 将 hex 颜色与白色混合，生成浅色背景
function lighten(hex, whiteRatio = 0.82) {
  const h = (hex || '#34c759').replace('#', '');
  if (h.length !== 6) return '#f2f2f7';
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const mix = c => Math.round(c * (1 - whiteRatio) + 255 * whiteRatio);
  const toHex = n => n.toString(16).padStart(2, '0');
  return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`;
}

function dateLabel(dateStr) {
  const d = fromISODate(dateStr);
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${m}月${day}日 周${weekLabels[d.getDay()]}`;
}

function isToday(dateStr) {
  return dateStr === getToday();
}

export default function Timeline({ date, view, range, refreshSignal, onEdit, onChange }) {
  const toast = useToast();
  const [schedules, setSchedules] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [habits, setHabits] = useState([]);
  const [loading, setLoading] = useState(true);
  const inFlightRef = useRef(null);
  const cacheRef = useRef(new Map());

  function load() {
    const cacheKey = `tl:${range.from}:${range.to}:${date}:${refreshSignal}`;
    setLoading(true);
    cachedLoad(cacheKey, async () => {
      const [s, t, h] = await Promise.all([
        API.schedules.list({ from: range.from, to: range.to }),
        API.tasks.list({ from: range.from, to: range.to }),
        API.habits.list({ date })
      ]);
      return { sched: s.schedules, tasks: t.tasks, habits: h.habits };
    }, inFlightRef, cacheRef, 3000).then(r => {
      setSchedules(r.sched);
      setTasks(r.tasks);
      setHabits(r.habits);
      setLoading(false);
    }).catch(e => { console.error(e); setLoading(false); });
  }

  useEffect(() => { load(); }, [range.from, range.to, date, refreshSignal]);

  // 订阅 patch：其他面板 toggle 时即时同步，无需重新 load
  useEffect(() => store.subscribe(patch => {
    if (patch.type === 'schedule' && patch.id !== undefined) {
      setSchedules(ss => ss.map(x => x.id === patch.id ? { ...x, is_done: patch.is_done } : x));
    } else if (patch.type === 'habit' && patch.id !== undefined) {
      setHabits(hs => hs.map(x => x.id === patch.id ? { ...x, done_today: patch.done_today } : x));
    } else if (patch.type === 'task' && patch.id !== undefined) {
      setTasks(ts => ts.map(x => x.id === patch.id ? { ...x, is_done: patch.is_done } : x));
    } else if (patch.type === 'reload') {
      onChange?.();
    }
  }), []);

  async function toggleSchedule(s) {
    const nextDone = s.is_done ? 0 : 1;
    setSchedules(ss => ss.map(x => x.id === s.id ? { ...x, is_done: nextDone } : x));
    store.broadcast({ type: 'schedule', id: s.id, is_done: nextDone });
    try {
      await API.schedules.update(s.id, { is_done: nextDone });
    } catch (e) {
      setSchedules(ss => ss.map(x => x.id === s.id ? { ...x, is_done: s.is_done } : x));
      store.broadcast({ type: 'schedule', id: s.id, is_done: s.is_done });
      toast.error(e.message);
    }
  }

  async function toggleTask(t) {
    const nextDone = t.is_done ? 0 : 1;
    setTasks(ts => ts.map(x => x.id === t.id ? { ...x, is_done: nextDone } : x));
    store.broadcast({ type: 'task', id: t.id, is_done: nextDone });
    try {
      await API.tasks.update(t.id, { is_done: nextDone });
    } catch (e) {
      setTasks(ts => ts.map(x => x.id === t.id ? { ...x, is_done: t.is_done } : x));
      store.broadcast({ type: 'task', id: t.id, is_done: t.is_done });
      toast.error(e.message);
    }
  }

  async function toggleHabit(h) {
    const nextDone = h.done_today ? 0 : 1;
    setHabits(hs => hs.map(x => x.id === h.id ? { ...x, done_today: nextDone } : x));
    store.broadcast({ type: 'habit', id: h.id, done_today: nextDone });
    try {
      await API.habits.toggle(h.id, date, nextDone);
    } catch (e) {
      setHabits(hs => hs.map(x => x.id === h.id ? { ...x, done_today: h.done_today } : x));
      store.broadcast({ type: 'habit', id: h.id, done_today: h.done_today });
      toast.error(e.message);
    }
  }

  function getCat(s) {
    if (s.isHabit) return 4;
    const cat = Number(s.category);
    if (cat === 1 || cat === 2 || cat === 3 || cat === 4) return cat;
    if (s.is_key) {
      const st = s.start_time;
      if (st && Number(st.split(':')[0]) <= 12) return 1;
      return 2;
    }
    return 3;
  }

  function getItemTheme(item) {
    if (item.isHabit) {
      const gt = inferGrowthType(item);
      return GROWTH_TYPES[gt] || GROWTH_TYPES.energy;
    }
    const cat = getCat(item);
    return CAT_COLORS[cat] || CAT_COLORS[3];
  }

  function getColor(item) {
    // 小圆点始终保留原色（即使勾选完成也不变灰，与习惯版面对齐）
    const theme = getItemTheme(item);
    return theme.color;
  }

  function getLineColor(item) {
    // 竖线颜色始终保留原色（勾选后仅文字变灰，背景/竖线不变）
    const theme = getItemTheme(item);
    return theme.lineColor;
  }

  function getRowBg(item) {
    // 背景渐变始终保留原色（勾选后仅文字变灰+删除线，渐变不变）
    const theme = getItemTheme(item);
    return `linear-gradient(90deg,${lighten(theme.color)} 0%,transparent 70%)`;
  }

  function getTimeColor(item) {
    if (item.isHabit) {
      if (item.done_today) return '#aeaeae';
      const theme = getItemTheme(item);
      return theme.color;
    }
    if (item.is_done) return '#aeaeae';
    const theme = getItemTheme(item);
    return theme.color;
  }

  function getDoneColor(item) {
    if (item.isHabit) {
      const theme = getItemTheme(item);
      return theme.doneColor;
    }
    const theme = getItemTheme(item);
    return theme.doneColor;
  }

  function getBorderColor(item) {
    if (item.isHabit) {
      const theme = getItemTheme(item);
      return theme.borderColor;
    }
    const theme = getItemTheme(item);
    return theme.borderColor;
  }

  function useSquareCheckbox(item) {
    if (item.isHabit) return false;
    if (item.isTask) return true;
    const cat = getCat(item);
    return cat !== 4;
  }

  // 取可靠时长：优先按 start/end 实时计算，duration_min 作为回退（兜底脏数据）
  function getEffectiveDur(item) {
    const calc = calcDurationMin(item.start_time, item.end_time);
    if (calc != null) return calc;
    const d = Number(item.duration_min);
    return Number.isFinite(d) && d > 0 ? d : null;
  }

  // 行高逻辑：统一竖线高度 20px，与 40px 行高比例协调
  function getLineHeight(_item) {
    return 20;
  }

  // 整行 min-height：不单独拉高，完全由竖线高度 + 固定 padding 自然决定（线性对应时长）
  function getRowMinHeight(_item) {
    return undefined;
  }

  function formatTimeLabel(item) {
    if (item.isHabit) {
      // 优先使用 start_time / end_time（新字段），回退到 target_time
      const st = item.start_time || item.target_time;
      const et = item.end_time;
      // 兜底：按 start/end 实时计算，避免 duration_min 脏数据
      const displayDur = getEffectiveDur(item);

      // 跨天习惯（如睡眠 7h）特殊处理：用 start + dur 推 end
      const isSleep = item.emoji === '😴' || (item.name && item.name.includes('睡眠'));
      if (isSleep && st && displayDur) {
        const [h, m] = st.split(':').map(Number);
        const startMin = h * 60 + m;
        const endMin = (startMin + displayDur) % (24 * 60);
        const endH = Math.floor(endMin / 60);
        const endM = endMin % 60;
        return `${st} – ${String(endH).padStart(2,'0')}:${String(endM).padStart(2,'0')} · ${formatDuration(displayDur)}`;
      }

      let txt = '';
      if (st && et) txt = `${st} – ${et}`;
      else if (st) txt = st;

      if (displayDur) {
        const hours = displayDur / 60;
        if (hours === 1) txt += (txt ? ' · ' : '') + '1 小时';
        else if (Number.isInteger(hours)) txt += (txt ? ' · ' : '') + `${hours} 小时`;
        else txt += (txt ? ' · ' : '') + formatDuration(displayDur);
      }
      return txt;
    }
    if (!item.start_time) return '';
    let txt = item.start_time;
    if (item.end_time) txt += ' – ' + item.end_time;
    const displayDur = getEffectiveDur(item);
    if (displayDur) {
      const hours = displayDur / 60;
      if (hours === 1) txt += ' · 1 小时';
      else if (Number.isInteger(hours)) txt += ` · ${hours} 小时`;
      else txt += ` · ${formatDuration(displayDur)}`;
    }
    return txt;
  }

  function formatShort(item) {
    if (item.isHabit) {
      const st = item.start_time || item.target_time;
      const et = item.end_time;
      const displayDur = getEffectiveDur(item);
      if (st && et) {
        return displayDur ? `${st} – ${et} · ${formatDuration(displayDur)}` : `${st} – ${et}`;
      }
      if (st) {
        return displayDur ? `${st} · ${formatDuration(displayDur)}` : st;
      }
      if (displayDur) return formatDuration(displayDur);
      return '';
    }
    const displayDur = getEffectiveDur(item);
    if (!displayDur) return '';
    const hours = displayDur / 60;
    if (hours === 1) return '1 小时';
    if (Number.isInteger(hours)) return `${hours} 小时`;
    return formatDuration(displayDur);
  }

  const titleText = view === 'today'
    ? <>全部事项 <span className="text-[#c7c7cc] font-medium">·</span> <span className="text-[#007aff]">今日</span></>
    : view === 'week'
    ? <>全部事项 <span className="text-[#c7c7cc] font-medium">·</span> <span className="text-[#007aff]">本周</span></>
    : <>全部事项 <span className="text-[#c7c7cc] font-medium">·</span> <span className="text-[#007aff]">本月</span></>;

  // 计算事项在 [hHour:00, hHour+1:00) 半开区间内占用的分钟数（用于分段行高）
  function minutesInHour(item, hHour) {
    if (!item.start_time) return null;
    const [sh, sm] = item.start_time.split(':').map(Number);
    const totalDur = getEffectiveDur(item);
    if (totalDur == null) return null; // 没确定时长：按 0 分钟处理
    const startMin = sh * 60 + sm;
    const endMin = startMin + totalDur; // 注意这里不做跨天 wrap，允许 >1440，便于比较

    const hourBegin = hHour * 60;
    const hourEnd = (hHour + 1) * 60;
    const overlapBegin = Math.max(startMin, hourBegin);
    const overlapEnd = Math.min(endMin, hourEnd);
    if (overlapEnd <= overlapBegin) return null;
    return overlapEnd - overlapBegin;
  }

  // === Today 视图：按小时时间轴 ===
  function renderTodayView() {
    const todaySchedules = schedules.filter(s => s.date === date).map(s => ({ ...s, isHabit: false, isTask: false }));
    const todayTasks = tasks.filter(t => t.date === date).map(t => ({ ...t, isHabit: false, isTask: true }));
    const todayHabits = habits.map(h => ({
      ...h,
      isHabit: true,
      isTask: false,
      is_done: h.done_today ? 1 : 0,
      title: h.name,
      start_time: h.start_time || h.target_time,
      end_time: h.end_time,
      date: date
    }));

    const allItems = [...todaySchedules, ...todayHabits];

    const HOURS = [];
    for (let h = 6; h <= 23; h++) HOURS.push(h);
    // byHour[h] = [{item, slotKind: 'first'|'continue', minsInHour}]
    const byHour = {};
    const FINAL_SLICE_THRESHOLD = 15; // 末段占用 < 15 分钟时合并到前一段（避免 19:02 单独占一格）
    allItems.forEach(item => {
      if (!item.start_time) return;
      const [sh, sm] = item.start_time.split(':').map(Number);
      if (Number.isNaN(sh) || Number.isNaN(sm)) return;
      const totalDur = getEffectiveDur(item);
      if (totalDur == null) {
        // 无法确定时长：只按 start_time 挂一段，不跨段续行
        if (sh >= 6 && sh <= 23) {
          (byHour[sh] = byHour[sh] || []).push({
            item, slotKind: 'first', minsInHour: null, slotIdx: 0
          });
        }
        return;
      }
      const startMin = sh * 60 + sm;
      const endMin = startMin + totalDur;
      // 先求所有有交集的小时段（6..23）
      const firstH = Math.max(6, Math.floor(startMin / 60));
      const lastH = Math.min(23, Math.floor((endMin - 0.001) / 60));
      const slots = [];
      for (let hh = firstH; hh <= lastH; hh++) {
        const mins = minutesInHour(item, hh);
        if (mins == null || mins <= 0) continue;
        slots.push({ h: hh, mins });
      }
      // 若最后一段 < 阈值，将 mins 合并到前一段，删除最后一段（符合"16/17/18 三段"预期）
      if (slots.length >= 2) {
        const last = slots[slots.length - 1];
        if (last.mins < FINAL_SLICE_THRESHOLD) {
          slots[slots.length - 2].mins += last.mins;
          slots.pop();
        }
      }
      slots.forEach((slot, i) => {
        (byHour[slot.h] = byHour[slot.h] || []).push({
          item,
          slotKind: i === 0 ? 'first' : 'continue',
          minsInHour: slot.mins,
          slotIdx: i,
          slotTotal: slots.length
        });
      });
    });
    // 同小时内排序：先按首段/续段的 start_time 升序（续段跟随它的 item start 位置，保持稳定）
    Object.keys(byHour).forEach(h => {
      byHour[h].sort((a, b) => {
        const ma = Number((a.item.start_time || '00:00').split(':')[1]);
        const mb = Number((b.item.start_time || '00:00').split(':')[1]);
        if (ma !== mb) return ma - mb;
        // 同 start_min，先排首段，再排续段（首段更重要）
        const ka = a.slotKind === 'first' ? 0 : 1;
        const kb = b.slotKind === 'first' ? 0 : 1;
        if (ka !== kb) return ka - kb;
        return String(a.item.id ?? '').localeCompare(String(b.item.id ?? ''));
      });
    });

    function slotLineHeight(_slot) {
      // 统一竖线高度 20px
      return 20;
    }
  // 行 min-height：完全不设档位，让行高由竖线高度 + 固定 padding 自然决定（线性对应时长）
  // CSS 已提供 min-height: 48px 兜底，短时长(15/30min)不会被压缩得太扁
  function slotRowMinHeight(_slot) {
    return undefined;
  }
    // 续段用的"与首段一致的浅色背景"，但去掉已完成的灰底替换（保持色调连续），这里复用 getRowBg 即可（它已考虑 is_done）
    // 续段：隐藏复选框/文字 → timeline-content 区域留空占位（只显示小圆点保证右对齐）

    return (
      <>
        {HOURS.map(h => {
          const slots = byHour[h] || [];
          const timeStr = `${String(h).padStart(2, '0')}:00`;

          if (slots.length === 0) {
            return (
              <div key={h} className="timeline-row">
                <div className="time-label">{timeStr}</div>
                <div className="timeline-line" style={{background:'#e5e5ea', height:'20px'}}></div>
                <div className="timeline-content"></div>
              </div>
            );
          }

          // 小时标签显示规则：该小时第一段的首段显示；或者该小时存在任意 slotIdx=0 的首段显示
          const hasFirstInHour = slots.some(s => s.slotKind === 'first');

          return slots.map((slot, idx) => {
            const item = slot.item;
            const isFirst = slot.slotKind === 'first';
            const color = getColor(item);
            const lineColor = getLineColor(item);
            const lineHeight = slotLineHeight(slot);
            const rowMinHeight = slotRowMinHeight(slot);
            const isSquareCheckbox = useSquareCheckbox(item);
            const rowBg = getRowBg(item);
            // 时间标签：若该小时有首段，则第一个首段（idx最小且first）显示；否则第一个续段显示或不显示
            let showLabel = false;
            if (hasFirstInHour && isFirst) {
              const firstFirstIdx = slots.findIndex(s => s.slotKind === 'first');
              showLabel = firstFirstIdx === idx;
            } else if (!hasFirstInHour) {
              showLabel = idx === 0;
            }
            const done = item.isHabit ? !!item.done_today : !!item.is_done;
            const isCat4 = !item.isHabit && getCat(item) === 4;
            const timeColor = getTimeColor(item);
            const doneColor = getDoneColor(item);
            const borderColor = getBorderColor(item);
            const key = `${h}-${item.isHabit ? 'h' : 's'}-${item.id}-${slot.slotIdx}`;

            // === 续段渲染：背景色 + 竖线 + 半透明标题（归属标识）+ 小圆点 ===
            if (!isFirst) {
              return (
                <div
                  key={key}
                  className={`timeline-row rounded-xl ${isSquareCheckbox ? 'task-row' : 'habit-row'}`}
                  style={{background: rowBg, ...(rowMinHeight ? {minHeight: `${rowMinHeight}px`} : {})}}
                  onClick={(e) => {
                    if (item.isHabit || isCat4) return;
                    onEdit?.(item);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (item.isHabit || isCat4) window.__showContextMenu?.(e.clientX, e.clientY, 'habit', item.id);
                    else window.__showContextMenu?.(e.clientX, e.clientY, 'schedule', item.id);
                  }}
                >
                  <div className="time-label" style={{color: timeColor, visibility:'hidden'}}>{showLabel ? timeStr : ''}</div>
                  <div className="timeline-line" style={{background: lineColor, height: `${lineHeight}px`}}></div>
                  <div className="timeline-content">
                    {/* 续段显示半透明截断标题（归属标识），不显示复选框和完整时间 */}
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-[14px] font-medium truncate"
                        style={{
                          color: done ? '#aeaeae' : '#1c1c1e',
                          opacity: 0.5,
                          textDecoration: done ? 'line-through' : 'none',
                        }}
                      >
                        {item.emoji ? item.emoji + ' ' : ''}{item.title}
                      </p>
                    </div>
                    <span
                      className={`w-2 h-2 flex-shrink-0 self-center ${isSquareCheckbox ? 'rounded-[2px]' : 'rounded-full'}`}
                      style={{background: color}}
                      onClick={(e) => e.stopPropagation()}
                    ></span>
                  </div>
                </div>
              );
            }

            // === 首段渲染：完整 UI ===
            return (
              <div
                key={key}
                className={`timeline-row rounded-xl ${isSquareCheckbox ? 'task-row' : 'habit-row'}`}
                style={{background: rowBg, ...(rowMinHeight ? {minHeight: `${rowMinHeight}px`} : {})}}
                onClick={(e) => {
                  if (item.isHabit || isCat4) return;
                  onEdit?.(item);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (item.isHabit || isCat4) window.__showContextMenu?.(e.clientX, e.clientY, 'habit', item.id);
                  else window.__showContextMenu?.(e.clientX, e.clientY, 'schedule', item.id);
                }}
              >
                <div className="time-label" style={{color: timeColor}}>{showLabel ? timeStr : ''}</div>
                <div className="timeline-line" style={{background: lineColor, height: `${lineHeight}px`}}></div>
                <div className="timeline-content">
                  <input
                    type="checkbox"
                    className={isSquareCheckbox ? 'cb-square' : 'cb-round'}
                    checked={done}
                    onChange={() => {}}
                    style={{ '--cb-color': doneColor, '--cb-border': done ? doneColor : borderColor }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (item.isHabit) toggleHabit(item);
                      else toggleSchedule(item);
                    }}
                  />
                  <div className="flex-1">
                    <p
                      className={`text-[14px] font-medium ${done ? 'text-[#8e8e93] line-through' : 'text-[#1c1c1e]'}`}
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                    >
                      {item.emoji ? item.emoji + ' ' : ''}{item.title}
                    </p>
                    <p
                      className={`text-[12px] mt-0 ${done ? 'text-[#aeaeae]' : 'text-[#8e8e93]'}`}
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                    >
                      {item.isHabit ? formatTimeLabel(item) : (isSquareCheckbox ? formatTimeLabel(item) : formatShort(item))}
                    </p>
                  </div>
                  <span
                    className={`w-2 h-2 flex-shrink-0 self-center ${isSquareCheckbox ? 'rounded-[2px]' : 'rounded-full'}`}
                    style={{background: color}}
                    onClick={(e) => e.stopPropagation()}
                  ></span>
                </div>
              </div>
            );
          });
        })}

        {todayTasks.length > 0 && (
          <>
            <div className="hairline my-3"></div>
            <div className="text-[10px] font-semibold text-[#8e8e93] uppercase tracking-wide px-3 mb-2">待办</div>
            <div className="space-y-1.5 px-3">
              {todayTasks.map(t => {
                const done = !!t.is_done;
                const doneColor = t.priority === 1 ? '#ff6b64' : '#a6a6ad';
                const borderColor = t.priority === 1 ? '#ff6b64' : '#a6a6ad';
                const dotColor = t.priority === 1 ? '#ff3b30' : '#8e8e93';
                const rowBg = t.priority === 1
                  ? 'linear-gradient(90deg,#ffe8e8 0%,transparent 70%)'
                  : 'linear-gradient(90deg,#f2f2f7 0%,transparent 70%)';
                return (
                  <div key={t.id} className="flex items-center gap-3 py-2.5 px-3 rounded-xl task-row" style={{background: rowBg}}>
                    <input
                      type="checkbox"
                      className="cb-square"
                      checked={done}
                      onChange={() => {}}
                      style={{ '--cb-color': doneColor, '--cb-border': done ? doneColor : borderColor }}
                      onClick={(e) => { e.stopPropagation(); toggleTask(t); }}
                    />
                    <span className={`text-[14px] flex-1 ${done ? 'text-[#8e8e93] line-through' : 'text-[#1c1c1e] font-medium'}`}>
                      {t.title}
                    </span>
                    <span className={`w-2 h-2 flex-shrink-0 rounded-[2px]`} style={{background: dotColor}}></span>
                    {t.due_time && <span className="text-[12px] text-[#8e8e93]">{t.due_time}</span>}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {todaySchedules.filter(s => !s.start_time).length > 0 && (
          <>
            <div className="hairline my-3"></div>
            <div className="text-[10px] font-semibold text-[#8e8e93] uppercase tracking-wide px-3 mb-2">未定时事项</div>
            <div className="space-y-1.5 px-3">
              {todaySchedules.filter(s => !s.start_time).map(s => {
                const square = useSquareCheckbox(s);
                const rowBg = getRowBg(s);
                const color = getColor(s);
                const doneColor = getDoneColor(s);
                const borderColor = getBorderColor(s);
                const done = !!s.is_done;
                return (
                  <div key={s.id} className="flex items-center gap-3 py-2.5 px-3 rounded-xl task-row" style={{background: rowBg}}>
                    <input
                      type="checkbox"
                      className={square ? 'cb-square' : 'cb-round'}
                      checked={done}
                      onChange={() => {}}
                      style={{ '--cb-color': doneColor, '--cb-border': done ? doneColor : borderColor }}
                      onClick={(e) => { e.stopPropagation(); toggleSchedule(s); }}
                    />
                    <span className={`text-[14px] flex-1 ${done ? 'text-[#8e8e93] line-through' : 'text-[#1c1c1e] font-medium'}`}>
                      {s.title}
                    </span>
                    <span className={`w-2 h-2 flex-shrink-0 ${square ? 'rounded-[2px]' : 'rounded-full'}`} style={{background: color}}></span>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {todayHabits.filter(h => !h.start_time && !h.target_time).length > 0 && (
          <>
            <div className="hairline my-3"></div>
            <div className="text-[10px] font-semibold text-[#8e8e93] uppercase tracking-wide px-3 mb-2">全天习惯</div>
            <div className="space-y-1.5 px-3">
              {todayHabits.filter(h => !h.start_time && !h.target_time).map(h => {
                const done = !!h.done_today;
                const color = getColor(h);
                const doneColor = getDoneColor(h);
                const borderColor = getBorderColor(h);
                return (
                  <div key={`habit-allday-${h.id}`} className="flex items-center gap-3 py-2.5 px-3 rounded-xl habit-row" style={{background: 'linear-gradient(90deg,#e5f6ea 0%,transparent 70%)'}}>
                    <input
                      type="checkbox"
                      className="cb-round"
                      checked={done}
                      onChange={() => {}}
                      style={{ '--cb-color': doneColor, '--cb-border': done ? doneColor : borderColor }}
                      onClick={(e) => { e.stopPropagation(); toggleHabit(h); }}
                    />
                    <span className={`text-[14px] flex-1 ${done ? 'text-[#8e8e93] line-through' : 'text-[#1c1c1e] font-medium'}`}>
                      {h.emoji} {h.name}
                    </span>
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{background: color}}
                    ></span>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {todaySchedules.length === 0 && todayTasks.length === 0 && todayHabits.length === 0 && (
          <div className="text-center py-8 text-sm text-[#8e8e93]">
            <div className="text-2xl mb-2">🕐</div>
            今天还没有安排
          </div>
        )}
      </>
    );
  }

  // === Week/Month 视图：按日期分组 ===
  function renderRangeView() {
    const groups = {};
    schedules.forEach(s => {
      if (!groups[s.date]) groups[s.date] = [];
      groups[s.date].push({ ...s, isHabit: false, isTask: false });
    });
    tasks.forEach(t => {
      if (!groups[t.date]) groups[t.date] = [];
      groups[t.date].push({ ...t, isHabit: false, isTask: true });
    });
    // 习惯只有今日视图展示（简化处理），周/月视图不展示习惯
    const sortedDates = Object.keys(groups).sort();

    if (sortedDates.length === 0) {
      return (
        <div className="text-center py-8 text-sm text-[#8e8e93]">
          <div className="text-2xl mb-2">🕐</div>
          {view === 'week' ? '本周' : '本月'}还没有安排
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {sortedDates.map(d => {
          const items = groups[d];
          const sortedItems = [...items].sort((a, b) => {
            const ta = a.start_time || '99:99';
            const tb = b.start_time || '99:99';
            return ta.localeCompare(tb);
          });
          const doneCount = items.filter(t => t.is_done).length;
          const label = isToday(d) ? `今天 · ${dateLabel(d)}` : dateLabel(d);

          return (
            <div key={d} className="mb-2">
              <div className="flex items-center gap-2 mb-1.5 px-1 sticky top-0 bg-white/60 backdrop-blur-sm py-1.5 z-10 rounded">
                <div className="w-2 h-2 rounded-[2px] bg-[#1c1c1e] shrink-0"></div>
                <p className="text-[13px] font-semibold text-[#1c1c1e]">{label}</p>
                <span className="text-[11px] text-[#8e8e93]">{items.length} 项 · 已完成 {doneCount}</span>
              </div>

              <div className="space-y-0.5">
                {sortedItems.map(item => {
                  const isSched = !!item.start_time || !!item.is_key || !item.priority;
                  const color = isSched ? getColor(item) : (item.priority === 1 ? '#ff3b30' : '#8e8e93');
                  const lineColor = isSched ? getLineColor(item) : (item.priority === 1 ? '#ff9999' : '#c7c7cc');
                  const rowBg = isSched ? getRowBg(item) : (item.is_done
                    ? 'linear-gradient(90deg,#f2f2f7 0%,transparent 70%)'
                    : color === '#ff3b30'
                    ? 'linear-gradient(90deg,#ffe8e8 0%,transparent 70%)'
                    : 'linear-gradient(90deg,#f2f2f7 0%,transparent 70%)');
                  const squareCb = isSched ? useSquareCheckbox(item) : true;
                  const cbType = squareCb ? 'cb-square' : 'cb-round';
                  const timeLabel = isSched ? formatTimeLabel(item) : (item.due_time || '');
                  const lineHeight = isSched ? getLineHeight(item) : 16;
                  const rowMinHeight = isSched ? getRowMinHeight(item) : undefined;
                  const done = !!item.is_done;
                  const doneColor = isSched ? getDoneColor(item) : (item.priority === 1 ? '#ff5e54' : '#aeaeae');
                  const borderColor = isSched ? getBorderColor(item) : (item.priority === 1 ? '#ff9999' : '#d1d1d6');
                  const timeColor = isSched ? getTimeColor(item) : (done ? '#aeaeae' : color);

                  return (
                    <div
                      key={item.id}
                      className="timeline-row rounded-xl"
                      style={{background: rowBg, ...(rowMinHeight ? {minHeight: `${rowMinHeight}px`} : {})}}
                      onClick={() => isSched && onEdit?.(item)}
                    >
                      <div className="time-label" style={{color: timeColor}}>
                        {item.start_time ? item.start_time.split('-')[0] : ''}
                      </div>
                      <div className="timeline-line" style={{background: lineColor, height: `${lineHeight}px`}}></div>
                      <div className="timeline-content">
                        <input
                          type="checkbox"
                          className={cbType}
                          checked={done}
                          onChange={() => {}}
                          style={{ '--cb-color': doneColor, '--cb-border': done ? doneColor : borderColor }}
                          onClick={(e) => {
                            e.stopPropagation();
                            isSched ? toggleSchedule(item) : toggleTask(item);
                          }}
                        />
                        <div className="flex-1">
                          <p className={`text-[14px] font-medium ${done ? 'text-[#8e8e93] line-through' : 'text-[#1c1c1e]'}`}>
                            {item.emoji ? item.emoji + ' ' : ''}{item.title}
                          </p>
                          {timeLabel && (
                            <p className={`text-[12px] mt-0.5 ${done ? 'text-[#aeaeae]' : 'text-[#8e8e93]'}`}>{timeLabel}</p>
                          )}
                        </div>
                        <span
                          className={`w-2 h-2 flex-shrink-0 self-center ${squareCb ? 'rounded-[2px]' : 'rounded-full'}`}
                          style={{background: color}}
                        ></span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="glass-card p-5 h-full">
      <div className="flex items-center justify-between section-header">
        <div className="flex items-center gap-2">
          <span className="section-accent" style={{background:'#007aff'}}></span>
          <h3 className="section-title">{titleText}</h3>
        </div>
      </div>

      <div className="overflow-visible">
        {loading ? (
          <div className="space-y-4 pt-3 px-1">
            <div className="flex items-start gap-3">
              <div className="sk-line w-12 mt-0.5" style={{height:'12px'}}></div>
              <div className="sk-line flex-1" style={{height:'18px'}}></div>
            </div>
            <div className="flex items-start gap-3">
              <div className="sk-line w-12 mt-0.5" style={{height:'12px'}}></div>
              <div className="sk-line flex-1" style={{width:'75%',height:'18px'}}></div>
            </div>
            <div className="flex items-start gap-3">
              <div className="sk-line w-12 mt-0.5" style={{height:'12px'}}></div>
              <div className="sk-line flex-1" style={{width:'85%',height:'18px'}}></div>
            </div>
            <div className="flex items-start gap-3">
              <div className="sk-line w-12 mt-0.5" style={{height:'12px'}}></div>
              <div className="sk-line flex-1" style={{width:'68%',height:'18px'}}></div>
            </div>
            <div className="flex items-start gap-3">
              <div className="sk-line w-12 mt-0.5" style={{height:'12px'}}></div>
              <div className="sk-line flex-1" style={{width:'78%',height:'18px'}}></div>
            </div>
            <div className="flex items-start gap-3">
              <div className="sk-line w-12 mt-0.5" style={{height:'12px'}}></div>
              <div className="sk-line flex-1" style={{width:'60%',height:'18px'}}></div>
            </div>
          </div>
        ) : (
          view === 'today' ? renderTodayView() : renderRangeView()
        )}
      </div>
    </div>
  );
}
