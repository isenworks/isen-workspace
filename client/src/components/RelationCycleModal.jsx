import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Modal from './Modal.jsx';
import { API } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';
import { today as getToday, addDaysISO } from '../utils/date.js';
import { cycleInfo } from '../utils/relation.js';

const fmtMd = s => `${Number(s.slice(5, 7))}.${s.slice(8, 10)}`;

/**
 * 周期设置：经期是「区间」，这里做开始/结束/补录/改日期/删除
 *   入口在「关系」卡头的日历按钮，不再让用户去格子上逐日勾选
 */
export default function RelationCycleModal({ open, onClose, onChanged }) {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [newStart, setNewStart] = useState('');
  const [newEnd, setNewEnd] = useState('');

  const todayStr = getToday();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await API.relation.list(addDaysISO(todayStr, -180), todayStr);
      setRows(r.periods || []);
    } catch (e) {
      toast.error(e.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [todayStr, toast]);

  useEffect(() => {
    if (!open) return;
    setNewStart(todayStr);
    setNewEnd('');
    load();
  }, [open, load, todayStr]);

  const cycle = cycleInfo(rows, todayStr);
  const openRow = rows.find(p => !p.end_date) || null;

  async function run(fn, okMsg) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      await load();
      onChanged?.();
      if (okMsg) toast.success?.(okMsg);
    } catch (e) {
      toast.error(e.message || '操作失败');
    } finally {
      setBusy(false);
    }
  }

  const markToday = (action) => run(
    () => API.relation.period(action, todayStr),
    action === 'start' ? '已记录经期开始' : '已记录经期结束'
  );

  function patchRow(p, key, value) {
    const start = key === 'start_date' ? value : p.start_date;
    const end = key === 'end_date' ? value : (p.end_date || '');
    if (!start) return;
    if (end && end < start) {
      toast.error('结束日期不能早于开始日期');
      return;
    }
    return run(() => API.relation.period('update', todayStr, {
      id: p.id,
      start_date: start,
      end_date: end || '',
    }));
  }

  function removeRow(p) {
    return run(() => API.relation.period('remove', todayStr, { id: p.id }), '已删除这段记录');
  }

  function addRow() {
    if (!newStart) return;
    if (newEnd && newEnd < newStart) {
      toast.error('结束日期不能早于开始日期');
      return;
    }
    return run(
      () => API.relation.period('create', todayStr, { start_date: newStart, end_date: newEnd || '' }),
      '已补录一段'
    ).then(() => setNewEnd(''));
  }

  return createPortal(
    <Modal
      open={open}
      onClose={onClose}
      title="周期设置"
      maxWidth={440}
      headerExtra={<span className="text-[11px] text-ink-400">{loading ? '加载中…' : cycle.label}</span>}
    >
      {/* 今天：一个月只动一两次的动作，放在设置里，不占首页卡片 */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={busy || cycle.key === 'period'}
          onClick={() => markToday('start')}
          className="flex-1 h-8 rounded-lg text-[12px] font-semibold transition active:scale-[0.98] disabled:opacity-40"
          style={{ color: 'var(--m-life)', background: 'rgba(var(--m-life-rgb),0.1)' }}
        >今天经期开始</button>
        <button
          type="button"
          disabled={busy || !openRow}
          onClick={() => markToday('end')}
          className="flex-1 h-8 rounded-lg text-[12px] font-semibold transition active:scale-[0.98] disabled:opacity-40"
          style={{ color: 'var(--m-life)', background: 'rgba(var(--m-life-rgb),0.1)' }}
        >今天经期结束</button>
      </div>

      <div className="mt-4 mb-1.5 flex items-baseline justify-between">
        <span className="text-[11px] text-ink-400">历史区间（近半年）</span>
        <span className="text-[10.5px] text-ink-300">结束留空 = 进行中</span>
      </div>

      <div className="flex flex-col gap-1.5 max-h-[38vh] overflow-y-auto pr-0.5">
        {!loading && rows.length === 0 && (
          <div className="text-[12px] text-ink-400 text-center py-4 rounded-lg border border-dashed border-ink-100">
            还没有经期记录
          </div>
        )}
        {rows.map(p => (
          <div key={p.id} className="flex items-center gap-1.5">
            <input
              type="date"
              value={p.start_date}
              max={todayStr}
              onChange={e => patchRow(p, 'start_date', e.target.value)}
              className="h-7 px-1.5 rounded-md text-[11.5px] tabular-nums outline-none min-w-0 flex-1"
              style={{ background: 'rgba(120,120,128,0.07)', border: '1px solid rgba(60,60,67,0.1)' }}
            />
            <span className="text-[10px] text-ink-300 flex-shrink-0">→</span>
            <input
              type="date"
              value={p.end_date || ''}
              max={todayStr}
              onChange={e => patchRow(p, 'end_date', e.target.value)}
              className="h-7 px-1.5 rounded-md text-[11.5px] tabular-nums outline-none min-w-0 flex-1"
              style={{ background: 'rgba(120,120,128,0.07)', border: '1px solid rgba(60,60,67,0.1)' }}
            />
            {!p.end_date && (
              <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--m-life)' }}>进行中</span>
            )}
            <button
              type="button"
              onClick={() => removeRow(p)}
              disabled={busy}
              className="w-6 h-6 rounded-md grid place-items-center flex-shrink-0 text-ink-300 hover:text-[var(--danger)] hover:bg-black/5 transition disabled:opacity-40"
              title="删除这段"
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      {/* 补录：忘了当天标记时用 */}
      <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--hairline, rgba(60,60,67,0.1))' }}>
        <div className="text-[11px] text-ink-400 mb-1.5">补录一段</div>
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={newStart}
            max={todayStr}
            onChange={e => setNewStart(e.target.value)}
            className="h-7 px-1.5 rounded-md text-[11.5px] tabular-nums outline-none min-w-0 flex-1"
            style={{ background: 'rgba(120,120,128,0.07)', border: '1px solid rgba(60,60,67,0.1)' }}
          />
          <span className="text-[10px] text-ink-300 flex-shrink-0">→</span>
          <input
            type="date"
            value={newEnd}
            max={todayStr}
            onChange={e => setNewEnd(e.target.value)}
            className="h-7 px-1.5 rounded-md text-[11.5px] tabular-nums outline-none min-w-0 flex-1"
            style={{ background: 'rgba(120,120,128,0.07)', border: '1px solid rgba(60,60,67,0.1)' }}
          />
          <button
            type="button"
            onClick={addRow}
            disabled={busy || !newStart}
            className="h-7 px-2.5 rounded-md text-[11.5px] font-semibold flex-shrink-0 transition active:scale-95 disabled:opacity-40"
            style={{ color: 'var(--surface-card)', background: 'var(--m-life)' }}
          >添加</button>
        </div>
        {rows[0] && (
          <div className="mt-2 text-[10.5px] text-ink-300">
            上一段：{fmtMd(rows[0].start_date)}{rows[0].end_date ? ` – ${fmtMd(rows[0].end_date)}` : ' 起'}
          </div>
        )}
      </div>
    </Modal>,
    document.body
  );
}
