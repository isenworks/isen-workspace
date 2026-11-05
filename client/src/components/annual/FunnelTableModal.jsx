import React, { useState, useMemo, useRef } from 'react';
import Modal from '../Modal.jsx';
import { uid } from './utils.js';
import { moduleRgba } from '../../utils/color.js';

const RED = 'var(--m-work)';
const GREEN = '#129d63';
const OFFER_RE = /offer|录用|意向|入职/i;
const INTERVIEW_RE = /面/;

const pad2 = (v) => String(v).padStart(2, '0');
const todayStr = () => new Date().toISOString().slice(0, 10);

/* 首开建表：按当前手填的 实际值 生成占位公司行（累计口径还原）
   例：25/6/3/1/1 → 第1层 19 家、第2层 3 家、第3层 2 家、第4层 0 家、第5层 1 家 */
export function seedPipelineRows(krs = []) {
  const counts = krs.map(k => Math.max(0, Number(k.v) || 0));
  for (let i = 1; i < counts.length; i++) counts[i] = Math.min(counts[i], counts[i - 1]);
  const rows = [];
  const today = todayStr();
  for (let i = 0; i < counts.length; i++) {
    const deeper = counts[i + 1] || 0;
    for (let j = 0; j < counts[i] - deeper; j++) {
      rows.push({
        id: uid(),
        name: `公司${String(rows.length + 1).padStart(2, '0')}`,
        stageIdx: i,
        note: '',
        notes: [],
        interviewAt: '',
        stageAt: { [i]: today },
        at: today,
      });
    }
  }
  return rows;
}

/* —— 时间工具：站内统一「月-日 时:分」，年份自动推断 —— */
const tsOf = (iso) => {
  if (!iso) return NaN;
  const s = String(iso);
  const norm = s.includes('T') ? s : `${s.slice(0, 10)}T00:00`;
  return new Date(norm).getTime();
};

/* 展示：今天 / 明天 / 后天优先，其余 MM-DD [HH:mm] */
function fmtWhen(iso) {
  if (!iso) return '';
  const s = String(iso);
  const hasTime = s.includes('T');
  const d = new Date(s.includes('T') ? s : `${s.slice(0, 10)}T00:00`);
  if (!Number.isFinite(d.getTime())) return s;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const day = new Date(d); day.setHours(0, 0, 0, 0);
  const diff = Math.round((day - today) / 864e5);
  const hm = hasTime ? ` ${pad2(d.getHours())}:${pad2(d.getMinutes())}` : '';
  if (diff === 0 && hasTime) return `今天${hm}`;
  if (diff === 1) return `明天${hm}`;
  if (diff === 2) return `后天${hm}`;
  return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}${hm}`;
}

/* 月份-日期（时间轴节点用） */
const fmtDay = (v) => (v ? String(v).slice(5, 10) : '');

/* 解析日期 MM-DD / M/D / YYYY-MM-DD；无法识别返回 null，空返回 '' */
function parseDay(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  const m = s.match(/(?:(\d{4})[-/年])?(\d{1,2})[-/月](\d{1,2})/);
  if (!m) return null;
  const now = new Date();
  let y = m[1] ? Number(m[1]) : now.getFullYear();
  const mo = Number(m[2]), d = Number(m[3]);
  const cand = new Date(y, mo - 1, d);
  if (cand.getMonth() !== mo - 1 || cand.getDate() !== d) return null;
  // 没说年份且已过去 45 天以上 → 视为明年
  if (!m[1] && cand.getTime() < new Date(y, now.getMonth(), now.getDate()).getTime() - 45 * 864e5) y += 1;
  return `${y}-${pad2(mo)}-${pad2(d)}`;
}

/* 解析「下一场」：11-06 14:00 / 11/6 / 2026-11-06 14:00 / 今天 14:00 / 明天 / 14:00
   返回 'YYYY-MM-DDTHH:mm' | 'YYYY-MM-DD' | '' | null(无法识别) */
function parseWhen(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  const now = new Date();
  let base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const rel = s.match(/^(今天|明天|后天)/);
  if (rel) base.setDate(base.getDate() + ({ 今天: 0, 明天: 1, 后天: 2 }[rel[1]]));
  const body = rel ? s.slice(rel[1].length).trim() : s;

  const t = body.match(/(\d{1,2})[:：](\d{2})/);
  const datePart = body.replace(/(\d{1,2})[:：](\d{2})/, '').trim();

  let y = base.getFullYear(), mo = base.getMonth() + 1, d = base.getDate();
  if (datePart) {
    const m = datePart.match(/(?:(\d{4})[-/年])?(\d{1,2})[-/月](\d{1,2})/);
    if (!m) return null;
    y = m[1] ? Number(m[1]) : y;
    mo = Number(m[2]); d = Number(m[3]);
    if (!m[1]) {
      const cand = new Date(y, mo - 1, d);
      if (cand.getTime() < new Date(y, now.getMonth(), now.getDate()).getTime() - 45 * 864e5) y += 1;
    }
  } else if (!rel && !t) {
    return null;
  }
  const cand = new Date(y, mo - 1, d);
  if (cand.getMonth() !== mo - 1 || cand.getDate() !== d) return null;
  if (!t) return `${y}-${pad2(mo)}-${pad2(d)}`;
  const hh = Number(t[1]), mm = Number(t[2]);
  if (hh > 23 || mm > 59) return null;
  return `${y}-${pad2(mo)}-${pad2(d)}T${pad2(hh)}:${pad2(mm)}`;
}

/* 备注统一成「带日期的时间线」：兼容早期只有单条 note 的记录 */
const notesOf = (r) => {
  if (Array.isArray(r.notes)) return r.notes;
  if (r.note) return [{ id: `legacy-${r.id}`, date: r.at || todayStr(), text: r.note }];
  return [];
};
const noteText = (r) => notesOf(r).map(n2 => n2.text).join(' ');

/* 阶段时间戳：{ [层序号]: 'YYYY-MM-DD' }；旧数据回退到「更新日期」
   改阶段时自动写入当天，是 offer 发放日期的唯一来源 */
const stageDatesOf = (r) => {
  if (r && r.stageAt && typeof r.stageAt === 'object' && !Array.isArray(r.stageAt)) return r.stageAt;
  if (r && r.at) return { [Math.max(0, Number(r.stageIdx) || 0)]: String(r.at).slice(0, 10) };
  return {};
};

const isSoon = (iso) => {
  const t = tsOf(iso);
  return Number.isFinite(t) && t >= Date.now() && t - Date.now() <= 3 * 864e5;
};

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
  const [expandedId, setExpandedId] = useState(null);   // 展开某家公司的阶段时间轴 + 备注
  const [dragOver, setDragOver] = useState(null);       // 拖拽悬停的阶段
  const [msg, setMsg] = useState('');
  const fileRef = useRef(null);
  const dragIdRef = useRef(null);

  const n = krs.length;
  const offerIdx = useMemo(() => krs.findIndex(k => OFFER_RE.test(k.t || '')), [krs]);
  const countAt = useMemo(
    () => krs.map((_, i) => rows.filter(r => Math.min(Math.max(r.stageIdx ?? 0, 0), n - 1) >= i).length),
    [rows, krs, n]
  );
  const stageOf = (r) => Math.min(Math.max(r.stageIdx ?? 0, 0), Math.max(n - 1, 0));

  const flash = (t) => { setMsg(t); setTimeout(() => setMsg(''), 2600); };
  const commit = (next) => onChange?.(next);

  const patch = (id, field, value) => {
    commit(rows.map(r => (r.id === id ? { ...r, [field]: value, at: todayStr() } : r)));
  };
  const patchNotes = (id, notes) => {
    commit(rows.map(r => (r.id === id ? { ...r, notes, at: todayStr() } : r)));
  };
  /* 改阶段：同时记下「进入该阶段」的日期（已有则保留，可手动修正） */
  const moveStage = (id, i) => {
    const today = todayStr();
    commit(rows.map(r => {
      if (r.id !== id) return r;
      const d = stageDatesOf(r);
      return { ...r, stageIdx: i, stageAt: { ...d, [i]: d[i] || today }, at: today };
    }));
  };
  const setStageDate = (id, i, date) => {
    commit(rows.map(r => {
      if (r.id !== id) return r;
      const d = { ...stageDatesOf(r) };
      if (date) d[i] = date; else delete d[i];
      return { ...r, stageAt: d, at: todayStr() };
    }));
  };

  const addRow = () => {
    const stageIdx = stageFilter === null ? 0 : stageFilter;
    const today = todayStr();
    const row = {
      id: uid(), name: '', stageIdx, note: '', notes: [], interviewAt: '',
      stageAt: { [stageIdx]: today }, at: today,
    };
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
    moveStage(id, i);
  };

  /* 下一场面试的轮次文案：优先用层名（一面/二面），层名不含「面」时补「第 N 轮」 */
  const roundLabel = (stageIdx) => {
    const k = krs[stageIdx];
    if (!k) return '—';
    const no = krs.slice(0, stageIdx + 1).filter(x => INTERVIEW_RE.test(x.t || '')).length;
    if (INTERVIEW_RE.test(k.t || '') && /[一二三四五六七八九十\d]/.test(k.t || '')) return k.t;
    return no > 0 ? `第${no}轮` : k.t;
  };
  const offerLabel = (idx) => {
    const k = krs[idx];
    if (!k) return '确认';
    return /offer|录用|意向/i.test(k.t || '') ? '已发 offer' : `已${k.t}`;
  };

  /* —— 导出：公司 / 当前阶段 / 下一场面试 / offer 时间 / 备注时间线 / 更新 —— */
  const exportCSV = () => {
    const head = ['公司', '当前阶段', '下一场面试', 'offer时间', '备注', '更新'];
    const body = rows.map(r => {
      const d = stageDatesOf(r);
      return [
        r.name || '',
        krs[stageOf(r)]?.t || '',
        r.interviewAt || '',
        offerIdx >= 0 ? (d[offerIdx] || '') : '',
        notesOf(r).map(x => `${x.date} ${x.text}`).join(' | '),
        r.at || '',
      ];
    });
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
      const iTime = idxOf(/下一场|面试时间|interview/);
      const iOffer = idxOf(/offer|录用|意向/);
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
        const at = (iAt >= 0 && cells[iAt]) ? String(cells[iAt]).trim().slice(0, 10) : todayStr();
        const stageAt = { [stageIdx]: at };
        if (iOffer >= 0 && cells[iOffer] && offerIdx >= 0) stageAt[offerIdx] = String(cells[iOffer]).trim().slice(0, 10);
        return {
          id: uid(),
          name,
          stageIdx: Math.max(0, stageIdx),
          interviewAt: iTime >= 0 ? String(cells[iTime] || '').trim().replace(' ', 'T').slice(0, 16) : '',
          notes: note ? [{ id: uid(), date: at, text: note }] : [],
          stageAt,
          at,
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
            一家公司一行；「下一场」按当前阶段的下一层自动标出第几轮，进入 offer 层后显示发放日期
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
        <div className="rounded-xl border border-ink-100 overflow-auto" style={{ maxHeight: '52vh' }}>
          <div className="min-w-[780px]">
            <div className="sticky top-0 z-10 grid grid-cols-[1fr_0.76fr_150px_1.42fr_44px_26px] gap-2 px-3 py-2 bg-white border-b border-ink-100">
              {['公司', '当前阶段', '下一场', '备注 · 面试情况', '更新', ''].map((h, i) => (
                <span key={i} className="text-[10px] font-semibold tracking-wide" style={{ color: '#a8b0ad' }}>{h}</span>
              ))}
            </div>

            {visible.length === 0 ? (
              <div className="py-10 text-center text-[12px]" style={{ color: '#a8b0ad' }}>
                {rows.length === 0 ? '还没有公司记录，点上方「添加公司」开始填写' : '没有匹配的记录'}
              </div>
            ) : visible.map(r => {
              const cur = stageOf(r);
              const dates = stageDatesOf(r);
              const offered = offerIdx >= 0 && cur >= offerIdx;
              const atEnd = cur >= n - 1 && !offered;
              const next = krs[cur + 1];
              const soon = !offered && isSoon(r.interviewAt);
              const note = notesOf(r).length ? notesOf(r)[notesOf(r).length - 1] : null;
              const noteCount = notesOf(r).length;
              const fromD = dates[0], toD = dates[cur];
              const spanDays = (fromD && toD && fromD !== toD)
                ? Math.round((new Date(`${fromD}T00:00`).getTime() - new Date(`${toD}T00:00`).getTime()) / 864e5) * -1
                : null;

              return (
                <div key={r.id}>
                  <div className="group grid grid-cols-[1fr_0.76fr_150px_1.42fr_44px_26px] gap-2 px-3 py-1.5 items-start border-b border-ink-100/70 hover:bg-black/[0.015]">
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
                        value={cur}
                        onChange={e => moveStage(r.id, Number(e.target.value))}
                        className="w-full appearance-none text-[11.5px] font-semibold rounded-full pl-2.5 pr-6 py-[3px] outline-none cursor-pointer truncate"
                        style={{ background: moduleRgba('work', 0.09), color: RED, border: 'none' }}>
                        {krs.map((k, i) => <option key={i} value={i}>{k.t}</option>)}
                      </select>
                      <svg className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={RED} strokeWidth="2.4" strokeLinecap="round"><path d="M6 9l6 6 6-6"/></svg>
                    </div>

                    {/* 下一场（带轮次）/ offer 日期 */}
                    <div className="min-w-0">
                      {offered ? (
                        <div className="flex items-center gap-1 min-w-0">
                          <span className="flex-shrink-0 text-[9.5px] font-semibold leading-[16px] px-1.5 rounded-[4px] whitespace-nowrap"
                            style={{ background: 'rgba(18,157,99,0.10)', color: GREEN }}>
                            {offerLabel(offerIdx)}
                          </span>
                          <input
                            key={`offer-${dates[offerIdx] || 'empty'}`}
                            defaultValue={fmtDay(dates[offerIdx])}
                            placeholder="MM-DD"
                            title="offer 发放日期（改阶段时自动记录，可手动修正）"
                            onBlur={e => {
                              const next2 = parseDay(e.target.value);
                              if (next2 === null) { e.target.value = fmtDay(dates[offerIdx]); return; }
                              if (next2 !== (dates[offerIdx] || '')) setStageDate(r.id, offerIdx, next2);
                            }}
                            onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
                            className="min-w-0 flex-1 text-[10px] tabular-nums bg-transparent rounded px-1 py-[2px] outline-none hover:bg-black/[0.04] focus:bg-white focus:shadow-[0_0_0_1px_rgba(0,0,0,0.10)] placeholder:text-ink-300"
                            style={{ color: GREEN }}
                          />
                        </div>
                      ) : next ? (
                        <div className="flex items-center gap-1 min-w-0">
                          <span className="flex-shrink-0 text-[9.5px] font-semibold leading-[16px] px-1.5 rounded-[4px] whitespace-nowrap"
                            style={soon
                              ? { background: RED, color: '#fff' }
                              : { background: moduleRgba('work', 0.09), color: RED }}>
                            {roundLabel(cur + 1)}
                          </span>
                          <input
                            key={`next-${r.interviewAt || 'empty'}`}
                            defaultValue={fmtWhen(r.interviewAt)}
                            placeholder="MM-DD HH:mm"
                            title="填写下一场面试时间，回车 / 失焦保存；支持「今天 14:00」"
                            onBlur={e => {
                              const isoStr = parseWhen(e.target.value);
                              if (isoStr === null) { e.target.value = fmtWhen(r.interviewAt); return; }
                              if (isoStr !== (r.interviewAt || '')) patch(r.id, 'interviewAt', isoStr);
                            }}
                            onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
                            className="min-w-0 flex-1 text-[10px] tabular-nums bg-transparent rounded px-1 py-[2px] outline-none hover:bg-black/[0.04] focus:bg-white focus:shadow-[0_0_0_1px_rgba(0,0,0,0.10)] placeholder:text-ink-300"
                            style={{ color: soon ? RED : (r.interviewAt ? '#4b5655' : '#a8b0ad') }}
                          />
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <span className="flex-shrink-0 text-[9.5px] font-semibold leading-[16px] px-1.5 rounded-[4px] whitespace-nowrap"
                            style={{ background: 'rgba(15,23,42,0.05)', color: '#a8b0ad' }}>
                            {krs[cur]?.t}
                          </span>
                          <span className="text-[10px] tabular-nums" style={{ color: '#a8b0ad' }}>
                            {fmtDay(dates[cur]) || '—'}
                          </span>
                        </div>
                      )}
                    </div>

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

                  {/* 展开：阶段时间轴 + 备注时间线 */}
                  {expandedId === r.id && (
                    <div className="px-3 pb-2.5 pt-2 bg-black/[0.015] border-b border-ink-100/70">
                      {/* 阶段时间轴：进入某层时自动记日期，可点改 */}
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-start overflow-x-auto pb-0.5">
                          {krs.map((k, i) => {
                            const reached = i <= cur;
                            const dd = dates[i];
                            return (
                              <div key={i} className="flex items-start flex-shrink-0">
                                {i > 0 && (
                                  <div className="w-[18px] h-[1.5px] mt-[6px] flex-shrink-0"
                                    style={{ background: reached ? 'rgba(239,68,68,0.30)' : '#e6e9e8' }} />
                                )}
                                <div className="flex flex-col gap-[1px]" style={{ minWidth: 68 }}>
                                  <div className="flex items-center gap-1">
                                    <span className="w-[5px] h-[5px] rounded-full flex-shrink-0"
                                      style={{ background: i === cur ? RED : reached ? 'rgba(239,68,68,0.42)' : '#dfe3e1' }} />
                                    <span className="text-[10.5px] font-semibold whitespace-nowrap"
                                      style={{ color: reached ? '#3c4544' : '#b7bebc' }}>{k.t}</span>
                                  </div>
                                  {reached ? (
                                    <input
                                      key={`d-${i}-${dd || 'empty'}`}
                                      defaultValue={fmtDay(dd)}
                                      placeholder="MM-DD"
                                      title="这一层的日期（改阶段时自动记录）"
                                      onBlur={e => {
                                        const nd = parseDay(e.target.value);
                                        if (nd === null) { e.target.value = fmtDay(dd); return; }
                                        if (nd !== (dd || '')) setStageDate(r.id, i, nd);
                                      }}
                                      onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
                                      className="w-[46px] ml-[9px] text-[10px] tabular-nums bg-transparent rounded px-1 py-[1px] outline-none hover:bg-black/[0.05] focus:bg-white focus:shadow-[0_0_0_1px_rgba(0,0,0,0.10)] placeholder:text-ink-300"
                                      style={{ color: '#8a9491' }}
                                    />
                                  ) : (
                                    <span className="text-[10px] pl-[9px]" style={{ color: '#c9cfcd' }}>待进入</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        {spanDays !== null && (
                          <span className="text-[10px] tabular-nums flex-shrink-0 pt-[1px]" style={{ color: '#a8b0ad' }}>
                            {krs[0]?.t} → {krs[cur]?.t} 共 {spanDays} 天
                          </span>
                        )}
                      </div>

                      <div className="h-px bg-black/[0.06] mb-2" />

                      {/* 备注时间线：按日期累积，不覆盖 */}
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
            {msg || `拖行首 ⠿ 到上方阶段药丸可改阶段（自动记录当天日期）；展开一行可看完整时间轴`}
          </span>
          <span className="text-[11px] tabular-nums flex-shrink-0" style={{ color: '#a8b0ad' }}>
            共 {rows.length} 家 · 显示 {visible.length}
          </span>
        </div>
      </div>
    </Modal>
  );
}
