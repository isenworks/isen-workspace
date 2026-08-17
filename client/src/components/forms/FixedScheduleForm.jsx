import { useState } from 'react';
import { API } from '../../api/client.js';
import { store } from '../../utils/store.js';
import { useToast } from '../../context/ToastContext.jsx';
import FriendlyTimeInput from '../FriendlyTimeInput.jsx';
import { calcDurationMin, formatDuration } from '../../utils/date.js';

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
  background: '#007aff',
  color: '#fff',
  border: 'none',
  cursor: 'pointer',
  transition: 'all .15s',
  boxShadow: '0 3px 8px rgba(0,122,255,0.25)'
};

const EMOJI_PRESETS = ['📌', '🍚', '🍱', '😴', '☕️', '🌙', '🚶', '🧘', '💪', '📖', '💧', '🍎'];

export default function FixedScheduleForm({ initial, onSaved, onCancel }) {
  const toast = useToast();
  const [form, setForm] = useState({
    name: initial?.name || '',
    emoji: initial?.emoji || '📌',
    start_time: initial?.start_time || '',
    end_time: initial?.end_time || '',
  });
  const [busy, setBusy] = useState(false);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  const durMin = calcDurationMin(form.start_time, form.end_time);

  async function submit() {
    if (!form.name.trim()) return toast.warn('请输入日程名称');
    if (!form.start_time) return toast.warn('请选择开始时间');
    if (!form.end_time) return toast.warn('请选择结束时间');
    if (durMin == null || durMin <= 0) return toast.warn('结束时间必须晚于开始时间');

    setBusy(true);
    try {
      const payload = {
        name: form.name.trim(),
        emoji: form.emoji || '📌',
        startTime: form.start_time,
        endTime: form.end_time,
        sortOrder: initial?.sort_order || 0,
      };
      if (initial?.id) await API.fixedSchedules.update(initial.id, payload);
      else await API.fixedSchedules.create(payload);
      store.broadcast({ type: 'reload' });
      onSaved?.();
    } catch (e) { toast.error(e.message); }
    setBusy(false);
  }

  async function remove() {
    if (!initial?.id) return;
    if (!confirm('确认删除该固定日程？')) return;
    setBusy(true);
    try {
      await API.fixedSchedules.remove(initial.id);
      store.broadcast({ type: 'reload' });
      onSaved?.();
    } catch (e) { toast.error(e.message); }
    setBusy(false);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* 提示说明 */}
      <div style={{
        padding: '10px 12px',
        background: 'rgba(0,122,255,0.06)',
        borderRadius: '9px',
        border: '1px solid rgba(0,122,255,0.12)',
        fontSize: '12px',
        color: '#1c1c1e',
        lineHeight: '1.5',
      }}>
        <span style={{ fontWeight: '600', color: '#007aff' }}>📌 固定日程</span>
        <span style={{ color: '#6c6c70' }}> · 每天重复显示在时间线，仅作提醒，不可打卡，不进入重点/习惯事项</span>
      </div>

      <div>
        <label style={LABEL_STYLE}>日程名称</label>
        <input
          className="form-input"
          style={{ ...INPUT_STYLE, fontWeight: '500' }}
          value={form.name}
          onChange={e => set('name', e.target.value)}
          placeholder="例如：吃午饭"
          autoFocus
        />
      </div>

      <div>
        <label style={LABEL_STYLE}>图标</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {EMOJI_PRESETS.map(em => {
            const active = form.emoji === em;
            return (
              <button
                key={em}
                type="button"
                onClick={() => set('emoji', em)}
                style={{
                  width: '34px', height: '34px',
                  borderRadius: '8px',
                  fontSize: '18px',
                  background: active ? 'rgba(0,122,255,0.1)' : '#fff',
                  border: active ? '1.5px solid #007aff' : '1px solid #d1d1d6',
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all .15s',
                }}
              >{em}</button>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div>
          <label style={LABEL_STYLE}>开始时间</label>
          <FriendlyTimeInput
            value={form.start_time}
            onChange={v => set('start_time', v)}
            placeholder="几点开始？"
          />
        </div>
        <div>
          <label style={LABEL_STYLE}>结束时间</label>
          <FriendlyTimeInput
            value={form.end_time}
            onChange={v => set('end_time', v)}
            placeholder="几点结束？"
          />
        </div>
      </div>

      {durMin != null && durMin > 0 && (
        <div style={{ fontSize: '12px', color: '#8e8e93' }}>
          时长：<span style={{ color: '#007aff', fontWeight: '600' }}>{formatDuration(durMin)}</span>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', paddingTop: '8px' }}>
        <div>
          {initial?.id && (
            <button
              onClick={remove}
              disabled={busy}
              style={{
                ...BTN_GHOST,
                color: '#ff3b30',
                background: 'rgba(255,59,48,0.08)',
                opacity: busy ? 0.5 : 1,
                cursor: busy ? 'not-allowed' : 'pointer',
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
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            {busy ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
