import { useEffect, useRef, useState } from 'react';
import { API } from '../api/client.js';
import { formatDuration, calcDurationMin, cachedLoad, cachePeek, loadingGate } from '../utils/date.js';
import { store } from '../utils/store.js';
import { GROWTH_TYPES, inferGrowthType } from '../utils/uiConstants.js';
import { useToast } from '../context/ToastContext.jsx';

// 醒后状态选项
const WAKE_STATES = [
  { value: 'energized',  label: '精神饱满', emoji: '😊', color: '#34c759' },
  { value: 'okay',       label: '状态一般', emoji: '😐', color: '#007aff' },
  { value: 'drowsy',     label: '有些犯困', emoji: '😴', color: '#ffcc00' },
  { value: 'exhausted',  label: '非常疲惫', emoji: '😵', color: '#ff3b30' },
];

// 判断是否为睡眠类习惯
function isSleepHabit(h) {
  return /睡/.test(h.name);
}

export default function HabitsPanel({ date, refreshSignal, onChange }) {
  const toast = useToast();
  const [habits, setHabits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dragId, setDragId] = useState(null);       // 正在拖拽的 habit id
  const [overId, setOverId] = useState(null);       // 拖拽悬停的目标 habit id
  const [sleepModal, setSleepModal] = useState(null); // { habitId, habitName, sleepStart, sleepEnd, wakeState, sleepNote, targetMin }
  const inFlightRef = useRef(null);
  const cacheRef = useRef(new Map());

  function load() {
    const cacheKey = `hp:${date}:${refreshSignal}`;
    const CACHE_TTL = 1000;
    const peeked = cachePeek(cacheKey, cacheRef, CACHE_TTL);
    if (peeked) {
      setHabits(peeked.value);
      setLoading(false);
      return;
    }
    const hasData = habits.length > 0;
    const inFlight = inFlightRef.current && inFlightRef.current.key === cacheKey;
    const gate = loadingGate(setLoading, 80);
    if (!hasData && !inFlight) gate.require();

    cachedLoad(cacheKey, async () => {
      const r = await API.habits.list({ date });
      return r.habits;
    }, inFlightRef, cacheRef, CACHE_TTL).then(hs => {
      setHabits(hs);
      gate.done();
    }).catch(e => { console.error(e); gate.done(); });
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

  // 打开睡眠记录弹窗
  function openSleepModal(h) {
    setSleepModal({
      habitId: h.id,
      habitName: h.name,
      sleepStart: h.sleep_start || '',
      sleepEnd: h.sleep_end || '',
      wakeState: h.wake_state || '',
      sleepNote: h.sleep_note || '',
      targetMin: h.duration_min || 420,
    });
  }

  // 保存睡眠记录
  async function saveSleepLog() {
    if (!sleepModal) return;
    const { habitId, sleepStart, sleepEnd, wakeState, sleepNote } = sleepModal;
    try {
      const r = await API.habits.logSleep(habitId, date, {
        sleep_start: sleepStart || null,
        sleep_end: sleepEnd || null,
        wake_state: wakeState || null,
        sleep_note: sleepNote || null,
      });
      // 更新本地状态
      setHabits(hs => hs.map(x => x.id === habitId ? {
        ...x,
        done_today: r.done,
        sleep_start: sleepStart || null,
        sleep_end: sleepEnd || null,
        wake_state: wakeState || null,
        sleep_note: sleepNote || null,
        data_source: 'manual',
      } : x));
      store.broadcast({ type: 'habit', id: habitId, done_today: r.done ? 1 : 0 });
      setSleepModal(null);
      toast.success(r.done ? '睡眠达标，已自动打勾' : '已记录睡眠');
    } catch (e) {
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
    // 睡眠习惯且有实际记录：展示实际睡眠数据
    if (isSleepHabit(h) && h.sleep_start && h.sleep_end) {
      const dur = calcDurationMin(h.sleep_start, h.sleep_end);
      const target = h.duration_min || 420;
      const ws = WAKE_STATES.find(w => w.value === h.wake_state);
      let txt = `${h.sleep_start} – ${h.sleep_end}`;
      if (dur != null) {
        txt += ' · ' + formatDuration(dur);
        if (dur >= target) txt += ' ✅';
        else txt += ` · 差${formatDuration(target - dur)}`;
      }
      if (ws) txt += ` · ${ws.emoji}${ws.label}`;
      return txt;
    }
    // 睡眠习惯无记录：展示目标
    if (isSleepHabit(h) && h.duration_min) {
      const st = h.start_time || h.target_time;
      const et = h.end_time;
      let txt = '';
      if (st && et) txt = `${st} – ${et}`;
      else if (st) txt = st;
      if (txt) txt += ' · ';
      txt += `目标${formatDuration(h.duration_min)}`;
      return txt;
    }
    // 其他习惯：原逻辑
    const st = h.start_time || h.target_time;
    const et = h.end_time;
    const calcDur = calcDurationMin(st, et);
    const displayDur = calcDur != null ? calcDur : h.duration_min;
    if (!st && !et && !displayDur) return '全天';
    let txt = '';
    if (st && et) txt = `${st} – ${et}`;
    else if (st) txt = st;
    if (displayDur) txt += (txt ? ' · ' : '') + formatDuration(displayDur);
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
    const isSleep = isSleepHabit(h);
    const hasSleepData = isSleep && h.sleep_start && h.sleep_end;
    return (
      <div
        key={h.id}
        className="habit-row px-3 py-1.5 flex items-center gap-3 group"
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
        {isSleep && (
          <button
            onClick={(e) => { e.stopPropagation(); openSleepModal(h); }}
            className="text-[11px] px-2 py-0.5 rounded-md flex-shrink-0 self-center transition-all"
            style={{
              background: hasSleepData ? 'transparent' : '#f0f0f5',
              color: hasSleepData ? (WAKE_STATES.find(w => w.value === h.wake_state)?.color || '#8e8e93') : '#8e8e93',
              border: hasSleepData ? `1px solid ${WAKE_STATES.find(w => w.value === h.wake_state)?.color || '#d0d0d5'}40` : '1px solid transparent',
            }}
            title="记录睡眠"
          >
            {hasSleepData ? (WAKE_STATES.find(w => w.value === h.wake_state)?.emoji || '🌙') : '🌙 记录'}
          </button>
        )}
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

      {/* 睡眠记录弹窗 */}
      {sleepModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.35)' }}
          onClick={() => setSleepModal(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl p-5 w-[340px] max-w-[90vw]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[16px] font-semibold text-[#1c1c1e]">😴 {sleepModal.habitName}记录</h3>
              <span className="text-[12px] text-[#8e8e93]">{date}</span>
            </div>

            {/* 入睡/起床时间 */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="text-[12px] text-[#8e8e93] mb-1 block">🛏 入睡时间</label>
                <input
                  type="time"
                  value={sleepModal.sleepStart}
                  onChange={(e) => setSleepModal(s => ({ ...s, sleepStart: e.target.value }))}
                  className="w-full border border-[#e5e5ea] rounded-lg px-3 py-2 text-[14px] text-[#1c1c1e] focus:outline-none focus:border-[#007aff]"
                />
              </div>
              <div>
                <label className="text-[12px] text-[#8e8e93] mb-1 block">⏰ 起床时间</label>
                <input
                  type="time"
                  value={sleepModal.sleepEnd}
                  onChange={(e) => setSleepModal(s => ({ ...s, sleepEnd: e.target.value }))}
                  className="w-full border border-[#e5e5ea] rounded-lg px-3 py-2 text-[14px] text-[#1c1c1e] focus:outline-none focus:border-[#007aff]"
                />
              </div>
            </div>

            {/* 实际睡眠时长预览 */}
            {sleepModal.sleepStart && sleepModal.sleepEnd && (
              <div className="mb-4 px-3 py-2 rounded-lg" style={{ background: '#f8f9fa' }}>
                {(() => {
                  const dur = calcDurationMin(sleepModal.sleepStart, sleepModal.sleepEnd);
                  if (dur == null) return null;
                  const target = sleepModal.targetMin;
                  const met = dur >= target;
                  return (
                    <p className="text-[13px]" style={{ color: met ? '#34c759' : '#ff9500' }}>
                      📊 实际睡眠 {formatDuration(dur)}
                      {met ? ' ✅ 达标' : ` · 差${formatDuration(target - dur)}`}
                    </p>
                  );
                })()}
              </div>
            )}

            {/* 醒后状态 */}
            <div className="mb-4">
              <label className="text-[12px] text-[#8e8e93] mb-2 block">醒后状态</label>
              <div className="grid grid-cols-2 gap-2">
                {WAKE_STATES.map(ws => (
                  <button
                    key={ws.value}
                    onClick={() => setSleepModal(s => ({ ...s, wakeState: s.wakeState === ws.value ? '' : ws.value }))}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] transition-all"
                    style={{
                      background: sleepModal.wakeState === ws.value ? `${ws.color}15` : '#f8f9fa',
                      border: sleepModal.wakeState === ws.value ? `1.5px solid ${ws.color}` : '1.5px solid transparent',
                      color: sleepModal.wakeState === ws.value ? ws.color : '#1c1c1e',
                    }}
                  >
                    <span className="text-[16px]">{ws.emoji}</span>
                    <span>{ws.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 备注 */}
            <div className="mb-4">
              <label className="text-[12px] text-[#8e8e93] mb-1 block">备注</label>
              <textarea
                value={sleepModal.sleepNote}
                onChange={(e) => setSleepModal(s => ({ ...s, sleepNote: e.target.value }))}
                placeholder="昨晚做梦了，中间醒了一次..."
                rows={2}
                className="w-full border border-[#e5e5ea] rounded-lg px-3 py-2 text-[13px] text-[#1c1c1e] focus:outline-none focus:border-[#007aff] resize-none"
              />
            </div>

            {/* 操作按钮 */}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setSleepModal(null)}
                className="px-4 py-2 rounded-lg text-[14px] text-[#8e8e93] hover:bg-[#f0f0f5]"
              >
                取消
              </button>
              <button
                onClick={saveSleepLog}
                className="px-4 py-2 rounded-lg text-[14px] text-white font-medium"
                style={{ background: '#007aff' }}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
