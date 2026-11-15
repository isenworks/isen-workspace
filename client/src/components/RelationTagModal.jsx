import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Modal from './Modal.jsx';
import { API } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';

const PALETTE = ['#34C759', '#FFCC00', '#FF9500', '#FF3B30', '#AF52DE', '#5E5CE6', '#007AFF', '#00C7BE', '#8E8E93', '#A2845E'];

const GROUPS = [
  { kind: 'tag', title: '相处标签', ph: '新标签，如「冷战」' },
  { kind: 'mood', title: '心情标签', ph: '新心情，如「很累」', hint: '从上到下 = 折线图由好到差' },
];
const kindOf = t => (t?.kind === 'mood' ? 'mood' : 'tag');

/**
 * 标签管理：相处与心情各一组，都支持改名字 / 换颜色 / 删除 / 新增
 *   改的是 label 与 color，key 保持不变 —— 否则历史记录会失去归属、统计口径漂移
 */
export default function RelationTagModal({ open, onClose, tags, onChanged }) {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [newLabel, setNewLabel] = useState({ tag: '', mood: '' });

  useEffect(() => {
    if (open) { setRows(Array.isArray(tags) ? tags : []); setNewLabel({ tag: '', mood: '' }); }
  }, [open, tags]);

  async function run(fn) {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fn();
      if (r?.tags) setRows(r.tags);
      onChanged?.();
    } catch (e) {
      toast.error(e.message || '保存失败');
    } finally {
      setBusy(false);
    }
  }

  const saveRow = (kind, t, patch) => {
    const next = { ...t, ...patch };
    if (!String(next.label || '').trim()) {
      toast.error('标签名不能为空');
      return;
    }
    return run(() => API.relation.tags('save', { kind, key: t.key, label: next.label.trim(), color: next.color }));
  };

  function cycleColor(kind, t) {
    const i = PALETTE.indexOf(t.color);
    const color = PALETTE[(i + 1) % PALETTE.length];
    return run(() => API.relation.tags('save', { kind, key: t.key, label: t.label, color }));
  }

  function removeRow(kind, t) {
    if (rows.filter(r => kindOf(r) === kind).length <= 1) {
      toast.error('至少保留一个标签');
      return;
    }
    return run(() => API.relation.tags('remove', { kind, key: t.key }));
  }

  function addRow(kind) {
    const label = (newLabel[kind] || '').trim();
    if (!label) return;
    return run(() => API.relation.tags('save', { kind, label, color: PALETTE[0] }))
      .then(() => setNewLabel(p => ({ ...p, [kind]: '' })));
  }

  return createPortal(
    <Modal
      open={open}
      onClose={onClose}
      title="标签管理"
      maxWidth={420}
      headerExtra={<span className="text-[11.5px] text-ink-400">点色块换颜色</span>}
    >
      {GROUPS.map(g => {
        const list = rows.filter(r => kindOf(r) === g.kind);
        return (
          <div key={g.kind} className="mb-3 last:mb-0">
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-[12px] font-semibold text-ink-500">{g.title}</span>
              {g.hint && <span className="text-[10.5px] text-ink-300">{g.hint}</span>}
            </div>

            <div className="flex flex-col gap-1.5">
              {list.map(t => (
                <div key={t.key} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => cycleColor(g.kind, t)}
                    className="w-[18px] h-[18px] rounded-md flex-shrink-0 transition active:scale-90"
                    style={{ background: t.color }}
                    title="换颜色"
                  />
                  <input
                    defaultValue={t.label}
                    key={`${t.key}-${t.label}`}
                    maxLength={12}
                    onBlur={e => {
                      const v = e.target.value.trim();
                      if (v && v !== t.label) saveRow(g.kind, t, { label: v });
                      else e.target.value = t.label;
                    }}
                    onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                    className="flex-1 min-w-0 h-7 px-2 rounded-md text-[12px] outline-none"
                    style={{ background: 'rgba(120,120,128,0.07)', border: '1px solid rgba(60,60,67,0.1)' }}
                  />
                  <button
                    type="button"
                    onClick={() => removeRow(g.kind, t)}
                    disabled={busy || list.length <= 1}
                    className="w-6 h-6 rounded-md grid place-items-center flex-shrink-0 text-ink-300 hover:text-[var(--danger)] hover:bg-black/5 transition disabled:opacity-30"
                    title="删除标签"
                  >
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-2 flex items-center gap-1.5">
              <input
                value={newLabel[g.kind] || ''}
                onChange={e => setNewLabel(p => ({ ...p, [g.kind]: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') addRow(g.kind); }}
                placeholder={g.ph}
                maxLength={12}
                className="flex-1 min-w-0 h-7 px-2 rounded-md text-[12px] outline-none"
                style={{ background: 'rgba(120,120,128,0.07)', border: '1px solid rgba(60,60,67,0.1)' }}
              />
              <button
                type="button"
                onClick={() => addRow(g.kind)}
                disabled={busy || !(newLabel[g.kind] || '').trim()}
                className="h-7 px-2.5 rounded-md text-[11.5px] font-semibold flex-shrink-0 transition active:scale-95 disabled:opacity-40"
                style={{ color: 'var(--surface-card)', background: 'var(--m-life)' }}
              >添加</button>
            </div>
          </div>
        );
      })}

      <div className="mt-1 text-[10.5px] text-ink-300">删除后历史记录仍保留，显示为「已删除」灰标签</div>
    </Modal>,
    document.body
  );
}
