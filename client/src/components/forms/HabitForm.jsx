import { useState } from 'react';
import { API } from '../../api/client.js';
import FriendlyTimeInput from '../FriendlyTimeInput.jsx';
import { GROWTH_TYPE_COLORS, inferGrowthType, LABEL_STYLE, INPUT_STYLE } from '../../utils/uiConstants.js';
import { store } from '../../utils/store.js';
import { useToast } from '../../context/ToastContext.jsx';

export default function HabitForm({ initial, onSaved, onCancel }) {
  const toast = useToast();
  const isEdit = !!(initial && initial.id);

  // 兼容历史：若 initial 有 growth_type 则优先，否则根据名称/emoji 推断
  function inferInitialType(h) {
    if (h?.growth_type && h.growth_type !== 'energy') return h.growth_type;
    return inferGrowthType(h || {});
  }

  const [form, setForm] = useState({
    name: initial?.name || '',
    emoji: initial?.emoji || '✅',
    start_time: initial?.start_time || initial?.target_time || '',
    end_time: initial?.end_time || '',
    duration_min: initial?.duration_min || '',
    accent_color: initial?.accent_color || '#34c759',
    growth_type: inferInitialType(initial),
  });
  const [busy, setBusy] = useState(false);

  const set = (k, v) => {
    setForm(prev => {
      const next = { ...prev, [k]: v };
      if (k === 'start_time' || k === 'end_time') {
        if (next.start_time && next.end_time) {
          const [h1, m1] = next.start_time.split(':').map(Number);
          const [h2, m2] = next.end_time.split(':').map(Number);
          const diff = (h2 * 60 + m2) - (h1 * 60 + m1);
          if (diff > 0) next.duration_min = String(diff);
        }
      }
      if (k === 'growth_type' && GROWTH_TYPE_COLORS[v]) {
        next.accent_color = GROWTH_TYPE_COLORS[v];
      }
      return next;
    });
  };

  async function submit() {
    if (!form.name.trim()) return toast.warn('请输入习惯名称');
    setBusy(true);
    try {
      let duration_min = form.duration_min ? Number(form.duration_min) : null;
      if (!duration_min && form.start_time && form.end_time) {
        const [h1, m1] = form.start_time.split(':').map(Number);
        const [h2, m2] = form.end_time.split(':').map(Number);
        const diff = (h2 * 60 + m2) - (h1 * 60 + m1);
        if (diff > 0) duration_min = diff;
      }
      const payload = {
        name: form.name.trim(),
        emoji: form.emoji || '✅',
        accent_color: form.accent_color,
        growth_type: form.growth_type,
        start_time: form.start_time || null,
        end_time: form.end_time || null,
        target_time: form.start_time || null,
        duration_min
      };
      if (isEdit) await API.habits.update(initial.id, payload);
      else await API.habits.create(payload);
      store.broadcast({ type: 'reload' });
      onSaved?.();
    } catch (e) { toast.error(e.message); }
    setBusy(false);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'flex', gap: '10px' }}>
        <div>
          <label style={LABEL_STYLE}>图标</label>
          <input
            className="form-input"
            value={form.emoji} maxLength={2}
            onChange={e => set('emoji', e.target.value)}
            style={{ ...INPUT_STYLE, width: '56px', textAlign: 'center', fontSize: '18px' }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={LABEL_STYLE}>习惯名称</label>
          <input
            className="form-input"
            value={form.name}
            onChange={e => set('name', e.target.value)}
            placeholder="习惯名称"
            style={INPUT_STYLE}
            autoFocus
          />
        </div>
      </div>
      <div>
        <label style={LABEL_STYLE}>分类色</label>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {Object.entries(GROWTH_TYPE_COLORS).map(([key, color]) => (
            <button
              key={key}
              type="button"
              onClick={() => set('growth_type', key)}
              style={{
                width: '22px',
                height: '22px',
                borderRadius: '50%',
                border: form.growth_type === key ? '2px solid #1c1c1e' : '2px solid #e5e5ea',
                background: color,
                padding: 0,
                cursor: 'pointer',
                outline: 'none',
                transition: 'transform .15s, border-color .15s',
                transform: form.growth_type === key ? 'scale(1.15)' : 'scale(1)',
                boxShadow: form.growth_type === key ? '0 0 0 2px rgba(0,0,0,0.06)' : 'none'
              }}
            />
          ))}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
        <div>
          <label style={LABEL_STYLE}>开始时间</label>
          <FriendlyTimeInput
            value={form.start_time}
            onChange={v => set('start_time', v)}
            placeholder="HH:00"
          />
        </div>
        <div>
          <label style={LABEL_STYLE}>结束时间</label>
          <FriendlyTimeInput
            value={form.end_time}
            onChange={v => set('end_time', v)}
            placeholder="HH:00"
          />
        </div>
        <div>
          <label style={LABEL_STYLE}>时长（分钟）</label>
          <input className="form-input" type="number" value={form.duration_min} placeholder="可留空"
            onChange={e => set('duration_min', e.target.value)}
            style={INPUT_STYLE} />
        </div>
      </div>
      {form.start_time && form.end_time && (
        <div style={{ fontSize: '11px', color: '#8e8e93', marginTop: '-4px' }}>
          💡 设置结束时间后时长会自动计算，也可手动覆盖
        </div>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel}
          style={{ padding: '7px 14px', borderRadius: '9px', background: 'rgba(120,120,128,0.12)', border: 'none', color: '#1c1c1e', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>取消</button>
        <button onClick={submit} disabled={busy}
          style={{ padding: '7px 14px', borderRadius: '9px', background: '#007aff', border: 'none', color: '#fff', fontSize: '13px', fontWeight: '600', cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.5 : 1 }}>
          {busy ? (isEdit ? '保存中...' : '添加中...') : (isEdit ? '保存' : '添加')}
        </button>
      </div>
    </div>
  );
}
