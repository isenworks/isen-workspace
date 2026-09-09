import { useState, useEffect, useCallback } from 'react';
import { API } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';
import { store } from '../utils/store.js';
import { today as getToday } from '../utils/date.js';
import QuickCapture from '../components/QuickCapture.jsx';
import Modal from '../components/Modal.jsx';
import ScheduleForm, { readCats } from '../components/forms/ScheduleForm.jsx';
import { useSplitRatio, SplitDivider } from '../components/useSplitRatio.jsx';

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

// 内容首行（分派转日程时作标题，其余行作正文）
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
 *   三分布局 tri：左栏（页头+快速捕获 / 时间分组想法流）+ 右栏编辑面板
 *   二分布局 duo（默认）：左侧纯事项列表铺满，右侧编辑面板
 *   记录不区分标题/正文：列表缩略展示首行（无分行整条截断），
 *   点击事项 → 右侧为「编辑记录」面板（与新增面板同构，仅预填内容）
 *   捕获：N 键或输入面板快速收进；分派：转为具体日期的日程
 * ============================================================ */
export default function InboxPage({ onCountChange }) {
  const toast = useToast();
  const [items, setItems] = useState(null);          // null=加载中
  const [busyIds, setBusyIds] = useState(new Set());
  const [selectedId, setSelectedId] = useState(null); // 右侧编辑面板对应的条目；null=新增记录
  const [menuOpenId, setMenuOpenId] = useState(null); // 左栏三个点菜单打开的条目 id
  const [detail, setDetail] = useState(null);        // 详细分派：ScheduleForm 预填
  // 布局：duo（二分布局，默认）| tri（三分布局）；选择存 localStorage，跨登录/刷新记忆
  const [layout, setLayout] = useState(() => {
    try { return localStorage.getItem(LS_LAYOUT_KEY) === 'tri' ? 'tri' : 'duo'; } catch { return 'duo'; }
  });
  // 左右分栏拖拽比例（共享 hook，两个布局共用一份记忆）
  const split = useSplitRatio('inbox_split_ratio');

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

  function markBusy(id, on) {
    setBusyIds(prev => {
      const n = new Set(prev);
      if (on) n.add(id); else n.delete(id);
      return n;
    });
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
        category: it.category != null ? Number(it.category) : 3,
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

  // ===== 左栏条目行（三分布局与二分布局共用）：单行缩略（首行），圆点+文字垂直居中 =====
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

        {/* 单行缩略：有分行展示第一行，无分行整条截断 */}
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

  // ===== 右侧编辑面板（两个布局共用）：新增/编辑同构，仅预填内容与否的区别 =====
  const renderEditPanel = (emptyHint) => {
    // 三分布局无选中：显示占位提示（三分布局的录入入口在左栏）
    if (!selected && emptyHint) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 p-8">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#C7C7CC" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
          <div className="text-[13.5px] font-semibold text-ink-900">选择左侧一条想法</div>
          <div className="text-[12px] text-ink-400">在这里编辑内容或分派到具体日期的日程</div>
        </div>
      );
    }
    return (
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center gap-3 mb-4">
          <span className="w-[5px] h-[20px] rounded-full flex-shrink-0 self-center" style={{ background: 'var(--s-grad-bg)' }}></span>
          <span className="text-[15.5px] font-bold text-ink-900 leading-none">{selected ? '编辑记录' : '新增记录'}</span>
        </div>
        {selected ? (
          <QuickCapture key={selected.id} edit={selected} onUpdated={load} onDispatch={openDetailFor} bare />
        ) : (
          <QuickCapture onSaved={load} onDispatch={openDetailFor} bare />
        )}
      </div>
    );
  };

  // 左右分栏样式 + 拖拽绑定（共享 hook）
  const { leftStyle, rightStyle, bindRoot, bindDivider } = split;

  return (
    <div {...bindRoot} className="flex-1 min-w-0 w-full flex items-stretch">
      {isDuo ? (
        /* ===== 二分布局：左侧事项列表，右侧编辑面板（新增/编辑） ===== */
        <>
          <div className="flex flex-col gap-3 min-w-0" style={leftStyle}>
            <div className="glass-card rounded-2xl p-4">
              {renderHeader()}
            </div>
            {renderList(true)}
          </div>

          <SplitDivider bindDivider={bindDivider} />

          {/* 右侧编辑面板：无选中 = 新增；有选中 = 编辑该条目（同一套面板） */}
          <div className="glass-card rounded-2xl p-4 flex flex-col min-w-0" style={rightStyle}>
            {renderEditPanel(false)}
          </div>
        </>
      ) : (
        /* ===== 三分布局：左栏（页头+快速捕获 / 想法流）+ 右栏编辑面板 ===== */
        <>
          <div className="flex flex-col gap-3 min-w-0" style={leftStyle}>
            {/* 页头 + 快速捕获 */}
            <div className="glass-card rounded-2xl p-4">
              {renderHeader()}
              <div className="mt-3.5 pt-3.5 border-t border-ink-100/80">
                <QuickCapture onSaved={load} onDispatch={openDetailFor} />
              </div>
            </div>
            {renderList(true)}
          </div>

          <SplitDivider bindDivider={bindDivider} />

          {/* 右栏：编辑面板 */}
          <div className="glass-card rounded-2xl p-4 flex flex-col min-w-0" style={rightStyle}>
            {renderEditPanel(true)}
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
