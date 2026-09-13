import { useState, useMemo } from 'react';
import lunarLib from '../../vendor/lunar.js';

const BTN_GHOST = { padding: '6px 14px', borderRadius: '9px', fontSize: '13px', fontWeight: '600', background: 'rgba(120,120,128,0.12)', color: '#1c1c1e', border: 'none', cursor: 'pointer', transition: 'all .15s' };
const BTN_PRIMARY = { padding: '6px 14px', borderRadius: '9px', fontSize: '13px', fontWeight: '600', background: 'var(--m-life)', color: '#fff', border: 'none', cursor: 'pointer', transition: 'all .15s', boxShadow: '0 2px 8px rgba(var(--m-life-rgb),0.25)' };
const BTN_DANGER = { padding: '6px 14px', borderRadius: '9px', fontSize: '13px', fontWeight: '600', background: 'rgba(255,59,48,0.08)', color: '#FF3B30', border: 'none', cursor: 'pointer', transition: 'all .15s' };
const LABEL_STYLE = { fontSize: '12px', fontWeight: '600', color: 'var(--ink-600, #6b7280)', marginBottom: '4px', display: 'block' };
const INPUT_STYLE = { width: '100%', padding: '8px 12px', borderRadius: '9px', border: '1px solid rgba(120,120,128,0.2)', fontSize: '14px', outline: 'none', background: '#fff', transition: 'border .15s' };

/* 农历月日 → 今年公历 YYYY-MM-DD */
function lunarToDateStr(month, day) {
  try {
    const lunar = lunarLib.Lunar.fromYmd(new Date().getFullYear(), month, day);
    const solar = lunar.getSolar();
    return `${solar.getYear()}-${String(solar.getMonth()).padStart(2, '0')}-${String(solar.getDay()).padStart(2, '0')}`;
  } catch {
    return null;
  }
}

/* 公历月日 → YYYY-MM-DD */
function solarToDateStr(month, day) {
  return `${new Date().getFullYear()}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/* 从 schedules 行解析出表单初始值 */
function parseInitial(bd) {
  if (!bd) return null;
  const isLunar = bd.repeat_rule === 'lunar-yearly';
  const name = String(bd.title || '').replace(/^🎂/, '').replace(/生日$/, '').trim();
  const parts = String(bd.date || '').split('-');
  const mo = parts[1] ? parseInt(parts[1], 10) : 1;
  const day = parts[2] ? parseInt(parts[2], 10) : 1;
  return { id: bd.id, name, month: mo, day, isLunar };
}

export default function BirthdayForm({ initial, onSaved, onCancel, onDelete }) {
  const parsed = useMemo(() => parseInitial(initial), [initial]);
  const isEdit = !!(parsed && parsed.id);

  const [form, setForm] = useState(() => parsed || { name: '', month: new Date().getMonth() + 1, day: new Date().getDate(), isLunar: false });
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

    // 农历 → 公历日期；公历直拼
    let dateStr;
    if (form.isLunar) {
      dateStr = lunarToDateStr(mo, day);
      if (!dateStr) { setError('农历日期不合法，请检查月日'); return; }
    } else {
      dateStr = solarToDateStr(mo, day);
    }

    setSubmitting(true);
    try {
      await onSaved({
        id: parsed?.id,
        name,
        month: mo,
        day,
        isLunar: form.isLunar,
        date: dateStr,
        title: `🎂${name}生日`,
        category: 5,
        repeat_rule: form.isLunar ? 'lunar-yearly' : 'yearly',
      });
    } catch (err) {
      setError(err?.message || '保存失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-2">
      {/* 姓名 */}
      <div>
        <label style={LABEL_STYLE}>姓名</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder="如：溪客"
          autoFocus
          style={INPUT_STYLE}
        />
      </div>

      {/* 日期 */}
      <div>
        <label style={LABEL_STYLE}>生日日期</label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="1" max="12"
            value={form.month}
            onChange={(e) => set('month', e.target.value)}
            style={{ ...INPUT_STYLE, width: '70px', textAlign: 'center' }}
          />
          <span className="text-sm text-ink-500 font-semibold">月</span>
          <input
            type="number"
            min="1" max="31"
            value={form.day}
            onChange={(e) => set('day', e.target.value)}
            style={{ ...INPUT_STYLE, width: '70px', textAlign: 'center' }}
          />
          <span className="text-sm text-ink-500 font-semibold">日</span>
        </div>
      </div>

      {/* 历法 */}
      <div>
        <label style={LABEL_STYLE}>历法</label>
        <div className="flex gap-2">
          <button type="button"
            onClick={() => set('isLunar', false)}
            style={{
              ...BTN_GHOST,
              flex: 1,
              background: !form.isLunar ? 'var(--m-life)' : 'rgba(120,120,128,0.12)',
              color: !form.isLunar ? '#fff' : '#1c1c1e',
              boxShadow: !form.isLunar ? '0 2px 8px rgba(var(--m-life-rgb),0.25)' : 'none',
            }}>
            公历
          </button>
          <button type="button"
            onClick={() => set('isLunar', true)}
            style={{
              ...BTN_GHOST,
              flex: 1,
              background: form.isLunar ? 'var(--m-life)' : 'rgba(120,120,128,0.12)',
              color: form.isLunar ? '#fff' : '#1c1c1e',
              boxShadow: form.isLunar ? '0 2px 8px rgba(var(--m-life-rgb),0.25)' : 'none',
            }}>
            农历
          </button>
        </div>
      </div>

      {error && <div className="text-[12px] text-red-500 font-medium">{error}</div>}

      {/* 操作按钮 */}
      <div className="flex items-center gap-2 mt-1">
        {isEdit && (
          <button type="button"
            onClick={() => { if (confirm('确认删除此生日？')) onDelete?.(parsed); }}
            style={BTN_DANGER}>
            删除
          </button>
        )}
        <div className="flex-1" />
        <button type="button" onClick={onCancel} style={BTN_GHOST}>取消</button>
        <button type="submit" disabled={submitting}
          style={{ ...BTN_PRIMARY, opacity: submitting ? 0.6 : 1, cursor: submitting ? 'not-allowed' : 'pointer' }}>
          {submitting ? '保存中...' : isEdit ? '保存' : '创建'}
        </button>
      </div>
    </form>
  );
}
