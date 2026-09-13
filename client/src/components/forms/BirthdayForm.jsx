import { useState, useMemo } from 'react';
import lunarLib from '../../vendor/lunar.js';

/* ============================================================
 * 生日表单 · 复用日历 ScheduleForm 的字段结构与视觉规范
 *   - 生日本质是"每年重复"事项 → 重复控件复用 ScheduleForm 分段按钮
 *   - 重复选项仅 每年(公历) / 农历每年，写入 repeat_rule
 * ============================================================ */

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
  padding: '6px 14px', borderRadius: '9px', fontSize: '13px', fontWeight: '600',
  background: 'rgba(120,120,128,0.12)', color: '#1c1c1e', border: 'none', cursor: 'pointer', transition: 'all .15s'
};
const BTN_PRIMARY = {
  padding: '6px 14px', borderRadius: '9px', fontSize: '13px', fontWeight: '600',
  background: 'var(--m-life)', color: '#fff', border: 'none', cursor: 'pointer', transition: 'all .15s',
  boxShadow: '0 2px 8px rgba(var(--m-life-rgb),0.25)'
};
const BTN_DANGER = {
  padding: '6px 14px', borderRadius: '9px', fontSize: '13px', fontWeight: '600',
  background: 'rgba(255,59,48,0.08)', color: '#FF3B30', border: 'none', cursor: 'pointer', transition: 'all .15s'
};

/* 生日重复选项：复用 ScheduleForm REPEAT_OPTS 中的年重复两档 */
const REPEAT_OPTS = [
  { v: 'yearly', label: '每年' },
  { v: 'lunar-yearly', label: '农历每年' },
];

/* 农历月日 → 指定公历年 YYYY-MM-DD */
function lunarToDateStr(year, month, day) {
  try {
    const lunar = lunarLib.Lunar.fromYmd(year, month, day);
    const solar = lunar.getSolar();
    return `${solar.getYear()}-${String(solar.getMonth()).padStart(2, '0')}-${String(solar.getDay()).padStart(2, '0')}`;
  } catch {
    return null;
  }
}

/* 公历月日 → 指定年 YYYY-MM-DD */
function solarToDateStr(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/* 从 schedules 行解析出表单初始值 */
function parseInitial(bd) {
  if (!bd) return null;
  const name = String(bd.title || '').replace(/^🎂/, '').replace(/生日$/, '').trim();
  const parts = String(bd.date || '').split('-');
  const mo = parts[1] ? parseInt(parts[1], 10) : 1;
  const day = parts[2] ? parseInt(parts[2], 10) : 1;
  return {
    id: bd.id,
    name,
    month: mo,
    day,
    repeat_rule: bd.repeat_rule === 'lunar-yearly' ? 'lunar-yearly' : 'yearly',
  };
}

export default function BirthdayForm({ initial, onSaved, onCancel, onDelete }) {
  const parsed = useMemo(() => parseInitial(initial), [initial]);
  const isEdit = !!(parsed && parsed.id);

  const [form, setForm] = useState(() => parsed || {
    name: '', month: new Date().getMonth() + 1, day: new Date().getDate(), repeat_rule: 'yearly',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const name = form.name.trim();
    if (!name) { setError('请输入姓名'); return; }
    const mo = Number(form.month);
    const day = Number(form.day);
    if (!mo || mo < 1 || mo > 12) { setError('月份不合法'); return; }
    if (!day || day < 1 || day > 31) { setError('日期不合法'); return; }

    // 农历生日：月日按农历解释，转公历落地；公历直拼
    const year = new Date().getFullYear();
    let dateStr;
    if (form.repeat_rule === 'lunar-yearly') {
      dateStr = lunarToDateStr(year, mo, day);
      if (!dateStr) { setError('农历日期不合法，请检查月日'); return; }
    } else {
      dateStr = solarToDateStr(year, mo, day);
    }

    setSubmitting(true);
    try {
      await onSaved({
        id: parsed?.id,
        name,
        month: mo,
        day,
        date: dateStr,
        title: `🎂${name}生日`,
        category: 5,
        repeat_rule: form.repeat_rule,
      });
    } catch (err) {
      setError(err?.message || '保存失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* 姓名 */}
      <div>
        <label style={LABEL_STYLE}>姓名</label>
        <input
          className="form-input"
          type="text"
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder="如：溪客"
          autoFocus
          style={{ ...INPUT_STYLE, fontWeight: '500' }}
        />
      </div>

      {/* 生日日期（年不重要，只取月/日） */}
      <div>
        <label style={LABEL_STYLE}>生日日期</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            className="form-input"
            type="number" min="1" max="12"
            value={form.month}
            onChange={(e) => set('month', e.target.value)}
            style={{ ...INPUT_STYLE, width: '80px', textAlign: 'center' }}
          />
          <span style={{ fontSize: '13px', fontWeight: '600', color: '#636366' }}>月</span>
          <input
            className="form-input"
            type="number" min="1" max="31"
            value={form.day}
            onChange={(e) => set('day', e.target.value)}
            style={{ ...INPUT_STYLE, width: '80px', textAlign: 'center' }}
          />
          <span style={{ fontSize: '13px', fontWeight: '600', color: '#636366' }}>日</span>
        </div>
      </div>

      {/* 重复 · 复用 ScheduleForm 分段按钮样式（生日仅年重复两档） */}
      <div>
        <label style={LABEL_STYLE}>重复</label>
        <div style={{ display: 'flex', gap: '6px' }}>
          {REPEAT_OPTS.map(o => {
            const on = form.repeat_rule === o.v;
            return (
              <button
                key={o.v}
                type="button"
                onClick={() => set('repeat_rule', o.v)}
                style={{
                  flex: 1,
                  padding: '7px 0',
                  borderRadius: '9px',
                  fontSize: '12.5px',
                  fontWeight: '600',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all .15s',
                  background: on ? 'var(--m-life)' : 'rgba(120,120,128,0.12)',
                  color: on ? '#fff' : '#1c1c1e',
                  boxShadow: on ? '0 2px 6px rgba(var(--m-life-rgb),0.3)' : 'none'
                }}
              >{o.label}</button>
            );
          })}
        </div>
        <div style={{
          fontSize: '11px', color: '#8e8e93', marginTop: '7px',
          display: 'flex', alignItems: 'center', gap: '4px'
        }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <polyline points="23 4 23 10 17 10"></polyline>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
          </svg>
          {form.repeat_rule === 'lunar-yearly'
            ? '按农历日期每年重复，闰年自动对应'
            : '按公历日期每年重复'}
        </div>
      </div>

      {error && <div style={{ fontSize: '12px', color: '#FF3B30', fontWeight: 500 }}>{error}</div>}

      {/* 操作按钮 · 与 ScheduleForm 同构（左删除 / 右取消+保存） */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', paddingTop: '8px' }}>
        <div>
          {isEdit && (
            <button type="button"
              onClick={() => { if (confirm('确定删除这条生日吗？删除后不可恢复。')) onDelete?.(parsed); }}
              style={BTN_DANGER}>
              删除
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button type="button" onClick={onCancel} style={BTN_GHOST}>取消</button>
          <button type="submit" disabled={submitting}
            style={{ ...BTN_PRIMARY, opacity: submitting ? 0.5 : 1, cursor: submitting ? 'not-allowed' : 'pointer' }}>
            {submitting ? '保存中...' : isEdit ? '保存' : '创建'}
          </button>
        </div>
      </div>
    </form>
  );
}
