import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Clock, Pencil, X, Zap, Heart, Moon, Target,
} from 'lucide-react';
import { API } from '../api/client.js';
import { formatDuration, calcDurationMin, cachedLoad, cachePeek, cacheClear, loadingGate } from '../utils/date.js';
import { store } from '../utils/store.js';
import { GROWTH_TYPES, inferGrowthType } from '../utils/uiConstants.js';
import { useToast } from '../context/ToastContext.jsx';

// 精力状态（3档）
// color: 弹窗按钮底色（iOS 系统色，保持原样）
// rowColor: 习惯行内 chip 文字色（比底色加深一档，与行内 12px 小字可读性对齐；
//           绿沿用既有 #2BAD5E，蓝/红按同 hue 加深，保持"文字一档深"统一处理）
const ENERGY_STATES = [
  { value: 'energized', label: '充沛', color: '#34C759', rowColor: '#2BAD5E' },
  { value: 'normal',    label: '一般', color: '#007AFF', rowColor: '#0068D6' },
  { value: 'poor',      label: '疲惫', color: '#FF3B30', rowColor: '#D70015' },
];

// 心情状态（3档）
const MOOD_STATES = [
  { value: 'positive', label: '积极', color: '#34C759', rowColor: '#2BAD5E' },
  { value: 'neutral',  label: '平淡', color: '#007AFF', rowColor: '#0068D6' },
  { value: 'negative', label: '消极', color: '#FF3B30', rowColor: '#D70015' },
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
  return /睡|作息|入睡|起床|就寝/.test(h.name);
}

export default function HabitsPanel({ date, refreshSignal, onChange }) {
  const toast = useToast();
  const [habits, setHabits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasData, setHasData] = useState(false);
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
    const cacheKey = `hp:${date}`;
    const CACHE_TTL = 120000;
    const peeked = cachePeek(cacheKey, cacheRef, CACHE_TTL);
    if (peeked) {
      setHabits(peeked.value);
      setHasData(true);
      cachedLoad(cacheKey, async () => {
        const r = await API.habits.list({ date });
        return r.habits;
      }, inFlightRef, cacheRef, CACHE_TTL).then(hs => {
        setHabits(hs);
      }).catch(() => {});
      return;
    }
    const gate = loadingGate(setLoading, hasData ? 120 : 0);
    gate.require();

    cachedLoad(cacheKey, async () => {
      const r = await API.habits.list({ date });
      return r.habits;
    }, inFlightRef, cacheRef, CACHE_TTL).then(hs => {
      setHabits(hs);
      setHasData(true);
      gate.done();
    }).catch(e => { console.error(e); gate.done(); });
  }

  useEffect(() => { load(); }, [date, refreshSignal]);

  useEffect(() => store.subscribe(patch => {
    if (patch.type === 'habit' && patch.id !== undefined) {
      setHabits(hs => hs.map(x => x.id === patch.id ? { ...x, done_today: patch.done_today } : x));
    } else if (patch.type === 'reload') {
      cacheClear(cacheRef, 'hp:');
      load();
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
      API.habits.archive(h.id).then(() => {
        cacheClear(cacheRef, 'hp:');
        store.broadcast({ type: 'reload' });
        onChange?.();
        load();
      }).catch(e => toast.error(e.message));
    }
  }

  // ==== 量化打卡 ====
  const [countLog, setCountLog] = useState(null); // { habitId, habitName, emoji, unit, addValue, note }
  const countLogRef = useRef(null);

  useEffect(() => {
    if (!countLog) return;
    function handleClick(e) {
      if (countLogRef.current && !countLogRef.current.contains(e.target)) {
        setCountLog(null);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [countLog]);

  function isCountHabit(h) {
    return h.target_mode === 'count' && h.target_value;
  }

  // 改造 toggle：count 模式走不同路径
  async function handleCheckin(h) {
    if (isCountHabit(h)) {
      // 已完成时取消打卡
      if (h.done_today) {
        const nextDone = 0;
        setHabits(hs => hs.map(x => x.id === h.id ? { ...x, done_today: nextDone, actual_value: 0 } : x));
        store.broadcast({ type: 'habit', id: h.id, done_today: nextDone });
        try {
          await API.habits.toggle(h.id, date, nextDone);
        } catch (e) {
          setHabits(hs => hs.map(x => x.id === h.id ? { ...x, done_today: h.done_today, actual_value: h.actual_value } : x));
          store.broadcast({ type: 'habit', id: h.id, done_today: h.done_today });
          toast.error(e.message);
        }
        return;
      }
      // 未完成：根据 auto_log 决定弹窗或静默 +1
      if (h.auto_log === false || h.auto_log === 0) {
        // 静默 +1
        try {
          const r = await API.habits.logCount(h.id, date, { add_value: 1, note: '' });
          setHabits(hs => hs.map(x => x.id === h.id ? { ...x, done_today: r.done ? 1 : 0, actual_value: r.actual_value } : x));
          store.broadcast({ type: 'habit', id: h.id, done_today: r.done ? 1 : 0 });
          if (r.done) toast.success('目标达成');
        } catch (e) { toast.error(e.message); }
      } else {
        // 弹出打卡日志
        setCountLog({
          habitId: h.id,
          habitName: h.name,
          emoji: h.emoji,
          unit: h.target_unit || '次',
          targetValue: Number(h.target_value) || 0,
          currentValue: Number(h.actual_value) || 0,
          addValue: 1,
          note: '',
        });
      }
    } else {
      // 普通 check 模式：沿用原逻辑
      toggle(h);
    }
  }

  async function saveCountLog() {
    if (!countLog) return;
    const { habitId, addValue, note } = countLog;
    try {
      const r = await API.habits.logCount(habitId, date, { add_value: addValue, note });
      setHabits(hs => hs.map(x => x.id === habitId ? { ...x, done_today: r.done ? 1 : 0, actual_value: r.actual_value, log_note: note || null } : x));
      store.broadcast({ type: 'habit', id: habitId, done_today: r.done ? 1 : 0 });
      setCountLog(null);
      if (r.done) toast.success('目标达成');
    } catch (e) {
      toast.error(e.message);
    }
  }

  const done = habits.filter(h => h.done_today).length;

  function getHabitGrowthType(h) {
    return inferGrowthType(h);
  }

  function getDotColor(h) {
    const gt = getHabitGrowthType(h);
    return GROWTH_TYPES[gt]?.color || '#34C759';
  }

  function getBg(h) {
    const gt = getHabitGrowthType(h);
    return `linear-gradient(90deg,${GROWTH_TYPES[gt]?.bg || '#e5f6ea'} 0%,transparent 70%)`;
  }

  function getBorderColor(h) {
    const gt = getHabitGrowthType(h);
    return GROWTH_TYPES[gt]?.borderColor || '#7ED6A0';
  }

  function getDoneColor(h) {
    const gt = getHabitGrowthType(h);
    return GROWTH_TYPES[gt]?.doneColor || '#34C759';
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
      <span className="inline-flex items-center gap-1 text-[12px] font-medium" style={{ color }}>
        <Icon size={12.5} />
        <span>{label}</span>
      </span>
    );
  }
  // 实心填充图标（lucide 只有线性描边，精力充沛/积极心情需要实心强调）
  const ZapFilled = ({ size = 12.5, color }) => (
    // 和本项目 lucide-react@1.31.0 弹窗充沛/一般/疲惫 ⚡完全同款（读取 Zap 源码 iconNode path 1:1），只把 fill=none 改成实心填充color
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color || 'currentColor'} xmlns="http://www.w3.org/2000/svg">
      <path d="M15.914 4a1.5 1.5 0 00-2.474-1.561l-9 9A1.5 1.5 0 005.5 14h4.002a.5.5 0 01.471.666L8.086 20a1.5 1.5 0 002.475 1.56l9-9A1.5 1.5 0 0018.5 10h-3.997a.5.5 0 01-.472-.667z"/>
    </svg>
  );
  const HeartFilled = ({ size = 12.5, color }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color || 'currentColor'} xmlns="http://www.w3.org/2000/svg"><path d="M12 21.35 10.55 20.03C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3 9.24 3 10.91 3.81 12 5.09 13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35Z"/></svg>
  );

  // 右侧铅笔按钮：无圆圈无填充，单纯图标，hover 高亮
  function RightActionButton({ hasSleepData, onClick }) {
    return (
      <button
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-[#8e8e93] hover:text-[#34C759] hover:bg-[rgba(52,199,89,0.10)] active:scale-[0.97] transition-colors"
        title={hasSleepData ? '编辑睡眠记录（实际睡眠 + 精力 + 心情）' : '点击记录昨晚入睡/起床 + 醒后精力、心情'}
      >
        <Pencil size={16} strokeWidth={2} />
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

    // 睡眠习惯：点击空白（非按钮/非复选框）也直接打开睡眠记录弹窗（用户找不到铅笔也能点）
    const rowClick = () => { if (isSleep) openSleepPopover(h); };

    return (
      <div
        key={h.id}
        className="habit-row px-3 flex items-center gap-3 group py-2.5"
        style={{
          background: getBg(h),
          opacity: isDragging ? 0.4 : 1,
          borderTop: isDragOver ? '2px solid #007AFF' : '2px solid transparent',
          cursor: isSleep ? 'pointer' : 'grab',
          transition: 'opacity .15s, border-top-color .15s',
        }}
        draggable
        onClick={rowClick}
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
          onClick={(e) => { e.stopPropagation(); handleCheckin(h); }}
        />

        {/* 文本区 */}
        <div className="flex-1 min-w-0">
          {/* 第一行：标题 */}
          <p className={`text-[14px] leading-tight ${h.done_today ? 'text-[#8e8e93] line-through' : 'text-[#1c1c1e]'}`}>
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
          {/* 量化打卡进度条 */}
          {isCountHabit(h) && (() => {
            const cur = Number(h.actual_value) || 0;
            const tgt = Number(h.target_value) || 1;
            const pct = Math.min(100, Math.round((cur / tgt) * 100));
            const unit = h.target_unit || '次';
            return (
              <div className="mt-1.5 flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full bg-[#e5e5ea] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${pct}%`,
                      background: pct >= 100 ? '#34C759' : getDoneColor(h),
                    }}
                  />
                </div>
                <span className={`text-[11px] font-medium whitespace-nowrap flex-shrink-0 ${h.done_today ? 'text-[#aeaeae]' : ''}`}
                  style={{ color: h.done_today ? undefined : (pct >= 100 ? '#34C759' : '#8e8e93') }}
                >
                  {cur} / {tgt}{unit}
                </span>
              </div>
            );
          })()}
          {/* 第三行：睡眠习惯
             · 有实际数据 → 显示 入睡-起床、时长、是否达标、精力/心情 chips（旧版功能）
             · 无实际数据 → 显示灰色引导：「点击 📝 或本行记录昨晚入睡/起床 + 精力/心情」，
               避免用户误以为这项功能丢了（与用户 Q2 对应）*/}
          {isSleep && (
            hasSleepData && thirdLine ? (
              <>
                <div className="my-2 h-px bg-[#e5e5ea]" style={{ opacity: 0.8 }}></div>
                <div className="flex items-center gap-1 text-[12px] text-[#4a4a4f] w-full">
                  <Clock size={12.5} strokeWidth={2} className="flex-shrink-0 text-[#8e8e93]" />
                  <span className="whitespace-nowrap flex-shrink-0">
                    实际 {h.sleep_start} – {h.sleep_end} · {formatDuration(thirdLine.dur)}
                  </span>
                  <span className="flex-shrink-0 text-[#c8c8cc]">·</span>
                  {thirdLine.dur >= thirdLine.target ? (
                    <span className="text-[#2BAD5E] whitespace-nowrap flex-shrink-0 font-medium">达标</span>
                  ) : (
                    <span className="text-[#FF9500] whitespace-nowrap flex-shrink-0 font-medium">
                      差{formatDuration(thirdLine.target - thirdLine.dur)}
                    </span>
                  )}
                  <span className="flex-1"></span>
                  <span className="inline-flex items-center gap-1 flex-shrink-0">
                    {energyMeta && <StateChip icon={ZapFilled} label={energyMeta.label} color={energyMeta.rowColor} />}
                    {moodMeta && energyMeta && (
                      <span className="text-[#c8c8cc]">·</span>
                    )}
                    {moodMeta && <StateChip icon={HeartFilled} label={moodMeta.label} color={moodMeta.rowColor} />}
                  </span>
                </div>
                {h.sleep_note && (
                  <p className="mt-1 text-[11px] text-[#8e8e93] whitespace-pre-wrap leading-snug">💭 {h.sleep_note}</p>
                )}
              </>
            ) : (
              <div className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-[8px]"
                style={{ background: 'rgba(120,120,128,0.08)', color: '#8e8e93' }}>
                <Pencil size={11} strokeWidth={2} />
                <span>点击记录实际睡眠时间和精力心情</span>
              </div>
            )
          )}
        </div>

        {/* 右侧：作息铅笔 + 分类色 dot */}
        <span className="inline-flex items-center gap-2 flex-shrink-0 self-center">
          {isSleep && (
            <RightActionButton hasSleepData={hasSleepData} onClick={() => openSleepPopover(h)} />
          )}
          <span
            className="w-2.5 h-2.5 rounded-full flex-shrink-0 ring-1 ring-white"
            style={{ background: getDotColor(h) }}
            title={`${GROWTH_TYPES[gt]?.label || '习惯'}模块`}
          ></span>
          <button
            onClick={(e) => { e.stopPropagation(); remove(h); }}
            className="opacity-0 group-hover:opacity-100 text-[#8e8e93] hover:text-[#FF3B30] text-xs px-1 flex-shrink-0"
            title="归档/删除该习惯"
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
          <span className="section-accent" style={{background:'#007AFF'}}></span>
          <h3 className="section-title">习惯</h3>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-6 h-6">
            <svg viewBox="0 0 24 24" className="w-6 h-6 -rotate-90">
              <circle cx="12" cy="12" r="10" fill="none" stroke="#e5e5ea" strokeWidth="3"></circle>
              <circle
                cx="12" cy="12" r="10" fill="none"
                stroke="#007AFF" strokeWidth="3" strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 10}
                strokeDashoffset={habits.length > 0 ? 2 * Math.PI * 10 * (1 - done / habits.length) : 2 * Math.PI * 10}
              ></circle>
            </svg>
          </div>
          <span className="text-[11px] font-semibold px-3 rounded-full inline-flex items-center h-[26px] tabular-nums" style={{ background: 'rgba(0,122,255,0.08)', color: '#007AFF' }}><span className="font-extrabold">{done}</span><span className="opacity-50 mx-0.5">/</span>{habits.length}</span>
          <button
            onClick={() => { window.__openHabitModal && window.__openHabitModal(null); }}
            className="inline-flex items-center justify-center rounded-lg text-xs w-[26px] h-[26px] transition hover:brightness-105 active:scale-[0.97] flex-shrink-0"
            style={{ background: 'rgba(0,122,255,0.06)', color: '#007AFF' }}
            title="添加习惯"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4"></path></svg>
          </button>
        </div>
      </div>

      {loading && !hasData ? (
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
              <Moon size={18} strokeWidth={1.75} className="text-[#007AFF]" />
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
                className="w-full border border-[#e5e5ea] rounded-lg px-3 py-2 text-[14px] text-[#1c1c1e] focus:outline-none focus:border-[#007AFF] bg-white"
              />
            </div>
            <div>
              <label className="text-[13px] text-[#8e8e93] mb-1.5 block">起床时间</label>
              <input
                type="time"
                value={sleepPopover.sleepEnd}
                onChange={(e) => setSleepPopover(s => ({ ...s, sleepEnd: e.target.value }))}
                className="w-full border border-[#e5e5ea] rounded-lg px-3 py-2 text-[14px] text-[#1c1c1e] focus:outline-none focus:border-[#007AFF] bg-white"
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
                  <p className="text-[13px] inline-flex items-center gap-1.5" style={{ color: met ? '#34C759' : '#FF9500' }}>
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
              <Heart size={13} strokeWidth={2} className="text-[#FF3B30]" />
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
              className="w-full border border-[#e5e5ea] rounded-lg px-3 py-2 text-[13px] text-[#1c1c1e] focus:outline-none focus:border-[#007AFF] resize-none bg-white"
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
              style={{ background: '#007AFF' }}
            >
              保存
            </button>
          </div>
        </div>
      </div>,
      document.body
    )}

    {/* 量化打卡日志 Modal - 居中 */}
    {countLog && typeof document !== 'undefined' && createPortal(
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center"
        style={{ background: 'rgba(0,0,0,0.35)' }}
        onClick={() => setCountLog(null)}
      >
        <div
          ref={countLogRef}
          className="bg-white rounded-2xl shadow-xl p-5 w-[380px] max-w-[92vw]"
          onClick={(e) => e.stopPropagation()}
          style={{
            background: 'rgba(250,250,252,0.96)',
            backdropFilter: 'saturate(180%) blur(20px)',
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[16px] font-semibold text-[#1c1c1e] flex items-center gap-2">
              <span className="text-[18px]">{countLog.emoji}</span>
              <span>{countLog.habitName}</span>
            </h3>
            <button
              onClick={() => setCountLog(null)}
              className="text-[#8e8e93] hover:text-[#1c1c1e] w-7 h-7 rounded-full hover:bg-[#f0f0f5] flex items-center justify-center transition-colors"
            >
              <X size={16} strokeWidth={2} />
            </button>
          </div>

          {/* 当前进度 */}
          <div className="mb-4 px-3 py-2 rounded-lg" style={{ background: '#f8f9fa' }}>
            {(() => {
              const newVal = (countLog.currentValue || 0) + (Number(countLog.addValue) || 0);
              const pct = Math.min(100, Math.round((newVal / (countLog.targetValue || 1)) * 100));
              return (
                <>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[12px] text-[#8e8e93]">当前进度</span>
                    <span className="text-[12px] font-medium" style={{ color: pct >= 100 ? '#34C759' : '#1c1c1e' }}>
                      {countLog.currentValue} → {newVal} / {countLog.targetValue}{countLog.unit}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[#e5e5ea] overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-300"
                      style={{ width: `${pct}%`, background: pct >= 100 ? '#34C759' : '#007AFF' }}
                    />
                  </div>
                </>
              );
            })()}
          </div>

          {/* 本次记录量 */}
          <div className="mb-3">
            <label className="text-[13px] text-[#8e8e93] mb-1.5 block">
              本次记录（{countLog.unit}）
            </label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCountLog(s => ({ ...s, addValue: Math.max(0.5, (Number(s.addValue) || 1) - 1) }))}
                className="w-9 h-9 rounded-lg border border-[#e5e5ea] bg-white text-[#1c1c1e] text-lg font-medium hover:bg-[#f0f0f5] transition-colors flex items-center justify-center"
              >−</button>
              <input
                type="number"
                min="0"
                step="1"
                value={countLog.addValue}
                onChange={(e) => setCountLog(s => ({ ...s, addValue: e.target.value }))}
                className="flex-1 border border-[#e5e5ea] rounded-lg px-3 py-2 text-[14px] text-center text-[#1c1c1e] focus:outline-none focus:border-[#007AFF] bg-white"
              />
              <button
                onClick={() => setCountLog(s => ({ ...s, addValue: (Number(s.addValue) || 0) + 1 }))}
                className="w-9 h-9 rounded-lg border border-[#e5e5ea] bg-white text-[#1c1c1e] text-lg font-medium hover:bg-[#f0f0f5] transition-colors flex items-center justify-center"
              >+</button>
            </div>
          </div>

          {/* 打卡备注 */}
          <div className="mb-5">
            <label className="text-[13px] text-[#8e8e93] mb-1.5 block">打卡备注（可选）</label>
            <textarea
              value={countLog.note}
              onChange={(e) => setCountLog(s => ({ ...s, note: e.target.value }))}
              placeholder="记录本次打卡的感受或细节..."
              rows={3}
              className="w-full border border-[#e5e5ea] rounded-lg px-3 py-2 text-[13px] text-[#1c1c1e] focus:outline-none focus:border-[#007AFF] resize-none bg-white"
            />
          </div>

          {/* 操作按钮 */}
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setCountLog(null)}
              className="px-4 py-2 rounded-lg text-[14px] text-[#8e8e93] hover:bg-[#e5e5ea] bg-[#f0f0f5]"
            >
              取消
            </button>
            <button
              onClick={saveCountLog}
              className="px-4 py-2 rounded-lg text-[14px] text-white font-medium"
              style={{ background: '#007AFF' }}
            >
              保存记录
            </button>
          </div>
        </div>
      </div>,
      document.body
    )}
    </>
  );
}
