import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Clock, Pencil, X, Zap, Heart, Moon, Target,
} from 'lucide-react';
import { API } from '../api/client.js';
import { formatDuration, calcDurationMin, cachedLoad, cachePeek, loadingGate } from '../utils/date.js';
import { store } from '../utils/store.js';
import { GROWTH_TYPES, inferGrowthType } from '../utils/uiConstants.js';
import { useToast } from '../context/ToastContext.jsx';

// 精力状态（3档）
const ENERGY_STATES = [
  { value: 'energized', label: '充沛', color: '#34c759' },
  { value: 'normal',    label: '一般', color: '#007aff' },
  { value: 'poor',      label: '疲惫', color: '#ff3b30' },
];

// 心情状态（3档）
const MOOD_STATES = [
  { value: 'positive', label: '积极', color: '#34c759' },
  { value: 'neutral',  label: '平淡', color: '#007aff' },
  { value: 'negative', label: '消极', color: '#ff3b30' },
];

// 兼容旧 wake_state 的映射（数据迁移期间）
const LEGACY_WAKE_TO_ENERGY = {
  energized: 'energized',
  okay: 'normal',
  drowsy: 'poor',
  exhausted: 'poor',
};

function getEnergyMeta(v) {
  if (!v) return null;
  return ENERGY_STATES.find(s => s.value === v) || null;
}
function getMoodMeta(v) {
  if (!v) return null;
  return MOOD_STATES.find(s => s.value === v) || null;
}

// 判断是否为睡眠类习惯
function isSleepHabit(h) {
  return /睡/.test(h.name);
}

export default function HabitsPanel({ date, refreshSignal, onChange }) {
  const toast = useToast();
  const [habits, setHabits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dragId, setDragId] = useState(null);
  const [overId, setOverId] = useState(null);
  const [sleepPopover, setSleepPopover] = useState(null);
  const popoverRef = useRef(null);
  const inFlightRef = useRef(null);
  const cacheRef = useRef(new Map());

  useEffect(() => {
    if (!sleepPopover) return;
    function handleClick(e) {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setSleepPopover(null);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [sleepPopover]);

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

  // 打开睡眠记录弹窗（居中）
  function openSleepPopover(h) {
    setSleepPopover({
      habitId: h.id,
      habitName: h.name,
      emoji: h.emoji,
      sleepStart: h.sleep_start || '',
      sleepEnd: h.sleep_end || '',
      energyState: h.energy_state || (h.wake_state ? LEGACY_WAKE_TO_ENERGY[h.wake_state] || '' : ''),
      moodState: h.mood_state || '',
      sleepNote: h.sleep_note || '',
      targetMin: h.duration_min || 420,
    });
  }

  // 保存睡眠记录
  async function saveSleepLog() {
    if (!sleepPopover) return;
    const { habitId, sleepStart, sleepEnd, energyState, moodState, sleepNote } = sleepPopover;
    try {
      const r = await API.habits.logSleep(habitId, date, {
        sleep_start: sleepStart || null,
        sleep_end: sleepEnd || null,
        energy_state: energyState || null,
        mood_state: moodState || null,
        sleep_note: sleepNote || null,
      });
      setHabits(hs => hs.map(x => x.id === habitId ? {
        ...x,
        done_today: r.done,
        sleep_start: sleepStart || null,
        sleep_end: sleepEnd || null,
        energy_state: energyState || null,
        mood_state: moodState || null,
        wake_state: null,
        sleep_note: sleepNote || null,
        data_source: 'manual',
      } : x));
      store.broadcast({ type: 'habit', id: habitId, done_today: r.done ? 1 : 0 });
      setSleepPopover(null);
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
    const gt = getHabitGrowthType(h);
    return `linear-gradient(90deg,${GROWTH_TYPES[gt]?.bg || '#e5f6ea'} 0%,transparent 70%)`;
  }

  function getBorderColor(h) {
    const gt = getHabitGrowthType(h);
    return GROWTH_TYPES[gt]?.borderColor || '#8ee4a7';
  }

  function getDoneColor(h) {
    const gt = getHabitGrowthType(h);
    return GROWTH_TYPES[gt]?.doneColor || '#5dd57a';
  }

  function formatTime(h) {
    if (isSleepHabit(h)) {
      const st = h.start_time || h.target_time;
      const et = h.end_time;
      if (st && et) return `${st} – ${et}`;
      return st || '';
    }
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

  // 睡眠第三行信息
  function sleepThirdLine(h) {
    if (!isSleepHabit(h) || !h.sleep_start || !h.sleep_end) return null;
    const dur = calcDurationMin(h.sleep_start, h.sleep_end);
    const target = h.duration_min || 420;
    return { dur, target };
  }

  const groupedHabits = { energy: [], mind: [], skill: [] };
  habits.forEach(h => {
    const gt = getHabitGrowthType(h);
    if (groupedHabits[gt]) groupedHabits[gt].push(h);
  });

  function handleDragStart(e, h) {
    setDragId(h.id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(h.id));
  }

  function handleDragOver(e, overH) {
    if (!dragId) return;
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
    const next = [...habits];
    const fromIdx = next.findIndex(h => h.id === dragId);
    const toIdx = next.findIndex(h => h.id === overH.id);
    if (fromIdx === -1 || toIdx === -1) { setDragId(null); setOverId(null); return; }
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    setHabits(next);
    setDragId(null);
    setOverId(null);
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

  // 状态 Chip：只显示文字+图标（无线圈/背景填充）
  function StateChip({ icon, label, color }) {
    const Icon = icon;
    return (
      <span className="inline-flex items-center gap-1 text-[12.5px] font-medium" style={{ color }}>
        <Icon size={13} strokeWidth={2} />
        <span>{label}</span>
      </span>
    );
  }

  // 右侧统一按钮（只保留图标，无文字）
  function RightActionButton({ hasSleepData, onClick }) {
    return (
      <button
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#f2f2f7] border border-[#e5e5ea] hover:bg-[#e9e9ef] text-[#4a4a4f] transition-colors"
        title={hasSleepData ? '编辑睡眠记录' : '记录睡眠'}
      >
        <Pencil size={12.5} strokeWidth={2} />
      </button>
    );
  }

  function renderHabitRow(h) {
    const gt = getHabitGrowthType(h);
    const isDragging = dragId === h.id;
    const isDragOver = overId === h.id && dragId && dragId !== h.id;
    const isSleep = isSleepHabit(h);
    const hasSleepData = !!(isSleep && h.sleep_start && h.sleep_end);
    const energyMeta = getEnergyMeta(h.energy_state);
    const moodMeta = getMoodMeta(h.mood_state);
    const thirdLine = isSleep ? sleepThirdLine(h) : null;

    return (
      <div
        key={h.id}
        className="habit-row px-3 flex items-center gap-3 group py-2.5"
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

        {/* 文本区 */}
        <div className="flex-1 min-w-0">
          {/* 第一行：标题 */}
          <p className={`text-[14px] font-medium leading-tight ${h.done_today ? 'text-[#8e8e93] line-through' : 'text-[#1c1c1e]'}`}>
            {h.emoji} {h.name}
          </p>
          {/* 第二行：预设时间/目标 */}
          <p className={`text-[12px] mt-0.5 flex items-center gap-1 ${h.done_today ? 'text-[#aeaeae]' : 'text-[#8e8e93]'}`}>
            {isSleep ? (
              <>
                <Target size={12.5} strokeWidth={2} className="flex-shrink-0" />
                <span className="whitespace-nowrap">
                  {h.start_time || h.target_time} – {h.end_time} · {formatDuration(h.duration_min || 420)}
                </span>
              </>
            ) : formatTime(h)}
          </p>
          {/* 第三行：仅睡眠习惯且有实际数据 */}
          {isSleep && hasSleepData && thirdLine && (
            <>
              <div className="my-2 h-px bg-[#e5e5ea]" style={{ opacity: 0.8 }}></div>
              <div className="flex items-center gap-1.5 text-[12.5px] text-[#4a4a4f] w-full">
                <Clock size={13} strokeWidth={2} className="flex-shrink-0 text-[#8e8e93]" />
                <span className="whitespace-nowrap flex-shrink-0">
                  {h.sleep_start} – {h.sleep_end} · {formatDuration(thirdLine.dur)}
                </span>
                <span className="flex-shrink-0 text-[#c8c8cc]">·</span>
                {thirdLine.dur >= thirdLine.target ? (
                  <span className="text-[#34c759] whitespace-nowrap flex-shrink-0">达成目标</span>
                ) : (
                  <span className="text-[#ff9500] whitespace-nowrap flex-shrink-0">
                    差{formatDuration(thirdLine.target - thirdLine.dur)}
                  </span>
                )}
                <span className="flex-1"></span>
                <span className="inline-flex items-center gap-1.5 flex-shrink-0">
                  {energyMeta && <StateChip icon={Zap} label={energyMeta.label} color={energyMeta.color} />}
                  {moodMeta && (
                    <>
                      {energyMeta && <span className="text-[#ff3b30]">·</span>}
                      <StateChip icon={Heart} label={moodMeta.label} color={moodMeta.color} />
                    </>
                  )}
                </span>
              </div>
            </>
          )}
        </div>

        {/* 右侧操作：编辑按钮 + 小圆点 + 删除按钮 */}
        <span className="inline-flex items-center gap-2 flex-shrink-0 self-center">
          {isSleep && (
            <RightActionButton hasSleepData={hasSleepData} onClick={() => openSleepPopover(h)} />
          )}
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ background: getDotColor(h) }}
          ></span>
          <button
            onClick={(e) => { e.stopPropagation(); remove(h); }}
            className="opacity-0 group-hover:opacity-100 text-[#8e8e93] hover:text-[#ff3b30] text-xs px-1 flex-shrink-0"
            title="删除"
          >×</button>
        </span>
      </div>
    );
  }

  return (
    <>
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

    {/* 睡眠记录 Modal - 居中全屏 overlay */}
    {sleepPopover && typeof document !== 'undefined' && createPortal(
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center sleep-modal-overlay"
        style={{ background: 'rgba(0,0,0,0.35)' }}
        onClick={() => setSleepPopover(null)}
      >
        <div
          ref={popoverRef}
          className="bg-white rounded-2xl shadow-xl p-5 w-[440px] max-w-[92vw] popover-enter sleep-modal-dialog"
          onClick={(e) => e.stopPropagation()}
          style={{
            background: 'rgba(250,250,252,0.96)',
            backdropFilter: 'saturate(180%) blur(20px)',
          }}
        >
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-[16px] font-semibold text-[#1c1c1e] flex items-center gap-2">
              <Moon size={18} strokeWidth={1.75} className="text-[#007aff]" />
              <span>{sleepPopover.habitName} · 睡眠记录</span>
            </h3>
            <button
              onClick={() => setSleepPopover(null)}
              className="text-[#8e8e93] hover:text-[#1c1c1e] w-7 h-7 rounded-full hover:bg-[#f0f0f5] flex items-center justify-center transition-colors"
              title="关闭"
            >
              <X size={16} strokeWidth={2} />
            </button>
          </div>

          {/* 入睡 / 起床时间 */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-[13px] text-[#8e8e93] mb-1.5 block">入睡时间</label>
              <input
                type="time"
                value={sleepPopover.sleepStart}
                onChange={(e) => setSleepPopover(s => ({ ...s, sleepStart: e.target.value }))}
                className="w-full border border-[#e5e5ea] rounded-lg px-3 py-2 text-[14px] text-[#1c1c1e] focus:outline-none focus:border-[#007aff] bg-white"
              />
            </div>
            <div>
              <label className="text-[13px] text-[#8e8e93] mb-1.5 block">起床时间</label>
              <input
                type="time"
                value={sleepPopover.sleepEnd}
                onChange={(e) => setSleepPopover(s => ({ ...s, sleepEnd: e.target.value }))}
                className="w-full border border-[#e5e5ea] rounded-lg px-3 py-2 text-[14px] text-[#1c1c1e] focus:outline-none focus:border-[#007aff] bg-white"
              />
            </div>
          </div>

          {/* 实际睡眠时长预览 */}
          {sleepPopover.sleepStart && sleepPopover.sleepEnd && (
            <div className="mb-4 px-3 py-2 rounded-lg" style={{ background: '#f8f9fa' }}>
              {(() => {
                const dur = calcDurationMin(sleepPopover.sleepStart, sleepPopover.sleepEnd);
                if (dur == null) return null;
                const target = sleepPopover.targetMin;
                const met = dur >= target;
                return (
                  <p className="text-[13px] inline-flex items-center gap-1.5" style={{ color: met ? '#34c759' : '#ff9500' }}>
                    <Clock size={13} />
                    <span>实际睡眠 {formatDuration(dur)}</span>
                    {met ? <span>· 达标 ✅</span> : <span> · 差{formatDuration(target - dur)}</span>}
                  </p>
                );
              })()}
            </div>
          )}

          {/* 精力状态 */}
          <div className="mb-3">
            <label className="text-[13px] text-[#8e8e93] mb-2 block flex items-center gap-1.5">
              <Zap size={13} strokeWidth={2} className="text-[#ffcc00]" />
              醒后精力状态
            </label>
            <div className="grid grid-cols-3 gap-2">
              {ENERGY_STATES.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setSleepPopover(sp => ({ ...sp, energyState: sp.energyState === opt.value ? '' : opt.value }))}
                  data-energy={opt.value}
                  className="flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-[13px] font-medium border transition-all"
                  style={{
                    background: sleepPopover.energyState === opt.value ? `${opt.color}14` : '#fff',
                    borderColor: sleepPopover.energyState === opt.value ? opt.color : '#e5e5ea',
                    color: sleepPopover.energyState === opt.value ? opt.color : '#1c1c1e',
                  }}
                >
                  <Zap size={14} strokeWidth={2} />
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 心情状态 */}
          <div className="mb-4">
            <label className="text-[13px] text-[#8e8e93] mb-2 block flex items-center gap-1.5">
              <Heart size={13} strokeWidth={2} className="text-[#ff3b30]" />
              醒后心情状态
            </label>
            <div className="grid grid-cols-3 gap-2">
              {MOOD_STATES.map(s => (
                <button
                  key={s.value}
                  onClick={() => setSleepPopover(sp => ({ ...sp, moodState: sp.moodState === s.value ? '' : s.value }))}
                  className="flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-[13px] font-medium border transition-all"
                  style={{
                    background: sleepPopover.moodState === s.value ? `${s.color}14` : '#fff',
                    borderColor: sleepPopover.moodState === s.value ? s.color : '#e5e5ea',
                    color: sleepPopover.moodState === s.value ? s.color : '#1c1c1e',
                  }}
                >
                  <Heart size={14} strokeWidth={2} />
                  <span>{s.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 备注 */}
          <div className="mb-5">
            <label className="text-[13px] text-[#8e8e93] mb-1.5 block">备注（可选）</label>
            <textarea
              value={sleepPopover.sleepNote}
              onChange={(e) => setSleepPopover(s => ({ ...s, sleepNote: e.target.value }))}
              placeholder="例如：昨晚做梦了，中间醒了一次..."
              rows={2}
              className="w-full border border-[#e5e5ea] rounded-lg px-3 py-2 text-[13px] text-[#1c1c1e] focus:outline-none focus:border-[#007aff] resize-none bg-white"
            />
          </div>

          {/* 操作按钮 */}
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setSleepPopover(null)}
              className="px-4 py-2 rounded-lg text-[14px] text-[#8e8e93] hover:bg-[#e5e5ea] bg-[#f0f0f5]"
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
      </div>,
      document.body
    )}
    </>
  );
}
