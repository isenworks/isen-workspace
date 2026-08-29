import { useState } from 'react';

/* KR 新增/编辑弹窗 —— 复选框语义（勾/未勾二态）+ dueBy 字段，视觉对齐 AbilityForm/BookForm */
const AB = '#FF9500';
const AB_DARK = '#E67E22';
const INK = '#1c1c1e';
const CARD_BG = 'rgba(15,23,42,0.03)';
const CARD_BORDER = 'rgba(15,23,42,0.08)';
const CARD_RADIUS = 14;

const INPUT_BASE = {
  fontSize: '12px', background: '#fff', color: INK,
  border: `1px solid ${CARD_BORDER}`, borderRadius: '10px',
  padding: '5px 8px', outline: 'none', width: '100%',
  fontWeight: 500,
};

function SectionCard({ title, children }) {
  return (
    <div style={{ padding: '10px 12px', background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: CARD_RADIUS }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '7px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 700, color: AB_DARK, letterSpacing: '0.06em' }}>
          <div style={{ width: '3px', height: '11px', borderRadius: '2px', background: AB_DARK }} />
          {title}
        </div>
      </div>
      {children}
    </div>
  );
}

function FieldRow({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
      <span style={{ fontSize: '10.5px', fontWeight: 600, color: INK, opacity: 0.55 }}>{label}</span>
      {children}
    </div>
  );
}

export default function MilestoneForm({ initial, onSaved, onCancel, onDelete }) {
  const isEdit = !!(initial && initial.id);
  const [form, setForm] = useState({
      lb: initial?.lb || '',
      startDate: initial?.startDate || '',
      dueBy: initial?.dueBy || '',
      st: initial?.st === 'done' ? 'done' : 'pending',
    });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  function submit() {
    if (!form.lb.trim()) return alert('请输入 KR 标题');
    onSaved?.({
      ...form,
      lb: form.lb.trim(),
      pct: form.st === 'done' ? 100 : 0,
      id: initial?.id,
      abilityIdx: initial?.abilityIdx,
      msIdx: initial?.msIdx,
    });
  }

  function del() {
    if (!isEdit) return;
    if (!confirm('确认删除这条 KR？')) return;
    onDelete?.({ abilityIdx: initial.abilityIdx, msIdx: initial.msIdx });
  }

  const isDone = form.st === 'done';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {/* Section 1: KR 内容 */}
      <SectionCard title="KR 内容">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <FieldRow label="KR 标题">
              <input style={{ ...INPUT_BASE, fontWeight: 600 }}
                value={form.lb} onChange={e => set('lb', e.target.value)}
                placeholder="例如：阶段一：单表查询基础（Day1-Day5）" autoFocus />
            </FieldRow>
            <FieldRow label="开始日期（选填）">
              <input type="date" style={INPUT_BASE}
                value={form.startDate} onChange={e => set('startDate', e.target.value)} />
            </FieldRow>
            <FieldRow label="截止日期（可选）">
              <input type="date" style={INPUT_BASE}
                value={form.dueBy} onChange={e => set('dueBy', e.target.value)} />
            </FieldRow>
        </div>
      </SectionCard>

      {/* Section 2: 完成状态（复选框语义，与卡片一致） */}
      <SectionCard title="完成状态">
        <button
          type="button"
          onClick={() => set('st', isDone ? 'pending' : 'done')}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '7px 10px', borderRadius: '10px',
            background: '#fff', border: `1px solid ${CARD_BORDER}`,
            cursor: 'pointer', width: '100%', textAlign: 'left',
          }}
        >
          <span style={{
            width: '16px', height: '16px', borderRadius: '999px',
            display: 'grid', placeItems: 'center', flexShrink: 0,
            background: isDone ? AB : '#fff',
            border: `1.5px solid ${AB}`,
          }}>
            {isDone && (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7"/></svg>
            )}
          </span>
          <span style={{ fontSize: '12px', fontWeight: 600, color: isDone ? '#94a3b8' : INK, textDecoration: isDone ? 'line-through' : 'none' }}>
            {form.lb.trim() || '这条 KR'}
          </span>
        </button>
      </SectionCard>

      {/* 底部按钮 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', paddingTop: '4px' }}>
        <div>{isEdit && (
          <button onClick={del} style={{
            padding: '6px 14px', borderRadius: '9px', fontSize: '13px', fontWeight: 600,
            background: 'rgba(255,59,48,0.08)', color: '#FF3B30', border: 'none', cursor: 'pointer',
          }}>删除</button>
        )}</div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={onCancel} style={{
            padding: '6px 14px', borderRadius: '9px', fontSize: '13px', fontWeight: 600,
            background: 'rgba(120,120,128,0.12)', color: INK, border: 'none', cursor: 'pointer',
          }}>取消</button>
          <button onClick={submit} style={{
            padding: '6px 14px', borderRadius: '9px', fontSize: '13px', fontWeight: 600,
            background: AB, color: '#fff', border: 'none', cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(255,149,0,0.25)',
          }}>{isEdit ? '保存' : '添加'}</button>
        </div>
      </div>
    </div>
  );
}
