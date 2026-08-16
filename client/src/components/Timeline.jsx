import { useEffect, useRef, useState } from 'react';
import { API } from '../api/client.js';
import { formatDuration, today as getToday, fromISODate, calcDurationMin, cachedLoad, cachePeek, cacheClear, loadingGate } from '../utils/date.js';
import { store } from '../utils/store.js';
import { useToast } from '../context/ToastContext.jsx';

const weekLabels = ['日', '一', '二', '三', '四', '五', '六'];

// 成长类型配置
const GROWTH_TYPES = {
  energy: { color: '#34c759', bg: '#e5f6ea', borderColor: '#34c759', doneColor: '#34c759', lineColor: '#34c759' },
  mind:   { color: '#007aff', bg: '#e0ecff', borderColor: '#007aff', doneColor: '#007aff', lineColor: '#007aff' },
  skill:  { color: '#d4a017', bg: '#fbf3d8', borderColor: '#d4a017', doneColor: '#d4a017', lineColor: '#d4a017' },
};

// 事项分类颜色
const CAT_COLORS = {
  1: { color: '#ff3b30', bg: '#ffe8e8', borderColor: '#ff3b30', doneColor: '#ff3b30', lineColor: '#ff3b30', timeColor: '#ff3b30' },
  2: { color: '#ff9500', bg: '#fff4d8', borderColor: '#ff9500', doneColor: '#ff9500', lineColor: '#ff9500', timeColor: '#ff9500' },
  3: { color: '#8e8e93', bg: '#e5e5ea', borderColor: '#8e8e93', doneColor: '#8e8e93', lineColor: '#8e8e93', timeColor: '#8e8e93' },
  4: { color: '#34c759', bg: '#e5f6ea', borderColor: '#34c759', doneColor: '#34c759', lineColor: '#34c759', timeColor: '#34c759' },
  5: { color: '#af52de', bg: '#f3e8ff', borderColor: '#af52de', doneColor: '#af52de', lineColor: '#af52de', timeColor: '#af52de' },
};

// 根据习惯名称/图标自动推断成长类型
function inferGrowthType(habit) {
  const text = (habit.name + ' ' + (habit.emoji || '')).toLowerCase();
  if (/睡眠|运动|喝水|饮食|健身|跑步|游泳|瑜伽|冥想|休息|😴|🏃|💧|🍎/.test(text)) return 'energy';
  if (/看书|阅读|思考|学习|📖|🧠|📚/.test(text)) return 'mind';
  if (/英语|口语|表达|演讲|沟通|写作|🗣️|🎤|✍️/.test(text)) return 'skill';
  // 依据 accent_color 反推类型（应对历史数据或用户改色场景）
  const c = (habit.accent_color || '').toLowerCase().replace('#', '');
  if (c.length === 6) {
    const r = parseInt(c.slice(0, 2), 16);
    const g = parseInt(c.slice(2, 4), 16);
    const b = parseInt(c.slice(4, 6), 16);
    if (r > 180 && g > 140 && b < 120 && r > b && g > b) return 'skill';
    if (b > r && b > g && b > 150) return 'mind';
    if (g > r && g > b && g > 120) return 'energy';
  }
  // 用户显式设置的类型优先（但默认值 energy 不算显式）
  if (habit.growth_type && habit.growth_type !== 'energy') return habit.growth_type;
  return 'energy';
}

// 将 hex 颜色与白色混合，生成浅色背景
function lighten(hex, whiteRatio = 0.82) {
  const h = (hex || '#34c759').replace('#', '');
  if (h.length !== 6) return '#e5e5ea';
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

export default function Timeline({ date, view, range, refreshSignal, onEdit, onChange, onAdd }) {
  const toast = useToast();
  const [schedules, setSchedules] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [habits, setHabits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasData, setHasData] = useState(false);
  const inFlightRef = useRef(null);
  const cacheRef = useRef(new Map());

  function load() {
    const cacheKey = `tl:${range.from}:${range.to}:${date}`;
    const CACHE_TTL = 120000;
    const peeked = cachePeek(cacheKey, cacheRef, CACHE_TTL);
    if (peeked) {
      const r = peeked.value;
      setSchedules(r.sched);
      setTasks(r.tasks);
      setHabits(r.habits);
      setHasData(true);
      return;
    }
    const gate = loadingGate(setLoading, hasData ? 120 : 0);
    gate.require();

    cachedLoad(cacheKey, async () => {
      const [s, t, h] = await Promise.all([
        API.schedules.list({ from: range.from, to: range.to }),
        API.tasks.list({ from: range.from, to: range.to }),
        API.habits.list({ date })
      ]);
      return { sched: s.schedules, tasks: t.tasks, habits: h.habits };
    }, inFlightRef, cacheRef, CACHE_TTL).then(r => {
      setSchedules(r.sched);
      setTasks(r.tasks);
      setHabits(r.habits);
      setHasData(true);
      gate.done();
    }).catch(e => { console.error(e); gate.done(); });
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
      cacheClear(cacheRef, 'tl:');
      load();
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
    if (cat === 1 || cat === 2 || cat === 3 || cat === 4 || cat === 5) return cat;
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
    // 使用主题中预定义的 bg 色，确保与 KeyTasks 等其他面板渐变一致
    const theme = getItemTheme(item);
    return `linear-gradient(90deg,${theme.bg} 0%,transparent 70%)`;
  }

  function getTimeColor(item) {
    // 完成后时间色跟随复选框饱和度（统一用 theme.color / theme.doneColor = 同色饱和值）
    if (item.isHabit) {
      const theme = getItemTheme(item);
      return theme.color;
    }
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
    function isZero(t) {
      if (!t) return false;
      const c = String(t).trim();
      if (c === '00:00' || c === '0:00' || c === '0') return true;
      const [h, m] = c.split(':').map(Number);
      return Number(h) === 0 && Number(m) === 0;
    }
    if (item.isHabit) {
      // 优先使用 start_time / end_time（新字段），回退到 target_time
      let st = item.start_time || item.target_time;
      let et = item.end_time;
      // 兼容区间写法 'HH:MM-HH:MM'
      if (st && st.includes('-')) {
        const [s, e] = st.split('-');
        if (!et) et = e;
        st = s;
      }
      const stZero = isZero(st);
      const etZero = !et || isZero(et);
      if (stZero && etZero) { st = null; et = null; }
      else if (stZero) { st = null; }
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
      if (st && et && !isZero(et)) txt = `${st} – ${et}`;
      else if (st) txt = st;

      if (displayDur) {
        const hours = displayDur / 60;
        if (hours === 1) txt += (txt ? ' · ' : '') + '1h';
        else if (Number.isInteger(hours)) txt += (txt ? ' · ' : '') + `${hours}h`;
        else txt += (txt ? ' · ' : '') + formatDuration(displayDur);
      }
      return txt;
    }
    if (!item.start_time) return '';
    let st = item.start_time;
    let et = item.end_time;
    // 兼容区间写法
    if (st && st.includes('-')) {
      const [s, e] = st.split('-');
      if (!et) et = e;
      st = s;
    }
    if (isZero(st) && (!et || isZero(et))) return '';
    let txt = st;
    if (et && !isZero(et)) txt += ' – ' + et;
    const displayDur = getEffectiveDur(item);
    if (displayDur) {
      const hours = displayDur / 60;
      if (hours === 1) txt += ' · 1h';
      else if (Number.isInteger(hours)) txt += ` · ${hours}h`;
      else txt += ` · ${formatDuration(displayDur)}`;
    }
    return txt;
  }

  function formatShort(item) {
    function isZero(t) {
      if (!t) return false;
      const c = String(t).trim();
      if (c === '00:00' || c === '0:00' || c === '0') return true;
      const [h, m] = c.split(':').map(Number);
      return Number(h) === 0 && Number(m) === 0;
    }
    if (item.isHabit) {
      let st = item.start_time || item.target_time;
      let et = item.end_time;
      if (st && st.includes('-')) {
        const [s, e] = st.split('-');
        if (!et) et = e;
        st = s;
      }
      const stZero = isZero(st);
      const etZero = !et || isZero(et);
      if (stZero && etZero) { st = null; et = null; }
      const displayDur = getEffectiveDur(item);
      if (st && et && !etZero) {
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
    if (hours === 1) return '1h';
    if (Number.isInteger(hours)) return `${hours}h`;
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

  // === Today 视图：绝对定位时间轴（1min=1px 精确映射） ===
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

    // 基准参数：06:00 – 24:00（18小时），每小时 60px → 高 1080px
    const HOUR_START = 6;
    const HOUR_END = 23;      // 显示 6:00 到 23:00 的整点标签
    const HOUR_HEIGHT = 60;
    const PX_PER_MIN = 1;
    const TOTAL_HEIGHT = (24 - HOUR_START) * HOUR_HEIGHT; // 1080
    const baseMin = HOUR_START * 60; // 360

    function parseStart(item) {
      if (!item.start_time) return null;
      const [h, m] = item.start_time.split(':').map(Number);
      if (Number.isNaN(h) || Number.isNaN(m)) return null;
      return h * 60 + m;
    }
    function toPx(min) { return (min - baseMin) * PX_PER_MIN; }

    // —— 事件准备：有 start_time 且能算入 06-24 区间的才挂时间轴 ——
    function isZeroTime(t) {
      // 00:00 / 0:00 / 带空格等变体均视为"未设置时间"
      if (!t) return false;
      const clean = t.trim();
      if (clean === '00:00' || clean === '0:00' || clean === '0') return true;
      const [h, m] = clean.split(':').map(Number);
      return (Number(h) === 0 && Number(m) === 0);
    }
    function parseTimeRange(item) {
      // 兼容两种格式：'06:00' (单点) 或 '06:00-07:00' (区间，旧 schedules.start_time 写法)
      function pickFirst(t) {
        if (!t) return null;
        if (t.includes('-')) return t.split('-')[0];
        return t;
      }
      function pickEnd(t) {
        if (!t) return null;
        if (t.includes('-')) { const [, e] = t.split('-'); return e; }
        return null;
      }
      function toMin(t) {
        if (!t) return null;
        const [h, m] = t.split(':').map(Number);
        if (Number.isNaN(h) || Number.isNaN(m)) return null;
        return h * 60 + m;
      }
      let st = item.start_time;
      let et = item.end_time;
      // 习惯：优先 start_time，兜底 target_time
      if (item.isHabit && !st) st = item.target_time;
      // 从 start_time 中拆出 end（若是区间写法），仅在 end 缺失时填入
      const startOnly = pickFirst(st);
      const endFromStart = pickEnd(st);
      if (startOnly) st = startOnly;
      if (!et && endFromStart) et = endFromStart;
      // 无意义 00:00-00:00 区间 → 视为未设时间
      const sZero = isZeroTime(st);
      const eZero = !et || isZeroTime(et);
      if (sZero && eZero) {
        return { startMin: null, endMin: null, zeroRange: true };
      }
      return { startMin: toMin(st), endMin: et ? toMin(et) : null, zeroRange: false };
    }

    const timedItems = [...todaySchedules, ...todayHabits].filter(item => {
      const { startMin, zeroRange } = parseTimeRange(item);
      if (zeroRange || startMin == null) return false;
      const dur = getEffectiveDur(item);
      // 无时长的兜底：默认 30 分钟（避免消失），并 clamp 在可视区内
      if (dur == null) return startMin >= baseMin && startMin < 24 * 60;
      const e = startMin + dur;
      return !(e <= baseMin || startMin >= 24 * 60);
    });

    // 解析每个事件的渲染几何，并按 end 截断到 24:00
    const events = timedItems.map(item => {
      const { startMin: sMin, endMin: eMin } = parseTimeRange(item);
      const startMinRaw = sMin;
      // === 计算真实时长（优先 duration_min，支持跨天） ===
      let durRaw;
      if (eMin != null && eMin > startMinRaw) {
        // 同日：直接 e - s
        durRaw = eMin - startMinRaw;
      } else if (eMin != null && eMin < startMinRaw) {
        // 跨天：1440 - (s - e) = 补到次日同一时刻
        durRaw = (24 * 60) - (startMinRaw - eMin);
      } else {
        durRaw = getEffectiveDur(item) ?? 30;
      }
      const endMinRaw = startMinRaw + durRaw; // 可能 >1440（跨天）

      // === 渲染裁剪：只画 06:00 - 24:00 可见区 ===
      const startMin = Math.max(baseMin, startMinRaw);
      const endMin = Math.min(24 * 60, endMinRaw);
      const top = toPx(startMin);
      const hPx = Math.max(22, (endMin - startMin) * PX_PER_MIN);
      const done = item.isHabit ? !!item.done_today : !!item.is_done;
      const theme = getItemTheme(item);
      const isSquareCheckbox = useSquareCheckbox(item);
      const cat = getCat(item);

      // 习惯（cat=4）按成长类型：精力=绿(4)、知力=蓝(6)、能力=金(7)
      let clsCat = cat;
      if (item.isHabit) {
        const gt = inferGrowthType(item);
        if (gt === 'mind') clsCat = 6;
        else if (gt === 'skill') clsCat = 7;
        else clsCat = 4;
      }

      // 时间区间副文本：显示真实起止（跨天用 24:00 之前/次日 之后标记）
      const fmtH = (v) => {
        const wrapped = ((v % (24 * 60)) + 24 * 60) % (24 * 60);
        return String(Math.floor(wrapped / 60)).padStart(2, '0') + ':' + String(wrapped % 60).padStart(2, '0');
      };
      const isOvernight = endMinRaw > 24 * 60;
      const displayStart = startMinRaw;
      const displayEnd = isOvernight ? endMinRaw : endMinRaw;
      const durMin = durRaw;
      let durTxt;
      if (durMin === 60) durTxt = '1h';
      else if (Number.isInteger(durMin / 60)) durTxt = `${durMin / 60}h`;
      else durTxt = `${durMin}m`;
      const endLabel = isOvernight ? fmtH(endMinRaw) : fmtH(endMinRaw);
      const subText = `${fmtH(displayStart)} – ${endLabel} · ${durTxt}`;

      return {
        item,
        startMin, endMin, top, hPx, done,
        theme, isSquareCheckbox, clsCat, subText,
        id: (item.isHabit ? 'h' : 's') + '-' + item.id
      };
    });

    // —— 重叠检测（简单版：相同时间范围的事件 right 偏移） ——
    events.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
    const placed = [];
    events.forEach(ev => {
      const overlaps = placed.filter(p => ev.startMin < p.endMin && ev.endMin > p.startMin);
      ev.overlapIndex = overlaps.length;
      ev.rightOffsetPx = overlaps.length > 0 ? overlaps.length * 14 : 0;
      placed.push(ev);
    });

    // —— 底部"列表型"内容：待办 / 未定时 / 全天习惯 ——
    const timedScheduleIds = new Set(
      todaySchedules.filter(s => {
        const { zeroRange, startMin } = parseTimeRange({ ...s, isHabit: false });
        return !zeroRange && startMin != null;
      }).map(s => s.id)
    );
    const untimedSchedules = todaySchedules.filter(s => !timedScheduleIds.has(s.id));
    // 全天习惯：无 start/target，或 00:00-00:00 这类"未设时间"的习惯
    const alldayHabits = todayHabits.filter(h => {
      if (!h.start_time && !h.target_time) return true;
      const { zeroRange } = parseTimeRange(h);
      return zeroRange;
    });

    return (
      <>
        {/* ============ 绝对定位时间轴：刻度列 + 网格 + 事件 ============ */}
        <div className="tl-grid-wrap" style={{ minHeight: `${TOTAL_HEIGHT}px` }}>
          {/* —— 刻度列：06:00 到 23:00，最后一格底部显示 24:00 —— */}
          <div className="tl-time-col" style={{ height: TOTAL_HEIGHT }}>
            {Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => HOUR_START + i).map((h) => (
              <div key={h} className="tl-time-cell">
                <span className="tl-time-cell-label">{String(h).padStart(2, '0')}:00</span>
              </div>
            ))}
            {/* 底部追加一个 24:00 标签，贴到最后一格底 */}
            <div className="tl-time-cell tl-time-cell--end" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 0 }}>
              <span className="tl-time-cell-label">24:00</span>
            </div>
          </div>

          {/* —— 网格 + 事件列 —— */}
          <div className="tl-content-col" style={{ minHeight: TOTAL_HEIGHT }}>
            {/* 背景层：18 条 60px 小时分隔线 + 半小时虚线（第18条没有半小时线） */}
            <div className="tl-content-col-grid" style={{ minHeight: TOTAL_HEIGHT }}>
              {Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => (
                <div
                  key={`grid-${i}`}
                  className={`tl-grid-line ${i === HOUR_END - HOUR_START ? 'is-last' : ''}`}
                />
              ))}
            </div>

            {/* 点击空白新增层：18 个小时可点击区域（位于事件之下） */}
            {Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => {
              const h = HOUR_START + i;
              const timeStr = `${String(h).padStart(2, '0')}:00`;
              return (
                <div
                  key={`empty-${h}`}
                  className="tl-grid-empty-cell"
                  style={{ top: `${i * HOUR_HEIGHT}px` }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onAdd?.({ start_time: timeStr });
                  }}
                  title={`点击在 ${timeStr} 新增事项`}
                >
                  <span className="tl-grid-empty-cell-hint">
                    <span>+</span>
                    <span>新增事项</span>
                  </span>
                </div>
              );
            })}

            {/* 事件色块（绝对定位） */}
            {events.map(ev => {
              const { item, done, theme, isSquareCheckbox, clsCat, subText, top, hPx, rightOffsetPx } = ev;
              const cbClass = isSquareCheckbox ? 'cb-square' : 'cb-round';
              const cbStyle = { '--cb-color': theme.doneColor, '--cb-border': done ? theme.doneColor : theme.borderColor };
              const dotClass = isSquareCheckbox ? 'r2' : 'rfull';
              const dotColor = theme.color || theme.doneColor;
              const lineColor = theme.lineColor || theme.color;
              const isCat4 = !item.isHabit && getCat(item) === 4;
              const handleEdit = (e) => {
                e.stopPropagation();
                if (item.isHabit || isCat4) return;
                onEdit?.(item);
              };
              // 双保险：除了 cat-N 的 CSS class，再直接写 inline backgroundImage
              // 这样即使 CSS 类因缓存/优先级/加载问题不生效，渐变也能正确显示
              const inlineBg = `linear-gradient(90deg,${theme.bg || '#e5e5ea'} 0%,transparent 70%)`;

              return (
                <div
                  key={ev.id}
                  className={`tl-event cat-${clsCat} ${done ? 'done' : ''} ${hPx < 48 ? 'compact' : ''}`}
                  style={{
                    top: `${top}px`,
                    height: `${hPx}px`,
                    left: 0,
                    right: `${rightOffsetPx}px`,
                    backgroundImage: inlineBg,
                  }}
                  onClick={handleEdit}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (item.isHabit || isCat4) window.__showContextMenu?.(e.clientX, e.clientY, 'habit', item.id);
                    else window.__showContextMenu?.(e.clientX, e.clientY, 'schedule', item.id);
                  }}
                >
                  <div className="tl-event-line" style={{ background: lineColor }} />
                  <div className="tl-event-content">
                    <input
                      type="checkbox"
                      className={cbClass}
                      checked={done}
                      onChange={() => {}}
                      style={cbStyle}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (item.isHabit) toggleHabit(item);
                        else toggleSchedule(item);
                      }}
                    />
                    <div className="tl-event-text" onClick={handleEdit}>
                      <div className={`tl-event-title ${done ? 'done' : ''}`}>
                        {item.emoji ? item.emoji + ' ' : ''}{item.title}
                      </div>
                      <div className="tl-event-sub">{subText}</div>
                    </div>
                    <span
                      className={`tl-event-dot ${dotClass}`}
                      style={{ background: dotColor }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ============ 下方列表：待办 / 未定时事项 / 全天习惯 ============ */}
        {todayTasks.length > 0 && (
          <>
            <div className="hairline my-3"></div>
            <div className="tl-list-section-label px-3 mb-2">待办</div>
            <div className="space-y-1.5 px-3">
              {todayTasks.map(t => {
                const done = !!t.is_done;
                const doneColor = t.priority === 1 ? '#ff3b30' : '#8e8e93';
                const borderColor = t.priority === 1 ? '#ff3b30' : '#8e8e93';
                const dotColor = t.priority === 1 ? '#ff3b30' : '#8e8e93';
                const rowBg = t.priority === 1
                  ? 'linear-gradient(90deg,#ffe8e8 0%,transparent 70%)'
                  : 'linear-gradient(90deg,#e5e5ea 0%,transparent 70%)';
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
                    <span className={`text-[14px] flex-1 ${done ? 'text-[#8e8e93] line-through' : 'text-[#1c1c1e]'}`}>
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

        {untimedSchedules.length > 0 && (
          <>
            <div className="hairline my-3"></div>
            <div className="tl-list-section-label px-3 mb-2">未定时事项</div>
            <div className="space-y-1.5 px-3">
              {untimedSchedules.map(s => {
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
                    <span className={`text-[14px] flex-1 ${done ? 'text-[#8e8e93] line-through' : 'text-[#1c1c1e]'}`}>
                      {s.title}
                    </span>
                    <span className={`w-2 h-2 flex-shrink-0 ${square ? 'rounded-[2px]' : 'rounded-full'}`} style={{background: color}}></span>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {alldayHabits.length > 0 && (
          <>
            <div className="hairline my-3"></div>
            <div className="tl-list-section-label px-3 mb-2">全天习惯</div>
            <div className="space-y-1.5 px-3">
              {alldayHabits.map(h => {
                const done = !!h.done_today;
                const color = getColor(h);
                const doneColor = getDoneColor(h);
                const borderColor = getBorderColor(h);
                const rowBg = getRowBg(h);
                return (
                  <div key={`habit-allday-${h.id}`} className="flex items-center gap-3 py-2.5 px-3 rounded-xl habit-row" style={{background: rowBg}}>
                    <input
                      type="checkbox"
                      className="cb-round"
                      checked={done}
                      onChange={() => {}}
                      style={{ '--cb-color': doneColor, '--cb-border': done ? doneColor : borderColor }}
                      onClick={(e) => { e.stopPropagation(); toggleHabit(h); }}
                    />
                    <span className={`text-[14px] flex-1 ${done ? 'text-[#8e8e93] line-through' : 'text-[#1c1c1e]'}`}>
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
                    ? 'linear-gradient(90deg,#e5e5ea 0%,transparent 70%)'
                    : color === '#ff3b30'
                    ? 'linear-gradient(90deg,#ffe8e8 0%,transparent 70%)'
                    : 'linear-gradient(90deg,#e5e5ea 0%,transparent 70%)');
                  const squareCb = isSched ? useSquareCheckbox(item) : true;
                  const cbType = squareCb ? 'cb-square' : 'cb-round';
                  const timeLabel = isSched ? formatTimeLabel(item) : (item.due_time || '');
                  const lineHeight = isSched ? getLineHeight(item) : 16;
                  const rowMinHeight = isSched ? getRowMinHeight(item) : undefined;
                  const done = !!item.is_done;
                  const doneColor = isSched ? getDoneColor(item) : (item.priority === 1 ? '#ff3b30' : '#8e8e93');
                  const borderColor = isSched ? getBorderColor(item) : (item.priority === 1 ? '#ff3b30' : '#8e8e93');
                  const timeColor = isSched ? getTimeColor(item) : (item.priority === 1 ? '#ff3b30' : '#8e8e93');

                  return (
                    <div
                      key={item.id}
                      className="timeline-row rounded-xl"
                      style={{background: rowBg, ...(rowMinHeight ? {minHeight: `${rowMinHeight}px`} : {})}}
                      onClick={() => isSched && onEdit?.(item)}
                    >
                      <div className="time-label">
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
                          <p className={`text-[14px] ${done ? 'text-[#8e8e93] line-through' : 'text-[#1c1c1e]'}`}>
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
        {loading && !hasData ? (
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
