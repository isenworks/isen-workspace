import { useState } from 'react';
import { API } from '../../api/client.js';
import FriendlyTimeInput from '../FriendlyTimeInput.jsx';
import { store } from '../../utils/store.js';
import { useToast } from '../../context/ToastContext.jsx';

const PRIORITY = [
  { v: 1, label: '高', active: { background: '#FFEEED', color: '#FF3B30' }, inactive: { background: 'rgba(120,120,128,0.08)', color: '#8e8e93' } },
  { v: 2, label: '中', active: { background: '#fff4d8', color: '#FF9500' }, inactive: { background: 'rgba(120,120,128,0.08)', color: '#8e8e93' } },
  { v: 3, label: '低', active: { background: '#e5f6ea', color: '#34C759' }, inactive: { background: 'rgba(120,120,128,0.08)', color: '#8e8e93' } }
];

const INPUT_STYLE = {
  width: '100%',
  padding: '8px 12px',
  border: '1px solid #d1d1d6',
  borderRadius: '9px',
  fontSize: '14px',
  color: '#1c1c1e',
  background: '#ffffff',
  outline: 'none',
  transition: 'all .15s',
  boxSizing: 'border-box'
};

const LABEL_STYLE = {
  display: 'block',
  fontSize: '11px',
  fontWeight: '600',
  color: '#8e8e93',
  marginBottom: '5px',
  textTransform: 'uppercase',
  letterSpacing: '0.03em'
};

const BTN_GHOST = {
  padding: '6px 14px',
  borderRadius: '9px',
  fontSize: '13px',
  fontWeight: '600',
  background: 'rgba(120,120,128,0.12)',
  color: '#1c1c1e',
  border: 'none',
  cursor: 'pointer',
  transition: 'all .15s'
};

const BTN_PRIMARY = {
  padding: '6px 14px',
  borderRadius: '9px',
  fontSize: '13px',
  fontWeight: '600',
  background: '#007AFF',
  color: '#fff',
  border: 'none',
  cursor: 'pointer',
  transition: 'all .15s',
  boxShadow: '0 3px 8px rgba(0,122,255,0.25)'
};

export default function TaskForm({ initial, defaultDate, onSaved, onCancel }) {
  const toast = useToast();
  const [form, setForm] = useState({
    title: initial?.title || '',
    date: initial?.date || defaultDate,
    priority: initial?.priority ?? 2,
    due_time: initial?.due_time || ''
  });
  const [busy, setBusy] = useState(false);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function submit() {
    if (!form.title.trim()) return toast.warn('请输入任务标题');
    if (!form.date) return toast.warn('请选择日期');
    setBusy(true);
    try {
      const payload = {
        title: form.title.trim(),
        date: form.date,
        priority: Number(form.priority),
        due_time: form.due_time || null
      };
      if (initial?.id) await API.tasks.update(initial.id, payload);
      else await API.tasks.create(payload);
      store.broadcast({ type: 'reload' });
      onSaved?.();
    } catch (e) { toast.error(e.message); }
    setBusy(false);
  }

  async function remove() {
    if (!initial?.id) return;
    if (!confirm('确认删除该任务？')) return;
    try {
      await API.tasks.remove(initial.id);
      store.broadcast({ type: 'reload' });
      onSaved?.();
    } catch (e) { toast.error(e.message); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div>
        <label style={LABEL_STYLE}>任务标题</label>
        <input
          className="form-input"
          style={{
            ...INPUT_STYLE,
            fontSize: '14px',
            fontWeight: '500'
          }}
          value={form.title}
          onChange={e => set('title', e.target.value)}
          placeholder="例如：投递 3 家数据岗位"
          autoFocus
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div>
          <label style={LABEL_STYLE}>日期</label>
          <input
            className="form-input"
            style={INPUT_STYLE}
            type="date"
            value={form.date}
            onChange={e => set('date', e.target.value)}
          />
        </div>
        <div>
          <label style={LABEL_STYLE}>截止时间</label>
          <FriendlyTimeInput
            value={form.due_time}
            onChange={v => set('due_time', v)}
            placeholder="截止时间"
          />
        </div>
      </div>

      <div>
        <label style={LABEL_STYLE}>优先级</label>
        <div style={{ display: 'flex', gap: '8px' }}>
          {PRIORITY.map(p => {
            const isActive = Number(form.priority) === p.v;
            const sty = isActive ? p.active : p.inactive;
            return (
              <button
                key={p.v}
                onClick={() => set('priority', p.v)}
                style={{
                  flex: 1,
                  padding: '8px 0',
                  borderRadius: '9px',
                  fontSize: '13px',
                  fontWeight: isActive ? '600' : '500',
                  background: sty.background,
                  color: sty.color,
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all .15s'
                }}
              >{p.label}</button>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', paddingTop: '8px' }}>
        <div>
          {initial?.id && (
            <button
              onClick={remove}
              style={{
                ...BTN_GHOST,
                color: '#FF3B30',
                background: 'rgba(255,59,48,0.08)'
              }}
            >删除</button>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={onCancel} style={BTN_GHOST}>取消</button>
          <button
            onClick={submit}
            disabled={busy}
            style={{
              ...BTN_PRIMARY,
              opacity: busy ? 0.5 : 1,
              cursor: busy ? 'not-allowed' : 'pointer'
            }}
          >
            {busy ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
