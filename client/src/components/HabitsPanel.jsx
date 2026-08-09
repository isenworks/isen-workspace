import { useEffect, useRef, useState } from 'react';
import { API } from '../api/client.js';
import { formatDuration, calcDurationMin, cachedLoad } from '../utils/date.js';
import { store } from '../utils/store.js';
import { GROWTH_TYPES, inferGrowthType } from '../utils/uiConstants.js';
import { useToast } from '../context/ToastContext.jsx';

function minutesBetween(t1, t2) {
  if (!t1 || !t2) return null;
  const [h1, m1] = t1.split(':').map(Number);
  const [h2, m2] = t2.split(':').map(Number);
  if (isNaN(h1) || isNaN(m1) || isNaN(h2) || isNaN(m2)) return null;
  const diff = (h2 * 60 + m2) - (h1 * 60 + m1);
  return diff > 0 ? diff : null;
}

export default function HabitsPanel({ date, refreshSignal, onChange }) {
  const toast = useToast();
  const [habits, setHabits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dragId, setDragId] = useState(null);       // 正在拖拽的 habit id
  const [overId, setOverId] = useState(null);       // 拖拽悬停的目标 habit id
  const inFlightRef = useRef(null);
  const cacheRef = useRef(new Map());

  function load() {
    const cacheKey = `hp:${date}:${refreshSignal}`;
    setLoading(true);
    cachedLoad(cacheKey, async () => {
      const r = await API.habits.list({ date });
      return r.habits;
    }, inFlightRef, cacheRef, 3000).then(hs => {
      setHabits(hs);
      setLoading(false);
    }).catch(e => { console.error(e); setLoading(false); });
  }

  useEffect(() => { load(); }, [date, refreshSignal]);

  useEffect(() => store.subscribe(patch => {
    if (patch.type === 'habit' && patch.id !== undefined) {
      setHabits(hs => hs.map(x => x.id === patch.id ? { ...x, done_today: patch.done_today } : x));
    } else if (patch.type === 'reload') {
      onChange?.();
    }
  }), []);

  async function toggle(h) {
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

  function remove(h) {
    if (window.__archiveHabitConfirm) {
      window.__archiveHabitConfirm(h.id, h.name);
    } else {
      if (!confirm(`归档习惯「${h.name}」？`)) return;
      API.habits.archive(h.id).then(() => { store.broadcast({ type: 'reload' }); onChange?.(); load(); }).catch(e => toast.error(e.message));
    }
  }

  const done = habits.filter(h => h.done_today).length;

  function getHabitGrowthType(h) {
    return inferGrowthType(h);
  }

  function getDotColor(h) {
    const gt = getHabitGrowthType(h);
    return GROWTH_TYPES[gt]?.color || '#34c759';
  }

  function getBg(h) {
    // 勾选后背景保留原色，仅文字变灰+删除线
    const gt = getHabitGrowthType(h);
    return `linear-gradient(90deg,${GROWTH_TYPES[gt]?.bg || '#e5f6ea'} 0%,transparent 70%)`;
  }

  function getBorderColor(h) {
    // 勾选后边框保留原色
    const gt = getHabitGrowthType(h);
    return GROWTH_TYPES[gt]?.borderColor || '#8ee4a7';
  }

  function getDoneColor(h) {
    const gt = getHabitGrowthType(h);
    return GROWTH_TYPES[gt]?.doneColor || '#5dd57a';
  }

  function formatTime(h) {
    const st = h.start_time || h.target_time;
    const et = h.end_time;
    // 兜底：优先按 start/end 实时计算，避免 duration_min 脏数据
    const calcDur = calcDurationMin(st, et);
    const displayDur = calcDur != null ? calcDur : h.duration_min;
    if (!st && !et && !displayDur) return '全天';
    let txt = '';
    if (st && et) txt = `${st} – ${et}`;
    else if (st) txt = st;
    if (displayDur) txt += (txt ? ' · ' : '') + formatDuration(displayDur);
    else {
      const calc = minutesBetween(st, et);
      if (calc) txt += (txt ? ' · ' : '') + formatDuration(calc);
    }
    return txt;
  }

  // 按成长类型分组习惯（保持 API sort_order 顺序，不再按时间排序）
  const groupedHabits = { energy: [], mind: [], skill: [] };
  habits.forEach(h => {
    const gt = getHabitGrowthType(h);
    if (groupedHabits[gt]) groupedHabits[gt].push(h);
  });

  // 拖拽排序：组内拖拽，重排后全局持久化 sort_order
  function handleDragStart(e, h) {
    setDragId(h.id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(h.id));
  }

  function handleDragOver(e, overH) {
    if (!dragId) return;
    // 仅允许同组内拖拽
    const dragHabit = habits.find(h => h.id === dragId);
    if (!dragHabit || getHabitGrowthType(dragHabit) !== getHabitGrowthType(overH)) return;
    e.preventDefault();
    if (overId !== overH.id) setOverId(overH.id);
  }

  async function handleDrop(e, overH) {
    e.preventDefault();
    if (!dragId || dragId === overH.id) { setDragId(null); setOverId(null); return; }
    const dragHabit = habits.find(h => h.id === dragId);
    if (!dragHabit || getHabitGrowthType(dragHabit) !== getHabitGrowthType(overH)) {
      setDragId(null); setOverId(null); return;
    }
    // 前端乐观重排
    const next = [...habits];
    const fromIdx = next.findIndex(h => h.id === dragId);
    const toIdx = next.findIndex(h => h.id === overH.id);
    if (fromIdx === -1 || toIdx === -1) { setDragId(null); setOverId(null); return; }
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    setHabits(next);
    setDragId(null);
    setOverId(null);
    // 全局重算 sort_order：按 energy → mind → skill 拼接
    const grouped = { energy: [], mind: [], skill: [] };
    next.forEach(h => { const gt = getHabitGrowthType(h); if (grouped[gt]) grouped[gt].push(h); });
    const orderedIds = [...grouped.energy, ...grouped.mind, ...grouped.skill].map(h => h.id);
    try {
      await API.habits.reorder(orderedIds);
    } catch (e) { toast.error(e.message); }
  }

  function handleDragEnd() {
    setDragId(null);
    setOverId(null);
  }

  // 渲染习惯行
  function renderHabitRow(h) {
    const gt = getHabitGrowthType(h);
    const isDragging = dragId === h.id;
    const isDragOver = overId === h.id && dragId && dragId !== h.id;
    return (
      <div
        key={h.id}
        className="habit-row px-3 py-2 flex items-center gap-3 group"
        style={{
          background: getBg(h),
          opacity: isDragging ? 0.4 : 1,
          borderTop: isDragOver ? '2px solid #007aff' : '2px solid transparent',
          cursor: 'grab',
          transition: 'opacity .15s, border-top-color .15s',
        }}
        draggable
        onDragStart={(e) => handleDragStart(e, h)}
        onDragOver={(e) => handleDragOver(e, h)}
        onDrop={(e) => handleDrop(e, h)}
        onDragEnd={handleDragEnd}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          window.__showContextMenu?.(e.clientX, e.clientY, 'habit', h.id);
        }}
      >
        <input
          type="checkbox"
          className="cb-round"
          checked={!!h.done_today}
          onChange={() => {}}
          style={{ '--cb-color': getDoneColor(h), '--cb-border': h.done_today ? getDoneColor(h) : getBorderColor(h) }}
          onClick={(e) => { e.stopPropagation(); toggle(h); }}
        />
        <div className="flex-1 min-w-0">
          <p className={`text-[14px] font-medium ${h.done_today ? 'text-[#8e8e93] line-through' : 'text-[#1c1c1e]'}`}>{h.emoji} {h.name}</p>
          <p className={`text-[12px] mt-0.5 ${h.done_today ? 'text-[#aeaeae]' : 'text-[#8e8e93]'}`}>{formatTime(h)}</p>
        </div>
        <span
          className="w-2 h-2 rounded-full flex-shrink-0 self-center"
          style={{ background: getDotColor(h) }}
        ></span>
        <button
          onClick={(e) => { e.stopPropagation(); remove(h); }}
          className="opacity-0 group-hover:opacity-100 text-[#8e8e93] hover:text-[#ff3b30] text-xs px-1"
          title="删除"
        >×</button>
      </div>
    );
  }

  return (
    <div className="glass-card p-5 flex-1">
      <div className="flex items-center justify-between section-header">
        <div className="flex items-center gap-2">
          <span className="section-accent" style={{background:'#007aff'}}></span>
          <h3 className="section-title">习惯</h3>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-6 h-6">
            <svg viewBox="0 0 24 24" className="w-6 h-6 -rotate-90">
              <circle cx="12" cy="12" r="10" fill="none" stroke="#e5e5ea" strokeWidth="3"></circle>
              <circle
                cx="12" cy="12" r="10" fill="none"
                stroke="#007aff" strokeWidth="3" strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 10}
                strokeDashoffset={habits.length > 0 ? 2 * Math.PI * 10 * (1 - done / habits.length) : 2 * Math.PI * 10}
              ></circle>
            </svg>
          </div>
          <span className="section-sub">{done} / {habits.length}</span>
          <button
            onClick={() => { window.__openHabitModal && window.__openHabitModal(null); }}
            className="btn-secondary text-xs px-2 py-1"
            title="添加习惯"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4"></path></svg>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3 pt-3 px-1">
          <div className="sk-line" style={{width:'85%'}}></div>
          <div className="sk-line" style={{width:'78%'}}></div>
          <div className="sk-line" style={{width:'70%'}}></div>
          <div className="sk-line" style={{width:'80%'}}></div>
        </div>
      ) : habits.length === 0 ? (
        <div className="text-center py-6 text-sm text-[#8e8e93]">
          <div className="text-2xl mb-2">🎯</div>
          还没有习惯
        </div>
      ) : (
        <div className="space-y-1.5">
          {groupedHabits.energy.map(renderHabitRow)}
          {groupedHabits.mind.map(renderHabitRow)}
          {groupedHabits.skill.map(renderHabitRow)}
        </div>
      )}
    </div>
  );
}
