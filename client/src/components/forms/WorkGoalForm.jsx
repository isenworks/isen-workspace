import { useState } from 'react';

/* 工作 Objective 新增/编辑弹窗 —— 视觉对齐 AbilityForm/BookForm（iOS Red 主题 SectionCard） */
const RED = '#FF3B30';
const RED_DARK = '#E6352B';
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 700, color: RED_DARK, letterSpacing: '0.06em' }}>
          <div style={{ width: '3px', height: '11px', borderRadius: '2px', background: RED_DARK }} />
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

const MODES = [
  { v: 'funnel',    lb: '漏斗（漏斗转化率 · 链路型）' },
  { v: 'dashboard', lb: '仪表盘（多 KPI 并列量化）' },
  { v: 'milestone', lb: '里程碑门（门控阶段通过）' },
  { v: 'balance',   lb: '平衡雷达（多维度平衡）' },
];

export default function WorkGoalForm({ initial, onSaved, onCancel, onDelete }) {
  const isEdit = !!(initial && initial.id);
  const [form, setForm] = useState({
    title: initial?.title || '',
    core: initial?.core !== undefined ? !!initial.core : true,
    label: initial?.label || '',
    mode: MODES.some(m => m.v === initial?.mode) ? initial.mode : 'funnel',
    createdAt: initial?.createdAt || new Date().toISOString().slice(0, 10),
    deadline: initial?.deadline || '',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  function submit() {
    if (!form.title.trim()) return alert('请输入目标标题');
    onSaved?.({
      ...form,
      title: form.title.trim(),
      label: form.label?.trim() || (form.core ? '主业' : '副业'),
      id: initial?.id,
      krs: initial?.krs || [],          // 编辑时保留
      completedAt: initial?.completedAt, // 编辑时保留
    });
  }

  function del() {
    if (!isEdit) return;
    const n = initial?.krs?.length || 0;
    if (!confirm(`确认删除这个目标？其下 ${n} 条 KR 也会删除`)) return;
    onDelete?.(initial.id);
  }

  const inputStyle = { ...INPUT_BASE };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <SectionCard title="目标信息">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
          <FieldRow label="O·目标标题">
            <input style={{ ...inputStyle, fontWeight: 600 }}
              value={form.title} onChange={e => set('title', e.target.value)}
              placeholder="例如：用户运营 offer，薪资 ≥ 20k" autoFocus />
          </FieldRow>
          <FieldRow label="分组">
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {[
                { v: true,  lb: '主业', c: RED },
                { v: false, lb: '副业', c: '#FF9500' },
              ].map(x => {
                const on = form.core === x.v;
                return (
                  <button type="button" key={String(x.v)} onClick={() => { set('core', x.v); if (!form.label?.trim()) set('label', x.lb); }}
                    style={{
                      padding: '5px 12px', borderRadius: '9px', fontSize: '12px', fontWeight: 600,
                      border: `1px solid ${on ? x.c : CARD_BORDER}`,
                      background: on ? `${x.c}15` : '#fff',
                      color: on ? x.c : INK,
                      cursor: 'pointer', transition: 'all .15s',
                    }}>
                    <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '999px', marginRight: '6px', verticalAlign: 'middle', background: on ? x.c : 'rgba(120,120,128,0.4)' }} />
                    {x.lb}
                  </button>
                );
              })}
            </div>
          </FieldRow>
          <FieldRow label="分组别名（可选）">
            <input style={inputStyle}
              value={form.label} onChange={e => set('label', e.target.value)}
              placeholder="留空则自动为「主业 / 副业」" />
          </FieldRow>
        </div>
      </SectionCard>

      <SectionCard title="范式与进度">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
          <FieldRow label="推进范式">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              {MODES.map(m => {
                const on = form.mode === m.v;
                return (
                  <button type="button" key={m.v} onClick={() => set('mode', m.v)}
                    style={{
                      padding: '7px 9px', borderRadius: '10px', fontSize: '11px', fontWeight: 600,
                      border: `1px solid ${on ? RED : CARD_BORDER}`,
                      background: on ? `${RED}12` : '#fff',
                      color: on ? RED_DARK : INK,
                      textAlign: 'left', cursor: 'pointer', transition: 'all .15s',
                    }}>{m.lb}</button>
                );
              })}
            </div>
          </FieldRow>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <FieldRow label="开始日期">
              <input type="date" style={inputStyle}
                value={form.createdAt} onChange={e => set('createdAt', e.target.value)} />
            </FieldRow>
            <FieldRow label="截止日期">
              <input type="date" style={inputStyle}
                value={form.deadline} onChange={e => set('deadline', e.target.value)} />
            </FieldRow>
          </div>
        </div>
      </SectionCard>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', paddingTop: '4px' }}>
        <div>{isEdit && (
          <button onClick={del} style={{
            padding: '6px 14px', borderRadius: '9px', fontSize: '13px', fontWeight: 600,
            background: 'rgba(255,59,48,0.08)', color: RED, border: 'none', cursor: 'pointer',
          }}>删除</button>
        )}</div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={onCancel} style={{
            padding: '6px 14px', borderRadius: '9px', fontSize: '13px', fontWeight: 600,
            background: 'rgba(120,120,128,0.12)', color: INK, border: 'none', cursor: 'pointer',
          }}>取消</button>
          <button onClick={submit} style={{
            padding: '6px 14px', borderRadius: '9px', fontSize: '13px', fontWeight: 600,
            background: RED, color: '#fff', border: 'none', cursor: 'pointer',
            boxShadow: `0 2px 8px rgba(255,59,48,0.25)`,
          }}>{isEdit ? '保存' : '添加'}</button>
        </div>
      </div>
    </div>
  );
}
