import { useState } from 'react';
import { INPUT_STYLE } from '../../utils/uiConstants.js';

const BLUE = '#007aff';
const BLUE_DARK = '#0062cc';
const BLUE_LIGHT = '#f0f6ff';
const BLUE_BORDER = 'rgba(0,122,255,0.22)';
const BLUE_SOFT = 'rgba(0,122,255,0.08)';
const INK = '#1c1c1e';
const INK_MUTE = '#64748b';
const INK_LIGHT = '#94a3b8';
const DANGER = '#ef4444';
const SUCCESS = '#22c55e';
const CARD_BG = 'rgba(15,23,42,0.03)';
const CARD_BORDER = 'rgba(15,23,42,0.08)';
const CARD_RADIUS = 14;

const STATUSES = [
  { v: 'pending',   lb: '未开始' },
  { v: 'reading',   lb: '阅读中' },
  { v: 'done',      lb: '已读完' },
  { v: 'abandoned', lb: '已弃读' },
];
const CATS = ['认知成长', '人际沟通', '商业职场', '人文叙事'];
const SRCS = ['纸质书', '电子书', '有声书', '网络'];

const TABS = [
  { key: 'basic',     label: '基础信息', icon: 'book' },
  { key: 'insights',  label: '读后思考', icon: 'bulb' },
  { key: 'actions',   label: '思后行动', icon: 'check' },
  { key: 'changes',   label: '行后改变', icon: 'zap' },
];

export default function BookForm({ initial, onSaved, onCancel, onDelete, initialTab }) {
  const isEdit = !!(initial && initial.id);
  const [activeTab, setActiveTab] = useState(initialTab || 'basic');
  const [form, setForm] = useState({
    t: initial?.t || '',
    author: initial?.author || '',
    cat: CATS.includes(initial?.cat) ? initial.cat : CATS[0],
    src: SRCS.includes(initial?.src) ? initial.src : SRCS[0],
    st: initial?.st || 'pending',
    pct: initial?.pct ?? 0,
    bookId: initial?.bookId || '',
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
    changes: (initial?.changes && initial.changes.length)
      ? initial.changes.map(c => ({ ...c }))
      : [],
    hasInsights: initial?.hasInsights ?? false,
    hasAction: initial?.hasAction ?? false,
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const [coverFetching, setCoverFetching] = useState(false);

  const validInsights = form.insights.filter(i => i.text?.trim() && i.scene?.trim());
  const validActions = form.actions.filter(a => a.text?.trim());
  const validChanges = form.changes.filter(c => c.text?.trim());
  const insightCount = validInsights.length;
  const actionCount = validActions.length;
  const changeCount = validChanges.length;

  const syncFlags = (patch = {}) => {
    setForm(f => {
      const next = { ...f, ...patch };
      const vi = next.insights.some(i => i.text?.trim() && i.scene?.trim());
      const va = next.actions.some(a => a.text?.trim());
      return { ...next, hasInsights: vi, hasAction: va };
    });
  };

  // --- Insight CRUD ---
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

  // --- Action CRUD ---
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

  // --- Change CRUD ---
  const addChange = () => {
    const id = Date.now() + Math.random();
    set('changes', [...form.changes, {
      id, text: '', startDate: new Date().toISOString().slice(0, 10),
      targetDays: 30, checkIns: [], status: 'active',
    }]);
  };
  const updateChange = (id, patch) => {
    setForm(f => ({ ...f, changes: f.changes.map(c => c.id === id ? { ...c, ...patch } : c) }));
  };
  const removeChange = (id) => {
    setForm(f => ({ ...f, changes: f.changes.filter(c => c.id !== id) }));
  };

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
    const cleanChanges = form.changes
      .filter(c => c.text?.trim())
      .map(c => ({ ...c, text: c.text.trim() }));
    const hasInsights = cleanInsights.length > 0;
    const hasAction = cleanActions.length > 0;
    onSaved?.({
      ...form,
      t: form.t.trim(),
      author: form.author.trim(),
      bookId: form.bookId.trim(),
      ebookUrl: form.ebookUrl.trim(),
      coverUrl: form.coverUrl.trim(),
      coverSource: form.coverUrl.trim() ? (form.coverSource || 'manual') : 'placeholder',
      insights: cleanInsights,
      actions: cleanActions,
      changes: cleanChanges,
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

  const isEbook = form.src === '电子书';

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

  const SELECT_STYLE = {
    ...INPUT_STYLE,
    appearance: 'none',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%23007aff' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 8px center',
    backgroundSize: '10px',
    paddingRight: '26px',
    cursor: 'pointer',
  };

  // Tab badge counts
  const tabBadge = (key) => {
    if (key === 'insights' && insightCount > 0) return insightCount;
    if (key === 'actions' && actionCount > 0) return actionCount;
    if (key === 'changes' && changeCount > 0) return changeCount;
    return null;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* ===== Hero ===== */}
      <div style={{
        display: 'flex', gap: '12px', alignItems: 'center',
        padding: '11px 16px 9px',
        borderTopLeftRadius: 20, borderTopRightRadius: 20,
        borderBottom: `1px solid ${CARD_BORDER}`,
      }}>
        <div style={{
          width: '40px', height: '56px', borderRadius: '6px', flexShrink: 0,
          overflow: 'hidden', border: `1px solid ${CARD_BORDER}`,
          background: BLUE_LIGHT,
          boxShadow: '0 2px 8px rgba(15,23,42,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {form.coverUrl ? (
            <img src={form.coverUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          ) : (
            <span style={{ fontSize: '14px', fontWeight: 800, color: BLUE, opacity: 0.5 }}>
              {(form.t || '书').charAt(0)}
            </span>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {form.t || '未命名书籍'}
          </div>
          <div style={{ fontSize: '11.5px', color: INK_MUTE, marginTop: '2px', display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
            {form.author && <span>{form.author}</span>}
            {form.author && <span style={{ color: INK_LIGHT }}>·</span>}
            <span style={{ color: BLUE, fontWeight: 600 }}>{form.cat}</span>
            <span style={{ color: INK_LIGHT }}>·</span>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '3px',
              padding: '1px 7px', borderRadius: '4px', fontSize: '10.5px', fontWeight: 600,
              background: form.st === 'done' ? 'rgba(34,197,94,0.1)' : form.st === 'reading' ? BLUE_SOFT : CARD_BG,
              color: form.st === 'done' ? SUCCESS : form.st === 'reading' ? BLUE_DARK : INK_LIGHT,
            }}>
              {STATUSES.find(s => s.v === form.st)?.lb || '未开始'}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
          {[
            { n: insightCount, l: '思考' },
            { n: actionCount, l: '行动' },
            { n: changeCount, l: '改变' },
          ].map(s => (
            <div key={s.l} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              padding: '3px 7px', borderRadius: '6px',
              background: '#fff', border: `1px solid ${CARD_BORDER}`, minWidth: '38px',
            }}>
              <div style={{ fontSize: '12px', fontWeight: 800, color: INK, lineHeight: 1.1 }}>{s.n}</div>
              <div style={{ fontSize: '8.5px', fontWeight: 600, color: INK_LIGHT, letterSpacing: '0.03em' }}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ===== Tab 栏（iOS 分段控制器风格） ===== */}
      <div style={{
        display: 'flex', gap: '4px',
        margin: '8px 16px 0',
        padding: '3px',
        background: CARD_BG,
        borderRadius: '999px',
      }}>
        {TABS.map(t => {
          const active = activeTab === t.key;
          const badge = tabBadge(t.key);
          return (
            <button key={t.key} type="button"
              onClick={() => setActiveTab(t.key)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                padding: '6px 10px',
                flex: 1,
                fontSize: '12px',
                fontWeight: active ? 700 : 500,
                color: active ? BLUE_DARK : INK_MUTE,
                background: active ? '#fff' : 'transparent',
                border: 'none',
                borderRadius: '999px',
                boxShadow: active ? '0 1px 4px rgba(15,23,42,0.1)' : 'none',
                cursor: 'pointer',
                transition: 'all .15s',
              }}>
              <TabIcon name={t.icon} active={active} />
              {t.label}
              {badge && (
                <span style={{
                  fontSize: '10px', fontWeight: 700,
                  padding: '1px 6px', borderRadius: '999px',
                  background: active ? BLUE : BLUE_LIGHT,
                  color: active ? '#fff' : BLUE_DARK,
                  minWidth: '16px', textAlign: 'center', lineHeight: 1.3,
                }}>{badge}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* ===== Tab 内容 ===== */}
      <div style={{ padding: '10px 16px', flex: 1 }}>
        {activeTab === 'basic' && <BasicTab form={form} set={set} setStatus={setStatus} setPct={setPct} searchCover={searchCover} coverFetching={coverFetching} isEbook={isEbook} SELECT_STYLE={SELECT_STYLE} INPUT_STYLE={INPUT_STYLE} BLUE={BLUE} BLUE_DARK={BLUE_DARK} BLUE_BORDER={BLUE_BORDER} BLUE_LIGHT={BLUE_LIGHT} SUCCESS={SUCCESS} INK={INK} INK_MUTE={INK_MUTE} INK_LIGHT={INK_LIGHT} CARD_BG={CARD_BG} CARD_BORDER={CARD_BORDER} CARD_RADIUS={CARD_RADIUS} />}
        {activeTab === 'insights' && <InsightsTab form={form} addInsight={addInsight} updateInsight={updateInsight} removeInsight={removeInsight} insightCount={insightCount} BLUE={BLUE} BLUE_DARK={BLUE_DARK} BLUE_BORDER={BLUE_BORDER} BLUE_LIGHT={BLUE_LIGHT} INK={INK} INK_MUTE={INK_MUTE} INK_LIGHT={INK_LIGHT} CARD_BG={CARD_BG} CARD_BORDER={CARD_BORDER} CARD_RADIUS={CARD_RADIUS} />}
        {activeTab === 'actions' && <ActionsTab form={form} addAction={addAction} updateAction={updateAction} removeAction={removeAction} actionCount={actionCount} BLUE={BLUE} BLUE_DARK={BLUE_DARK} BLUE_BORDER={BLUE_BORDER} BLUE_LIGHT={BLUE_LIGHT} INK={INK} INK_MUTE={INK_MUTE} INK_LIGHT={INK_LIGHT} SUCCESS={SUCCESS} CARD_BG={CARD_BG} CARD_BORDER={CARD_BORDER} CARD_RADIUS={CARD_RADIUS} />}
        {activeTab === 'changes' && <ChangesTab form={form} addChange={addChange} updateChange={updateChange} removeChange={removeChange} changeCount={changeCount} BLUE={BLUE} BLUE_DARK={BLUE_DARK} BLUE_BORDER={BLUE_BORDER} BLUE_LIGHT={BLUE_LIGHT} INK={INK} INK_MUTE={INK_MUTE} INK_LIGHT={INK_LIGHT} SUCCESS={SUCCESS} CARD_BG={CARD_BG} CARD_BORDER={CARD_BORDER} CARD_RADIUS={CARD_RADIUS} />}
      </div>

      {/* ===== 底部按钮 ===== */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', gap: '8px',
        padding: '9px 16px',
        borderTop: `1px solid ${CARD_BORDER}`,
        borderBottomLeftRadius: 18, borderBottomRightRadius: 18,
      }}>
        <div>{isEdit && <button onClick={del} style={{
          padding: '6px 14px', borderRadius: '10px', fontSize: '12px', fontWeight: 600,
          background: 'rgba(239,68,68,0.06)', color: DANGER,
          border: '1px solid rgba(239,68,68,0.22)', cursor: 'pointer',
        }}>删除</button>}</div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={onCancel} style={{
            padding: '6px 16px', borderRadius: '10px', fontSize: '12px', fontWeight: 600,
            background: '#fff', color: INK_MUTE, border: `1px solid ${CARD_BORDER}`, cursor: 'pointer',
          }}>取消</button>
          <button onClick={submit} style={{
            padding: '6px 18px', borderRadius: '10px', fontSize: '12px', fontWeight: 700,
            background: BLUE, color: '#fff', border: 'none', cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,122,255,0.25)',
          }}>{isEdit ? '保存' : '添加'}</button>
        </div>
      </div>
    </div>
  );
}

// ===== Tab 图标 =====
function TabIcon({ name, active }) {
  const c = active ? '#007aff' : '#94a3b8';
  const common = { width: '13px', height: '13px', stroke: c, fill: 'none', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' };
  if (name === 'book') return (
    <svg viewBox="0 0 24 24" {...common}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
  );
  if (name === 'bulb') return (
    <svg viewBox="0 0 24 24" {...common}><path d="M12 2a7 7 0 0 0-4 12.74V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.26A7 7 0 0 0 12 2z"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>
  );
  if (name === 'check') return (
    <svg viewBox="0 0 24 24" {...common}><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
  );
  if (name === 'zap') return (
    <svg viewBox="0 0 24 24" {...common}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
  );
  return null;
}

// ===== Section Card =====
function SectionCard({ title, children, action, CARD_BG, CARD_BORDER, CARD_RADIUS, BLUE_DARK }) {
  return (
    <div style={{
      padding: '10px 12px',
      background: CARD_BG,
      border: `1px solid ${CARD_BORDER}`,
      borderRadius: CARD_RADIUS,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '7px',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          fontSize: '11px', fontWeight: 700, color: BLUE_DARK,
          letterSpacing: '0.06em', textTransform: 'uppercase',
        }}>
          <div style={{ width: '3px', height: '11px', borderRadius: '2px', background: BLUE_DARK }} />
          {title}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

// ===== Field Row =====
function FieldRow({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
      <span style={{ fontSize: '10.5px', fontWeight: 600, color: '#1c1c1e', opacity: 0.55 }}>{label}</span>
      {children}
    </div>
  );
}

// ===== Tab 0: 基础信息（紧凑版：单屏完整显示，无需滚动） =====
function BasicTab({ form, set, setStatus, setPct, searchCover, coverFetching, isEbook, SELECT_STYLE, INPUT_STYLE, BLUE, BLUE_DARK, BLUE_BORDER, BLUE_LIGHT, SUCCESS, INK, INK_MUTE, INK_LIGHT, CARD_BG, CARD_BORDER, CARD_RADIUS }) {
  const inputStyle = { ...INPUT_STYLE, fontSize: '12px', background: '#fff', border: `1px solid ${CARD_BORDER}`, borderRadius: '10px', padding: '5px 8px', outline: 'none' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {/* Section 1: 书籍信息 */}
      <SectionCard title="书籍信息" CARD_BG={CARD_BG} CARD_BORDER={CARD_BORDER} CARD_RADIUS={CARD_RADIUS} BLUE_DARK={BLUE_DARK}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '8px' }}>
          <FieldRow label="书名">
            <input style={{ ...inputStyle, fontWeight: 600 }}
              value={form.t} onChange={e => set('t', e.target.value)} placeholder="书名" autoFocus />
          </FieldRow>
          <FieldRow label="作者">
            <input style={inputStyle}
              value={form.author} onChange={e => set('author', e.target.value)} placeholder="作者" />
          </FieldRow>
          <FieldRow label="分类">
            <select style={{ ...SELECT_STYLE, ...inputStyle, paddingRight: '26px' }}
              value={form.cat} onChange={e => set('cat', e.target.value)}>
              {['认知成长', '人际沟通', '商业职场', '人文叙事'].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </FieldRow>
          <FieldRow label="来源">
            <select style={{ ...SELECT_STYLE, ...inputStyle, paddingRight: '26px' }}
              value={form.src} onChange={e => set('src', e.target.value)}>
              {['纸质书', '电子书', '有声书', '网络'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </FieldRow>
        </div>
      </SectionCard>

      {/* Section 2: 阅读状态（单行 4 列） */}
      <SectionCard title="阅读状态" CARD_BG={CARD_BG} CARD_BORDER={CARD_BORDER} CARD_RADIUS={CARD_RADIUS} BLUE_DARK={BLUE_DARK}>
        <div style={{ display: 'grid', gridTemplateColumns: '0.9fr 1.3fr 1fr 1fr', gap: '8px' }}>
          <FieldRow label="状态">
            <select style={{ ...SELECT_STYLE, ...inputStyle, paddingRight: '26px', fontWeight: 600,
              color: form.st === 'done' ? SUCCESS : form.st === 'reading' ? BLUE_DARK : INK_MUTE,
              background: form.st === 'done' ? '#ecfdf5' : form.st === 'reading' ? BLUE_LIGHT : '#fff',
            }}
              value={form.st} onChange={e => setStatus(e.target.value)}>
              {STATUSES.map(s => <option key={s.v} value={s.v}>{s.lb}</option>)}
            </select>
          </FieldRow>
          <FieldRow label={`进度 ${form.pct}%`}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, height: '30px',
              padding: '0 10px', background: '#fff', borderRadius: '10px', border: `1px solid ${CARD_BORDER}` }}>
              <input type="range" min="0" max="100" step="1"
                value={form.pct} onChange={e => setPct(e.target.value)}
                style={{ flex: 1, accentColor: BLUE, height: '13px', minWidth: 0 }} />
              <span style={{ fontSize: '11px', fontWeight: 700, color: BLUE, tabularNums: true, minWidth: '24px', textAlign: 'right' }}>
                {form.pct}
              </span>
            </div>
          </FieldRow>
          <FieldRow label="开始阅读">
            <input type="date" style={inputStyle}
              value={form.startDate} onChange={e => set('startDate', e.target.value)} />
          </FieldRow>
          <FieldRow label="结束阅读">
            <input type="date" style={inputStyle}
              value={form.endDate} onChange={e => set('endDate', e.target.value)} />
          </FieldRow>
        </div>
      </SectionCard>

      {/* Section 3: 链接 & 封面（电子书字段并排压缩） */}
      <SectionCard title="链接 & 封面" CARD_BG={CARD_BG} CARD_BORDER={CARD_BORDER} CARD_RADIUS={CARD_RADIUS} BLUE_DARK={BLUE_DARK}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {isEbook && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '8px' }}>
              <FieldRow label="微信读书 BookID">
                <input style={inputStyle}
                  value={form.bookId}
                  onChange={e => {
                    const bid = e.target.value.trim();
                    const valid = /^[a-z0-9]{20,}$/i.test(bid.replace(/-/g, ''));
                    const autoUrl = valid ? `https://weread.qq.com/web/reader/${bid}` : '';
                    set(f => ({ ...f, bookId: bid, ebookUrl: autoUrl || f.ebookUrl }));
                  }}
                  placeholder="weread 网页版地址复制" />
              </FieldRow>
              <FieldRow label="电子书链接">
                <input style={inputStyle}
                  value={form.ebookUrl} onChange={e => set('ebookUrl', e.target.value)}
                  placeholder="https://weread.qq.com/web/reader/xxx" />
              </FieldRow>
            </div>
          )}
          <FieldRow label="封面链接">
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input style={{ ...inputStyle, flex: 1 }}
                value={form.coverUrl} onChange={e => set('coverUrl', e.target.value)}
                placeholder="https://…cover.jpg（留空显示占位图）" />
              <button type="button" onClick={searchCover} disabled={coverFetching}
                style={{
                  padding: '5px 12px', borderRadius: '10px', fontSize: '11.5px', fontWeight: 600,
                  background: BLUE_LIGHT, color: BLUE_DARK,
                  border: `1px solid ${BLUE_BORDER}`, cursor: coverFetching ? 'not-allowed' : 'pointer',
                  opacity: coverFetching ? 0.7 : 1, whiteSpace: 'nowrap',
                }}>
                {coverFetching ? '搜索中…' : '搜封面'}
              </button>
            </div>
          </FieldRow>
        </div>
      </SectionCard>
    </div>
  );
}

// ===== Tab 1: 读后思考 =====
function InsightsTab({ form, addInsight, updateInsight, removeInsight, insightCount, BLUE, BLUE_DARK, BLUE_BORDER, BLUE_LIGHT, INK, INK_MUTE, INK_LIGHT, CARD_BG, CARD_BORDER, CARD_RADIUS }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: INK }}>读后思考</span>
          <span style={{ fontSize: '10.5px', fontWeight: 700, padding: '1px 8px', borderRadius: '999px', background: BLUE_LIGHT, color: BLUE_DARK }}>
            {insightCount} 组
          </span>
        </div>
        <button type="button" onClick={addInsight} title="添加新思考"
          style={{
            width: '28px', height: '28px', borderRadius: '10px',
            border: `1px solid ${CARD_BORDER}`,
            background: '#fff', color: BLUE,
            cursor: 'pointer', display: 'grid', placeItems: 'center',
          }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
        </button>
      </div>

      {form.insights.length === 0 ? (
        <div style={{
          padding: '14px', textAlign: 'center', fontSize: '11.5px', color: INK_LIGHT,
          background: CARD_BG, borderRadius: CARD_RADIUS, border: `1px dashed ${CARD_BORDER}`,
        }}>
          读完后写下「核心触动」和「应用场景」
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {form.insights.map((ins) => (
            <div key={ins.id} style={{
              padding: '12px', borderRadius: CARD_RADIUS,
              background: '#fff',
              border: `1px solid ${CARD_BORDER}`,
            }}>
              {/* 核心触动 行 */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                <div style={{
                  width: '20px', height: '20px', borderRadius: '5px', flexShrink: 0,
                  background: BLUE, color: '#fff', display: 'grid', placeItems: 'center', marginTop: '3px',
                }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <textarea value={ins.text} onChange={e => updateInsight(ins.id, { text: e.target.value })}
                    placeholder="核心触动 — 哪段话/理念最打动你" rows={1}
                    style={{
                      width: '100%', fontSize: '12px', lineHeight: '1.55', color: INK, fontWeight: 500,
                      border: 'none', borderRadius: '0',
                      padding: '2px 0', resize: 'none', minHeight: '22px', outline: 'none', background: 'transparent',
                    }} />
                </div>
                <button type="button" onClick={() => removeInsight(ins.id)}
                  style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: INK_LIGHT, fontSize: '14px', padding: '2px 4px', lineHeight: 1 }}
                  title="删除">×</button>
              </div>

              {/* 分隔线 */}
              <div style={{ height: '1px', background: CARD_BORDER, margin: '8px 0', marginLeft: '28px' }} />

              {/* 应用场景 行 */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                <div style={{
                  width: '20px', height: '20px', borderRadius: '5px', flexShrink: 0,
                  background: '#f59e0b', color: '#fff', display: 'grid', placeItems: 'center', marginTop: '3px',
                }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/></svg>
                </div>
                <textarea value={ins.scene} onChange={e => updateInsight(ins.id, { scene: e.target.value })}
                  placeholder="应用场景 — 打算具体用在哪件事" rows={1}
                  style={{
                    flex: 1, fontSize: '12px', lineHeight: '1.55', color: INK,
                    border: 'none', outline: 'none', background: 'transparent',
                    padding: '2px 0', resize: 'none', minHeight: '22px',
                  }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ===== Tab 2: 思后行动 =====
function ActionsTab({ form, addAction, updateAction, removeAction, actionCount, BLUE, BLUE_DARK, BLUE_BORDER, BLUE_LIGHT, INK, INK_MUTE, INK_LIGHT, SUCCESS, CARD_BG, CARD_BORDER, CARD_RADIUS }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: INK }}>思后行动</span>
          <span style={{ fontSize: '10.5px', fontWeight: 700, padding: '1px 8px', borderRadius: '999px', background: BLUE_LIGHT, color: BLUE_DARK }}>
            {actionCount} 个
          </span>
        </div>
        <button type="button" onClick={addAction} title="添加新行动"
          style={{
            width: '28px', height: '28px', borderRadius: '10px',
            border: `1px solid ${CARD_BORDER}`,
            background: '#fff', color: BLUE,
            cursor: 'pointer', display: 'grid', placeItems: 'center',
          }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
        </button>
      </div>

      {form.actions.length === 0 ? (
        <div style={{
          padding: '14px', textAlign: 'center', fontSize: '11.5px', color: INK_LIGHT,
          background: CARD_BG, borderRadius: CARD_RADIUS, border: `1px dashed ${CARD_BORDER}`,
        }}>
          从触动和场景里拆解出具体「要做什么」
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {form.actions.map((a) => (
            <div key={a.id} style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '10px 12px', borderRadius: CARD_RADIUS,
              background: '#fff',
              border: `1px solid ${CARD_BORDER}`,
              opacity: a.done ? 0.65 : 1,
            }}>
              {/* 圆形复选框 */}
              <div
                onClick={() => updateAction(a.id, { done: !a.done })}
                style={{
                  width: '20px', height: '20px', borderRadius: '50%', flexShrink: 0,
                  border: `2px solid ${a.done ? BLUE : '#cbd5e1'}`,
                  background: a.done ? BLUE : '#fff',
                  display: 'grid', placeItems: 'center',
                  cursor: 'pointer', transition: 'all .15s',
                }}>
                {a.done && (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                )}
              </div>

              {/* 行动文本 */}
              <textarea value={a.text} onChange={e => updateAction(a.id, { text: e.target.value })}
                placeholder="具体行动是什么" rows={1}
                style={{
                  flex: 1, fontSize: '12px', lineHeight: '1.5',
                  color: a.done ? INK_LIGHT : INK,
                  textDecoration: a.done ? 'line-through' : 'none',
                  border: 'none', outline: 'none', background: 'transparent',
                  padding: '3px 0', resize: 'none', minHeight: '20px',
                }} />

              {/* 删除 */}
              <button type="button" onClick={() => removeAction(a.id)}
                style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: INK_LIGHT, fontSize: '14px', padding: '2px 4px', lineHeight: 1 }}
                title="删除">×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ===== Tab 3: 行后改变 =====
function ChangesTab({ form, addChange, updateChange, removeChange, changeCount, BLUE, BLUE_DARK, BLUE_BORDER, BLUE_LIGHT, INK, INK_MUTE, INK_LIGHT, SUCCESS, CARD_BG, CARD_BORDER, CARD_RADIUS }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: INK }}>行后改变</span>
          <span style={{ fontSize: '10.5px', fontWeight: 700, padding: '1px 8px', borderRadius: '999px', background: BLUE_LIGHT, color: BLUE_DARK }}>
            {changeCount} 个
          </span>
        </div>
        <button type="button" onClick={addChange} title="添加新改变"
          style={{
            width: '28px', height: '28px', borderRadius: '10px',
            border: `1px solid ${CARD_BORDER}`,
            background: '#fff', color: BLUE,
            cursor: 'pointer', display: 'grid', placeItems: 'center',
          }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
        </button>
      </div>

      {form.changes.length === 0 ? (
        <div style={{
          padding: '14px', textAlign: 'center', fontSize: '11.5px', color: INK_LIGHT,
          background: CARD_BG, borderRadius: CARD_RADIUS, border: `1px dashed ${CARD_BORDER}`,
        }}>
          从行动中追踪到的实质性改变
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {form.changes.map((c) => (
            <div key={c.id} style={{
              padding: '10px 12px', borderRadius: CARD_RADIUS,
              background: '#fff',
              border: `1px solid ${CARD_BORDER}`,
              display: 'flex', alignItems: 'center', gap: '8px',
            }}>
              {/* 蓝色圆点 */}
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: BLUE, flexShrink: 0 }}></span>

              {/* 描述 */}
              <textarea value={c.text} onChange={e => updateChange(c.id, { text: e.target.value })}
                placeholder="描述你观察到的改变" rows={1}
                style={{
                  flex: 1, fontSize: '12px', lineHeight: '1.5', color: INK,
                  border: 'none', borderRadius: '0',
                  padding: '2px 0', resize: 'none', minHeight: '20px', outline: 'none', background: 'transparent',
                }} />

              {/* 日期 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: INK_LIGHT }}>
                  <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                <input type="date" value={c.startDate || ''} onChange={e => updateChange(c.id, { startDate: e.target.value })}
                  style={{
                    fontSize: '11px', color: INK_MUTE,
                    border: 'none', outline: 'none', background: 'transparent',
                    width: '95px', cursor: 'pointer',
                  }} />
              </div>

              {/* 删除 */}
              <button type="button" onClick={() => removeChange(c.id)}
                style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: INK_LIGHT, fontSize: '14px', padding: '2px 4px', lineHeight: 1 }}
                title="删除">×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
