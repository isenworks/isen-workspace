import { useState, useEffect, useCallback } from 'react';
import { API } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';

/* ============================================================
   RecycleBinPage · 回收站
   工作台所有删除的事项（待办/日程/习惯/固定日程/总结）先进入回收站，
   可恢复回原位或永久删除。iOS 设置页风格：左色条标题 + 分组内缩圆角块。
   ============================================================ */

const TYPE_META = {
  task:          { label: '待办',     color: '#007AFF' },
  schedule:      { label: '日程',     color: '#34C759' },
  habit:         { label: '习惯',     color: '#FF9F0A' },
  fixedSchedule: { label: '固定日程', color: '#5856D6' },
  summary:       { label: '总结',     color: '#FF2D55' },
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
      default:
        return { title: '未知条目', sub: '' };
    }
  } catch { return { title: '未知条目', sub: '' }; }
}

function formatDeletedAt(iso) {
  if (!iso) return '';
  const d = new Date(iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z');
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return '刚刚删除';
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前删除`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前删除`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)} 天前删除`;
  return `${d.getMonth() + 1}月${d.getDate()}日删除`;
}

export default function RecycleBinPage({ onBack }) {
  const toast = useToast();
  const [items, setItems] = useState(null); // null=加载中
  const [filter, setFilter] = useState('all');
  const [busyIds, setBusyIds] = useState(new Set());

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

  const filtered = (items || []).filter(it => filter === 'all' || it.source_type === filter);
  const counts = { all: items?.length || 0 };
  (items || []).forEach(it => { counts[it.source_type] = (counts[it.source_type] || 0) + 1; });

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

  async function handlePermanentRemove(id) {
    if (!window.confirm('永久删除后无法恢复，确定吗？')) return;
    setBusyIds(prev => new Set(prev).add(id));
    try {
      await API.recycleBin.remove(id);
      setItems(prev => prev.filter(it => it.id !== id));
      toast.success('已永久删除');
    } catch (e) {
      toast.error(e.message || '删除失败');
    } finally {
      setBusyIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    }
  }

  async function handleClear() {
    if (!window.confirm(`将永久删除回收站全部 ${items.length} 项，无法恢复，确定吗？`)) return;
    try {
      await API.recycleBin.clear();
      setItems([]);
      toast.success('回收站已清空');
    } catch (e) {
      toast.error(e.message || '清空失败');
    }
  }

  return (
    <div className="flex-1 min-w-0 max-w-[860px] w-full mx-auto flex flex-col gap-4">
      {/* ===== Header：色条 + 标题 + 清空按钮 ===== */}
      <div className="glass-card rounded-2xl p-4">
        <div className="flex items-center gap-3">
          <span className="w-[5px] h-[20px] rounded-full flex-shrink-0 self-center" style={{ background: 'var(--s-grad-bg)' }}></span>
          <div className="flex-1 min-w-0">
            <div className="text-[15.5px] font-bold text-ink-900 leading-none">回收站</div>
            <div className="text-[11px] text-ink-400 leading-none mt-1.5">
              删除的事项会暂存在这里，可随时恢复
            </div>
          </div>
          {items && items.length > 0 && (
            <button
              onClick={handleClear}
              className="flex-shrink-0 text-[13px] font-medium text-[#FF3B30] px-3 py-1.5 rounded-lg hover:bg-[#FF3B3014] transition-colors"
            >
              清空回收站
            </button>
          )}
        </div>

        {/* 筛选 chips */}
        {items && items.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap mt-3.5">
            {[{ key: 'all', label: '全部' }, ...Object.entries(TYPE_META).map(([k, m]) => ({ key: k, label: m.label }))]
              .filter(c => counts[c.key] > 0)
              .map(c => (
                <button
                  key={c.key}
                  onClick={() => setFilter(c.key)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-medium transition-all ${
                    filter === c.key
                      ? 'bg-ink-900 text-white'
                      : 'bg-ink-100 text-ink-600 hover:bg-ink-100/70'
                  }`}
                >
                  {c.key !== 'all' && (
                    <span
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ background: TYPE_META[c.key].color }}
                    />
                  )}
                  {c.label}
                  <span className={`tabular-nums ${filter === c.key ? 'text-white/70' : 'text-ink-400'}`}>{counts[c.key]}</span>
                </button>
              ))}
          </div>
        )}
      </div>

      {/* ===== 列表 ===== */}
      {items === null ? (
        <div className="glass-card rounded-2xl p-10 flex items-center justify-center text-[13px] text-ink-400">加载中…</div>
      ) : filtered.length === 0 ? (
        <div className="glass-card rounded-2xl p-14 flex flex-col items-center justify-center text-center gap-2">
          {/* 垃圾桶 · iOS 风 */}
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#C7C7CC" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
          <div className="text-[14px] font-semibold text-ink-900">{items.length === 0 ? '回收站是空的' : '该分类下暂无内容'}</div>
          <div className="text-[12px] text-ink-400">删除的待办、日程、习惯、固定日程和总结会出现在这里</div>
        </div>
      ) : (
        <div className="glass-card rounded-2xl border border-ink-100 p-1.5 flex flex-col gap-0.5">
          {filtered.map(it => {
            const meta = TYPE_META[it.source_type] || { label: it.source_type, color: '#8E8E93' };
            let payload = null;
            try { payload = JSON.parse(it.payload); } catch { /* ignore */ }
            const { title, sub } = describeItem(it.source_type, payload);
            const busy = busyIds.has(it.id);
            return (
              <div
                key={it.id}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-ink-50 transition-colors"
              >
                {/* 类型徽标 */}
                <span
                  className="flex-shrink-0 text-[11px] font-semibold px-2 py-1 rounded-md"
                  style={{ color: meta.color, background: `${meta.color}14` }}
                >
                  {meta.label}
                </span>
                {/* 主体 */}
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-medium text-ink-900 truncate leading-tight">{title}</div>
                  <div className="text-[11px] text-ink-400 truncate leading-tight mt-1">
                    {sub ? `${sub} · ` : ''}{formatDeletedAt(it.deleted_at)}
                  </div>
                </div>
                {/* 操作 */}
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
                    onClick={() => handlePermanentRemove(it.id)}
                    title="永久删除"
                    className="text-[#FF3B30] w-8 h-8 rounded-lg hover:bg-[#FF3B3014] disabled:opacity-40 transition-colors flex items-center justify-center"
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
      )}
    </div>
  );
}
