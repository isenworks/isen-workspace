import { useState } from 'react';
import { LABEL_STYLE, INPUT_STYLE } from '../../utils/uiConstants.js';

const BTN_GHOST = {
  padding: '5px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: '600',
  background: 'rgba(120,120,128,0.12)', color: '#1c1c1e', border: 'none', cursor: 'pointer', transition: 'all .15s',
};
const BTN_PRIMARY = {
  padding: '5px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: '600',
  background: '#4b63f0', color: '#fff', border: 'none', cursor: 'pointer', transition: 'all .15s',
  boxShadow: '0 2px 8px rgba(75,99,240,0.25)',
};
const BTN_DANGER = {
  padding: '5px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: '600',
  background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: 'none', cursor: 'pointer', transition: 'all .15s',
};

const STATUSES = [
  { v: 'reading', lb: '阅读中' },
  { v: 'pending',  lb: '未开始' },
  { v: 'done',     lb: '已读完' },
];
const CATS = ['认知成长', '人际沟通', '商业职场', '人文叙事'];
const SRCS = ['纸质书', '电子书', '有声书', '网络'];

export default function BookForm({ initial, onSaved, onCancel, onDelete }) {
  const isEdit = !!(initial && initial.id);
  const [form, setForm] = useState({
    t: initial?.t || '',
    author: initial?.author || '',
    cat: CATS.includes(initial?.cat) ? initial.cat : CATS[0],
    src: SRCS.includes(initial?.src) ? initial.src : SRCS[0],
    st: initial?.st || 'pending',
    pct: initial?.pct ?? 0,
    // 电子书链接/文件
    ebookUrl: initial?.ebookUrl || '',
    // 阅读起止时间
    startDate: initial?.startDate || '',
    endDate: initial?.endDate || '',
    // 读后思考：{ id, text: 核心触动, scene: 应用场景, resonance }
    insights: (initial?.insights && initial.insights.length)
      ? initial.insights.map(i => ({ ...i, scene: i.scene || '', resonance: i.resonance ?? 5 }))
      : [],
    // 思后行动：{ id, text, done }
    actions: (initial?.actions && initial.actions.length)
      ? initial.actions.map(a => ({ ...a, done: !!a.done }))
      : [],
    hasInsights: initial?.hasInsights ?? false,
    hasAction: initial?.hasAction ?? false,
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const validInsights = form.insights.filter(i => i.text?.trim() && i.scene?.trim());
  const validActions = form.actions.filter(a => a.text?.trim());
  const insightCount = validInsights.length;
  const actionCount = validActions.length;

  const syncFlags = (patch = {}) => {
    setForm(f => {
      const next = { ...f, ...patch };
      const vi = next.insights.some(i => i.text?.trim() && i.scene?.trim());
      const va = next.actions.some(a => a.text?.trim());
      return { ...next, hasInsights: vi, hasAction: va };
    });
  };

  // ===== 读后思考（核心触动 + 应用场景） =====
  const addInsight = () => {
    const id = Date.now() + Math.random();
    set('insights', [...form.insights, { id, text: '', scene: '', resonance: 5 }]);
  };
  const updateInsight = (id, patch) => {
    const nextArr = form.insights.map(i => i.id === id ? { ...i, ...patch } : i);
    syncFlags({ insights: nextArr });
  };
  const removeInsight = (id) => {
    const nextArr = form.insights.filter(i => i.id !== id);
    syncFlags({ insights: nextArr });
  };

  // ===== 思后行动 =====
  const addAction = () => {
    const id = Date.now() + Math.random();
    set('actions', [...form.actions, { id, text: '', done: false }]);
  };
  const updateAction = (id, patch) => {
    const nextArr = form.actions.map(a => a.id === id ? { ...a, ...patch } : a);
    syncFlags({ actions: nextArr });
  };
  const removeAction = (id) => {
    const nextArr = form.actions.filter(a => a.id !== id);
    syncFlags({ actions: nextArr });
  };

  const setStatus = (stVal) => {
    const patch = { st: stVal };
    if (stVal === 'done') {
      patch.pct = 100;
      // 已读完如果没填结束日期，自动填今天
      if (!form.endDate) patch.endDate = new Date().toISOString().slice(0, 10);
    } else if (stVal === 'pending') {
      patch.pct = 0;
    } else if (stVal === 'reading' && (Number(form.pct) || 0) <= 0) {
      patch.pct = 1;
      if (!form.startDate) patch.startDate = new Date().toISOString().slice(0, 10);
    }
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
    const cleanInsights = form.insights
      .filter(i => i.text?.trim() && i.scene?.trim())
      .map(i => ({ ...i, text: i.text.trim(), scene: i.scene.trim() }));
    const cleanActions = form.actions
      .filter(a => a.text?.trim())
      .map(a => ({ ...a, text: a.text.trim(), done: !!a.done }));
    const hasInsights = cleanInsights.length > 0;
    const hasAction = cleanActions.length > 0;
    onSaved?.({
      ...form,
      t: form.t.trim(),
      author: form.author.trim(),
      ebookUrl: form.ebookUrl.trim(),
      insights: cleanInsights,
      actions: cleanActions,
      // 兼容旧 action 字段
      action: cleanActions.find(a => !a.done)?.text || cleanActions[0]?.text || '',
      hasInsights,
      hasAction,
      id: initial?.id,
    });
  }

  function del() {
    if (!isEdit) return;
    if (!confirm('确认删除这本书？')) return;
    onDelete?.(initial.id);
  }

  const resonanceColor = (r) => r >= 9 ? '#a855f7' : r >= 7 ? '#f59e0b' : '#94a3b8';
  const isEbook = form.src === '电子书';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* 书名 / 作者 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: '10px' }}>
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
      </div>

      {/* 分类 / 来源 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
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

      {/* 电子书链接（仅电子书显示） */}
      {isEbook && (
        <div>
          <label style={LABEL_STYLE}>电子书链接 / 文件地址</label>
          <input className="form-input" style={INPUT_STYLE}
            value={form.ebookUrl} onChange={e => set('ebookUrl', e.target.value)}
            placeholder="https:// 或 file:// 或本地路径，保存后卡片直接点击打开" />
        </div>
      )}

      {/* 阅读起止时间 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <div>
          <label style={LABEL_STYLE}>开始阅读</label>
          <input type="date" className="form-input" style={INPUT_STYLE}
            value={form.startDate} onChange={e => set('startDate', e.target.value)} />
        </div>
        <div>
          <label style={LABEL_STYLE}>结束阅读</label>
          <input type="date" className="form-input" style={INPUT_STYLE}
            value={form.endDate} onChange={e => set('endDate', e.target.value)} />
        </div>
      </div>

      {/* 阅读状态 */}
      <div>
        <label style={LABEL_STYLE}>阅读状态</label>
        <div style={{ display: 'flex', gap: '8px' }}>
          {STATUSES.map(s => {
            const on = form.st === s.v;
            const col = s.v === 'reading' ? '#4b63f0' : s.v === 'done' ? '#22c55e' : '#64748b';
            return (
              <button key={s.v} type="button" onClick={() => setStatus(s.v)}
                style={{
                  flex: 1, padding: '6px 0', borderRadius: '8px',
                  fontSize: '12px', fontWeight: on ? '700' : '500',
                  background: on ? `${col}18` : 'rgba(120,120,128,0.08)',
                  color: on ? col : '#8e8e93',
                  border: on ? `1px solid ${col}40` : '1px solid transparent',
                  cursor: 'pointer', transition: 'all .15s',
                }}>{s.lb}</button>
            );
          })}
        </div>
      </div>

      {/* 进度条（紧凑版） */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
          <label style={{ ...LABEL_STYLE, margin: 0 }}>阅读进度</label>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#4b63f0', tabularNums: true }}>{form.pct}%</span>
        </div>
        <input type="range" min="0" max="100" step="1"
          value={form.pct} onChange={e => setPct(e.target.value)}
          style={{ width: '100%', accentColor: '#4b63f0', margin: 0 }} />
      </div>

      {/* ===== 读后思考：核心触动 + 应用场景（至少1组，自动勾选漏斗复选框）===== */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
          <label style={{ ...LABEL_STYLE, margin: 0 }}>
            读后思考 · 核心触动 + 应用场景
            <span style={{ fontSize: '10.5px', color: insightCount > 0 ? '#22c55e' : '#94a3b8', fontWeight: 600, marginLeft: '6px' }}>
              {insightCount > 0 ? `✓ 已完成 ${insightCount} 组` : '至少填写1组后自动勾选'}
            </span>
          </label>
          <button type="button" onClick={addInsight}
            style={{ fontSize: '11px', fontWeight: 600, color: '#4b63f0', background: 'rgba(75,99,240,0.08)', border: 'none', borderRadius: '6px', padding: '2px 8px', cursor: 'pointer' }}>
            + 新增
          </button>
        </div>
        {form.insights.length === 0 ? (
          <div style={{ padding: '9px', textAlign: 'center', fontSize: '11.5px', color: '#94a3b8', background: 'rgba(248,250,252,0.5)', borderRadius: '7px', border: '1px dashed rgba(148,163,184,0.28)' }}>
            还没有记录 — 读完后写下「核心触动」和打算怎么「应用到生活」
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {form.insights.map((ins, idx) => {
              const col = resonanceColor(ins.resonance);
              return (
                <div key={ins.id} style={{
                  padding: '7px 8px', borderRadius: '7px',
                  background: `${col}08`, border: `1px solid ${col}22`,
                  display: 'flex', flexDirection: 'column', gap: '5px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                    <span style={{ fontSize: '10px', fontWeight: 700, color: col, minWidth: '16px', paddingTop: '3px' }}>{idx + 1}.</span>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <textarea
                        value={ins.text}
                        onChange={e => updateInsight(ins.id, { text: e.target.value })}
                        placeholder="核心触动：这本书哪段话/哪个理念最打动你？"
                        rows={1}
                        style={{
                          fontSize: '11.5px', lineHeight: '1.45', color: '#1c1c1e',
                          border: '1px solid rgba(15,23,42,0.08)', borderRadius: '5px',
                          padding: '3px 7px', resize: 'none', minHeight: '24px', outline: 'none', background: '#fff',
                        }}
                      />
                      <textarea
                        value={ins.scene}
                        onChange={e => updateInsight(ins.id, { scene: e.target.value })}
                        placeholder="应用场景：这条触动打算具体用在哪件事/哪个场景？"
                        rows={1}
                        style={{
                          fontSize: '11.5px', lineHeight: '1.45', color: '#1c1c1e',
                          border: '1px solid rgba(75,99,240,0.09)', borderRadius: '5px',
                          padding: '3px 7px', resize: 'none', minHeight: '24px', outline: 'none',
                          background: 'rgba(75,99,240,0.03)',
                        }}
                      />
                    </div>
                    <button type="button" onClick={() => removeInsight(ins.id)}
                      style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', fontSize: '13px', padding: '1px 2px', lineHeight: 1 }}
                      title="删除此条">×</button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', paddingLeft: '22px' }}>
                    <span style={{ fontSize: '9.5px', color: '#94a3b8', fontWeight: 500, flexShrink: 0 }}>共鸣</span>
                    <input type="range" min="1" max="10" step="1"
                      value={ins.resonance}
                      onChange={e => updateInsight(ins.id, { resonance: Number(e.target.value) })}
                      style={{ flex: 1, accentColor: col, height: '3px' }} />
                    <span style={{ fontSize: '10px', fontWeight: 700, color: col, minWidth: '16px', textAlign: 'right', tabularNums: true }}>{ins.resonance}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ===== 思后行动：每条行动一个复选框，自动同步到思后行动卡片 ===== */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
          <label style={{ ...LABEL_STYLE, margin: 0 }}>
            思后行动 · 具体承诺
            <span style={{ fontSize: '10.5px', color: actionCount > 0 ? '#a855f7' : '#94a3b8', fontWeight: 600, marginLeft: '6px' }}>
              {actionCount > 0 ? `✓ 已列出 ${actionCount} 条` : '至少写1条后自动勾选'}
            </span>
          </label>
          <button type="button" onClick={addAction}
            style={{ fontSize: '11px', fontWeight: 600, color: '#a855f7', background: 'rgba(168,85,247,0.08)', border: 'none', borderRadius: '6px', padding: '2px 8px', cursor: 'pointer' }}>
            + 新增
          </button>
        </div>
        {form.actions.length === 0 ? (
          <div style={{ padding: '9px', textAlign: 'center', fontSize: '11.5px', color: '#94a3b8', background: 'rgba(248,250,252,0.5)', borderRadius: '7px', border: '1px dashed rgba(148,163,184,0.28)' }}>
            还没有行动承诺 — 从触动和场景里拆解出具体「要做什么」
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {form.actions.map((a, idx) => (
              <div key={a.id} style={{
                display: 'flex', alignItems: 'flex-start', gap: '7px',
                padding: '5px 7px', borderRadius: '7px',
                background: a.done ? 'rgba(34,197,94,0.05)' : 'rgba(168,85,247,0.04)',
                border: `1px solid ${a.done ? 'rgba(34,197,94,0.15)' : 'rgba(168,85,247,0.12)'}`,
              }}>
                <input type="checkbox" checked={!!a.done}
                  onChange={e => updateAction(a.id, { done: e.target.checked })}
                  style={{ width: '15px', height: '15px', marginTop: '2px', accentColor: a.done ? '#22c55e' : '#a855f7' }} />
                <textarea
                  value={a.text}
                  onChange={e => updateAction(a.id, { text: e.target.value })}
                  placeholder={`第${idx + 1}条 · 具体行动（如：每天发1条朋友圈练表达）`}
                  rows={1}
                  style={{
                    flex: 1, fontSize: '11.5px', lineHeight: '1.45', color: a.done ? '#64748b' : '#1c1c1e',
                    textDecoration: a.done ? 'line-through' : 'none',
                    border: '1px solid rgba(15,23,42,0.06)', borderRadius: '5px',
                    padding: '3px 7px', resize: 'none', minHeight: '22px', outline: 'none', background: '#fff',
                  }}
                />
                <button type="button" onClick={() => removeAction(a.id)}
                  style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', fontSize: '13px', padding: '1px 2px', lineHeight: 1 }}
                  title="删除此条">×</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', paddingTop: '2px', borderTop: '1px solid rgba(15,23,42,0.06)', marginTop: '2px' }}>
        <div>{isEdit && <button onClick={del} style={BTN_DANGER}>删除</button>}</div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={onCancel} style={BTN_GHOST}>取消</button>
          <button onClick={submit} style={BTN_PRIMARY}>{isEdit ? '保存' : '添加'}</button>
        </div>
      </div>
    </div>
  );
}
