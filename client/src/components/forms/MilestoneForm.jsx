import { useState } from 'react';
import { LABEL_STYLE, INPUT_STYLE } from '../../utils/uiConstants.js';

const BTN_GHOST = { padding: '6px 14px', borderRadius: '9px', fontSize: '13px', fontWeight: '600', background: 'rgba(120,120,128,0.12)', color: '#1c1c1e', border: 'none', cursor: 'pointer', transition: 'all .15s' };
const BTN_PRIMARY = { padding: '6px 14px', borderRadius: '9px', fontSize: '13px', fontWeight: '600', background: '#f59e0b', color: '#fff', border: 'none', cursor: 'pointer', transition: 'all .15s', boxShadow: '0 2px 8px rgba(245,158,11,0.25)' };
const BTN_DANGER = { padding: '6px 14px', borderRadius: '9px', fontSize: '13px', fontWeight: '600', background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: 'none', cursor: 'pointer', transition: 'all .15s' };

const STATUSES = [
  { v: 'done',    lb: '已完成' },
  { v: 'doing',   lb: '进行中' },
  { v: 'pending', lb: '待启动' },
];

export default function MilestoneForm({ initial, onSaved, onCancel, onDelete }) {
  const isEdit = !!(initial && initial.id);
  const [form, setForm] = useState({
    lb: initial?.lb || '',
    st: initial?.st || 'pending',
    pct: initial?.pct ?? 0,
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  function submit() {
    if (!form.lb.trim()) return alert('请输入里程碑标题');
    const pctVal = form.st === 'done' ? 100 : Math.min(100, Math.max(0, Number(form.pct) || 0));
    onSaved?.({ ...form, lb: form.lb.trim(), pct: pctVal, id: initial?.id, abilityIdx: initial?.abilityIdx, msIdx: initial?.msIdx });
  }

  function del() {
    if (!isEdit) return;
    if (!confirm('确认删除这个里程碑？')) return;
    onDelete?.({ abilityIdx: initial.abilityIdx, msIdx: initial.msIdx });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div>
        <label style={LABEL_STYLE}>里程碑标题</label>
        <input className="form-input" style={INPUT_STYLE}
          value={form.lb} onChange={e => set('lb', e.target.value)}
          placeholder="例如：能流利对话 15 分钟" autoFocus />
      </div>
      <div>
        <label style={LABEL_STYLE}>状态</label>
        <div style={{ display: 'flex', gap: '8px' }}>
          {STATUSES.map(s => {
            const on = form.st === s.v;
            return (
              <button key={s.v} type="button" onClick={() => set('st', s.v)}
                style={{
                  flex: 1, padding: '7px 0', borderRadius: '9px',
                  fontSize: '13px', fontWeight: on ? '600' : '500',
                  background: on ? '#fbf3d8' : 'rgba(120,120,128,0.08)',
                  color: on ? '#f59e0b' : '#8e8e93',
                  border: 'none', cursor: 'pointer', transition: 'all .15s',
                }}>{s.lb}</button>
            );
          })}
        </div>
      </div>
      <div>
        <label style={LABEL_STYLE}>完成进度 ({form.pct}%)</label>
        <input className="form-input" type="range" min="0" max="100" step="5"
          value={form.pct} onChange={e => set('pct', Number(e.target.value))}
          style={{ width: '100%', accentColor: '#f59e0b' }} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', paddingTop: '4px' }}>
        <div>{isEdit && <button onClick={del} style={BTN_DANGER}>删除</button>}</div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={onCancel} style={BTN_GHOST}>取消</button>
          <button onClick={submit} style={BTN_PRIMARY}>{isEdit ? '保存' : '添加'}</button>
        </div>
      </div>
    </div>
  );
}
