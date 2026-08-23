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
    src: SRCS.includes(initial?.src) ? initial.src : SRCS[0],
    st: initial?.st || 'pending',
    pct: initial?.pct ?? 0,
    insights: initial?.insights || [],
    hasInsights: initial?.hasInsights ?? false,
    hasAction: initial?.hasAction ?? false,
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const insightCount = form.insights.filter(i => i.text?.trim()).length;
  const isDone = form.st === 'done';

  const syncHasInsights = (currentInsights) => {
    const hasValid = currentInsights.some(i => i.text?.trim());
    setForm(f => ({ ...f, hasInsights: hasValid }));
  };

  const addInsight = () => {
    setForm(f => {
      const next = { ...f, insights: [...f.insights, { id: Date.now() + Math.random(), text: '', resonance: 5 }] };
      return next;
    });
  };
  const updateInsight = (id, patch) => {
    setForm(f => {
      const next = { ...f, insights: f.insights.map(i => i.id === id ? { ...i, ...patch } : i) };
      if (patch.text !== undefined) syncHasInsights(next.insights);
      return next;
    });
  };
  const removeInsight = (id) => {
    setForm(f => {
      const next = { ...f, insights: f.insights.filter(i => i.id !== id) };
      syncHasInsights(next.insights);
      return next;
    });
  };

  const toggleInsights = () => set('hasInsights', !form.hasInsights);
  const toggleAction = () => set('hasAction', !form.hasAction);

  const setStatus = (stVal) => {
    const patch = { st: stVal };
    if (stVal === 'done') {
      patch.pct = 100;
      if (insightCount > 0) patch.hasInsights = true;
    } else if (stVal === 'pending') patch.pct = 0;
    else if (stVal === 'reading' && (Number(form.pct) || 0) <= 0) patch.pct = 1;
    setForm(f => ({ ...f, ...patch }));
  };
  const setPct = (p) => {
    const pNum = Math.min(100, Math.max(0, Number(p) || 0));
    const patch = { pct: pNum };
    if (pNum >= 100) patch.st = 'done';
    else if (pNum > 0 && form.st !== 'reading') patch.st = 'reading';
    else if (pNum === 0 && form.st !== 'pending') patch.st = 'pending';
    setForm(f => ({ ...f, ...patch }));
  };

  function submit() {
    if (!form.t.trim()) return alert('请输入书名');
    const cleanInsights = form.insights.filter(i => i.text && i.text.trim()).map(i => ({ ...i, text: i.text.trim() }));
    const hasInsights = form.hasInsights || cleanInsights.length > 0;
    onSaved?.({ ...form, t: form.t.trim(), insights: cleanInsights, hasInsights, hasAction: form.hasAction, id: initial?.id });
  }

  function del() {
    if (!isEdit) return;
    if (!confirm('确认删除这本书？')) return;
    onDelete?.(initial.id);
  }

  const resonanceColor = (r) => r >= 9 ? '#a855f7' : r >= 7 ? '#f59e0b' : '#94a3b8';
  const strongCount = form.insights.filter(i => i.text?.trim() && i.resonance >= 7).length;

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
            const col = s.v === 'reading' ? '#4b63f0' : s.v === 'done' ? '#22c55e' : '#64748b';
            return (
              <button key={s.v} type="button" onClick={() => setStatus(s.v)}
                style={{
                  flex: 1, padding: '7px 0', borderRadius: '9px',
                  fontSize: '13px', fontWeight: on ? '700' : '500',
                  background: on ? `${col}18` : 'rgba(120,120,128,0.08)',
                  color: on ? col : '#8e8e93',
                  border: on ? `1px solid ${col}40` : '1px solid transparent',
                  cursor: 'pointer', transition: 'all .15s',
                }}>{s.lb}</button>
            );
          })}
        </div>
      </div>
      <div>
        <label style={LABEL_STYLE}>阅读进度 ({form.pct}%)</label>
        <input className="form-input" type="range" min="0" max="100" step="1"
          value={form.pct} onChange={e => setPct(e.target.value)}
          style={{ width: '100%', accentColor: '#4b63f0' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
          {[0, 25, 50, 75, 100].map(v => (
            <span key={v} style={{
              fontSize: '10px', color: form.pct >= v ? '#4b63f0' : '#c7c7cc', fontWeight: 600,
            }}>{v}%</span>
          ))}
        </div>
      </div>

      {/* ===== 核心观点区 ===== */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <label style={LABEL_STYLE}>核心观点（{form.insights.length} 条 · 强共鸣 {strongCount} 条）</label>
          <button type="button" onClick={addInsight}
            style={{ fontSize: '12px', fontWeight: 600, color: '#4b63f0', background: 'rgba(75,99,240,0.08)', border: 'none', borderRadius: '6px', padding: '3px 10px', cursor: 'pointer' }}>
            + 新增观点
          </button>
        </div>
        {form.insights.length === 0 ? (
          <div style={{ padding: '12px', textAlign: 'center', fontSize: '12px', color: '#94a3b8', background: 'rgba(248,250,252,0.6)', borderRadius: '8px', border: '1px dashed rgba(148,163,184,0.3)' }}>
            还没有提取观点 — 这本书讲了什么值得记住？
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {form.insights.map((ins, idx) => {
              const col = resonanceColor(ins.resonance);
              return (
                <div key={ins.id} style={{
                  padding: '8px 10px', borderRadius: '8px',
                  background: `${col}08`,
                  border: `1px solid ${col}25`,
                  display: 'flex', flexDirection: 'column', gap: '6px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                    <span style={{ fontSize: '10px', fontWeight: 700, color: col, minWidth: '16px', paddingTop: '2px' }}>{idx + 1}.</span>
                    <textarea
                      value={ins.text}
                      onChange={e => updateInsight(ins.id, { text: e.target.value })}
                      placeholder="这条观点是什么？（如：要在自己能力圈里竞争）"
                      rows={1}
                      style={{
                        flex: 1, fontSize: '12.5px', lineHeight: '1.5', color: '#1c1c1e',
                        border: '1px solid rgba(15,23,42,0.08)', borderRadius: '6px',
                        padding: '4px 8px', resize: 'none', minHeight: '28px', outline: 'none',
                        background: '#fff',
                      }}
                    />
                    <button type="button" onClick={() => removeInsight(ins.id)}
                      style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', fontSize: '14px', padding: '2px 4px', lineHeight: 1 }}
                      title="删除此观点">×</button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: '22px' }}>
                    <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 500, flexShrink: 0 }}>共鸣</span>
                    <input type="range" min="1" max="10" step="1"
                      value={ins.resonance}
                      onChange={e => updateInsight(ins.id, { resonance: Number(e.target.value) })}
                      style={{ flex: 1, accentColor: col, height: '4px' }} />
                    <span style={{ fontSize: '11px', fontWeight: 700, color: col, minWidth: '18px', textAlign: 'right', tabularNums: true }}>{ins.resonance}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ===== 行动闭环区（仅已读完时显示） ===== */}
      {isDone && (
        <div style={{
          padding: '10px 12px', borderRadius: '10px',
          background: 'rgba(75,99,240,0.04)',
          border: '1px solid rgba(75,99,240,0.12)',
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#4b63f0', marginBottom: 8 }}>
            行动闭环（影响漏斗数据）
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.hasInsights}
                onChange={toggleInsights}
                style={{ width: 16, height: 16, accentColor: '#4b63f0' }}
              />
              <span style={{ fontSize: 13, color: '#1c1c1e', fontWeight: 500 }}>
                已输出核心洞察
              </span>
              <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 'auto' }}>
                {insightCount} 条观点
              </span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.hasAction}
                onChange={toggleAction}
                style={{ width: 16, height: 16, accentColor: '#a855f7' }}
              />
              <span style={{ fontSize: 13, color: '#1c1c1e', fontWeight: 500 }}>
                已转化为行动承诺
              </span>
              <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 'auto' }}>
                链接到「承诺本」
              </span>
            </label>
          </div>
        </div>
      )}

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
