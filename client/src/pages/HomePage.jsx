import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useEnergyHabits, usePersistentState } from '../components/annual/hooks.js';
import { API } from '../api/client.js';
import { formatChineseDate, today as getToday, toISODate, addDaysISO, startOfWeek, endOfWeek } from '../utils/date.js';

/* ============ 小工具 ============ */
const pct = (v, t) => (Number(t) > 0 ? Math.max(0, Math.min(100, Math.round((Number(v) / Number(t)) * 100))) : 0);
const modColor = (k) => `var(--m-${k})`;
const modRgba = (k, a) => `rgba(var(--m-${k}-rgb),${a})`;

/* Hero 渐变预设：Apple 系统色 · 相邻色相，中段不脏 */
const HERO_GRADIENTS = {
  A: { name: '晴空',   css: 'linear-gradient(135deg, #007AFF 0%, #5AC8FA 100%)', shadow: 'rgba(0,122,255,0.28)' },
  B: { name: '晨曦',   css: 'linear-gradient(135deg, #5856D6 0%, #007AFF 100%)', shadow: 'rgba(88,86,214,0.28)' },
  C: { name: '碧波',   css: 'linear-gradient(135deg, #00C7BE 0%, #007AFF 100%)', shadow: 'rgba(0,122,255,0.24)' },
  D: { name: '朝霞',   css: 'linear-gradient(135deg, #FF9500 0%, #FF6B35 100%)', shadow: 'rgba(255,149,0,0.28)' },
  E: { name: '薰衣草', css: 'linear-gradient(135deg, #AF52DE 0%, #5856D6 100%)', shadow: 'rgba(175,82,222,0.28)' },
};

/* 卡片头：模块色竖条 + 标题 + 右侧查看更多 */
function CardHead({ moduleKey, title, sub, onClick, more = '查看' }) {
  const color = moduleKey ? modColor(moduleKey) : 'var(--s-main)';
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="w-[5px] h-[18px] rounded-full flex-shrink-0" style={{ background: color }} />
        <span className="text-[15px] font-bold text-ink-900 truncate">{title}</span>
        {sub ? <span className="text-[11px] text-ink-400 flex-shrink-0">{sub}</span> : null}
      </div>
      {onClick ? (
        <button
          onClick={onClick}
          className="text-[11px] font-semibold flex-shrink-0 px-2 py-1 rounded-md transition hover:brightness-105 active:scale-95"
          style={{ color, background: moduleKey ? modRgba(moduleKey, 0.08) : 'rgba(var(--s-rgb),0.06)' }}
        >{more} →</button>
      ) : null}
    </div>
  );
}

/* 细进度条 */
function Bar({ value, color = 'var(--s-main)', h = '5px' }) {
  return (
    <div className="w-full rounded-full overflow-hidden" style={{ height: h, background: 'rgba(120,120,128,0.12)' }}>
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${value}%`, background: color }} />
    </div>
  );
}

/* 完成率圆环（今日聚焦）· 80px 小环，统计文字在环下方 */
function Ring({ value, done, total, color = 'var(--s-main)' }) {
  const R = 31, C = 2 * Math.PI * R;
  return (
    <div className="flex flex-col items-center flex-shrink-0">
      <div className="relative w-[80px] h-[80px]">
        <svg width="80" height="80" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r={R} fill="none" stroke="rgba(120,120,128,0.12)" strokeWidth="7" />
          <circle cx="40" cy="40" r={R} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={C * (1 - value / 100)} transform="rotate(-90 40 40)"
            style={{ transition: 'stroke-dashoffset .6s cubic-bezier(.2,.8,.2,1)' }} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[17px] font-extrabold text-ink-900 leading-none tabular-nums">{value}%</span>
        </div>
      </div>
      <span className="text-[9.5px] text-ink-400 mt-1.5 tabular-nums">{done}/{total} 完成</span>
    </div>
  );
}

/* ============ 主页 ============ */
export default function HomePage({ user, onNav, syncSignal = 0 }) {
  const todayStr = getToday();
  const weekStart = useMemo(() => startOfWeek(new Date()), [todayStr]);
  const weekStartStr = toISODate(weekStart);
  const weekEndStr = toISODate(endOfWeek(new Date()));

  /* ===== 签名（localStorage + 云端 KV 持久化，点击编辑） ===== */
  const [signature, setSignature] = usePersistentState('home_signature_v1', () => '');
  const [sigEditing, setSigEditing] = useState(false);

  /* ===== Hero 背景（渐变预设 / 自定义图片，localStorage + 云端 KV） ===== */
  const [heroBg, setHeroBg] = usePersistentState('home_hero_bg_v1', () => ({ type: 'gradient', value: 'A' }));
  const [heroEditOpen, setHeroEditOpen] = useState(false);
  const heroRef = useRef(null);

  const heroStyle = useMemo(() => {
    if (heroBg?.type === 'image' && heroBg?.value) {
      return {
        backgroundImage: `linear-gradient(135deg, rgba(0,0,0,0.38), rgba(0,0,0,0.12)), url(${heroBg.value})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        boxShadow: '0 8px 28px rgba(0,0,0,0.18)',
      };
    }
    const g = HERO_GRADIENTS[heroBg?.value] || HERO_GRADIENTS.A;
    return { background: g.css, boxShadow: `0 8px 28px ${g.shadow}` };
  }, [heroBg]);

  // 点击外部关闭浮层
  useEffect(() => {
    if (!heroEditOpen) return;
    function onDocClick(e) {
      if (heroRef.current && !heroRef.current.contains(e.target)) setHeroEditOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [heroEditOpen]);

  // 图片上传：canvas 压缩后存 data URL（限制 < 500KB）
  function handleImageUpload(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxW = 1920, maxH = 400;
        let w = img.width, h = img.height;
        const ratio = Math.min(maxW / w, maxH / h, 1);
        w = Math.round(w * ratio); h = Math.round(h * ratio);
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
        setHeroBg({ type: 'image', value: dataUrl });
        setHeroEditOpen(false);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  /* ===== 日程数据：本周一 ~ 未来 30 天（今日事项 / 本周关键 / 生日 / 近期关键） ===== */
  const [sched, setSched] = useState(null);
  useEffect(() => {
    let alive = true;
    API.schedules.list({ from: weekStartStr, to: addDaysISO(todayStr, 30) })
      .then(r => { if (alive) setSched(r?.schedules || []); })
      .catch(() => { if (alive) setSched([]); });
    return () => { alive = false; };
  }, [weekStartStr, todayStr, syncSignal]);

  /* ===== 精力习惯（周打卡矩阵） ===== */
  const { realHabits } = useEnergyHabits();
  const habits = realHabits || [];
  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysISO(weekStartStr, i)), [weekStartStr]);

  /* ===== 知力 / 能力 / 工作（与年度规划共享同一份 localStorage 数据） ===== */
  const [books] = usePersistentState('annual_books_v12', () => null);
  const [abilities] = usePersistentState('annual_abilities_v2', () => null);
  const [workGoals] = usePersistentState('annual_work', () => null);

  /* ===== 今日聚焦 ===== */
  const todayItems = useMemo(() => (sched || []).filter(s => s.date === todayStr), [sched, todayStr]);
  const todayDone = todayItems.filter(s => s.is_done).length;
  const todayPct = pct(todayDone, todayItems.length);
  const nextTodo = useMemo(() => todayItems
    .filter(s => !s.is_done)
    .sort((a, b) => String(a.start_time || '99:99').localeCompare(String(b.start_time || '99:99')))[0] || null,
    [todayItems]);

  /* ===== 本周重点：关键事项（is_key） ===== */
  const weekKeys = useMemo(() => (sched || [])
    .filter(s => s.is_key && s.date <= weekEndStr)
    .sort((a, b) => (a.is_done ? 1 : 0) - (b.is_done ? 1 : 0) || String(a.date).localeCompare(String(b.date))),
    [sched, weekEndStr]);
  const weekKeyDone = weekKeys.filter(s => s.is_done).length;

  /* 勾选/取消关键事项（乐观更新 + API 持久化，与 KeyTasks 同款含重复事项 occurrence 处理） */
  const toggleWeekKey = async (s) => {
    const nextDone = !s.is_done;
    setSched(prev => (prev || []).map(x => x.id === s.id ? { ...x, is_done: nextDone } : x));
    try {
      await API.schedules.update(s.id, { is_done: nextDone, ...(s._repeat_occurrence ? { occurrence_date: s.date } : {}) });
    } catch {
      setSched(prev => (prev || []).map(x => x.id === s.id ? { ...x, is_done: !nextDone } : x));
    }
  };

  /* ===== 即将到来：生日 + 关键事项合并时间轴，按剩余天数升序取前 4 ===== */
  const upcomingList = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const list = [];
    // 生日（未来一年内最近的下一次，含农历标记）
    (sched || []).filter(s => {
      const t = String(s.title || '');
      return t.includes('生日') && (s.repeat_rule === 'yearly' || s.repeat_rule === 'lunar-yearly' || t.startsWith('🎂'));
    }).forEach(b => {
      const name = String(b.title || '').replace(/^🎂/, '').replace(/生日$/, '').trim() || b.title;
      const parts = String(b.date || '').split('-');
      const mo = parts[1] ? parseInt(parts[1], 10) : 0;
      const day = parts[2] ? parseInt(parts[2], 10) : 0;
      if (!mo || !day) return;
      let next = new Date(today.getFullYear(), mo - 1, day); next.setHours(0, 0, 0, 0);
      if (next < today) next = new Date(today.getFullYear() + 1, mo - 1, day);
      const daysLeft = Math.round((next - today) / 86400000);
      list.push({ key: `bd-${b.id}`, type: 'birthday', title: `${name}的生日`, isLunar: b.repeat_rule === 'lunar-yearly', daysLeft });
    });
    // 关键事项：未来 30 天（与取数窗口一致）
    (sched || []).filter(s => s.is_key && s.date > todayStr && s.date <= addDaysISO(todayStr, 30))
      .forEach(s => {
        const daysLeft = Math.round((new Date(`${s.date}T00:00:00`) - today) / 86400000);
        list.push({ key: `uk-${s.id}`, type: 'key', title: s.title, date: s.date, daysLeft });
      });
    return list.sort((a, b) => a.daysLeft - b.daysLeft);
  }, [sched, todayStr]);

  /* ===== 精力：本周打卡统计 ===== */
  const habitRows = habits.slice(0, 3);
  const weekDoneCnt = useMemo(() => habitRows.reduce((sum, h) => {
    const set = new Set(h.allDates || []);
    return sum + weekDates.filter(d => set.has(d)).length;
  }, 0), [habits, weekDates]);

  /* ===== 知力：在读（1 本主推 + 多本列表） ===== */
  const reading = useMemo(() => (books || []).filter(b => b.st === 'reading').sort((a, b) => (b.pct || 0) - (a.pct || 0)), [books]);
  const booksDone = (books || []).filter(b => b.st === 'done').length;

  /* ===== 能力：各能力里程碑平均进度 ===== */
  const abilRows = useMemo(() => (abilities || []).slice(0, 3).map(a => {
    const ms = a.mstones || [];
    const avg = ms.length > 0 ? Math.round(ms.reduce((s, m) => s + (m.pct || 0), 0) / ms.length) : 0;
    const doing = ms.filter(m => m.st === 'doing').length;
    return { id: a.id, title: a.title, avg, doing, total: ms.length };
  }), [abilities]);

  /* ===== 工作：进行中目标的 KR 平均进度 ===== */
  const workRows = useMemo(() => (workGoals || [])
    .filter(o => !o.archived && o.status !== 'shelf' && o.mode !== 'event')
    .slice(0, 2).map(o => {
      const krs = o.krs || [];
      const avg = krs.length > 0 ? Math.round(krs.reduce((s, k) => s + pct(k.v, k.tgt), 0) / krs.length) : 0;
      return { id: o.id, title: o.title, label: o.label, avg, krCnt: krs.length };
    }), [workGoals]);

  const hour = new Date().getHours();
  const greeting = hour < 6 ? '夜深了' : hour < 11 ? '早上好' : hour < 13 ? '中午好' : hour < 18 ? '下午好' : hour < 22 ? '晚上好' : '夜深了';
  const name = String(user?.username || user?.name || user?.nickname || '').trim() || '朋友';

  return (
    <div className="flex-1 min-w-0 flex flex-col gap-4">
      <div className="w-full max-w-[1320px] mx-auto flex flex-col gap-4">

        {/* ========== Hero：渐变 / 图片通栏（问候 + 签名），全页唯一彩色锚点 ========== */}
        <div
          ref={heroRef}
          className="relative overflow-hidden px-7 py-6 flex items-center justify-between gap-6 flex-wrap rounded-[18px] group"
          style={heroStyle}
          onContextMenu={e => { e.preventDefault(); setHeroEditOpen(v => !v); }}
        >
          {/* 编辑按钮（hover / 右键显示） */}
          <button
            onClick={() => setHeroEditOpen(v => !v)}
            className="absolute top-3 right-3 w-7 h-7 rounded-full grid place-items-center transition-opacity opacity-0 group-hover:opacity-100 z-10"
            style={{ background: 'rgba(255,255,255,0.22)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
            title="编辑 Hero 背景（也可右键）"
          >
            <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          </button>

          {/* 编辑浮层（glass-card 风格，复用工作台设计语言） */}
          {heroEditOpen && (
            <div className="absolute top-full right-0 mt-2 z-20 p-4 w-[280px] rounded-[18px] popover-enter" style={{ background: 'rgba(255,255,255,0.88)', backdropFilter: 'saturate(180%) blur(20px)', WebkitBackdropFilter: 'saturate(180%) blur(20px)', border: '1px solid rgba(255,255,255,0.6)', boxShadow: '0 0 0 1px rgba(0,0,0,0.04), 0 8px 32px rgba(0,0,0,0.12)' }} onClick={e => e.stopPropagation()}>
              <div className="text-[14px] font-bold text-ink-900 mb-3">Hero 背景</div>

              {/* 预设渐变 */}
              <div className="text-[11px] font-semibold text-ink-400 uppercase tracking-wide mb-2">预设渐变</div>
              <div className="grid grid-cols-5 gap-2 mb-4">
                {Object.entries(HERO_GRADIENTS).map(([k, g]) => {
                  const isSel = heroBg?.type === 'gradient' && (heroBg?.value || 'A') === k;
                  return (
                    <button
                      key={k}
                      onClick={() => setHeroBg({ type: 'gradient', value: k })}
                      className="aspect-[4/3] rounded-lg transition hover:scale-105"
                      style={{
                        background: g.css,
                        outline: isSel ? '2px solid var(--s-main)' : '2px solid transparent',
                        outlineOffset: '2px',
                      }}
                      title={g.name}
                    />
                  );
                })}
              </div>

              {/* 自定义图片 */}
              <div className="text-[11px] font-semibold text-ink-400 uppercase tracking-wide mb-2">自定义图片</div>
              <label className="flex items-center justify-center gap-2 w-full px-3 py-2.5 rounded-xl text-[13px] font-semibold cursor-pointer transition hover:brightness-95" style={{ background: 'rgba(120,120,128,0.10)', color: 'var(--ink-600, #3a3a3c)' }}>
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                上传图片
                <input type="file" accept="image/*" className="hidden" onChange={e => { handleImageUpload(e.target.files?.[0]); e.target.value = ''; }} />
              </label>
              {heroBg?.type === 'image' && (
                <button
                  onClick={() => setHeroBg({ type: 'gradient', value: 'A' })}
                  className="w-full mt-2 px-3 py-2 rounded-xl text-[13px] font-semibold text-red-500 transition hover:bg-red-50"
                >移除图片，恢复渐变</button>
              )}
            </div>
          )}
          {/* 装饰光斑（纯视觉，不响应交互） */}
          <div className="absolute -right-14 -top-28 w-[280px] h-[280px] rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.16) 0%, transparent 68%)' }} />
          <div className="absolute right-40 -bottom-24 w-[190px] h-[190px] rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.09) 0%, transparent 70%)' }} />

          {/* 左：问候 */}
          <div className="relative flex flex-col gap-1.5 min-w-0">
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="text-[28px] font-extrabold text-white tracking-tight">{greeting}，{name}</span>
              <span className="text-[13px] font-medium" style={{ color: 'rgba(255,255,255,0.72)' }}>{formatChineseDate(new Date())}</span>
            </div>
            <span className="text-[13.5px] font-medium" style={{ color: 'rgba(255,255,255,0.85)' }}>
              {hour < 12 ? '新的一天，从最重要的事开始' : hour < 18 ? '午后时光，保持节奏' : '回顾一下今天的收获吧'}
            </span>
          </div>

          {/* 右：签名 / 座右铭（点击编辑，回车/失焦保存） */}
          <div className="relative flex items-center gap-2 min-w-0 max-w-[440px]">
            {sigEditing ? (
              <input
                autoFocus
                defaultValue={signature}
                placeholder="写一句自己的话…"
                maxLength={60}
                className="flex-1 min-w-0 px-3.5 py-2 rounded-xl text-[14px] font-medium outline-none text-white placeholder:text-[rgba(255,255,255,0.55)]"
                style={{ background: 'rgba(255,255,255,0.16)', border: '1px solid rgba(255,255,255,0.45)' }}
                onBlur={e => { setSignature(e.target.value.trim()); setSigEditing(false); }}
                onKeyDown={e => {
                  if (e.key === 'Enter') { setSignature(e.currentTarget.value.trim()); setSigEditing(false); }
                  if (e.key === 'Escape') setSigEditing(false);
                }}
              />
            ) : (
              <button
                onClick={() => setSigEditing(true)}
                className="group flex items-center gap-2 min-w-0 px-3 py-2 rounded-xl transition hover:bg-[rgba(255,255,255,0.12)]"
                title="点击编辑签名"
              >
                {signature ? (
                  <>
                    <span className="text-[30px] font-serif leading-none flex-shrink-0 -mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>“</span>
                    <span className="text-[14.5px] italic font-medium truncate" style={{ color: 'rgba(255,255,255,0.92)' }}>{signature}</span>
                    <span className="text-[30px] font-serif leading-none flex-shrink-0 -mt-3 self-start" style={{ color: 'rgba(255,255,255,0.4)' }}>”</span>
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5 flex-shrink-0 transition" style={{ color: 'rgba(255,255,255,0.55)' }} fill="currentColor" viewBox="0 0 24 24"><path d="M6.17 17.53c.24 0 .45-.09.62-.26l11.4-11.4c.15-.15.23-.34.23-.54 0-.42-.32-.73-.74-.73-.2 0-.39.07-.53.21L5.77 15.65c-.18.18-.27.4-.3.66l-.13 1.21c-.02.2.12.34.31.34l.52-.02c.26-.02.5-.11.65-.28l-.05-.03zm-1.79 3.15c-.18 0-.31-.13-.29-.32l.21-2.06c.04-.42.23-.81.53-1.11l10.6-10.6c.51-.53 1.22-.53 1.71-.05l.95.95c.48.49.5 1.2-.02 1.72L7.9 19.36c-.3.3-.68.48-1.11.53l-2.03.21-.28.02-.4-.44z"/></svg>
                    <span className="text-[13.5px] italic truncate" style={{ color: 'rgba(255,255,255,0.55)' }}>点击写一句签名 / 座右铭</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* ========== 时间层：今日聚焦 / 本周重点 / 即将到来（3 等分，md 起 3 列） ========== */}
        <div className="grid grid-cols-1 md:grid-cols-3 auto-rows-fr gap-4">

          {/* ---- 今日聚焦 ---- */}
          <div className="glass-card p-4 flex flex-col">
            <CardHead title="今日聚焦" sub={todayStr.slice(5).replace('-', '/')} onClick={() => onNav?.('plan')} />
            <div className="flex items-center gap-4 flex-1">
              <Ring value={todayPct} done={todayDone} total={todayItems.length} />
              <div className="flex-1 min-w-0 flex flex-col gap-2">
                {nextTodo ? (
                  <button
                    onClick={() => onNav?.('plan')}
                    className="text-left w-full rounded-xl px-3 py-2.5 transition hover:bg-[rgba(120,120,128,0.06)]"
                    title="跳转今日计划"
                  >
                    <div className="text-[10px] font-bold text-ink-400 mb-0.5 tracking-wide">下一个待办</div>
                    <div className="text-[13.5px] font-semibold text-ink-800 truncate">{nextTodo.title || '（无标题）'}</div>
                    <div className="text-[11px] text-ink-400 mt-0.5 tabular-nums">
                      {nextTodo.start_time ? `${nextTodo.start_time}${nextTodo.end_time ? ` - ${nextTodo.end_time}` : ''}` : '全天'}
                    </div>
                  </button>
                ) : (
                  <div className="px-1">
                    <div className="text-[13.5px] font-semibold text-ink-800">
                      {todayItems.length === 0 ? '今天还没有安排' : '今日事项已全部完成'}
                    </div>
                    <div className="text-[11.5px] text-ink-400 mt-1">
                      {todayItems.length === 0 ? '点右上角「查看」去安排今天' : '享受这份清爽，或复盘一下今天 ✦'}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ---- 本周重点 ---- */}
          <div className="glass-card p-4 flex flex-col">
            <CardHead title="本周重点" sub="关键事项" onClick={() => onNav?.('plan')} />
            <div className="flex-1 flex flex-col gap-2 min-h-0">
              <div className="flex items-baseline justify-between mb-0.5">
                <span className="text-[11px] text-ink-400">本周进度</span>
                <span className="text-[12px] font-bold text-ink-800 tabular-nums">{weekKeyDone}/{weekKeys.length}</span>
              </div>
              <Bar value={pct(weekKeyDone, weekKeys.length)} />
              <div className="flex-1 flex flex-col justify-start gap-1.5 mt-1">
                {weekKeys.slice(0, 3).map(s => (
                  <div key={s.id} className="flex items-center gap-2 group">
                    <button
                      onClick={e => { e.stopPropagation(); toggleWeekKey(s); }}
                      className="w-[15px] h-[15px] rounded-[4.5px] border flex-shrink-0 grid place-items-center transition hover:border-[rgba(var(--s-rgb),0.6)] cursor-pointer"
                      title={s.is_done ? '取消完成' : '标记完成'}
                      style={{
                        background: s.is_done ? 'var(--s-main)' : 'transparent',
                        borderColor: s.is_done ? 'var(--s-main)' : 'rgba(120,120,128,0.35)'
                      }}
                    >
                      {s.is_done ? (
                        <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      ) : null}
                    </button>
                    <button onClick={() => onNav?.('plan')} className="flex items-center gap-2 text-left min-w-0 flex-1">
                      <span className={`text-[12.5px] truncate ${s.is_done ? 'text-ink-300 line-through' : 'text-ink-700'}`}>{s.title}</span>
                      <span className="text-[10px] text-ink-300 flex-shrink-0 ml-auto tabular-nums">{String(s.date).slice(5).replace('-', '/')}</span>
                    </button>
                  </div>
                ))}
                {weekKeys.length === 0 && (
                  <div className="text-[12.5px] text-ink-400 text-center py-3">本周暂无关键事项</div>
                )}
                {weekKeys.length > 3 && (
                  <button onClick={() => onNav?.('plan')} className="text-[11px] text-ink-400 hover:text-ink-600 text-left">还有 {weekKeys.length - 3} 项…</button>
                )}
              </div>
            </div>
          </div>

          {/* ---- 即将到来：生日 + 关键事项统一时间轴（前 4 条） ---- */}
          <div className="glass-card p-4 flex flex-col">
            <CardHead title="即将到来" sub="未来 30 天" onClick={() => onNav?.('plan')} />
            <div className="flex-1 flex flex-col gap-1.5 justify-start">
              {upcomingList.slice(0, 4).map(u => (
                <button
                  key={u.key}
                  onClick={() => u.type === 'birthday' ? onNav?.('annual', 'life') : onNav?.('plan')}
                  className={`flex items-center gap-2.5 text-left rounded-lg px-2 py-1.5 -mx-2 transition ${u.type === 'birthday' ? 'hover:bg-[rgba(175,82,222,0.06)]' : 'hover:bg-[rgba(var(--s-rgb),0.05)]'}`}
                >
                  {u.type === 'birthday' ? (
                    <span className="w-[30px] h-[30px] rounded-[9px] grid place-items-center flex-shrink-0" style={{ background: 'rgba(var(--m-life-rgb),0.1)' }}>
                      <svg className="w-4 h-4" style={{ color: 'var(--m-life)' }} fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M12 2l2.4 5.4L20 9l-4 4 .9 6.3L12 16.5 7.1 19.3 8 13 4 9l5.6-1.6L12 2z"/></svg>
                    </span>
                  ) : (
                    <span className="w-[30px] h-[30px] rounded-[9px] grid place-items-center flex-shrink-0 text-[10px] font-bold" style={{ background: 'rgba(var(--s-rgb),0.08)', color: 'var(--s-main)' }}>
                      {String(u.date).slice(8)}
                    </span>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-[12.5px] font-semibold text-ink-800 truncate">{u.title}</div>
                    <div className="text-[10.5px] text-ink-400">
                      {u.type === 'birthday'
                        ? `${u.daysLeft === 0 ? '就是今天' : `还有 ${u.daysLeft} 天`}${u.isLunar ? ' · 农历' : ''}`
                        : `${String(u.date).slice(5).replace('-', '/')} · 关键事项`}
                    </div>
                  </div>
                  <span className="text-[16px] font-extrabold tabular-nums flex-shrink-0" style={{ color: u.type === 'birthday' ? 'var(--m-life)' : 'var(--s-main)' }}>{u.daysLeft}</span>
                </button>
              ))}
              {upcomingList.length === 0 && (
                <div className="text-[12.5px] text-ink-400 text-center py-3">未来 30 天没有生日和关键日程</div>
              )}
              {upcomingList.length > 4 && (
                <button onClick={() => onNav?.('plan')} className="text-[11px] text-ink-400 hover:text-ink-600 text-left px-2">还有 {upcomingList.length - 4} 项…</button>
              )}
            </div>
          </div>
        </div>

        {/* ========== 成长层：精力 / 知力 / 能力 / 工作（4 等分，xl 起 4 列） ========== */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 auto-rows-fr gap-4">

          {/* ---- 精力：周打卡矩阵 ---- */}
          <div className="glass-card p-4 flex flex-col">
            <CardHead moduleKey="energy" title="精力" sub="本周打卡" onClick={() => onNav?.('annual', 'energy')} />
            {habitRows.length > 0 ? (
              <>
                <div className="hp-hb">
                  {habitRows.map(h => {
                    const set = new Set(h.allDates || []);
                    return (
                      <div key={h.id} className="hp-hrow">
                        <span className="hp-hname" title={h.label}>{h.label}</span>
                        <div className="hp-hcells">
                          {weekDates.map(d => {
                            const isTdy = d === todayStr;
                            const isFut = d > todayStr;
                            const ok = set.has(d);
                            return (
                              <span key={d} className={`hp-hcell${ok ? ' ok' : ''}${isFut ? ' fut' : ''}${isTdy ? ' tdy' : ''}`}>
                                {parseInt(d.slice(8), 10)}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between mt-3 pt-2.5" style={{ borderTop: '1px solid rgba(120,120,128,0.1)' }}>
                  <span className="text-[11px] text-ink-400">本周已打卡</span>
                  <span className="text-[12px] font-bold tabular-nums" style={{ color: 'var(--m-energy)' }}>
                    {weekDoneCnt}/{habitRows.length * 7} 次
                  </span>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-1.5 py-4">
                <span className="text-[12.5px] font-semibold text-ink-600">还没有精力类习惯</span>
                <span className="text-[11px] text-ink-400">去习惯面板创建睡眠、运动等打卡</span>
              </div>
            )}
          </div>

          {/* ---- 知力：在读 ---- */}
          <div className="glass-card p-4 flex flex-col">
            <CardHead moduleKey="cognition" title="知力" sub={reading.length > 0 ? `在读 ${reading.length} 本` : `已读 ${booksDone} 本`} onClick={() => onNav?.('annual', 'cognition')} />
            <div className="flex-1 flex flex-col justify-start min-h-0">
              {reading.length > 0 && (
                <div className="rounded-xl p-3" style={{ background: 'rgba(var(--m-cognition-rgb),0.06)' }}>
                  <div className="flex items-baseline justify-between gap-2 mb-1">
                    <span className="text-[14px] font-bold text-ink-900 truncate">《{reading[0].t}》</span>
                    <span className="text-[12px] font-extrabold tabular-nums flex-shrink-0" style={{ color: 'var(--m-cognition)' }}>{reading[0].pct || 0}%</span>
                  </div>
                  <div className="text-[11px] text-ink-400 mb-2 truncate">{reading[0].author || '佚名'} · {reading[0].cat || '未分类'}</div>
                  <Bar value={reading[0].pct || 0} color="var(--m-cognition)" />
                  {reading.length > 1 && (
                    <div className="mt-2.5 pt-2.5 flex flex-col gap-1.5" style={{ borderTop: '1px dashed rgba(0,122,255,0.18)' }}>
                      {reading.slice(1, 4).map(b => (
                        <div key={b.id} className="flex items-center gap-2">
                          <span className="text-[11.5px] text-ink-600 truncate flex-1">{b.t}</span>
                          <div className="w-[54px] flex-shrink-0"><Bar value={b.pct || 0} color="var(--m-cognition)" h="4px" /></div>
                          <span className="text-[10px] text-ink-400 tabular-nums w-[27px] text-right">{b.pct || 0}%</span>
                        </div>
                      ))}
                      {reading.length > 4 && <div className="text-[10.5px] text-ink-300">等 {reading.length - 4} 本在读…</div>}
                    </div>
                  )}
                </div>
              )}
              {reading.length === 0 && (
                <div className="flex flex-col items-center justify-center gap-1.5 py-4">
                  <span className="text-[12.5px] font-semibold text-ink-600">当前没有在读的书</span>
                  <span className="text-[11px] text-ink-400">{booksDone > 0 ? `今年已读完 ${booksDone} 本` : '去书架添加一本开始阅读'}</span>
                </div>
              )}
            </div>
          </div>

          {/* ---- 能力 ---- */}
          <div className="glass-card p-4 flex flex-col">
            <CardHead moduleKey="ability" title="能力" sub="里程碑进度" onClick={() => onNav?.('annual', 'ability')} />
            <div className="flex-1 flex flex-col justify-start gap-3">
              {abilRows.map(a => (
                <div key={a.id}>
                  <div className="flex items-baseline justify-between gap-2 mb-1">
                    <span className="text-[12.5px] font-semibold text-ink-800 truncate">{a.title}</span>
                    <span className="text-[11.5px] font-bold tabular-nums flex-shrink-0" style={{ color: 'var(--m-ability)' }}>{a.avg}%</span>
                  </div>
                  <Bar value={a.avg} color="var(--m-ability)" />
                  <div className="text-[10px] text-ink-300 mt-1">{a.doing > 0 ? `${a.doing} 个里程碑进行中` : `共 ${a.total} 个里程碑`}</div>
                </div>
              ))}
              {abilRows.length === 0 && (
                <div className="flex flex-col items-center justify-center gap-1.5 py-4">
                  <span className="text-[12.5px] font-semibold text-ink-600">还没有能力目标</span>
                  <span className="text-[11px] text-ink-400">去能力页添加第一个成长目标</span>
                </div>
              )}
            </div>
          </div>

          {/* ---- 工作 ---- */}
          <div className="glass-card p-4 flex flex-col">
            <CardHead moduleKey="work" title="工作" sub="目标进度" onClick={() => onNav?.('annual', 'work')} />
            <div className="flex-1 flex flex-col justify-start gap-3">
              {workRows.map(o => (
                <div key={o.id}>
                  <div className="flex items-baseline justify-between gap-2 mb-1">
                    <span className="flex items-center gap-1.5 min-w-0">
                      {o.label && (
                        <span className="text-[9px] font-bold px-1.5 py-[1px] rounded flex-shrink-0" style={{ background: 'rgba(var(--m-work-rgb),0.1)', color: 'var(--m-work)' }}>{o.label}</span>
                      )}
                      <span className="text-[12.5px] font-semibold text-ink-800 truncate">{o.title}</span>
                    </span>
                    <span className="text-[11.5px] font-bold tabular-nums flex-shrink-0" style={{ color: 'var(--m-work)' }}>{o.avg}%</span>
                  </div>
                  <Bar value={o.avg} color="var(--m-work)" />
                </div>
              ))}
              {workRows.length === 0 && (
                <div className="flex flex-col items-center justify-center gap-1.5 py-4">
                  <span className="text-[12.5px] font-semibold text-ink-600">暂无进行中的工作目标</span>
                  <span className="text-[11px] text-ink-400">去工作页建立你的 OKR</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
