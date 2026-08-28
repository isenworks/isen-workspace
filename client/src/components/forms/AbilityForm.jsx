import { useState } from 'react';

/* 能力新增/编辑弹窗 —— 视觉规格对齐 BookForm（SectionCard 分组 + 圆角输入 + 橙色主题） */
const AB = '#FF9500';          // 主题橙
const AB_DARK = '#E67E22';     // 深橙（文字）
const INK = '#1c1c1e';
const INK_MUTE = '#64748b';
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

export default function AbilityForm({ initial, onSaved, onCancel, onDelete }) {
  const isEdit = !!(initial && initial.id);
  const [form, setForm] = useState({
    title: initial?.title || '',
    daily: initial?.daily || '',
    createdAt: initial?.createdAt || new Date().toISOString().slice(0, 10),
    deadline: initial?.deadline || '',
    score: initial?.score || '5',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  function submit() {
    if (!form.title.trim()) return alert('请输入能力名称');
    onSaved?.({
      ...form,
      title: form.title.trim(),
      daily: form.daily.trim(),
      id: initial?.id,
      mstones: initial?.mstones || [],  // 编辑时保留已有 KR
    });
  }

  function del() {
    if (!isEdit) return;
    if (!confirm('确认删除这个能力？其下所有 KR 也会删除')) return;
    onDelete?.(initial.id);
  }

  const inputStyle = { ...INPUT_BASE };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {/* Section 1: 能力信息 */}
      <SectionCard title="能力信息">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
          <FieldRow label="能力名称">
            <input style={{ ...inputStyle, fontWeight: 600 }}
              value={form.title} onChange={e => set('title', e.target.value)}
              placeholder="例如：英语口语 / 数据分析" autoFocus />
          </FieldRow>
          <FieldRow label="每日行动（可选）">
            <input style={inputStyle}
              value={form.daily} onChange={e => set('daily', e.target.value)}
              placeholder="例如：每日 30min Shadowing" />
          </FieldRow>
        </div>
      </SectionCard>

      {/* Section 2: 时间范围 */}
      <SectionCard title="时间范围">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <FieldRow label="开始日期">
            <input type="date" style={inputStyle}
              value={form.createdAt} onChange={e => set('createdAt', e.target.value)} />
          </FieldRow>
          <FieldRow label="截止日期（可选）">
            <input type="date" style={inputStyle}
              value={form.deadline} onChange={e => set('deadline', e.target.value)} />
          </FieldRow>
        </div>
      </SectionCard>

      {/* Section 3: 初始自评（可选） */}
      <SectionCard title="初始自评（可选）">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input type="range" min="1" max="10" step="1"
            value={form.score} onChange={e => set('score', e.target.value)}
            style={{ flex: 1, accentColor: AB }} />
          <span style={{ fontSize: '13px', fontWeight: 700, color: AB_DARK, minWidth: '32px', textAlign: 'right' }}>
            {form.score}/10
          </span>
        </div>
      </SectionCard>

      {/* 底部按钮 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', paddingTop: '4px' }}>
        <div>{isEdit && (
          <button onClick={del} style={{
            padding: '6px 14px', borderRadius: '9px', fontSize: '13px', fontWeight: 600,
            background: 'rgba(239,68,68,0.08)', color: '#FF3B30', border: 'none', cursor: 'pointer',
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
            boxShadow: `0 2px 8px rgba(245,158,11,0.25)`,
          }}>{isEdit ? '保存' : '添加'}</button>
        </div>
      </div>
    </div>
  );
}
