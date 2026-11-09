import { useEffect, useRef, useState } from 'react';
import { API } from '../api/client.js';
import { formatDuration, fromISODate, calcDurationMin, cachedLoad, cachePeek, cacheClear, loadingGate, dateScopeLabel, today as getToday } from '../utils/date.js';
import { store } from '../utils/store.js';
import { useToast } from '../context/ToastContext.jsx';
import { useWorkspaceActions } from '../context/WorkspaceActionsContext.jsx';
import PTag from './PTag.jsx';
import ConfirmAlert from './ConfirmAlert.jsx';
import { useLongPress } from './useLongPress.js';
import { inferGrowthType, GROWTH_TYPES } from '../utils/uiConstants.js';

const weekLabels = ['日', '一', '二', '三', '四', '五', '六'];

function dateLabel(dateStr) {
  const d = fromISODate(dateStr);
  return `${d.getMonth() + 1}月${d.getDate()}日 周${weekLabels[d.getDay()]}`;
}

// category: 1=工作(红), 2=能力(橙), 3=常规(灰), 4=习惯(绿), 5=生活(紫), 6=精力(绿), 7=知力(蓝)
// cat=4 习惯类日程由 HabitsPanel 独立管理不进重点事项；
// cat=5 生活类日程是用户手动创建的计划，正常显示（生活体验记录走 localStorage，不经此数据源）
// is_goal 目标事项（本周目标/周月主线创建）只归属主线面板，不进重点事项卡片
function isDisplayInKeyTasks(s) {
  return catOf(s) !== 4 && !s.is_goal;
}
function catOf(s) {
  const cat = Number(s.category);
  if (cat === 1) return 1;
  if (cat === 2) return 2;
  if (cat === 3) return 3;
  if (cat === 4) return 4;
  if (cat === 5) return 5;
  if (cat === 6) return 6;
  if (cat === 7) return 7;
  // 旧数据兼容：无 category 按 is_key + 时间段推
  if (s.is_key) {
    const st = s.start_time;
    if (st && Number(st.split(':')[0]) <= 12) return 1;
    return 2;
  }
  return 3;
}

// 二级任务：数据库存 JSON 字符串，前端统一成数组；旧数据/脏数据一律回落空数组
function parseSubtasks(v) {
  if (Array.isArray(v)) return v;
  if (!v) return [];
  try {
    const arr = JSON.parse(v);
    return Array.isArray(arr) ? arr : [];
  } catch (_) { return []; }
}
function normalizeSchedule(s) {
  return { ...s, subtasks: parseSubtasks(s.subtasks), note: s.note || '' };
}
// 展开态是纯视图状态，只存本机，不进数据库/云端
const KT_EXPAND_KEY = 'kt_expanded_v1';

export default function KeyTasks({ date, view, range, refreshSignal, onEdit, onNew, onChange }) {
  const toast = useToast();
  const { deleteScheduleConfirm, showContextMenu } = useWorkspaceActions();
  // 触摸端长按行 → 弹出与右键相同的上下文菜单
  const lp = useLongPress();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasData, setHasData] = useState(false);
  // sortBy: priority(按优先级 P0→P3) | time(按时间顺序)。默认按优先级
  const [sortBy, setSortBy] = useState('priority');
  const [confirmDel, setConfirmDel] = useState(null);
  // 展开态（默认折叠） + 行内编辑态：正在加子任务 / 正在写备注
  const [expanded, setExpanded] = useState(() => {
    try {
      const arr = JSON.parse(localStorage.getItem(KT_EXPAND_KEY) || '[]');
      return new Set(Array.isArray(arr) ? arr.map(String) : []);
    } catch (_) { return new Set(); }
  });
  const [addingId, setAddingId] = useState(null);
  const [subDraft, setSubDraft] = useState('');
  const [noteEditId, setNoteEditId] = useState(null);
  const [noteDraft, setNoteDraft] = useState('');
  const inFlightRef = useRef(null);
  const cacheRef = useRef(new Map());
  // 勾选编辑缓冲：`id|date` → 新 is_done
  // 兜底三条回退路径：① 飞行中的旧请求迟到 ② 落库窗口内被 reload 触发的旧数据覆盖 ③ 缓存写穿失败
  // load() 应用任何数据源（缓存/服务器）前重放未确认的编辑，数据源返回一致值时自动确认清除
  const pendingTogglesRef = useRef(new Map());

  function applyPendingToggles(list) {
    if (!pendingTogglesRef.current.size || !Array.isArray(list)) return list;
    let out = list;
    for (const [key, val] of [...pendingTogglesRef.current]) {
      const bar = key.indexOf('|');
      const id = key.slice(0, bar), date = key.slice(bar + 1);
      const idx = out.findIndex(x => String(x.id) === id && (!date || x.date === date));
      if (idx < 0) continue; // 该数据源不含此项（不同日期范围）：保留待确认
      if (!!out[idx].is_done === !!val) { pendingTogglesRef.current.delete(key); continue; } // 服务器已确认
      if (out === list) out = [...list];
      out[idx] = { ...out[idx], is_done: val };
    }
    return out;
  }

  function load() {
    const cacheKey = `kt:${range.from}:${range.to}`;
    const CACHE_TTL = 120000; // 2分钟缓存，跨天切换零延迟
    const peeked = cachePeek(cacheKey, cacheRef, CACHE_TTL);
    if (peeked) {
      setList(applyPendingToggles(peeked.value));
      setHasData(true);
      // 命中缓存立即返回，不再 setLoading(false) 避免骨架屏闪烁
      // 后台静默刷新
      cachedLoad(cacheKey, async () => {
        const r = await API.schedules.list({ from: range.from, to: range.to });
        return r.schedules.filter(s => isDisplayInKeyTasks(s)).map(normalizeSchedule);
      }, inFlightRef, cacheRef, CACHE_TTL).then(key => {
        setList(applyPendingToggles(key));
      }).catch(() => {});
      return;
    }
    // 缓存未命中：已显示过旧数据则不闪骨架屏，否则 0ms 立即显示
    const gate = loadingGate(setLoading, hasData ? 120 : 0);
    gate.require();

    cachedLoad(cacheKey, async () => {
      const r = await API.schedules.list({ from: range.from, to: range.to });
      return r.schedules
        .filter(s => isDisplayInKeyTasks(s))
        .map(normalizeSchedule)
        .sort((a, b) => {
          if (a.date !== b.date) return a.date.localeCompare(b.date);
          return (a.start_time || '99').localeCompare(b.start_time || '99');
        });
    }, inFlightRef, cacheRef, CACHE_TTL).then(key => {
      setList(applyPendingToggles(key));
      setHasData(true);
      gate.done();
    }).catch(e => { console.error(e); gate.done(); });
  }

  // 订阅回调在挂载时建一次（[] 依赖），若直接捕获 load 会锁死首次渲染的 range：
  // 切到 11.14 后，2 分钟轮询的 reload 仍按首次的「今天」拉数据 → 当天之外的事项被整个列表替换掉（消失）
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => { load(); }, [range.from, range.to, refreshSignal]);

  // 订阅 patch：其他面板 toggle / markFailed 时即时同步，无需重新 load
  useEffect(() => store.subscribe(patch => {
    if (patch.type === 'schedule' && patch.id !== undefined) {
      // patch.date 存在时仅更新该日期的实例（重复事项的虚拟实例按 id+date 定位）
      const matches = x => String(x.id) === String(patch.id) && (!patch.date || x.date === patch.date);
      // 勾选与时间同走一条通道：时间线拖拽/拉伸后 Timeline 会带上新时间广播，
      // 这里就地改，不再依赖 refresh → list 接口往返（左卡时间不再滞后）
      const apply = (x) => {
        const next = { ...x };
        if (patch.is_done !== undefined) next.is_done = patch.is_done;
        if (patch.is_failed !== undefined) next.is_failed = patch.is_failed;
        if (patch.start_time !== undefined) next.start_time = patch.start_time;
        if (patch.end_time !== undefined) next.end_time = patch.end_time;
        if (patch.duration_min !== undefined) next.duration_min = patch.duration_min;
        if (patch.note !== undefined) next.note = patch.note;
        if (patch.subtasks !== undefined) next.subtasks = parseSubtasks(patch.subtasks);
        return next;
      };
      setList(ls => ls.map(x => matches(x) ? apply(x) : x));
      // 写穿缓存：任何面板（含本面板）的勾选/时间同步进 2 分钟缓存，
      // 防止后续 load() 命中 TTL 内旧快照导致回退（broadcast 会送达发起方自身）
      for (const ent of cacheRef.current.values()) {
        if (Array.isArray(ent?.value)) {
          ent.value = ent.value.map(x => matches(x) ? apply(x) : x);
        }
      }
    } else if (patch.type === 'reload') {
      // 不调 onChange（refreshKey++）：reload 广播源（自动同步/保存后刷新）都会同时 refresh()，
      // 这里再叠加会让本轮数据被拉两遍、面板连闪两次（"数据跳动"放大器）
      cacheClear(cacheRef, 'kt:');
      // 用最新一次渲染的 load（range 为当前选中日期），不能用首次渲染的闭包
      loadRef.current();
    }
  }), []);

  async function toggle(s) {
    const nextDone = s.is_done ? 0 : 1;
    // 标记完成时清除"未完成"标记；取消完成时保留原 is_failed（通常为 false）
    const nextFailed = nextDone ? false : !!s.is_failed;
    const pKey = `${s.id}|${s.date || ''}`;
    setList(ls => ls.map(x => (x.id === s.id && x.date === s.date) ? { ...x, is_done: nextDone, is_failed: nextFailed } : x));
    store.broadcast({ type: 'schedule', id: s.id, date: s.date, is_done: nextDone, is_failed: nextFailed });
    // 落库确认窗口兜底：登记本地编辑，load() 应用旧数据源前重放，防止覆盖
    pendingTogglesRef.current.set(pKey, nextDone);
    try {
      // 重复事项的虚拟实例：传 occurrence_date，后端把完成状态记到该日期（不影响整个序列）
      await API.schedules.update(s.id, { is_done: nextDone, is_failed: nextFailed, ...(s._repeat_occurrence ? { occurrence_date: s.date } : {}) });
    } catch (e) {
      pendingTogglesRef.current.delete(pKey);
      setList(ls => ls.map(x => (x.id === s.id && x.date === s.date) ? { ...x, is_done: s.is_done, is_failed: s.is_failed } : x));
      store.broadcast({ type: 'schedule', id: s.id, date: s.date, is_done: s.is_done, is_failed: s.is_failed });
      toast.error(e.message);
    }
  }

  function remove(s) {
    if (deleteScheduleConfirm) {
      deleteScheduleConfirm(s.id, s.title);
    } else {
      setConfirmDel(s);
    }
  }

  /* —— 二级任务拆解 & 一级任务备注 —— */
  const persistExpanded = (next) => {
    setExpanded(next);
    try { localStorage.setItem(KT_EXPAND_KEY, JSON.stringify([...next])); } catch (_) {}
  };
  const toggleExpand = (id) => {
    const key = String(id);
    const next = new Set(expanded);
    if (next.has(key)) next.delete(key); else next.add(key);
    persistExpanded(next);
    if (next.has(key)) { setAddingId(null); setSubDraft(''); }
  };

  // 先本地生效 + 广播，再落库；失败回滚靠 load() 拉回真实数据
  async function saveSchedulePatch(s, patch) {
    setList(ls => ls.map(x => String(x.id) === String(s.id) ? { ...x, ...patch } : x));
    store.broadcast({ type: 'schedule', id: s.id, ...patch });
    try {
      await API.schedules.update(s.id, patch);
    } catch (e) {
      toast.error(e.message);
      load();
    }
  }

  function toggleSubtask(s, subId) {
    const subs = (s.subtasks || []).map(x => x.id === subId ? { ...x, done: !x.done } : x);
    saveSchedulePatch(s, { subtasks: subs });
  }

  function addSubtask(s, raw) {
    const text = String(raw || '').trim();
    if (!text) return;
    // 「20 公司 + 岗位理解」→ 20min + 标题；不写时长也可以
    const m = text.match(/^(\d{1,3})\s*[分m]?\s+(.+)$/i);
    const min = m ? Number(m[1]) : null;
    const title = m ? m[2].trim() : text;
    if (!title) return;
    const id = `st_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    saveSchedulePatch(s, { subtasks: [...(s.subtasks || []), { id, title, min, done: false }] });
    setSubDraft('');
  }

  function removeSubtask(s, subId) {
    saveSchedulePatch(s, { subtasks: (s.subtasks || []).filter(x => x.id !== subId) });
  }

  function openNote(s) {
    setNoteEditId(String(s.id));
    setNoteDraft(s.note || '');
  }

  function saveNote(s) {
    const text = noteDraft.trim();
    setNoteEditId(null);
    saveSchedulePatch(s, { note: text });
  }

  function doRemove(s) {
    API.schedules.remove(s.id).then(() => {
      cacheClear(cacheRef, 'kt:');
      store.broadcast({ type: 'reload' });
      onChange?.();
      load();
    }).catch(e => toast.error(e.message));
  }

  const done = list.filter(s => s.is_done).length;

  // ====== 排序函数 ======
  // 模块权重（同优先级时用）：1(工作) < 2(能力) < 7(知力) < 6(精力) < 5(生活) < 3(常规) < 4(习惯)
  const CAT_PRIORITY = { 1: 10, 2: 20, 7: 30, 6: 40, 5: 50, 3: 90, 4: 95 };
  // P0-P3 权重：未设置优先级（null/''）排在 P3 之后，避免"没标"压过"已标"
  const pRank = (s) => {
    if (s.priority === null || s.priority === undefined || s.priority === '') return 4;
    const n = Number(s.priority);
    return Number.isFinite(n) ? n : 4;
  };
  function sortByPriority(items) {
    return [...items].sort((a, b) => {
      // 1) 优先级：P0 → P1 → P2 → P3 → 未设置（这才是"重要性"的第一语义）
      const prA = pRank(a);
      const prB = pRank(b);
      if (prA !== prB) return prA - prB;
      // 2) 同优先级：按模块权重（工作 > 能力 > 知力 …），保持原有的板块感
      const catA = catOf(a);
      const catB = catOf(b);
      const wA = CAT_PRIORITY[catA] ?? 99;
      const wB = CAT_PRIORITY[catB] ?? 99;
      if (wA !== wB) return wA - wB;
      // 3) 同模块：先按 date 升序（跨天事项不能只看 start_time）
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      // 4) 同天：按 start_time 升序(无时间排后面)
      const ta = a.start_time || '99:99';
      const tb = b.start_time || '99:99';
      if (ta !== tb) return ta.localeCompare(tb);
      // 5) 同分类同时间：未完成在前、已完成在后（视觉感受"位置不动"）
      const doneA = a.is_done ? 1 : 0;
      const doneB = b.is_done ? 1 : 0;
      if (doneA !== doneB) return doneA - doneB;
      // 6) 稳定兜底：ID 排序
      return String(a.id ?? '').localeCompare(String(b.id ?? ''));
    });
  }
  function sortByTime(items) {
    return [...items].sort((a, b) => {
      // 先按 date 升序，再按 start_time
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      const ta = a.start_time || '99:99';
      const tb = b.start_time || '99:99';
      if (ta !== tb) return ta.localeCompare(tb);
      const catA = catOf(a);
      const catB = catOf(b);
      const wA = CAT_PRIORITY[catA] ?? 99;
      const wB = CAT_PRIORITY[catB] ?? 99;
      if (wA !== wB) return wA - wB;
      // 同时间同分类：未完成在前
      const doneA = a.is_done ? 1 : 0;
      const doneB = b.is_done ? 1 : 0;
      if (doneA !== doneB) return doneA - doneB;
      return String(a.id ?? '').localeCompare(String(b.id ?? ''));
    });
  }
  function applySort(items) {
    return sortBy === 'priority' ? sortByPriority(items) : sortByTime(items);
  }

  // 圆环进度
  const radius = 10;
  const circumference = 2 * Math.PI * radius;
  const offset = list.length > 0 ? circumference * (1 - done / list.length) : circumference;

  function getStyle(s) {
    // 勾选后背景/边框/小圆点保留原色，仅文字变灰+删除线
    const cat = catOf(s);
    if (cat === 1) {
      return {
        bg: 'linear-gradient(90deg,var(--danger-soft) 0%,transparent 70%)',
        borderColor: 'var(--m-work)',
        dotColor: 'var(--m-work)',
        doneColor: 'var(--m-work)'
      };
    }
    if (cat === 2) {
      return {
        bg: 'linear-gradient(90deg,#fff4d8 0%,transparent 70%)',
        borderColor: 'var(--m-ability)',
        dotColor: 'var(--m-ability)',
        doneColor: 'var(--m-ability)'
      };
    }
    // 习惯（cat=4）按成长类型分色
    if (cat === 4) {
      const gt = inferGrowthType(s);
      const def = GROWTH_TYPES[gt] || GROWTH_TYPES.energy;
      return {
        bg: `linear-gradient(90deg,${def.bg || '#e5f6ea'} 0%,transparent 70%)`,
        borderColor: def.color || 'var(--m-energy)',
        dotColor: def.color || 'var(--m-energy)',
        doneColor: def.color || 'var(--m-energy)'
      };
    }
    // 生活体验（cat=5）紫色
    if (cat === 5) {
      return {
        bg: 'linear-gradient(90deg,#f3e8ff 0%,transparent 70%)',
        borderColor: 'var(--m-life)',
        dotColor: 'var(--m-life)',
        doneColor: 'var(--m-life)'
      };
    }
    // 精力（cat=6）绿色 — 与主线精力模块一致（var(--m-energy)）
    if (cat === 6) {
      return {
        bg: 'linear-gradient(90deg,#e5f6ea 0%,transparent 70%)',
        borderColor: 'var(--m-energy)',
        dotColor: 'var(--m-energy)',
        doneColor: 'var(--m-energy)'
      };
    }
    // 知力（cat=7）蓝色 — 与主线知力模块一致（var(--m-cognition)）
    if (cat === 7) {
      return {
        bg: 'linear-gradient(90deg,#e0f0ff 0%,transparent 70%)',
        borderColor: 'var(--m-cognition)',
        dotColor: 'var(--m-cognition)',
        doneColor: 'var(--m-cognition)'
      };
    }
    // 财务（cat=8）粉色 — 与系统设置财务模块色一致（var(--m-finance)）
    if (cat === 8) {
      return {
        bg: 'linear-gradient(90deg,#ffe9ee 0%,transparent 70%)',
        borderColor: 'var(--m-finance)',
        dotColor: 'var(--m-finance)',
        doneColor: 'var(--m-finance)'
      };
    }
    // 常规事项
    return {
      bg: 'linear-gradient(90deg,var(--ink-100) 0%,transparent 70%)',
      borderColor: 'var(--text-muted)',
      dotColor: 'var(--text-muted)',
      doneColor: 'var(--text-muted)'
    };
  }

  function formatTime(s) {
    if (!s.start_time) return '';
    function isZero(t) {
      if (!t) return false;
      const c = String(t).trim();
      if (c === '00:00' || c === '0:00' || c === '0') return true;
      const [h, m] = c.split(':').map(Number);
      return Number(h) === 0 && Number(m) === 0;
    }
    let st = s.start_time;
    let et = s.end_time;
    // 兼容区间写法 'HH:MM-HH:MM'
    if (st && st.includes('-')) {
      const [a, b] = st.split('-');
      if (!et) et = b;
      st = a;
    }
    const stZero = isZero(st);
    const etZero = !et || isZero(et);
    if (stZero && etZero) return '';
    let txt = st;
    if (et && !etZero) txt += ' – ' + et;
    // 兜底：优先按 start/end 实时计算，避免 duration_min 脏数据
    const calcDur = !stZero && !etZero ? calcDurationMin(st, et) : null;
    const displayDur = calcDur != null ? calcDur : s.duration_min;
    if (displayDur) txt += ' · ' + formatDuration(displayDur);
    return txt;
  }

  // 渲染单条 item（一级任务 + 二级任务拆解 + 备注）
  function renderItem(s) {
    const st = getStyle(s);
    const cat = catOf(s);
    const isHabitSchedule = cat === 4;
    const cbClass = 'cb-round'; // 全站完成标记统一圆形（与习惯打卡/主页卡片/时间线一致）
    const subs = s.subtasks || [];
    const subsDone = subs.filter(x => x.done).length;
    const sid = String(s.id);
    const isOpen = expanded.has(sid);
    const isAdding = addingId === sid;
    const isNoteOpen = noteEditId === sid;
    const allSubsDone = subs.length > 0 && subsDone === subs.length;
    const timeTxt = formatTime(s);
    const openSubEditor = () => {
      const next = new Set(expanded);
      next.add(sid);
      persistExpanded(next);
      setAddingId(sid);
      setSubDraft('');
    };
    return (
      <div key={s.id} className="kt-item">
        <div
          className={`task-row rounded-xl px-3 py-1.5 flex items-center gap-3 group ${isHabitSchedule ? 'habit-row' : ''}`}
          style={{background: st.bg, cursor: 'grab'}}
          draggable
          onDragStart={(e) => {
            const data = {
              title: s.title,
              category: s.category || cat,
              emoji: s.emoji,
              duration_min: s.duration_min || 30,
              isPreset: false,
              scheduleId: s.id
            };
            e.dataTransfer.setData('application/json', JSON.stringify(data));
            e.dataTransfer.effectAllowed = 'move';
          }}
          onClick={() => {
            if (isHabitSchedule) return;
            onEdit?.(s);
          }}
          {...lp.bind((pos) => showContextMenu?.(pos.clientX, pos.clientY, 'schedule', s.id, s))}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            showContextMenu?.(e.clientX, e.clientY, 'schedule', s.id, s);
          }}
        >
          <input
            type="checkbox"
            className={`${cbClass} ${s.is_failed && !s.is_done ? 'cb-failed' : ''}`}
            checked={!!s.is_done}
            onChange={() => {}}
            style={{ '--cb-color': s.is_failed ? 'var(--m-work)' : st.doneColor, '--cb-border': s.is_failed ? 'var(--m-work)' : (s.is_done ? st.doneColor : st.borderColor) }}
            onClick={(e) => { e.stopPropagation(); toggle(s); }}
            title={s.is_done ? '左键取消完成 · 右键/长按菜单' : s.is_failed ? '左键标记完成 · 右键/长按菜单' : '左键标记完成 · 右键/长按菜单'}
          />
          <div className="flex-1 min-w-0">
            <p className={`flex items-center gap-1.5 text-[14px] ${s.is_done ? 'text-[var(--text-muted)] line-through' : s.is_failed ? 'text-[var(--m-work)] line-through' : 'text-[var(--text-1)]'}`}>
              <span className="truncate">{s.title}</span>
              <PTag p={s.priority} />
            </p>
            <p className={`text-[12px] mt-0.5 ${s.is_done ? 'text-[#aeaeae]' : s.is_failed ? 'text-[#FF3B30]/70' : 'text-[var(--text-muted)]'}`}>
              {timeTxt}
              {subs.length > 0 && (
                <span
                  className={`tabular-nums ${timeTxt ? 'ml-1.5' : ''}`}
                  style={{ color: allSubsDone ? st.doneColor : undefined }}
                >· {subsDone}/{subs.length}</span>
              )}
            </p>
            {s.note && !isNoteOpen && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); openNote(s); }}
                className="mt-0.5 flex items-start gap-1 w-full text-left"
                title="点击编辑备注"
              >
                <span className="text-[11px] leading-[16px] flex-shrink-0 text-[var(--text-muted)]">备注</span>
                <span className="text-[12px] leading-[16px] truncate text-[var(--text-muted)]">{s.note}</span>
              </button>
            )}
          </div>
          {/* 无备注时悬停出现备注入口：不占位，避免空卡片被撑高 */}
          {!s.note && !isNoteOpen && !isHabitSchedule && (
            <button
              onClick={(e) => { e.stopPropagation(); openNote(s); }}
              className="flex-shrink-0 w-5 h-5 -mr-0.5 flex items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity"
              title="添加备注"
            >
              <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none">
                <path d="M8.4 1.9l1.7 1.7-5.9 5.9-2.3.6.6-2.3 5.9-5.9z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
              </svg>
            </button>
          )}
          {/* 展开/折叠：有子任务常驻箭头，无子任务悬停出现「+」拆解入口 */}
          {subs.length > 0 || isOpen ? (
            <button
              onClick={(e) => { e.stopPropagation(); toggleExpand(s.id); }}
              className="flex-shrink-0 w-5 h-5 -mr-0.5 flex items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-black/5 transition-colors"
              title={isOpen ? '收起子任务' : '展开子任务'}
              aria-expanded={isOpen}
            >
              <svg className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} viewBox="0 0 12 12" fill="none">
                <path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); openSubEditor(); }}
              className="flex-shrink-0 w-5 h-5 -mr-0.5 flex items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity"
              title="拆解为子任务"
            >
              <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none">
                <path d="M6 2.5v7M2.5 6h7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
              </svg>
            </button>
          )}
          {/* 小圆点始终保留原色 */}
          <span className={`w-2 h-2 flex-shrink-0 self-center ${isHabitSchedule ? 'rounded-full' : 'rounded-[2px]'}`} style={{background: st.dotColor}}></span>
          <button
            onClick={(e) => { e.stopPropagation(); remove(s); }}
            className="opacity-0 group-hover:opacity-100 text-[var(--text-muted)] hover:text-[var(--m-work)] text-xs px-1"
            title="删除"
          >×</button>
        </div>

        {/* 备注编辑：回车保存 / Esc 取消 */}
        {isNoteOpen && (
          <div className="px-3 pb-2" onClick={(e) => e.stopPropagation()}>
            <textarea
              autoFocus
              rows={2}
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.nativeEvent?.isComposing) return;
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveNote(s); }
                if (e.key === 'Escape') { e.preventDefault(); setNoteEditId(null); }
              }}
              placeholder="记录完成情况或未完成原因，如：今天没找到合适的公司"
              className="w-full resize-none rounded-lg border bg-white/70 px-2 py-1.5 text-[12.5px] leading-[18px] outline-none focus:border-[color:var(--s-main)]"
              style={{ borderColor: 'rgba(120,120,128,0.2)', color: 'var(--text-1)' }}
            />
            <div className="mt-1 flex items-center justify-end gap-2">
              <button onClick={() => setNoteEditId(null)} className="text-[11px] px-2 py-0.5 rounded-md text-[var(--text-muted)] hover:bg-black/5">取消</button>
              <button onClick={() => saveNote(s)} className="text-[11px] px-2.5 py-0.5 rounded-md font-medium text-white" style={{ background: 'var(--s-main)' }}>保存</button>
            </div>
          </div>
        )}

        {/* 二级任务：缩进 + 左侧竖线表达归属，不重复展示优先级/模块色 */}
        {isOpen && (
          <div
            className="ml-[26px] mr-1 mb-1 pl-3 border-l"
            style={{ borderColor: 'rgba(120,120,128,0.16)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {subs.map(sub => (
              <div key={sub.id} className="group/sub flex items-center gap-2 py-[5px] rounded-md hover:bg-black/[0.03]">
                <input
                  type="checkbox"
                  className="cb-round"
                  checked={!!sub.done}
                  onChange={() => {}}
                  onClick={() => toggleSubtask(s, sub.id)}
                  style={{ '--cb-color': st.doneColor, '--cb-border': sub.done ? st.doneColor : st.borderColor }}
                  title={sub.done ? '取消完成' : '标记完成'}
                />
                <span className={`flex-1 min-w-0 truncate text-[13px] ${sub.done ? 'line-through text-[var(--text-muted)]' : 'text-[var(--text-1)]'}`}>{sub.title}</span>
                {sub.min ? <span className="text-[11px] text-[var(--text-muted)] tabular-nums flex-shrink-0">{sub.min}min</span> : null}
                <button
                  onClick={() => removeSubtask(s, sub.id)}
                  className="opacity-0 group-hover/sub:opacity-100 text-[var(--text-muted)] hover:text-[var(--m-work)] text-[11px] px-0.5"
                  title="删除子任务"
                >×</button>
              </div>
            ))}
            {isAdding ? (
              <div className="flex items-center gap-2 py-[3px]">
                <span className="w-[14px] h-[14px] rounded-[4px] border border-dashed flex-shrink-0" style={{ borderColor: 'var(--text-muted)' }}></span>
                <input
                  autoFocus
                  value={subDraft}
                  onChange={(e) => setSubDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.nativeEvent?.isComposing) return;
                    if (e.key === 'Enter') { e.preventDefault(); addSubtask(s, subDraft); }
                    if (e.key === 'Escape') { e.preventDefault(); setAddingId(null); setSubDraft(''); }
                  }}
                  onBlur={() => { if (!subDraft.trim()) setAddingId(null); }}
                  placeholder="如 20 公司 + 岗位理解，回车继续"
                  className="flex-1 min-w-0 bg-transparent text-[13px] outline-none placeholder:text-[var(--text-muted)]"
                />
              </div>
            ) : (
              <button
                onClick={() => { setAddingId(sid); setSubDraft(''); }}
                className="mt-0.5 flex items-center gap-1 text-[12px] text-[var(--text-muted)] hover:text-[var(--s-main)] transition-colors"
              >
                <span className="text-[14px] leading-none">+</span> 添加子任务
              </button>
            )}
            {allSubsDone && !s.is_done && (
              <button
                onClick={() => toggle(s)}
                className="mt-1 text-[11px] font-medium text-[var(--s-main)] hover:underline"
              >全部子任务已完成 · 标记主任务完成 →</button>
            )}
          </div>
        )}
      </div>
    );
  }

  // 标题（今日视图跟随选中日：非今天时追加主题色日期，今天保持干净不加热词）
  const titleText = view === 'today'
    ? (date !== getToday()
      ? <>重点事项 <span className="text-[var(--ink-300)] font-medium">·</span> <span className="text-[color:var(--s-main)]">{dateScopeLabel(date)}</span></>
      : '重点事项')
    : view === 'week'
    ? '重点事项 · 本周'
    : '重点事项 · 本月';

  // === Week/Month 视图：按日期分组，每组内按 sortBy 控制排序 ===
  function renderGroupedView() {
    const groups = {};
    list.forEach(s => {
      if (!groups[s.date]) groups[s.date] = [];
      groups[s.date].push(s);
    });
    const dates = Object.keys(groups).sort();

    if (dates.length === 0) {
      return (
        <div className="text-center py-6 text-sm text-[var(--text-muted)]">
          <div className="text-2xl mb-2">📋</div>
          {view === 'week' ? '本周' : '本月'}无事项
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {dates.map(d => {
          const items = groups[d];
          const dDone = items.filter(s => s.is_done).length;
          const sorted = applySort(items);
          return (
            <div key={d}>
              <div className="flex items-center gap-2 mb-1.5 px-1">
                <div className="w-2 h-2 rounded-[2px] bg-[var(--text-1)] shrink-0"></div>
                <p className="text-[13px] font-semibold text-[var(--text-1)]">{dateLabel(d)}</p>
                <span className="text-[11px] text-[var(--text-muted)]">{items.length} 项 · 已完成 {dDone}</span>
              </div>
              <div className="space-y-1.5">
                {sorted.map(renderItem)}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // === Today 视图：所有事项按 sortBy 控制排序，默认按优先级 ===
  function renderTodayView() {
    const todayList = list.filter(s => s.date === date);
    const sorted = applySort(todayList);

    // 有至少 1 条真实事项（非空 todayList）就关闭预设提示占位
    const hasAnyRealItem = todayList.length > 0;

    return (
      <div className="space-y-1.5">
        {/* 真实事项（预设占位模板已按要求删除） */}
        {sorted.map(renderItem)}
      </div>
    );
  }

  return (
    <div className="glass-card p-4">
      <div className="flex items-start justify-between gap-2 section-header">
          <div className="flex flex-col gap-0.5 flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <span className="section-accent" style={{background:'var(--s-main)'}}></span>
              <h3 className="section-title">{titleText}</h3>
              {/* 排序切换按钮：优先级(三色横线) / 时间(三条递减灰线)，去容器化图标按钮 */}
              <button
                onClick={() => setSortBy(sortBy === 'priority' ? 'time' : 'priority')}
                className="w-7 h-7 flex items-center justify-center rounded-[10px] text-[var(--text-muted)] hover:bg-[rgba(120,120,128,0.06)] active:bg-[rgba(120,120,128,0.12)] transition-colors"
                title={sortBy === 'priority' ? '按优先级排序（P0→P3，点击切换为按时间）' : '按时间排序（点击切换为按优先级）'}
                aria-label={sortBy === 'priority' ? '按优先级排序' : '按时间排序'}
              >
                {sortBy === 'priority' ? (
                  <svg className="w-[15px] h-[15px]" viewBox="0 0 14 14" fill="none">
                    <rect x="1.5" y="2" width="11" height="2.2" rx="1.1" fill="var(--m-work)"/>
                    <rect x="1.5" y="5.9" width="11" height="2.2" rx="1.1" fill="var(--m-ability)"/>
                    <rect x="1.5" y="9.8" width="11" height="2.2" rx="1.1" fill="var(--ink-300)"/>
                  </svg>
                ) : (
                  <svg className="w-[15px] h-[15px]" viewBox="0 0 14 14" fill="none">
                    <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none">
                      <line x1="1.5" y1="3" x2="12.5" y2="3"/>
                      <line x1="1.5" y1="7" x2="9.5" y2="7"/>
                      <line x1="1.5" y1="11" x2="6.5" y2="11"/>
                    </g>
                  </svg>
                )}
              </button>
            </div>
            <p className="text-[12px] font-normal tracking-tight leading-tight ml-[17px]" style={{ color: 'var(--text-muted)', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Helvetica Neue", Arial, sans-serif' }}>
              增收入 · 建资产 · 提能力
            </p>
          </div>
        <div className="flex items-center gap-2">
          <div className="relative w-6 h-6">
            <svg viewBox="0 0 24 24" className="w-6 h-6 -rotate-90">
              <circle cx="12" cy="12" r={radius} fill="none" stroke="var(--ink-100)" strokeWidth="3"></circle>
              <circle
                cx="12" cy="12" r={radius} fill="none"
                stroke="var(--s-main)" strokeWidth="3" strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
              ></circle>
            </svg>
          </div>
          <span className="text-[11px] font-semibold px-3 rounded-full inline-flex items-center h-[26px] tabular-nums" style={{ background: 'rgba(var(--s-rgb),0.08)', color: 'var(--s-main)' }}><span className="font-extrabold">{done}</span><span className="opacity-50 mx-0.5">/</span>{list.length}</span>
          <button onClick={onNew} className="inline-flex items-center justify-center rounded-lg text-xs w-[26px] h-[26px] transition hover:brightness-105 active:scale-[0.97] flex-shrink-0" style={{ background: 'rgba(var(--s-rgb),0.06)', color: 'var(--s-main)' }} title="添加">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4"></path></svg>
          </button>
        </div>
      </div>

      {loading && !hasData ? (
        <div className="space-y-3 pt-3 px-1">
          <div className="sk-line" style={{width:'88%'}}></div>
          <div className="sk-line" style={{width:'72%'}}></div>
          <div className="sk-line" style={{width:'82%'}}></div>
          <div className="sk-line" style={{width:'60%'}}></div>
        </div>
      ) : (
        view === 'today' ? renderTodayView() : renderGroupedView()
      )}

      {confirmDel && (
        <ConfirmAlert
          danger
          title="删除确认"
          message={`删除「${confirmDel.title}」？`}
          confirmText="删除"
          onCancel={() => setConfirmDel(null)}
          onConfirm={() => { const s = confirmDel; setConfirmDel(null); doRemove(s); }}
        />
      )}
    </div>
  );
}
