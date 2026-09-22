import { useState, useEffect, useCallback } from 'react';
import { API } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';
import { store } from '../utils/store.js';
import { today as getToday } from '../utils/date.js';
import { hexToRgba } from '../utils/color.js';
import QuickCapture from '../components/QuickCapture.jsx';
import Modal from '../components/Modal.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import ScheduleForm from '../components/forms/ScheduleForm.jsx';
import { useSplitRatio, SplitDivider } from '../components/useSplitRatio.jsx';

const LS_LAYOUT_KEY = 'inbox_layout';

// 预设标签颜色（新建标签时可选）
const TAG_COLORS = ['#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#00C7BE', '#007AFF', '#5856D6', '#AF52DE', '#FF2D55', '#8E8E93'];

function parseDbTime(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
  const d = new Date(s);
  return isNaN(d) ? null : d;
}
function fmtDate(s) {
  const d = parseDbTime(s);
  if (!d) return '';
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
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

export default function InboxPage({ onCountChange }) {
  const toast = useToast();
  const [items, setItems] = useState(null);
  const [tags, setTags] = useState([]);
  const [busyIds, setBusyIds] = useState(new Set());
  const [selectedId, setSelectedId] = useState(null);
  const [menu, setMenu] = useState(null); // { id, cat }
  const [detail, setDetail] = useState(null);
  const [filterTagId, setFilterTagId] = useState(null); // null=全部
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(null); // 待删除的 item

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

  const selected = (items || []).find(it => it.id === selectedId) || null;
  const tagMap = new Map((tags || []).map(t => [t.id, t]));
  const tagOf = (id) => (id != null ? tagMap.get(Number(id)) || null : null);

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

  // ===== 修改标签 =====
  async function setItemTag(item, tagId) {
    markBusy(item.id, true);
    try {
      await API.inbox.update(item.id, { tag_id: tagId });
      setItems(prev => prev.map(it => it.id === item.id ? { ...it, tag_id: tagId } : it));
      const t = tagOf(tagId);
      toast.success(t ? `已标记为「${t.name}」` : '已移除标签');
    } catch (e) {
      toast.error(e.message || '修改标签失败');
    } finally {
      markBusy(item.id, false);
      setMenu(null);
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

  // 过滤后的列表
  const filteredItems = (items || []).filter(it => filterTagId == null || Number(it.tag_id) === Number(filterTagId));

  const groups = [];
  if (filteredItems.length > 0) {
    const map = new Map();
    filteredItems.forEach(it => {
      const g = groupLabel(it.created_at);
      if (!map.has(g)) map.set(g, []);
      map.get(g).push(it);
    });
    GROUP_ORDER.forEach(g => { if (map.has(g)) groups.push({ label: g, list: map.get(g) }); });
  }

  useEffect(() => {
    if (!isDuo && selectedId == null && filteredItems.length > 0) {
      setSelectedId(filteredItems[0].id);
    }
  }, [filteredItems, selectedId, isDuo]);

  const renderRow = (item) => {
    const busy = busyIds.has(item.id);
    const isSelected = selectedId === item.id;
    const tagInfo = tagOf(item.tag_id);
    const menuFor = menu?.id === item.id;
    const catPickFor = menuFor && !!menu.cat;
    const firstLine = plainFirstLine(item.content);
    return (
      <div
        key={item.id}
        onClick={() => !menuFor && setSelectedId(item.id)}
        className={`relative flex items-center gap-2.5 px-2 py-2 rounded-xl transition-all cursor-pointer ${busy ? 'opacity-50 pointer-events-none' : ''}`}
        style={isSelected ? { background: 'rgba(var(--s-rgb),0.08)' } : undefined}
      >
        <span
          className="flex-shrink-0 w-[8px] h-[8px] rounded-full transition-colors"
          style={isSelected
            ? { background: tagInfo?.color || 'var(--s-main)' }
            : { background: tagInfo ? hexToRgba(tagInfo.color, 0.4) : 'rgba(var(--s-rgb),0.40)' }
          }
        />
        <div className="flex-1 min-w-0 flex items-center">
          <span className="text-[13.5px] leading-snug font-medium text-ink-900 truncate">
            {(firstLine || '（空）').slice(0, 60)}
          </span>
        </div>
        {tagInfo && (
          <span
            className="flex-shrink-0 inline-flex items-center justify-center h-[20px] px-2 rounded-full text-[10px] font-semibold leading-none select-none"
            style={{ color: tagInfo.color, background: hexToRgba(tagInfo.color, 0.10) }}
          >{tagInfo.name}</span>
        )}
        <span
          className="flex-shrink-0 text-[12px] text-ink-400 tabular-nums"
          title={fmtTooltip(item.created_at)}
        >{fmtDate(item.created_at)}</span>
        <div className="relative flex-shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); setMenu(menuFor ? null : { id: item.id }); }}
            title={fmtTooltip(item.created_at)}
            className="w-6 h-6 rounded-lg flex items-center justify-center text-ink-300 hover:text-ink-600 hover:bg-black/[0.04] transition-colors"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" />
            </svg>
          </button>
          {menuFor && (
            <>
              <div className="fixed inset-0 z-[10]" onClick={(e) => { e.stopPropagation(); setMenu(null); }} />
              <div className="absolute right-0 top-7 z-[20] w-[120px] py-1 rounded-xl border border-ink-100 bg-white shadow-[0_8px_24px_rgba(0,0,0,0.12)] overflow-hidden">
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
                    <button
                      onClick={() => setItemTag(item, null)}
                      className={`w-full flex items-center gap-2 px-3 py-1.5 text-[12.5px] hover:bg-ink-50 transition-colors ${item.tag_id == null ? 'text-ink-900 font-medium' : 'text-ink-500'}`}
                    >
                      <span className="flex-shrink-0 w-2 h-2 rounded-full border border-ink-200" />
                      <span className="whitespace-nowrap">无标签</span>
                      {item.tag_id == null && <span className="ml-auto text-ink-400">✓</span>}
                    </button>
                    {tags.map(t => {
                      const on = Number(item.tag_id) === t.id;
                      return (
                        <button key={t.id} onClick={() => setItemTag(item, t.id)}
                          className={`w-full flex items-center gap-2 px-3 py-1.5 text-[12.5px] hover:bg-ink-50 transition-colors ${on ? 'text-ink-900 font-medium' : 'text-ink-700'}`}
                        >
                          <span className="flex-shrink-0 w-2 h-2 rounded-full" style={{ background: t.color }} />
                          <span className="whitespace-nowrap">{t.name}</span>
                          {on && <span className="ml-auto text-ink-400">✓</span>}
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
                  className="w-full text-left px-3 py-1.5 text-[12.5px] text-[#FF3B30] hover:bg-[#FF3B300F] transition-colors"
                >删除</button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  // ===== 标签筛选条 =====
  const renderFilterBar = () => (
    <div className="flex items-center gap-1.5 flex-wrap mb-1">
      <button
        onClick={() => setFilterTagId(null)}
        className={`px-2.5 py-1 rounded-full text-[12px] transition-all ${
          filterTagId == null ? 'bg-[var(--s-main)] text-white font-medium' : 'bg-ink-100 text-ink-600 hover:bg-ink-200/70'
        }`}
      >全部</button>
      {tags.map(t => {
        const on = filterTagId === t.id;
        return (
          <button
            key={t.id}
            onClick={() => setFilterTagId(on ? null : t.id)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] transition-all"
            style={{
              background: on ? t.color : hexToRgba(t.color, 0.12),
              color: on ? '#fff' : t.color,
              fontWeight: on ? 600 : 400,
            }}
          >
            <span className="w-[7px] h-[7px] rounded-full flex-shrink-0" style={{ background: on ? '#fff' : t.color }} />
            {t.name}
          </button>
        );
      })}
      <button
        onClick={() => setTagManagerOpen(true)}
        title="管理标签"
        className="w-6 h-6 rounded-full flex items-center justify-center text-ink-400 hover:bg-ink-100 hover:text-ink-700 transition-colors flex-shrink-0"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
      </button>
    </div>
  );

  const renderList = (fill) => (
    <>
      {items === null ? (
        <div className={`glass-card rounded-2xl p-10 flex items-center justify-center text-[13px] text-ink-400 ${fill ? 'flex-1' : ''}`}>加载中…</div>
      ) : items.length === 0 ? (
        <div className={`glass-card rounded-2xl p-14 flex flex-col items-center justify-center text-center gap-2 ${fill ? 'flex-1' : ''}`}>
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#C7C7CC" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11l5-5V5a2 2 0 0 0-2-2Z" />
            <path d="M15 21v-4a2 2 0 0 1 2-2h4" />
          </svg>
          <div className="text-[14px] font-semibold text-ink-900">小记是空的</div>
          <div className="text-[12px] text-ink-400">按 <kbd className="px-1 py-px rounded text-[11px] border border-ink-100 bg-white/70">N</kbd> 可随时记录</div>
        </div>
      ) : groups.length === 0 ? (
        <div className={`glass-card rounded-2xl p-14 flex flex-col items-center justify-center text-center gap-2 ${fill ? 'flex-1' : ''}`}>
          <div className="text-[13px] text-ink-400">该标签下暂无小记</div>
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

  const renderHeader = () => (
    <div className="flex items-center gap-3">
      <span className="w-[5px] h-[20px] rounded-full flex-shrink-0 self-center" style={{ background: 'var(--s-grad-bg)' }}></span>
      <span className="text-[15.5px] font-bold text-ink-900 leading-none flex-shrink-0">小记</span>
      <div className="flex items-center p-[2px] rounded-lg flex-shrink-0" style={{ background: 'rgba(120,120,128,0.08)' }}>
        <button onClick={() => switchLayout('tri')} title="三分布局"
          className="px-2 py-1 rounded-md transition-all flex items-center"
          style={layout === 'tri' ? { background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', color: 'var(--s-main)' } : { color: '#8e8e93' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="9" y1="3" x2="9" y2="21" /><line x1="15" y1="3" x2="15" y2="21" />
          </svg>
        </button>
        <button onClick={() => switchLayout('duo')} title="二分布局"
          className="px-2 py-1 rounded-md transition-all flex items-center"
          style={layout === 'duo' ? { background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', color: 'var(--s-main)' } : { color: '#8e8e93' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="12" y1="3" x2="12" y2="21" />
          </svg>
        </button>
      </div>
      <div className="flex-1" />
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span className="text-[11px] text-ink-400">快捷键</span>
        <kbd className="px-1.5 py-0.5 rounded-md text-[11px] font-medium tabular-nums border border-ink-100 bg-white/70 text-ink-500">N</kbd>
      </div>
      {isDuo && (
        <button onClick={() => setSelectedId(null)} title="新增记录"
          className="flex-shrink-0 w-[24px] h-[24px] rounded-lg flex items-center justify-center transition-all"
          style={{ background: 'var(--s-grad-bg)', color: '#fff', boxShadow: '0 2px 6px rgba(var(--s-rgb),0.25)' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
        </button>
      )}
    </div>
  );

  const renderEditPanel = (emptyHint) => {
    if (!selected && emptyHint) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 p-8">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#C7C7CC" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
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
          <QuickCapture key={selected.id} edit={selected} tags={tags} onUpdated={loadItems} onDispatch={openDetailFor} bare />
        ) : (
          <QuickCapture tags={tags} onSaved={loadItems} onDispatch={openDetailFor} bare />
        )}
      </div>
    );
  };

  const { leftStyle, rightStyle, bindRoot, bindDivider } = split;

  return (
    <div {...bindRoot} className="flex-1 min-w-0 w-full flex items-stretch">
      {isDuo ? (
        <>
          <div className="flex flex-col gap-3 min-w-0" style={leftStyle}>
            <div className="glass-card rounded-2xl p-4">
              {renderHeader()}
              <div className="mt-3.5 pt-3.5 border-t border-ink-100/80">{renderFilterBar()}</div>
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
                <QuickCapture tags={tags} onSaved={loadItems} onDispatch={openDetailFor} />
                <div className="mt-3">{renderFilterBar()}</div>
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
        onClose={() => setTagManagerOpen(false)}
        onChange={loadTags}
        toast={toast}
      />
    </div>
  );
}

// ==================== 标签管理弹窗（增删改） ====================
function TagManagerModal({ open, tags, onClose, onChange, toast }) {
  const [editing, setEditing] = useState(null); // { id?, name, color }
  const [confirmDel, setConfirmDel] = useState(null);

  useEffect(() => { if (!open) { setEditing(null); setConfirmDel(null); } }, [open]);

  function startCreate() {
    setEditing({ name: '', color: TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)] });
  }
  function startEdit(t) {
    setEditing({ id: t.id, name: t.name, color: t.color });
  }

  async function saveTag() {
    if (!editing) return;
    const name = editing.name.trim();
    if (!name) { toast.error('标签名不能为空'); return; }
    try {
      if (editing.id) {
        await API.inbox.tagUpdate(editing.id, { name, color: editing.color });
        toast.success('已更新');
      } else {
        await API.inbox.tagCreate({ name, color: editing.color });
        toast.success('已创建');
      }
      setEditing(null);
      onChange?.();
    } catch (e) { toast.error(e.message || '保存失败'); }
  }

  async function doDeleteTag() {
    if (!confirmDel) return;
    try {
      await API.inbox.tagRemove(confirmDel.id);
      toast.success('已删除');
      setConfirmDel(null);
      onChange?.();
    } catch (e) { toast.error(e.message || '删除失败'); }
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
            <button onClick={() => setConfirmDel(t)} className="text-[12px] text-[#FF3B30] hover:bg-[#FF3B300F] px-1.5 py-0.5 rounded">删除</button>
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
