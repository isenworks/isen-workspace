import { useState } from 'react';
import { LABEL_STYLE, INPUT_STYLE } from '../../utils/uiConstants.js';

const BLUE = '#3b82f6';         // 主题蓝（知力）
const BLUE_DARK = '#2563eb';    // 按钮填充深
const BLUE_LIGHT = '#eff6ff';   // 背景淡
const BLUE_BORDER = '#bfdbfe';  // 边框
const BLUE_SOFT = '#dbeafe';    // hover/次级
const INK = '#1c1c1e';
const INK_MUTE = '#64748b';
const INK_LIGHT = '#94a3b8';
const DANGER = '#ef4444';
const SUCCESS = '#22c55e';

const BTN_GHOST = {
  padding: '5px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: '600',
  background: 'rgba(59,130,246,0.06)', color: BLUE_DARK, border: `1px solid ${BLUE_BORDER}`, cursor: 'pointer', transition: 'all .15s',
};
const BTN_PRIMARY = {
  padding: '5px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: '700',
  background: BLUE_DARK, color: '#fff', border: 'none', cursor: 'pointer', transition: 'all .15s',
  boxShadow: '0 2px 8px rgba(37,99,235,0.22)',
};
const BTN_DANGER = {
  padding: '5px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: '600',
  background: 'rgba(239,68,68,0.08)', color: DANGER, border: `1px solid rgba(239,68,68,0.22)`, cursor: 'pointer', transition: 'all .15s',
};

const STATUSES = [
  { v: 'pending',   lb: '未开始' },
  { v: 'reading',   lb: '阅读中' },
  { v: 'done',      lb: '已读完' },
  { v: 'abandoned', lb: '已弃读' },
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
    ebookUrl: initial?.ebookUrl || '',
    coverUrl: initial?.coverUrl || '',
    coverSource: initial?.coverSource || 'placeholder',
    startDate: initial?.startDate || '',
    endDate: initial?.endDate || '',
    insights: (initial?.insights && initial.insights.length)
      ? initial.insights.map(i => ({ ...i, scene: i.scene || '', resonance: i.resonance ?? 5 }))
      : [],
    actions: (initial?.actions && initial.actions.length)
      ? initial.actions.map(a => ({ ...a, done: !!a.done }))
      : [],
    hasInsights: initial?.hasInsights ?? false,
    hasAction: initial?.hasAction ?? false,
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const [coverFetching, setCoverFetching] = useState(false);

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

  // 状态切换下拉：同步pct和起止日期
  const setStatus = (stVal) => {
    const patch = { st: stVal };
    if (stVal === 'done') {
      patch.pct = 100;
      if (!form.endDate) patch.endDate = new Date().toISOString().slice(0, 10);
      if (!form.startDate && form.st === 'pending') patch.startDate = new Date().toISOString().slice(0, 10);
    } else if (stVal === 'pending') {
      patch.pct = 0;
    } else if (stVal === 'reading') {
      const cur = Number(form.pct) || 0;
      if (cur <= 0) patch.pct = 1;
      else if (cur >= 100) patch.pct = 99;
      if (!form.startDate) patch.startDate = new Date().toISOString().slice(0, 10);
    }
    setForm(f => ({ ...f, ...patch }));
  };

  const setPct = (p) => {
    const pNum = Math.min(100, Math.max(0, Number(p) || 0));
    const patch = { pct: pNum };
    if (pNum >= 100 && form.st !== 'abandoned') patch.st = 'done';
    else if (pNum > 0 && form.st === 'pending') patch.st = 'reading';
    else if (pNum === 0 && form.st !== 'abandoned' && form.st !== 'reading') patch.st = 'pending';
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
      coverUrl: form.coverUrl.trim(),
      coverSource: form.coverUrl.trim() ? (form.coverSource || 'manual') : 'placeholder',
      insights: cleanInsights,
      actions: cleanActions,
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

  const resonanceColor = (r) => r >= 9 ? BLUE_DARK : r >= 7 ? BLUE : INK_LIGHT;
  const isEbook = form.src === '电子书';

  // 从豆瓣+Google兜底搜索封面（用户没配weread key时手动触发）
  async function searchCover() {
    if (!form.t.trim()) return alert('请先输入书名');
    setCoverFetching(true);
    try {
      const params = new URLSearchParams({ q: form.t.trim() });
      if (form.author.trim()) params.set('author', form.author.trim());
      const res = await fetch(`/api/cover/search?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (data?.coverUrl) {
        setForm(f => ({ ...f, coverUrl: data.coverUrl, coverSource: data.source || 'douban' }));
        return;
      }
      alert(data?.error || '暂无匹配封面，请手动粘贴URL');
    } catch (e) {
      alert('搜索失败：' + (e.message || e));
    } finally {
      setCoverFetching(false);
    }
  }

  // select 样式（统一蓝色系）
  const SELECT_STYLE = {
    ...INPUT_STYLE,
    appearance: 'none',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%2360a5fa' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 8px center',
    backgroundSize: '10px',
    paddingRight: '26px',
    cursor: 'pointer',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
      {/* ===== 📚 第1块：基础信息（身份识别卡 · WHO）===== */}
      <InfoGroupCard title="📚 基础信息" tone="white">
        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
          {/* 封面预览：42×56 装饰块（点击可粘贴 URL） */}
          <div style={{
            width: '52px', height: '70px', borderRadius: '7px',
            flexShrink: 0, overflow: 'hidden',
            border: `1px solid ${BLUE_BORDER}`,
            background: BLUE_LIGHT,
            boxShadow: '0 2px 6px rgba(15,23,42,0.06)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            position: 'relative',
          }}>
            {form.coverUrl ? (
              <img src={form.coverUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            ) : (
              <span style={{ fontSize: '18px', fontWeight: 900, color: BLUE_DARK, opacity: 0.45 }}>
                {(form.t || '书').charAt(0)}
              </span>
            )}
          </div>

          {/* 右侧：表单字段 2行4列 */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {/* 行 A：书名 · 作者 · 分类 · 来源 */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1.5fr 1.15fr 1fr 0.9fr',
              gap: '8px',
            }}>
              <FieldRow label="书名">
                <input className="form-input" style={{ ...INPUT_STYLE, fontSize: '12.5px', fontWeight: 600 }}
                  value={form.t} onChange={e => set('t', e.target.value)}
                  placeholder="书名" autoFocus />
              </FieldRow>
              <FieldRow label="作者">
                <input className="form-input" style={{ ...INPUT_STYLE, fontSize: '12px' }}
                  value={form.author} onChange={e => set('author', e.target.value)}
                  placeholder="作者" />
              </FieldRow>
              <FieldRow label="分类">
                <select className="form-input" style={{ ...SELECT_STYLE, fontSize: '12px' }}
                  value={form.cat} onChange={e => set('cat', e.target.value)}>
                  {CATS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </FieldRow>
              <FieldRow label="来源">
                <select className="form-input" style={{ ...SELECT_STYLE, fontSize: '12px' }}
                  value={form.src} onChange={e => set('src', e.target.value)}>
                  {SRCS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </FieldRow>
            </div>

            {/* 行 B：封面URL + 搜封面按钮（占整行宽度）*/}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '7px' }}>
              <FieldRow label="封面链接（微信读书/豆瓣/Google 图书图链接）">
                <input className="form-input" style={{ ...INPUT_STYLE, fontSize: '12px' }}
                  value={form.coverUrl} onChange={e => set('coverUrl', e.target.value)}
                  placeholder="https://…cover_1.jpg（留空则显示分类占位图）" />
              </FieldRow>
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                <button type="button" onClick={searchCover} disabled={coverFetching}
                  style={{
                    ...BTN_GHOST, padding: '5px 11px', height: '32px', fontSize: '11px',
                    opacity: coverFetching ? 0.7 : 1, cursor: coverFetching ? 'not-allowed' : 'pointer',
                  }}>
                  {coverFetching ? '搜索中…' : '🔍 搜封面'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </InfoGroupCard>

      {/* ===== 📖 第2块：阅读过程卡（HOW · 时间+进度+状态）===== */}
      <InfoGroupCard title="📖 阅读过程" tone="blue">
        {/* 行 A：状态 + 进度条 */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 2.1fr',
          gap: '8px',
          marginBottom: '7px',
        }}>
          <FieldRow label="阅读状态">
            <select className="form-input" style={{ ...SELECT_STYLE, fontSize: '12.5px',
              fontWeight: 700,
              color: form.st === 'done' ? SUCCESS : form.st === 'reading' ? BLUE_DARK : form.st === 'abandoned' ? INK_LIGHT : INK_MUTE,
              background: form.st === 'done' ? '#ecfdf5' : form.st === 'reading' ? BLUE_SOFT : form.st === 'abandoned' ? '#f8fafc' : '#fff',
            }}
              value={form.st} onChange={e => setStatus(e.target.value)}>
              {STATUSES.map(s => <option key={s.v} value={s.v}>{s.lb}</option>)}
            </select>
          </FieldRow>
          <FieldRow label={`进度 ${form.pct}%`}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, height: '33px',
              padding: '0 10px', background: '#fff', borderRadius: '8px', border: `1px solid ${BLUE_BORDER}` }}>
              <input type="range" min="0" max="100" step="1"
                value={form.pct} onChange={e => setPct(e.target.value)}
                style={{ flex: 1, accentColor: BLUE_DARK, height: '18px', minWidth: 0 }} />
              <span style={{ fontSize: '11.5px', fontWeight: 800, color: BLUE_DARK, tabularNums: true, minWidth: '30px', textAlign: 'right' }}>
                {form.pct}
              </span>
            </div>
          </FieldRow>
        </div>

        {/* 行 B：开始 + 结束日期 */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '8px',
          paddingBottom: isEbook ? '7px' : '1px',
          borderBottom: isEbook ? `1px dashed ${BLUE_BORDER}` : 'none',
        }}>
          <FieldRow label="开始阅读">
            <input type="date" className="form-input" style={{ ...INPUT_STYLE, fontSize: '12px' }}
              value={form.startDate} onChange={e => set('startDate', e.target.value)} />
          </FieldRow>
          <FieldRow label="结束阅读">
            <input type="date" className="form-input" style={{ ...INPUT_STYLE, fontSize: '12px' }}
              value={form.endDate} onChange={e => set('endDate', e.target.value)} />
          </FieldRow>
        </div>

        {/* 行 C（仅电子书）：电子书链接，单独展开整行，不再与来源并列 */}
        {isEbook && (
          <div style={{ marginTop: '7px' }}>
            <FieldRow label="电子书链接 / weread 协议">
              <input className="form-input" style={{ ...INPUT_STYLE, fontSize: '12px' }}
                value={form.ebookUrl} onChange={e => set('ebookUrl', e.target.value)}
                placeholder="https:// / weread:// / file:// · 保存后，卡片左键直接打开" />
            </FieldRow>
          </div>
        )}
      </InfoGroupCard>

      {/* ===== ① 读后思考 · 核心触动 + 应用场景（双步流程 · 第1步）===== */}
      <SectionCard
        stepNum={1}
        title="读后思考 · 核心触动 + 应用场景"
        subtitle={insightCount > 0 ? `✓ 已完成 ${insightCount} 组` : '至少填写1组后自动勾选漏斗思考量'}
        subtitleOk={insightCount > 0}
        btnLabel="+ 新增"
        onBtnClick={addInsight}
      >
        {form.insights.length === 0 ? (
          <EmptyBox>读完后写下「核心触动」和打算怎么「应用到生活」</EmptyBox>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {form.insights.map((ins, idx) => {
              const col = resonanceColor(ins.resonance);
              return (
                <div key={ins.id} style={{
                  padding: '6px 7px', borderRadius: '7px',
                  background: `${BLUE}08`, border: `1px solid ${BLUE}22`,
                  display: 'flex', flexDirection: 'column', gap: '4px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '5px' }}>
                    <span style={{ fontSize: '10px', fontWeight: 700, color: BLUE_DARK, minWidth: '15px', paddingTop: '3px' }}>{idx + 1}.</span>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <textarea
                        value={ins.text}
                        onChange={e => updateInsight(ins.id, { text: e.target.value })}
                        placeholder="核心触动：哪段话/理念最打动你"
                        rows={1}
                        style={{
                          fontSize: '11.5px', lineHeight: '1.45', color: INK,
                          border: '1px solid rgba(59,130,246,0.1)', borderRadius: '5px',
                          padding: '3px 7px', resize: 'none', minHeight: '22px', outline: 'none', background: '#fff',
                        }}
                      />
                      <textarea
                        value={ins.scene}
                        onChange={e => updateInsight(ins.id, { scene: e.target.value })}
                        placeholder="应用场景：打算具体用在哪件事/场景"
                        rows={1}
                        style={{
                          fontSize: '11.5px', lineHeight: '1.45', color: INK,
                          border: `1px solid ${BLUE_BORDER}`, borderRadius: '5px',
                          padding: '3px 7px', resize: 'none', minHeight: '22px', outline: 'none',
                          background: BLUE_LIGHT,
                        }}
                      />
                    </div>
                    <button type="button" onClick={() => removeInsight(ins.id)}
                      style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', fontSize: '13px', padding: '1px 2px', lineHeight: 1 }}
                      title="删除">×</button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', paddingLeft: '20px' }}>
                    <span style={{ fontSize: '9.5px', color: INK_LIGHT, fontWeight: 500, flexShrink: 0 }}>共鸣</span>
                    <input type="range" min="1" max="10" step="1"
                      value={ins.resonance}
                      onChange={e => updateInsight(ins.id, { resonance: Number(e.target.value) })}
                      style={{ flex: 1, accentColor: col, height: '3px' }} />
                    <span style={{ fontSize: '10px', fontWeight: 700, color: col, minWidth: '15px', textAlign: 'right', tabularNums: true }}>{ins.resonance}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      {/* ===== ② 思后行动 · 行动计划（双步流程 · 第2步）===== */}
      <SectionCard
        stepNum={2}
        title="思后行动 · 行动计划"
        subtitle={actionCount > 0 ? `✓ 已列出 ${actionCount} 条` : '至少写1条后自动勾选漏斗行动量'}
        subtitleOk={actionCount > 0}
        btnLabel="+ 新增"
        onBtnClick={addAction}
      >
        {form.actions.length === 0 ? (
          <EmptyBox>从触动和场景里拆解出具体「要做什么」</EmptyBox>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {form.actions.map((a, idx) => (
              <div key={a.id} style={{
                display: 'flex', alignItems: 'flex-start', gap: '6px',
                padding: '4px 6px', borderRadius: '7px',
                background: a.done ? 'rgba(34,197,94,0.05)' : `${BLUE}06`,
                border: `1px solid ${a.done ? 'rgba(34,197,94,0.14)' : `${BLUE}1a`}`,
              }}>
                <input type="checkbox" checked={!!a.done}
                  onChange={e => updateAction(a.id, { done: e.target.checked })}
                  style={{ width: '14px', height: '14px', marginTop: '2px', accentColor: a.done ? SUCCESS : BLUE_DARK }} />
                <textarea
                  value={a.text}
                  onChange={e => updateAction(a.id, { text: e.target.value })}
                  placeholder={`第${idx + 1}条 · 具体行动`}
                  rows={1}
                  style={{
                    flex: 1, fontSize: '11.5px', lineHeight: '1.45', color: a.done ? INK_MUTE : INK,
                    textDecoration: a.done ? 'line-through' : 'none',
                    border: '1px solid rgba(15,23,42,0.06)', borderRadius: '5px',
                    padding: '3px 6px', resize: 'none', minHeight: '22px', outline: 'none', background: '#fff',
                  }}
                />
                <button type="button" onClick={() => removeAction(a.id)}
                  style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', fontSize: '13px', padding: '1px 2px', lineHeight: 1 }}
                  title="删除">×</button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', paddingTop: '3px', borderTop: `1px solid ${BLUE_BORDER}66`, marginTop: '1px' }}>
        <div>{isEdit && <button onClick={del} style={BTN_DANGER}>删除</button>}</div>
        <div style={{ display: 'flex', gap: '7px' }}>
          <button onClick={onCancel} style={BTN_GHOST}>取消</button>
          <button onClick={submit} style={BTN_PRIMARY}>{isEdit ? '保存' : '添加'}</button>
        </div>
      </div>
    </div>
  );
}

// ---------- 子组件：行内 Field ----------
function FieldRow({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
      <span style={{ fontSize: '10.5px', fontWeight: 600, color: BLUE_DARK, opacity: 0.85, letterSpacing: 0.1 }}>{label}</span>
      {children}
    </div>
  );
}

// ---------- 子组件：蓝色卡片式 Section（REFLECT 双步流程）----------
function SectionCard({ stepNum, title, subtitle, subtitleOk, btnLabel, onBtnClick, children }) {
  return (
    <div style={{
      padding: '8px 10px',
      borderRadius: '11px',
      background: '#fbfdff',
      border: `1px solid ${BLUE_BORDER}66`,
      display: 'flex', flexDirection: 'column', gap: '5px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
          {typeof stepNum === 'number' && (
            <span style={{
              width: '20px', height: '20px', borderRadius: '6px',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '11px', fontWeight: 900, color: '#fff',
              background: stepNum === 1 ? BLUE_DARK : SUCCESS,
              boxShadow: `0 2px 6px ${stepNum === 1 ? 'rgba(37,99,235,0.25)' : 'rgba(34,197,94,0.22)'}`,
              flexShrink: 0,
            }}>{stepNum}</span>
          )}
          <span style={{
            width: '3px', height: '14px', borderRadius: '2px', background: typeof stepNum === 'number' ? (stepNum === 1 ? BLUE_DARK : SUCCESS) : BLUE_DARK,
            display: typeof stepNum === 'number' ? 'none' : 'inline-block',
            marginRight: '1px',
          }} />
          <span style={{ fontSize: '12.5px', fontWeight: 800, color: INK }}>{title}</span>
          {subtitle && (
            <span style={{ fontSize: '10.5px', color: subtitleOk ? SUCCESS : INK_LIGHT, fontWeight: 600 }}>{subtitle}</span>
          )}
        </div>
        <button type="button" onClick={onBtnClick}
          style={{
            fontSize: '11px', fontWeight: 700, color: BLUE_DARK,
            background: BLUE_LIGHT, border: `1px solid ${BLUE_BORDER}`,
            borderRadius: '6px', padding: '3px 10px', cursor: 'pointer',
            transition: 'all .15s',
          }}>
          {btnLabel}
        </button>
      </div>
      {children}
    </div>
  );
}

// ---------- 子组件：分组信息卡（基础信息=白底 / 阅读过程=蓝底）----------
function InfoGroupCard({ title, tone, children }) {
  const isBlue = tone === 'blue';
  return (
    <div style={{
      padding: '9px 10px 9px',
      borderRadius: '12px',
      background: isBlue ? BLUE_LIGHT : '#fff',
      border: `1px solid ${isBlue ? BLUE_BORDER : 'rgba(15,23,42,0.07)'}`,
      display: 'flex', flexDirection: 'column', gap: '0px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
        <span style={{
          width: '3px', height: '14px', borderRadius: '2px',
          background: isBlue ? BLUE_DARK : '#475569',
        }} />
        <span style={{
          fontSize: '12px', fontWeight: 800, letterSpacing: 0.1,
          color: isBlue ? BLUE_DARK : INK,
        }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

function EmptyBox({ children }) {
  return (
    <div style={{
      padding: '8px', textAlign: 'center', fontSize: '11.5px', color: INK_LIGHT,
      background: BLUE_LIGHT, borderRadius: '7px', border: `1px dashed ${BLUE_BORDER}`,
    }}>
      {children}
    </div>
  );
}
