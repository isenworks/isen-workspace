import { useState, useEffect, useCallback, useRef } from 'react';
import { API } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';
import { store } from '../utils/store.js';
import { today as getToday } from '../utils/date.js';
import QuickCapture from '../components/QuickCapture.jsx';
import Modal from '../components/Modal.jsx';
import ScheduleForm, { readCats } from '../components/forms/ScheduleForm.jsx';

const LS_LAYOUT_KEY = 'inbox_layout'; // 'tri' 三分布局 | 'duo' 二分布局（默认）

// D1 datetime('now') 是 UTC（'YYYY-MM-DD HH:MM:SS'），转本地 Date
function parseDbTime(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
  const d = new Date(s);
  return isNaN(d) ? null : d;
}
// 「2026-09-08」（左栏紧凑日期，hover 时 title 显示完整时间）
function fmtDate(s) {
  const d = parseDbTime(s);
  if (!d) return '';
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
// 「2026-09-08 10:01」（完整时间）
function fmtFull(s) {
  const d = parseDbTime(s);
  if (!d) return '';
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
// hover 完整时间（含相对时间提示）
function fmtTooltip(s) {
  const d = parseDbTime(s);
  if (!d) return '';
  const now = new Date();
  const diff = Math.floor((now - d) / 1000);
  let rel;
  if (diff < 60) rel = '刚刚';
  else if (diff < 3600) rel = `${Math.floor(diff / 60)} 分钟前`;
  else if (diff < 86400) rel = `${Math.floor(diff / 3600)} 小时前`;
  else rel = `${Math.floor(diff / 86400)} 天前`;
  return `${fmtFull(s)}（${rel}）`;
}

// hex → rgba（分类 chip 底色/描边，与 ScheduleForm catToStyle 同规则）
function hexToRgba(hex, a = 0.08) {
  const h = (hex || '').replace('#', '');
  if (h.length !== 6) return `rgba(142,142,147,${a})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

// 内容拆分：首行为标题，其余为正文（右栏展示完整记录，标题非必填——单行时仅标题）
function splitContent(content) {
  const s = String(content || '');
  const idx = s.indexOf('\n');
  if (idx === -1) return { title: s, body: '' };
  return { title: s.slice(0, idx), body: s.slice(idx + 1).trim() || '' };
}

// 左栏分组：今天 / 昨天 / 更早
function groupLabel(s) {
  const d = parseDbTime(s);
  if (!d) return '更早';
  const now = new Date();
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, now)) return '今天';
  const y = new Date(now); y.setDate(y.getDate() - 1);
  if (sameDay(d, y)) return '昨天';
  return '更早';
}
const GROUP_ORDER = ['今天', '昨天', '更早'];

/* ============================================================
 * InboxPage · 收集箱（两种布局，可切换、localStorage 记忆、二分布局默认）
 *   三分布局 tri：左栏（页头+快速捕获 / 时间分组想法流）+ 右栏分派工作台
 *   二分布局 duo（默认）：左侧纯事项列表铺满，右侧默认为新增记录面板；
 *                点击左侧事项 → 右侧切换为该事项的详情面板；
 *                收集箱标题旁的笔图标（仅二分布局）回到新增面板
 *   捕获：N 键或输入面板快速收进；分派：空了再派到具体日期的日程
 * ============================================================ */
export default function InboxPage({ onCountChange }) {
  const toast = useToast();
  const [items, setItems] = useState(null);          // null=加载中
  const [busyIds, setBusyIds] = useState(new Set());
  const [selectedId, setSelectedId] = useState(null); // 右栏工作台对应的条目
  const [triage, setTriage] = useState(null);        // { cat } 右栏分派状态（随选中条目切换）
  const [panelOpen, setPanelOpen] = useState(null); // 'cat' | null 标签面板展开态
  const [menuOpenId, setMenuOpenId] = useState(null); // 左栏三个点菜单打开的条目 id
  const [detail, setDetail] = useState(null);        // 详细分派：ScheduleForm 预填
  // 右栏内容就地编辑（点击标题/正文直接编辑，Esc 取消、失焦保存）
  const [rEditing, setREditing] = useState(false);
  const [rDraft, setRDraft] = useState('');
  const rEditRef = useRef(null);
  const rEscapeRef = useRef(false);
  // 布局：duo（二分布局，默认）| tri（三分布局）；选择存 localStorage，跨登录/刷新记忆
  const [layout, setLayout] = useState(() => {
    try { return localStorage.getItem(LS_LAYOUT_KEY) === 'tri' ? 'tri' : 'duo'; } catch { return 'duo'; }
  });

  const cats = readCats();
  const catOf = (v) => cats.find(c => c.v === Number(v)) || null;
  const isDuo = layout === 'duo';

  function switchLayout(next) {
    setLayout(next);
    try { localStorage.setItem(LS_LAYOUT_KEY, next); } catch {}
    // 切到二分布局：回到「新增面板」初始态（无选中）
    if (next === 'duo') setSelectedId(null);
  }

  const load = useCallback(async () => {
    try {
      const r = await API.inbox.list();
      setItems(r.items || []);
      onCountChange?.((r.items || []).length);
    } catch (e) {
      setItems([]);
      toast.error(e.message || '加载失败');
    }
  }, [toast, onCountChange]);

  useEffect(() => { load(); }, [load]);

  const selected = (items || []).find(it => it.id === selectedId) || null;

  // 选中变化 → 右栏重置（编辑态退出、面板收起、分派状态归位）
  useEffect(() => {
    setPanelOpen(null);
    setREditing(false);
    if (selected) {
      setTriage({ cat: selected.category != null ? Number(selected.category) : 3 });
    } else {
      setTriage(null);
    }
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  function markBusy(id, on) {
    setBusyIds(prev => {
      const n = new Set(prev);
      if (on) n.add(id); else n.delete(id);
      return n;
    });
  }

  // ===== 右栏就地编辑内容（点击标题/正文进入，失焦保存、Esc 取消） =====
  function startREdit() {
    if (!selected) return;
    setREditing(true);
    setRDraft(selected.content);
    requestAnimationFrame(() => rEditRef.current?.focus());
  }
  async function commitREdit() {
    const v = rDraft.trim();
    setREditing(false);
    if (!selected || !v || v === selected.content) return;
    try {
      await API.inbox.update(selected.id, { content: v });
      setItems(prev => prev.map(it => it.id === selected.id ? { ...it, content: v } : it));
    } catch (e) { toast.error(e.message || '保存失败'); }
  }

  // ===== 删除（进回收站） =====
  async function removeItem(item) {
    if (!window.confirm(`删除「${item.content.slice(0, 20)}${item.content.length > 20 ? '…' : ''}」？删除后可在回收站恢复。`)) return;
    markBusy(item.id, true);
    try {
      await API.inbox.remove(item.id);
      setItems(prev => prev.filter(it => it.id !== item.id));
      onCountChange?.(Math.max(0, (items || []).length - 1));
      if (selectedId === item.id) setSelectedId(null);
    } catch (e) {
      toast.error(e.message || '删除失败');
    } finally { markBusy(item.id, false); }
  }

  // ===== 右栏提交分派 =====
  async function process() {
    if (!selected || !triage) return;
    markBusy(selected.id, true);
    try {
      const fields = { title: selected.content, date: getToday(), category: triage.cat };
      await API.inbox.process({ id: selected.id, type: 'schedule', fields });
      setItems(prev => prev.filter(it => it.id !== selected.id));
      onCountChange?.(Math.max(0, (items || []).length - 1));
      store.broadcast({ type: 'reload' }); // 让今日计划的时间轴/重点事项同步刷新
      // 分派后自动选中下一条（三分布局），保持工作流连续；二分布局回新增面板
      const rest = (items || []).filter(it => it.id !== selected.id);
      setSelectedId(isDuo ? null : (rest.length > 0 ? rest[0].id : null));
      const catInfo = catOf(triage.cat);
      toast.success(`已分派到 ${catInfo ? catInfo.label + ' · ' : ''}今天的日程`);
    } catch (e) {
      toast.error(e.message || '分派失败');
    } finally { markBusy(selected.id, false); }
  }

  // 详细分派：ScheduleForm 预填（支持时长/重要性/重复等完整字段）；item 不传时用当前选中条目
  function openDetailFor(item) {
    const it = item || selected;
    if (!it) return;
    setSelectedId(it.id);
    setDetail({
      item: it,
      initial: {
        title: splitContent(it.content).title,
        content: splitContent(it.content).body,
        category: it.id === selectedId ? (triage?.cat ?? (it.category != null ? Number(it.category) : 3)) : (it.category != null ? Number(it.category) : 3),
        date: getToday(),
        start_time: '',
      },
    });
  }

  // ScheduleForm 保存成功 → 回写收集箱条目分派去向
  async function onDetailSaved() {
    const item = detail?.item;
    setDetail(null);
    if (!item) return;
    try {
      await API.inbox.update(item.id, { processed_type: 'schedule' });
      setItems(prev => prev.filter(it => it.id !== item.id));
      onCountChange?.(Math.max(0, (items || []).length - 1));
      if (selectedId === item.id) {
        const rest = (items || []).filter(it => it.id !== item.id);
        setSelectedId(isDuo ? null : (rest.length > 0 ? rest[0].id : null));
      }
      store.broadcast({ type: 'reload' });
      toast.success('已转为日程');
    } catch (e) {
      // 日程已建好，仅回写失败：条目留在收集箱，用户可手动完成，避免产生重复日程
      toast.error('日程已创建，但收集箱状态回写失败');
    }
  }

  // 左栏按时间分组
  const groups = [];
  if (items && items.length > 0) {
    const map = new Map();
    items.forEach(it => {
      const g = groupLabel(it.created_at);
      if (!map.has(g)) map.set(g, []);
      map.get(g).push(it);
    });
    GROUP_ORDER.forEach(g => { if (map.has(g)) groups.push({ label: g, list: map.get(g) }); });
  }

  // 三分布局：默认选中第一条（二分布局初始无选中，右侧为新增面板）
  useEffect(() => {
    if (!isDuo && selectedId == null && items && items.length > 0) {
      setSelectedId(items[0].id);
    }
  }, [items, selectedId, isDuo]);

  // ===== 左栏条目行（三分布局与二分布局共用）：单行缩略（标题优先），圆点+文字垂直居中 =====
  const renderRow = (item) => {
    const busy = busyIds.has(item.id);
    const isSelected = selectedId === item.id;
    const catInfo = catOf(item.category);
    const menuFor = menuOpenId === item.id;
    const sc = splitContent(item.content);
    return (
      <div
        key={item.id}
        onClick={() => !menuFor && setSelectedId(item.id)}
        className={`relative flex items-center gap-2.5 px-2 py-2 rounded-xl transition-all cursor-pointer ${busy ? 'opacity-50 pointer-events-none' : ''}`}
        style={isSelected ? { background: 'rgba(var(--s-rgb),0.08)' } : undefined}
      >
        {/* 主题色圆点（选中态实心，未选中空心；行内垂直居中） */}
        <span
          className="flex-shrink-0 w-[8px] h-[8px] rounded-full transition-colors"
          style={isSelected
            ? { background: 'var(--s-main)' }
            : { background: 'transparent', border: '1.5px solid rgba(var(--s-rgb),0.55)' }}
        ></span>

        {/* 单行缩略内容：有标题显示标题，无标题（首行为空）显示正文首行 */}
        <div className="flex-1 min-w-0 flex items-center gap-1.5">
          <span className="text-[13.5px] leading-snug font-medium text-ink-900 truncate">
            {(sc.title || sc.body || '（空）').slice(0, 60)}
          </span>
          {catInfo && (
            <span className="flex-shrink-0 w-[6px] h-[6px] rounded-full" style={{ background: catInfo.dot }} title={catInfo.label} />
          )}
        </div>

        {/* 日期（最右，hover 显示完整时间） */}
        <span
          className="flex-shrink-0 text-[12px] text-ink-400 tabular-nums"
          title={fmtTooltip(item.created_at)}
        >{fmtDate(item.created_at)}</span>

        {/* 纵向三个点：hover 显示完整时间 + 点击弹出删除/分派菜单 */}
        <div className="relative flex-shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuFor ? null : item.id); }}
            title={fmtTooltip(item.created_at)}
            className="w-6 h-6 rounded-lg flex items-center justify-center text-ink-300 hover:text-ink-600 hover:bg-black/[0.04] transition-colors"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" />
            </svg>
          </button>
          {menuFor && (
            <>
              <div className="fixed inset-0 z-[10]" onClick={(e) => { e.stopPropagation(); setMenuOpenId(null); }} />
              <div className="absolute right-0 top-7 z-[20] w-[120px] py-1 rounded-xl border border-ink-100 bg-white shadow-[0_8px_24px_rgba(0,0,0,0.12)]">
                <button
                  onClick={(e) => { e.stopPropagation(); setMenuOpenId(null); openDetailFor(item); }}
                  className="w-full text-left px-3 py-1.5 text-[12.5px] text-ink-700 hover:bg-ink-50 transition-colors"
                >分派…</button>
                <button
                  onClick={(e) => { e.stopPropagation(); setMenuOpenId(null); removeItem(item); }}
                  className="w-full text-left px-3 py-1.5 text-[12.5px] text-[#FF3B30] hover:bg-[#FF3B300F] transition-colors"
                >删除</button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  // ===== 事项列表（分组卡片，两个布局共用） =====
  const renderList = (fill) => (
    <>
      {items === null ? (
        <div className={`glass-card rounded-2xl p-10 flex items-center justify-center text-[13px] text-ink-400 ${fill ? 'flex-1' : ''}`}>加载中…</div>
      ) : items.length === 0 ? (
        <div className={`glass-card rounded-2xl p-14 flex flex-col items-center justify-center text-center gap-2 ${fill ? 'flex-1' : ''}`}>
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#C7C7CC" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
            <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
          </svg>
          <div className="text-[14px] font-semibold text-ink-900">收集箱是空的</div>
          <div className="text-[12px] text-ink-400">按 <kbd className="px-1 py-px rounded text-[11px] border border-ink-100 bg-white/70">N</kbd> 可随时记录</div>
        </div>
      ) : (
        <div className={`flex flex-col gap-3 ${fill ? 'flex-1 min-h-0' : ''}`}>
          {groups.map((g, gi) => (
            <div key={g.label} className={`glass-card rounded-2xl p-2 ${fill && gi === groups.length - 1 ? 'flex-1' : ''}`}>
              <div className="flex items-center gap-2 px-2 pt-1.5 pb-1">
                <span className="text-[11px] font-semibold text-ink-400 tracking-wide">{g.label}</span>
                <span className="text-[11px] text-ink-300 tabular-nums">{g.list.length}</span>
              </div>
              {g.list.map(renderRow)}
            </div>
          ))}
        </div>
      )}
    </>
  );

  // ===== 页头（色条 + 标题 + 切换器 + [二分布局的笔按钮] + 快捷键 N） =====
  const renderHeader = () => (
    <div className="flex items-center gap-3">
      <span className="w-[5px] h-[20px] rounded-full flex-shrink-0 self-center" style={{ background: 'var(--s-grad-bg)' }}></span>
      <span className="text-[15.5px] font-bold text-ink-900 leading-none flex-shrink-0">收集箱</span>
      {/* 布局切换：紧跟标题 */}
      <div className="flex items-center p-[2px] rounded-lg flex-shrink-0" style={{ background: 'rgba(120,120,128,0.08)' }}>
        <button
          onClick={() => switchLayout('tri')}
          title="三分布局"
          className="px-2 py-1 rounded-md transition-all flex items-center"
          style={layout === 'tri'
            ? { background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', color: 'var(--s-main)' }
            : { color: '#8e8e93' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="9" y1="3" x2="9" y2="21" />
            <line x1="15" y1="3" x2="15" y2="21" />
          </svg>
        </button>
        <button
          onClick={() => switchLayout('duo')}
          title="二分布局"
          className="px-2 py-1 rounded-md transition-all flex items-center"
          style={layout === 'duo'
            ? { background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', color: 'var(--s-main)' }
            : { color: '#8e8e93' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="12" y1="3" x2="12" y2="21" />
          </svg>
        </button>
      </div>
      <div className="flex-1" />
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span className="text-[11px] text-ink-400">快捷键</span>
        <kbd className="px-1.5 py-0.5 rounded-md text-[11px] font-medium tabular-nums border border-ink-100 bg-white/70 text-ink-500">N</kbd>
      </div>
      {/* 笔按钮（仅二分布局）：回到新增面板，主题色实心 */}
      {isDuo && (
        <button
          onClick={() => setSelectedId(null)}
          title="新增记录"
          className="flex-shrink-0 w-[24px] h-[24px] rounded-lg flex items-center justify-center transition-all"
          style={{ background: 'var(--s-grad-bg)', color: '#fff', boxShadow: '0 2px 6px rgba(var(--s-rgb),0.25)' }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
        </button>
      )}
    </div>
  );

  return (
    <div className="flex-1 min-w-0 w-full flex items-stretch gap-4">
      {isDuo ? (
        /* ===== 二分布局：左侧事项列表，右侧编辑面板（新增/选中条目），比例与三分布局一致 ===== */
        <>
          <div className="flex flex-col gap-3 min-w-0" style={{ flex: '1 1 42%', maxWidth: 520 }}>
            <div className="glass-card rounded-2xl p-3">
              {renderHeader()}
            </div>
            {renderList(true)}
          </div>

          {/* 右侧编辑面板：无选中 = 新增（QuickCapture + 标签/保存底栏）；有选中 = 编辑该条目 */}
          <div className="glass-card rounded-2xl p-4 flex flex-col min-w-0" style={{ flex: '1 1 58%' }}>
            {!selected ? (
              <div className="flex-1 flex flex-col min-h-0">
                <div className="flex items-center gap-3 mb-4">
                  <span className="w-[5px] h-[20px] rounded-full flex-shrink-0 self-center" style={{ background: 'var(--s-grad-bg)' }}></span>
                  <span className="text-[15.5px] font-bold text-ink-900 leading-none">新增记录</span>
                </div>
                <QuickCapture onSaved={load} onDispatch={openDetailFor} bare />
              </div>
            ) : (
              <>
                {/* 条目内容：点击直接编辑（标题 + 正文整体），Esc 取消、失焦保存 */}
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-[5px] h-[20px] rounded-full self-start mt-[1px]" style={{ background: 'var(--s-grad-bg)' }}></span>
                  <div className="flex-1 min-w-0">
                    {rEditing ? (
                      <textarea
                        ref={rEditRef}
                        value={rDraft}
                        onChange={(e) => setRDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') { rEscapeRef.current = true; setREditing(false); }
                        }}
                        onBlur={() => {
                          if (rEscapeRef.current) { rEscapeRef.current = false; return; }
                          commitREdit();
                        }}
                        className="w-full bg-transparent outline-none resize-none text-[14px] leading-[22px] text-ink-900 break-words rounded-lg transition-all"
                        style={{ minHeight: 140 }}
                      />
                    ) : (
                      <div className="cursor-text group" onClick={startREdit} title="点击编辑">
                        <div className="text-[14.5px] font-semibold text-ink-900 leading-snug break-words whitespace-pre-wrap">{splitContent(selected.content).title}</div>
                        {splitContent(selected.content).body && (
                          <div className="mt-3 text-[13.5px] text-ink-600 leading-[21px] break-words whitespace-pre-wrap">{splitContent(selected.content).body}</div>
                        )}
                        {catOf(selected.category) && (
                          <div className="flex items-center gap-1 mt-2 text-[11px]" style={{ color: catOf(selected.category).dot }}>
                            <span className="w-[6px] h-[6px] rounded-full" style={{ background: catOf(selected.category).dot }} />
                            {catOf(selected.category).label}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {triage && (
                  <div className="mt-auto">
                    {/* 标签面板：展开时出现在按钮行上方（按钮行位置不动） */}
                    {panelOpen === 'cat' && (
                      <div className="mb-3">
                        <div className="text-[11px] font-semibold text-ink-400 mb-1.5 tracking-wide">标签</div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {cats.map(c => {
                            const on = Number(triage.cat) === c.v;
                            return (
                              <button
                                key={c.v}
                                onClick={() => setTriage(t => ({ ...t, cat: c.v }))}
                                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] transition-all"
                                style={{
                                  background: on ? hexToRgba(c.dot, 0.14) : 'rgba(120,120,128,0.06)',
                                  color: on ? c.dot : '#8e8e93',
                                  border: `1px solid ${on ? hexToRgba(c.dot, 0.55) : 'transparent'}`,
                                  fontWeight: on ? 600 : 400,
                                }}
                              >
                                <span className="w-[7px] h-[7px] rounded-full flex-shrink-0" style={{ background: c.dot }} />
                                {c.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* 固定按钮行：＋标签（展开时变「收起」）/ 分派（打开详细分派弹窗）+ 提交 */}
                    <div className="pt-3 border-t border-ink-100/80 flex items-center gap-1.5 flex-wrap">
                      <button
                        onClick={() => setPanelOpen(panelOpen === 'cat' ? null : 'cat')}
                        className="flex items-center gap-1 text-[12px] font-medium px-2.5 py-1 rounded-full transition-colors"
                        style={{ background: 'rgba(var(--s-rgb),0.1)', color: 'var(--s-main)' }}
                      >
                        {panelOpen === 'cat' ? '收起' : (
                          <>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
                            标签
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => openDetailFor()}
                        className="text-[12px] font-medium px-2.5 py-1 rounded-full transition-colors"
                        style={{ background: 'rgba(var(--s-rgb),0.1)', color: 'var(--s-main)' }}
                      >分派</button>
                      <div className="flex-1" />
                      <button
                        onClick={process}
                        disabled={busyIds.has(selected.id)}
                        className="text-[12.5px] font-semibold px-3.5 py-1.5 rounded-lg transition-all disabled:opacity-40"
                        style={{ background: 'var(--s-main)', color: '#fff', boxShadow: '0 2px 6px rgba(var(--s-rgb),0.25)' }}
                      >{busyIds.has(selected.id) ? '分派中…' : '提交'}</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      ) : (
        /* ===== 三分布局：左栏（页头+快速捕获 / 想法流）+ 右栏分派工作台 ===== */
        <>
          <div className="flex flex-col gap-3 min-w-0" style={{ flex: '1 1 42%', maxWidth: 520 }}>
            {/* 页头 + 快速捕获 */}
            <div className="glass-card rounded-2xl p-4">
              {renderHeader()}
              <div className="mt-3.5 pt-3.5 border-t border-ink-100/80">
                <QuickCapture onSaved={load} onDispatch={openDetailFor} />
              </div>
            </div>
            {renderList(true)}
          </div>

          {/* 右栏：分派工作台 */}
          <div className="glass-card rounded-2xl p-4 flex flex-col min-w-0" style={{ flex: '1 1 58%' }}>
            {!selected ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 p-8">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#C7C7CC" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 11l3 3L22 4" />
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                </svg>
                <div className="text-[13.5px] font-semibold text-ink-900">选择左侧一条想法</div>
                <div className="text-[12px] text-ink-400">在这里分派到具体日期的日程</div>
              </div>
            ) : (
              <>
                {/* 条目内容：点击直接编辑（标题 + 正文整体），Esc 取消、失焦保存 */}
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-[5px] h-[20px] rounded-full self-start mt-[1px]" style={{ background: 'var(--s-grad-bg)' }}></span>
                  <div className="flex-1 min-w-0">
                    {rEditing ? (
                      <textarea
                        ref={rEditRef}
                        value={rDraft}
                        onChange={(e) => setRDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') { rEscapeRef.current = true; setREditing(false); }
                        }}
                        onBlur={() => {
                          if (rEscapeRef.current) { rEscapeRef.current = false; return; }
                          commitREdit();
                        }}
                        className="w-full bg-transparent outline-none resize-none text-[14px] leading-[22px] text-ink-900 break-words rounded-lg transition-all"
                        style={{ minHeight: 140 }}
                      />
                    ) : (
                      <div className="cursor-text group" onClick={startREdit} title="点击编辑">
                        <div className="text-[14.5px] font-semibold text-ink-900 leading-snug break-words whitespace-pre-wrap">{splitContent(selected.content).title}</div>
                        {splitContent(selected.content).body && (
                          <div className="mt-3 text-[13.5px] text-ink-600 leading-[21px] break-words whitespace-pre-wrap">{splitContent(selected.content).body}</div>
                        )}
                        {catOf(selected.category) && (
                          <div className="flex items-center gap-1 mt-2 text-[11px]" style={{ color: catOf(selected.category).dot }}>
                            <span className="w-[6px] h-[6px] rounded-full" style={{ background: catOf(selected.category).dot }} />
                            {catOf(selected.category).label}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {triage && (
                  <div className="mt-auto">
                    {/* 标签面板：展开时出现在按钮行上方（按钮行位置不动） */}
                    {panelOpen === 'cat' && (
                      <div className="mb-3">
                        <div className="text-[11px] font-semibold text-ink-400 mb-1.5 tracking-wide">标签</div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {cats.map(c => {
                            const on = Number(triage.cat) === c.v;
                            return (
                              <button
                                key={c.v}
                                onClick={() => setTriage(t => ({ ...t, cat: c.v }))}
                                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] transition-all"
                                style={{
                                  background: on ? hexToRgba(c.dot, 0.14) : 'rgba(120,120,128,0.06)',
                                  color: on ? c.dot : '#8e8e93',
                                  border: `1px solid ${on ? hexToRgba(c.dot, 0.55) : 'transparent'}`,
                                  fontWeight: on ? 600 : 400,
                                }}
                              >
                                <span className="w-[7px] h-[7px] rounded-full flex-shrink-0" style={{ background: c.dot }} />
                                {c.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* 固定按钮行：＋标签（展开时变「收起」）/ 分派（打开详细分派弹窗）+ 提交 */}
                    <div className="pt-3 border-t border-ink-100/80 flex items-center gap-1.5 flex-wrap">
                      <button
                        onClick={() => setPanelOpen(panelOpen === 'cat' ? null : 'cat')}
                        className="flex items-center gap-1 text-[12px] font-medium px-2.5 py-1 rounded-full transition-colors"
                        style={{ background: 'rgba(var(--s-rgb),0.1)', color: 'var(--s-main)' }}
                      >
                        {panelOpen === 'cat' ? '收起' : (
                          <>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
                            标签
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => openDetailFor()}
                        className="text-[12px] font-medium px-2.5 py-1 rounded-full transition-colors"
                        style={{ background: 'rgba(var(--s-rgb),0.1)', color: 'var(--s-main)' }}
                      >分派</button>
                      <div className="flex-1" />
                      <button
                        onClick={process}
                        disabled={busyIds.has(selected.id)}
                        className="text-[12.5px] font-semibold px-3.5 py-1.5 rounded-lg transition-all disabled:opacity-40"
                        style={{ background: 'var(--s-main)', color: '#fff', boxShadow: '0 2px 6px rgba(var(--s-rgb),0.25)' }}
                      >{busyIds.has(selected.id) ? '分派中…' : '提交'}</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}

      {/* ===== 详细分派：复用 ScheduleForm（支持时长/重要性/重复） ===== */}
      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title="详细分派 · 新建日程"
      >
        {detail && (
          <ScheduleForm
            initial={detail.initial}
            defaultDate={detail.initial.date}
            onSaved={onDetailSaved}
            onCancel={() => setDetail(null)}
          />
        )}
      </Modal>
    </div>
  );
}
