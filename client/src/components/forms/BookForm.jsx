import { useState } from 'react';
import { LABEL_STYLE, INPUT_STYLE } from '../../utils/uiConstants.js';

const BTN_GHOST = {
  padding: '6px 14px', borderRadius: '9px', fontSize: '13px', fontWeight: '600',
  background: 'rgba(120,120,128,0.12)', color: '#1c1c1e', border: 'none', cursor: 'pointer', transition: 'all .15s',
};
const BTN_PRIMARY = {
  padding: '6px 14px', borderRadius: '9px', fontSize: '13px', fontWeight: '600',
  background: '#4b63f0', color: '#fff', border: 'none', cursor: 'pointer', transition: 'all .15s',
  boxShadow: '0 2px 8px rgba(75,99,240,0.25)',
};
const BTN_DANGER = {
  padding: '6px 14px', borderRadius: '9px', fontSize: '13px', fontWeight: '600',
  background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: 'none', cursor: 'pointer', transition: 'all .15s',
};

const STATUSES = [
  { v: 'reading', lb: '阅读中' },
  { v: 'pending',  lb: '未开始' },
  { v: 'done',     lb: '已读完' },
];
const CATS = ['商业', '心理学', '哲学', '科技', '传记', '文学', '其他'];
const SRCS = ['纸质书', '电子书', '有声书', '网络'];

export default function BookForm({ initial, onSaved, onCancel, onDelete }) {
  const isEdit = !!(initial && initial.id);
  const [form, setForm] = useState({
    t: initial?.t || '',
    author: initial?.author || '',
    cat: initial?.cat || CATS[0],
    src: initial?.src || SRCS[0],
    st: initial?.st || 'pending',
    pct: initial?.pct ?? 0,
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  function submit() {
    if (!form.t.trim()) return alert('请输入书名');
    const pctVal = form.st === 'done' ? 100 : Math.min(100, Math.max(0, Number(form.pct) || 0));
    onSaved?.({ ...form, t: form.t.trim(), pct: pctVal, id: initial?.id });
  }

  function del() {
    if (!isEdit) return;
    if (!confirm('确认删除这本书？')) return;
    onDelete?.(initial.id);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div>
        <label style={LABEL_STYLE}>书名</label>
        <input className="form-input" style={INPUT_STYLE}
          value={form.t} onChange={e => set('t', e.target.value)}
          placeholder="例如：穷查理宝典" autoFocus />
      </div>
      <div>
        <label style={LABEL_STYLE}>作者</label>
        <input className="form-input" style={INPUT_STYLE}
          value={form.author} onChange={e => set('author', e.target.value)}
          placeholder="作者名" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div>
          <label style={LABEL_STYLE}>分类</label>
          <select className="form-input" style={INPUT_STYLE}
            value={form.cat} onChange={e => set('cat', e.target.value)}>
            {CATS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label style={LABEL_STYLE}>来源</label>
          <select className="form-input" style={INPUT_STYLE}
            value={form.src} onChange={e => set('src', e.target.value)}>
            {SRCS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label style={LABEL_STYLE}>阅读状态</label>
        <div style={{ display: 'flex', gap: '8px' }}>
          {STATUSES.map(s => {
            const on = form.st === s.v;
            return (
              <button key={s.v} type="button" onClick={() => set('st', s.v)}
                style={{
                  flex: 1, padding: '7px 0', borderRadius: '9px',
                  fontSize: '13px', fontWeight: on ? '600' : '500',
                  background: on ? '#e0ecff' : 'rgba(120,120,128,0.08)',
                  color: on ? '#4b63f0' : '#8e8e93',
                  border: 'none', cursor: 'pointer', transition: 'all .15s',
                }}>{s.lb}</button>
            );
          })}
        </div>
      </div>
      <div>
        <label style={LABEL_STYLE}>阅读进度 ({form.pct}%)</label>
        <input className="form-input" type="range" min="0" max="100" step="5"
          value={form.pct} onChange={e => set('pct', Number(e.target.value))}
          style={{ width: '100%', accentColor: '#4b63f0' }} />
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
