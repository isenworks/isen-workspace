import { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { API } from '../api/client.js';
import { cachedLoad, cachePeek, cacheClear, loadingGate } from '../utils/date.js';
import { store } from '../utils/store.js';

export default function StatsBar({ date, range, view, refreshSignal, onViewChange, onNew, onSummaryToggle, showSummary }) {
  const [rawData, setRawData] = useState({ schedules: [], tasks: [], habits: [] });
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const anchorRef = useRef(null);    // "新建"按钮容器,用于定位
  const portalRef = useRef(null);    // Portal 中下拉菜单的根节点,用于点击外部判定
  const inFlightRef = useRef(null);
  const cacheRef = useRef(new Map());

  // ==== 总结下拉菜单 ====
  const [sumMenuOpen, setSumMenuOpen] = useState(false);
  const [sumMenuPos, setSumMenuPos] = useState({ top: 0, left: 0 });
  const sumAnchorRef = useRef(null);
  const sumPortalRef = useRef(null);
  const [docLinks, setDocLinks] = useState([]);
  const [editingDoc, setEditingDoc] = useState(null); // null=未编辑, {id:'new',...}=新增, {id,...}=编辑

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
    const CACHE_TTL = 1000;
    const peeked = cachePeek(cacheKey, cacheRef, CACHE_TTL);
    if (peeked) {
      setRawData(peeked.value);
      setLoading(false);
      return;
    }
    const hasData = rawData.schedules.length > 0 || rawData.tasks.length > 0 || rawData.habits.length > 0;
    const inFlight = inFlightRef.current && inFlightRef.current.key === cacheKey;
    const gate = loadingGate(setLoading, 80);
    if (!hasData && !inFlight) gate.require();

    cachedLoad(cacheKey, async () => {
      const [sched, tasks, habits] = await Promise.all([
        API.schedules.list({ from: range.from, to: range.to }),
        API.tasks.list({ from: range.from, to: range.to }),
        API.habits.list({ date })
      ]);
      return { schedules: sched.schedules, tasks: tasks.tasks, habits: habits.habits };
    }, inFlightRef, cacheRef, CACHE_TTL).then(data => {
      setRawData(data);
      gate.done();
    }).catch(e => { console.error(e); gate.done(); });
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
    } else if (patch.type === 'reload') {
      cacheClear(cacheRef, 'sb:');
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

  // ==== 在线文档链接管理（localStorage） ====
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

  // ==== 总结下拉：定位 ====
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

  // ==== 总结下拉：点击外部关闭 ====
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

  // 基于本地数据计算统计
  const stats = (() => {
    const allSched = rawData.schedules;
    const allTasks = rawData.tasks;

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

    // 核心进度 = 重点事项 + 习惯打卡
    const coreDone = keyDone + habitDone;
    const coreTotal = keyTotal + habitTotal;

    // 重点的紧急/重要未完成数
    const urgent = catCount(focusSched, 1) - catDone(focusSched, 1);
    const high = catCount(focusSched, 2) - catDone(focusSched, 2);

    // 普通待办数（灰色）：非重点、非紧急、非重要
    const todayTasks = view === 'today'
      ? allTasks.filter(t => t.date === date)
      : allTasks;
    const normalSched = catCount(focusSched, 3) - catDone(focusSched, 3);
    const normalTasks = todayTasks.length - todayTasks.filter(t => t.is_done).length;
    const normal = normalSched + normalTasks;

    return {
      coreDone, coreTotal,
      keyDone, keyTotal,
      habitDone, habitTotal,
      urgent, high, normal
    };
  })();

  const pct = stats.coreTotal > 0 ? Math.round((stats.coreDone / stats.coreTotal) * 100) : 0;

  const MENU_ITEMS = [
    { k: 'schedule', label: '新建事项', icon: '📅' },
    { k: 'habit', label: '新建习惯', icon: '🎯' },
  ];

  return (
    <>
    <div className="glass-card px-5 py-3 flex items-center justify-between gap-4">
      <div className="flex items-center gap-5 flex-1 min-w-0">
        <div className="tab-group flex-shrink-0">
          <button className={view === 'today' ? 'active' : ''} onClick={() => onViewChange('today')}>今日</button>
          <button className={view === 'week' ? 'active' : ''} onClick={() => onViewChange('week')}>本周</button>
          <button className={view === 'month' ? 'active' : ''} onClick={() => onViewChange('month')}>本月</button>
        </div>

        {/* 数据模块 — 移到本月右边（与原总结位置互换） */}
        {loading ? (
          <div className="flex items-center gap-3 flex-1 max-w-[420px]">
            <div className="sk-line sk-bar rounded-full w-full" style={{maxWidth:'380px', height:'30px'}}></div>
          </div>
        ) : (
          <div className="flex items-center gap-3 flex-1 min-w-0 justify-start">
            <div className="flex items-center gap-4 px-3 py-1.5 rounded-full" style={{background:'rgba(120,120,128,0.08)'}}>
              {/* 核心进度 */}
              <div className="flex items-center gap-1.5">
                <span className="text-[12px] font-medium text-[#1c1c1e]">{stats.coreDone}</span>
                <span className="text-[12px] font-medium text-[#1c1c1e]">/</span>
                <span className="text-[12px] font-medium text-[#1c1c1e]">{stats.coreTotal}</span>
                <div className="w-20 h-1.5 rounded-full ml-1" style={{background:'#e5e5ea'}}>
                  <div className="h-full rounded-full transition-all" style={{width:`${pct}%`,background:'#007aff'}}></div>
                </div>
              </div>
              <div className="w-0.5 h-4 rounded-full" style={{background:'rgba(120,120,128,0.2)'}}></div>
              {/* 重点分类未完成 + 常规 + 习惯 */}
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
                  <span className="w-1.5 h-1.5 rounded-[2px]" style={{background:'#8e8e93'}}></span>
                  <span className="text-[12px] font-medium text-[#1c1c1e]">{stats.normal}</span>
                </div>
                {/* 习惯在最右边：统一小圆点样式 */}
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full" style={{background:'#007aff'}}></span>
                  <span className="text-[12px] font-medium text-[#1c1c1e]">{stats.habitDone} / {stats.habitTotal}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 总结按钮 — 移到最右边（删除"新建"按钮） */}
      <div ref={sumAnchorRef} className="flex-shrink-0">
        <button
          className="btn-secondary flex items-center gap-1"
          onClick={() => { setSumMenuOpen(v => !v); }}
          style={{
            padding: '4px 13px',
            fontSize: '13px',
            fontWeight: showSummary ? 600 : 500,
            ...(showSummary ? {
              background: '#007aff',
              color: '#fff',
              border: 'none',
              boxShadow: '0 3px 8px rgba(0,122,255,0.25), 0 1px 1px rgba(0,0,0,0.04)',
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
          onClick={() => { setSumMenuOpen(false); onSummaryToggle(); }}
          style={{
            padding: '7px 10px', fontSize: '13px',
            cursor: 'pointer', borderRadius: '8px',
            display: 'flex', alignItems: 'center', gap: '10px',
            fontWeight: showSummary ? 600 : 500,
            color: '#007aff',
            background: showSummary ? 'rgba(0,122,255,0.10)' : 'transparent',
            minHeight: '34px',
            transition: 'background .12s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,122,255,0.08)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = showSummary ? 'rgba(0,122,255,0.10)' : 'transparent'; }}
        >
          <div style={{
            width: '15px', height: '15px', borderRadius: '4px',
            background: 'rgba(0,122,255,0.12)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#007aff" strokeWidth="2.5">
              <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
            </svg>
          </div>
          <span style={{flex:1}}>总结面板</span>
          {showSummary && (
            <span style={{
              fontSize: '10px', fontWeight: 700,
              padding: '2px 7px', borderRadius: '4px',
              background: '#007aff', color: '#fff',
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
              padding: '7px 10px', fontSize: '13px', color: '#007aff',
              cursor: 'pointer', borderRadius: '8px',
              display: 'flex', alignItems: 'center', gap: '10px',
              fontWeight: 500,
              transition: 'background .12s',
              minHeight: '34px',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,122,255,0.08)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <div style={{
              width: '15px', height: '15px', borderRadius: '4px',
              background: 'rgba(0,122,255,0.12)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#007aff" strokeWidth="3.5"><path d="M12 5v14m-7-7h14"></path></svg>
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
            background: 'rgba(0,122,255,0.04)',
            borderRadius: '8px',
            margin: '2px 0',
          }}>
            <div style={{
              fontSize: '11px', fontWeight: 600,
              color: '#007aff', textAlign: 'center',
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
                  background: (!editingDoc.name?.trim() || !editingDoc.url?.trim() || !/^https?:\/\//i.test(editingDoc.url || '')) ? '#a0c8ff' : '#007aff',
                  color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                  transition: 'all .12s',
                }}
                onMouseEnter={(e) => {
                  const disabled = !editingDoc.name?.trim() || !editingDoc.url?.trim() || !/^https?:\/\//i.test(editingDoc.url || '');
                  if (!disabled) e.currentTarget.style.background = '#0066dd';
                }}
                onMouseLeave={(e) => {
                  const disabled = !editingDoc.name?.trim() || !editingDoc.url?.trim() || !/^https?:\/\//i.test(editingDoc.url || '');
                  if (!disabled) e.currentTarget.style.background = '#007aff';
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
