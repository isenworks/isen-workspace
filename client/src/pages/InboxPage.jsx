import { useState, useEffect, useCallback } from 'react';
import { API } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';
import { store } from '../utils/store.js';
import { today as getToday } from '../utils/date.js';
import { hexToRgba } from '../utils/color.js';
import QuickCapture, { parseItemTagIds } from '../components/QuickCapture.jsx';
import Modal from '../components/Modal.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import ScheduleForm from '../components/forms/ScheduleForm.jsx';
import { useSplitRatio, SplitDivider } from '../components/useSplitRatio.jsx';

const LS_LAYOUT_KEY = 'inbox_layout';
const LS_ROW_ORDER_KEY = 'inbox_row_order'; // 列表行排版：'content' 标题优先 | 'time' 时间优先
const LS_CHIPS_KEY = 'inbox_filter_chips'; // 快捷筛选位（默认「日记」「待办」之外用户添加的标签 id）

// 预设标签颜色（新建标签时可选）
const TAG_COLORS = ['#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#00C7BE', '#007AFF', '#5856D6', '#AF52DE', '#FF2D55', '#8E8E93'];

function parseDbTime(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
  const d = new Date(s);
  return isNaN(d) ? null : d;
}
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
/* ===== 列表行时间（元信息行日期锚点）：只显示「日 周X」=====
   月份由组头给出（往年组头带年份），行内保持短小；完整时间（含年月日时分）
   仍可通过 hover 提示查看（fmtTooltip → fmtFull）。 */
function fmtDay(s) {
  const d = parseDbTime(s);
  if (!d) return '';
  return `${d.getDate()} ${WEEKDAYS[d.getDay()]}`;
}
function fmtFull(s) {
  const d = parseDbTime(s);
  if (!d) return '';
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
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

// 从 HTML 内容提取纯文本首行（列表缩略）
function plainFirstLine(html) {
  if (!html) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const text = (tmp.innerText || tmp.textContent || '').replace(/\s+/g, ' ').trim();
  return text;
}

/* ===== 分组：按自然月（今年「M月」，往年「YYYY年M月」），组序按月份倒序 =====
   今天/昨天的细分交给行内「日 周X」承担，组头保持一层即可。 */
function groupOf(s) {
  const d = parseDbTime(s);
  if (!d) return { k: -1, label: '更早' }; // 无效时间兜底，排最末
  const k = d.getFullYear() * 12 + d.getMonth();
  const label = d.getFullYear() === new Date().getFullYear()
    ? `${d.getMonth() + 1}月`
    : `${d.getFullYear()}年${d.getMonth() + 1}月`;
  return { k, label };
}

const pad2 = n => String(n).padStart(2, '0');

export default function InboxPage({ onCountChange }) {
  const toast = useToast();
  const [items, setItems] = useState(null);
  const [tags, setTags] = useState([]);
  const [busyIds, setBusyIds] = useState(new Set());
  const [selectedId, setSelectedId] = useState(null);
  const [menu, setMenu] = useState(null); // { id, cat }
  const [detail, setDetail] = useState(null);
  const [filterTagIds, setFilterTagIds] = useState([]); // 多选，空数组=全部
  const [filterPopover, setFilterPopover] = useState(false);
  const [chipMenu, setChipMenu] = useState(false); // 「+」快捷位管理菜单
  const [extraChipIds, setExtraChipIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LS_CHIPS_KEY) || '[]').map(Number).filter(n => !Number.isNaN(n)); } catch { return []; }
  });
  const [tagManagerStart, setTagManagerStart] = useState(null); // 打开标签管理时预填的名字（灰态 chip 点击创建）
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(null); // 待删除的 item
  const [dateEdit, setDateEdit] = useState(null); // 行内改日期 { id, value }

  const [layout, setLayout] = useState(() => {
    try { return localStorage.getItem(LS_LAYOUT_KEY) === 'tri' ? 'tri' : 'duo'; } catch { return 'duo'; }
  });
  const split = useSplitRatio('inbox_split_ratio');
  const isDuo = layout === 'duo';

  function switchLayout(next) {
    setLayout(next);
    try { localStorage.setItem(LS_LAYOUT_KEY, next); } catch {}
    if (next === 'duo') setSelectedId(null);
  }

  // ===== 列表行排版：'content' 标题优先（默认）｜'time' 时间优先 —— 纯展示偏好，本机记忆 =====
  const [rowOrder, setRowOrder] = useState(() => {
    try { return localStorage.getItem(LS_ROW_ORDER_KEY) === 'time' ? 'time' : 'content'; } catch { return 'content'; }
  });
  function switchRowOrder(next) {
    setRowOrder(next);
    try { localStorage.setItem(LS_ROW_ORDER_KEY, next); } catch {}
  }

  const loadItems = useCallback(async () => {
    try {
      const r = await API.inbox.list();
      setItems(r.items || []);
      onCountChange?.((r.items || []).length);
    } catch (e) {
      setItems([]);
      toast.error(e.message || '加载失败');
    }
  }, [toast, onCountChange]);

  const loadTags = useCallback(async () => {
    try {
      const r = await API.inbox.tags();
      setTags(r.tags || []);
    } catch (e) { /* 标签加载失败不阻断 */ }
  }, []);

  useEffect(() => { loadItems(); loadTags(); }, [loadItems, loadTags]);

  // 全局同步信号：自动/手动同步广播 reload → 重拉小记列表与标签（跨设备即时展示）
  useEffect(() => store.subscribe(msg => {
    if (msg?.type !== 'reload') return;
    loadItems(); loadTags();
  }), [loadItems, loadTags]);

  // 小记保存后：刷新列表让左侧卡片即时出现；
  // 手动保存会带回记录（item），此时选中它，让编辑区保持显示已保存的内容；
  // 自动保存不带记录，只刷列表、不改选中，避免打断正在输入的光标。
  const handleCaptureSaved = useCallback(async (item) => {
    await loadItems();
    if (item?.id != null) setSelectedId(item.id);
  }, [loadItems]);

  const selected = (items || []).find(it => it.id === selectedId) || null;
  const tagMap = new Map((tags || []).map(t => [t.id, t]));
  // 一条小记的标签列表（多选）：tag_ids 优先，兼容旧的单值 tag_id
  const tagsOfItem = (it) => parseItemTagIds(it).map(id => tagMap.get(id)).filter(Boolean);

  function markBusy(id, on) {
    setBusyIds(prev => {
      const n = new Set(prev);
      if (on) n.add(id); else n.delete(id);
      return n;
    });
  }

  // ===== 删除（进回收站）—— 用 ConfirmDialog 替代 window.confirm =====
  function askRemove(item) {
    setMenu(null);
    setConfirmRemove(item);
  }
  async function doRemove() {
    const item = confirmRemove;
    if (!item) return;
    setConfirmRemove(null);
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

  // ===== 修改标签（多选，optimistic update） =====
  async function setItemTags(item, nextIds) {
    const clean = [...new Set(nextIds.map(Number))].filter(n => !Number.isNaN(n));
    const prev = parseItemTagIds(item);
    const patch = it => it.id === item.id
      ? { ...it, tag_ids: clean.length ? JSON.stringify(clean) : null, tag_id: clean[0] ?? null }
      : it;
    setItems(list => list.map(patch));
    try {
      await API.inbox.update(item.id, { tag_ids: clean });
    } catch (e) {
      const rollback = it => it.id === item.id
        ? { ...it, tag_ids: prev.length ? JSON.stringify(prev) : null, tag_id: prev[0] ?? null }
        : it;
      setItems(list => list.map(rollback));
      toast.error(e.message || '修改标签失败');
    }
  }
  function toggleItemTag(item, tagId) {
    const cur = parseItemTagIds(item);
    const n = Number(tagId);
    setItemTags(item, cur.includes(n) ? cur.filter(x => x !== n) : [...cur, n]);
  }

  // ===== 修改记录日期：仅替换日期、保留原时分秒；本地时区选完换算回 UTC 存库 =====
  // 改完乐观更新，列表的月份分组即时随 created_at 重排
  async function commitDateEdit(item, dateStr) {
    setDateEdit(null);
    if (!dateStr) return;
    const cur = parseDbTime(item.created_at);
    if (!cur) return;
    const [y, m, d] = dateStr.split('-').map(Number);
    if (!y || !m || !d) return;
    const nd = new Date(y, m - 1, d, cur.getHours(), cur.getMinutes(), cur.getSeconds());
    const iso = `${nd.getUTCFullYear()}-${pad2(nd.getUTCMonth() + 1)}-${pad2(nd.getUTCDate())} ${pad2(nd.getUTCHours())}:${pad2(nd.getUTCMinutes())}:${pad2(nd.getUTCSeconds())}`;
    const prev = item.created_at;
    setItems(list => list.map(it => it.id === item.id ? { ...it, created_at: iso } : it));
    try {
      await API.inbox.update(item.id, { created_at: iso });
    } catch (e) {
      setItems(list => list.map(it => it.id === item.id ? { ...it, created_at: prev } : it));
      toast.error(e.message || '修改日期失败');
    }
  }

  function openDetailFor(item) {
    const it = item || selected;
    if (!it) return;
    setSelectedId(it.id);
    setDetail({
      item: it,
      initial: {
        title: plainFirstLine(it.content).slice(0, 60),
        content: plainFirstLine(it.content).slice(60),
        date: getToday(),
        start_time: '',
      },
    });
  }

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
      toast.error('日程已创建，但小记状态回写失败');
    }
  }

  // ===== 标签筛选（chips 与漏斗共用状态：多选 OR，空数组=全部） =====
  const toggleFilter = useCallback((id) => {
    const n = Number(id);
    setFilterTagIds(prev => prev.includes(n) ? prev.filter(x => x !== n) : [...prev, n]);
  }, []);

  // 快捷位增删（localStorage 记忆，仅存默认两位之外用户手动添加的标签）
  const addChip = useCallback((tagId) => {
    const n = Number(tagId);
    setExtraChipIds(prev => {
      if (prev.includes(n)) return prev;
      try { localStorage.setItem(LS_CHIPS_KEY, JSON.stringify([...prev, n])); } catch {}
      return [...prev, n];
    });
    setFilterTagIds(prev => prev.includes(n) ? prev : [...prev, n]); // 加入即激活
    setChipMenu(false);
  }, []);
  const removeChip = useCallback((tagId) => {
    const n = Number(tagId);
    setExtraChipIds(prev => {
      const next = prev.filter(x => x !== n);
      try { localStorage.setItem(LS_CHIPS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
    setFilterTagIds(prev => prev.filter(x => x !== n));
  }, []);

  // 过滤后的列表（多标签：命中任一选中标签即展示）
  const filteredItems = (items || []).filter(it => {
    if (filterTagIds.length === 0) return true;
    const ids = parseItemTagIds(it).map(Number);
    return filterTagIds.some(id => ids.includes(id));
  });

  const groups = [];
  if (filteredItems.length > 0) {
    const map = new Map();
    filteredItems.forEach(it => {
      const g = groupOf(it.created_at);
      if (!map.has(g.k)) map.set(g.k, { k: g.k, label: g.label, list: [] });
      map.get(g.k).list.push(it);
    });
    [...map.values()].sort((a, b) => b.k - a.k).forEach(g => groups.push(g)); // 最新月份在上
  }

  useEffect(() => {
    if (!isDuo && selectedId == null && filteredItems.length > 0) {
      setSelectedId(filteredItems[0].id);
    }
  }, [filteredItems, selectedId, isDuo]);

  const renderRow = (item) => {
    const busy = busyIds.has(item.id);
    const isSelected = selectedId === item.id;
    const itemTags = tagsOfItem(item);
    const selectedIds = parseItemTagIds(item).map(Number);
    const menuFor = menu?.id === item.id;
    const catPickFor = menuFor && !!menu.cat;
    const dateEditFor = dateEdit?.id === item.id;
    const firstLine = plainFirstLine(item.content);
    const timeFirst = rowOrder === 'time';

    // 标题行（内容优先排版时是第一视觉，时间优先排版时沉底）
    const titleLine = (
      <div className={`text-[14px] leading-snug text-ink-900 truncate ${timeFirst ? 'mt-0.5' : ''}`}>
        {(firstLine || '（空）').slice(0, 60)}
      </div>
    );

    // 元信息行：标签 chips（左）｜日期锚点浅灰不加粗（最右，点击可改日期）
    const metaLine = (
      <div className={`flex items-center gap-1.5 min-w-0 ${timeFirst ? '' : 'mt-1'}`}>
        {itemTags.map(t => (
          <span
            key={t.id}
            className="inline-flex items-center justify-center h-[20px] px-2 rounded-full text-[10px] font-semibold leading-none select-none flex-shrink-0"
            style={{ color: t.color, background: hexToRgba(t.color, 0.10) }}
          >{t.name}</span>
        ))}
        <span className="flex-1 min-w-0" />
        {dateEditFor ? (
          <input
            type="date"
            autoFocus
            value={dateEdit.value}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => commitDateEdit(item, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setDateEdit(null);
              if (e.key === 'Enter') commitDateEdit(item, dateEdit.value);
            }}
            onBlur={() => setDateEdit(null)}
            className="flex-shrink-0 w-[112px] px-1 py-0.5 rounded-md text-[12px] tabular-nums border border-[rgba(var(--s-rgb),0.45)] bg-white text-ink-700 focus:outline-none focus:border-[var(--s-main)]"
          />
        ) : (
          <span
            onClick={(e) => {
              e.stopPropagation();
              const d = parseDbTime(item.created_at);
              if (!d) return;
              setDateEdit({ id: item.id, value: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` });
            }}
            className="flex-shrink-0 text-[12px] text-ink-300 tabular-nums cursor-pointer hover:text-ink-600 transition-colors whitespace-nowrap"
            title={`${fmtTooltip(item.created_at)} · 点击修改日期`}
          >{fmtDay(item.created_at)}</span>
        )}
      </div>
    );

    return (
      <div
        key={item.id}
        onClick={() => !menuFor && setSelectedId(item.id)}
        className={`relative block px-2 py-2 rounded-xl transition-all cursor-pointer group ${timeFirst ? 'pl-6' : ''} ${busy ? 'opacity-50 pointer-events-none' : ''}`}
        style={isSelected ? { background: 'rgba(var(--s-rgb),0.08)' } : undefined}
      >
        {/* 时间优先排版：行首蓝色圆点（轴线由组容器 .inx-axis 贯穿） */}
        {timeFirst && (
          <span
            className="absolute left-[7px] top-[14px] w-[8px] h-[8px] rounded-full transition-colors"
            style={{
              background: isSelected ? 'var(--s-main)' : 'rgba(var(--s-rgb),0.40)',
              boxShadow: '0 0 0 3px var(--surface-card)',
            }}
          />
        )}
        <div className="flex items-start gap-1.5">
          <div className="flex-1 min-w-0">
            {/* 排版可切换：内容优先 = 标题在上（flomo 式）｜时间优先 = 日期在上（日志式，带时间轴） */}
            {timeFirst ? <>{metaLine}{titleLine}</> : <>{titleLine}{metaLine}</>}
          </div>
          <div className="relative flex-shrink-0 -mt-px">
            <button
              onClick={(e) => { e.stopPropagation(); setMenu(menuFor ? null : { id: item.id }); }}
              title={fmtTooltip(item.created_at)}
              className="w-6 h-6 -mr-1 rounded-lg flex items-center justify-center text-ink-300/70 group-hover:text-ink-500 hover:!text-ink-700 hover:bg-black/[0.04] transition-colors"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" />
              </svg>
            </button>
            {menuFor && (
              <>
                <div className="fixed inset-0 z-[var(--z-scrim)]" onClick={(e) => { e.stopPropagation(); setMenu(null); }} />
                <div className="absolute right-0 top-7 z-[var(--z-dropdown)] w-[130px] py-1 rounded-xl border border-ink-100 bg-white shadow-[0_8px_24px_rgba(0,0,0,0.12)] overflow-hidden">
                  <button
                    onClick={(e) => { e.stopPropagation(); setMenu(m => ({ id: item.id, cat: !m?.cat })); }}
                    className={`w-full flex items-center px-3 py-1.5 text-[12.5px] transition-colors ${catPickFor ? 'bg-ink-50 text-ink-900 font-medium' : 'text-ink-700 hover:bg-ink-50'}`}
                  >
                    <span className="whitespace-nowrap">标签</span>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
                      className={`flex-shrink-0 ml-auto text-ink-400 transition-transform duration-200 ${catPickFor ? 'rotate-180' : ''}`}><polyline points="6 9 12 15 18 9" /></svg>
                  </button>
                  {catPickFor && (
                    <>
                      <div className="my-1 border-t border-ink-100/80" />
                      {selectedIds.length > 0 && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setItemTags(item, []); }}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-[12.5px] text-ink-500 hover:bg-ink-50 transition-colors"
                        >
                          <span className="flex-shrink-0 w-2 h-2 rounded-full border border-ink-200" />
                          <span className="whitespace-nowrap">清除标签</span>
                        </button>
                      )}
                      {tags.length === 0 && (
                        <div className="px-3 py-1.5 text-[12px] text-ink-400 whitespace-nowrap">暂无标签</div>
                      )}
                      {tags.map(t => {
                        const on = selectedIds.includes(Number(t.id));
                        return (
                          <button key={t.id} onClick={(e) => { e.stopPropagation(); toggleItemTag(item, t.id); }}
                            className={`w-full flex items-center gap-2 px-3 py-1.5 text-[12.5px] hover:bg-ink-50 transition-colors ${on ? 'text-ink-900 font-medium' : 'text-ink-700'}`}
                          >
                            <span className="flex-shrink-0 w-2 h-2 rounded-full" style={{ background: on ? t.color : hexToRgba(t.color, 0.35) }} />
                            <span className="whitespace-nowrap">{t.name}</span>
                            <span className={`ml-auto flex-shrink-0 w-3.5 h-3.5 rounded-[4px] flex items-center justify-center text-[9px] leading-none ${on ? 'text-white' : 'border border-ink-200'}`}
                              style={on ? { background: t.color } : undefined}
                            >{on ? '✓' : ''}</span>
                          </button>
                        );
                      })}
                      <div className="my-1 border-t border-ink-100/80" />
                    </>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); setMenu(null); openDetailFor(item); }}
                    className="w-full text-left px-3 py-1.5 text-[12.5px] text-ink-700 hover:bg-ink-50 transition-colors"
                  >分派…</button>
                  <button
                    onClick={(e) => { e.stopPropagation(); askRemove(item); }}
                    className="w-full text-left px-3 py-1.5 text-[12.5px] text-[var(--danger)] hover:bg-[#FF3B300F] transition-colors"
                  >删除</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ===== 标签筛选 Popover（完整标签列表，多选；与标题下 chips 共用 filterTagIds） =====
  const renderFilterPopover = () => {
    const activeTag = tags.find(t => t.id === filterTagIds[0]) || null;
    const isActive = filterTagIds.length > 0;
    return (
      <div className="relative">
        <button
          onClick={() => setFilterPopover(v => !v)}
          title={isActive ? `筛选：${filterTagIds.length} 个标签` : '筛选标签'}
          className={`relative flex items-center gap-1 w-[32px] h-[24px] rounded-lg transition-all ${
            isActive
              ? 'hover:brightness-95'
              : 'hover:bg-black/[0.05] hover:text-ink-700'
          } ${filterPopover ? 'ring-2 ring-[rgba(var(--s-rgb),0.25)]' : ''}`}
          style={isActive
            ? { background: 'rgba(var(--s-rgb),0.1)', color: 'var(--s-main)' }
            : { background: 'transparent', color: 'var(--text-muted)' }
          }
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto' }}>
            <path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82Z"/>
            <line x1="7" y1="7" x2="7.01" y2="7"/>
          </svg>
          {isActive && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[13px] h-[13px] px-[2px] rounded-full border border-white text-[8.5px] font-bold text-white flex items-center justify-center tabular-nums"
              style={{ background: activeTag?.color || 'var(--s-main)' }}>
              {filterTagIds.length}
            </span>
          )}
        </button>
        {filterPopover && (
          <>
            <div className="fixed inset-0 z-[var(--z-scrim)]" onClick={() => setFilterPopover(false)} />
            <div className="absolute right-0 top-8 z-[var(--z-dropdown)] w-[220px] py-1.5 rounded-xl border border-ink-100 bg-white shadow-[0_12px_32px_rgba(0,0,0,0.14)] overflow-hidden">
              <div className="px-3 py-1.5 text-[11px] font-semibold text-ink-400 tracking-wide">筛选标签（可多选）</div>
              <button
                onClick={() => setFilterTagIds([])}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-[12.5px] transition-colors ${filterTagIds.length === 0 ? 'text-ink-900 font-semibold bg-ink-50' : 'text-ink-600 hover:bg-ink-50'}`}
              >
                <span className="w-2 h-2 rounded-full bg-ink-300" />
                全部
                {filterTagIds.length === 0 && <span className="ml-auto text-[var(--s-main)]">✓</span>}
              </button>
              {tags.length > 0 && <div className="my-1 border-t border-ink-100/80" />}
              {tags.map(t => {
                const on = filterTagIds.includes(Number(t.id));
                return (
                  <button
                    key={t.id}
                    onClick={() => toggleFilter(t.id)}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-[12.5px] transition-colors ${on ? 'text-ink-900 font-semibold bg-ink-50' : 'text-ink-700 hover:bg-ink-50'}`}
                  >
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: t.color }} />
                    <span className="flex-1 text-left">{t.name}</span>
                    {on && <span style={{ color: t.color }}>✓</span>}
                  </button>
                );
              })}
              <div className="my-1 border-t border-ink-100/80" />
              <button
                onClick={() => { setFilterPopover(false); setTagManagerStart(null); setTagManagerOpen(true); }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-[12.5px] text-[var(--s-main)] hover:bg-ink-50 transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                管理标签…
              </button>
            </div>
          </>
        )}
      </div>
    );
  };

  // ===== 标题下方快捷筛选 chips（默认「日记」「待办」占位 + 「+」自选标签） =====
  const DEFAULT_CHIP_NAMES = ['日记', '待办'];
  const renderFilterChips = () => {
    // 默认两位按名字匹配标签库；匹配不到显示灰态（点击去创建）
    const namedChips = DEFAULT_CHIP_NAMES.map(name => ({ name, tag: (tags || []).find(t => t.name === name) || null }));
    const extraChips = extraChipIds.map(id => tagMap.get(id)).filter(Boolean).map(t => ({ name: t.name, tag: t }));
    const shownIds = new Set([
      ...namedChips.filter(c => c.tag).map(c => c.tag.id),
      ...extraChips.map(c => c.tag.id),
    ]);
    const addable = (tags || []).filter(t => !shownIds.has(t.id));

    const chipBase = 'h-[24px] px-2.5 rounded-lg flex items-center gap-1.5 text-[12px] leading-none transition-all select-none cursor-pointer';
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {/* 全部：清空筛选（无标签语义，用主题色激活态） */}
        <button
          onClick={() => setFilterTagIds([])}
          title="显示全部小记"
          className={chipBase}
          style={filterTagIds.length === 0
            ? { background: 'rgba(var(--s-rgb),0.12)', color: 'var(--s-main)', fontWeight: 600 }
            : { background: 'rgba(120,120,128,0.06)', color: 'var(--ink-600, #6b7280)' }
          }
        >全部</button>
        {[...namedChips, ...extraChips].map((c, i) => {
          const t = c.tag;
          if (!t) {
            // 灰态：标签尚未创建，点击打开标签管理并预填名字
            return (
              <button
                key={`${c.name}-${i}`}
                onClick={() => { setTagManagerStart(c.name); setTagManagerOpen(true); }}
                title={`创建标签「${c.name}」`}
                className={`${chipBase} border border-dashed border-ink-200 text-ink-300 hover:border-ink-300 hover:text-ink-500`}
              >
                {c.name}
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
              </button>
            );
          }
          const on = filterTagIds.includes(Number(t.id));
          return (
            <button
              key={t.id}
              onClick={() => toggleFilter(t.id)}
              title={on ? `取消筛选「${t.name}」` : `筛选「${t.name}」`}
              className={chipBase}
              style={on
                ? { background: hexToRgba(t.color, 0.13), color: t.color, fontWeight: 600 }
                : { background: 'rgba(120,120,128,0.06)', color: 'var(--ink-600, #6b7280)' }
              }
            >
              <span className="flex-shrink-0 w-[6px] h-[6px] rounded-full" style={{ background: on ? t.color : hexToRgba(t.color, 0.45) }} />
              {t.name}
              {extraChips.some(x => x.tag.id === t.id) && (
                <span
                  role="button"
                  tabIndex={-1}
                  onClick={(e) => { e.stopPropagation(); removeChip(t.id); }}
                  title="从快捷位移除（不影响筛选勾选）"
                  className="-mr-0.5 w-[13px] h-[13px] rounded-full flex items-center justify-center text-ink-400 hover:text-ink-700 hover:bg-black/[0.06] transition-colors"
                >
                  <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                </span>
              )}
            </button>
          );
        })}
        {/* + 快捷位管理 */}
        <div className="relative">
          <button
            onClick={() => setChipMenu(v => !v)}
            title="添加筛选标签"
            className={`w-[24px] h-[24px] rounded-lg flex items-center justify-center border border-dashed transition-all ${chipMenu ? 'border-[var(--s-main)] text-[var(--s-main)] bg-[rgba(var(--s-rgb),0.06)]' : 'border-ink-200 text-ink-400 hover:border-ink-300 hover:text-ink-600'}`}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          </button>
          {chipMenu && (
            <>
              <div className="fixed inset-0 z-[var(--z-scrim)]" onClick={() => setChipMenu(false)} />
              <div className="absolute left-0 top-7 z-[var(--z-dropdown)] w-[190px] py-1.5 rounded-xl border border-ink-100 bg-white shadow-[0_12px_32px_rgba(0,0,0,0.14)] overflow-hidden">
                <div className="px-3 py-1.5 text-[11px] font-semibold text-ink-400 tracking-wide">添加到快捷位</div>
                {addable.length === 0 ? (
                  <div className="px-3 py-2 text-[12px] text-ink-400">所有标签都已显示</div>
                ) : addable.map(t => (
                  <button
                    key={t.id}
                    onClick={() => addChip(t.id)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-[12.5px] text-ink-700 hover:bg-ink-50 transition-colors"
                  >
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: t.color }} />
                    <span className="flex-1 text-left">{t.name}</span>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="text-ink-300"><path d="M12 5v14M5 12h14" /></svg>
                  </button>
                ))}
                <div className="my-1 border-t border-ink-100/80" />
                <button
                  onClick={() => { setChipMenu(false); setTagManagerStart(null); setTagManagerOpen(true); }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-[12.5px] text-[var(--s-main)] hover:bg-ink-50 transition-colors"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                  管理标签…
                </button>
              </div>
            </>
          )}
        </div>
        {/* 排版切换：内容优先（标题在上）｜时间优先（日期在上）—— 纯展示偏好，本机记忆 */}
        <div className="ml-auto flex items-center p-[2px] rounded-lg flex-shrink-0" style={{ background: 'rgba(120,120,128,0.08)' }}>
          <button
            onClick={() => switchRowOrder('content')}
            title="内容优先：标题在上，日期沉底为辅助行"
            className="px-2 py-1 rounded-md text-[11px] leading-none transition-all"
            style={rowOrder === 'content'
              ? { background: 'var(--surface-card)', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', color: 'var(--s-main)', fontWeight: 600 }
              : { color: 'var(--text-muted)' }}
          >内容</button>
          <button
            onClick={() => switchRowOrder('time')}
            title="时间优先：日期在上（日志式），标题在下"
            className="px-2 py-1 rounded-md text-[11px] leading-none transition-all"
            style={rowOrder === 'time'
              ? { background: 'var(--surface-card)', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', color: 'var(--s-main)', fontWeight: 600 }
              : { color: 'var(--text-muted)' }}
          >时间</button>
        </div>
      </div>
    );
  };

  const renderHeader = () => (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="w-[5px] h-[20px] rounded-full flex-shrink-0 self-center" style={{ background: 'var(--s-grad-bg)' }}></span>
        <span className="text-[15.5px] font-bold text-ink-900 leading-none flex-shrink-0">小记</span>
        <div className="flex items-center p-[2px] rounded-lg flex-shrink-0" style={{ background: 'rgba(120,120,128,0.08)' }}>
          <button onClick={() => switchLayout('tri')} title="三分布局"
            className="px-2 py-1 rounded-md transition-all flex items-center"
            style={layout === 'tri' ? { background: 'var(--surface-card)', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', color: 'var(--s-main)' } : { color: 'var(--text-muted)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="9" y1="3" x2="9" y2="21" /><line x1="15" y1="3" x2="15" y2="21" />
            </svg>
          </button>
          <button onClick={() => switchLayout('duo')} title="二分布局"
            className="px-2 py-1 rounded-md transition-all flex items-center"
            style={layout === 'duo' ? { background: 'var(--surface-card)', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', color: 'var(--s-main)' } : { color: 'var(--text-muted)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="12" y1="3" x2="12" y2="21" />
            </svg>
          </button>
        </div>
        <div className="flex-1" />
        {renderFilterPopover()}
        {isDuo && (
          <button onClick={() => setSelectedId(null)} title="新增记录"
            className="flex-shrink-0 w-[24px] h-[24px] rounded-lg flex items-center justify-center transition-all hover:scale-105 active:scale-95"
            style={{ background: 'var(--s-grad-bg)', color: 'var(--surface-card)', boxShadow: '0 2px 6px rgba(var(--s-rgb),0.25)' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
          </button>
        )}
      </div>
      {renderFilterChips()}
    </div>
  );

  const renderList = (fill) => (
    <>
      {items === null ? (
        <div className={`glass-card rounded-2xl p-10 flex items-center justify-center text-[13px] text-ink-400 ${fill ? 'flex-1' : ''}`}>加载中…</div>
      ) : items.length === 0 ? (
        <div className={`glass-card rounded-2xl p-14 flex flex-col items-center justify-center text-center gap-2 ${fill ? 'flex-1' : ''}`}>
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="var(--ink-300)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11l5-5V5a2 2 0 0 0-2-2Z" />
            <path d="M15 21v-4a2 2 0 0 1 2-2h4" />
          </svg>
          <div className="text-[14px] font-medium text-ink-400">小记是空的</div>
          <div className="text-[12px] text-ink-300">按 <kbd className="px-1 py-px rounded text-[11px] border border-ink-100 bg-white/70">N</kbd> 可随时记录</div>
        </div>
      ) : groups.length === 0 ? (
        <div className={`glass-card rounded-2xl p-14 flex flex-col items-center justify-center text-center gap-2 ${fill ? 'flex-1' : ''}`}>
          <div className="text-[13px] text-ink-400">所选标签下暂无小记</div>
        </div>
      ) : (
        <div className={`glass-card rounded-2xl p-2.5 flex flex-col ${fill ? 'flex-1 min-h-0' : ''}`}>
          {groups.map((g, gi) => (
            <div key={g.label} className={gi > 0 ? 'mt-1' : ''}>
              {gi > 0 && <div className="border-t border-ink-100/70 pt-1 mt-1" />}
              <div className="flex items-baseline gap-2 px-1.5 pt-1 pb-0.5">
                {/* 组头承担月份导航职能：与标题同大（14px），浅灰色弱化为背景层级 */}
                <span className="text-[14px] font-semibold text-ink-300 tracking-wide">{g.label}</span>
                <span className="text-[11px] text-ink-200 tabular-nums">{g.list.length}</span>
              </div>
              <div className={rowOrder === 'time' ? 'inx-axis' : ''}>{g.list.map(renderRow)}</div>
            </div>
          ))}
        </div>
      )}
    </>
  );

  const renderEditPanel = (emptyHint) => {
    if (!selected && emptyHint) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 p-8">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--ink-300)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
          <div className="text-[13.5px] font-medium text-ink-300">选择左侧一条想法</div>
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
          <QuickCapture key={selected.id} edit={selected} tags={tags} onUpdated={loadItems} onDispatch={openDetailFor} onManageTags={() => setTagManagerOpen(true)} bare />
        ) : (
          <QuickCapture tags={tags} onSaved={handleCaptureSaved} onDispatch={openDetailFor} onManageTags={() => setTagManagerOpen(true)} bare />
        )}
      </div>
    );
  };

  const { leftStyle, rightStyle, bindRoot, bindDivider } = split;

  return (
    <div {...bindRoot} className="split-root flex-1 min-w-0 w-full flex items-stretch">
      {isDuo ? (
        <>
          <div className="flex flex-col gap-3 min-w-0" style={leftStyle}>
            <div className="glass-card rounded-2xl p-4">
              {renderHeader()}
            </div>
            {renderList(true)}
          </div>
          <SplitDivider bindDivider={bindDivider} />
          <div className="glass-card rounded-2xl p-4 flex flex-col min-w-0" style={rightStyle}>
            {renderEditPanel(false)}
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-col gap-3 min-w-0" style={leftStyle}>
            <div className="glass-card rounded-2xl p-4">
              {renderHeader()}
              <div className="mt-3.5 pt-3.5 border-t border-ink-100/80">
                <QuickCapture tags={tags} onSaved={handleCaptureSaved} onDispatch={openDetailFor} onManageTags={() => setTagManagerOpen(true)} />
              </div>
            </div>
            {renderList(true)}
          </div>
          <SplitDivider bindDivider={bindDivider} />
          <div className="glass-card rounded-2xl p-4 flex flex-col min-w-0" style={rightStyle}>
            {renderEditPanel(true)}
          </div>
        </>
      )}

      {/* 详细分派 */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title="详细分派 · 新建日程">
        {detail && (
          <ScheduleForm
            initial={detail.initial}
            defaultDate={detail.initial.date}
            onSaved={onDetailSaved}
            onCancel={() => setDetail(null)}
          />
        )}
      </Modal>

      {/* 删除确认 */}
      <ConfirmDialog
        open={!!confirmRemove}
        title="删除小记"
        danger
        confirmText="删除"
        onConfirm={doRemove}
        onCancel={() => setConfirmRemove(null)}
      >
        <div className="text-[13px] leading-relaxed">
          <div className="text-ink-600">删除后可在回收站恢复。</div>
          {confirmRemove && (
            <div className="mt-2 font-semibold text-ink-900 break-words">
              「{plainFirstLine(confirmRemove.content).slice(0, 40) || '（空）'}」
            </div>
          )}
        </div>
      </ConfirmDialog>

      {/* 标签管理弹窗 */}
      <TagManagerModal
        open={tagManagerOpen}
        tags={tags}
        onClose={() => { setTagManagerOpen(false); setTagManagerStart(null); }}
        setTags={setTags}
        toast={toast}
        startName={tagManagerStart}
      />
    </div>
  );
}

// ==================== 标签管理弹窗（增删改） ====================
function TagManagerModal({ open, tags, onClose, setTags, toast, startName }) {
  const [editing, setEditing] = useState(null); // { id?, name, color, _optimistic? }
  const [confirmDel, setConfirmDel] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) { setEditing(null); setConfirmDel(null); return; }
    // 带 startName 打开 = 直接进入新建态并预填（快捷位灰态 chip 点击创建）
    if (startName) setEditing({ name: startName, color: TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)] });
  }, [open, startName]);

  function startCreate() {
    setEditing({ name: '', color: TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)] });
  }
  function startEdit(t) {
    setEditing({ id: t.id, name: t.name, color: t.color });
  }

  async function saveTag() {
    if (!editing || busy) return;
    const name = editing.name.trim();
    if (!name) { toast.error('标签名不能为空'); return; }
    setBusy(true);
    const isNew = !editing.id;
    const placeholderId = isNew ? -Date.now() : editing.id;
    const prevTags = tags;

    // Optimistic: 先改本地 state
    if (isNew) {
      setTags(prev => [...prev, { id: placeholderId, name, color: editing.color, sort_order: 0, _optimistic: true }]);
    } else {
      setTags(prev => prev.map(t => t.id === editing.id ? { ...t, name, color: editing.color } : t));
    }
    setEditing(null);

    try {
      let result;
      if (isNew) {
        result = await API.inbox.tagCreate({ name, color: editing.color });
        // 用真实 id 替换 optimistic placeholder
        setTags(prev => prev.map(t => t.id === placeholderId ? result.tag : t));
        toast.success('已创建', { duration: 1000 });
      } else {
        await API.inbox.tagUpdate(editing.id, { name, color: editing.color });
        toast.success('已更新', { duration: 1000 });
      }
    } catch (e) {
      // 回滚
      setTags(prevTags);
      toast.error(e.message || '保存失败');
      setEditing({ id: isNew ? null : editing.id, name, color: editing.color });
    } finally {
      setBusy(false);
    }
  }

  async function doDeleteTag() {
    if (!confirmDel || busy) return;
    setBusy(true);
    const prevTags = tags;
    const prevConfirm = confirmDel;
    // Optimistic: 先删本地
    setTags(prev => prev.filter(t => t.id !== confirmDel.id));
    setConfirmDel(null);

    try {
      await API.inbox.tagRemove(prevConfirm.id);
      toast.success('已删除', { duration: 1000 });
    } catch (e) {
      setTags(prevTags);
      toast.error(e.message || '删除失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="管理标签" maxWidth={460}>
      <div className="space-y-2">
        {tags.length === 0 && <div className="text-[13px] text-ink-400 text-center py-6">暂无标签，点击下方按钮新建</div>}
        {tags.map(t => (
          <div key={t.id} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-ink-50 group">
            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: t.color }} />
            <span className="text-[13.5px] text-ink-800 flex-1">{t.name}</span>
            <button onClick={() => startEdit(t)} className="text-[12px] text-ink-400 hover:text-ink-700 px-1.5 py-0.5">编辑</button>
            <button onClick={() => setConfirmDel(t)} className="text-[12px] text-[var(--danger)] hover:bg-[#FF3B300F] px-1.5 py-0.5 rounded">删除</button>
          </div>
        ))}
      </div>

      {/* 新建/编辑表单 */}
      {editing && (
        <div className="mt-4 p-3 rounded-xl bg-ink-50/70 border border-ink-100">
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={editing.name}
              onChange={e => setEditing({ ...editing, name: e.target.value })}
              onKeyDown={e => { if (e.key === 'Enter') saveTag(); }}
              maxLength={20}
              placeholder="标签名称"
              className="flex-1 px-3 py-1.5 rounded-lg text-[13px] bg-white border border-ink-200 focus:border-[var(--s-main)] focus:outline-none"
            />
            <button onClick={saveTag}
              className="px-3 py-1.5 rounded-lg text-[12.5px] font-semibold text-white"
              style={{ background: 'var(--s-main)' }}>保存</button>
          </div>
          <div className="flex items-center gap-1.5 mt-2.5">
            {TAG_COLORS.map(c => (
              <button
                key={c}
                onClick={() => setEditing({ ...editing, color: c })}
                className={`w-6 h-6 rounded-full transition-transform ${editing.color === c ? 'ring-2 ring-offset-2 ring-ink-400 scale-110' : 'hover:scale-110'}`}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
      )}

      {!editing && (
        <button onClick={startCreate}
          className="mt-3 w-full py-2 rounded-lg text-[13px] font-medium text-[var(--s-main)] border border-dashed border-ink-200 hover:bg-ink-50 transition-colors">
          + 新建标签
        </button>
      )}

      <ConfirmDialog
        open={!!confirmDel}
        title="删除标签"
        danger
        confirmText="删除"
        onConfirm={doDeleteTag}
        onCancel={() => setConfirmDel(null)}
      >
        <div className="text-[13px] leading-relaxed">
          删除标签「<span className="font-semibold text-ink-900">{confirmDel?.name}</span>」后，已使用该标签的小记将变为无标签，此操作不可撤销。
        </div>
      </ConfirmDialog>
    </Modal>
  );
}
