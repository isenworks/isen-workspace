import { useState } from 'react';
import { API } from '../../api/client.js';
import FriendlyTimeInput from '../FriendlyTimeInput.jsx';
import { GROWTH_TYPE_COLORS, inferGrowthType, LABEL_STYLE, INPUT_STYLE } from '../../utils/uiConstants.js';
import { store } from '../../utils/store.js';
import { useToast } from '../../context/ToastContext.jsx';

const TARGET_UNITS = ['次', '杯', '毫升', '分钟', '小时', '米', '页'];
const STREAK_PRESETS = [
  { label: '永远', value: null },
  { label: '7天', value: 7 },
  { label: '21天', value: 21 },
  { label: '30天', value: 30 },
  { label: '100天', value: 100 },
  { label: '365天', value: 365 },
];

function SectionDivider() {
  return <div style={{ height: '1px', background: 'rgba(60,60,67,0.12)', margin: '6px 0' }} />;
}

function PillChip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '5px 13px',
        borderRadius: '14px',
        border: active ? '1px solid #007AFF' : '1px solid #d1d1d6',
        background: active ? '#007AFF' : 'transparent',
        color: active ? '#fff' : '#1c1c1e',
        fontSize: '12px',
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'all .15s',
        whiteSpace: 'nowrap',
      }}
    >{children}</button>
  );
}

export default function HabitForm({ initial, onSaved, onCancel }) {
  const toast = useToast();
  const isEdit = !!(initial && initial.id);

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
    accent_color: initial?.accent_color || '#34C759',
    growth_type: inferInitialType(initial),
    target_mode: initial?.target_mode || 'check',
    target_value: initial?.target_value || '',
    target_unit: initial?.target_unit || '',
    streak_goal: initial?.streak_goal !== undefined && initial?.streak_goal !== null ? String(initial.streak_goal) : '',
    auto_log: initial?.auto_log !== undefined ? (initial.auto_log === 1 || initial.auto_log === true) : true,
  });
  const [busy, setBusy] = useState(false);
  const [showTarget, setShowTarget] = useState(!!(initial?.target_mode === 'count' || initial?.target_value));
  const [showStreak, setShowStreak] = useState(!!(initial?.streak_goal !== undefined && initial?.streak_goal !== null));

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
        duration_min,
        target_mode: form.target_mode,
        target_value: form.target_mode === 'count' ? (form.target_value || null) : null,
        target_unit: form.target_mode === 'count' ? (form.target_unit && form.target_unit !== '自定义' ? form.target_unit : null) : null,
        streak_goal: form.streak_goal ? Number(form.streak_goal) : null,
        auto_log: form.target_mode === 'count' ? form.auto_log : true,
      };
      if (isEdit) await API.habits.update(initial.id, payload);
      else await API.habits.create(payload);
      store.broadcast({ type: 'reload' });
      onSaved?.();
    } catch (e) { toast.error(e.message); }
    setBusy(false);
  }

  const sectionHeaderStyle = {
    display: 'flex', alignItems: 'center', gap: '6px',
    fontSize: '12px', fontWeight: 600, color: '#8e8e93',
    cursor: 'pointer', userSelect: 'none',
    textTransform: 'uppercase', letterSpacing: '0.03em',
  };

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
          设置结束时间后时长会自动计算，也可手动覆盖
        </div>
      )}

      {/* ===== 目标设置 ===== */}
      <SectionDivider />
      <div style={sectionHeaderStyle} onClick={() => setShowTarget(v => !v)}>
        <span style={{ fontSize: '13px' }}>{showTarget ? '▾' : '▸'}</span>
        目标设置
        <span style={{ fontSize: '10px', color: '#c7c7cc', fontWeight: 400, textTransform: 'none' }}>非必填</span>
      </div>
      {showTarget && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingLeft: '2px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <PillChip active={form.target_mode === 'check'} onClick={() => set('target_mode', 'check')}>
              当天完成打卡
            </PillChip>
            <PillChip active={form.target_mode === 'count'} onClick={() => set('target_mode', 'count')}>
              当天完成一定量
            </PillChip>
          </div>
          {form.target_mode === 'count' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '13px', color: '#8e8e93' }}>每天完成</span>
                <input
                  className="form-input"
                  type="number"
                  min="1"
                  value={form.target_value}
                  onChange={e => set('target_value', e.target.value)}
                  placeholder="数量"
                  style={{ ...INPUT_STYLE, width: '72px', textAlign: 'center' }}
                />
                <select
                  className="form-input"
                  value={TARGET_UNITS.includes(form.target_unit) ? form.target_unit : (form.target_unit ? '自定义' : '')}
                  onChange={e => {
                    if (e.target.value === '自定义') {
                      set('target_unit', '自定义');
                    } else {
                      set('target_unit', e.target.value);
                    }
                  }}
                  style={{ ...INPUT_STYLE, width: 'auto', paddingRight: '28px' }}
                >
                  <option value="">单位</option>
                  {TARGET_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  <option value="自定义">自定义</option>
                </select>
                {!TARGET_UNITS.includes(form.target_unit) && form.target_unit !== '' && form.target_unit !== '自定义' && (
                  <span style={{ fontSize: '12px', color: '#8e8e93' }}>({form.target_unit})</span>
                )}
              </div>
              {form.target_unit === '自定义' && (
                <input
                  className="form-input"
                  value=""
                  onChange={e => set('target_unit', e.target.value)}
                  placeholder="输入自定义单位名称"
                  style={{ ...INPUT_STYLE, width: '160px' }}
                />
              )}
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: '#1c1c1e' }}>
                <input
                  type="checkbox"
                  checked={form.auto_log}
                  onChange={e => set('auto_log', e.target.checked)}
                  style={{ width: '16px', height: '16px', accentColor: '#007AFF' }}
                />
                打卡时自动弹出日志记录
              </label>
            </>
          )}
        </div>
      )}

      {/* ===== 坚持目标 ===== */}
      <SectionDivider />
      <div style={sectionHeaderStyle} onClick={() => setShowStreak(v => !v)}>
        <span style={{ fontSize: '13px' }}>{showStreak ? '▾' : '▸'}</span>
        坚持目标
        <span style={{ fontSize: '10px', color: '#c7c7cc', fontWeight: 400, textTransform: 'none' }}>默认永远</span>
      </div>
      {showStreak && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingLeft: '2px' }}>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {STREAK_PRESETS.map(s => {
              const isActive = form.streak_goal
                ? String(s.value) === form.streak_goal
                : s.value === null;
              return (
                <PillChip
                  key={s.label}
                  active={isActive}
                  onClick={() => set('streak_goal', s.value === null ? '' : String(s.value))}
                >{s.label}</PillChip>
              );
            })}
            <PillChip
              active={form.streak_goal && !STREAK_PRESETS.some(s => String(s.value) === form.streak_goal)}
              onClick={() => set('streak_goal', form.streak_goal || '60')}
            >自定义</PillChip>
          </div>
          {form.streak_goal && !STREAK_PRESETS.some(s => String(s.value) === form.streak_goal) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13px', color: '#8e8e93' }}>坚持</span>
              <input
                className="form-input"
                type="number"
                min="1"
                value={form.streak_goal}
                onChange={e => set('streak_goal', e.target.value)}
                style={{ ...INPUT_STYLE, width: '72px', textAlign: 'center' }}
              />
              <span style={{ fontSize: '13px', color: '#8e8e93' }}>天</span>
            </div>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel}
          style={{ padding: '7px 14px', borderRadius: '9px', background: 'rgba(120,120,128,0.12)', border: 'none', color: '#1c1c1e', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>取消</button>
        <button onClick={submit} disabled={busy}
          style={{ padding: '7px 14px', borderRadius: '9px', background: '#007AFF', border: 'none', color: '#fff', fontSize: '13px', fontWeight: '600', cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.5 : 1 }}>
          {busy ? (isEdit ? '保存中...' : '添加中...') : (isEdit ? '保存' : '添加')}
        </button>
      </div>
    </div>
  );
}
