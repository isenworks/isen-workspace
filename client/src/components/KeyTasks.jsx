import { useEffect, useState } from 'react';
import { API } from '../api/client.js';
import { formatDuration, fromISODate } from '../utils/date.js';
import { store } from '../utils/store.js';
import { useToast } from '../context/ToastContext.jsx';
import { inferGrowthType, GROWTH_TYPES } from '../utils/uiConstants.js';

const weekLabels = ['日', '一', '二', '三', '四', '五', '六'];

function dateLabel(dateStr) {
  const d = fromISODate(dateStr);
  return `${d.getMonth() + 1}月${d.getDate()}日 周${weekLabels[d.getDay()]}`;
}

// category: 1=重要紧急(红), 2=重要不紧急(琥珀), 3=常规(灰), 4=习惯(绿)
// cat=4 的习惯类日程不展示在重点事项，独立习惯统一由 HabitsPanel 管理，避免重复
function isDisplayInKeyTasks(s) {
  return catOf(s) !== 4;
}
function catOf(s) {
  const cat = Number(s.category);
  if (cat === 1) return 1;
  if (cat === 2) return 2;
  if (cat === 3) return 3;
  if (cat === 4) return 4;
  // 旧数据兼容：无 category 按 is_key + 时间段推
  if (s.is_key) {
    const st = s.start_time;
    if (st && Number(st.split(':')[0]) <= 12) return 1;
    return 2;
  }
  return 3;
}

export default function KeyTasks({ date, view, range, refreshSignal, onEdit, onNew, onChange }) {
  const toast = useToast();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  // sortBy: priority(按重要性) | time(按时间顺序)。默认按重要性
  const [sortBy, setSortBy] = useState('priority');

  async function load() {
    setLoading(true);
    try {
      const r = await API.schedules.list({ from: range.from, to: range.to });
      // 重点事项面板：除 category=4（习惯独立面板）之外的全部日程，按日期+时间排序
      const key = r.schedules
        .filter(s => isDisplayInKeyTasks(s))
        .sort((a, b) => {
          if (a.date !== b.date) return a.date.localeCompare(b.date);
          return (a.start_time || '99').localeCompare(b.start_time || '99');
        });
      setList(key);
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  useEffect(() => { load(); }, [range.from, range.to, refreshSignal]);

  // 订阅 patch：其他面板 toggle 时即时同步，无需重新 load
  useEffect(() => store.subscribe(patch => {
    if (patch.type === 'schedule' && patch.id !== undefined) {
      setList(ls => ls.map(x => x.id === patch.id ? { ...x, is_done: patch.is_done } : x));
    } else if (patch.type === 'reload') {
      onChange?.();
    }
  }), []);

  async function toggle(s) {
    const nextDone = s.is_done ? 0 : 1;
    setList(ls => ls.map(x => x.id === s.id ? { ...x, is_done: nextDone } : x));
    store.broadcast({ type: 'schedule', id: s.id, is_done: nextDone });
    try {
      await API.schedules.update(s.id, { is_done: nextDone });
    } catch (e) {
      setList(ls => ls.map(x => x.id === s.id ? { ...x, is_done: s.is_done } : x));
      store.broadcast({ type: 'schedule', id: s.id, is_done: s.is_done });
      toast.error(e.message);
    }
  }

  function remove(s) {
    if (window.__deleteScheduleConfirm) {
      window.__deleteScheduleConfirm(s.id, s.title);
    } else {
      if (!confirm(`删除「${s.title}」？`)) return;
      API.schedules.remove(s.id).then(() => { store.broadcast({ type: 'reload' }); onChange?.(); load(); }).catch(e => toast.error(e.message));
    }
  }

  const done = list.filter(s => s.is_done).length;

  // ====== 排序函数 ======
  function sortByPriority(items) {
    return [...items].sort((a, b) => {
      // 1) 重要性：1(重要紧急) < 2(重要不紧急) < 3(常规)
      //    未完成优先，已完成排后面
      const doneA = a.is_done ? 1 : 0;
      const doneB = b.is_done ? 1 : 0;
      if (doneA !== doneB) return doneA - doneB;
      const catA = catOf(a);
      const catB = catOf(b);
      if (catA !== catB) return catA - catB;
      // 2) 同重要性：按 start_time 升序(无时间排后面)
      const ta = a.start_time || '99:99';
      const tb = b.start_time || '99:99';
      if (ta !== tb) return ta.localeCompare(tb);
      // 3) 稳定兜底：ID 排序（id 可能是数字或字符串，统一转字符串）
      return String(a.id ?? '').localeCompare(String(b.id ?? ''));
    });
  }
  function sortByTime(items) {
    return [...items].sort((a, b) => {
      const ta = a.start_time || '99:99';
      const tb = b.start_time || '99:99';
      if (ta !== tb) return ta.localeCompare(tb);
      const catA = catOf(a);
      const catB = catOf(b);
      if (catA !== catB) return catA - catB;
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
    if (s.is_done) {
      return {
        bg: 'linear-gradient(90deg,#f2f2f7 0%,transparent 70%)',
        borderColor: '#c7c7cc',
        dotColor: '#8e8e93',
        doneColor: '#8e8e93'
      };
    }
    const cat = catOf(s);
    if (cat === 1) {
      return {
        bg: 'linear-gradient(90deg,#ffe8e8 0%,transparent 70%)',
        borderColor: '#ff6b64',
        dotColor: '#ff3b30',
        doneColor: '#ff6b64'
      };
    }
    if (cat === 2) {
      return {
        bg: 'linear-gradient(90deg,#fff4d8 0%,transparent 70%)',
        borderColor: '#ffa635',
        dotColor: '#ff9500',
        doneColor: '#ffa635'
      };
    }
    // 习惯（cat=4）按成长类型分色
    if (cat === 4) {
      const gt = inferGrowthType(s);
      const def = GROWTH_TYPES[gt] || GROWTH_TYPES.energy;
      return {
        bg: `linear-gradient(90deg,${def.bg || '#e5f6ea'} 0%,transparent 70%)`,
        borderColor: def.borderColor || '#5dd57a',
        dotColor: def.color || '#34c759',
        doneColor: def.borderColor || '#5dd57a'
      };
    }
    // 常规
    return {
      bg: 'linear-gradient(90deg,#f2f2f7 0%,transparent 70%)',
      borderColor: '#a6a6ad',
      dotColor: '#8e8e93',
      doneColor: '#a6a6ad'
    };
  }

  function formatTime(s) {
    if (!s.start_time) return '';
    let txt = s.start_time;
    if (s.end_time) txt += ' – ' + s.end_time;
    if (s.duration_min) txt += ' · ' + formatDuration(s.duration_min);
    return txt;
  }

  // 渲染单条 item
  function renderItem(s) {
    const st = getStyle(s);
    const cat = catOf(s);
    const isHabitSchedule = cat === 4;
    const cbClass = isHabitSchedule ? 'cb-round' : 'cb-square';
    return (
      <div
        key={s.id}
        className={`task-row rounded-xl px-3 py-2.5 flex items-center gap-3 group ${isHabitSchedule ? 'habit-row' : ''}`}
        style={{background: st.bg}}
        onClick={() => {
          if (isHabitSchedule) return;
          onEdit?.(s);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          window.__showContextMenu?.(e.clientX, e.clientY, 'schedule', s.id);
        }}
      >
        <input
          type="checkbox"
          className={cbClass}
          checked={!!s.is_done}
          onChange={() => {}}
          style={{ '--cb-color': st.doneColor, '--cb-border': s.is_done ? st.doneColor : st.borderColor }}
          onClick={(e) => { e.stopPropagation(); toggle(s); }}
        />
        <div className="flex-1 min-w-0">
          <p className={`text-[14px] font-medium ${s.is_done ? 'text-[#8e8e93] line-through' : 'text-[#1c1c1e]'}`}>{s.title}</p>
          <p className={`text-[12px] mt-0.5 ${s.is_done ? 'text-[#aeaeae]' : 'text-[#8e8e93]'}`}>{formatTime(s)}</p>
        </div>
        {/* 小圆点始终保留原色 */}
        <span className={`w-2 h-2 flex-shrink-0 self-center ${isHabitSchedule ? 'rounded-full' : 'rounded-[2px]'}`} style={{background: st.dotColor}}></span>
        <button
          onClick={(e) => { e.stopPropagation(); remove(s); }}
          className="opacity-0 group-hover:opacity-100 text-[#8e8e93] hover:text-[#ff3b30] text-xs px-1"
          title="删除"
        >×</button>
      </div>
    );
  }

  // 标题
  const titleText = view === 'today'
    ? '重点事项'
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
        <div className="text-center py-6 text-sm text-[#8e8e93]">
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
                <div className="w-2 h-2 rounded-[2px] bg-[#1c1c1e] shrink-0"></div>
                <p className="text-[13px] font-semibold text-[#1c1c1e]">{dateLabel(d)}</p>
                <span className="text-[11px] text-[#8e8e93]">{items.length} 项 · 已完成 {dDone}</span>
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

  // === Today 视图：所有事项按 sortBy 控制排序，默认按重要性(重要紧急→重要不紧急→常规) ===
  function renderTodayView() {
    const todayList = list.filter(s => s.date === date);
    if (todayList.length === 0) {
      return (
        <div className="text-center py-6 text-sm text-[#8e8e93]">
          <div className="text-2xl mb-2">📋</div>
          还没有事项
        </div>
      );
    }
    const sorted = applySort(todayList);
    return (
      <div className="space-y-1.5">
        {sorted.map(renderItem)}
      </div>
    );
  }

  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between section-header">
        <div className="flex items-center gap-2">
          <span className="section-accent" style={{background:'#007aff'}}></span>
          <h3 className="section-title">{titleText}</h3>
          {/* 排序切换按钮：重要性(三色横线) / 时间(三条递减灰线)，去容器化图标按钮 */}
          <button
            onClick={() => setSortBy(sortBy === 'priority' ? 'time' : 'priority')}
            className="w-7 h-7 flex items-center justify-center rounded-[10px] text-[#8e8e93] hover:bg-[rgba(120,120,128,0.06)] active:bg-[rgba(120,120,128,0.12)] transition-colors"
            title={sortBy === 'priority' ? '按重要性排序（点击切换为按时间）' : '按时间排序（点击切换为按重要性）'}
            aria-label={sortBy === 'priority' ? '按重要性排序' : '按时间排序'}
          >
            {sortBy === 'priority' ? (
              <svg className="w-[15px] h-[15px]" viewBox="0 0 14 14" fill="none">
                <rect x="1.5" y="2" width="11" height="2.2" rx="1.1" fill="#ff3b30"/>
                <rect x="1.5" y="5.9" width="11" height="2.2" rx="1.1" fill="#ff9500"/>
                <rect x="1.5" y="9.8" width="11" height="2.2" rx="1.1" fill="#c7c7cc"/>
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
        <div className="flex items-center gap-2">
          <div className="relative w-6 h-6">
            <svg viewBox="0 0 24 24" className="w-6 h-6 -rotate-90">
              <circle cx="12" cy="12" r={radius} fill="none" stroke="#e5e5ea" strokeWidth="3"></circle>
              <circle
                cx="12" cy="12" r={radius} fill="none"
                stroke="#007aff" strokeWidth="3" strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
              ></circle>
            </svg>
          </div>
          <span className="text-[12px] font-medium text-[#1c1c1e]">{done} / {list.length}</span>
          <button onClick={onNew} className="btn-secondary text-xs px-2 py-1" title="添加">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4"></path></svg>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3 pt-3 px-1">
          <div className="sk-line" style={{width:'88%'}}></div>
          <div className="sk-line" style={{width:'72%'}}></div>
          <div className="sk-line" style={{width:'82%'}}></div>
          <div className="sk-line" style={{width:'60%'}}></div>
        </div>
      ) : (
        view === 'today' ? renderTodayView() : renderGroupedView()
      )}
    </div>
  );
}
