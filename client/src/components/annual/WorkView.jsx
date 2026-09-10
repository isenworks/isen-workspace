import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { WORK } from './data.js';
import { IOS_SANS, calcRisk, calcTimeAnchor, daysLabel, formatRemainDuration, inferMode, parseDate, pct, uid } from './utils.js';
import { AddButton, ProgressBar } from './ui.jsx';
import { moduleColor, moduleRgba } from '../../utils/color.js'
import Modal from '../Modal.jsx'
import DualMarkerBar from '../DualMarkerBar.jsx'

export function WorkView({ workGoals, onKrAdd, onKrEdit, onKrRemove, onGoalAdd, onGoalEdit, onGoalRemove, onGoalMarkDone, onGoalShelf, onGoalUnarchive, onRiskTagClick, microActions }) {
  const dynWk = workGoals || WORK;
  const year = new Date().getFullYear();
  const RED = 'var(--m-work)';
  const RED_DATA = 'var(--m-work)';
  const RED_RISK = 'var(--m-work)';

  /* —— 对每个目标进行字段兜底 + 派生统计 —— */
  const goalStats = useMemo(() => {
    return dynWk.map((o, idx) => {
      const mode = inferMode(o, 'work');
      const krs = o.krs || [];
      const krPcts = krs.map(k => pct(k.v, k.tgt));
      // 🎯 event 范式：avgPct 直接看 status，不需要 KR 均值
      const avgPct = mode === 'event'
        ? (o?.status === 'done' ? 100 : 0)
        : (krs.length ? Math.round(krPcts.reduce((s,p)=>s+p,0) / krs.length) : 0);
      const { days, timePct } = calcTimeAnchor(o.deadline, o.createdAt);
      const rm = calcRisk(avgPct, timePct, mode === 'event' ? o?.status === 'done' : (krs.length && krs.every(k => k.st === 'done')));

      const risks = { risk: 0, warn: 0, ahead: 0, normal: 0, done: 0 };
      if (mode !== 'event') {
        krs.forEach((k, i) => {
          const kPct = krPcts[i];
          const microTA = k.dueBy ? calcTimeAnchor(k.dueBy, o.createdAt || k.dueBy) : { timePct };
          const krm = calcRisk(kPct, microTA.timePct, k.st === 'done');
          risks[krm.q] = (risks[krm.q] || 0) + 1;
        });
      }

      return {
        mode, idx,
        avgPct, rm, days, timePct, risks,
        dl: daysLabel(days),
        label: o.label || (o.core ? '主业' : '副业'),
        color: RED, // 工作页统一红色系：主业 & 副业卡片都用 RED（档A结构色·原副业#FF9500已统一）
      };
    });
  }, [dynWk]);

  /* —— 全局 Hero 统计：跨所有目标汇总 —— */
  const heroStats = useMemo(() => {
    let risk = 0, warn = 0, overdue = 0, urgent = 0, total = 0;
    goalStats.forEach(gs => {
      risk += gs.risks.risk || 0;
      warn += gs.risks.warn || 0;
      if (gs.dl.overdue) overdue++;
      if (gs.dl.urgent) urgent++;
      total += (gs.risks.risk || 0) + (gs.risks.warn || 0);
    });
    // 最近截止时间（选最早到期且未过期的）
    let earliest = null;
    goalStats.forEach(gs => {
      if (gs.days === null || gs.days < 0) return;
      if (earliest === null || gs.days < earliest) earliest = gs.days;
    });
    return { risk, warn, overdue, urgent, total, earliest };
  }, [goalStats]);

  /* —— 状态分区：进行中 / 已完成 / 搁置归档 —— */
  const todayISO = new Date().toISOString().slice(0, 10);
  const [workTab, setWorkTab] = useState('active'); // 'active' | 'done' | 'shelf' — 书架风 Tab 3 项（标题右）
  const [detailGoal, setDetailGoal] = useState(null); // { o, gs, goalIdx } | null
  const [openDropIdx, setOpenDropIdx] = useState(null); // key → goal.id|title+idx+'@'+location (location: 'active'|'modal')
  // Header 标题：右击可编辑（持久化到 D1 userSettings）
  // 首屏闪默认标题的根因：自定义值靠异步 fetch D1 读回。修复：localStorage 写穿缓存，
  // 初始渲染同步读缓存 → 打开即显示自定义标题；D1 读回后再校准（处理换设备/清缓存场景）
  const WORK_TITLE_CACHE = 'annual_work_title_cache';
  const [localTitle, setLocalTitle] = useState(() => {
    try { return localStorage.getItem(WORK_TITLE_CACHE) || `${year}年 · 工作目标`; } catch { return `${year}年 · 工作目标`; }
  });
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/userSettings/get?k=annual_work_title', {
          headers: { 'X-Unlock-Token': localStorage.getItem('pw_unlock_token') || '' },
        });
        const j = await r.json().catch(() => ({}));
        // 新协议 GET 返回 { v, version }；兼容老协议纯字符串
        const entry = j?.data?.annual_work_title;
        const v = entry && typeof entry === 'object' && 'v' in entry ? entry.v : entry;
        if (v) {
          setLocalTitle(String(v));
          try { localStorage.setItem(WORK_TITLE_CACHE, String(v)); } catch { /* ignore */ }
        }
      } catch { /* 读取失败用缓存/默认值 */ }
    })();
  }, []);
  const [titleEditing, setTitleEditing] = useState(false);
  const [collapsedIds, setCollapsedIds] = useState(() => new Set()); // 进行中tab双击折叠: Set<goalKey = id | title|idx>
  const makeGoalKey = (o, goalIdx) => o.id || `${o.title}|${goalIdx}`;
  const toggleCollapsed = (o, goalIdx) => setCollapsedIds(prev => {
    const k = makeGoalKey(o, goalIdx);
    const next = new Set(prev);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });
  const isCollapsed = (o, goalIdx) => collapsedIds.has(makeGoalKey(o, goalIdx));

  const _isOverdueNotDone = (o) => {
    if (!o?.deadline) return false;
    if (o.deadline >= todayISO) return false;
    const krs = o.krs || [];
    if (krs.length === 0) return true;
    return !krs.every(k => k.st === 'done');
  };

  const _statusOf = (o) => {
    if (o?.status === 'done') return 'done';
    // 🎯 终极安全网：小红书涨粉目标强制进行中（仅拦截 archived/shelf/deadline，不影响正常 done 状态）
    if (o?.archived === true || o?.status === 'shelf') {
      if (o && String(o.title || '').includes('小红书')) return 'active';
      return 'shelf';
    }
    if (_isOverdueNotDone(o)) return 'shelf';
    return 'active';
  };

  const partitionedGoals = useMemo(() => {
    const active = [];
    const done = [];
    const shelf = [];
    dynWk.forEach((o, i) => {
      const gs = goalStats[i];
      const st = _statusOf(o);
      const entry = { o, gs, goalIdx: i };
      if (st === 'done') done.push(entry);
      else if (st === 'shelf') shelf.push(entry);
      else active.push(entry);
    });
    return { active, done, shelf };
  }, [dynWk, goalStats, todayISO]);

  // Step 2: 已完成tab Master-Detail 选中状态（必须在 partitionedGoals 之后声明，否则 TDZ 报错）
  const [selectedDoneKey, setSelectedDoneKey] = useState(null);
  useEffect(() => {
    if (workTab !== 'done') return;
    const doneList = partitionedGoals.done;
    if (doneList.length === 0) { setSelectedDoneKey(null); return; }
    const stillExists = selectedDoneKey && doneList.find(e => makeGoalKey(e.o, e.goalIdx) === selectedDoneKey);
    if (!stillExists) setSelectedDoneKey(makeGoalKey(doneList[0].o, doneList[0].goalIdx));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workTab, partitionedGoals.done]);
  const selectedDoneEntry = useMemo(() =>
    partitionedGoals.done.find(e => makeGoalKey(e.o, e.goalIdx) === selectedDoneKey) || null,
    [partitionedGoals.done, selectedDoneKey]);

  /* —— 卡片右上角下拉菜单 ⋮ —— */
  const renderCardMenu = ({ entry, location }) => {
    const { o, goalIdx } = entry;
    const st = _statusOf(o);
    const isArchived = st === 'done' || st === 'shelf';
    const goalKey = (o.id || o.title + goalIdx) + '@' + location;
    const isOpen = openDropIdx === goalKey;
    const toggleDrop = (e) => {
      e.stopPropagation();
      setOpenDropIdx(prev => prev === goalKey ? null : goalKey);
    };
    const closeDrop = () => setOpenDropIdx(null);
    return (
      <div className="relative" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
        <button
          onClick={toggleDrop}
          className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-[#FFEBE9] active:bg-[#FFD6D1] transition-colors"
          style={{ color: RED }}
          title="更多操作"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/>
          </svg>
        </button>
        {isOpen && (
          <div className="wk-card-menu absolute right-0 top-8 z-50 bg-white rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-ink-100 py-1.5 w-36 overflow-hidden animate-[fadeIn_0.12s_ease-out]"
          >
            {/* ① 进行中（已完成/已归档时显示，点了就 unarchive） */}
            {st !== 'active' && (
              <button onClick={() => { closeDrop(); onGoalUnarchive && onGoalUnarchive(o.id || o.title); }}
                className="w-full text-left px-3.5 py-2 text-[13px] text-[#1d1d1f] hover:bg-[#f2f2f7] hover:rounded-md transition-colors">
                进行中
              </button>
            )}
            {/* ② 已完成（非 done 时显示） */}
            {st !== 'done' && (
              <button onClick={() => { closeDrop(); onGoalMarkDone && onGoalMarkDone(o.id || o.title); }}
                className="w-full text-left px-3.5 py-2 text-[13px] text-[#1d1d1f] hover:bg-[#e8f8ec] hover:rounded-md transition-colors">
                已完成
              </button>
            )}
            {/* ③ 已归档（非 shelf 时显示） */}
            {st !== 'shelf' && (
              <button onClick={() => { closeDrop(); onGoalShelf && onGoalShelf(o.id || o.title); }}
                className="w-full text-left px-3.5 py-2 text-[13px] text-[#1d1d1f] hover:bg-[#f2f2f7] hover:rounded-md transition-colors">
                已归档
              </button>
            )}
            {/* ④ 删除 — 分割线 + 红色 */}
            <div className="h-px bg-[#e5e5ea] my-1"/>
            <button onClick={() => { closeDrop(); onGoalRemove(goalIdx); }}
              className="w-full text-left px-3.5 py-2 text-[13px] text-[#FF3B30] hover:bg-[#fff0f0] hover:rounded-md transition-colors">
              删除
            </button>
          </div>
        )}
      </div>
    );
  };

  /* —— 点击外部关闭下拉（用 target.closest('.wk-card-menu') 判断是否在菜单内，避免 React 合成事件 stopPropagation 不影响原生 document 监听的冒泡 bug）—— */
  useEffect(() => {
    if (!openDropIdx) return;
    const handler = (e) => {
      // 如果点击的是下拉菜单本身或其内部元素 → 不关（让菜单项 onClick 正常触发）
      if (e.target && typeof e.target.closest === 'function' && e.target.closest('.wk-card-menu')) return;
      setOpenDropIdx(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openDropIdx]);

  /* ============================================================
   * Objective 统领层组件（2 行结构 · 适配横向窄卡）
   * R1：色条 + [分类标签 + 范式徽章(显眼)] + O徽标 + O标题（右侧：📅截止）
   * R2：双条进度（时间/实际）+ 里程碑/KR计数 + 风险徽标
   * ============================================================ */
  const renderObjective = (o, gs, goalIdx) => {
    const color = gs.color;
    const krTotal = (o.krs || []).length;
    const krDone = (o.krs || []).filter(k => k.st === 'done').length;
    const modeMeta = {
      funnel:    { lb: '漏斗',       icon: (<path d="M4 4h16l-6 8v8l-4 0v-8z"/>) },
      dashboard: { lb: '仪表盘',     icon: (<><circle cx="12" cy="13" r="6"/><path d="M12 7v6l4 2M9 3h6"/></>) },
      milestone: { lb: '里程碑门',   icon: (<><path d="M4 20V8l8-4 8 4v12"/><path d="M4 12h16M12 4v16"/></>) },
      balance:   { lb: '平衡雷达',   icon: (<><polygon points="12,3 20,9 17,19 7,19 4,9"/><circle cx="12" cy="12" r="2"/></>) },
    };
    const m = modeMeta[gs.mode] || modeMeta.funnel;
    const topRisk = (gs.risks.risk || 0) > 0 ? { n: gs.risks.risk, c: '#FF3B30', l: '落后' }
      : (gs.risks.warn || 0) > 0 ? { n: gs.risks.warn, c: '#FF9500', l: '预警' }
      : (gs.risks.done === krTotal && krTotal > 0) ? { n: null, c: '#34C759', l: '已达成' }
      : null;
    // R3 已收敛：m/topRisk 不再参与卡片渲染（范式子渲染器自有逻辑），留变量防引用错误
    // eslint-disable-next-line no-unused-vars
    const _unused = { m, topRisk };
    // 节奏胶囊：落后/超前 X% · X月Y天（与知力页 paceBadge 同构；无 deadline 或已过期时退化为纯语义）
    const paceDiff = gs.timePct !== null && gs.timePct !== undefined
      ? Math.round(Math.abs(gs.avgPct - gs.timePct)) : null;
    const paceAhead = gs.timePct !== null && gs.avgPct >= gs.timePct;
    const paceRemainTxt = (gs.days !== null && gs.days !== undefined && gs.days > 0)
      ? (() => { const mo = Math.floor(gs.days / 30); const dy = gs.days % 30;
          return mo === 0 ? `${dy} 天` : (dy === 0 ? `${mo} 月` : `${mo} 月 ${dy} 天`); })()
      : null;
    let pace = null;
    if (paceDiff !== null) {
      if (paceDiff === 0) pace = { t: '节奏匹配', bg: `${moduleRgba('work', 0.10)}`, fg: color };
      else if (paceAhead) pace = { t: `超前 ${paceDiff}%${paceRemainTxt ? ' · ' + paceRemainTxt : ''}`, bg: 'rgba(52,199,89,0.10)', fg: '#34C759' };
      else pace = { t: `落后 ${paceDiff}%${paceRemainTxt ? ' · ' + paceRemainTxt : ''}`, bg: `${moduleRgba('work', 0.10)}`, fg: RED_RISK };
    }
    /* 工作页 renderObjective：容器级 px-1 pt-2 已移除，顶部/左右二次压缩消除，与能力页卡壳 p-3.5 像素级一致：
       卡顶→标题中心从 35px→27px；左右留白从 18px→14px；只留 pb-2.5 border-b 承担与下方子渲染区的分段语义 */
    return (
      <div className="flex flex-col gap-2 pb-2.5 border-b border-ink-100">
        {/* R1-top：色条 + 标题 + 胶囊 + 加号 —— 严格锁定在这一行内 items-center，
             与"加副标题之前"的原版视觉关系完全一致，右侧胶囊/加号自然与标题文字中线对齐 */}
        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <span className="w-[5px] h-[18px] rounded-full flex-shrink-0" style={{ background: color }}></span>
            <div className="text-[16px] font-bold text-ink-900 leading-tight truncate cursor-pointer hover:text-ink-700 transition-colors min-w-0 select-none"
              onClick={() => onGoalEdit?.(goalIdx)} title="编辑目标（双击卡片空白处折叠）">{o.title}</div>
          </div>
          {/* 【原右组隐藏】胶囊/加号/⋮ 已由 renderFullCard 外层统一 absolute flex 容器接管（同一坐标系 gap-2 等距 + 圆形统一形状）
               此处保留结构 0 修改，仅加 hidden 避免重复渲染 */}
          <div className="flex items-center gap-2.5 flex-shrink-0 hidden">
            {/* 恢复 1/5 KR 计数胶囊（原设计） */}
            <span
              className="inline-flex items-center px-3 h-[26px] rounded-full text-[11px] font-semibold tabular-nums leading-none"
              style={{ background: `${moduleRgba('work', 0.08)}`, color }}>
              <span className="font-extrabold">{krDone}</span>
              <span className="mx-0.5 opacity-50">/</span>
              <span className="opacity-70">{krTotal}</span>
            </span>
            <button
              onClick={() => onKrAdd?.(goalIdx)}
              className="w-[26px] h-[26px] rounded-lg grid place-items-center transition hover:brightness-105 active:scale-95 flex-shrink-0"
              style={{ background: `${moduleRgba('work', 0.10)}` }}
              title="添加 KR">
              <svg className="w-3.5 h-3.5" fill="none" stroke={color} strokeWidth="2.5" viewBox="0 0 24 24" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
            </button>
          </div>
        </div>
        {/* R1-bot：起止日期副行 · 追加剩余时长（跨月→剩余X个月X天）· iOS/SF 无衬线字体 */}
        {(() => {
          const dlStr = o.deadline ? String(o.deadline).slice(0, 10) : '';
          if (!dlStr) return null;
          const dl = parseDate(dlStr);
          const csStr = o.createdAt ? String(o.createdAt).slice(0, 10) : '';
          const cs = parseDate(csStr);
          const startStr = cs ? csStr : `${dl ? dl.getFullYear() : new Date().getFullYear()}-01-01`;
          const today = new Date(); today.setHours(0,0,0,0);
          const remain = dl ? formatRemainDuration(dl, today) : null;
          return (
            <div
              className="text-[11px] text-ink-400 tabular-nums leading-none pl-[17px] tracking-tight"
              style={{ fontFamily: IOS_SANS }}>
              <span>{startStr} → {dlStr}</span>
              {remain && (
                <>
                  <span className="mx-1 text-ink-200">·</span>
                  <span className={remain.cls}>{remain.text}</span>
                </>
              )}
            </div>
          );
        })()}
        {/* R2 总体完成度：双标记进度条（实际 avgPct vs 计划 timePct），全宽
             容器已无 px-1，撤销原来成对的 -mx-1 避免条越出 shell 14px 内边距 */}
        {gs.timePct === null || gs.timePct === undefined ? (
          <div className="flex items-center gap-2.5">
            <span className="text-[11px] font-semibold text-ink-500 flex-shrink-0">总体完成度</span>
            <div className="flex-1 h-[5px] rounded-full bg-ink-100 overflow-hidden min-w-[40px]">
              <div className="h-full rounded-full transition-all" style={{ width: `${gs.avgPct}%`, background: RED_DATA }}></div>
            </div>
            <span className="text-[13px] font-extrabold tabular-nums text-ink-700 w-[48px] text-right flex-shrink-0">{gs.avgPct}%</span>
          </div>
        ) : (
          <div style={{ }}>
            <DualMarkerBar
              actual={gs.avgPct}
              plan={gs.timePct}
              color={RED_DATA}
              showBadge={false}
              actualDetail={`KR 平均完成 ${gs.avgPct}%${krTotal > 0 ? `（${krDone}/${krTotal} 已完成）` : ''}`}
              planDetail={gs.days !== null && gs.days !== undefined
                ? `时间锚点 ${gs.timePct}% · 剩余 ${gs.days} 天`
                : `时间锚点 ${gs.timePct}%`}
            />
          </div>
        )}
        {/* R3 元信息行已收敛：分类/范式/日期/风险信息分别并入节奏胶囊 tooltip 与双标记进度条 */}
      </div>
    );
  };

  /* ============================================================
   * 子渲染器 #1：Funnel 漏斗（完全对齐知力页一体化漏斗：3 列行 + 连接线 + 关键瓶颈提示）
   * ============================================================ */
  const renderFunnelRows = (o, gs, goalIdx) => {
    const krs = o.krs || [];
    const COLOR = RED_DATA;
    // 空状态引导（对齐能力页 KR 空态）
    if (krs.length === 0) {
      return (
        <div className="py-4 text-center rounded-xl mt-2" style={{ background: 'rgba(15,23,42,0.03)' }}>
          <div className="text-[12px] font-semibold text-ink-400">还没有 KR</div>
          <div className="text-[11px] text-ink-400 mt-1 opacity-80">点击右上角 + 添加</div>
        </div>
      );
    }
    return (
      <div className="flex flex-col pt-1 pr-2.5 flex-1">
        {krs.map((kr, i) => {
          const p = pct(kr.v, kr.tgt);
          const isDone = kr.st === 'done' || p >= 100;
          const isBehind = p < gs.timePct && !isDone;
          const pctWidth = Math.max(6, Math.min(100, p));
          // 0% 时填充条仅 5% ≈ 5px 宽，高度 22px → 视觉上变成"小红圆点"而非进度条
          // 给一个像素级 minWidth 保证始终是"胶囊"（最小高度/宽度比例 ≥ 1:1）
          const minPxWidth = p === 0 ? 22 : Math.max(16, Math.round(22 * 0.7));
          const padNum = String(i + 1).padStart(2, '0');
          const nextKr = krs[i + 1];
          // 转化率：与知力页同算法（前一层实际量 > 0 才计算）
          const conv = nextKr && kr.v > 0 ? Math.round((nextKr.v / kr.v) * 100) : null;
          const lowConv = conv !== null && conv < 50;

          return (
            <div key={i}>
              {/* KR 行：3 列 — 序号+标题+目标 | 漏斗进度条 | 删除(悬停) + 完成率% */}
              <div className="group flex items-center gap-2.5 py-2 rounded-lg hover:bg-surface-soft transition-colors">
                {/* 左区：w-[128px] = 序号22 + gap + 标题+目标，连接线箭头在此区 justify-center 对准标题中心 */}
                <div className="w-[128px] flex items-center gap-2.5 flex-shrink-0 -mt-[1px]">
                  <span className="text-[11px] font-bold tabular-nums w-[22px] text-right leading-none flex-shrink-0"
                    style={{ color: RED }}>{padNum}</span>
                  <div className="flex-1 min-w-0 truncate flex items-baseline gap-1">
                    <div onClick={() => onKrEdit?.(goalIdx, i, kr)} title="点击编辑 KR" className="cursor-pointer group flex items-baseline gap-1.5 min-w-0">
                      <span className="text-[13px] font-semibold truncate leading-none group-hover:text-ink-900 text-[#48484A]">{kr.t}</span>
                      <span className="text-[11px] font-extrabold text-ink-900 tabular-nums leading-none flex-shrink-0">
                        {kr.tgt}{kr.u}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 中部：漏斗进度条（flex-1） — 计数填充条 → 胶囊（语义：数值色块，与知力/能力进度条统一） */}
                <div className="flex-1 flex items-center min-w-0">
                  <div className="flex-1 h-[22px] rounded-full overflow-hidden bg-ink-50 relative" style={{ minWidth: '40px' }}>
                    <div className="relative w-full h-full flex items-center">
                      <div
                        className="h-full rounded-full transition-all duration-500 flex items-center justify-start pl-2"
                        style={{
                          width: `${pctWidth}%`,
                          minWidth: `${minPxWidth}px`,
                          background: isDone ? '#34C759' : COLOR,
                          boxShadow: isDone ? '0 1px 3px rgba(52,199,89,0.25)' : `0 1px 3px ${moduleRgba('work', 0.15)}`,
                        }}>
                        {p >= 15 && (
                          <span className="text-[10px] font-bold text-white/90 tabular-nums">
                            {kr.v}{kr.u}
                          </span>
                        )}
                      </div>
                      {p < 15 && (
                        <span className="text-[10px] font-bold tabular-nums ml-1.5 flex-shrink-0" style={{ color: '#8a9491' }}>
                          {kr.v}{kr.u}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* 删除按钮：行悬停时淡入 */}
                <button
                  onClick={(e) => { e.stopPropagation(); onKrRemove?.(goalIdx, i, kr); }}
                  title="删除此 KR"
                  className="w-5 h-5 grid place-items-center rounded transition flex-shrink-0 opacity-0 group-hover:opacity-100 hover:bg-accent-red/10 text-ink-300 hover:text-accent-red active:scale-95"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>

                {/* 右侧：完成率 */}
                <span className="text-[14px] font-extrabold tabular-nums leading-none w-[48px] text-right flex-shrink-0"
                  style={{ color: isDone ? '#111827' : (isBehind ? RED_RISK : COLOR) }}>
                  {p}<span className="text-[11px] font-bold">%</span>
                </span>
              </div>

              {/* 连接线：3 列同构 — 箭头对准标题中心，转化率在漏斗条区居中（对齐知力页） */}
              {nextKr && (() => (
                <div className="flex items-center gap-2.5 py-1.5 text-[11px]">
                  <div className="w-[128px] flex-shrink-0 flex items-center justify-center">
                    <svg className="w-3 h-3" style={{ color: '#8a9491' }} fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 5v14M5 12l7 7 7-7" />
                    </svg>
                  </div>
                  <div className="flex-1 flex items-center justify-center min-w-0">
                    <span
                      className="font-bold tabular-nums"
                      style={{ color: lowConv ? RED_RISK : '#8a9491' }}>
                      {conv ?? 0}%
                    </span>
                  </div>
                  <div className="w-[48px] flex-shrink-0 invisible" aria-hidden="true"></div>
                </div>
              ))()}
            </div>
          );
        })}
      </div>
    );
  };

  /* ===== 关键瓶颈提示 helper（独立于渲染器，用于放在卡片下方） ===== */
  // 计算相邻 KR 间转化率，找出最低的一环；适用于 funnel / dashboard / milestone 任何有 ≥2 个 KR 的模式
  const renderWorkBottleneck = (o, COLOR) => {
    const krs = o.krs || [];
    const conversions = [];
    for (let i = 0; i < krs.length - 1; i++) {
      const curr = krs[i], next = krs[i + 1];
      if (!curr || !next || !curr.v || curr.v <= 0) continue;
      const rate = Math.round((next.v / curr.v) * 100);
      conversions.push({ from: curr.t, to: next.t, rate });
    }
    if (conversions.length === 0) return null;
    const minConv = conversions.reduce((a, b) => a.rate < b.rate ? a : b);
    const suggestion = `优先优化「${minConv.to}」，提升这一环的产出质量`;
    return (
      <div className="flex items-start gap-2 mx-1 px-3 pt-2.5 pb-2 rounded-lg"
        style={{ background: 'rgba(255,59,48,0.06)', border: '1px solid rgba(255,59,48,0.18)' }}>
        {/* 三角警告标：始终与「关键瓶颈」四个字的 11px/15px 行高几何中心对齐
            items-start 前提下：
            行高 15.4px → 中心 = 7.7px；SVG 14px → 自身中心 7px；偏移差 = 0.7px，
            用 mt-[0.5px] 再微调 0.5px 到 ~7.5px 中心，与「关/键/瓶/颈」四字笔画中心像素对齐 */}
        <svg className="w-[14px] h-[14px] flex-shrink-0 mt-[0.5px]" fill={RED} viewBox="0 0 24 24">
          <path d="M12 2.5c-.6 0-1.1.3-1.4.8L1.5 19.3c-.3.5-.1 1.1.3 1.4.2.2.5.3.8.3h18.8c.3 0 .6-.1.8-.3.5-.3.6-.9.3-1.4L13.4 3.3c-.3-.5-.8-.8-1.4-.8z"/><path d="M12 9v4.5M12 17.5v.01" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
        <div className="min-w-0 flex-1 text-[11px] leading-[1.4]">
          <span className="font-bold text-ink-700">关键瓶颈：</span>
          <span className="text-ink-600">
            从「<span style={{ color: RED_DATA, fontWeight: 700 }}>{minConv.from}</span>」
            到「<span style={{ color: RED_DATA, fontWeight: 700 }}>{minConv.to}</span>」
            转化率
            <span style={{ color: RED_RISK, fontWeight: 800 }}> {minConv.rate}% </span>
            — {suggestion}
          </span>
        </div>
      </div>
    );
  };

  /* ============================================================
   * 子渲染器 #2：Dashboard 仪表盘（原名KPI仪表盘）
   * 强调：先 O 统领（已在上层 renderObjective 渲染），下方为 KPI 条目并排网格
   * 无漏斗转化率；风险色直接编码 KR 进度与时间锚点的落差
   * ============================================================ */
  const renderDashboardRows = (o, gs, goalIdx) => {
    const krs = o.krs || [];
    const items = krs.map((kr, i) => {
      const krPct = pct(kr.v, kr.tgt);
      const microTA = kr.dueBy ? calcTimeAnchor(kr.dueBy, o.createdAt || kr.dueBy) : { timePct: gs.timePct };
      const rm = calcRisk(krPct, microTA.timePct, kr.st === 'done');
      return { kr, i, krPct, rm, microTA };
    });
    // 严重/略落后排在前，进行中次之，已完成折叠到最后
    const sorted = [...items].sort((a, b) => {
      const order = { risk: 0, warn: 1, normal: 2, ahead: 3, done: 4 };
      return (order[a.rm.q] ?? 0) - (order[b.rm.q] ?? 0);
    }).map(x => ({
      ...x,
      rm: { ...x.rm, color: x.rm.q === 'risk' ? RED_RISK : x.rm.color },
    }));
    // 拆成未完成组（显示完整）和已完成组（折叠成一行）
    const active = sorted.filter(x => x.rm.q !== 'done');
    const done = sorted.filter(x => x.rm.q === 'done');

    return (
      <div className="flex flex-col pt-2">
        {/* 网格布局：每个 KR = 独立 KPI 小卡；2~3列，紧凑信息密度
         * 头部：KPI名 + 风险徽标
         * 中部：大数字当前/目标 + 大进度条
         * 底部：%数值 + 微截止dueBy（当有）
         */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {active.map(({ kr, i, krPct, rm, microTA }) => {
            const krId = kr.id || `${goalIdx}-${i}`;
            const ma = microActions?.[krId] || [];
            const maDone = ma.filter(x => x.done).length;
            const canBreakdown = rm.q === 'risk' || rm.q === 'warn';
            const dueLbl = kr.dueBy ? daysLabel(calcTimeAnchor(kr.dueBy, o.createdAt || kr.dueBy).days) : null;
            return (
              <div
                key={i}
                className="bg-white rounded-2xl border border-ink-100 px-3 py-3 hover:shadow-[0_2px_6px_rgba(17,24,39,0.05)] transition-shadow cursor-pointer"
                onClick={() => onKrEdit?.(goalIdx, i, kr)}
                style={{
                  borderLeft: `3px solid ${rm.color}`,
                }}
              >
                {/* 头部：KPI名 + 风险徽标 */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: rm.color }}></span>
                    <span className="text-[11.5px] font-semibold text-[#48484A] truncate leading-tight">{kr.t}</span>
                  </div>
                  <button
                    className="text-[9.5px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap transition flex-shrink-0"
                    style={{ background: rm.color + '1A', color: rm.color }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (canBreakdown) onRiskTagClick?.(goalIdx, i, kr, { title: o.title, deadline: o.deadline, createdAt: o.createdAt }, rm);
                    }}
                  >
                    {rm.label}{canBreakdown && ma.length ? ` ${maDone}/${ma.length}` : ''}
                  </button>
                </div>

                {/* 中部：当前/目标大数字 + 进度条 */}
                <div className="flex items-baseline gap-1 mb-1.5">
                  <span className="text-[18px] font-extrabold tabular-nums text-ink-900 leading-none">{kr.v}{kr.u}</span>
                  <span className="text-[11px] font-medium text-ink-400">/</span>
                  <span className="text-[11px] font-medium text-ink-500 tabular-nums">{kr.tgt}{kr.u}</span>
                  <span className="ml-auto text-[12px] font-extrabold tabular-nums leading-none" style={{ color: rm.color }}>
                    {krPct}%
                  </span>
                </div>
                <div className="w-full">
                  <ProgressBar value={krPct} color={rm.color} />
                </div>

                {/* 底部：时间进度 vs KR 落差微提示 + dueBy */}
                <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-dashed border-ink-100">
                  {microTA.timePct !== null ? (
                    <span className="text-[9.5px] font-semibold" style={{ color: krPct < microTA.timePct - 5 ? RED_RISK : '#8a9491' }}>
                      时间 {microTA.timePct}% {krPct < microTA.timePct - 5 ? `↓${microTA.timePct - krPct}%` : krPct > microTA.timePct + 5 ? `↑${krPct - microTA.timePct}%` : '节奏匹配'}
                    </span>
                  ) : <span className="text-[9.5px] text-ink-400">长期KPI</span>}
                  {dueLbl && (
                    <span className={`text-[9.5px] font-semibold ${dueLbl.cls}`}>📅 {dueLbl.text}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* 已完成折叠单行组（所有已完成 KPI 合并一行） */}
        {done.length > 0 && (
          <div className="mt-3 px-3 py-2 rounded-lg bg-accent-green/[0.04] border border-accent-green/15 flex items-center gap-2 flex-wrap">
            <span className="text-[10.5px] font-bold text-accent-green">✓ 已达成 KPI {done.length} 项：</span>
            {done.map(({ kr, i }) => (
              <span key={i} className="inline-flex items-center gap-1 text-[10.5px] text-ink-500 line-through font-medium px-1.5 py-0.5 rounded bg-ink-50">
                {kr.t}
                <span className="text-accent-green tabular-nums no-underline font-bold">{kr.v}/{kr.tgt}{kr.u}</span>
              </span>
            ))}
          </div>
        )}

        <div className="mt-3">
          <AddButton compact label="添加 KPI 条目" onClick={() => onKrAdd?.(goalIdx)} />
        </div>
      </div>
    );
  };

  /* ============================================================
   * 子渲染器 #3：Milestone 里程碑门
   * 结构：阶段门编号 ● 标题 + 产出物 + 验收通过勾选
   * 每个里程碑显示：startedAt / 产出物描述 / 验收状态
   * ============================================================ */
  const renderMilestoneRows = (o, gs, goalIdx) => {
    const krs = o.krs || [];
    // 用 st==done 表示已通过门；doing=进行中；tg/pending=未开始
    return (
      <div className="flex flex-col pt-2">
        {/* 表头 */}
        <div className="flex items-center gap-3 px-1 py-1.5 rounded-t-lg bg-ink-50/50 text-[11px] font-bold text-ink-500">
          <div className="w-[22px] text-center">门</div>
          <div className="flex-1 min-w-0 pl-1">里程碑</div>
          <div className="w-[60px] text-center">阶段进度</div>
          <div className="w-[42px] text-right pr-1">验收</div>
          <div className="w-[56px] text-right pr-1">截止</div>
        </div>

        {krs.map((kr, i) => {
          const krPct = pct(kr.v, kr.tgt);
          const microTA = kr.dueBy ? calcTimeAnchor(kr.dueBy, o.createdAt || kr.dueBy) : { timePct: gs.timePct, days: null };
          const rm = calcRisk(krPct, microTA.timePct, kr.st === 'done');
          const rmColor = rm.q === 'risk' ? RED_RISK : rm.color;
          const isDone = kr.st === 'done';
          const dueLbl = microTA.days !== undefined ? daysLabel(microTA.days) : daysLabel(gs.days);
          return (
            <div
              key={i}
              className="flex items-center gap-3 px-1 py-2 rounded-xl hover:bg-ink-50/60 cursor-pointer border-b border-ink-100 last:border-b-0 transition-colors"
              onClick={() => onKrEdit?.(goalIdx, i, kr)}
            >
              {/* 门编号 + 连接线：未通过 空心→半实；通过 实心绿 */}
              <div className="w-[22px] flex justify-center">
                <div
                  className="w-6 h-6 rounded-full grid place-items-center font-extrabold text-[10px] flex-shrink-0"
                  style={{
                    background: isDone ? 'rgba(52,199,89,0.13)' : `${moduleRgba('work', 0.08)}`,
                    color: isDone ? '#34C759' : rmColor,
                    border: `1.5px solid ${isDone ? '#34C759' : rmColor}`,
                  }}
                >
                  {isDone ? (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 13l4 4L19 7"/></svg>
                  ) : String(i + 1)}
                </div>
              </div>
              {/* 里程碑标题（O 的阶段子项） */}
              <div className="flex-1 min-w-0 pl-1">
                <div className={`text-[11.5px] font-semibold truncate leading-tight ${isDone ? 'text-ink-400 line-through' : 'text-[#48484A]'}`}>
                  {kr.t}
                </div>
                {!isDone && kr.v !== undefined && kr.tgt && (
                  <div className="text-[9.5px] font-medium text-ink-400 mt-0.5 truncate">
                    当前进展 {kr.v}/{kr.tgt}{kr.u} · {rm.label}
                  </div>
                )}
              </div>
              {/* 阶段进度条（简单，因为门控是布尔通过/不通过，进度为中间值） */}
              <div className="w-[60px] grid place-items-center">
                <div className="w-[52px] h-1.5 rounded-full bg-ink-100 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${krPct}%`, background: isDone ? '#34C759' : rmColor }}></div>
                </div>
              </div>
              {/* 验收门结果 */}
              <div className="w-[42px] text-right pr-1">
                {isDone ? (
                  <span className="tag tag-g" style={{ fontSize: '9.5px' }}>已通过</span>
                ) : krPct >= 100 ? (
                  <span className="tag tag-y" style={{ fontSize: '9.5px' }}>待验收</span>
                ) : kr.st === 'tg' || kr.st === 'pending' ? (
                  <span className="tag tag-n" style={{ fontSize: '9.5px' }}>未开启</span>
                ) : (
                  <span className="tag tag-b" style={{ fontSize: '9.5px' }}>推进中</span>
                )}
              </div>
              {/* 截止 */}
              <div className={`w-[56px] text-right pr-1 text-[10.5px] font-medium tabular-nums ${dueLbl.cls}`}>
                {dueLbl.text}
              </div>
            </div>
          );
        })}

        <div className="mt-3">
          <AddButton compact label="添加阶段里程碑" onClick={() => onKrAdd?.(goalIdx)} />
        </div>
      </div>
    );
  };

  /* —— 🎯 单次事件型范式（event mode）：达成点直接结束 —— */
  /* event 模式无 KR 子区，renderObjective 头部 DualMarkerBar 已覆盖进度表达 */
  const renderEventRow = (o, gs, goalIdx) => null;

  /* ============================================================
   * 统一分派器：根据 mode 选渲染器（balance 雷达暂未实现，fallback dashboard）
   * ============================================================ */
  const renderByMode = (o, gs, goalIdx) => {
    switch (gs.mode) {
      case 'event':     return renderEventRow(o, gs, goalIdx);
      case 'funnel':    return renderFunnelRows(o, gs, goalIdx);
      case 'milestone': return renderMilestoneRows(o, gs, goalIdx);
      case 'dashboard': // KPI 仪表盘（已改名）
      case 'balance':   // 平衡雷达暂不做，先退化成仪表盘网格
      default:          return renderDashboardRows(o, gs, goalIdx);
    }
  };

  /* —— 缩略预览卡片（侧栏用） —— */
  const renderThumbCard = (entry) => {
    const { o, gs } = entry;
    const st = _statusOf(o);
    const color = gs.color;
    const krs = o.krs || [];
    const krDone = krs.filter(k => k.st === 'done').length;
    const krTotal = krs.length;
    const avgPct = gs.avgPct;
    const timePct = Math.max(0, Math.min(100, gs.timePct || 0));
    const cleanLabel = (s) => String(s || '').replace(new RegExp(String.raw`^\s*[\u{1F300}-\u{1FAFF}✅📌🎯💡🚀🔥⭐💰🏆📖🧠❤️⚡️🔑🎨📊⏰📝🔍🌱✨]\s*`, 'gu'), '');
    const statusPill = st === 'done'
      ? { txt: '已完成', bg: 'rgba(52,199,89,0.10)', fg: '#34C759' }
      : { txt: '搁置', bg: 'rgba(142,142,147,0.12)', fg: '#8e8e93' };
    return (
      <div
        onClick={() => setDetailGoal(entry)}
        className="group cursor-pointer bg-white rounded-xl border border-ink-100 shadow-[0_1px_2px_rgba(17,24,39,0.04)] hover:shadow-[0_3px_10px_rgba(0,0,0,0.07)] hover:-translate-y-[1px] transition-all p-3 overflow-hidden"
      >
        {/* R1: 色条 + 标题 + 胶囊 */}
        <div className="flex items-start gap-2">
          <div className="shrink-0 w-1 h-8 rounded-full mt-0.5" style={{ background: color }}/>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[13px] font-semibold text-[#1d1d1f] truncate leading-tight"
                title={o.title}>{cleanLabel(o.title)}</span>
              <span className="shrink-0 text-[10.5px] font-medium rounded-full px-1.5 py-[1px]"
                style={{ background: statusPill.bg, color: statusPill.fg }}>{statusPill.txt}</span>
            </div>
            <div className="mt-1 flex items-center gap-1.5 flex-wrap text-[10.5px] text-[#8e8e93] leading-none">
              <span className="font-medium text-[#1d1d1f] tabular-nums">{avgPct}%</span>
              <span className="opacity-40">·</span>
              <span className="tabular-nums">时间 {timePct}%</span>
              <span className="opacity-40">·</span>
              <span className="tabular-nums">KR {krDone}/{krTotal}</span>
            </div>
          </div>
        </div>
        {/* R2: 双进度条（6px，原卡片 8px） */}
        <div className="mt-2 flex flex-col gap-1">
          {/* 时间进度 — 条纹渐变（与原卡一致） */}
          <div className="relative w-full h-[6px] rounded-full overflow-hidden bg-[#f2f2f7]">
            <div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{
                width: `${timePct}%`,
                background: `repeating-linear-gradient(135deg, ${moduleRgba('work', 0.20)}, ${moduleRgba('work', 0.20)} 4px, ${moduleRgba('work', 0.33)} 4px, ${moduleRgba('work', 0.33)} 8px)`,
              }}
            />
          </div>
          {/* 实际完成进度 — 纯色 */}
          <div className="relative w-full h-[6px] rounded-full overflow-hidden bg-[#f2f2f7]">
            <div
              className="absolute inset-y-0 left-0 rounded-full transition-[width]"
              style={{ width: `${avgPct}%`, background: color }}
            />
          </div>
        </div>
      </div>
    );
  };

  /* —— 统一卡壳：进行中（主业/副业两栏）& 非进行中（网格）都用同一 wrapper，⋮红+紧贴加号右边，原 renderObjective 0修改 —— */
  const renderFullCard = (entry, location) => {
    const { o, gs, goalIdx } = entry;
    const collapsed = isCollapsed(o, goalIdx);
    const bottleneck = renderWorkBottleneck(o, gs.color);
    // 右上角三控件（胶囊+加号+⋮）统一 absolute flex 容器，
    // 卡壳统一 p-4(16px) 留白，三者 gap-2(8px) 整体靠右，避免两套坐标系失控
    return (
      <div
        className="bg-white rounded-2xl border border-ink-100 shadow-[0_1px_2px_rgba(17,24,39,0.03)] hover:shadow-[0_2px_6px_rgba(17,24,39,0.05)] transition-shadow p-4 flex flex-col overflow-visible group relative select-none"
        style={{}}
        onDoubleClick={() => toggleCollapsed(o, goalIdx)}
      >
        {/* 折叠态徽章（右上角，控件容器下方避免遮挡） */}
        {collapsed && (
          <span
            className="absolute right-4 bottom-3 text-[10px] font-extrabold px-2 py-[3px] rounded-full select-none pointer-events-none z-10"
            style={{ color: 'rgba(138,148,145,0.85)' }}
            title="双击卡片展开">
            展开 ▾
          </span>
        )}
        {/* 统一容器：KR 计数胶囊（event 模式隐藏） + 添加 KR 加号 + ⋮ 更多菜单
            top-[13px] 对齐 renderObjective 标题基线（标题 top=16 中线=25，按钮中心=13+14=27） */}
        <div className="absolute right-3 top-[13px] z-20 flex items-center gap-2">
          {/* KR 计数胶囊：krTotal=0 时隐藏（单次事件型无需 KR 拆解） */}
          {gs.krTotal > 0 && (
            <span
              className="inline-flex items-center px-3 h-[24px] rounded-full text-[11px] font-semibold tabular-nums leading-none flex-shrink-0"
              style={{ background: `${moduleRgba('work', 0.08)}`, color: gs.color }}>
              <span className="font-extrabold">{gs.krDone}</span>
              <span className="mx-0.5 opacity-50">/</span>
              <span className="opacity-70">{gs.krTotal}</span>
            </span>
          )}
          {/* ➕ 添加 KR：圆角方形 28×28 */}
          <button
            onClick={() => onKrAdd?.(goalIdx)}
            className="w-7 h-7 rounded-lg grid place-items-center transition hover:brightness-110 active:scale-95 flex-shrink-0"
            style={{ backgroundColor: `${moduleRgba('work', 0.07)}` }}
            title="添加 KR">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={gs.color} strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
          </button>
          {/* ⋮ 更多菜单 */}
          {renderCardMenu({ entry, location })}
        </div>
        {renderObjective(o, gs, goalIdx)}
        {!collapsed && (
          <div className="flex-1 min-h-0 pt-3 overflow-y-auto">
            {renderByMode(o, gs, goalIdx)}
          </div>
        )}
        {!collapsed && bottleneck && <div className="mt-3">{bottleneck}</div>}
      </div>
    );
  };

  const activeMain = partitionedGoals.active.filter(e => !!e.o.core);
  const activeSide = partitionedGoals.active.filter(e => !e.o.core);
  const totalMain = dynWk.filter(o => !!o.core).length;
  const totalSide = dynWk.filter(o => o.core === false).length;

  return (
    <div className="flex flex-col gap-4 items-start">
      {/* ========== Header · 书架风（色条 + 标题·共N项 左边）/（3 Tab·进行中·已完成·已归档 标题右边）/（右操作按钮 蓝色）========== */}
      <div className="w-full glass-card rounded-2xl p-4">
        <div className="flex items-center gap-3 flex-wrap">
          {/* 左：色条 + 标题(右击编辑) + 主业·N | 副业·N
              gap-3(12px) + p-4(16px) + 色条5px = 33px，与下方卡片标题 p-4(16)+色条(5)+gap-3(12)=33px 完全一致 */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <span className="w-[5px] h-[18px] rounded-full flex-shrink-0" style={{ background: RED }}></span>
            {titleEditing ? (
              <input
                autoFocus
                defaultValue={localTitle}
                onBlur={(e) => {
                  const v = e.target.value.trim() || `${year}年 · 工作目标`;
                  setLocalTitle(v);
                  setTitleEditing(false);
                  // 写穿 localStorage 缓存：下次打开首屏直接显示自定义标题（不闪默认值）
                  try { localStorage.setItem(WORK_TITLE_CACHE, v); } catch { /* ignore */ }
                  // 持久化到 D1，刷新/重开后保持（须带 X-Unlock-Token，否则 401 静默失败）
                  fetch('/api/userSettings/set', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'X-Unlock-Token': localStorage.getItem('pw_unlock_token') || '',
                    },
                    body: JSON.stringify({ k: 'annual_work_title', v }),
                  }).catch(() => {});
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.target.blur(); } else if (e.key === 'Escape') { setTitleEditing(false); } }}
                onClick={(e) => e.stopPropagation()}
                className="text-[15.5px] font-bold text-ink-900 leading-none bg-transparent border border-[#FF4035] rounded px-1 py-0 outline-none min-w-[120px]"
              />
            ) : (
              <span
                className="text-[15.5px] font-bold text-ink-900 leading-none whitespace-nowrap cursor-default"
                onContextMenu={(e) => { e.preventDefault(); setTitleEditing(true); }}
                title="右击编辑标题"
              >{localTitle}</span>
            )}
            <span className="text-[11px] text-ink-400 tabular-nums leading-none whitespace-nowrap">
              主业 · {totalMain}
              <span className="mx-1 opacity-40">|</span>
              副业 · {totalSide}
            </span>
          </div>

          {/* 中：3 Tab（标题右边）—— 书架同款 pill 样式 */}
          <div className="flex items-center gap-1 ml-auto flex-shrink-0" style={{ marginRight: 0 }}>
            {(() => {
              const TABS = [
                { key: 'active', lb: '进行中', col: RED_DATA,    n: partitionedGoals.active.length },
                { key: 'done',   lb: '已完成', col: '#34C759', n: partitionedGoals.done.length   },
                { key: 'shelf',  lb: '已归档', col: '#64748b', n: partitionedGoals.shelf.length  },
              ];
              return TABS.map(t => {
                const active = workTab === t.key;
                const activeBg = active ? RED_DATA : 'transparent';
                const activeFg = active ? '#ffffff' : t.col;
                return (
                  <button
                    key={t.key}
                    onClick={() => setWorkTab(t.key)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[10px] transition-all duration-150"
                    style={{
                      background: active ? activeBg : 'transparent',
                      color: active ? activeFg : '#64748b',
                      fontWeight: active ? 700 : 500,
                      fontSize: '11.5px',
                      boxShadow: active ? 'none' : 'inset 0 0 0 1px rgba(15,23,42,0.05)',
                    }}>
                    <span className="relative w-[11px] h-[11px] rounded-full flex-shrink-0 flex items-center justify-center"
                      style={{ background: active ? 'rgba(255,255,255,0.25)' : (t.col + '22') }}>
                      <span className="w-[5.5px] h-[5.5px] rounded-full" style={{ background: active ? '#ffffff' : t.col }}></span>
                    </span>
                    <span>{t.lb}</span>
                    <span className="inline-flex items-center justify-center min-w-[17px] h-[15px] px-1 rounded-full text-[10px] font-bold tabular-nums leading-none"
                      style={{
                        background: active ? 'rgba(255,255,255,0.28)' : 'rgba(15,23,42,0.05)',
                        color: active ? '#ffffff' : '#64748b',
                      }}>
                      {t.n}
                    </span>
                  </button>
                );
              });
            })()}
          </div>

          {/* 右：蓝色操作按钮组（与书架同尺寸 26×26 blue10 bg）—— 新建目标 + 刷新样式占位（无多余功能） */}
          <div className="flex items-center gap-1 ml-3 flex-shrink-0">
            <button
              onClick={() => onGoalAdd?.()}
              className="inline-flex items-center justify-center w-[26px] h-[26px] rounded-lg transition flex-shrink-0"
              style={{ color: RED, background: `${moduleRgba('work', 0.10)}` }}
              title="新建目标">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" strokeLinecap="round"/></svg>
            </button>
          </div>
        </div>
      </div>

      {/* ========== Main：根据 Tab 渲染 ========== */}
      {/* —— Tab 1：进行中 → 最原始排版 · 左主业 / 右副业 50%：50% 两栏 —— */}
      {workTab === 'active' && (
        <div className="w-full grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* 主业 */}
          <div className="w-full flex flex-col gap-4">
            {activeMain.length === 0 ? (
              <div className="w-full glass-card rounded-2xl p-8 flex flex-col items-center justify-center text-center">
                <div className="text-[14px] font-semibold text-[#1d1d1f] mb-1">暂无主业目标</div>
                <div className="text-[12px] text-[#8e8e93]">点右上角 +，分组选「主业」后保存</div>
              </div>
            ) : activeMain.map(entry => renderFullCard(entry, 'active'))}
          </div>
          {/* 副业 */}
          <div className="w-full flex flex-col gap-4">
            {activeSide.length === 0 ? (
              <div className="w-full glass-card rounded-2xl p-8 flex flex-col items-center justify-center text-center">
                <div className="text-[14px] font-semibold text-[#1d1d1f] mb-1">暂无副业目标</div>
                <div className="text-[12px] text-[#8e8e93]">点右上角 +，分组选「副业」后保存</div>
              </div>
            ) : activeSide.map(entry => renderFullCard(entry, 'active'))}
          </div>
        </div>
      )}

      {/* —— Tab 2：已完成 → Master-Detail（左缩略卡扫描 · 右完整卡详情）—— */}
      {workTab === 'done' && (
        partitionedGoals.done.length === 0 ? (
          <div className="w-full glass-card rounded-2xl p-10 flex flex-col items-center justify-center text-center">
            <div className="text-[15px] font-semibold text-[#1d1d1f] mb-1">暂无已完成目标</div>
            <div className="text-[12.5px] text-[#8e8e93]">任意目标右上角 ⋮ → 已完成</div>
          </div>
        ) : (
        <div className="w-full grid grid-cols-2 gap-4 items-start">
          {/* 左栏 Master · 缩略卡列表（内缩圆角块，间距分组，无边框线） */}
          <div className="bg-white rounded-2xl border border-ink-100 shadow-[0_1px_2px_rgba(17,24,39,0.03)] p-1.5 flex flex-col gap-0.5">
            {partitionedGoals.done.map(entry => {
              const k = makeGoalKey(entry.o, entry.goalIdx);
              const isSel = selectedDoneKey === k;
              const start = entry.o.createdAt ? String(entry.o.createdAt).slice(0,10) : '';
              const end = entry.o.deadline || '';
              const startShort = start ? start.slice(5) : '—';
              const endShort = end ? end.slice(5) : '—';
              return (
                <div
                  key={'tn-' + k}
                  onClick={() => setSelectedDoneKey(k)}
                  className={`relative flex items-center gap-3 px-2.5 py-2.5 rounded-xl cursor-pointer transition-all duration-150 ${
                    isSel ? 'bg-white' : 'hover:bg-ink-50'
                  }`}
                  style={isSel ? { boxShadow: 'inset 0 0 0 1px rgba(250,80,62,0.35), 0 2px 8px rgba(250,80,62,0.12)' } : undefined}
                >
                  <div className="w-[18px] h-[18px] rounded-full grid place-items-center bg-[#34C759] text-white flex-shrink-0" style={{ boxShadow: 'inset 0 0 0 1px rgba(52,199,89,.5)' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 13l4 4L19 7"/></svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[16px] font-bold text-ink-900 truncate leading-tight">{entry.o.title}</div>
                    <div className="text-[10.5px] font-medium text-[#8e8e93] tabular-nums mt-[2px]">{startShort} → {endShort}</div>
                  </div>
                  <div style={{ width: 28, flexShrink: 0 }}>
                    {renderCardMenu({ entry, location: 'done' })}
                  </div>
                </div>
              );
            })}
          </div>
          {/* 右栏 Detail · 完整卡结构（复用 renderFullCard + 四模式渲染器 0 修改） */}
          <div>
            {selectedDoneEntry && renderFullCard(selectedDoneEntry, 'done')}
          </div>
        </div>
        )
      )}

      {/* —— Tab 3：已归档 → 单列 / 双列网格 完整原卡（搁置归档 快捷取消归档）—— */}
      {workTab === 'shelf' && (
        <div className="w-full grid grid-cols-1 min-[1100px]:grid-cols-2 gap-4">
          {partitionedGoals.shelf.length === 0 ? (
            <div className="w-full glass-card rounded-2xl p-10 flex flex-col items-center justify-center text-center col-span-full">
              <div className="text-[15px] font-semibold text-[#1d1d1f] mb-1">暂无已归档目标</div>
              <div className="text-[12.5px] text-[#8e8e93]">任意目标右上角 ⋮ → 已归档，或超期自动进入</div>
            </div>
          ) : partitionedGoals.shelf.map(entry => (
            <div key={'shelf-' + (entry.o.id || entry.o.title + entry.goalIdx)}>
              {renderFullCard(entry, 'shelf')}
            </div>
          ))}
        </div>
      )}

      {/* ========== 详情弹窗（缩略卡点击 → 完整原卡 0 修改展示） ========== */}
      {detailGoal && (() => {
        const { o, gs, goalIdx } = detailGoal;
        const bottleneck = renderWorkBottleneck(o, gs.color);
        const st = _statusOf(o);
        const statusPill = st === 'done'
          ? { txt: '已完成', bg: 'rgba(52,199,89,0.10)', fg: '#34C759', icon: '✅' }
          : { txt: '搁置归档', bg: 'rgba(142,142,147,0.12)', fg: '#8e8e93', icon: '📦' };
        const stop = (e) => e.stopPropagation();
        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.42)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
            onClick={() => setDetailGoal(null)}
          >
            <div className="w-full max-w-[720px] max-h-[90vh] flex flex-col bg-[#f5f5f7] rounded-2xl overflow-hidden shadow-[0_24px_80px_rgba(0,0,0,0.24)]"
              onClick={stop}>
              {/* Modal Header */}
              <div className="shrink-0 flex items-center gap-3 px-5 py-3.5 border-b border-[#e5e5ea] bg-white/80 backdrop-blur">
                <div className="shrink-0 w-1 h-8 rounded-full" style={{ background: gs.color }}/>
                <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                  <h3 className="text-[17px] font-semibold text-[#1d1d1f] truncate leading-tight" title={o.title}>{o.title}</h3>
                  <span className="shrink-0 text-[11.5px] font-medium rounded-full px-2 py-[2px] flex items-center gap-1"
                    style={{ background: statusPill.bg, color: statusPill.fg }}>
                    <span>{statusPill.icon}</span>{statusPill.txt}
                  </span>
                </div>
                {st !== 'active' && (
                  <button onClick={() => { onGoalUnarchive && onGoalUnarchive(o.id || o.title); setDetailGoal(null); }}
                    className="shrink-0 h-8 px-3 rounded-full flex items-center gap-1.5 text-[12.5px] font-medium transition-colors"
                    style={{ background: 'rgba(var(--s-rgb),0.08)', color: 'var(--s-main)' }}>
                    <span>↺</span><span>取消归档</span>
                  </button>
                )}
                <div className="shrink-0 -mr-1">
                  {renderCardMenu({ entry: detailGoal, location: 'modal' })}
                </div>
                <button onClick={() => setDetailGoal(null)}
                  className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-[#8e8e93] hover:text-[#1d1d1f] hover:bg-[#f2f2f7] transition-colors"
                  title="关闭">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-5">
                <div className="bg-white rounded-2xl border border-ink-100 shadow-[0_1px_2px_rgba(17,24,39,0.03)] p-4 flex flex-col overflow-hidden">
                  {renderObjective(o, gs, goalIdx)}
                  <div className="flex-1 min-h-0 pt-3 overflow-y-auto">
                    {renderByMode(o, gs, goalIdx)}
                  </div>
                  {bottleneck && <div className="mt-3">{bottleneck}</div>}
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

/* ---------- 11. 视图 · 生活 ---------- */
/* 生活子类目图标：恢复改版前的类目专属图标（关系/美食/旅游/电影/购物），宠物=爪印，
   用户新建类目兜底=标签图标；统一 stroke=currentColor 跟随文字色。
   宠物按名称匹配（用户自建类目的 key 是随机 uid，不固定为 'pet'） */
