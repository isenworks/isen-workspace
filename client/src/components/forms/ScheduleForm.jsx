import { useState, useEffect, useRef } from 'react';
import { API } from '../../api/client.js';
import { formatDuration } from '../../utils/date.js';
import FriendlyTimeInput from '../FriendlyTimeInput.jsx';
import { store } from '../../utils/store.js';
import { useToast } from '../../context/ToastContext.jsx';

// category: 1=重要紧急, 2=重要不紧急, 3=常规
const CATEGORIES = [
  { v: 1, label: '重要紧急', dot: '#ff3b30', bg: '#ffe8e8', border: '#ff9999', text: '#ff3b30', textActive: '#1c1c1e' },
  { v: 2, label: '重要不紧急', dot: '#ff9500', bg: '#fff4d8', border: '#ffd699', text: '#ff9500', textActive: '#1c1c1e' },
  { v: 3, label: '常规',     dot: '#8e8e93', bg: '#f2f2f7', border: '#c7c7cc', text: '#8e8e93', textActive: '#1c1c1e' },
];

function initialCategory(initial) {
  if (initial && initial.category) {
    const c = Number(initial.category);
    if (c === 4) return 3; // 旧数据的"习惯"类型降级为常规
    return c;
  }
  if (initial?.is_key) {
    const st = initial.start_time;
    if (st) {
      const h = Number(st.split(':')[0]);
      if (h <= 12) return 1;
    }
    return 2;
  }
  return 3;
}

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

export default function ScheduleForm({ initial, defaultDate, onSaved, onCancel }) {
  const toast = useToast();
  const [form, setForm] = useState({
    title: initial?.title || '',
    date: initial?.date || defaultDate,
    start_time: initial?.start_time || '',
    end_time: initial?.end_time || '',
    duration_min: initial?.duration_min || '',
    category: initialCategory(initial),
    is_key: initial?.is_key ? 1 : 0,
  });
  const [busy, setBusy] = useState(false);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  // 双向自动计算（ref 记录上一次输入，避免 React 异步 state 误判）
  const lastStartRef = useRef('');
  const lastEndRef = useRef('');
  const lastDurRef = useRef('');

  useEffect(() => {
    const start = form.start_time || '';
    const end = form.end_time || '';
    const dur = form.duration_min;

    // 1) start + end 已填，duration 缺失且用户未手动改 duration => 自动填 duration
    if (start && end) {
      const durEmpty = dur === '' || dur == null || Number.isNaN(Number(dur));
      if (durEmpty && (start !== lastStartRef.current || end !== lastEndRef.current)) {
        const [sh, sm] = start.split(':').map(Number);
        const [eh, em] = end.split(':').map(Number);
        let d = (eh * 60 + em) - (sh * 60 + sm);
        if (d <= 0) d += 1440;
        set('duration_min', d);
      }
    }
    // 2) start + duration 已填，end 缺失且用户未手动改 end => 自动填 end
    if (start && dur !== '' && dur != null && !Number.isNaN(Number(dur)) && !end) {
      if (start !== lastStartRef.current || String(dur) !== String(lastDurRef.current)) {
        const [sh, sm] = start.split(':').map(Number);
        const endMin = (sh * 60 + sm + Number(dur)) % 1440;
        const eh = String(Math.floor(endMin / 60)).padStart(2, '0');
        const em = String(endMin % 60).padStart(2, '0');
        set('end_time', `${eh}:${em}`);
      }
    }

    lastStartRef.current = start;
    lastEndRef.current = end;
    lastDurRef.current = dur;
  }, [form.start_time, form.end_time, form.duration_min]);

  function autoDuration() {
    // 保留旧接口，空实现（useEffect 已经处理）
  }

  async function submit() {
    if (!form.title.trim()) return toast.warn('请输入标题');
    if (!form.date) return toast.warn('请选择日期');
    setBusy(true);
    try {
      const cat = Number(form.category);
      const payload = {
        title: form.title.trim(),
        date: form.date,
        start_time: form.start_time || null,
        end_time: form.end_time || null,
        duration_min: form.duration_min ? Number(form.duration_min) : null,
        category: cat,
        is_key: (cat === 1 || cat === 2) ? 1 : 0,
      };
      if (initial?.id) await API.schedules.update(initial.id, payload);
      else await API.schedules.create(payload);
      store.broadcast({ type: 'reload' });
      onSaved?.();
    } catch (e) { toast.error(e.message); }
    setBusy(false);
  }

  async function remove() {
    if (!initial?.id) return;
    if (!confirm('确认删除该日程？')) return;
    try {
      await API.schedules.remove(initial.id);
      onSaved?.();
    } catch (e) { toast.error(e.message); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div>
        <label style={LABEL_STYLE}>标题</label>
        <input
          className="form-input"
          style={{
            ...INPUT_STYLE,
            border: '1px solid #d1d1d6',
            fontSize: '14px',
            fontWeight: '500',
            background: '#ffffff'
          }}
          value={form.title}
          onChange={e => set('title', e.target.value)}
          placeholder="例如：简历项目经历撰写"
          autoFocus
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
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
          <label style={LABEL_STYLE}>开始</label>
          <FriendlyTimeInput
            value={form.start_time}
            onChange={v => set('start_time', v)}
            placeholder="几点开始？"
          />
        </div>
        <div>
          <label style={LABEL_STYLE}>结束</label>
          <FriendlyTimeInput
            value={form.end_time}
            onChange={v => set('end_time', v)}
            placeholder="几点结束？"
          />
        </div>
      </div>

      <div>
        <label style={LABEL_STYLE}>时长（分钟）</label>
        <input
          className="form-input"
          style={{ ...INPUT_STYLE, width: '50%', minWidth: '160px' }}
          type="number"
          value={form.duration_min}
          onChange={e => set('duration_min', e.target.value)}
          placeholder="可留空"
        />
        {form.duration_min && (
          <span style={{ fontSize: '11px', color: '#8e8e93', marginTop: '4px', marginLeft: '10px', display: 'inline-block' }}>
            {formatDuration(Number(form.duration_min))}
          </span>
        )}
      </div>

      <div>
        <label style={LABEL_STYLE}>类型</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
          {CATEGORIES.map(c => {
            const active = Number(form.category) === c.v;
            return (
              <button
                key={c.v}
                type="button"
                onClick={() => set('category', c.v)}
                style={{
                  padding: '10px 0',
                  borderRadius: '9px',
                  fontSize: '13px',
                  fontWeight: active ? '600' : '500',
                  background: active ? c.bg : '#ffffff',
                  color: active ? c.textActive : '#8e8e93',
                  border: active ? `1.5px solid ${c.border}` : '1px solid #d1d1d6',
                  cursor: 'pointer',
                  transition: 'all .15s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  whiteSpace: 'nowrap'
                }}
              >
                <span style={{
                  display: 'inline-block',
                  width: '8px', height: '8px',
                  borderRadius: '2px',
                  background: active ? c.dot : '#c7c7cc',
                  flexShrink: 0
                }}></span>
                {c.label}
              </button>
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
                color: '#ff3b30',
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
