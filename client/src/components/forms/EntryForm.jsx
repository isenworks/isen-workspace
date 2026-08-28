import { useState } from 'react';
import { LABEL_STYLE, INPUT_STYLE } from '../../utils/uiConstants.js';

const BTN_GHOST = { padding: '6px 14px', borderRadius: '9px', fontSize: '13px', fontWeight: '600', background: 'rgba(120,120,128,0.12)', color: '#1c1c1e', border: 'none', cursor: 'pointer', transition: 'all .15s' };
const BTN_PRIMARY = { padding: '6px 14px', borderRadius: '9px', fontSize: '13px', fontWeight: '600', background: '#AF52DE', color: '#fff', border: 'none', cursor: 'pointer', transition: 'all .15s', boxShadow: '0 2px 8px rgba(175,82,222,0.25)' };
const BTN_DANGER = { padding: '6px 14px', borderRadius: '9px', fontSize: '13px', fontWeight: '600', background: 'rgba(255,59,48,0.08)', color: '#FF3B30', border: 'none', cursor: 'pointer', transition: 'all .15s' };

export default function EntryForm({ initial, categoryLabel, onSaved, onCancel, onDelete }) {
  const isEdit = !!(initial && initial.id);
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    t: initial?.t || '',
    n: initial?.n || '',
    d: initial?.d || today,
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  function submit() {
    if (!form.t.trim()) return alert('请输入标题');
    onSaved?.({ t: form.t.trim(), n: form.n, d: form.d, id: initial?.id, lifeKey: initial?.lifeKey, entryIdx: initial?.entryIdx });
  }

  function del() {
    if (!isEdit) return;
    if (!confirm('确认删除这条记录？')) return;
    onDelete?.({ lifeKey: initial.lifeKey, entryIdx: initial.entryIdx });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {categoryLabel && (
        <div style={{ fontSize: '12px', fontWeight: '600', color: '#AF52DE', background: 'rgba(175,82,222,0.1)', padding: '4px 10px', borderRadius: '8px', display: 'inline-block', letterSpacing: '0.03em' }}>
          {categoryLabel}
        </div>
      )}
      <div>
        <label style={LABEL_STYLE}>标题</label>
        <input className="form-input" style={INPUT_STYLE}
          value={form.t} onChange={e => set('t', e.target.value)}
          placeholder="例如：给妈妈打电话 30 分钟" autoFocus />
      </div>
      <div>
        <label style={LABEL_STYLE}>备注</label>
        <textarea className="form-input" style={{ ...INPUT_STYLE, minHeight: '60px', resize: 'vertical' }}
          value={form.n} onChange={e => set('n', e.target.value)}
          placeholder="记下让你印象深刻的细节..." />
      </div>
      <div>
        <label style={LABEL_STYLE}>日期</label>
        <input className="form-input" style={INPUT_STYLE} type="date"
          value={form.d} onChange={e => set('d', e.target.value)} />
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
