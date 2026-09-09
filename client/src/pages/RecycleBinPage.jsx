import { useState, useEffect, useCallback } from 'react';
import { API } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';
import Modal from '../components/Modal.jsx';
import { useSplitRatio, SplitDivider } from '../components/useSplitRatio.jsx';

/* ============================================================
   RecycleBinPage · 回收站（双栏 38:62，与工作台各页同构）
   左栏（38%）：卡① 页头（色条+标题+清空） + 卡② 类型导航（计数筛选）
   右栏（62%）：删除时间倒序，「今天 / 昨天 / 7 天内 / 更早」分组列表
   - 「恢复」为唯一常显主操作；永久删除 hover 才点亮（降噪防误触）
   - 危险操作（永久删除 / 清空）走全局 Modal 明细确认，替换原生 confirm
   ============================================================ */

const TYPE_META = {
  task:          { label: '待办',     color: '#007AFF' },
  schedule:      { label: '日程',     color: '#34C759' },
  habit:         { label: '习惯',     color: '#FF9F0A' },
  fixedSchedule: { label: '固定日程', color: '#5856D6' },
  summary:       { label: '总结',     color: '#FF2D55' },
  inbox:         { label: '收集',     color: '#5AC8FA' },
};

// 从快照 payload 提取展示信息：{ title, sub }
function describeItem(type, payload) {
  try {
    const row = payload?.row || {};
    switch (type) {
      case 'task':
        return { title: row.title || '未命名待办', sub: row.date || '' };
      case 'schedule': {
        const time = row.start_time ? ` · ${row.start_time}${row.end_time ? `–${row.end_time}` : ''}` : '';
        return { title: row.title || '未命名日程', sub: `${row.date || ''}${time}` };
      }
      case 'habit': {
        const logs = Array.isArray(payload?.logs) ? payload.logs.filter(l => l.done).length : 0;
        return { title: `${row.emoji || '✅'} ${row.name || '未命名习惯'}`, sub: `累计打卡 ${logs} 天` };
      }
      case 'fixedSchedule':
        return { title: `${row.emoji || '📌'} ${row.name || '未命名固定日程'}`, sub: `${row.start_time || ''}–${row.end_time || ''}` };
      case 'summary':
        return { title: `${row.date || ''} 的每日总结`, sub: (row.content || '').slice(0, 60) || '' };
      case 'inbox':
        return { title: row.content || '未命名想法', sub: row.processed_type ? `已分派为${row.processed_type === 'schedule' ? '日程' : '待办'}` : '' };
      default:
        return { title: '未知条目', sub: '' };
    }
  } catch { return { title: '未知条目', sub: '' }; }
}

/* 删除时间解析（无时区标记的按 UTC 补 Z，与后端写入格式对齐） */
function parseDeletedAt(iso) {
  if (!iso) return null;
  const d = new Date(iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z');
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDeletedAt(iso) {
  const d = parseDeletedAt(iso);
  if (!d) return '';
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return '刚刚删除';
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前删除`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前删除`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)} 天前删除`;
  return `${d.getMonth() + 1}月${d.getDate()}日删除`;
}

/* 时间分组桶（「最近删除」心智）：今天 / 昨天 / 7 天内 / 更早 */
const GROUP_ORDER = ['today', 'yesterday', 'week', 'older'];
const GROUP_LABELS = { today: '今天', yesterday: '昨天', week: '7 天内', older: '更早' };
function bucketOf(iso) {
  const d = parseDeletedAt(iso);
  if (!d) return 'older';
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t = d.getTime();
  if (t >= startToday) return 'today';
  if (t >= startToday - 86400000) return 'yesterday';
  if (t >= startToday - 7 * 86400000) return 'week';
  return 'older';
}

export default function RecycleBinPage() {
  const toast = useToast();
  const [items, setItems] = useState(null); // null=加载中
  const [filter, setFilter] = useState('all');
  const [busyIds, setBusyIds] = useState(new Set());
  // 危险操作确认弹窗：null | {kind:'remove', id, title, typeLabel} | {kind:'clear'}
  const [confirming, setConfirming] = useState(null);
  const { leftStyle, rightStyle, bindRoot, bindDivider } = useSplitRatio('recycle_split_ratio', { def: 0.38 });

  const load = useCallback(async () => {
    try {
      const r = await API.recycleBin.list();
      setItems(r.items || []);
    } catch (e) {
      setItems([]);
      toast.error(e.message || '加载失败');
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  /* 删除时间倒序 + 分组 */
  const sorted = [...(items || [])].sort((a, b) =>
    (parseDeletedAt(b.deleted_at)?.getTime() || 0) - (parseDeletedAt(a.deleted_at)?.getTime() || 0));
  const filtered = sorted.filter(it => filter === 'all' || it.source_type === filter);
  const grouped = GROUP_ORDER
    .map(bucket => ({ bucket, rows: filtered.filter(it => bucketOf(it.deleted_at) === bucket) }))
    .filter(g => g.rows.length > 0);

  const counts = { all: items?.length || 0 };
  (items || []).forEach(it => { counts[it.source_type] = (counts[it.source_type] || 0) + 1; });
  // 清空确认的分类明细（如「3 条待办、2 条日程」）
  const clearBreakdown = Object.entries(TYPE_META)
    .map(([k, m]) => (counts[k] ? `${counts[k]} 条${m.label}` : null))
    .filter(Boolean)
    .join('、');

  async function handleRestore(id) {
    setBusyIds(prev => new Set(prev).add(id));
    try {
      await API.recycleBin.restore(id);
      setItems(prev => prev.filter(it => it.id !== id));
      toast.success('已恢复到原位');
    } catch (e) {
      toast.error(e.message || '恢复失败');
    } finally {
      setBusyIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    }
  }

  /* 永久删除（Modal 确认后执行） */
  function askRemove(it) {
    const meta = TYPE_META[it.source_type] || { label: it.source_type };
    let payload = null;
    try { payload = JSON.parse(it.payload); } catch { /* ignore */ }
    const { title } = describeItem(it.source_type, payload);
    setConfirming({ kind: 'remove', id: it.id, title, typeLabel: meta.label });
  }
  async function doRemove(id) {
    setBusyIds(prev => new Set(prev).add(id));
    try {
      await API.recycleBin.remove(id);
      setItems(prev => prev.filter(it => it.id !== id));
      toast.success('已永久删除');
      setConfirming(null);
    } catch (e) {
      toast.error(e.message || '删除失败');
    } finally {
      setBusyIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    }
  }

  /* 清空（Modal 确认后执行，含分类明细） */
  async function doClear() {
    setBusyIds(prev => new Set(prev).add('clear'));
    try {
      await API.recycleBin.clear();
      setItems([]);
      toast.success('回收站已清空');
      setConfirming(null);
    } catch (e) {
      toast.error(e.message || '清空失败');
    } finally {
      setBusyIds(prev => { const n = new Set(prev); n.delete('clear'); return n; });
    }
  }

  /* 导航行（全部 + 各类型）：与生活页类目导航同构 */
  const navRowCls = (active) =>
    `group flex items-center gap-2 px-2.5 h-9 rounded-lg text-sm transition text-left ${active
      ? 'font-bold bg-[rgba(var(--s-rgb),0.10)]'
      : 'font-medium text-ink-700 hover:bg-surface-soft'}`;

  return (
    <div {...bindRoot} className="flex-1 min-w-0 w-full flex items-stretch">
      {/* ===== 左列（38%）：卡① 页头 + 卡② 类型导航 ===== */}
      <div className="flex flex-col gap-3 min-w-0" style={leftStyle}>
        <div className="glass-card rounded-2xl p-4">
          <div className="flex items-center gap-3">
            <span className="w-[5px] h-[20px] rounded-full flex-shrink-0 self-center" style={{ background: 'var(--s-grad-bg)' }}></span>
            <div className="flex-1 min-w-0">
              <div className="text-[15.5px] font-bold text-ink-900 leading-none">回收站</div>
              <div className="text-[11px] text-ink-400 leading-none mt-1.5">删除的事项会暂存在这里，可随时恢复</div>
            </div>
            {items && items.length > 0 && (
              <button
                onClick={() => setConfirming({ kind: 'clear' })}
                className="flex-shrink-0 text-[13px] font-medium text-[#FF3B30] px-3 py-1.5 rounded-lg hover:bg-[#FF3B3014] transition-colors"
              >
                清空回收站
              </button>
            )}
          </div>
        </div>

        {/* 卡② 类型导航：全部 + 6 类（色点 + 标签 + 计数）；点击筛选，再点取消 */}
        <div className="glass-card rounded-2xl p-3 flex-1 flex flex-col gap-1">
          <div className={navRowCls(filter === 'all')} style={filter === 'all' ? { color: 'var(--s-main)' } : undefined}>
            <button onClick={() => setFilter('all')} className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer text-left" title="显示全部">
              <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" rx="1.5"/>
                <rect x="14" y="3" width="7" height="7" rx="1.5"/>
                <rect x="3" y="14" width="7" height="7" rx="1.5"/>
                <rect x="14" y="14" width="7" height="7" rx="1.5"/>
              </svg>
              <span className="flex-1 truncate">全部</span>
            </button>
            <span className={`text-[12px] tabular-nums ${filter === 'all' ? '' : 'text-ink-400'}`}>{counts.all}</span>
          </div>
          {Object.entries(TYPE_META).map(([k, m]) => {
            const active = filter === k;
            return (
              <div key={k} className={navRowCls(active)} style={active ? { color: 'var(--s-main)' } : undefined}>
                <button
                  onClick={() => setFilter(active ? 'all' : k)}
                  className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer text-left"
                  title={active ? '点击取消筛选' : `筛选${m.label}`}>
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: m.color }} />
                  <span className="flex-1 truncate">{m.label}</span>
                </button>
                <span className={`text-[12px] tabular-nums ${active ? '' : 'text-ink-400'}`}>{counts[k] || 0}</span>
              </div>
            );
          })}
        </div>
      </div>

      <SplitDivider bindDivider={bindDivider} />

      {/* ===== 右列（62%）：时间分组列表 ===== */}
      <div className="glass-card rounded-2xl border border-ink-100 p-4 min-w-0 flex flex-col" style={rightStyle}>
        {items === null ? (
          <div className="flex-1 flex items-center justify-center text-[13px] text-ink-400">加载中…</div>
        ) : grouped.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 p-10">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#C7C7CC" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
            <div className="text-[14px] font-semibold text-ink-900">{items.length === 0 ? '回收站是空的' : '该分类下暂无内容'}</div>
            <div className="text-[12px] text-ink-400">删除的待办、日程、习惯、固定日程和总结会出现在这里</div>
          </div>
        ) : grouped.map((g, gi) => (
          <div key={g.bucket}>
            <div className={`text-[12px] font-semibold text-ink-400 tracking-wide mb-1.5 ${gi === 0 ? '' : 'mt-4'}`}>
              {GROUP_LABELS[g.bucket]} · {g.rows.length}
            </div>
            {g.rows.map(it => {
              const meta = TYPE_META[it.source_type] || { label: it.source_type, color: '#8E8E93' };
              let payload = null;
              try { payload = JSON.parse(it.payload); } catch { /* ignore */ }
              const { title, sub } = describeItem(it.source_type, payload);
              const busy = busyIds.has(it.id);
              return (
                <div key={it.id} className="group flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-ink-50 transition-colors">
                  <span
                    className="flex-shrink-0 text-[11px] font-semibold px-2 py-1 rounded-md"
                    style={{ color: meta.color, background: `${meta.color}14` }}
                  >
                    {meta.label}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13.5px] font-medium text-ink-900 truncate leading-tight">{title}</div>
                    <div className="text-[11px] text-ink-400 truncate leading-tight mt-1">
                      {sub ? `${sub} · ` : ''}{formatDeletedAt(it.deleted_at)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      disabled={busy}
                      onClick={() => handleRestore(it.id)}
                      className="text-[12.5px] font-medium text-[color:var(--s-main)] px-2.5 py-1.5 rounded-lg hover:bg-[rgba(var(--s-rgb),0.08)] disabled:opacity-40 transition-colors"
                    >
                      恢复
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => askRemove(it)}
                      title="永久删除"
                      className="text-[#FF3B30] w-8 h-8 rounded-lg hover:bg-[#FF3B3014] disabled:opacity-40 opacity-30 group-hover:opacity-100 transition-all flex items-center justify-center"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* ===== 危险操作确认（替换原生 window.confirm） ===== */}
      <Modal
        open={!!confirming}
        onClose={() => setConfirming(null)}
        title={confirming?.kind === 'clear' ? '清空回收站' : '永久删除'}
        maxWidth={420}
        footer={
          <>
            <button
              onClick={() => setConfirming(null)}
              className="px-3.5 py-1.5 rounded-lg text-[13px] font-medium text-ink-600 bg-ink-100 hover:bg-ink-100/70 transition-colors"
            >
              取消
            </button>
            <button
              onClick={() => confirming?.kind === 'clear' ? doClear() : doRemove(confirming.id)}
              disabled={busyIds.has(confirming?.kind === 'clear' ? 'clear' : confirming?.id)}
              className="px-3.5 py-1.5 rounded-lg text-[13px] font-semibold text-white bg-[#FF3B30] hover:brightness-105 active:scale-[0.98] disabled:opacity-40 transition-all"
            >
              {confirming?.kind === 'clear' ? '全部清空' : '永久删除'}
            </button>
          </>
        }
      >
        {confirming?.kind === 'clear' ? (
          <div className="text-[13px] leading-relaxed">
            <div className="text-ink-600">将永久删除全部 {items?.length || 0} 项，无法恢复：</div>
            {clearBreakdown && <div className="mt-2 font-semibold text-ink-900">{clearBreakdown}</div>}
          </div>
        ) : confirming && (
          <div className="text-[13px] leading-relaxed">
            <div className="text-ink-600">永久删除后无法恢复，确定删除这条{confirming.typeLabel}吗？</div>
            <div className="mt-2 font-semibold text-ink-900 break-words">{confirming.title}</div>
          </div>
        )}
      </Modal>
    </div>
  );
}
