import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { API } from '../api/client.js';
import { formatDuration, today as getToday, fromISODate, calcDurationMin, cachedLoad, cachePeek, cacheClear, loadingGate } from '../utils/date.js';
import { store } from '../utils/store.js';
import { useToast } from '../context/ToastContext.jsx';

const weekLabels = ['日', '一', '二', '三', '四', '五', '六'];

// 成长类型配置
const GROWTH_TYPES = {
  energy: { color: '#34C759', bg: '#e5f6ea', borderColor: '#34C759', doneColor: '#34C759', lineColor: '#34C759' },
  mind:   { color: '#007AFF', bg: '#e0ecff', borderColor: '#007AFF', doneColor: '#007AFF', lineColor: '#007AFF' },
  skill:  { color: '#FF9500', bg: '#FFF4D8', borderColor: '#FF9500', doneColor: '#FF9500', lineColor: '#FF9500' },
};

// 事项分类颜色（1=工作,2=能力,3=常规,4=习惯,5=生活,6=精力,7=知力）
const CAT_COLORS = {
  1: { color: '#FF3B30', bg: '#FFEEED', borderColor: '#FF3B30', doneColor: '#FF3B30', lineColor: '#FF3B30', timeColor: '#FF3B30' },
  2: { color: '#FF9500', bg: '#fff4d8', borderColor: '#FF9500', doneColor: '#FF9500', lineColor: '#FF9500', timeColor: '#FF9500' },
  3: { color: '#8e8e93', bg: '#e5e5ea', borderColor: '#8e8e93', doneColor: '#8e8e93', lineColor: '#8e8e93', timeColor: '#8e8e93' },
  4: { color: '#34C759', bg: '#e5f6ea', borderColor: '#34C759', doneColor: '#34C759', lineColor: '#34C759', timeColor: '#34C759' },
  5: { color: '#AF52DE', bg: '#f3e8ff', borderColor: '#AF52DE', doneColor: '#AF52DE', lineColor: '#AF52DE', timeColor: '#AF52DE' },
  6: { color: '#34C759', bg: '#e5f6ea', borderColor: '#34C759', doneColor: '#34C759', lineColor: '#34C759', timeColor: '#34C759' },
  7: { color: '#007AFF', bg: '#e0ecff', borderColor: '#007AFF', doneColor: '#007AFF', lineColor: '#007AFF', timeColor: '#007AFF' },
};

// 获取习惯的成长类型（优先级：用户显式选择 > 颜色分析 > 关键词推断 > 默认）
function inferGrowthType(habit) {
  // 1. 用户在表单中显式选择的 growth_type（非默认 energy 即为显式设置）
  if (habit.growth_type && habit.growth_type !== 'energy') return habit.growth_type;

  // 2. 用户显式选择的 accent_color（非默认绿色 #34C759 即为显式设置）
  const c = (habit.accent_color || '').toLowerCase().replace('#', '');
  if (c.length === 6 && c !== '34c759') {
    const r = parseInt(c.slice(0, 2), 16);
    const g = parseInt(c.slice(2, 4), 16);
    const b = parseInt(c.slice(4, 6), 16);
    if (r > 180 && g > 140 && b < 120 && r > b && g > b) return 'skill';
    if (b > r && b > g && b > 150) return 'mind';
    if (g > r && g > b && g > 120) return 'energy';
  }

  // 3. 关键词推断（仅对无显式类型/颜色的老数据兜底）
  const text = (habit.name + ' ' + (habit.emoji || '')).toLowerCase();
  if (/睡眠|运动|喝水|饮食|健身|跑步|游泳|瑜伽|冥想|休息|😴|🏃|💧|🍎/.test(text)) return 'energy';
  if (/看书|阅读|思考|学习|📖|🧠|📚/.test(text)) return 'mind';
  if (/英语|口语|表达|演讲|沟通|写作|🗣️|🎤|✍️/.test(text)) return 'skill';

  // 4. 默认
  return 'energy';
}

// 将 hex 颜色与白色混合，生成浅色背景
function lighten(hex, whiteRatio = 0.82) {
  const h = (hex || '#34C759').replace('#', '');
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

export default function Timeline({ date, view, range, refreshSignal, onEdit, onChange, onAdd, onManageFixedSchedules, onSummaryToggle, showSummary }) {
  const toast = useToast();
  const [schedules, setSchedules] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [habits, setHabits] = useState([]);
  const [fixedSchedules, setFixedSchedules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasData, setHasData] = useState(false);
  const [dragOverY, setDragOverY] = useState(null);
  const [resizingEvent, setResizingEvent] = useState(null);
  const inFlightRef = useRef(null);
  const cacheRef = useRef(new Map());
  const contentColRef = useRef(null);
  // 拉伸进行中标记：避免手柄 mousedown 误触发方块整体 drag
  const isResizingRef = useRef(false);

  // ==== 总结下拉菜单（位于"全部事项"标题旁） ====
  const [sumMenuOpen, setSumMenuOpen] = useState(false);
  const [sumMenuPos, setSumMenuPos] = useState({ top: 0, left: 0 });
  const sumAnchorRef = useRef(null);
  const sumPortalRef = useRef(null);
  const [docLinks, setDocLinks] = useState([]);
  const [editingDoc, setEditingDoc] = useState(null); // null=未编辑, {id:'new',...}=新增, {id,...}=编辑

  // 在线文档链接管理（localStorage）
  useEffect(() => {
    try {
      const raw = localStorage.getItem('summary_doc_urls');
      if (raw) setDocLinks(JSON.parse(raw));
    } catch (_) {}
  }, []);

  const saveDocLinks = (links) => {
    setDocLinks(links);
    try { localStorage.setItem('summary_doc_urls', JSON.stringify(links)); } catch (_) {}
  };

  // 总结下拉：定位（随滚动/resize 实时更新）
  const recalcSumPos = useCallback(() => {
    if (!sumAnchorRef.current) return;
    const r = sumAnchorRef.current.getBoundingClientRect();
    setSumMenuPos({ top: r.bottom + 6, left: r.left });
  }, []);

  useEffect(() => {
    if (!sumMenuOpen) return;
    recalcSumPos();
    const opts = { capture: true, passive: true };
    window.addEventListener('scroll', recalcSumPos, opts);
    window.addEventListener('resize', recalcSumPos);
    return () => {
      window.removeEventListener('scroll', recalcSumPos, opts);
      window.removeEventListener('resize', recalcSumPos);
    };
  }, [sumMenuOpen, recalcSumPos]);

  // 总结下拉：点击外部关闭
  useEffect(() => {
    if (!sumMenuOpen) return;
    function onDocMouseDown(e) {
      const anchor = sumAnchorRef.current;
      const pop = sumPortalRef.current;
      if (anchor && anchor.contains(e.target)) return;
      if (pop && pop.contains(e.target)) return;
      setSumMenuOpen(false);
      setEditingDoc(null);
    }
    function onDocKey(e) { if (e.key === 'Escape') { setSumMenuOpen(false); setEditingDoc(null); } }
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onDocKey);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onDocKey);
    };
  }, [sumMenuOpen]);

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

  // 固定日程：独立加载（与日期无关，每天重复）
  function loadFixed() {
    API.fixedSchedules.list().then(r => {
      setFixedSchedules(r.fixedSchedules || []);
    }).catch(e => {
      // 表可能未创建（migration 未应用），静默处理
      if (!String(e?.message || '').includes('does not exist') &&
          !String(e?.message || '').includes('relation')) {
        console.warn('fixed schedules load failed:', e?.message);
      }
      setFixedSchedules([]);
    });
  }

  useEffect(() => { load(); }, [range.from, range.to, date, refreshSignal]);
  useEffect(() => { loadFixed(); }, [refreshSignal]);

  // 订阅 patch：其他面板 toggle 时即时同步，无需重新 load
  useEffect(() => store.subscribe(patch => {
    if (patch.type === 'schedule' && patch.id !== undefined) {
      // patch.date 存在时仅更新该日期的实例（重复事项的虚拟实例按 id+date 定位）
      setSchedules(ss => ss.map(x => (x.id === patch.id && (!patch.date || x.date === patch.date)) ? { ...x, is_done: patch.is_done } : x));
    } else if (patch.type === 'habit' && patch.id !== undefined) {
      setHabits(hs => hs.map(x => x.id === patch.id ? { ...x, done_today: patch.done_today } : x));
    } else if (patch.type === 'task' && patch.id !== undefined) {
      setTasks(ts => ts.map(x => x.id === patch.id ? { ...x, is_done: patch.is_done } : x));
    } else if (patch.type === 'reload') {
      cacheClear(cacheRef, 'tl:');
      load();
      loadFixed();
      onChange?.();
    }
  }), []);

  async function toggleSchedule(s) {
    const nextDone = s.is_done ? 0 : 1;
    setSchedules(ss => ss.map(x => (x.id === s.id && x.date === s.date) ? { ...x, is_done: nextDone } : x));
    store.broadcast({ type: 'schedule', id: s.id, date: s.date, is_done: nextDone });
    try {
      // 重复事项的虚拟实例：传 occurrence_date，后端把完成状态记到该日期（不影响整个序列）
      await API.schedules.update(s.id, { is_done: nextDone, ...(s._repeat_occurrence ? { occurrence_date: s.date } : {}) });
    } catch (e) {
      setSchedules(ss => ss.map(x => (x.id === s.id && x.date === s.date) ? { ...x, is_done: s.is_done } : x));
      store.broadcast({ type: 'schedule', id: s.id, date: s.date, is_done: s.is_done });
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

  // —— 时间轴几何参数（与 renderTodayView 保持一致） ——
  const TL_HOUR_START = 6;
  const TL_HOUR_HEIGHT = 60;
  const TL_BASE_MIN = TL_HOUR_START * 60;
  const TL_PX_PER_MIN = TL_HOUR_HEIGHT / 60; // = 1
  // 像素 y → 绝对分钟数（y=0 对应 06:00，y=3*60 对应 09:00）
  const pxToMin = (y) => TL_BASE_MIN + Math.round(y / TL_PX_PER_MIN);
  // 绝对分钟数 → 像素 y（反向映射）
  const minToPx = (min) => (min - TL_BASE_MIN) * TL_PX_PER_MIN;
  // 15 分钟吸附（任意 min → 吸附到最近的 15min 倍数，保留 00:00-24:00 全区间）
  const snapMin = (min) => {
    const s = Math.round(min / 15) * 15;
    return Math.max(0, Math.min(24 * 60, s));
  };
  const fmtHHMM = (totalMin) => {
    const clamped = Math.max(0, Math.min(24 * 60, Math.round(totalMin)));
    const h = Math.floor(clamped / 60);
    const m = clamped % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  // === 拖拽功能：将重点事项拖入时间线 ===
  function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    const rect = contentColRef.current?.getBoundingClientRect();
    if (rect) {
      const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
      setDragOverY(y);
    }
    e.dataTransfer.dropEffect = 'move';
  }

  function handleDragLeave(e) {
    if (!contentColRef.current?.contains(e.relatedTarget)) {
      setDragOverY(null);
    }
  }

  async function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    setDragOverY(null);

    const dataStr = e.dataTransfer.getData('application/json');
    if (!dataStr) return;

    try {
      const data = JSON.parse(dataStr);
      const rect = contentColRef.current?.getBoundingClientRect();
      if (!rect) return;

      // 精准映射：y 坐标像素 → 分钟数，拖到哪就是哪
      const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
      const rawStart = pxToMin(y);
      const startMin = snapMin(rawStart);
      const startTime = fmtHHMM(startMin);

      const durMin = Math.max(15, Number(data.duration_min) || 30);
      const endMin = Math.min(24 * 60, startMin + durMin);
      const endTime = fmtHHMM(endMin);
      const actualDur = endMin - startMin;

      if (data.scheduleId) {
        const updateResult = await API.schedules.update(data.scheduleId, {
          start_time: startTime,
          end_time: endTime,
          duration_min: actualDur,
        });
        if (updateResult?.schedule) {
          setSchedules(ss => ss.map(s => s.id === data.scheduleId
            ? { ...s, start_time: startTime, end_time: endTime, duration_min: actualDur }
            : s
          ));
          store.broadcast({ type: 'reload' });
          onChange?.();
          toast.success(`已移动到 ${startTime}`);
        }
      } else {
        const newSchedule = {
          title: data.title,
          category: data.category || 3,
          emoji: data.emoji || '',
          start_time: startTime,
          end_time: endTime,
          duration_min: actualDur,
          date: date,
          is_key: true,
        };
        const result = await API.schedules.create(newSchedule);
        if (result?.schedule) {
          setSchedules(ss => [...ss, { ...result.schedule, isHabit: false, isTask: false }]);
          store.broadcast({ type: 'reload' });
          onChange?.();
          toast.success(`已添加到 ${startTime}`);
        }
      }
    } catch (err) {
      console.error('Drop failed:', err);
      toast.error('添加失败');
    }
  }

  // === 拉伸调整时间块（上下边缘拖动） ===
  function startResize(e, eventInfo, type) {
    e.preventDefault();
    e.stopPropagation();
    isResizingRef.current = true;
    const startY = e.clientY;
    const startTopPx = eventInfo.top;     // 事件顶部像素（相对 contentCol 顶部=06:00）
    const startHeightPx = eventInfo.hPx; // 事件高度像素
    const item = eventInfo.item;

    // 初始起止分钟数（与显示几何严格对应）
    const initialStartMin = TL_BASE_MIN + Math.round(startTopPx / TL_PX_PER_MIN);
    const initialEndMin = TL_BASE_MIN + Math.round((startTopPx + startHeightPx) / TL_PX_PER_MIN);

    // 闭包内最新态：onMove 写入，onUp 读取（绕过 React state 闭包陷阱）
    let latest = null;

    function onMove(ev) {
      const deltaY = ev.clientY - startY;
      const deltaMin = Math.round(deltaY / TL_PX_PER_MIN);

      if (type === 'top') {
        // 拉伸上边缘：顶边随鼠标，底边缘像素锚定不动（endMin = initialEndMin 保持不变）
        let newStartMin = snapMin(initialStartMin + deltaMin);
        // 最小 15min 时长保护：上边缘不能超过下边缘
        newStartMin = Math.min(initialEndMin - 15, newStartMin);
        newStartMin = Math.max(0, newStartMin);
        const newStart = fmtHHMM(newStartMin);
        const newEnd = fmtHHMM(initialEndMin);

        const newTop = Math.max(0, minToPx(newStartMin));
        const newHPx = Math.max(22, minToPx(initialEndMin) - minToPx(newStartMin));

        latest = { ...eventInfo, top: newTop, hPx: newHPx, tempStart: newStart, tempEnd: newEnd };
        setResizingEvent(latest);
      } else {
        // 拉伸下边缘：顶边缘锚定不动（startMin = initialStartMin），底边随鼠标
        let newEndMin = snapMin(initialEndMin + deltaMin);
        newEndMin = Math.max(initialStartMin + 15, Math.min(24 * 60, newEndMin));
        const newEnd = fmtHHMM(newEndMin);

        const newHPx = Math.max(22, minToPx(newEndMin) - minToPx(initialStartMin));

        latest = { ...eventInfo, top: minToPx(initialStartMin), hPx: newHPx, tempStart: fmtHHMM(initialStartMin), tempEnd: newEnd };
        setResizingEvent(latest);
      }
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      isResizingRef.current = false;

      // 读闭包内最新态（而非 React state 的旧闭包值）
      if (latest && !item.isHabit && !item.isFixed) {
        const updates = {};
        if (latest.tempStart) updates.start_time = latest.tempStart;
        if (latest.tempEnd) updates.end_time = latest.tempEnd;
        updates.duration_min = Math.round(latest.hPx / TL_PX_PER_MIN);

        API.schedules.update(item.id, updates).then(() => {
          setSchedules(ss => ss.map(x => x.id === item.id ? { ...x, ...updates } : x));
          store.broadcast({ type: 'reload' });
          onChange?.();
        }).catch(err => toast.error('更新失败'));
      }
      setResizingEvent(null);
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function getCat(s) {
    if (s.isHabit) return 4;
    const cat = Number(s.category);
    if (cat === 1 || cat === 2 || cat === 3 || cat === 4 || cat === 5 || cat === 6 || cat === 7) return cat;
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
    ? <>全部事项 <span className="text-[#c7c7cc] font-medium">·</span> <span className="text-[color:var(--s-main)]">今日</span></>
    : view === 'week'
    ? <>全部事项 <span className="text-[#c7c7cc] font-medium">·</span> <span className="text-[color:var(--s-main)]">本周</span></>
    : <>全部事项 <span className="text-[#c7c7cc] font-medium">·</span> <span className="text-[color:var(--s-main)]">本月</span></>;

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
    const todaySchedules = schedules.filter(s => s.date === date).map(s => ({ ...s, isHabit: false, isTask: false, isFixed: false }));
    const todayTasks = tasks.filter(t => t.date === date).map(t => ({ ...t, isHabit: false, isTask: true, isFixed: false }));
    const todayHabits = habits.map(h => ({
      ...h,
      isHabit: true,
      isTask: false,
      isFixed: false,
      is_done: h.done_today ? 1 : 0,
      title: h.name,
      start_time: h.start_time || h.target_time,
      end_time: h.end_time,
      date: date
    }));
    // 固定日程：每天重复，仅时间线显示，不可打卡
    const todayFixed = fixedSchedules.map(s => ({
      ...s,
      isHabit: false,
      isTask: false,
      isFixed: true,
      title: s.name,
      date: date,
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

    const timedItems = [...todaySchedules, ...todayHabits, ...todayFixed].filter(item => {
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
      const theme = item.isFixed ? null : getItemTheme(item);
      const isSquareCheckbox = item.isFixed ? false : useSquareCheckbox(item);
      const cat = item.isFixed ? null : getCat(item);

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

      const prefix = item.isFixed ? 'f' : (item.isHabit ? 'h' : 's');

      return {
        item,
        startMin, endMin, top, hPx, done,
        theme, isSquareCheckbox, clsCat, subText,
        isFixed: !!item.isFixed,
        id: prefix + '-' + item.id
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
          <div
            ref={contentColRef}
            className="tl-content-col"
            style={{ minHeight: TOTAL_HEIGHT }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {/* 拖拽指示器：预览线 + 精确时间 tooltip（与 handleDrop 同映射） */}
            {dragOverY !== null && (
              <div
                className="absolute left-0 right-0 pointer-events-none"
                style={{
                  top: `${dragOverY}px`,
                  height: '2px',
                  background: 'var(--s-main)',
                  boxShadow: '0 0 8px rgba(var(--s-rgb),0.5)',
                  zIndex: 1000,
                }}
              >
                <span
                  className="absolute right-2 -translate-y-full text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap"
                  style={{ background: 'var(--s-main)', color: '#fff' }}
                >
                  {fmtHHMM(snapMin(pxToMin(dragOverY)))}
                </span>
              </div>
            )}
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
              const { item, done, theme, isSquareCheckbox, clsCat, subText, top, hPx, rightOffsetPx, isFixed } = ev;

              // === 固定日程：极简柔化样式（无标签/无边框，通过透明度建立层级） ===
              if (isFixed) {
                return (
                  <div
                    key={ev.id}
                    className={`tl-event tl-fixed-schedule ${hPx < 48 ? 'compact' : ''}`}
                    style={{
                      top: `${top}px`,
                      height: `${hPx}px`,
                      left: 0,
                      right: `${rightOffsetPx}px`,
                      backgroundImage: 'linear-gradient(90deg, rgba(142,142,147,0.08) 0%, transparent 65%)',
                      borderRadius: 'min(12px, 50%)',
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onManageFixedSchedules?.();
                    }}
                    title="固定日程 · 右键管理"
                  >
                    <div className="tl-event-line" style={{ background: 'rgba(142,142,147,0.35)' }} />
                    <div className="tl-event-content" style={{ gap: '8px' }}>
                      <div className="tl-event-text">
                        <div className="tl-event-title" style={{ color: '#8e8e93', fontWeight: '400' }}>
                          {item.emoji ? item.emoji + ' ' : ''}{item.title}
                        </div>
                        {hPx >= 48 && (
                          <div className="tl-event-sub" style={{ color: '#aeaeae' }}>{subText}</div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              }

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
              const inlineBg = `linear-gradient(90deg,${theme.bg || '#e5e5ea'} 0%,transparent 70%)`;

              // 应用实时调整状态
              const isResizing = resizingEvent && resizingEvent.id === ev.id;
              const displayTop = isResizing ? resizingEvent.top : top;
              const displayH = isResizing ? resizingEvent.hPx : hPx;
              const displaySub = isResizing && (resizingEvent.tempStart || resizingEvent.tempEnd)
                ? `${resizingEvent.tempStart || subText.split('–')[0].trim()} – ${resizingEvent.tempEnd || subText.split('–')[1].trim().split('·')[0].trim()} · ${Math.round(displayH)}m`
                : subText;

              const canDragBlock = !isFixed && !item.isHabit && !item.isTask;

              return (
                <div
                  key={ev.id}
                  className={`tl-event cat-${clsCat} ${done ? 'done' : ''} ${hPx < 48 ? 'compact' : ''}`}
                  style={{
                    top: `${displayTop}px`,
                    height: `${displayH}px`,
                    left: 0,
                    right: `${rightOffsetPx}px`,
                    backgroundImage: inlineBg,
                    cursor: canDragBlock ? 'grab' : 'default',
                  }}
                  draggable={canDragBlock}
                  onDragStart={(e) => {
                    // 拉伸手柄 mousedown 中：取消整体拖动
                    if (isResizingRef.current) { e.preventDefault(); return; }
                    const dur = getEffectiveDur(item) || 30;
                    const data = {
                      title: item.title,
                      category: item.category || getCat(item),
                      emoji: item.emoji || '',
                      duration_min: dur,
                      isPreset: false,
                      scheduleId: item.id,
                    };
                    e.dataTransfer.setData('application/json', JSON.stringify(data));
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onClick={handleEdit}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (item.isHabit || isCat4) window.__showContextMenu?.(e.clientX, e.clientY, 'habit', item.id);
                    else window.__showContextMenu?.(e.clientX, e.clientY, 'schedule', item.id);
                  }}
                >
                  {/* 上边缘拉伸手柄 */}
                  {!isFixed && !item.isHabit && (
                    <div
                      className="absolute top-0 left-0 right-0 h-[6px] cursor-ns-resize z-10"
                      style={{ background: 'transparent' }}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        isResizingRef.current = true;
                        startResize(e, ev, 'top');
                      }}
                      title="拖动调整开始时间"
                    >
                      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[3px] rounded-b-full bg-ink-200 opacity-0 hover:opacity-100 transition" style={{ top: 0 }}></div>
                    </div>
                  )}
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
                      <div className="tl-event-sub">{displaySub}</div>
                    </div>
                    <span
                      className={`tl-event-dot ${dotClass}`}
                      style={{ background: dotColor }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                  {/* 下边缘拉伸手柄 */}
                  {!isFixed && !item.isHabit && (
                    <div
                      className="absolute bottom-0 left-0 right-0 h-[6px] cursor-ns-resize z-10"
                      style={{ background: 'transparent' }}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        isResizingRef.current = true;
                        startResize(e, ev, 'bottom');
                      }}
                      title="拖动调整结束时间"
                    >
                      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-[3px] rounded-t-full bg-ink-200 opacity-0 hover:opacity-100 transition"></div>
                    </div>
                  )}
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
                const doneColor = t.priority === 1 ? '#FF3B30' : '#8e8e93';
                const borderColor = t.priority === 1 ? '#FF3B30' : '#8e8e93';
                const dotColor = t.priority === 1 ? '#FF3B30' : '#8e8e93';
                const rowBg = t.priority === 1
                  ? 'linear-gradient(90deg,#FFEEED 0%,transparent 70%)'
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
            <svg className="w-6 h-6 mx-auto mb-2 text-[#c7c7cc]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="9"></circle>
              <polyline points="12 7 12 12 15.5 14"></polyline>
            </svg>
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
          <svg className="w-6 h-6 mx-auto mb-2 text-[#c7c7cc]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="9"></circle>
            <polyline points="12 7 12 12 15.5 14"></polyline>
          </svg>
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
                  const color = isSched ? getColor(item) : (item.priority === 1 ? '#FF3B30' : '#8e8e93');
                  const lineColor = isSched ? getLineColor(item) : (item.priority === 1 ? '#FF8E85' : '#c7c7cc');
                  const rowBg = isSched ? getRowBg(item) : (item.is_done
                    ? 'linear-gradient(90deg,#e5e5ea 0%,transparent 70%)'
                    : color === '#FF3B30'
                    ? 'linear-gradient(90deg,#FFEEED 0%,transparent 70%)'
                    : 'linear-gradient(90deg,#e5e5ea 0%,transparent 70%)');
                  const squareCb = isSched ? useSquareCheckbox(item) : true;
                  const cbType = squareCb ? 'cb-square' : 'cb-round';
                  const timeLabel = isSched ? formatTimeLabel(item) : (item.due_time || '');
                  const lineHeight = isSched ? getLineHeight(item) : 16;
                  const rowMinHeight = isSched ? getRowMinHeight(item) : undefined;
                  const done = !!item.is_done;
                  const doneColor = isSched ? getDoneColor(item) : (item.priority === 1 ? '#FF3B30' : '#8e8e93');
                  const borderColor = isSched ? getBorderColor(item) : (item.priority === 1 ? '#FF3B30' : '#8e8e93');
                  const timeColor = isSched ? getTimeColor(item) : (item.priority === 1 ? '#FF3B30' : '#8e8e93');

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
    <>
    <div className="glass-card p-5 h-full">
      <div className="flex items-center justify-between section-header">
        <div className="flex items-center gap-2">
          <span className="section-accent" style={{background:'var(--s-main)'}}></span>
          <h3 className="section-title">{titleText}</h3>

          {/* 总结按钮 — 紧跟标题后面 */}
          <div ref={sumAnchorRef} className="ml-1.5">
            <button
              className="btn-secondary flex items-center gap-1"
              onClick={() => { setSumMenuOpen(v => !v); }}
              style={{
                padding: '4px 13px',
                fontSize: '13px',
                fontWeight: showSummary ? 600 : 500,
                ...(showSummary ? {
                  background: 'var(--s-main)',
                  color: '#fff',
                  border: 'none',
                  boxShadow: '0 3px 8px rgba(var(--s-rgb),0.25), 0 1px 1px rgba(0,0,0,0.04)',
                } : {}),
              }}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
              </svg>
              总结
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" style={{transition:'transform .15s', transform: sumMenuOpen?'rotate(180deg)':'none'}}><path d="M6 9l6 6 6-6"></path></svg>
            </button>
          </div>
        </div>
        <button
          onClick={() => onManageFixedSchedules?.()}
          title="管理固定日程"
          style={{
            display: 'flex', alignItems: 'center', gap: '4px',
            padding: '5px 10px',
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: '500',
            color: '#8e8e93',
            background: 'linear-gradient(90deg, rgba(142,142,147,0.08) 0%, transparent 65%)',
            border: 'none',
            cursor: 'pointer',
            transition: 'all .15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = '#6c6c70'; e.currentTarget.style.background = 'linear-gradient(90deg, rgba(142,142,147,0.15) 0%, transparent 65%)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = '#8e8e93'; e.currentTarget.style.background = 'linear-gradient(90deg, rgba(142,142,147,0.08) 0%, transparent 65%)'; }}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{flexShrink:0}}>
            <path d="M12 17v5"></path>
            <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"></path>
          </svg>
          固定日程
        </button>
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

    {/* 总结下拉菜单（Portal） */}
    {sumMenuOpen && typeof document !== 'undefined' && createPortal(
      <div
        ref={sumPortalRef}
        style={{
          position: 'fixed',
          top: sumMenuPos.top,
          left: sumMenuPos.left,
          minWidth: '240px',
          background: 'rgba(255,255,255,0.92)',
          backdropFilter: 'saturate(180%) blur(20px)',
          WebkitBackdropFilter: 'saturate(180%) blur(20px)',
          borderRadius: '14px',
          padding: '6px',
          boxShadow: '0 16px 48px rgba(0,0,0,0.22), 0 3px 12px rgba(0,0,0,0.10)',
          border: '1px solid rgba(255,255,255,0.8)',
          zIndex: 2147483647,
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
        }}
      >
        {/* Group 1: 总结面板 */}
        <div
          onClick={() => { setSumMenuOpen(false); onSummaryToggle?.(); }}
          style={{
            padding: '7px 10px', fontSize: '13px',
            cursor: 'pointer', borderRadius: '8px',
            display: 'flex', alignItems: 'center', gap: '10px',
            fontWeight: showSummary ? 600 : 500,
            color: 'var(--s-main)',
            background: showSummary ? 'rgba(var(--s-rgb),0.10)' : 'transparent',
            minHeight: '34px',
            transition: 'background .12s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(var(--s-rgb),0.08)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = showSummary ? 'rgba(var(--s-rgb),0.10)' : 'transparent'; }}
        >
          <div style={{
            width: '15px', height: '15px', borderRadius: '4px',
            background: 'rgba(var(--s-rgb),0.12)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--s-main)" strokeWidth="2.5">
              <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
            </svg>
          </div>
          <span style={{flex:1}}>总结面板</span>
          {showSummary && (
            <span style={{
              fontSize: '10px', fontWeight: 700,
              padding: '2px 7px', borderRadius: '4px',
              background: 'var(--s-main)', color: '#fff',
              letterSpacing: '0.02em',
            }}>已打开</span>
          )}
        </div>

        {/* Divider */}
        <div style={{ height: '1px', background: 'rgba(60,60,67,0.12)', margin: '4px 8px' }} />

        {/* Toolbar: 添加文档 */}
        {!editingDoc && (
          <div
            onClick={() => setEditingDoc({ id: 'new', name: '', url: '' })}
            style={{
              padding: '7px 10px', fontSize: '13px', color: 'var(--s-main)',
              cursor: 'pointer', borderRadius: '8px',
              display: 'flex', alignItems: 'center', gap: '10px',
              fontWeight: 500,
              transition: 'background .12s',
              minHeight: '34px',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(var(--s-rgb),0.08)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <div style={{
              width: '15px', height: '15px', borderRadius: '4px',
              background: 'rgba(var(--s-rgb),0.12)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--s-main)" strokeWidth="3.5"><path d="M12 5v14m-7-7h14"></path></svg>
            </div>
            添加文档
          </div>
        )}

        {/* 空状态 */}
        {docLinks.length === 0 && !editingDoc && (
          <div style={{
            padding: '6px 12px 10px',
            fontSize: '12px', color: '#c7c7cc',
            textAlign: 'center',
            lineHeight: 1.6,
          }}>
            暂无已绑定的文档
          </div>
        )}

        {/* 文档列表 */}
        {docLinks.map(doc => (
          <div
            key={doc.id}
            className="sum-doc-row"
            style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              padding: '7px 10px', borderRadius: '8px',
              cursor: 'pointer', fontSize: '13px',
              color: '#1c1c1e',
              transition: 'background .12s',
              minHeight: '34px',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#8e8e93" strokeWidth="2" style={{flexShrink:0}}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
            <span
              style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}
              onClick={() => { window.open(doc.url, '_blank', 'noopener,noreferrer'); setSumMenuOpen(false); }}
            >{doc.name}</span>
            <button
              onClick={(e) => { e.stopPropagation(); setEditingDoc({ ...doc }); }}
              className="sum-doc-btn"
              title="编辑"
            >✎</button>
            <button
              onClick={(e) => { e.stopPropagation(); saveDocLinks(docLinks.filter(d => d.id !== doc.id)); }}
              className="sum-doc-btn del"
              title="删除"
            >×</button>
          </div>
        ))}

        {/* 添加/编辑表单 */}
        {editingDoc && (
          <div style={{
            padding: '8px 10px',
            display: 'flex', flexDirection: 'column', gap: '7px',
            background: 'rgba(var(--s-rgb),0.04)',
            borderRadius: '8px',
            margin: '2px 0',
          }}>
            <div style={{
              fontSize: '11px', fontWeight: 600,
              color: 'var(--s-main)', textAlign: 'center',
              padding: '2px 0 4px',
            }}>{editingDoc.id === 'new' ? '添加新文档' : '编辑文档'}</div>
            <input
              value={editingDoc.name || ''}
              onChange={(e) => setEditingDoc(d => ({ ...d, name: e.target.value }))}
              placeholder="文档名称"
              style={{
                padding: '7px 10px',
                fontSize: '12.5px',
                borderRadius: '8px',
                border: '1px solid rgba(0,0,0,0.1)',
                background: '#fff',
                outline: 'none',
                width: '100%',
                boxSizing: 'border-box',
              }}
              autoFocus
            />
            <input
              value={editingDoc.url || ''}
              onChange={(e) => setEditingDoc(d => ({ ...d, url: e.target.value }))}
              placeholder="https://..."
              style={{
                padding: '7px 10px',
                fontSize: '12.5px',
                borderRadius: '8px',
                border: '1px solid rgba(0,0,0,0.1)',
                background: '#fff',
                outline: 'none',
                width: '100%',
                boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setEditingDoc(null)}
                style={{
                  padding: '5px 12px', borderRadius: '8px',
                  border: 'none',
                  background: 'rgba(120,120,128,0.12)', color: '#3c3c43',
                  fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                  transition: 'background .12s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(120,120,128,0.20)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(120,120,128,0.12)'}
              >取消</button>
              <button
                onClick={() => {
                  const name = (editingDoc.name || '').trim();
                  const url = (editingDoc.url || '').trim();
                  if (!name || !url || !/^https?:\/\//i.test(url)) return;
                  if (editingDoc.id === 'new') {
                    saveDocLinks([...docLinks, { id: 'doc_' + Date.now(), name, url }]);
                  } else {
                    saveDocLinks(docLinks.map(d => d.id === editingDoc.id ? { ...d, name, url } : d));
                  }
                  setEditingDoc(null);
                }}
                disabled={!editingDoc.name?.trim() || !editingDoc.url?.trim() || !/^https?:\/\//i.test(editingDoc.url || '')}
                style={{
                  padding: '5px 12px', borderRadius: '8px', border: 'none',
                  background: (!editingDoc.name?.trim() || !editingDoc.url?.trim() || !/^https?:\/\//i.test(editingDoc.url || '')) ? 'rgba(var(--s-rgb),0.4)' : 'var(--s-main)',
                  color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                  transition: 'all .12s',
                }}
                onMouseEnter={(e) => {
                  const disabled = !editingDoc.name?.trim() || !editingDoc.url?.trim() || !/^https?:\/\//i.test(editingDoc.url || '');
                  if (!disabled) e.currentTarget.style.background = 'var(--s-deep)';
                }}
                onMouseLeave={(e) => {
                  const disabled = !editingDoc.name?.trim() || !editingDoc.url?.trim() || !/^https?:\/\//i.test(editingDoc.url || '');
                  if (!disabled) e.currentTarget.style.background = 'var(--s-main)';
                }}
              >{editingDoc.id === 'new' ? '添加' : '保存'}</button>
            </div>
          </div>
        )}
      </div>,
      document.body
    )}
    </>
  );
}
