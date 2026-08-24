import { useState, useEffect, useRef } from 'react';
import { API } from '../../api/client.js';
import { formatDuration, calcDurationMin } from '../../utils/date.js';
import FriendlyTimeInput from '../FriendlyTimeInput.jsx';
import { store } from '../../utils/store.js';
import { useToast } from '../../context/ToastContext.jsx';

// category: 1=工作, 2=能力, 3=常规, 5=生活
// 注意：category=4 为旧数据"习惯"保留值（initialCategory 会降级为 3），不用于新 UI
const CATEGORIES = [
  { v: 1, label: '工作',   dot: '#ff3b30', bg: '#ffe8e8', border: '#ff9999', text: '#ff3b30', textActive: '#1c1c1e' },
  { v: 2, label: '能力',   dot: '#ff9500', bg: '#fff4d8', border: '#ffd699', text: '#ff9500', textActive: '#1c1c1e' },
  { v: 3, label: '常规',   dot: '#8e8e93', bg: '#e5e5ea', border: '#c7c7cc', text: '#8e8e93', textActive: '#1c1c1e' },
  { v: 5, label: '生活',   dot: '#af52de', bg: '#f3e8ff', border: '#d8b3f0', text: '#af52de', textActive: '#1c1c1e' },
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

  // 双向自动计算（无条件重算，不依赖 duration_min 是否缺失）
  // ref 记录"由程序写入"的字段值，避免程序写入再次触发 effect 造成死循环
  const programmaticRef = useRef({ start: '', end: '', dur: '' });

  useEffect(() => {
    const start = form.start_time || '';
    const end = form.end_time || '';
    const durVal = form.duration_min;
    const dur = durVal === '' || durVal == null || Number.isNaN(Number(durVal)) ? null : Number(durVal);

    // 判断哪些字段是用户刚刚手动改的（程序写入的字段跳过）
    const startChangedByUser = start !== programmaticRef.current.start;
    const endChangedByUser = end !== programmaticRef.current.end;
    const durChangedByUser = String(durVal ?? '') !== String(programmaticRef.current.dur ?? '');

    let nextStart = start;
    let nextEnd = end;
    let nextDur = durVal;
    let wroteSomething = false;

    // 1) start 或 end 有改动（用户手动） => 无条件重算 duration_min
    if (start && end && (startChangedByUser || endChangedByUser)) {
      const d = calcDurationMin(start, end);
      if (d != null && String(d) !== String(durVal)) {
        nextDur = d;
        wroteSomething = true;
      }
    }

    // 2) start 或 duration 有改动（用户手动），且 end 未被用户手动单独改动 => 无条件重算 end_time
    if (start && dur != null && start && !endChangedByUser && (startChangedByUser || durChangedByUser)) {
      const [sh, sm] = start.split(':').map(Number);
      if (!Number.isNaN(sh) && !Number.isNaN(sm)) {
        const endMin = (sh * 60 + sm + dur) % 1440;
        const eh = String(Math.floor(endMin / 60)).padStart(2, '0');
        const em = String(endMin % 60).padStart(2, '0');
        const newEnd = `${eh}:${em}`;
        if (newEnd !== end) {
          nextEnd = newEnd;
          wroteSomething = true;
        }
      }
    }

    if (wroteSomething) {
      // 记录"即将由程序写入"的值，下次 effect 触发时识别出来避免死循环
      programmaticRef.current = { start: nextStart, end: nextEnd, dur: nextDur };
      if (nextDur !== durVal) setForm(f => ({ ...f, duration_min: nextDur }));
      if (nextEnd !== end) setForm(f => ({ ...f, end_time: nextEnd }));
    } else {
      // 纯用户输入，同步记录基线
      programmaticRef.current = { start, end, dur: durVal };
    }
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
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
