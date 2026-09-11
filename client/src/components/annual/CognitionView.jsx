import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { BOOKS, COG_KRS, COG_O } from './data.js';
import { pct, uid } from './utils.js';
import { EditableTitle, InlineEdit } from './ui.jsx';
import { usePersistentState } from './hooks.js';
import { moduleColor, moduleRgba } from '../../utils/color.js'
import { API } from '../../api/client.js'
import Modal from '../Modal.jsx'
import BookForm from '../forms/BookForm.jsx'
import DualMarkerBar from '../DualMarkerBar.jsx'

function CoverImg({ src, bookId, coverSource, onPersist, catCol, fallbackChar }) {
  const [err, setErr] = React.useState(false);
  if (!src || err) {
    return (
      <span style={{ color: catCol, fontSize: '22px', fontWeight: 900, textShadow: `0 1px 2px ${catCol}22`, lineHeight: 1 }}>
        {fallbackChar}
      </span>
    );
  }
  return React.createElement('img', {
    src,
    alt: '',
    draggable: false,
    onError: () => setErr(true),
    style: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  });
}

/* 能力
 * mode: 'milestone'（默认，里程碑门）| 'kpi' | 'balance'
 * createdAt / deadline / completedAt：时间追踪四件套
 * 里程碑条目级 dueBy：可选（微截止）
 */
function ReadingFunnel({
  total, done, notes, changes, reviews, color = '#007AFF', embedded,
  headerTitle = '阅读转化漏斗',
  headerSub = '输入→思考→行动→改变→改变',
  onHeaderChange,
  stageLabels,
  onStageLabelsChange,
}) {
  // 五层漏斗（严格真子集递减）：目标量 → 输入量 → 思考量 → 行动量 → 改变量
  // 对应 ReadingFunnel 字段 total → done → notes → changes → reviews
  // 统一蓝色：全部使用计划总结页主色 #007AFF
  const STAGE_COLORS = [color, color, color, color, color];
  const DEFAULT_STAGES = [
    { key: 'total',   label: '目标量', sub: '年度目标',   convLabel: '' },
    { key: 'done',    label: '输入量', sub: '已读完',   convLabel: '' },
    { key: 'notes',   label: '思考量', sub: '洞察组数',   convLabel: '' },
    { key: 'changes', label: '行动量', sub: '行动勾选',   convLabel: '' },
    { key: 'reviews', label: '改变量', sub: '改变记录',   convLabel: '' },
  ];
  const countsByKey = { total, done, notes, changes, reviews };
  // stages 由【默认结构 + 自定义文字 + 外部count】合成；受控，不再自己 useState 存 label/sub/convLabel
  const stages = DEFAULT_STAGES.map(s => ({
    ...s,
    ...(stageLabels?.[s.key] || {}),
    count: countsByKey[s.key] ?? s.count,
  }));
  const updateStageLabel = (key, patch) => {
    const next = { ...(stageLabels || {}) };
    const prev = next[key] || {};
    next[key] = { ...prev, ...patch };
    // 只保存和默认值不同的文字，避免污染存储空间（可选）
    onStageLabelsChange?.(next);
  };
  const deleteStageLabel = (key, field) => {
    // 删除 = 从自定义中清除该字段，恢复默认值
    const next = { ...(stageLabels || {}) };
    if (!next[key]) return;
    const { [field]: _ignored, ...rest } = next[key];
    if (Object.keys(rest).length === 0) {
      delete next[key]; // 所有字段都清了 → 把 key 也删掉，省空间
    } else {
      next[key] = rest;
    }
    onStageLabelsChange?.(next);
  };

  const widthByCount = stages.map(s => s.count);
  const maxW = Math.max(...widthByCount, 1);
  // 转化率颜色：用目标层和源层的混合色
  const convColors = STAGE_COLORS;

  // CTA 文案：根据各层数据动态生成"下一步建议"（目标量→输入量→思考量→行动量→改变量）
  const ctas = [
    // ① 目标量 → 输入量：未读完 → 提示阅读
    { idx: 0, show: done < total && total > 0, text: done === 0 ? '书架还没已读完的书，去完成第一本' : `还差 ${total - done} 本，继续阅读` },
    // ② 输入量 → 思考量：没写洞察 → 提示提取
    { idx: 1, show: notes < done && done > 0, text: notes === 0 ? '已读完的书还没写洞察，点击书籍添加思考' : `还差 ${Math.max(0, done * 2 - notes)} 组洞察，继续输出思考` },
    // ③ 思考量 → 行动量：没勾选 → 提示行动
    { idx: 2, show: changes < notes && notes > 0, text: changes === 0 ? '有洞察但没行动，生成你的第一条行动承诺' : `还差 ${Math.max(0, notes - changes)} 项行动，勾选更多行动项` },
    // ④ 行动量 → 改变量：没生成 → 提示记录
    { idx: 3, show: reviews < changes && changes > 0, text: reviews === 0 ? '有承诺但没记录改变，创建你的第一条改变' : `还差 ${Math.max(0, changes - reviews)} 条改变，记录你的改变` },
    // ⑤ （改变量预留，目前 reviews 字段存的是改变量）
    { idx: 4, show: false, text: '' },
  ];

  const Inner = (
    <div className="flex flex-col">
      {stages.map((s, i) => {
        const next = stages[i + 1];
        const conv = next && s.count > 0 ? Math.round((next.count / s.count) * 100) : null;
        const pctOfMax = Math.max(28, Math.round((s.count / maxW) * 100));
        const stageColor = STAGE_COLORS[i] || color;
        return (
          <div key={s.key}>
            <div className="relative flex items-center pr-1">
              <div
                className="flex items-center h-[34px] px-3.5 rounded-xl text-white font-semibold text-[13px] transition-all"
                style={{
                  width: `${pctOfMax}%`,
                  minWidth: '150px',
                  background: stageColor,  // 统一纯色，不再渐变（用户要求"统一一个颜色"）
                  boxShadow: `0 2px 6px ${stageColor}25`,
                }}>
                {/* 左：count — 大号数字（左端对齐） */}
                <span className="tabular-nums text-[16px] font-extrabold leading-none flex-shrink-0 mr-2">
                  {s.count}
                </span>
                {/* 右：label + sub */}
                <span className="flex items-center gap-2 flex-1 min-w-0 whitespace-nowrap overflow-hidden text-ellipsis">
                  <InlineEdit
                    value={s.label}
                    onChange={(v) => updateStageLabel(s.key, { label: v })}
                    onDelete={() => deleteStageLabel(s.key, 'label')}
                    mode="contextmenu"
                    className="font-bold flex-shrink-0"
                    inputClassName="text-ink-900 text-[13px] w-20"
                    title="右键编辑阶段名"
                    placeholder=""
                  />
                  <span className="text-[10px] opacity-75 whitespace-nowrap flex-shrink-0">
                    <InlineEdit
                      value={s.sub}
                      onChange={(v) => updateStageLabel(s.key, { sub: v })}
                      onDelete={() => deleteStageLabel(s.key, 'sub')}
                      mode="contextmenu"
                      className="text-[10px] opacity-95"
                      inputClassName="text-ink-900 text-[11px] w-14"
                      title="右键编辑备注"
                      placeholder=""
                    />
                  </span>
                </span>
              </div>
            </div>
            {/* 连接线 + 转化率 */}
            {next && (
              <div className="flex items-center py-1 pl-6 gap-1.5 text-[11px] whitespace-nowrap">
                <div className="flex flex-col items-center">
                  <div className="w-[2px] h-1.5 rounded-full" style={{ background: `${STAGE_COLORS[i]}88` }} />
                </div>
                <svg className="w-3 h-3 flex-shrink-0" style={{ color: STAGE_COLORS[i] }} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M12 5v14M5 12l7 7 7-7" strokeLinecap="round" strokeLinejoin="round"/></svg>
                <span className="font-bold tabular-nums px-3 py-0.5 rounded-full flex-shrink-0"
                  style={{
                    color: STAGE_COLORS[Math.min(i + 1, 4)],
                    background: `${STAGE_COLORS[Math.min(i + 1, 4)]}12`,
                  }}>
                  {conv ?? 0}%
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  if (embedded) return Inner;

  return (
    <div className="bg-white rounded-2xl p-4 border border-ink-100">
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md grid place-items-center" style={{ background: `${color}15`, color }}>
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M3 3v18h18" strokeLinecap="round"/>
              <path d="M7 14l4-4 4 4 5-6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div className="flex items-baseline gap-1.5 min-w-0">
            <InlineEdit
              value={headerTitle}
              onChange={(v) => onHeaderChange?.({ title: v })}
              onDelete={() => onHeaderChange?.({ title: '' })}
              mode="contextmenu"
              className="text-[14px] font-bold text-ink-900 whitespace-nowrap"
              inputClassName="text-[14px] font-bold text-ink-900 w-24"
              title="右键编辑标题"
            />
          </div>
        </div>
        <InlineEdit
          value={headerSub}
          onChange={(v) => onHeaderChange?.({ sub: v })}
          onDelete={() => onHeaderChange?.({ sub: '' })}
          mode="contextmenu"
          className="text-[11px] text-ink-400 whitespace-nowrap"
          inputClassName="text-[11px] font-medium text-ink-500 w-28"
          title="右键编辑说明"
        />
      </div>
      {Inner}
    </div>
  );
}

/* ---------- P2-2: 生活统计条 ---------- */
function KrFormFields({ lb, tgt, u, sub, onChange }) {
  const BLUE_DARK = '#0062CC';
  const inputCls = "w-full px-2.5 py-1.5 text-[12.5px] rounded-[10px] focus:outline-none transition";
  const inputStyle = { background: '#fff', border: '1px solid rgba(15,23,42,0.08)' };
  const SectionCard = ({ title, children }) => (
    <div style={{ padding: '10px 12px', background: 'rgba(240,244,248,0.5)', border: '1px solid rgba(15,23,42,0.08)', borderRadius: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', fontSize: '11px', fontWeight: 700, color: BLUE_DARK, letterSpacing: '0.06em' }}>
        <div style={{ width: '3px', height: '11px', borderRadius: '2px', background: BLUE_DARK }} />
        {title}
      </div>
      {children}
    </div>
  );
  return (
    <div className="flex flex-col gap-2.5">
      <SectionCard title="KR 设置">
        <div className="flex flex-col gap-1.5">
          <span className="text-[10.5px] font-semibold" style={{ color: '#1c1c1e', opacity: 0.55 }}>KR 描述</span>
          <input value={lb} onChange={(e) => onChange({ lb: e.target.value })}
            placeholder="如：读完12本书" className={inputCls} style={inputStyle} />
        </div>
        <div className="grid grid-cols-2 gap-2 mt-2.5">
          <div className="flex flex-col gap-1">
            <span className="text-[10.5px] font-semibold" style={{ color: '#1c1c1e', opacity: 0.55 }}>目标值</span>
            <input type="number" value={tgt} onChange={(e) => onChange({ tgt: Number(e.target.value) })}
              placeholder="12" className={inputCls + " tabular-nums"} style={inputStyle} />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10.5px] font-semibold" style={{ color: '#1c1c1e', opacity: 0.55 }}>单位</span>
            <input value={u} onChange={(e) => onChange({ u: e.target.value })}
              placeholder="本" className={inputCls} style={inputStyle} />
          </div>
        </div>
      </SectionCard>
      <SectionCard title="备注（可选）">
        <input value={sub} onChange={(e) => onChange({ sub: e.target.value })}
          placeholder="如：书架系统追踪" className={inputCls} style={inputStyle} />
      </SectionCard>
    </div>
  );
}

/* ---------- 7.5 表单 · 行动改变（承诺本）---------- */
function ChangeForm({ initial, books, onSave, onCancel, onDelete }) {
  const isEdit = !!(initial && initial.id);
  const doneBooks = (books || []).filter(b => b.st === 'done' && b.insights?.length);
  const allInsights = doneBooks.flatMap(b => (b.insights || []).map(i => ({ ...i, bookId: b.id, bookTitle: b.t })));
  const strongInsights = allInsights.filter(i => i.resonance >= 7);

  const [form, setForm] = useState({
    text: initial?.text || '',
    bookId: initial?.bookId || '',
    bookTitle: initial?.bookTitle || '',
    insightId: initial?.insightId || '',
    insightText: initial?.insightText || '',
    resonance: initial?.resonance || 5,
    startDate: initial?.startDate || new Date().toISOString().slice(0, 10),
    targetDays: initial?.targetDays || 30,
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // 选观点时自动带出书名和共鸣分
  const onInsightSelect = (insightId) => {
    const found = allInsights.find(i => i.id === insightId);
    if (found) {
      setForm(f => ({ ...f, insightId: found.id, insightText: found.text, bookId: found.bookId, bookTitle: found.bookTitle, resonance: found.resonance }));
    } else {
      setForm(f => ({ ...f, insightId: '', insightText: '', bookId: '', bookTitle: '', resonance: 5 }));
    }
  };

  const LABEL = { fontSize: 13, fontWeight: 600, color: '#1c1c1e', display: 'block', marginBottom: 4 };
  const INPUT = { width: '100%', padding: '7px 10px', borderRadius: 9, border: '1px solid rgba(15,23,42,0.08)', fontSize: 13, outline: 'none', background: '#fff' };
  const BTN_P = { padding: '8px 16px', borderRadius: 9, border: 'none', background: 'var(--s-main)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
  const BTN_G = { padding: '8px 16px', borderRadius: 9, border: '1px solid rgba(15,23,42,0.1)', background: 'transparent', color: '#8e8e93', fontSize: 13, fontWeight: 500, cursor: 'pointer' };
  const BTN_D = { padding: '8px 16px', borderRadius: 9, border: 'none', background: '#FF3B30', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* 来源观点选择 */}
      <div>
        <label style={LABEL}>来源观点（强共鸣 ≥7 分优先）</label>
        {allInsights.length === 0 ? (
          <div style={{ padding: 10, textAlign: 'center', fontSize: 12, color: '#8a9491', background: 'rgba(248,250,252,0.6)', borderRadius: 8, border: '1px dashed rgba(148,163,184,0.3)' }}>
            书架还没有已读完+有观点的书 — 先去提取观点
          </div>
        ) : (
          <select style={INPUT} value={form.insightId} onChange={e => onInsightSelect(e.target.value)}>
            <option value="">— 选择来源观点 —</option>
            {strongInsights.map(i => (
              <option key={i.id} value={i.id}>共鸣{i.resonance} · {i.text.slice(0, 30)}…（《{i.bookTitle}》）</option>
            ))}
            {allInsights.filter(i => i.resonance < 7).map(i => (
              <option key={i.id} value={i.id}>共鸣{i.resonance} · {i.text.slice(0, 30)}…（《{i.bookTitle}》）</option>
            ))}
          </select>
        )}
      </div>
      {/* 改变描述 */}
      <div>
        <label style={LABEL}>做什么改变</label>
        <textarea style={{ ...INPUT, minHeight: 60, resize: 'none' }} value={form.text}
          onChange={e => set('text', e.target.value)}
          placeholder="例如：做决策前，先列'做这件事会失败的5个原因'并逐一检查"
          autoFocus />
      </div>
      {/* 启动日 + 目标天数 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={LABEL}>启动日</label>
          <input type="date" style={INPUT} value={form.startDate} onChange={e => set('startDate', e.target.value)} />
        </div>
        <div>
          <label style={LABEL}>目标天数</label>
          <input type="number" min="7" max="90" style={INPUT} value={form.targetDays}
            onChange={e => set('targetDays', Number(e.target.value) || 30)} />
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, paddingTop: 4 }}>
        <div>{isEdit && <button onClick={() => onDelete?.(initial.id)} style={BTN_D}>删除</button>}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onCancel} style={BTN_G}>取消</button>
          <button onClick={() => { if (!form.text.trim()) return alert('请描述你的改变'); onSave?.({ ...form, text: form.text.trim(), id: initial?.id }); }} style={BTN_P}>{isEdit ? '保存' : '添加'}</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- 7.6 表单 · 改变（结果区）---------- */
function ReviewForm({ initial, books, onSave, onCancel, onDelete }) {
  // 旧标签迁移：一次性决策 → 认知更新，已固化SOP → 已内化
  const migrateTag = (t) => (t === 'decision' ? 'cognition' : t === 'sop' ? 'internalized' : (t || 'cognition'));
  const [form, setForm] = useState({
    text: initial?.text || '',
    bookTitle: initial?.bookTitle || '',
    beforeState: initial?.beforeState || '',
    afterState: initial?.afterState || '',
    nextStep: initial?.nextStep || '',
    practiceEffect: initial?.practiceEffect || '',
    tag: migrateTag(initial?.tag),
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // 关联书籍搜索下拉
  const [bookFocused, setBookFocused] = useState(false);
  const bookQuery = form.bookTitle.trim().toLowerCase();
  const bookSuggestions = bookFocused
    ? (books || [])
        .filter(b => bookQuery ? (b.t || '').toLowerCase().includes(bookQuery) : true)
        .slice(0, 5)
    : [];

  const LABEL = { fontSize: 12, fontWeight: 600, color: '#1c1c1e', display: 'block', marginBottom: 3 };
  const INPUT = { width: '100%', padding: '6px 9px', borderRadius: 9, border: '1px solid rgba(15,23,42,0.08)', fontSize: 12.5, outline: 'none', background: '#fff', lineHeight: 1.5 };
  const INPUT_TITLE = { ...INPUT, fontSize: 14, fontWeight: 600, color: '#1c1c1e', padding: '9px 12px', border: '1.5px solid rgba(var(--s-rgb),0.35)', boxShadow: '0 0 0 3px rgba(var(--s-rgb),0.06)' };
  const INPUT_OPT = { ...INPUT, border: '1px dashed rgba(148,163,184,0.5)', background: 'rgba(248,250,252,0.6)' };
  const BTN_P = { padding: '8px 16px', borderRadius: 9, border: 'none', background: 'var(--s-main)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
  const BTN_G = { padding: '8px 16px', borderRadius: 9, border: '1px solid rgba(15,23,42,0.1)', background: 'transparent', color: '#8e8e93', fontSize: 13, fontWeight: 500, cursor: 'pointer' };
  const BTN_D = { padding: '8px 16px', borderRadius: 9, border: '1px solid rgba(255,59,48,0.25)', background: 'rgba(255,59,48,0.08)', color: '#FF3B30', fontSize: 13, fontWeight: 600, cursor: 'pointer' };

  const TAGS = [
    { v: 'cognition', lb: '认知更新' },
    { v: 'habit', lb: '长期习惯' },
    { v: 'internalized', lb: '已内化' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      {/* 主字段：改变名称 */}
      <div>
        <label style={LABEL}>改变名称</label>
        <input style={INPUT_TITLE} value={form.text} autoFocus
          onChange={e => set('text', e.target.value)}
          placeholder="例：建立每日 5 分钟复盘习惯｜接纳情绪不内耗" />
      </div>
      {/* 关联书籍 / 观点 */}
      <div>
        <label style={LABEL}>关联书籍 / 观点（可选）</label>
        <div style={{ position: 'relative' }}>
          <input style={INPUT} value={form.bookTitle}
            onChange={e => set('bookTitle', e.target.value)}
            onFocus={() => setBookFocused(true)}
            onBlur={() => setBookFocused(false)}
            placeholder="填写书名 / 书中原文观点，可留空" />
          {bookSuggestions.length > 0 && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, marginTop: 4,
              background: '#fff', borderRadius: 10, border: '1px solid rgba(15,23,42,0.08)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.10)', overflow: 'hidden',
            }}>
              {bookSuggestions.map(b => (
                <button key={b.id} type="button"
                  onMouseDown={e => { e.preventDefault(); set('bookTitle', b.t); setBookFocused(false); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                    padding: '8px 10px', background: 'transparent', border: 'none',
                    cursor: 'pointer', textAlign: 'left',
                  }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: '#1c1c1e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.t}</span>
                  {b.author && <span style={{ flexShrink: 0, fontSize: 11, color: '#8e8e93' }}>{b.author}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {/* 改变前 / 改变后 · 对仗并排 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <label style={LABEL}>改变前（旧状态）</label>
          <textarea style={{ ...INPUT, minHeight: 56, resize: 'none' }} value={form.beforeState}
            onChange={e => set('beforeState', e.target.value)}
            placeholder="读书之前，我是什么状态，存在什么困扰？" />
        </div>
        <div>
          <label style={LABEL}>改变后（认知 / 行为变化）</label>
          <textarea style={{ ...INPUT, minHeight: 56, resize: 'none' }} value={form.afterState}
            onChange={e => set('afterState', e.target.value)}
            placeholder="读完书实践之后，我的认知、行为发生了哪些变化？" />
        </div>
      </div>
      {/* 落地巩固 / 实践效果 · 可选补充并排 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <label style={LABEL}>落地巩固</label>
          <textarea style={{ ...INPUT_OPT, minHeight: 44, resize: 'none' }} value={form.nextStep}
            onChange={e => set('nextStep', e.target.value)}
            placeholder="如何持续实践？打算做哪些具体行动？" />
        </div>
        <div>
          <label style={LABEL}>实践效果（可选）</label>
          <textarea style={{ ...INPUT_OPT, minHeight: 44, resize: 'none' }} value={form.practiceEffect}
            onChange={e => set('practiceEffect', e.target.value)}
            placeholder="实际执行后的真实感受，哪些有用、哪些行不通。" />
        </div>
      </div>
      <div>
        <label style={LABEL}>标签</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {TAGS.map(t => (
            <button key={t.v} type="button" onClick={() => set('tag', t.v)}
              style={{
                flex: 1, padding: '7px 0', borderRadius: 9, fontSize: 12, fontWeight: 600,
                background: form.tag === t.v ? `rgba(var(--s-rgb),0.10)` : 'rgba(120,120,128,0.08)',
                color: form.tag === t.v ? "var(--s-main)" : '#8e8e93',
                border: form.tag === t.v ? `1px solid rgba(var(--s-rgb),0.25)` : '1px solid transparent',
                cursor: 'pointer',
              }}>{t.lb}</button>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, paddingTop: 4 }}>
        <div>{onDelete && <button onClick={() => onDelete?.(initial.id)} style={BTN_D}>删除</button>}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onCancel} style={BTN_G}>取消</button>
          <button onClick={() => {
            if (!form.text.trim()) return alert('请填写改变名称');
            onSave?.({ ...form, text: form.text.trim(), id: initial.id });
          }} style={BTN_P}>保存</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- 7.6.1 选书面板 · 为读后思考/思后行动选目标书籍 ---------- */
function BookPickerModal({ mode, books, onPick, onAddNew, onClose }) {
  const [q, setQ] = useState('');
  const isInsights = mode === 'insights';
  const list = (books || []).filter(b => !q.trim() || (b.t || '').toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <Modal open onClose={onClose} title={isInsights ? '添加读后思考' : '添加行动计划'}
      footer={
        <button onClick={onAddNew}
          className="px-4 py-1.5 text-[13px] rounded-[10px] transition"
          style={{ background: 'rgba(var(--s-rgb),0.10)', border: '1px solid rgba(var(--s-rgb),0.25)', color: 'var(--s-main)' }}>
          + 新增书籍
        </button>
      }>
      <div className="flex flex-col gap-3">
        <div className="text-[12px] text-ink-500 leading-relaxed px-0.5">
          思考与行动都挂在书籍上，选择一本书继续：
        </div>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="搜索书名…"
          className="px-3 py-2 text-[13px] rounded-[10px] focus:outline-none transition"
          style={{ background: '#fff', border: '1px solid rgba(15,23,42,0.08)' }} />
        {list.length === 0 ? (
          <div className="py-8 text-center text-[12px] text-ink-400"
            style={{ background: 'rgba(15,23,42,0.032)', borderRadius: 12, border: '1px dashed rgba(148,163,184,0.35)' }}>
            {q.trim() ? '没有匹配的书籍' : '书架还没有书籍'}<br/>点击下方「+ 新增书籍」开始
          </div>
        ) : (
          <div className="flex flex-col gap-1 max-h-[40vh] overflow-y-auto pr-0.5">
            {list.map(b => {
              const cnt = isInsights
                ? (b.insights || []).filter(i => i.text?.trim() && i.scene?.trim()).length
                : (b.actions || []).filter(a => a.text?.trim()).length;
              return (
                <button key={b.id} onClick={() => onPick(b)}
                  className="flex items-center gap-2.5 px-2.5 py-2 rounded-[10px] transition text-left hover:bg-[rgba(var(--s-rgb),0.05)]"
                  style={{ background: '#fff', border: '1px solid rgba(15,23,42,0.08)' }}>
                  <svg className="w-[15px] h-[15px] flex-shrink-0" fill="none" stroke="var(--s-main)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z"/>
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                  </svg>
                  <span className="text-[13px] font-semibold text-[#48484A] truncate flex-1 min-w-0">{b.t}</span>
                  {b.author && <span className="text-[11px] text-ink-400 flex-shrink-0 truncate max-w-[90px]">{b.author}</span>}
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
                    style={{ background: 'rgba(var(--s-rgb),0.10)', color: 'var(--s-main)' }}>
                    {isInsights ? `${cnt}组` : `${cnt}条`}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ---------- 7.7 表单 · 能力月度自评（批量）---------- */
export function CognitionView({
  books, onBookAdd, onBookEdit, onBookMove, onBookUpdate, onBooksReplace,
  objective, onObjectiveChange,
  krs, onKrAdd, onKrEdit, onKrRemove,
  funnelHeader, setFunnelHeader,
  funnelStageLabels, setFunnelStageLabels,
  bookshelfTitle, setBookshelfTitle,
  changes, onChangeAdd, onChangeUpdate, onChangeToggleComplete, onChangeComplete, onChangeRemove,
  reviews, onReviewUpdate, onReviewRemove,
  showToast,
}) {
  const [editingObj, setEditingObj] = useState(false);
  const [objDraft, setObjDraft] = useState('');
  const [addingKr, setAddingKr] = useState(false);
  const [newKr, setNewKr] = useState({ lb: '', tgt: 12, val: 0, u: '本', sub: '' });
  const [editingKrModal, setEditingKrModal] = useState(null);
  // 读后思考/思后行动/行后改变 三卡标题：右键可编辑（usePersistentState 持久化，清空回落默认）
  const [thoughtsTitle, setThoughtsTitle] = usePersistentState('annual_cog_thoughts_title', () => '');
  const [actionsTitle, setActionsTitle] = usePersistentState('annual_cog_actions_title', () => '');
  const [reviewsTitle, setReviewsTitle] = usePersistentState('annual_cog_reviews_title', () => '');
  // 书架拖拽 + Tab筛选
  const [dragBookId, setDragBookId] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);
  const [shelfTab, setShelfTab] = useState('reading'); // 默认显示"阅读中"
  // 承诺本 · 行动改变
  const [showChangeForm, setShowChangeForm] = useState(false);
  const [editingChange, setEditingChange] = useState(null);
  // 结果区 · 改变
  const [editingReview, setEditingReview] = useState(null);
  // 读后思考/思后行动 · 选书面板（'insights' | 'actions'）
  const [bookPicker, setBookPicker] = useState(null);
  // 微信读书设置弹窗 + 同步状态
  const [showWereadSettings, setShowWereadSettings] = useState(false);
  const [wereadKey, setWereadKey] = useState('');
  const [wereadCfgOk, setWereadCfgOk] = useState(null); // null=未查,true/false=已配置
  const [wereadSyncing, setWereadSyncing] = useState(false);
  const [coverSearchingIds, setCoverSearchingIds] = useState(new Set());
  // 书架·微信读书直达链接（复用生活页链接按钮设计：左键跳转 / 右键增删改，usePersistentState 持久化）
  const [wereadLinks, setWereadLinks] = usePersistentState('annual_cog_weread_links', () => []);
  const [wereadLinkMenu, setWereadLinkMenu] = useState(null); // { x, y, editingId } | null — 右键增删改菜单
  const [wereadLinkPopup, setWereadLinkPopup] = useState(null); // { x, y } | null — 多链接时左键弹出选择面板
  const [wereadLinkForm, setWereadLinkForm] = useState({ title: '', url: '' });
  const closeWereadMenus = () => { setWereadLinkMenu(null); setWereadLinkPopup(null); setWereadLinkForm({ title: '', url: '' }); };
  // 点击页面其他区域关闭菜单（按钮/菜单内部已 stopPropagation，不会误触发）
  useEffect(() => {
    if (!wereadLinkMenu && !wereadLinkPopup) return;
    const onDoc = () => closeWereadMenus();
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, [wereadLinkMenu, wereadLinkPopup]);
  // 左键：0 条→弹新建表单；1 条→直接跳转；多条→弹出选择面板
  function handleWereadLinkClick(e) {
    e.stopPropagation();
    if (!wereadLinks || wereadLinks.length === 0) {
      const rect = e.currentTarget.getBoundingClientRect();
      setWereadLinkMenu({ x: rect.left, y: rect.bottom + 6, editingId: null });
      return;
    }
    if (wereadLinks.length === 1) {
      window.open(wereadLinks[0].url, '_blank', 'noopener,noreferrer');
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    setWereadLinkPopup({ x: rect.left, y: rect.bottom + 6 });
  }
  // 右键：弹出增删改菜单
  function handleWereadLinkContext(e) {
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setWereadLinkPopup(null);
    setWereadLinkMenu({ x: rect.left, y: rect.bottom + 6, editingId: null });
  }
  function addWereadLink() {
    if (!wereadLinkForm.url.trim()) { alert('请输入链接地址'); return; }
    setWereadLinks([...wereadLinks, { id: uid(), title: wereadLinkForm.title.trim() || wereadLinkForm.url.trim(), url: wereadLinkForm.url.trim() }]);
    setWereadLinkForm({ title: '', url: '' });
    closeWereadMenus();
  }
  function updateWereadLink(id) {
    if (!wereadLinkForm.url.trim()) { alert('请输入链接地址'); return; }
    setWereadLinks(wereadLinks.map(l => l.id === id ? { ...l, title: wereadLinkForm.title.trim() || wereadLinkForm.url.trim(), url: wereadLinkForm.url.trim() } : l));
    setWereadLinkForm({ title: '', url: '' });
    closeWereadMenus();
  }
  function deleteWereadLink(id) {
    if (!confirm('确认删除此链接？')) return;
    setWereadLinks(wereadLinks.filter(l => l.id !== id));
    setWereadLinkForm({ title: '', url: '' });
    closeWereadMenus();
  }
  // 一次性查 weread key 是否已配置
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/userSettings/get', {
          headers: { 'X-Unlock-Token': localStorage.getItem('pw_unlock_token') || '' },
        });
        const j = await r.json().catch(() => ({}));
        const cfg = j?.data?.weread_api_key || {};
        setWereadCfgOk(!!cfg.configured);
        if (cfg.value) setWereadKey(cfg.value);
      } catch { setWereadCfgOk(false); }
    })();
  }, []);

  // 自动为无封面书籍搜索封面
  useEffect(() => {
    if (!books || !Array.isArray(books)) return;
    const needCover = books.filter(b =>
      b && b.t && !b.coverUrl && !coverSearchingIds.has(b.id)
    );
    if (needCover.length === 0) return;
    needCover.forEach(b => {
      setCoverSearchingIds(prev => new Set(prev).add(b.id));
      (async () => {
        try {
          const q = encodeURIComponent(b.t || '');
          const a = encodeURIComponent(b.author || '');
          const r = await fetch(`/api/cover/search?q=${q}&author=${a}`);
          const j = await r.json().catch(() => ({}));
          if (j?.ok && j.coverUrl && typeof onBookUpdate === 'function') {
            onBookUpdate(b.id, { coverUrl: j.coverUrl, coverSource: 'auto-search' });
          }
        } catch {}
        setCoverSearchingIds(prev => {
          const n = new Set(prev); n.delete(b.id); return n;
        });
      })();
    });
  }, [books?.length]);

  const doWereadSave = async () => {
    const k = wereadKey.trim();
    if (!k.startsWith('wrk-')) return alert('API Key 需要以 wrk- 开头（登录 weread.qq.com/r/weread-skills 申请）');
    try {
      const r = await fetch('/api/userSettings/set', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Unlock-Token': localStorage.getItem('pw_unlock_token') || '',
        },
        body: JSON.stringify({ k: 'weread_api_key', v: k }),
      });
      const j = await r.json().catch(() => ({}));
      if (!j?.ok) throw new Error(j?.error || '保存失败');
      setWereadCfgOk(true);
      setShowWereadSettings(false);
      showToast?.('微信读书 Key 已保存');
    } catch (e) {
      alert('保存失败：' + (e.message || e));
    }
  };

  // 注意：同步按钮 SHIFT + 点击 = 调试模式（在 Console 打印 weread 返回的首本书真实结构，便于排查字段名）
  const doWereadSync = async (event) => {
    const debug = !!(event && event.shiftKey);
    if (!wereadCfgOk) { setShowWereadSettings(true); return; }
    setWereadSyncing(true);
    try {
      const r = await fetch('/api/weread/sync' + (debug ? '?debug=1' : ''));
      const j = await r.json().catch(() => ({}));
      if (debug) {
        // eslint-disable-next-line no-console
        console.group('[DEBUG] 微信读书返回结构');
        console.log('HTTP 响应 j=', j);
        // eslint-disable-next-line no-console
        if (Array.isArray(j.books) && j.books.length > 0) console.log('wereadBooks[0] =', JSON.stringify(j.books[0], null, 2));
        // eslint-disable-next-line no-console
        console.groupEnd();
      }
      if (!j?.ok) throw new Error(j?.error || '同步失败');
      const wereadBooks = j.books || [];
      if (wereadBooks.length === 0) { showToast?.('微信读书书架为空'); return; }
      // 提取封面字段：weread 不同接口字段名不一致(cover/coverImg/coverUrl/pic/img/bookCover)，做兼容
      const pickCover = (wb) => {
        const candidate = wb.cover || wb.coverImg || wb.coverUrl || wb.pic || wb.img || wb.bookCover
          || wb.book_cover || wb.bookInfo?.cover || wb.book_info?.cover
          || wb.bookInfo?.coverImg || wb.book_info?.cover_img;
        // 可能是对象 {url,https} 等，把里层取出来
        if (typeof candidate === 'string') return candidate;
        if (candidate && typeof candidate === 'object') {
          return candidate.url || candidate.https || candidate.src || candidate.href || '';
        }
        return '';
      };
      const pickField = (wb, keys, fb = '') => {
        for (const k of keys) {
          const parts = k.split('.');
          let cur = wb, miss = false;
          for (const p of parts) {
            if (cur == null || typeof cur !== 'object') { miss = true; break; }
            cur = cur[p];
          }
          if (!miss && cur != null && cur !== '') return cur;
        }
        return fb;
      };
      // 统一字段（重命名为 wereadMapped 避免遮蔽外部 books state）
      const wereadMapped = wereadBooks.map(wbRaw => {
        const wb = Object.assign({}, wbRaw);
        wb.title = pickField(wb, ['title','bookTitle','name','bookName','book_title'],'未知书名');
        wb.author = pickField(wb, ['author','authors','bookAuthor','book_author'],'');
        wb.status = Number(pickField(wb, ['status','readingStatus','readStatus','reading_status'], 0));
        wb.progress = Number(pickField(wb, ['progress','readingProgress','readProgress','pct','percent'], 0));
        wb.bookId = pickField(wb, ['bookId','book_id','id','bid'],'');
        wb.cover = pickCover(wb);
        wb.startDate = pickField(wb, ['startDate','start_date','readingStart','reading_start'],'');
        wb.endDate = pickField(wb, ['endDate','finishDate','finish_date','readingEnd','reading_end'],'');
        return wb;
      });
      // 合并策略：匹配优先级（从高到低）
      //   1) 书名+作者 完全匹配（去空格/大小写/标点 + 作者别名中英文对照）
      //   2) 书名 匹配（忽略副标题）+ （没有作者信息时也能匹配）
      //   3) 书名 模糊匹配（主书名互相包含子串）
      //   4) 都不匹配 → 作为"新书"，st 默认 abandoned（放入「已归档」栏）
      const norm = (s) => String(s || '').replace(/[\s\-—·:：、，,。.!！?？（）()（）《》""'']+/g, '').toLowerCase();
      const normTitleOnly = (s) => {
        const t = String(s || '').replace(/[\s]+/g, '').toLowerCase();
        return t.split(/[:：·\-—]/)[0] || t;
      };
      // 作者别名表：解决 Eric Jorgenson = 埃里克·约根森 / Michael Lopp = ...  这类中英文不一致问题
      const AUTHOR_ALIASES = {
        // KEY = 本地预设作者（标准化小写去标点）
        'ericjorgenson': ['ericjorgenson','埃里克里克约根森','埃里克约根森','约根森','jorgenson'],
        'danielkahneman': ['danielkahneman','丹尼尔卡尼曼','卡尼曼','kahneman'],
        'zhouling': ['zhouling','周岭'],
        'marshallrosenberg': ['marshallrosenberg','马歇尔卢森堡','卢森堡','rosenberg'],
        'lisabmarshall': ['lisabmarshall','lisamarshall','马歇尔','marshall'],
        'robertbcialdini': ['robertbcialdini','robertcialdini','罗伯特西奥迪尼','西奥迪尼','cialdini'],
        'stephenrcovey': ['stephenrcovey','stephencovey','史蒂芬柯维','柯维','covey','斯蒂芬柯维','史蒂芬R柯维','斯蒂芬R柯维'],
        'michaellopp': ['michaellopp','迈克尔洛普','洛普','lopp'],
        'seanellis': ['seanellis','肖恩埃利斯','埃利斯','ellis'],
        'nireyal': ['nireyal','尼尔埃亚尔','埃亚尔','eyal','nir eyal'],
        'barbaraminto': ['barbaraminto','芭芭拉明托','明托','minto'],
        'zhanghongjie': ['zhanghongjie','张宏杰'],
      };
      // 书名别名表：解决 weread 返回书名带"全新升级版/典藏版"、或者本地名称比官方短的情况
      // KEY = 本地预设标准化主书名  →  VALUE = 所有等价别名（含子串）
      const TITLE_ALIASES = {
        'gaoxiaonengrenshideqigexiguan': [ // 高效能人士的七个习惯
          '高效能人士的七个习惯', '高效能人士的七个习惯全新升级版', '高效能人士的七个习惯典藏版',
          '高效能人士的七个习惯25周年纪念版', '高效能人士的七个习惯精华版', '高效能人士七个习惯',
          'gaoxiaonengrenshideqigexiguan',
        ],
        'zengguofanzhuan': ['曾国藩传', '曾国藩传张宏杰', '曾国藩的正面与侧面'],
        'renzhengxingwei': ['非暴力沟通', '非暴力沟通全新修订版'],
        'naerwabaodian': ['纳瓦尔宝典', '纳瓦尔宝典财富与幸福指南'],
        'sikao kuaiyuman': ['思考快与慢', '思考快与慢诺贝尔经济学奖', '思考快与慢丹尼尔卡尼曼'],
        'renzhijuexing': ['认知觉醒', '认知觉醒开启自我改变的原动力', '认知觉醒周岭'],
        'chaojigoutongzhe': ['超级沟通者', '超级沟通者如何打破沟通壁垒'],
        'yingxiangli': ['影响力', '影响力全新升级版', '影响力经典版'],
        'chuangshiren': ['创始人', '创始人新管理者如何完成角色转变', 'thefirsttimemanager'],
        'zengzhangheike': ['增长黑客', '增长黑客如何低成本实现爆发式成长', '增长黑客樊登推荐'],
        'shangyin': ['上瘾', '上瘾让用户养成使用习惯的四大产品逻辑'],
        'jinzayuanli': ['金字塔原理', '金字塔原理思考表达和解决问题的逻辑', '金字塔原理大全集'],
      };
      const titleMatches = (localTitle, wereadTitle) => {
        if (!localTitle || !wereadTitle) return false;
        const nA = normTitleOnly(localTitle), nB = normTitleOnly(wereadTitle);
        if (nA === nB) return true;
        if (nA.length >= 2 && nB.length >= 2 && (nA.includes(nB) || nB.includes(nA))) return true;
        // 查字典别名
        const aliases = TITLE_ALIASES[nA] || [];
        for (const al of aliases) {
          const normal = normTitleOnly(al);
          if (normal === nB) return true;
          if (nB.includes(normal) || normal.includes(nB)) return true;
        }
        return false;
      };
      const authorMatches = (a, b) => {
        const na = norm(a), nb = norm(b);
        if (!na || !nb) return true; // 任何一方没作者就跳过比较（视为匹配成功）
        if (na === nb) return true;
        // 别名表检索：把 na 当 key 查，再把 nb 当 key 查，都看对方是否在别名里
        const aliasA = AUTHOR_ALIASES[na] || [];
        const aliasB = AUTHOR_ALIASES[nb] || [];
        const bagA = new Set([na, ...aliasA]);
        const bagB = new Set([nb, ...aliasB]);
        // 交集
        for (const x of bagA) if (bagB.has(x)) return true;
        // 子串：a 包含 b 或 b 包含 a（如"柯维"包含在"史蒂芬·柯维"里）
        for (const x of bagA) if (x && nb.includes(x)) return true;
        for (const x of bagB) if (x && na.includes(x)) return true;
        return false;
      };
      const isValidBookId = (v) => typeof v === 'string' && /^[a-z0-9]{20,}$/i.test(v.replace(/-/g, ''));
      // 同书判定（用于搜索校准，比 normTitleOnly 严格）：
      //   忽略括号版本说明（「影响力（全新升级版）」≡「影响力」）和冒号副标题（「超级沟通者：如何…」≡「超级沟通者」）
      //   但「·」分隔的是同系列不同分册，不算同一本书（「影响力·行动篇」≠「影响力」）
      const stripParen = (s) => String(s || '').replace(/[（(][^）)]*[）)]/g, '').trim();
      const sameBook = (a, b) => {
        const sa = stripParen(a).replace(/\s+/g, '');
        const sb = stripParen(b).replace(/\s+/g, '');
        if (!sa || !sb) return false;
        if (sa === sb) return true;                                  // 全名相等（含分册名一致）
        const ma = sa.split(/[:：]/)[0], mb = sb.split(/[:：]/)[0];  // 冒号副标题取主名
        if (ma !== mb) return false;
        // 主名相等：仅当两边都无「·」分册才算同书（一边有一边没有 → 行动篇这类错配，排除）
        return !sa.includes('·') && !sb.includes('·');
      };
      // 「·」分册兼容（书架匹配用）：一边带分册一边不带 → 不是同一本；两边都带则分册名须一致
      const dashCompatible = (a, b) => {
        const sa = stripParen(a).replace(/\s+/g, '');
        const sb = stripParen(b).replace(/\s+/g, '');
        if (sa.includes('·') !== sb.includes('·')) return false;
        if (sa.includes('·') && sa !== sb) return false;
        return true;
      };
      // ---- 同步合并 weread 数据到本地（第一步：优先匹配「我的书架」）----
      const mergedResult = (() => {
        const curr = Array.isArray(books) ? [...books] : [];
        const updatedIdxs = new Set();
        const shelfMatchedIdxs = new Set(); // 书架直接命中的本地书（封面来自书架本身，准确，无需再搜索校准）
        const needsCoverFallback = [];
        for (const wb of wereadMapped) {
          const wMainTitle = normTitleOnly(wb.title);
          let idx = -1;
          idx = curr.findIndex(b =>
            titleMatches(b.t, wb.title) && dashCompatible(b.t, wb.title) &&
            authorMatches(b.author, wb.author)
          );
          if (idx < 0) idx = curr.findIndex(b => titleMatches(b.t, wb.title) && dashCompatible(b.t, wb.title));
          if (idx < 0) {
            // 兜底模糊匹配：双向字符重合度 ≥ 0.7（单向易把「超级符合」配给「超级沟通者」这类前缀相同书错配）
            idx = curr.findIndex(b => {
              if (!dashCompatible(b.t, wb.title)) return false;
              const localMain = normTitleOnly(b.t);
              if (!localMain || localMain.length < 2 || !wMainTitle || wMainTitle.length < 2) return false;
              const aSet = new Set(localMain), bSet = new Set(wMainTitle);
              let ab = 0, ba = 0;
              for (const ch of localMain) if (bSet.has(ch)) ab++;
              for (const ch of wMainTitle) if (aSet.has(ch)) ba++;
              return Math.min(ab / localMain.length, ba / wMainTitle.length) >= 0.7;
            });
          }
          if (idx < 0 || updatedIdxs.has(idx)) continue;
          updatedIdxs.add(idx);
          shelfMatchedIdxs.add(idx);
          const old = curr[idx];
          const newBookId = wb.bookId && isValidBookId(wb.bookId) ? wb.bookId : '';
          const merged = { ...old };
          if (newBookId) {
            merged.bookId = newBookId;
            merged.ebookUrl = `https://weread.qq.com/web/reader/${newBookId}`;
            merged.src = '电子书';
          } else {
            merged.src = old.src || '电子书';
          }
          const coverRaw = wb.cover;
          if (coverRaw) {
            merged.coverUrl = '/api/cover/proxy?url=' + encodeURIComponent(String(coverRaw));
            merged.coverSource = 'weread';
          } else {
            needsCoverFallback.push({ idx, title: old.t, author: old.author });
          }
          const mappedSt = wb.status === 4 ? 'done' : wb.status === 3 ? 'reading' : 'pending';
          if (old.st === 'done') { merged.pct = 100; merged.st = 'done'; }
          else {
            merged.st = old.st;
            const wpct = Math.min(100, Math.max(0, Number(wb.progress) || (mappedSt === 'done' ? 100 : 0)));
            merged.pct = Math.max(Number(old.pct) || 0, wpct);
          }
          if (wb.startDate && !old.startDate) merged.startDate = wb.startDate;
          if (wb.endDate && !old.endDate) merged.endDate = wb.endDate;
          curr[idx] = merged;
        }
        return { curr, updatedIdxs, needsCoverFallback, shelfMatchedIdxs };
      })();
      let { curr, updatedIdxs, needsCoverFallback, shelfMatchedIdxs } = mergedResult;

      // ---- 第二步：书架未命中的书，按填写的书名+作者到微信读书搜索校准（顺带补 bookId）----
      // 匹配顺序（需求）：先「我的书架」（上一步，封面来自书架本身最准确）；
      //   书架没有的才搜索。搜索用 sameBook 严格同书判定：
      //   ① 书名+作者都匹配 → 覆盖封面 + bookId
      //   ② 书名匹配（作者缺失或无法比对）→ 同上
      //   「影响力」只命中「影响力」「影响力（全新升级版）」，不命中「影响力·行动篇」（· 分册 ≠ 同书）
      // 多版本同书：同一层级命中多个版本时取微信读书阅读人数（readers）最多的
      // 用户手动粘贴的封面（coverSource==='manual' 或 data:URL）不动；都不中保持原样（宁缺勿错）
      const coverKeep = (b) => {
        const u = String(b.coverUrl || '');
        return /^data:image\//i.test(u) || b.coverSource === 'manual';
      };
      const pickBest = (list) => (list && list.length > 0)
        ? list.reduce((best, x) => (Number(x?.readers) > Number(best?.readers) ? x : best))
        : null;
      const needCalib = curr
        .map((b, idx) => ({ b, idx }))
        .filter(({ b, idx }) => b && b.t && !shelfMatchedIdxs.has(idx));
      if (needCalib.length > 0) {
        showToast?.(`书架已匹配 ${shelfMatchedIdxs.size} 本，正在为其余 ${needCalib.length} 本搜索微信读书封面…`);
        const BATCH = 3;
        for (let i = 0; i < needCalib.length; i += BATCH) {
          const slice = needCalib.slice(i, i + BATCH);
          const results = await Promise.all(slice.map(async ({ idx, b }) => {
            try {
              const r = await fetch(`/api/weread/search?q=${encodeURIComponent(b.t)}`);
              const j = await r.json().catch(() => ({}));
              if (!j?.ok || !Array.isArray(j.results) || j.results.length === 0) return null;
              let match = pickBest(j.results.filter(x => sameBook(b.t, x.title) && authorMatches(b.author, x.author)));
              if (!match) match = pickBest(j.results.filter(x => sameBook(b.t, x.title)));
              if (!match) return null;
              const patch = {};
              if (match.cover && !coverKeep(b)) {
                patch.coverUrl = '/api/cover/proxy?url=' + encodeURIComponent(String(match.cover));
                patch.coverSource = 'weread';
              }
              const bid = match.bookId;
              if (bid && isValidBookId(bid) && b.bookId !== bid) {
                patch.bookId = bid;
                patch.ebookUrl = `https://weread.qq.com/web/reader/${bid}`;
                patch.src = b.src || '电子书';
              }
              return Object.keys(patch).length > 0 ? { idx, patch } : null;
            } catch (_) {}
            return null;
          }));
          for (const r of results) {
            if (r && curr[r.idx]) {
              curr[r.idx] = { ...curr[r.idx], ...r.patch };
              updatedIdxs.add(r.idx);
            }
          }
        }
      }
      // 【异步·封面兜底】为还没真实封面的本地书搜封面
      const EMPTY_COVER = (b) => {
        const u = String(b.coverUrl || '').trim();
        return !u
          || b.coverSource === 'placeholder'
          || /^(占位|首字)/.test(b.coverSource || '')
          || (!/^https?:\/\//i.test(u) && !u.startsWith('/') && !/^data:image\//i.test(u));
      };
      const missingCurr = [];
      curr.forEach((b, idx) => { if (EMPTY_COVER(b) && b.t) missingCurr.push({ idx, title: b.t, author: b.author, bid: b.id }); });
      for (const x of needsCoverFallback) {
        if (!missingCurr.some(m => m.idx === x.idx)) missingCurr.push(x);
      }
      if (missingCurr.length > 0 && typeof onBooksReplace === 'function') {
        setTimeout(async () => {
          try {
            const patches = new Map();
            const BATCH = 3;
            for (let i = 0; i < missingCurr.length; i += BATCH) {
              const slice = missingCurr.slice(i, i + BATCH);
              await Promise.all(slice.map(async ({ idx, title, author }) => {
                try {
                  const q = new URLSearchParams({ q: String(title || '').trim() });
                  if (String(author || '').trim()) q.set('author', String(author).trim());
                  const r = await fetch(`/api/cover/search?${q.toString()}`);
                  const j = await r.json().catch(() => ({}));
                  if (j?.coverUrl) {
                    const proxied = '/api/cover/proxy?url=' + encodeURIComponent(String(j.coverUrl));
                    patches.set(idx, { coverUrl: proxied, coverSource: j.source || 'douban' });
                  }
                } catch (_) {}
              }));
            }
            if (patches.size > 0) {
              onBooksReplace(prev => {
                const next = (Array.isArray(prev) ? prev : []).slice();
                for (const [idx, p] of patches) {
                  if (next[idx]) next[idx] = { ...next[idx], ...p };
                }
                return next;
              });
              showToast?.(`已补 ${patches.size} 本封面`);
            }
          } catch (_) {}
        }, 150);
      }
      // ---- 保存结果 ----
      if (typeof onBooksReplace === 'function') {
        onBooksReplace(() => curr);
      }
      const noBookIdFinal = curr.filter(b => !b.bookId && b.t).length;
      showToast?.(`微信读书同步完成 · 已匹配更新 ${updatedIdxs.size} 本` +
        (noBookIdFinal ? ` · ${noBookIdFinal} 本待手动设置链接` : '') +
        (missingCurr.length ? ` · 正在补封面…` : ''));
    } catch (e) {
      alert('同步失败：' + (e.message || e));
    } finally {
      setWereadSyncing(false);
    }
  };

  const BLUE = moduleColor('cognition'); // 知力页卡片跟随知力模块色
  const BLUE_DARK = '#0062cc';  // 深蓝
  const BLUE_BG = moduleRgba('cognition', 0.12);
  const S_RGB = 'var(--m-cognition-rgb)'; // 知力模块 RGB（用于 rgba(${S_RGB}, α) 透明合成）
  // 分类色标：4 大类固定颜色（身份识别）
  const CAT_COLORS = {
    '认知成长': moduleColor('cognition'),
    '人际沟通': moduleColor('life'),
    '商业职场': moduleColor('ability'),
    '人文叙事': moduleColor('energy'),
  };
  const catColorOf = (c) => CAT_COLORS[c] || BLUE;
  // 分类 Pill 文字色：主题色降不透明度（完整主题色在浅底 pill 上偏深、抢视觉）
  const CAT_TEXT_COLORS = {
    '认知成长': moduleRgba('cognition', 0.72),
    '人际沟通': moduleRgba('life', 0.72),
    '商业职场': moduleRgba('ability', 0.72),
    '人文叙事': moduleRgba('energy', 0.72),
  };
  // 分类 Pill 底色：同主题色 8% 极浅底（远浅于文字色，只留一丝色相提示）
  const CAT_PILL_BG = {
    '认知成长': moduleRgba('cognition', 0.08),
    '人际沟通': moduleRgba('life', 0.08),
    '商业职场': moduleRgba('ability', 0.08),
    '人文叙事': moduleRgba('energy', 0.08),
  };
  const catTextColorOf = (c) => CAT_TEXT_COLORS[c] || moduleRgba('cognition', 0.72);
  const year = new Date().getFullYear();

  const groups = useMemo(() => {
    const dynBooks = (!books || books.length === 0) ? BOOKS : books;
    return {
      reading:   dynBooks.filter(b => b.st === 'reading'),
      pending:   dynBooks.filter(b => b.st === 'pending'),
      done:      dynBooks.filter(b => b.st === 'done'),
      abandoned: dynBooks.filter(b => b.st === 'abandoned'),
    };
  }, [books]);

  // 所有有思考的书籍（用于"读后思考"卡片）— 要求 text & scene 都填写（至少1组），不限阅读状态
  const booksWithInsights = useMemo(() => {
    const dynBooks = (!books || books.length === 0) ? BOOKS : books;
    return dynBooks.filter(b => {
      const ins = b.insights || [];
      return ins.some(i => i.text?.trim() && i.scene?.trim());
    });
  }, [books]);

  // 读后思考卡片头部统计：所有有效思考条目总数
  const totalInsightCount = useMemo(() => {
    const dynBooks = (!books || books.length === 0) ? BOOKS : books;
    return dynBooks.reduce((sum, b) => {
      const valid = (b.insights || []).filter(i => i.text?.trim() && i.scene?.trim());
      return sum + valid.length;
    }, 0);
  }, [books]);

  // 所有书籍中聚合出来的「思后行动」条目（替代旧的独立changes）— 格式保持兼容旧 cogChanges 渲染
  const bookActionsList = useMemo(() => {
    const dynBooks = (!books || books.length === 0) ? BOOKS : books;
    const out = [];
    dynBooks.forEach(b => {
      const acts = b.actions || [];
      acts.forEach((a, idx) => {
        if (!a.text?.trim()) return;
        out.push({
          id: `${b.id || 'bk'}_act_${a.id || idx}`,
          bookId: b.id,
          bookTitle: b.t,
          text: a.text.trim(),
          done: !!a.done,
          startDate: b.startDate || '',
          targetDays: 30,
          checkIns: [],
          status: a.done ? 'completed' : 'active',
          __fromBook: true,
        });
      });
    });
    return out;
  }, [books]);

  // 漏斗五层数据（严格真子集递减 + 条目级统计，与 KR 完全统一数据源）
  // ReadingFunnel 字段顺序 total → done → notes → changes → reviews
  // → 对应语义： 目标量 → 输入量 → 思考量 → 行动量 → 改变量
  const funnelData = useMemo(() => {
    const dynBooks = (!books || books.length === 0) ? BOOKS : books;
    const dynKrs = krs || COG_KRS;
    const doneBooks = dynBooks.filter(b => b.st === 'done');
    // 思考量：统计所有书籍中完整填写的思考条目数（每条 = 核心触动 + 应用场景）
    const insightEntryCount = dynBooks.reduce((sum, b) => {
      const validInsights = (b.insights || []).filter(i => i.text?.trim() && i.scene?.trim());
      return sum + validInsights.length;
    }, 0);
    // 行动量：统计所有书籍中已勾选(done)的思后行动条目数
    const checkedActionCount = dynBooks.reduce((sum, b) => {
      return sum + (b.actions || []).filter(a => a.done && a.text?.trim()).length;
    }, 0);
    // 改变量：cogReviews 实际记录数（真正落地的"改变"，不是行动数）
    const dynReviews = (reviews || []).length;
    // 目标量 = KR0 的目标值（漏斗最顶层，始终最大）
    const kr0Target = (dynKrs && dynKrs[0])?.tgt ?? COG_KRS[0]?.tgt ?? 12;
    return {
      total: kr0Target,          // ① 目标量：KR0 目标值（12本，漏斗最顶层）
      done: doneBooks.length,    // ② 输入量：已读完书籍数（< 目标量）
      notes: insightEntryCount,  // ③ 思考量：思考条目总数（< 输入量）
      changes: checkedActionCount, // ④ 行动量：条目级已勾选行动计划总数（< 思考量）
      reviews: dynReviews,       // ⑤ 改变量：cogReviews 实际改变记录数（< 行动量）
      doneBooksCount: doneBooks.length,
      reviewCount: dynReviews,
    };
  }, [books, krs, changes, reviews]);

  const finalKrs = (() => {
    // 强制排序：按 COG_KRS 默认顺序（目标量→输入量→思考量→行动量→改变量），
    // 之后才是用户自定义 KR。修复旧数据 kr0/kr4 append 到尾部导致顺序错乱的问题。
    const defaultOrder = COG_KRS.map(k => k.id);
    const arr = [...(krs || COG_KRS)];
    arr.sort((a, b) => {
      const ai = defaultOrder.indexOf(a.id);
      const bi = defaultOrder.indexOf(b.id);
      if (ai >= 0 && bi >= 0) return ai - bi; // 两个都在默认集合里 → 按 COG_KRS 顺序
      if (ai >= 0) return -1; // 只 a 在 → a 在前
      if (bi >= 0) return 1;  // 只 b 在 → b 在前
      return 0;               // 都不在 → 保持相对顺序
    });
    return arr.map(kr => {
      // KR0（目标量）= 固定值，始终 100%（阅读目标设定值）
      if (kr.id === 'kr0') {
        return { ...kr, val: kr.tgt };
      }
      // KR1（输入量）= 已读完书籍实际数量
      if (kr.id === 'kr1') {
        return { ...kr, val: funnelData.doneBooksCount };
      }
      // KR2（思考量）= 思考条目总数（洞察条目）
      if (kr.id === 'kr2') {
        return { ...kr, val: funnelData.notes };
      }
      // KR3（行动量）= 已勾选行动计划条目总数
      if (kr.id === 'kr3') {
        return { ...kr, val: funnelData.changes };
      }
      // KR4（改变量）= 改变记录总数
      if (kr.id === 'kr4') {
        return { ...kr, val: funnelData.reviews };
      }
      return kr;
    });
  })();

  const totalPct = useMemo(() => {
    if (!finalKrs.length) return 0;
    return Math.round(finalKrs.reduce((s, kr) => s + pct(kr.val, kr.tgt), 0) / finalKrs.length);
  }, [finalKrs]);

  // 总体节奏：实际完成率（已读/目标）vs 计划完成率（当前月/12，时间锚点）
  const paceNow = new Date();
  const paceMonth = paceNow.getMonth() + 1;
  const paceActual = funnelData.total > 0 ? Math.round((funnelData.done / funnelData.total) * 1000) / 10 : 0;
  const pacePlan = Math.round((paceMonth / 12) * 1000) / 10;

  // 精确剩余时间：X月 Y天（按实际日历天数换算，30天为一整月，余下天数）
  const paceRemain = useMemo(() => {
    if (paceMonth >= 12) return '年度已收官';
    const year = paceNow.getFullYear();
    const end = new Date(year, 11, 31, 23, 59, 59);
    const totalDays = Math.max(0, Math.ceil((end.getTime() - paceNow.getTime()) / 86400000));
    if (totalDays <= 0) return '年度已收官';
    const estMonths = Math.floor(totalDays / 30);
    const estDays = totalDays % 30;
    if (estMonths === 0) return `${estDays} 天`;
    if (estDays === 0) return `${estMonths} 月`;
    return `${estMonths} 月 ${estDays} 天`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paceNow, paceMonth]);

  // 保存 O
  const commitObj = () => {
    const t = objDraft.trim();
    if (!t) { setEditingObj(false); return; }
    onObjectiveChange?.({ ...(objective || COG_O), text: t });
    setEditingObj(false);
    showToast?.('目标已更新');
  };

  // 添加 KR
  const commitAddKr = () => {
    if (!newKr.lb.trim()) { setAddingKr(false); return; }
    onKrAdd?.({
      lb: newKr.lb.trim(),
      tgt: Number(newKr.tgt) || 0,
      val: Number(newKr.val) || 0,
      u: newKr.u || '',
      sub: newKr.sub || '',
    });
    setAddingKr(false);
    setNewKr({ lb: '', tgt: 12, val: 0, u: '本', sub: '' });
  };

  // 编辑 KR（弹窗模式）
  const commitEditKr = () => {
    if (!editingKrModal) return;
    const { kr, draft } = editingKrModal;
    if (!draft.lb.trim()) return;
    onKrEdit?.({
      ...kr,
      lb: draft.lb.trim(),
      tgt: Number(draft.tgt) || 0,
      val: Number(draft.val) || 0,
      u: draft.u || '',
      sub: draft.sub || '',
    });
    setEditingKrModal(null);
  };
  const openEditKrModal = (kr) => {
    setEditingKrModal({ kr, draft: { lb: kr.lb, tgt: kr.tgt, val: kr.val, u: kr.u, sub: kr.sub } });
  };

  return (
    <div className="flex flex-col gap-4">

      {/* ===== Row 1: 左 OKR(6) + 右 书架(6) 一体化布局 — 6:6 等分, 书架2列卡片恢复原始尺寸 ===== */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-3">

      {/* ===== 左侧·一体化 KR × 漏斗 卡片（6/12 列） ===== */}
      <div className="xl:col-span-6 bg-white rounded-2xl border border-ink-100 p-4 flex flex-col min-h-0">
        {/* ===== Header: O目标 + 时间进度 + 新增KR（mb-3 给 O 行和下面内容呼吸感）===== */}
        <div className="mb-3">
          {editingObj ? (
            <div className="flex items-start gap-2.5">
              <span className="w-[5px] h-[18px] rounded-full flex-shrink-0 mt-[2px]" style={{ background: BLUE }}></span>
              <div className="flex-1 flex flex-col gap-1.5">
                <input
                  autoFocus
                  value={objDraft}
                  onChange={(e) => setObjDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') commitObj(); if (e.key === 'Escape') setEditingObj(false); }}
                  className="w-full px-2.5 py-1.5 text-[16px] font-bold border border-ink-200 rounded-lg focus:outline-none focus:border-brand-500"
                  placeholder="输入年度目标..."
                />
                <div className="flex justify-end gap-1.5">
                  <button onClick={() => setEditingObj(false)} className="px-2 py-0.5 text-[11px] text-ink-500 hover:text-ink-700">取消</button>
                  <button onClick={commitObj} className="px-2 py-0.5 text-[11px] text-white rounded-md" style={{ background: BLUE }}>保存</button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 min-h-[20px]">
              <span className="w-[5px] h-[18px] rounded-full flex-shrink-0" style={{ background: BLUE }}></span>
              <InlineEdit
                value={objective?.text || COG_O.text}
                onChange={(v) => {
                  const t = String(v || '').trim();
                  if (!t) return;
                  onObjectiveChange?.({ ...(objective || COG_O), text: t });
                }}
                onDelete={() => onObjectiveChange?.({ ...(objective || COG_O), text: COG_O.text })}
                mode="contextmenu"
                className="flex-1 min-w-0 text-[15px] font-bold text-ink-900 leading-tight truncate"
                inputClassName="text-[15px] font-bold text-ink-900 w-full"
                title="右键编辑O目标"
                placeholder="填写O目标"
              />
              <button
                onClick={() => { setAddingKr(true); setNewKr({ lb: '', tgt: 12, val: 0, u: '本', sub: '' }); }}
                className="inline-flex items-center justify-center w-[26px] h-[26px] rounded-lg transition flex-shrink-0"
                style={{ color: BLUE, background: `rgba(${S_RGB},0.06)` }}
                title="新增KR">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" strokeLinecap="round"/></svg>
              </button>
            </div>
          )}
        </div>

        {/* ===== 双标记进度条：实际 vs 计划（节奏信息整合进「计划」marker tooltip，参考能力页 planDetail 设计）
            zoom 0.92 整体缩一档：气泡/轨道/下方标签同步变小，视觉层级次于标题行 ===== */}
        <div className="mb-2 px-0.5" style={{ }}>
          {(() => {
            const a = Math.max(0, Math.min(100, Number(paceActual) || 0));
            const p = Math.max(0, Math.min(100, Number(pacePlan) || 0));
            const diff = Math.round(Math.abs(a - p));
            const ahead = a >= p;
            const diffTxt = diff === 0 ? '节奏匹配' : (ahead ? `超前 ${diff}%` : `落后 ${diff}%`);
            const remain = paceMonth >= 12 || paceRemain === '年度已收官' ? '年度已收官' : `剩余 ${paceRemain}`;
            return (
              <DualMarkerBar
                actual={paceActual}
                plan={pacePlan}
                color={BLUE}
                showBadge={false}
                actualDetail={`已读完 ${funnelData.done} 本 / 目标 ${funnelData.total} 本 = ${paceActual}%`}
                planDetail={`时间锚点 ${pacePlan}%（${paceMonth}/12 月） · ${diffTxt} · ${remain}`}
              />
            );
          })()}
        </div>

        {/* ===== 一体化漏斗：3 列同构 —— 删表头（列语义视觉自解释），O 行 mb-3 已提供呼吸 ===== */}
        <div className="flex flex-col flex-1 min-h-0">
          {finalKrs.map((kr, idx) => {
            const p = pct(kr.val, kr.tgt);
            const nextKr = finalKrs[idx + 1];
            const conv = nextKr && kr.val > 0 ? Math.round((nextKr.val / kr.val) * 100) : null;
            const isDone = p >= 100;
            const now = new Date();
            const month = now.getMonth() + 1;
            const timePct = (month / 12) * 100;
            const isBehind = p < timePct && !isDone;
            const remaining = Math.max(0, (kr.tgt || 0) - (kr.val || 0));
            const pctWidth = Math.max(6, Math.min(100, p));
            const minPxWidth = p === 0 ? 22 : Math.max(16, Math.round(22 * 0.7));
            const krTypeMap = { goal: '目标量', thinking: '思考量', action: '行动量', change: '改变量' };
            const krType = kr.type ? (krTypeMap[kr.type] || kr.type) : '';
            const padNum = String(idx + 1).padStart(2, '0');
            // lb 精简：剥离所有类型词后的冗余后缀
            const DEFAULT_TYPES = ['目标量', '输入量', '思考量', '行动量', '改变量'];
            const rawLb = kr.lb || '';
            let cleanLb = rawLb;
            const m = rawLb.match(/^(\S+)\s*[·.]\s*.+$/);
            if (m && DEFAULT_TYPES.includes(m[1])) {
              cleanLb = m[1];
            } else if (DEFAULT_TYPES.includes(rawLb)) {
              cleanLb = rawLb;
            }

            return (
              <div key={kr.id || idx}>
                {/* KR 行：3 列 —— 修复间距：py-2(8px) + px-0(对齐贯通) */}
                <div className="flex items-center gap-2.5 py-2 rounded-lg hover:bg-surface-soft transition-colors">
                  {/* 左区：w-[128px] = w22# + gap10 + flex-1(目标+数字)，箭头在此区 justify-center 对准目标文字中心 */}
                  <div className="w-[128px] flex items-center gap-2.5 flex-shrink-0 -mt-[1px]">
                    <span className="text-[11px] font-bold tabular-nums w-[22px] text-right leading-none flex-shrink-0"
                      style={{ color: BLUE }}>{padNum}</span>
                    <div className="flex-1 min-w-0 truncate flex items-baseline gap-1">
                      <div onClick={() => openEditKrModal(kr)} className="cursor-pointer group flex items-baseline gap-1.5 min-w-0">
                        <span className="text-[13px] font-semibold text-[#48484A] truncate leading-none group-hover:text-ink-900">{cleanLb}</span>
                        <span className="text-[11px] font-extrabold text-ink-900 tabular-nums leading-none flex-shrink-0">
                          {kr.tgt}{kr.u}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 中部：漏斗进度条（flex-1） — 计数填充条 → 胶囊（语义：数值色块） */}
                  <div className="flex-1 flex items-center min-w-0">
                    <div className="flex-1 h-[22px] rounded-full overflow-hidden bg-ink-50 relative" style={{ minWidth: '40px' }}>
                      <div className="relative w-full h-full flex items-center">
                        <div
                          className="h-full rounded-full transition-all duration-500 flex items-center justify-start pl-2"
                          style={{
                            width: `${pctWidth}%`,
                            minWidth: `${minPxWidth}px`,
                            background: isDone
                              ? '#34C759'
                              : `${BLUE}`,
                            boxShadow: isDone ? '0 1px 3px rgba(52,199,89,0.25)' : `0 1px 3px rgba(${S_RGB},0.15)`,
                          }}>
                          {p >= 15 && (
                            <span className="text-[10px] font-bold text-white/90 tabular-nums">
                              {kr.val}{kr.u}
                            </span>
                          )}
                        </div>
                        {p < 15 && (
                          <span className="text-[10px] font-bold tabular-nums ml-1.5 flex-shrink-0" style={{ color: '#8a9491' }}>
                            {kr.val}{kr.u}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 右侧：完成率（删除当前/目标列，节省 64px 让漏斗条更宽） */}
                  <span className="text-[14px] font-extrabold tabular-nums leading-none w-[48px] text-right flex-shrink-0"
                    style={{ color: isDone ? '#111827' : (isBehind ? '#FF3B30' : BLUE) }}>
                    {p}<span className="text-[11px] font-bold">%</span>
                  </span>
                </div>

                {/* 连接线：同样 3 列结构 —— 修复间距 py-1.5(6px) 让箭头独立呼吸 */}
                {nextKr && (() => {
                  const lowConv = conv !== null && conv < 50;
                  return (
                    <div className="flex items-center gap-2.5 py-1.5 text-[11px]">
                      {/* 左区 w-[128px] —— 箭头 justify-center 对齐目标文字视觉中心 */}
                      <div className="w-[128px] flex-shrink-0 flex items-center justify-center">
                        <svg className="w-3 h-3" style={{ color: '#8a9491' }} fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 5v14M5 12l7 7 7-7" />
                        </svg>
                      </div>
                      {/* 转化率在 flex-1 居中 — 对齐表头「漏斗进度」文字 */}
                      <div className="flex-1 flex items-center justify-center min-w-0">
                        <span
                          className="font-bold tabular-nums"
                          style={{ color: lowConv ? '#FF3B30' : '#8a9491' }}>
                          {conv ?? 0}%
                        </span>
                      </div>
                      <div className="w-[48px] flex-shrink-0 invisible" aria-hidden="true"></div>
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>

        {/* ===== 关键瓶颈提示：自动分析最低转化率环节 ===== */}
        {(() => {
          // 计算每一层到下一层的转化率
          const stageNames = ['目标量', '输入量', '思考量', '行动量', '改变量'];
          const conversions = [];
          for (let i = 0; i < finalKrs.length - 1; i++) {
            const curr = finalKrs[i], next = finalKrs[i + 1];
            if (!curr || !next || !curr.val || curr.val <= 0) continue;
            const rate = Math.round((next.val / curr.val) * 100);
            conversions.push({ from: stageNames[i], to: stageNames[i + 1], rate, fromVal: curr.val, toVal: next.val });
          }
          if (conversions.length === 0) return null;
          // 找到最低转化率
          const minConv = conversions.reduce((a, b) => a.rate < b.rate ? a : b);
          // 构建提示文案
          const tips = [];
          if (minConv.rate < 50) {
            tips.push(`从「${minConv.from}」到「${minConv.to}」转化率仅 ${minConv.rate}%，是当前最大瓶颈`);
          }
          // 给出具体建议
          const suggestions = [];
          if (minConv.to === '输入量') suggestions.push('读完更多书籍，补充已读完的库存量');
          else if (minConv.to === '思考量') suggestions.push('对已读完的书补充核心触动与应用场景');
          else if (minConv.to === '行动量') suggestions.push('将思考转化为可执行的行动计划');
          else if (minConv.to === '改变量') suggestions.push('将行动计划落地，记录真实改变');

          return (
            <div className="flex items-start gap-2 mt-2 pt-2.5 pb-1 px-3 rounded-lg"
              style={{ background: 'rgba(255,149,0,0.06)', border: '1px solid rgba(255,149,0,0.18)' }}>
              {/* 橙色三角标：与「关键瓶颈」11px/15.4px 行高中心对齐（同工作页红色三角对齐逻辑） */}
              <svg className="w-[14px] h-[14px] flex-shrink-0 mt-[0.5px]" fill="#FF9500" viewBox="0 0 24 24">
                <path d="M12 2.5c-.6 0-1.1.3-1.4.8L1.5 19.3c-.3.5-.1 1.1.3 1.4.2.2.5.3.8.3h18.8c.3 0 .6-.1.8-.3.5-.3.6-.9.3-1.4L13.4 3.3c-.3-.5-.8-.8-1.4-.8z"/><path d="M12 9v4.5M12 17.5v.01" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>
              </svg>
              <div className="min-w-0 flex-1 text-[11px] leading-[1.4]">
                <span className="font-bold text-ink-700">关键瓶颈：</span>
                <span className="text-ink-600">
                  从「<span style={{ color: BLUE, fontWeight: 700 }}>{minConv.from}</span>」
                  到「<span style={{ color: BLUE, fontWeight: 700 }}>{minConv.to}</span>」
                  转化率
                  <span style={{ color: '#FF3B30', fontWeight: 800 }}> {minConv.rate}% </span>
                  — {suggestions[0]}
                </span>
              </div>
            </div>
          );
        })()}

      </div>
      {/* ===== 一体化 KR × 漏斗 卡片 END ===== */}

      {/* ===== 右侧·书架看板（6/12 列，2列网格恢复原始卡片尺寸） ===== */}
      <div className="xl:col-span-6 flex flex-col min-h-0">
      {/* ===== 书架看板 ===== */}
      <div className="bg-white rounded-2xl border border-ink-100 p-4 flex flex-col flex-1 min-h-0">
        {/* Header 两行式：第一行(色条+标题+共N本+操作按钮) · 第二行(Tabs左对齐) */}
        <div className="mb-2">
          {/* Row 1：色条 + 标题 + 共N本 + 操作按钮 */}
          <div className="flex items-center gap-3">
            {/* 左：色条 + 标题 + 共 N 本 */}
            <div className="flex items-center gap-3 flex-shrink-0">
              <span className="w-[5px] h-[18px] rounded-full flex-shrink-0" style={{ background: BLUE }}></span>
              <InlineEdit
                value={bookshelfTitle}
                onChange={(v) => setBookshelfTitle?.(String(v || '').trim())}
                onDelete={() => setBookshelfTitle?.('')}
                mode="contextmenu"
                placeholder={`${objective?.year || COG_O.year}年 · 书架`}
                className="text-[15.5px] font-bold text-ink-900 leading-none"
                inputClassName="text-[15.5px] font-bold text-ink-900 w-32"
                title="右键编辑书架标题"
              />
              <span className="text-[11px] text-ink-400 tabular-nums leading-none whitespace-nowrap">
                共 {groups.reading.length + groups.pending.length + groups.done.length} 本
              </span>
            </div>

            {/* 右：操作按钮组（右对齐，统一蓝色，只保留图标）*/}
            <div className="flex items-center gap-1 ml-auto flex-shrink-0">
              {/* 微信读书直达（复用生活页链接按钮设计：左键跳转 / 右键增删改链接） */}
              <div className="relative flex-shrink-0">
                <button
                  onClick={handleWereadLinkClick}
                  onContextMenu={handleWereadLinkContext}
                  title={wereadLinks.length ? `微信读书链接（${wereadLinks.length} 条，右键增删改）` : '右键添加微信读书链接'}
                  className="inline-flex items-center justify-center w-[26px] h-[26px] rounded-lg transition hover:brightness-105 active:scale-[0.98] cursor-pointer"
                  style={{ color: BLUE, background: `rgba(${S_RGB},0.06)` }}>
                  {/* 书架图标（三本竖立于书架上） */}
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 20.5h16"/>
                    <rect x="5.5" y="7.5" width="3.8" height="13" rx="0.6"/>
                    <rect x="10.1" y="9.5" width="3.8" height="11" rx="0.6"/>
                    <rect x="14.7" y="6" width="3.8" height="14.5" rx="0.6"/>
                    <path d="M7.4 7.5v2M12 9.5v2M16.6 6v2" opacity="0.55"/>
                  </svg>
                </button>

                {/* ===== 右键菜单：增删改 ===== */}
                {wereadLinkMenu && (
                  <div onClick={(e) => e.stopPropagation()} style={{
                    position: 'fixed', top: wereadLinkMenu.y,
                    // 右边界钳制：书架在右列，菜单 230px 需防止溢出视口
                    left: Math.max(8, Math.min(wereadLinkMenu.x, window.innerWidth - 246)), zIndex: 200,
                    minWidth: '230px', padding: '6px', borderRadius: '12px',
                    background: '#fff', border: '1px solid rgba(15,23,42,0.08)',
                    boxShadow: '0 10px 30px rgba(15,23,42,0.12), 0 2px 6px rgba(15,23,42,0.06)',
                  }}>
                    {wereadLinks.length === 0 && (
                      <div style={{ padding: '6px 10px', fontSize: '11px', color: '#8e8e93', fontWeight: 600 }}>
                        暂无微信读书链接，下面添加一条
                      </div>
                    )}
                    {wereadLinks.map(l => (
                      <div key={l.id} style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        padding: '6px 8px', borderRadius: '8px', marginBottom: '2px',
                      }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = `rgba(${S_RGB},0.08)`; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                        <span style={{
                          flex: 1, minWidth: 0, fontSize: '12px', fontWeight: 600, color: '#1c1c1e',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          cursor: 'pointer',
                        }}
                          title={l.url}
                          onClick={() => { window.open(l.url, '_blank', 'noopener,noreferrer'); closeWereadMenus(); }}>
                          {l.title}
                        </span>
                        {/* 编辑按钮 */}
                        <button title="编辑" onClick={() => { setWereadLinkMenu({ ...wereadLinkMenu, editingId: l.id }); setWereadLinkForm({ title: l.title, url: l.url }); }}
                          style={{
                            width: '22px', height: '22px', borderRadius: '6px', border: 'none',
                            background: 'transparent', color: '#8e8e93', cursor: 'pointer',
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = `rgba(${S_RGB},0.14)`; e.currentTarget.style.color = BLUE; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#8e8e93'; }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                          </svg>
                        </button>
                        {/* 删除按钮 */}
                        <button title="删除" onClick={() => deleteWereadLink(l.id)}
                          style={{
                            width: '22px', height: '22px', borderRadius: '6px', border: 'none',
                            background: 'transparent', color: '#8e8e93', cursor: 'pointer',
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,59,48,0.14)'; e.currentTarget.style.color = '#FF3B30'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#8e8e93'; }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/>
                            <path d="M10 11v6M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>
                          </svg>
                        </button>
                      </div>
                    ))}
                    {/* 分隔线 */}
                    {(wereadLinkMenu.editingId || wereadLinks.length > 0) && (
                      <div style={{ height: 1, background: 'rgba(15,23,42,0.08)', margin: '4px 2px' }} />
                    )}
                    {/* 编辑表单（编辑态或 0 条时显示） */}
                    {(wereadLinkMenu.editingId || wereadLinks.length === 0) && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '6px 4px' }}>
                        <div style={{ fontSize: '10.5px', fontWeight: 700, color: BLUE, letterSpacing: '0.04em' }}>
                          {wereadLinkMenu.editingId ? '编辑链接' : '新增链接'}
                        </div>
                        <input placeholder="标题（如：微信读书 · 我的书架）" value={wereadLinkForm.title}
                          onChange={(e) => setWereadLinkForm(f => ({ ...f, title: e.target.value }))}
                          style={{
                            fontSize: '12px', padding: '5px 8px', borderRadius: '8px',
                            border: '1px solid rgba(15,23,42,0.10)', background: '#fff', outline: 'none',
                            fontWeight: 500,
                          }} />
                        <input placeholder="链接地址（如：https://weread.qq.com）" value={wereadLinkForm.url}
                          onChange={(e) => setWereadLinkForm(f => ({ ...f, url: e.target.value }))}
                          style={{
                            fontSize: '12px', padding: '5px 8px', borderRadius: '8px',
                            border: '1px solid rgba(15,23,42,0.10)', background: '#fff', outline: 'none',
                            fontWeight: 500,
                          }} />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                          <button onClick={closeWereadMenus}
                            style={{
                              padding: '4px 10px', borderRadius: '7px', fontSize: '11px', fontWeight: 600,
                              border: 'none', cursor: 'pointer',
                              background: 'rgba(120,120,128,0.12)', color: '#1c1c1e',
                            }}>取消</button>
                          <button onClick={() => wereadLinkMenu.editingId ? updateWereadLink(wereadLinkMenu.editingId) : addWereadLink()}
                            style={{
                              padding: '4px 10px', borderRadius: '7px', fontSize: '11px', fontWeight: 600,
                              border: 'none', cursor: 'pointer',
                              background: BLUE, color: '#fff',
                              boxShadow: `0 1px 4px rgba(${S_RGB},0.28)`,
                            }}>{wereadLinkMenu.editingId ? '保存' : '添加'}</button>
                        </div>
                      </div>
                    )}
                    {/* 添加一条新的入口（已有条目且未编辑态） */}
                    {wereadLinks.length > 0 && !wereadLinkMenu.editingId && (
                      <button onClick={() => { setWereadLinkMenu({ ...wereadLinkMenu, editingId: null }); setWereadLinkForm({ title: '', url: '' }); }}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', gap: '6px',
                          padding: '6px 8px', borderRadius: '8px', border: 'none',
                          background: 'transparent', color: BLUE,
                          fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = `rgba(${S_RGB},0.08)`; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                          <path d="M12 5v14M5 12h14"/>
                        </svg>
                        新增一条链接
                      </button>
                    )}
                  </div>
                )}

                {/* ===== 左键多链接选择面板 ===== */}
                {wereadLinkPopup && (
                  <div onClick={(e) => e.stopPropagation()} style={{
                    position: 'fixed', top: wereadLinkPopup.y,
                    left: Math.max(8, Math.min(wereadLinkPopup.x, window.innerWidth - 236)), zIndex: 200,
                    minWidth: '220px', padding: '6px', borderRadius: '12px',
                    background: '#fff', border: '1px solid rgba(15,23,42,0.08)',
                    boxShadow: '0 10px 30px rgba(15,23,42,0.12), 0 2px 6px rgba(15,23,42,0.06)',
                  }}>
                    <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#8e8e93', letterSpacing: '0.04em', padding: '4px 8px' }}>
                      选择要打开的链接
                    </div>
                    {wereadLinks.map(l => (
                      <button key={l.id} onClick={() => { window.open(l.url, '_blank', 'noopener,noreferrer'); closeWereadMenus(); }}
                        style={{
                          display: 'block', width: '100%', textAlign: 'left',
                          padding: '7px 10px', borderRadius: '8px', border: 'none',
                          background: 'transparent', cursor: 'pointer',
                          fontSize: '12px', fontWeight: 600, color: '#1c1c1e',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = `rgba(${S_RGB},0.08)`; e.currentTarget.style.color = BLUE; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#1c1c1e'; }}
                        title={l.url}>
                        {l.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button onClick={doWereadSync} disabled={wereadSyncing}
                className="inline-flex items-center justify-center w-[26px] h-[26px] rounded-lg transition flex-shrink-0 disabled:opacity-50"
                style={{ color: BLUE, background: `rgba(${S_RGB},0.06)` }}
                title={wereadCfgOk ? '从微信读书同步书架' : '先设置微信读书 API Key'}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M4 4v5h5M20 20v-5h-5M20 9A8 8 0 0 0 6.34 5.34L4 9M4 15a8 8 0 0 0 13.66 3.66L20 15" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              <button onClick={async () => {
                  setShowWereadSettings(true);
                  try {
                    const r = await fetch('/api/userSettings/get', {
                      headers: { 'X-Unlock-Token': localStorage.getItem('pw_unlock_token') || '' },
                    });
                    const j = await r.json().catch(() => ({}));
                    const cfg = j?.data?.weread_api_key || {};
                    if (cfg.value) setWereadKey(cfg.value);
                  } catch {}
                }}
                className="inline-flex items-center justify-center w-[26px] h-[26px] rounded-lg transition flex-shrink-0"
                style={{ color: BLUE, background: `rgba(${S_RGB},0.06)` }}
                title="设置微信读书 API Key">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              <button onClick={() => onBookAdd?.()}
                className="inline-flex items-center justify-center w-[26px] h-[26px] rounded-lg transition flex-shrink-0"
                style={{ color: BLUE, background: `rgba(${S_RGB},0.06)` }}
                title="添加书籍">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" strokeLinecap="round"/></svg>
              </button>
            </div>
          </div>

          {/* Row 2：Tab 筛选按钮组（左对齐，跟标题左对齐）*/}
          {(() => {
            const TABS = [
              { key: 'reading',   lb: '阅读中',   col: BLUE,     books: groups.reading },
              { key: 'pending',   lb: '未开始',   col: BLUE,     books: groups.pending },
              { key: 'done',      lb: '已读完',   col: BLUE,     books: groups.done },
              { key: 'abandoned', lb: '已归档',   col: BLUE,     books: groups.abandoned },
            ];
            return (
              <div className="flex items-center gap-1 mt-2">
                {TABS.map(t => {
                  const active = shelfTab === t.key;
                  return (
                    <button
                      key={t.key}
                      onClick={() => setShelfTab(t.key)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-[10px] transition-all duration-150`}
                      style={{
                        background: active ? BLUE : 'transparent',
                        color: active ? '#ffffff' : '#64748b',
                        fontWeight: active ? 700 : 500,
                        fontSize: '11.5px',
                        boxShadow: active ? 'none' : 'inset 0 0 0 1px rgba(15,23,42,0.05)',
                      }}>
                      <span className="relative w-[11px] h-[11px] rounded-full flex-shrink-0 flex items-center justify-center"
                        style={{ background: active ? 'rgba(255,255,255,0.25)' : 'rgba(148,163,184,0.22)' }}>
                        <span className="w-[5.5px] h-[5.5px] rounded-full" style={{ background: active ? '#ffffff' : '#8a9491' }}></span>
                      </span>
                      <span>{t.lb}</span>
                      <span className="inline-flex items-center justify-center min-w-[17px] h-[15px] px-1 rounded-full text-[10px] font-bold tabular-nums leading-none"
                        style={{
                          background: active ? 'rgba(255,255,255,0.28)' : 'rgba(15,23,42,0.05)',
                          color: active ? '#ffffff' : '#64748b',
                        }}>
                        {t.books.length}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })()}
        </div>
        {/* 单列主内容：只渲染当前选中 shelfTab 这一栏 */}
        {(() => {
          const META = {
            reading:   { lb: '阅读中',   col: BLUE },
            pending:   { lb: '未开始',   col: '#64748b' },
            done:      { lb: '已读完',   col: '#34C759' },
            abandoned: { lb: '已归档', col: '#64748b' },
          };
          const g = { key: shelfTab, ...META[shelfTab], books: groups[shelfTab] || [] };
          const isDragOver = dragOverCol === g.key && dragBookId && (() => {
            const cur = (books.length === 0 ? BOOKS : books).find(x => x.id === dragBookId);
            return cur && cur.st !== g.key;
          })();
          return (
            <div
              className="flex-1 min-h-0 flex flex-col overflow-y-auto pr-1"
              style={{
                background: 'rgba(15,23,42,0.032)',
                border: isDragOver
                  ? `2px dashed ${g.col}`
                  : '1px solid rgba(15,23,42,0.05)',
                boxShadow: isDragOver ? `0 0 0 4px ${g.col}12` : undefined,
                padding: isDragOver ? '10px 8px' : '10px 9px',
                borderRadius: '14px',
                transition: 'all 200ms ease',
              }}
              onDragOver={(e) => {
                e.preventDefault();
                const cur = (books.length === 0 ? BOOKS : books).find(x => x.id === dragBookId);
                if (cur && cur.st !== g.key) setDragOverCol(g.key);
              }}
              onDragLeave={() => { if (dragOverCol === g.key) setDragOverCol(null); }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragBookId) {
                  const cur = (books.length === 0 ? BOOKS : books).find(x => x.id === dragBookId);
                  if (cur && cur.st !== g.key) onBookMove?.(dragBookId, g.key);
                }
                setDragBookId(null);
                setDragOverCol(null);
              }}
            >
              <div className="grid grid-cols-2 gap-2.5">
                {g.books.length === 0 ? (
                  <div className="col-span-full flex items-center justify-center py-6 text-[12px] rounded-lg transition-all"
                    style={{
                      color: isDragOver ? g.col : '#a3a3a3',
                      border: isDragOver ? `1.5px dashed ${g.col}90` : '1px dashed rgba(15,23,42,0.10)',
                      background: isDragOver ? `${g.col}10` : 'transparent',
                      fontWeight: isDragOver ? 700 : 500,
                    }}>
                    {isDragOver ? '松手放到这里' : '暂无书籍'}
                  </div>
                ) : (
                  g.books.map((b) => {
                    const isDragging = dragBookId === b.id;
                    const isDone = g.key === 'done';
                    const catCol = catColorOf(b.cat);
                    const pct = Math.min(100, Math.max(0, Number(b.pct) || 0));
                    let statusDot;
                    switch (b.st) {
                      case 'reading':
                        statusDot = { col: BLUE, solid: true, pulse: true, lb: '阅读中' };
                        break;
                      case 'done':
                        statusDot = { col: '#34C759', solid: true, pulse: false, lb: '已读完' };
                        break;
                      case 'abandoned':
                        statusDot = { col: '#64748b', solid: false, pulse: false, strike: false, lb: '已归档' };
                        break;
                      default:
                        statusDot = { col: '#cbd5e1', solid: false, pulse: false, lb: '未开始' };
                    }
                    const ebookInfo = (() => {
                      const validId = (v) => typeof v === 'string' && /^[a-z0-9]{20,}$/i.test(v.replace(/-/g, ''));
                      if (b.ebookUrl && b.ebookUrl.startsWith('http')) {
                        const m = b.ebookUrl.match(/\/reader\/([^/?#]+)/);
                        if (m && validId(m[1])) return { url: b.ebookUrl, hasLink: true };
                      }
                      if (b.bookId && validId(b.bookId)) return { url: `https://weread.qq.com/web/reader/${b.bookId}`, hasLink: true };
                      return { url: null, hasLink: false };
                    })();
                    const hasEbookLink = ebookInfo.hasLink;
                    const isEbookLink = ebookInfo.url;
                    const insights = b.insights || [];
                    const validIns = insights.filter(i => i.text?.trim() && i.scene?.trim());
                    const acts = b.actions || [];
                    const validActs = acts.filter(a => a.text?.trim());
                    const hasIns = validIns.length > 0;
                    const hasAct = validActs.length > 0;
                    const realCover = String(b.coverUrl || '').trim();
                    const coverInitBg = (() => {
                      switch (b.cat) {
                        case '认知成长': return 'linear-gradient(135deg,#F0F6FF,#DCEBFF)';
                        case '人际沟通': return 'linear-gradient(135deg,#faf5ff,#ede9fe)';
                        case '商业职场': return 'linear-gradient(135deg,#fff7ed,#FFE4CC)';
                        case '人文叙事': return 'linear-gradient(135deg,#EDFAF1,#ADE5C2)';
                        default: return `linear-gradient(135deg, ${catCol}1A, ${catCol}33)`;
                      }
                    })();
                    return (
                      <div
                        key={b.id}
                        draggable
                        onDragStart={(e) => {
                          try { e.dataTransfer.setData('text/plain', String(b.id)); } catch {}
                          e.dataTransfer.effectAllowed = 'move';
                          setDragBookId(b.id);
                        }}
                        onDragEnd={() => { setDragBookId(null); setDragOverCol(null); }}
                        onClick={() => onBookEdit?.(b)}
                        onContextMenu={(e) => { e.preventDefault(); onBookContextMenu?.(e, b); }}
                        className={`rounded-2xl bg-white transition-all select-none overflow-hidden ${isDragging ? 'opacity-40 scale-[0.98]' : 'hover:shadow-[0_5px_16px_rgba(15,23,42,0.08)] hover:-translate-y-[1px]'}`}
                        style={{
                          cursor: isDragging ? 'grabbing' : 'pointer',
                          boxShadow: '0 2px 8px rgba(15,23,42,0.06)',
                          border: '1px solid rgba(15,23,42,0.10)',
                        }}>
                        <div className="w-full min-w-0 flex flex-col gap-[7px]" style={{ padding: '12px 13px' }}>
                          {/* 主行：封面48×64左 + 右侧4行信息流 */}
                          <div className="flex items-start gap-[11px] min-w-0">
                            {/* 封面 48×64 */}
                            <div style={{
                              width:'48px', height:'64px', borderRadius:'7px', overflow:'hidden', flex:'0 0 48px',
                              border: `1px solid ${catCol}33`,
                              background: realCover ? '#fff' : coverInitBg,
                              boxShadow: '0 2px 6px rgba(15,23,42,0.07)',
                              display: 'flex', alignItems:'center', justifyContent:'center',
                            }}>
                              {realCover ? (
                                <CoverImg
                                  src={realCover}
                                  bookId={b.id}
                                  coverSource={b.coverSource}
                                  onPersist={(dataUrl) => {
                                    if (typeof onBookUpdate !== 'function') return;
                                    try { onBookUpdate(b.id, { coverUrl: dataUrl, coverSource: 'local-base64' }); }
                                    catch (_) {}
                                  }}
                                  catCol={catCol}
                                  fallbackChar={(b.t||'书').charAt(0)}
                                />
                              ) : (
                                <span style={{ color: catCol, fontSize: '22px', fontWeight: 900, textShadow: `0 1px 2px ${catCol}22`, lineHeight: 1 }}>
                                  {(b.t||'书').charAt(0)}
                                </span>
                              )}
                            </div>
                            {/* 右侧：书名+↗ / 作者+Pill / %+bar / 日期 */}
                            <div className="flex-1 min-w-0 flex flex-col gap-[4px]" style={{ paddingBottom: '2px' }}>
                              {/* 行1：书名 左 + 跳转↗ 右 */}
                              <div className="flex items-start justify-between gap-2 min-w-0">
                                <div className="min-w-0 flex-1">
                                  <div className={`min-w-0 truncate text-[15px] leading-[1.3] ${statusDot.strike ? 'line-through' : ''}`}
                                    style={{ fontWeight: 600, color: isDone ? '#8E8E93' : '#48484A', letterSpacing: '0.1px' }}>
                                    {b.t}
                                  </div>
                                </div>
                                {true && (
                                  <div className="flex items-center flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                                    <button
                                      disabled={!hasEbookLink}
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        if (!hasEbookLink) return;
                                        try { window.open(isEbookLink, '_blank', 'noopener,noreferrer'); }
                                        catch { onBookEdit?.(b); }
                                      }}
                                      title={hasEbookLink ? '打开电子书' : '微信读书暂未收录，点击【同步微信读书】按钮自动搜索'}
                                      className="group inline-flex items-center justify-center transition-colors duration-150 disabled:cursor-not-allowed"
                                      style={{
                                        width: '20px', height: '20px', borderRadius:'5px',
                                        background: 'transparent',
                                        color: hasEbookLink ? '#4F90FF' : '#cbd5e1',
                                      }}
                                      onMouseEnter={(e) => {
                                        if (!hasEbookLink) return;
                                        e.currentTarget.style.background = BLUE;
                                        e.currentTarget.style.color = '#fff';
                                      }}
                                      onMouseLeave={(e) => {
                                        e.currentTarget.style.background = 'transparent';
                                        e.currentTarget.style.color = hasEbookLink ? '#4F90FF' : '#cbd5e1';
                                      }}>
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        {hasEbookLink ? (
                                          <path d="M7 17 17 7M7 7h10v10"/>
                                        ) : (
                                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" opacity="0.5"/>
                                        )}
                                      </svg>
                                    </button>
                                  </div>
                                )}
                              </div>
                              {/* 行2：作者 左 + 分类Pill 右 */}
                              <div className="flex items-center justify-between gap-2 min-w-0">
                                <div className="text-[11.5px] text-ink-400 font-medium leading-none truncate flex-1">
                                  {b.author || '佚名作者'}
                                </div>
                                <span className="inline-flex flex-shrink-0 items-center px-[7px] h-[17px] rounded-full text-[10px] font-bold leading-none"
                                  style={{
                                    background: CAT_PILL_BG[b.cat] || '#f1f5f9',
                                    color: catTextColorOf(b.cat),
                                  }}>
                                  {b.cat || '未分类'}
                                </span>
                              </div>
                              {/* 进度：% + bar */}
                              <div className="flex items-center gap-[8px] min-w-0">
                                <span className="text-[12px] font-bold tabular-nums leading-none flex-shrink-0"
                                  style={{ color: b.st==='done' ? '#34C759' : statusDot.col }}>{pct}%</span>
                                <div style={{ width: '100%', height:'5px', borderRadius:'999px', background:'#e2e8f0', overflow:'hidden', flex: '1 1 auto' }}>
                                  <div style={{
                                    width: `${Math.max(0, pct)}%`, height: '100%', borderRadius:'999px',
                                    background: b.st === 'done' ? '#34C759' : b.st === 'abandoned' ? '#8a9491' : pct <= 0 ? 'transparent' : statusDot.col,
                                    transition: 'width 300ms ease-out',
                                  }}/>
                                </div>
                              </div>
                              {/* 日期+已读天数 */}
                              <div className="flex items-center gap-[4px] min-w-0">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#8a9491" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                                  <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
                                </svg>
                                {(() => {
                                  const fmtShort = (d) => {
                                    if (!d) return '';
                                    const s = String(d);
                                    const m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
                                    if (m) return `${m[1].slice(2)}/${String(+m[2]).padStart(2,'0')}/${String(+m[3]).padStart(2,'0')}`;
                                    const m2 = s.replace(/\//g, '-').match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
                                    if (m2) return `${m2[1].slice(2)}/${String(+m2[2]).padStart(2,'0')}/${String(+m2[3]).padStart(2,'0')}`;
                                    return s;
                                  };
                                  const dayDiff = (a, b) => {
                                    try {
                                      const da = new Date(String(a).replace(/-/g,'/'));
                                      const db = new Date(String(b).replace(/-/g,'/'));
                                      if (isNaN(+da) || isNaN(+db)) return 0;
                                      return Math.max(0, Math.round((db - da) / 86400000));
                                    } catch { return 0; }
                                  };
                                  const today = new Date().toISOString().slice(0, 10);
                                  let dateLabel = '';
                                  if (b.st === 'reading') {
                                    if (b.startDate) {
                                      const d = dayDiff(b.startDate, today);
                                      dateLabel = `${fmtShort(b.startDate)} → 今天 · 已读 ${d + 1} 天`;
                                    } else {
                                      dateLabel = '未设置开始日期 · 点卡片设置';
                                    }
                                  } else if (b.st === 'done') {
                                    if (b.startDate && b.endDate) {
                                      const d = dayDiff(b.startDate, b.endDate);
                                      dateLabel = `${fmtShort(b.startDate)} → ${fmtShort(b.endDate)} · 共读 ${d + 1} 天`;
                                    } else if (b.endDate) {
                                      dateLabel = `${fmtShort(b.endDate)} 读完`;
                                    } else {
                                      dateLabel = '已读完';
                                    }
                                  } else if (b.st === 'abandoned') {
                                    dateLabel = b.endDate ? `${fmtShort(b.endDate)} 归档` : '已归档';
                                  } else {
                                    if (b.startDate) dateLabel = `计划 ${fmtShort(b.startDate)} 开启`;
                                    else dateLabel = '待开启 · 点卡片设置日期';
                                  }
                                  return (
                                    <span className="text-[10.5px] font-medium text-ink-400 leading-none truncate">
                                      {dateLabel}
                                    </span>
                                  );
                                })()}
                              </div>
                            </div>
                          </div>

                          {/* 分割线 — 更浅 */}
                          <div style={{ height: 1, background: '#f8fafc', margin: '2px 0' }}></div>

                          {/* 底部：✔思考 / ✔行动 / ✔改变（统一绿色，0数量隐藏）*/}
                          <div className="flex items-center gap-4 min-w-0">
                            {hasIns && (
                              <div className="flex items-center gap-[5px]">
                                <div className={`flex items-center justify-center w-[14px] h-[14px] rounded-[3.5px]`}
                                  style={{ background: '#34C759' }}>
                                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7"/></svg>
                                </div>
                                <span className="text-[11px] font-semibold text-ink-600 leading-none">思考 {validIns.length} 组</span>
                              </div>
                            )}
                            {hasAct && (
                              <div className="flex items-center gap-[5px]">
                                <div className={`flex items-center justify-center w-[14px] h-[14px] rounded-[3.5px]`}
                                  style={{ background: '#34C759' }}>
                                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7"/></svg>
                                </div>
                                <span className="text-[11px] font-semibold text-ink-600 leading-none">行动 {validActs.length} 条</span>
                              </div>
                            )}
                            {(() => {
                              const changeCount = (changes || []).filter(c => c.bookId === b.id).length;
                              if (changeCount === 0) return null;
                              return (
                                <div className="flex items-center gap-[5px]">
                                  <div className={`flex items-center justify-center w-[14px] h-[14px] rounded-[3.5px]`}
                                    style={{ background: '#34C759' }}>
                                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7"/></svg>
                                  </div>
                                  <span className="text-[11px] font-semibold text-ink-600 leading-none">改变 {changeCount} 个</span>
                                </div>
                              );
                            })()}
                            {!hasIns && !hasAct && (() => {
                              const changeCount = (changes || []).filter(c => c.bookId === b.id).length;
                              return changeCount === 0 ? (
                                <span className="text-[10.5px] text-ink-300 leading-none italic">暂无思考与行动</span>
                              ) : null;
                            })()}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })()}
      </div>
      </div>
      {/* ===== 书架看板 END ===== */}

      </div>
      {/* ===== Row 1 (OKR+书架双栏) END ===== */}

      {/* 添加 KR 弹窗（BookForm 风格：20px 圆角 + Section 分组 + 胶囊按钮） */}
      {addingKr && (
        <Modal open onClose={() => setAddingKr(false)} title="新增 KR"
          footer={
            <>
              <button onClick={() => setAddingKr(false)}
                className="px-4 py-1.5 text-[13px] rounded-[10px] transition"
                style={{ background: 'rgba(15,23,42,0.04)', color: '#64748b' }}>取消</button>
              <button onClick={commitAddKr}
                className="px-5 py-1.5 text-[13px] text-white rounded-[10px] transition"
                style={{ background: BLUE, boxShadow: `0 2px 8px rgba(${S_RGB},0.21)` }}>添加</button>
            </>
          }>
          <KrFormFields
            lb={newKr.lb} tgt={newKr.tgt} u={newKr.u} sub={newKr.sub}
            onChange={(patch) => setNewKr(prev => ({ ...prev, ...patch }))} />
        </Modal>
      )}

      {/* 编辑 KR 弹窗（BookForm 风格） */}
      {editingKrModal && (
        <Modal open onClose={() => setEditingKrModal(null)} title="编辑 KR"
          footer={
            <>
              <button onClick={() => { if (editingKrModal.kr && confirm('确定删除此 KR？')) { onKrRemove?.(editingKrModal.kr.id); setEditingKrModal(null); } }}
                className="px-4 py-1.5 text-[13px] rounded-[10px] transition"
                style={{ background: 'rgba(255,59,48,0.08)', border: '1px solid rgba(255,59,48,0.25)', color: '#FF3B30' }}>删除</button>
              <div className="flex-1"></div>
              <button onClick={() => setEditingKrModal(null)}
                className="px-4 py-1.5 text-[13px] rounded-[10px] transition"
                style={{ background: 'rgba(15,23,42,0.04)', color: '#64748b' }}>取消</button>
              <button onClick={commitEditKr}
                className="px-5 py-1.5 text-[13px] text-white rounded-[10px] transition"
                style={{ background: BLUE, boxShadow: `0 2px 8px rgba(${S_RGB},0.21)` }}>保存</button>
            </>
          }>
          <KrFormFields
            lb={editingKrModal.draft.lb} tgt={editingKrModal.draft.tgt} u={editingKrModal.draft.u} sub={editingKrModal.draft.sub}
            onChange={(patch) => setEditingKrModal(prev => ({ ...prev, draft: { ...prev.draft, ...patch } }))} />
        </Modal>
      )}

      {/* ===== 读后思考 · 思后行动 · 行后改变（三栏横向布局）===== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">

        {/* ========== 卡片一：读后思考 ========== */}
        <div className="bg-white rounded-2xl border border-ink-100 p-4 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <span className="w-[5px] h-[18px] rounded-full flex-shrink-0" style={{ background: BLUE }}></span>
              <EditableTitle value={thoughtsTitle} onChange={setThoughtsTitle} fallback={`${year}年 · 读后思考`}
                className="text-[16px] font-bold text-ink-900 leading-tight" inputClassName="text-[16px] font-bold text-ink-900" />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold px-3 rounded-full inline-flex items-center h-[26px]" style={{ background: `rgba(${S_RGB},0.08)`, color: BLUE }}>
                {totalInsightCount}组
              </span>
              <button onClick={() => setBookPicker('insights')}
                className="inline-flex items-center justify-center w-[26px] h-[26px] rounded-lg transition flex-shrink-0"
                style={{ background: `rgba(${S_RGB},0.06)`, color: BLUE }}
                title="添加读后思考">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" strokeLinecap="round"/></svg>
              </button>
            </div>
          </div>
          <div className="flex-1 flex flex-col gap-1.5">
            {booksWithInsights.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-6 text-[12px] text-ink-400" style={{ background: 'rgba(15,23,42,0.032)', borderRadius: 12 }}>
                还没写读后思考<br/>点击右上角 + 选择书籍
              </div>
            ) : (
              booksWithInsights.slice(0, 5).map(b => {
                const ins = b.insights || [];
                const validIns = ins.filter(i => i.text?.trim());
                return (
                  <div key={b.id}
                    className="rounded-xl p-2.5 transition-all hover:shadow-md cursor-pointer"
                    style={{ background: '#fff', border: '1px solid rgba(15,23,42,0.08)' }}
                    onClick={() => onBookEdit?.(b, 'insights')}>
                    {/* 分组标题行：实心灯泡 ③ + 书名 · X组 */}
                    <div className="flex items-center gap-1.5 pb-1 mb-1 border-b border-dashed" style={{ borderColor: 'rgba(15,23,42,0.1)' }}>
                      <svg className="w-[14px] h-[14px] flex-shrink-0" fill="none" stroke={BLUE} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                        <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z"/>
                        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                        <path d="M8 7h3M13 7h3"/>
                      </svg>
                      <span className="text-[12px] font-semibold truncate flex-1" style={{ color: BLUE }}>{b.t}</span>
                      <span className="text-[10px] font-medium flex-shrink-0" style={{ color: BLUE }}>{validIns.length}组</span>
                    </div>
                    {/* 所有 insight 条目，每行一条 */}
                    {validIns.slice(0, 3).map((it, idx) => (
                      <div key={it.id || idx} className="text-[11px] text-ink-600 leading-snug line-clamp-1 pl-[22px]">
                        "{it.text}"
                      </div>
                    ))}
                    {validIns.length > 3 && (
                      <div className="text-[10px] text-ink-400 pl-[22px] mt-0.5">+{validIns.length - 3} 条</div>
                    )}
                  </div>
                );
              })
            )}
            {booksWithInsights.length > 5 && (
              <div className="text-center text-[11px] text-ink-400 mt-1">还有 {booksWithInsights.length - 5} 本 · 点击书籍编辑</div>
            )}
          </div>
        </div>

        {/* ========== 卡片二：思后行动（合并书籍中思后行动 + 旧独立changes）========== */}
        <div className="bg-white rounded-2xl border border-ink-100 p-4 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <span className="w-[5px] h-[18px] rounded-full flex-shrink-0" style={{ background: BLUE }}></span>
              <EditableTitle value={actionsTitle} onChange={setActionsTitle} fallback={`${year}年 · 思后行动`}
                className="text-[16px] font-bold text-ink-900 leading-tight" inputClassName="text-[16px] font-bold text-ink-900" />
            </div>
            <div className="flex items-center gap-1.5">
              {/* 胶囊：已勾选完成数 / 总条数 — 与卡片内每条 action 的圆形复选框 isCompleted 判定严格一致：c.done || status==='completed'||'reviewed' */}
              <span className="text-[11px] font-semibold px-3 rounded-full inline-flex items-center h-[26px] tabular-nums" style={{ background: `rgba(${S_RGB},0.08)`, color: BLUE }}>
                {(() => {
                  const all = [...(bookActionsList || []), ...(changes || [])];
                  const done = all.filter(c => c.done || c.status === 'completed' || c.status === 'reviewed').length;
                  return (<><span className="font-extrabold">{done}</span><span className="opacity-50 mx-0.5">/</span>{all.length}条</>);
                })()}
              </span>
              <button onClick={() => setBookPicker('actions')}
                className="inline-flex items-center justify-center w-[26px] h-[26px] rounded-lg transition flex-shrink-0"
                style={{ background: `rgba(${S_RGB},0.06)`, color: BLUE }}
                title="添加行动计划">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" strokeLinecap="round"/></svg>
              </button>
            </div>
          </div>
          {(() => {
            const mergedActions = [...(bookActionsList || []), ...(changes || [])];
            return (
              <div className="flex-1 flex flex-col gap-1.5">
                {mergedActions.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center py-6 text-[12px] text-ink-400" style={{ background: 'rgba(15,23,42,0.032)', borderRadius: 12 }}>
                    还没有行动计划<br/>点击右上角 + 选择书籍
                  </div>
                ) : (
                  // 按 bookTitle 分组渲染（跟读后思考分组逻辑对齐）
                  Object.entries(
                    mergedActions.slice(0, 6).reduce((acc, c) => {
                      const key = c.bookTitle || '__独立__';
                      if (!acc[key]) acc[key] = [];
                      acc[key].push(c);
                      return acc;
                    }, {})
                  ).map(([bookKey, actions]) => (
                    <div key={bookKey}
                      className="rounded-xl p-2.5 transition-all hover:shadow-md"
                      style={{ background: '#fff', border: '1px solid rgba(15,23,42,0.08)' }}>
                      {/* 分组标题：实心灯泡 + 书名（独立行动则不显示书名） */}
                      {bookKey !== '__独立__' && (
                        <div className="flex items-center gap-1.5 pb-1 mb-1 border-b border-dashed" style={{ borderColor: 'rgba(15,23,42,0.1)' }}>
                          <svg className="w-[14px] h-[14px] flex-shrink-0" fill="none" stroke={BLUE} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                            <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z"/>
                            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                            <path d="M8 7h3M13 7h3"/>
                          </svg>
                          <span className="text-[12px] font-semibold truncate flex-1" style={{ color: BLUE }}>{bookKey}</span>
                          <span className="text-[10px] font-medium flex-shrink-0" style={{ color: BLUE }}>{actions.length}条</span>
                        </div>
                      )}
                      {/* 每条行动 */}
                      {actions.map(c => {
                        const fromBook = !!c.__fromBook;
                        const isCompleted = c.done || c.status === 'completed' || c.status === 'reviewed';
                        return (
                          <div key={c.id} className="flex items-start gap-2 py-1">
                            {/* 圆形复选框：未勾选=白底+蓝边，已勾选=蓝色填充白勾 */}
                            <button
                              onClick={(e) => { e.stopPropagation(); onChangeToggleComplete?.(c.id); }}
                              className="flex-shrink-0 mt-[1px] w-[16px] h-[16px] rounded-full flex items-center justify-center transition"
                              style={{
                                background: isCompleted ? BLUE : '#fff',
                                border: `1.5px solid ${BLUE}`,
                              }}
                              title={isCompleted ? '点击取消完成' : '点击标记完成'}>
                              {isCompleted && (
                                <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M20 6L9 17l-5-5" />
                                </svg>
                              )}
                            </button>
                            <span
                              className={`flex-1 text-[12px] leading-snug cursor-pointer truncate ${isCompleted ? 'text-ink-500 line-through' : 'text-ink-900'}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (fromBook) {
                                  const targetBook = (books.length === 0 ? BOOKS : books).find(b => b.id === c.bookId);
                                  if (targetBook) onBookEdit?.(targetBook, 'actions');
                                } else {
                                  setEditingChange(c); setShowChangeForm(true);
                                }
                              }}>
                              {c.text}
                            </span>
                            {!fromBook && (
                              <button onClick={(e) => { e.stopPropagation(); if (confirm('确定删除这条行动？')) onChangeRemove?.(c.id); }}
                                className="text-ink-300 hover:text-accent-red transition flex-shrink-0"
                                title="删除">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round"/>
                                </svg>
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))
                )}
                {mergedActions.length > 6 && (
                  <div className="text-center text-[11px] text-ink-400 mt-1">还有 {mergedActions.length - 6} 条 · 点击书籍/条目编辑管理</div>
                )}
              </div>
            );
          })()}
        </div>

        {/* ========== 卡片三：行后改变 ========== */}
        <div className="bg-white rounded-2xl border border-ink-100 p-4 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <span className="w-[5px] h-[18px] rounded-full flex-shrink-0" style={{ background: BLUE }}></span>
              <EditableTitle value={reviewsTitle} onChange={setReviewsTitle} fallback={`${year}年 · 行后改变`}
                className="text-[16px] font-bold text-ink-900 leading-tight" inputClassName="text-[16px] font-bold text-ink-900" />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold px-3 rounded-full inline-flex items-center h-[26px]" style={{ background: `rgba(${S_RGB},0.08)`, color: BLUE }}>
                {(reviews || []).length}个
              </span>
              <button onClick={() => {
                // 新增改变：生成新ID，打开编辑弹窗
                const newId = 'rv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
                setEditingReview({
                  id: newId,
                  text: '',
                  bookTitle: '',
                  beforeState: '',
                  afterState: '',
                  nextStep: '',
                  practiceEffect: '',
                  tag: 'cognition',
                  __isNew: true,
                });
              }}
                className="inline-flex items-center justify-center w-[26px] h-[26px] rounded-lg transition flex-shrink-0"
                style={{ background: `rgba(${S_RGB},0.06)`, color: BLUE }}
                title="新增改变">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" strokeLinecap="round"/></svg>
              </button>
            </div>
          </div>
          <div className="flex-1 flex flex-col gap-1.5">
            {(reviews || []).length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-6 text-[12px] text-ink-400" style={{ background: 'rgba(15,23,42,0.032)', borderRadius: 12 }}>
                还没有改变记录<br/>点击右上角 + 手动添加
              </div>
            ) : (
              (reviews || []).slice(0, 5).map(r => {
                // 标签：蓝色明度分层（10% / 28% / 实心），旧数据自动迁移
                const tagMeta = {
                  cognition:    { lb: '认知更新', color: BLUE, bg: `rgba(${S_RGB},0.06)`, bd: `rgba(${S_RGB},0.15)` },
                  habit:        { lb: '长期习惯', color: BLUE, bg: `rgba(${S_RGB},0.16)`, bd: `rgba(${S_RGB},0.27)` },
                  internalized: { lb: '已内化', color: '#fff', bg: BLUE, bd: BLUE, solid: true },
                  decision:     { lb: '认知更新', color: BLUE, bg: `rgba(${S_RGB},0.06)`, bd: `rgba(${S_RGB},0.15)` },
                  sop:          { lb: '已内化', color: '#fff', bg: BLUE, bd: BLUE, solid: true },
                };
                const tm = tagMeta[r.tag] || tagMeta.cognition;
                return (
                  <div key={r.id}
                    className="rounded-xl p-2.5 hover:shadow-md transition-all cursor-pointer"
                    style={{ background: '#fff', border: '1px solid rgba(15,23,42,0.08)' }}
                    onClick={() => setEditingReview(r)}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[12px] font-semibold text-[#48484A] leading-snug line-clamp-2 flex-1 min-w-0">{r.text || '未命名改变'}</div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded" style={{
                          background: tm.bg, border: `1px solid ${tm.bd}`,
                          color: tm.solid ? '#fff' : tm.color,
                        }}>
                          {tm.lb}
                        </span>
                        <button onClick={(e) => { e.stopPropagation(); if (confirm('确定删除这条改变？')) onReviewRemove?.(r.id); }}
                          className="text-ink-300 hover:text-accent-red transition"
                          title="删除">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                    {r.bookTitle && (
                      <div className="flex items-center gap-1 mt-1 overflow-hidden">
                        <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke={BLUE} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                          <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z"/>
                          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                        </svg>
                        <span className="text-[10px] truncate" style={{ color: BLUE }}>{r.bookTitle}</span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
            {(reviews || []).length > 5 && (
              <div className="text-center text-[11px] text-ink-400 mt-1">还有 {(reviews || []).length - 5} 个 · 点击编辑查看</div>
            )}
          </div>
        </div>
      </div>

      {showChangeForm && (
        <Modal open onClose={() => { setShowChangeForm(false); setEditingChange(null); }} title={editingChange ? '编辑行动改变' : '新增行动改变'}>
          <ChangeForm
            initial={editingChange}
            books={books.length === 0 ? BOOKS : books}
            onSave={(data) => {
              if (editingChange && !editingChange.__isNew) onChangeUpdate?.(data);
              else onChangeAdd?.(data);
              setShowChangeForm(false);
              setEditingChange(null);
            }}
            onCancel={() => { setShowChangeForm(false); setEditingChange(null); }}
            onDelete={editingChange && !editingChange.__isNew ? () => { onChangeRemove?.(editingChange.id); setShowChangeForm(false); setEditingChange(null); } : undefined}
          />
        </Modal>
      )}

      {/* 改变编辑弹窗 */}
      {editingReview && (
        <Modal open onClose={() => setEditingReview(null)} title={editingReview.__isNew ? '新增改变' : '编辑改变'}>
          <ReviewForm
            initial={editingReview}
            books={books.length === 0 ? BOOKS : books}
            onSave={(data) => {
              // 新增改变没有 changeId，补一个 text/daysCompleted 兜底
              const final = { ...data };
              if (!final.text) final.text = '未命名改变';
              if (!final.daysCompleted) final.daysCompleted = 30;
              onReviewUpdate?.(final);
              setEditingReview(null);
            }}
            onCancel={() => setEditingReview(null)}
            onDelete={!editingReview.__isNew ? () => { onReviewRemove?.(editingReview.id); setEditingReview(null); } : undefined}
          />
        </Modal>
      )}

      {/* 读后思考 / 思后行动 · 选书面板 */}
      {bookPicker && (
        <BookPickerModal
          mode={bookPicker}
          books={books.length === 0 ? BOOKS : books}
          onPick={(b) => { const tab = bookPicker; setBookPicker(null); onBookEdit?.(b, tab); }}
          onAddNew={() => { setBookPicker(null); onBookAdd?.(); }}
          onClose={() => setBookPicker(null)}
        />
      )}

      {/* 微信读书 Key 设置弹窗（BookForm 风格） */}
      {showWereadSettings && (
        <Modal open onClose={() => setShowWereadSettings(false)} title="微信读书 · Key 设置"
          footer={
            <>
              <button onClick={() => setShowWereadSettings(false)}
                className="px-4 py-1.5 text-[13px] rounded-[10px] transition"
                style={{ background: 'rgba(15,23,42,0.04)', color: '#64748b' }}>取消</button>
              <button onClick={doWereadSave}
                className="px-5 py-1.5 text-[13px] text-white rounded-[10px] transition"
                style={{ background: BLUE, boxShadow: `0 2px 8px rgba(${S_RGB},0.21)` }}>保存</button>
            </>
          }>
          <div className="flex flex-col gap-3">
            <div className="text-[12px] text-ink-500 leading-relaxed px-1">
              前往 <a href="https://weread.qq.com/r/weread-skills" target="_blank" rel="noreferrer" style={{ color: BLUE }} className="underline">weread.qq.com/r/weread-skills</a> 申请 API Key（以 <span className="font-mono text-ink-700">wrk-</span> 开头），用于同步书架书籍及封面图。
            </div>
            <input
              value={wereadKey}
              onChange={(e) => setWereadKey(e.target.value)}
              placeholder="粘贴 API Key，如：wrk_xxxxxxxxxxxxxxxx"
              className="px-3 py-2 text-[13px] rounded-[10px] focus:outline-none font-mono transition"
              style={{ background: '#fff', border: '1px solid rgba(15,23,42,0.08)' }}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ---------- 9. 视图 · 能力 ---------- */
