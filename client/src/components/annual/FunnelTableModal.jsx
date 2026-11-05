import React, { useState, useMemo } from 'react';
import Modal from '../Modal.jsx';
import { uid } from './utils.js';
import { moduleRgba } from '../../utils/color.js';

const RED = 'var(--m-work)';

/* 首开建表：按当前手填的 实际值 生成占位公司行（累计口径还原）
   例：25/6/3/1/1 → 第1层 19 家、第2层 3 家、第3层 2 家、第4层 0 家、第5层 1 家 */
export function seedPipelineRows(krs = []) {
  const counts = krs.map(k => Math.max(0, Number(k.v) || 0));
  for (let i = 1; i < counts.length; i++) counts[i] = Math.min(counts[i], counts[i - 1]);
  const rows = [];
  const today = new Date().toISOString().slice(0, 10);
  for (let i = 0; i < counts.length; i++) {
    const deeper = counts[i + 1] || 0;
    for (let j = 0; j < counts[i] - deeper; j++) {
      rows.push({
        id: uid(),
        name: `公司${String(rows.length + 1).padStart(2, '0')}`,
        stageIdx: i,
        note: '',
        at: today,
      });
    }
  }
  return rows;
}

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function FunnelTableModal({ open, goalTitle, krs = [], rows = [], onChange, onClose }) {
  const [q, setQ] = useState('');
  const [stageFilter, setStageFilter] = useState(null); // null = 全部
  const [justAdded, setJustAdded] = useState(null);

  const n = krs.length;
  const countAt = useMemo(
    () => krs.map((_, i) => rows.filter(r => Math.min(Math.max(r.stageIdx ?? 0, 0), n - 1) >= i).length),
    [rows, krs, n]
  );

  const commit = (next) => onChange?.(next);

  const patch = (id, field, value) => {
    commit(rows.map(r => (r.id === id ? { ...r, [field]: value, at: todayStr() } : r)));
  };

  const addRow = () => {
    const stageIdx = stageFilter === null ? 0 : stageFilter;
    const row = { id: uid(), name: '', stageIdx, note: '', at: todayStr() };
    setJustAdded(row.id);
    commit([...rows, row]);
  };

  const removeRow = (id) => commit(rows.filter(r => r.id !== id));

  const visible = rows
    .filter(r => (stageFilter === null ? true : (r.stageIdx ?? 0) >= stageFilter))
    .filter(r => {
      const kw = q.trim().toLowerCase();
      if (!kw) return true;
      return (r.name || '').toLowerCase().includes(kw) || (r.note || '').toLowerCase().includes(kw);
    })
    .sort((a, b) => ((b.stageIdx ?? 0) - (a.stageIdx ?? 0)) || (String(b.at) > String(a.at) ? 1 : -1));

  return (
    <Modal open={open} onClose={onClose} title="漏斗数据表" maxWidth={880}>
      <div className="flex flex-col gap-3">
        {/* 目标名 + 口径说明 */}
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-[13px] font-bold text-ink-900 truncate">{goalTitle}</span>
          <span className="text-[11px] text-ink-400 leading-relaxed">
            每家公司在表中只出现一次，按「当前阶段」自动累计到各层
          </span>
        </div>

        {/* 层摘要：点击筛选，右侧显示该层 实际/目标 */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setStageFilter(null)}
            className="h-[24px] px-2.5 rounded-full text-[11px] font-semibold transition"
            style={stageFilter === null
              ? { background: RED, color: '#fff' }
              : { background: 'rgba(15,23,42,0.05)', color: '#8a9491' }}>
            全部 {rows.length}
          </button>
          {krs.map((k, i) => (
            <button key={i}
              onClick={() => setStageFilter(stageFilter === i ? null : i)}
              className="h-[24px] px-2.5 rounded-full text-[11px] font-semibold tabular-nums transition flex items-center gap-1"
              style={stageFilter === i
                ? { background: RED, color: '#fff' }
                : { background: 'rgba(15,23,42,0.05)', color: '#8a9491' }}>
              <span className="opacity-60">{String(i + 1).padStart(2, '0')}</span>
              {k.t}
              <span className="font-extrabold">{countAt[i]}</span>
              <span className="opacity-50">/{k.tgt}{k.u}</span>
            </button>
          ))}
        </div>

        {/* 工具条 */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 flex-1 h-[30px] px-2.5 rounded-lg bg-black/[0.035]">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#a8b0ad" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="搜索公司 / 备注"
              className="flex-1 bg-transparent outline-none text-[12px] text-ink-900 placeholder:text-ink-300" />
            {q && (
              <button onClick={() => setQ('')} className="text-ink-300 hover:text-ink-700 text-[13px] leading-none">×</button>
            )}
          </div>
          <button onClick={addRow}
            className="h-[30px] px-3 rounded-lg text-[12px] font-semibold flex items-center gap-1 transition hover:brightness-105 active:scale-[0.98]"
            style={{ background: moduleRgba('work', 0.10), color: RED }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={RED} strokeWidth="2.6" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
            添加公司
          </button>
        </div>

        {/* 表体 */}
        <div className="rounded-xl border border-ink-100 overflow-auto" style={{ maxHeight: '48vh' }}>
          <div className="min-w-[660px]">
            <div className="sticky top-0 z-10 grid grid-cols-[1.15fr_0.85fr_1.7fr_52px_28px] gap-2 px-3 py-2 bg-white border-b border-ink-100">
              {['公司', '当前阶段', '备注 · 面试情况 / 未通过原因', '更新', ''].map((h, i) => (
                <span key={i} className="text-[10px] font-semibold tracking-wide" style={{ color: '#a8b0ad' }}>{h}</span>
              ))}
            </div>

            {visible.length === 0 ? (
              <div className="py-10 text-center text-[12px]" style={{ color: '#a8b0ad' }}>
                {rows.length === 0 ? '还没有公司记录，点上方「添加公司」开始填写' : '没有匹配的记录'}
              </div>
            ) : visible.map(r => (
              <div key={r.id}
                className="group grid grid-cols-[1.15fr_0.85fr_1.7fr_52px_28px] gap-2 px-3 py-1.5 items-start border-b border-ink-100/70 last:border-b-0 hover:bg-black/[0.015]">
                {/* 公司名：无边框输入，失焦落库 */}
                <input
                  defaultValue={r.name}
                  autoFocus={r.id === justAdded}
                  placeholder="输入公司名"
                  onBlur={e => { if (e.target.value !== r.name) patch(r.id, 'name', e.target.value); }}
                  onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
                  className="w-full text-[12.5px] font-semibold text-ink-900 bg-transparent rounded px-1 py-[3px] outline-none focus:bg-black/[0.04] placeholder:text-ink-300 placeholder:font-normal"
                />

                {/* 当前阶段：药丸下拉 */}
                <div className="relative">
                  <select
                    value={r.stageIdx ?? 0}
                    onChange={e => patch(r.id, 'stageIdx', Number(e.target.value))}
                    className="w-full appearance-none text-[11.5px] font-semibold rounded-full pl-2.5 pr-6 py-[3px] outline-none cursor-pointer truncate"
                    style={{ background: moduleRgba('work', 0.09), color: RED, border: 'none' }}>
                    {krs.map((k, i) => <option key={i} value={i}>{k.t}</option>)}
                  </select>
                  <svg className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={RED} strokeWidth="2.4" strokeLinecap="round"><path d="M6 9l6 6 6-6"/></svg>
                </div>

                {/* 备注：单行起步，输入时自动长高 */}
                <textarea
                  defaultValue={r.note}
                  rows={1}
                  placeholder="如：一面挂，案例讲得太碎 / 二面约在下周二"
                  onInput={e => { e.target.style.height = 'auto'; e.target.style.height = `${e.target.scrollHeight}px`; }}
                  onBlur={e => { if (e.target.value !== r.note) patch(r.id, 'note', e.target.value); }}
                  className="w-full text-[12px] text-ink-700 leading-[1.45] bg-transparent rounded px-1 py-[3px] outline-none resize-none overflow-hidden focus:bg-black/[0.04] placeholder:text-ink-300"
                />

                <span className="text-[11px] tabular-nums pt-[4px]" style={{ color: '#a8b0ad' }}>
                  {String(r.at || '').slice(5)}
                </span>

                <button onClick={() => removeRow(r.id)} title="删除这家公司"
                  className="w-6 h-6 grid place-items-center rounded opacity-0 group-hover:opacity-100 hover:bg-black/5 transition"
                  style={{ color: '#a8b0ad' }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* 底部说明 */}
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] text-ink-400 leading-relaxed">
            把某家公司改到「{krs[Math.min(1, n - 1)]?.t || '下一层'}」时，它上面的各层会一并 +1（累计口径）
          </span>
          <span className="text-[11px] tabular-nums flex-shrink-0" style={{ color: '#a8b0ad' }}>
            共 {rows.length} 家 · 显示 {visible.length}
          </span>
        </div>
      </div>
    </Modal>
  );
}
