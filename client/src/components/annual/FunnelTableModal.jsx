import React, { useState, useMemo, useRef } from 'react';
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
        notes: [],
        at: today,
      });
    }
  }
  return rows;
}

const todayStr = () => new Date().toISOString().slice(0, 10);

/* 备注统一成「带日期的时间线」：兼容早期只有单条 note 的记录 */
const notesOf = (r) => {
  if (Array.isArray(r.notes)) return r.notes;
  if (r.note) return [{ id: `legacy-${r.id}`, date: r.at || todayStr(), text: r.note }];
  return [];
};
const noteText = (r) => notesOf(r).map(n2 => n2.text).join(' ');
const latestNote = (r) => {
  const list = notesOf(r);
  return list.length ? list[list.length - 1] : null;
};
const isSoon = (iso) => {
  if (!iso) return false;
  const d = new Date(iso).getTime();
  return Number.isFinite(d) && d >= Date.now() && d - Date.now() <= 3 * 864e5;
};
const fmtInterview = (iso) => (iso ? String(iso).replace('T', ' ').slice(5, 16) : '');

/* —— CSV —— */
const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
function parseCSV(text) {
  const out = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); out.push(row); row = []; cell = ''; }
    else if (c === '\r') { /* skip */ }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); out.push(row); }
  return out.filter(r => r.some(x => (x || '').trim()));
}

export default function FunnelTableModal({ open, goalTitle, krs = [], rows = [], onChange, onClose }) {
  const [q, setQ] = useState('');
  const [stageFilter, setStageFilter] = useState(null); // null = 全部
  const [justAdded, setJustAdded] = useState(null);
  const [expandedId, setExpandedId] = useState(null);   // 展开某家公司的备注时间线
  const [dragOver, setDragOver] = useState(null);       // 拖拽悬停的阶段
  const [msg, setMsg] = useState('');
  const fileRef = useRef(null);
  const dragIdRef = useRef(null);

  const n = krs.length;
  const countAt = useMemo(
    () => krs.map((_, i) => rows.filter(r => Math.min(Math.max(r.stageIdx ?? 0, 0), n - 1) >= i).length),
    [rows, krs, n]
  );

  const flash = (t) => { setMsg(t); setTimeout(() => setMsg(''), 2600); };
  const commit = (next) => onChange?.(next);

  const patch = (id, field, value) => {
    commit(rows.map(r => (r.id === id ? { ...r, [field]: value, at: todayStr() } : r)));
  };
  const patchNotes = (id, notes) => {
    commit(rows.map(r => (r.id === id ? { ...r, notes, at: todayStr() } : r)));
  };

  const addRow = () => {
    const stageIdx = stageFilter === null ? 0 : stageFilter;
    const row = { id: uid(), name: '', stageIdx, note: '', notes: [], at: todayStr() };
    setJustAdded(row.id);
    commit([...rows, row]);
  };

  const removeRow = (id) => commit(rows.filter(r => r.id !== id));

  /* 拖拽改阶段：抓住行首把手，拖到顶部阶段药丸上 */
  const onDropStage = (i) => {
    setDragOver(null);
    const id = dragIdRef.current;
    dragIdRef.current = null;
    if (!id) return;
    patch(id, 'stageIdx', i);
  };

  /* —— 导出：公司 / 当前阶段 / 面试时间 / 备注时间线 / 更新 —— */
  const exportCSV = () => {
    const head = ['公司', '当前阶段', '面试时间', '备注', '更新'];
    const body = rows.map(r => [
      r.name || '',
      krs[r.stageIdx ?? 0]?.t || '',
      fmtInterview(r.interviewAt),
      notesOf(r).map(x => `${x.date} ${x.text}`).join(' | '),
      r.at || '',
    ]);
    const csv = [head, ...body].map(line => line.map(csvCell).join(',')).join('\r\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `漏斗-${String(goalTitle || '').replace(/[\\/:*?"<>|]/g, '')}-${todayStr()}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    flash(`已导出 ${rows.length} 家公司`);
  };

  /* —— 导入：按表头关键字匹配列，阶段可填层名或 1..n —— */
  const importCSV = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const grid = parseCSV(String(reader.result || ''));
      if (grid.length < 2) { flash('没读到数据（需要表头 + 至少一行）'); return; }
      const head = grid[0].map(h => h.trim().toLowerCase());
      const idxOf = (re) => head.findIndex(h => re.test(h));
      const iName = idxOf(/公司|名称|name/);
      const iStage = idxOf(/阶段|进度|stage/);
      const iTime = idxOf(/面试时间|interview/);
      const iNote = idxOf(/备注|情况|原因|note/);
      const iAt = idxOf(/更新|日期|^date$/);

      const added = grid.slice(1).map(cells => {
        const name = (cells[iName] ?? '').trim();
        if (!name) return null;
        const rawStage = iStage >= 0 ? String(cells[iStage] || '').trim() : '';
        let stageIdx = krs.findIndex(k => rawStage && (k.t === rawStage || k.t.includes(rawStage) || rawStage.includes(k.t)));
        if (stageIdx < 0) {
          const num = parseInt(rawStage, 10);
          stageIdx = Number.isFinite(num) && num >= 1 && num <= n ? num - 1 : 0;
        }
        const note = iNote >= 0 ? String(cells[iNote] || '').trim() : '';
        return {
          id: uid(),
          name,
          stageIdx: Math.max(0, stageIdx),
          interviewAt: iTime >= 0 ? String(cells[iTime] || '').trim().replace(' ', 'T').slice(0, 16) : '',
          notes: note ? [{ id: uid(), date: (iAt >= 0 && cells[iAt]) ? String(cells[iAt]).trim().slice(0, 10) : todayStr(), text: note }] : [],
          at: (iAt >= 0 && cells[iAt]) ? String(cells[iAt]).trim().slice(0, 10) : todayStr(),
        };
      }).filter(Boolean);

      if (!added.length) { flash('没有可导入的行（公司名为空）'); return; }
      commit([...rows, ...added]);
      flash(`已导入 ${added.length} 家公司`);
    };
    reader.readAsText(file, 'utf-8');
  };

  const visible = rows
    .filter(r => (stageFilter === null ? true : (r.stageIdx ?? 0) >= stageFilter))
    .filter(r => {
      const kw = q.trim().toLowerCase();
      if (!kw) return true;
      return (r.name || '').toLowerCase().includes(kw) || noteText(r).toLowerCase().includes(kw);
    })
    .sort((a, b) => ((b.stageIdx ?? 0) - (a.stageIdx ?? 0)) || (String(b.at) > String(a.at) ? 1 : -1));

  return (
    <Modal open={open} onClose={onClose} title="漏斗数据表" maxWidth={920}>
      <div className="flex flex-col gap-3">
        {/* 目标名 + 口径说明 */}
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-[13px] font-bold text-ink-900 truncate">{goalTitle}</span>
          <span className="text-[11px] text-ink-400 leading-relaxed">
            每家公司在表中只出现一次，按「当前阶段」自动累计到各层
          </span>
        </div>

        {/* 层摘要：点击筛选 / 拖拽公司到此改阶段 */}
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
              onDragOver={(e) => { e.preventDefault(); setDragOver(i); }}
              onDragLeave={() => setDragOver(prev => (prev === i ? null : prev))}
              onDrop={() => onDropStage(i)}
              className="h-[24px] px-2.5 rounded-full text-[11px] font-semibold tabular-nums transition flex items-center gap-1"
              style={stageFilter === i || dragOver === i
                ? { background: RED, color: '#fff', boxShadow: dragOver === i ? '0 0 0 3px rgba(239,68,68,0.18)' : 'none' }
                : { background: 'rgba(15,23,42,0.05)', color: '#8a9491' }}>
              <span className="opacity-60">{String(i + 1).padStart(2, '0')}</span>
              {k.t}
              <span className="font-extrabold">{countAt[i]}</span>
              <span className="opacity-50">/{k.tgt}{k.u}</span>
            </button>
          ))}
        </div>

        {/* 工具条：搜索 / 导入 / 导出 / 添加 */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 flex-1 h-[30px] px-2.5 rounded-lg bg-black/[0.035]">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#a8b0ad" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="搜索公司 / 备注"
              className="flex-1 bg-transparent outline-none text-[12px] text-ink-900 placeholder:text-ink-300" />
            {q && <button onClick={() => setQ('')} className="text-ink-300 hover:text-ink-700 text-[13px] leading-none">×</button>}
          </div>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
            onChange={(e) => { importCSV(e.target.files?.[0]); e.target.value = ''; }} />
          <button onClick={() => fileRef.current?.click()} title="导入 CSV（追加到现有记录）"
            className="h-[30px] px-2.5 rounded-lg text-[12px] font-semibold flex items-center gap-1 transition hover:bg-black/[0.04]"
            style={{ color: '#8a9491' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 15V4M7 9l5 5 5-5"/><path d="M4 20h16"/></svg>
            导入
          </button>
          <button onClick={exportCSV} title="导出为 CSV"
            className="h-[30px] px-2.5 rounded-lg text-[12px] font-semibold flex items-center gap-1 transition hover:bg-black/[0.04]"
            style={{ color: '#8a9491' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 4v11M7 10l5 5 5-5"/><path d="M4 20h16"/></svg>
            导出
          </button>
          <button onClick={addRow}
            className="h-[30px] px-3 rounded-lg text-[12px] font-semibold flex items-center gap-1 transition hover:brightness-105 active:scale-[0.98]"
            style={{ background: moduleRgba('work', 0.10), color: RED }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={RED} strokeWidth="2.6" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
            添加公司
          </button>
        </div>

        {/* 表体 */}
        <div className="rounded-xl border border-ink-100 overflow-auto" style={{ maxHeight: '50vh' }}>
          <div className="min-w-[760px]">
            <div className="sticky top-0 z-10 grid grid-cols-[1.05fr_0.8fr_108px_1.5fr_48px_28px] gap-2 px-3 py-2 bg-white border-b border-ink-100">
              {['公司', '当前阶段', '面试时间', '备注 · 面试情况', '更新', ''].map((h, i) => (
                <span key={i} className="text-[10px] font-semibold tracking-wide" style={{ color: '#a8b0ad' }}>{h}</span>
              ))}
            </div>

            {visible.length === 0 ? (
              <div className="py-10 text-center text-[12px]" style={{ color: '#a8b0ad' }}>
                {rows.length === 0 ? '还没有公司记录，点上方「添加公司」开始填写' : '没有匹配的记录'}
              </div>
            ) : visible.map(r => {
              const note = latestNote(r);
              const noteCount = notesOf(r).length;
              return (
                <div key={r.id}>
                  <div className="group grid grid-cols-[1.05fr_0.8fr_108px_1.5fr_48px_28px] gap-2 px-3 py-1.5 items-start border-b border-ink-100/70 hover:bg-black/[0.015]">
                    {/* 公司名：行首把手可拖拽 */}
                    <div className="flex items-center gap-1 min-w-0">
                      <span
                        draggable
                        onDragStart={(e) => { dragIdRef.current = r.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', r.id); }}
                        onDragEnd={() => { dragIdRef.current = null; setDragOver(null); }}
                        title="拖动到上方阶段药丸可改阶段"
                        className="cursor-grab active:cursor-grabbing text-[11px] select-none"
                        style={{ color: '#c9cfcd' }}>⠿</span>
                      <input
                        defaultValue={r.name}
                        autoFocus={r.id === justAdded}
                        placeholder="输入公司名"
                        onBlur={e => { if (e.target.value !== r.name) patch(r.id, 'name', e.target.value); }}
                        onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
                        className="flex-1 min-w-0 text-[12.5px] font-semibold text-ink-900 bg-transparent rounded px-1 py-[3px] outline-none focus:bg-black/[0.04] placeholder:text-ink-300 placeholder:font-normal"
                      />
                    </div>

                    {/* 当前阶段 */}
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

                    {/* 面试时间 */}
                    <input
                      type="datetime-local"
                      defaultValue={r.interviewAt ? String(r.interviewAt).slice(0, 16) : ''}
                      onChange={e => patch(r.id, 'interviewAt', e.target.value)}
                      title={r.interviewAt ? `面试时间 ${fmtInterview(r.interviewAt)}` : '设置面试时间'}
                      className="w-full text-[10.5px] tabular-nums bg-transparent rounded px-1 py-[3px] outline-none hover:bg-black/[0.04] focus:bg-black/[0.04]"
                      style={{ color: r.interviewAt ? (isSoon(r.interviewAt) ? RED : '#4b5655') : '#a8b0ad' }}
                    />

                    {/* 备注：显示最新一条，点击展开时间线 */}
                    <button onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                      title="点击查看 / 追加面试记录"
                      className="text-left min-w-0 text-[12px] leading-[1.45] rounded px-1 py-[3px] hover:bg-black/[0.04] transition">
                      {note ? (
                        <span className="text-ink-700 block truncate">
                          <span className="tabular-nums" style={{ color: '#a8b0ad' }}>{String(note.date).slice(5)} </span>
                          {note.text}
                          {noteCount > 1 && <span className="ml-1 text-[10px] font-semibold" style={{ color: '#a8b0ad' }}>+{noteCount - 1}</span>}
                        </span>
                      ) : (
                        <span style={{ color: '#a8b0ad' }}>添加备注</span>
                      )}
                    </button>

                    <span className="text-[11px] tabular-nums pt-[4px]" style={{ color: '#a8b0ad' }}>
                      {String(r.at || '').slice(5)}
                    </span>

                    <button onClick={() => removeRow(r.id)} title="删除这家公司"
                      className="w-6 h-6 grid place-items-center rounded opacity-0 group-hover:opacity-100 hover:bg-black/5 transition"
                      style={{ color: '#a8b0ad' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
                    </button>
                  </div>

                  {/* 备注时间线：按日期累积，不覆盖 */}
                  {expandedId === r.id && (
                    <div className="px-3 pb-2.5 pt-1 bg-black/[0.015] border-b border-ink-100/70">
                      {notesOf(r).length === 0 && (
                        <div className="text-[11px] mb-1.5" style={{ color: '#a8b0ad' }}>还没有记录，写下这一轮的结论或面试官的问题</div>
                      )}
                      {notesOf(r).map(nn => (
                        <div key={nn.id} className="group/n flex items-start gap-2 py-[3px]">
                          <span className="text-[10px] tabular-nums w-[34px] flex-shrink-0 pt-[3px]" style={{ color: '#a8b0ad' }}>{String(nn.date).slice(5)}</span>
                          <span className="flex-1 text-[12px] text-ink-700 leading-[1.45] break-words">{nn.text}</span>
                          <button onClick={() => patchNotes(r.id, notesOf(r).filter(x => x.id !== nn.id))}
                            title="删除这条记录"
                            className="w-5 h-5 grid place-items-center rounded opacity-0 group-hover/n:opacity-100 hover:bg-black/5 flex-shrink-0"
                            style={{ color: '#a8b0ad' }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
                          </button>
                        </div>
                      ))}
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-[10px] tabular-nums w-[34px] flex-shrink-0" style={{ color: '#a8b0ad' }}>{todayStr().slice(5)}</span>
                        <input
                          placeholder="追加一条：如「一面挂，案例讲得太碎」回车保存"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && e.target.value.trim()) {
                              patchNotes(r.id, [...notesOf(r), { id: uid(), date: todayStr(), text: e.target.value.trim() }]);
                              e.target.value = '';
                            }
                          }}
                          className="flex-1 text-[12px] bg-white rounded px-2 py-[4px] outline-none border border-ink-100 focus:border-black/20 placeholder:text-ink-300"
                        />
                        <button
                          onClick={() => setExpandedId(null)}
                          className="text-[11px] px-2 py-[3px] rounded hover:bg-black/5"
                          style={{ color: '#a8b0ad' }}>收起</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 底部说明 */}
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] text-ink-400 leading-relaxed">
            {msg || `拖行首 ⠿ 到上方阶段药丸可改阶段；改到更深层时，上面的各层会一并 +1（累计口径）`}
          </span>
          <span className="text-[11px] tabular-nums flex-shrink-0" style={{ color: '#a8b0ad' }}>
            共 {rows.length} 家 · 显示 {visible.length}
          </span>
        </div>
      </div>
    </Modal>
  );
}
