import { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { API } from '../api/client.js';
import { cachedLoad } from '../utils/date.js';
import { store } from '../utils/store.js';

export default function StatsBar({ date, range, view, refreshSignal, onViewChange, onNew, onSummary }) {
  const [rawData, setRawData] = useState({ schedules: [], tasks: [], habits: [] });
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const anchorRef = useRef(null);    // "新建"按钮容器,用于定位
  const portalRef = useRef(null);    // Portal 中下拉菜单的根节点,用于点击外部判定
  const inFlightRef = useRef(null);
  const cacheRef = useRef(new Map());

  // 按按钮位置刷新 Portal 下拉的 fixed 坐标
  const recalcPos = useCallback(() => {
    if (!anchorRef.current) return;
    const r = anchorRef.current.getBoundingClientRect();
    setMenuPos({ top: r.bottom + 6, left: r.left });
  }, []);

  // 打开时立即计算一次,并监听滚动/resize 实时更新
  useEffect(() => {
    if (!menuOpen) return;
    recalcPos();
    const opts = { capture: true, passive: true };
    window.addEventListener('scroll', recalcPos, opts);
    window.addEventListener('resize', recalcPos);
    return () => {
      window.removeEventListener('scroll', recalcPos, opts);
      window.removeEventListener('resize', recalcPos);
    };
  }, [menuOpen, recalcPos]);

  useEffect(() => {
    const cacheKey = `sb:${range.from}:${range.to}:${date}:${refreshSignal}`;
    setLoading(true);
    cachedLoad(cacheKey, async () => {
      const [sched, tasks, habits] = await Promise.all([
        API.schedules.list({ from: range.from, to: range.to }),
        API.tasks.list({ from: range.from, to: range.to }),
        API.habits.list({ date })
      ]);
      return { schedules: sched.schedules, tasks: tasks.tasks, habits: habits.habits };
    }, inFlightRef, cacheRef, 3000).then(data => {
      setRawData(data);
      setLoading(false);
    }).catch(e => { console.error(e); setLoading(false); });
  }, [date, range.from, range.to, view, refreshSignal]);

  // 订阅 patch：其他面板 toggle 时即时更新本地数据，无需重新 load
  useEffect(() => store.subscribe(patch => {
    if (patch.type === 'schedule' && patch.id !== undefined) {
      setRawData(prev => ({
        ...prev,
        schedules: prev.schedules.map(s => s.id === patch.id ? { ...s, is_done: patch.is_done } : s)
      }));
    } else if (patch.type === 'habit' && patch.id !== undefined) {
      setRawData(prev => ({
        ...prev,
        habits: prev.habits.map(h => h.id === patch.id ? { ...h, done_today: patch.done_today } : h)
      }));
    } else if (patch.type === 'task' && patch.id !== undefined) {
      setRawData(prev => ({
        ...prev,
        tasks: prev.tasks.map(t => t.id === patch.id ? { ...t, is_done: patch.is_done } : t)
      }));
    }
  }), []);

  // 点击外部关闭"新建"下拉
  useEffect(() => {
    if (!menuOpen) return;
    function onDocMouseDown(e) {
      const anchor = anchorRef.current;
      const pop = portalRef.current;
      if (anchor && anchor.contains(e.target)) return;         // 点到按钮区域交给按钮 onClick 处理
      if (pop && pop.contains(e.target)) return;               // 点到菜单自身不关闭
      setMenuOpen(false);
    }
    function onDocKey(e) { if (e.key === 'Escape') setMenuOpen(false); }
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onDocKey);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onDocKey);
    };
  }, [menuOpen]);

  // 基于本地数据计算统计
  const stats = (() => {
    const allSched = rawData.schedules;
    const allTasks = rawData.tasks;

    const schedDone = allSched.filter(s => s.is_done).length;
    const taskDone = allTasks.filter(t => t.is_done).length;
    const done = schedDone + taskDone;
    const total = allSched.length + allTasks.length;

    const focusSched = view === 'today'
      ? allSched.filter(s => s.date === date)
      : allSched;

    const isKeySched = (s) => {
      const c = Number(s.category);
      return c === 1 || c === 2 || s.is_key;
    };
    const isCat = (s, v) => Number(s.category) === v || (v === 1 && s.is_key && s.start_time && Number(s.start_time.split(':')[0]) <= 12 && !s.category);
    const catCount = (arr, v) => arr.filter(s => isCat(s, v)).length;
    const catDone = (arr, v) => arr.filter(s => isCat(s, v) && s.is_done).length;

    const schedHabitTotal = focusSched.filter(s => Number(s.category) === 4).length;
    const schedHabitDone = focusSched.filter(s => Number(s.category) === 4 && s.is_done).length;
    const habitTotal = rawData.habits.length + schedHabitTotal;
    const habitDone = rawData.habits.filter(h => h.done_today).length + schedHabitDone;

    const keyTotal = focusSched.filter(s => isKeySched(s)).length;
    const keyDone = focusSched.filter(s => isKeySched(s) && s.is_done).length;

    const todayTasks = view === 'today'
      ? allTasks.filter(t => t.date === date)
      : allTasks;
    const taskTotal = todayTasks.length;
    const taskDoneCount = todayTasks.filter(t => t.is_done).length;

    const urgentTodo = catCount(focusSched, 1) - catDone(focusSched, 1);
    const highTodo = catCount(focusSched, 2) - catDone(focusSched, 2);
    const normalTodo = (catCount(focusSched, 3) - catDone(focusSched, 3)) + (taskTotal - taskDoneCount);

    return {
      done, total,
      keyDone, keyTotal,
      habitDone, habitTotal,
      taskDone: taskDoneCount, taskTotal,
      urgent: urgentTodo,
      high: highTodo,
      normal: normalTodo
    };
  })();

  const pct = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;

  const MENU_ITEMS = [
    { k: 'schedule', label: '新建事项', icon: '📅' },
    { k: 'habit', label: '新建习惯', icon: '🎯' },
  ];

  return (
    <>
    <div className="glass-card px-5 py-3 flex items-center justify-between gap-4">
      <div className="flex items-center gap-5">
        <div className="tab-group">
          <button className={view === 'today' ? 'active' : ''} onClick={() => onViewChange('today')}>今日</button>
          <button className={view === 'week' ? 'active' : ''} onClick={() => onViewChange('week')}>本周</button>
          <button className={view === 'month' ? 'active' : ''} onClick={() => onViewChange('month')}>本月</button>
        </div>

        <div className="flex items-center gap-2">
          <div ref={anchorRef}>
            <button
              className="btn-secondary font-semibold flex items-center gap-1"
              onClick={() => setMenuOpen(v => !v)}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4"></path></svg>
              新建
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" style={{transition:'transform .15s', transform: menuOpen?'rotate(180deg)':'none'}}><path d="M6 9l6 6 6-6"></path></svg>
            </button>
          </div>
          <button className="btn-secondary font-semibold" onClick={onSummary}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
            总结
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-3 flex-1 max-w-[420px] justify-end">
          <div className="sk-line sk-bar rounded-full w-full" style={{maxWidth:'380px', height:'30px'}}></div>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-4 px-3 py-1.5 rounded-full" style={{background:'rgba(120,120,128,0.08)'}}>
            <div className="flex items-center gap-1.5">
              <span className="text-[12px] font-medium text-[#1c1c1e]">{stats.done}</span>
              <span className="text-[12px] font-medium text-[#1c1c1e]">/</span>
              <span className="text-[12px] font-medium text-[#1c1c1e]">{stats.total}</span>
              <div className="w-20 h-1.5 rounded-full ml-1" style={{background:'#e5e5ea'}}>
                <div className="h-full rounded-full transition-all" style={{width:`${pct}%`,background:'#007aff'}}></div>
              </div>
            </div>
            <div className="w-0.5 h-4 rounded-full" style={{background:'rgba(120,120,128,0.2)'}}></div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-[2px]" style={{background:'#ff3b30'}}></span>
                <span className="text-[12px] font-medium text-[#1c1c1e]">{stats.urgent}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-[2px]" style={{background:'#ff9500'}}></span>
                <span className="text-[12px] font-medium text-[#1c1c1e]">{stats.high}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full" style={{background:'#34c759'}}></span>
                <span className="text-[12px] font-medium text-[#1c1c1e]">{stats.habitDone} /{stats.habitTotal}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-[2px]" style={{background:'#8e8e93'}}></span>
                <span className="text-[12px] font-medium text-[#1c1c1e]">{stats.normal}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
    {menuOpen && typeof document !== 'undefined' && createPortal(
      <div
        ref={portalRef}
        style={{
          position: 'fixed',
          top: menuPos.top,
          left: menuPos.left,
          minWidth: '140px',
          background: '#fff',
          borderRadius: '10px',
          padding: '6px',
          boxShadow: '0 10px 30px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08)',
          border: '1px solid rgba(0,0,0,0.06)',
          zIndex: 2147483647,
          display: 'flex',
          flexDirection: 'column',
          gap: '2px'
        }}
      >
        {MENU_ITEMS.map(opt => (
          <div
            key={opt.k}
            onClick={() => { setMenuOpen(false); onNew(opt.k); }}
            style={{
              padding:'8px 12px',
              fontSize:'13px',
              color:'#1c1c1e',
              cursor:'pointer',
              borderRadius:'6px',
              display:'flex',
              alignItems:'center',
              gap:'8px'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,122,255,0.08)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <span style={{fontSize:'15px'}}>{opt.icon}</span>
            {opt.label}
          </div>
        ))}
      </div>,
      document.body
    )}
    </>
  );
}
