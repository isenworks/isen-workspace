import { useState } from 'react';
import { LABEL_STYLE, INPUT_STYLE } from '../../utils/uiConstants.js';

const BLUE = '#3b82f6';
const BLUE_DARK = '#2563eb';
const BLUE_LIGHT = '#eff6ff';
const BLUE_BORDER = '#bfdbfe';
const BLUE_SOFT = '#dbeafe';
const INK = '#1c1c1e';
const INK_MUTE = '#64748b';
const INK_LIGHT = '#94a3b8';
const DANGER = '#ef4444';
const SUCCESS = '#22c55e';
const YELLOW = '#f59e0b';

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

const TABS = [
  { key: 'basic',     label: '基础信息', icon: 'book' },
  { key: 'insights',  label: '读后思考', icon: 'bulb' },
  { key: 'actions',   label: '思后行动', icon: 'check' },
  { key: 'changes',   label: '行后改变', icon: 'zap' },
];

export default function BookForm({ initial, onSaved, onCancel, onDelete }) {
  const isEdit = !!(initial && initial.id);
  const [activeTab, setActiveTab] = useState('basic');
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

  const resonanceColor = (r) => r >= 9 ? BLUE_DARK : r >= 7 ? BLUE : INK_LIGHT;
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
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%2360a5fa' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
      {/* ===== Hero: 书籍预览条 ===== */}
      <div style={{
        display: 'flex', gap: '10px', alignItems: 'center',
        padding: '10px 14px',
        background: `linear-gradient(135deg, ${BLUE}08 0%, rgba(120,120,128,0.03) 100%)`,
        borderBottom: `1px solid ${BLUE_BORDER}66`,
      }}>
        {/* 封面缩略图(缩小) */}
        <div style={{
          width: '36px', height: '50px', borderRadius: '5px', flexShrink: 0,
          overflow: 'hidden', border: `1px solid ${BLUE_BORDER}`,
          background: BLUE_LIGHT,
          boxShadow: '0 2px 6px rgba(15,23,42,0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {form.coverUrl ? (
            <img src={form.coverUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          ) : (
            <span style={{ fontSize: '12px', fontWeight: 800, color: BLUE_DARK, opacity: 0.45 }}>
              {(form.t || '书').charAt(0)}
            </span>
          )}
        </div>

        {/* 书籍信息 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {form.t || '未命名书籍'}
          </div>
          <div style={{ fontSize: '11px', color: INK_MUTE, marginTop: '1px', display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
            {form.author && <span>{form.author}</span>}
            {form.author && <span>·</span>}
            <span style={{ color: BLUE_DARK, fontWeight: 600 }}>{form.cat}</span>
            <span>·</span>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '3px',
              padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600,
              background: form.st === 'done' ? 'rgba(34,197,94,0.12)' : form.st === 'reading' ? BLUE_SOFT : '#f8fafc',
              color: form.st === 'done' ? SUCCESS : form.st === 'reading' ? BLUE_DARK : INK_LIGHT,
            }}>
              {STATUSES.find(s => s.v === form.st)?.lb || '未开始'}
            </span>
          </div>
        </div>

        {/* 统计徽章 */}
        <div style={{ display: 'flex', gap: '5px', flexShrink: 0 }}>
          {[
            { n: insightCount, l: '思考' },
            { n: actionCount, l: '行动' },
            { n: changeCount, l: '改变' },
          ].map(s => (
            <div key={s.l} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              padding: '2px 6px', borderRadius: '6px',
              background: '#fff', border: `1px solid ${BLUE_BORDER}66`, minWidth: '36px',
            }}>
              <div style={{ fontSize: '12px', fontWeight: 800, color: INK }}>{s.n}</div>
              <div style={{ fontSize: '8px', fontWeight: 600, color: INK_LIGHT, letterSpacing: '0.02em' }}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ===== Tab 栏 ===== */}
      <div style={{
        display: 'flex', gap: '1px',
        padding: '6px 10px 0',
        background: '#fff',
        borderBottom: `1px solid ${BLUE_BORDER}66`,
      }}>
        {TABS.map(t => {
          const active = activeTab === t.key;
          const badge = tabBadge(t.key);
          return (
            <button key={t.key} type="button"
              onClick={() => setActiveTab(t.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: '4px',
                padding: '6px 9px 7px',
                borderRadius: '8px 8px 0 0',
                fontSize: '11.5px',
                fontWeight: active ? 700 : 500,
                color: active ? BLUE_DARK : INK_MUTE,
                background: active ? BLUE_LIGHT : 'transparent',
                borderBottom: `2px solid ${active ? BLUE_DARK : 'transparent'}`,
                border: 'none',
                borderBottomWidth: '2px',
                borderBottomStyle: 'solid',
                borderBottomColor: active ? BLUE_DARK : 'transparent',
                cursor: 'pointer',
                transition: 'all .15s',
              }}>
              <TabIcon name={t.icon} active={active} />
              {t.label}
              {badge && (
                <span style={{
                  fontSize: '9px', fontWeight: 700,
                  padding: '0px 5px', borderRadius: '999px',
                  background: active ? BLUE_DARK : BLUE_SOFT,
                  color: active ? '#fff' : BLUE_DARK,
                  minWidth: '14px', textAlign: 'center',
                }}>{badge}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* ===== Tab 内容 ===== */}
      <div style={{ padding: '12px 14px', minHeight: '260px' }}>
        {activeTab === 'basic' && <BasicTab form={form} set={set} setStatus={setStatus} setPct={setPct} searchCover={searchCover} coverFetching={coverFetching} isEbook={isEbook} SELECT_STYLE={SELECT_STYLE} INPUT_STYLE={INPUT_STYLE} BLUE_DARK={BLUE_DARK} BLUE_BORDER={BLUE_BORDER} BLUE_LIGHT={BLUE_LIGHT} SUCCESS={SUCCESS} INK={INK} INK_MUTE={INK_MUTE} INK_LIGHT={INK_LIGHT} />}
        {activeTab === 'insights' && <InsightsTab form={form} addInsight={addInsight} updateInsight={updateInsight} removeInsight={removeInsight} insightCount={insightCount} BLUE_DARK={BLUE_DARK} BLUE_BORDER={BLUE_BORDER} BLUE_LIGHT={BLUE_LIGHT} BLUE={BLUE} INK={INK} INK_MUTE={INK_MUTE} INK_LIGHT={INK_LIGHT} YELLOW={YELLOW} />}
        {activeTab === 'actions' && <ActionsTab form={form} addAction={addAction} updateAction={updateAction} removeAction={removeAction} actionCount={actionCount} BLUE_DARK={BLUE_DARK} BLUE_BORDER={BLUE_BORDER} BLUE_LIGHT={BLUE_LIGHT} BLUE={BLUE} INK={INK} INK_MUTE={INK_MUTE} INK_LIGHT={INK_LIGHT} SUCCESS={SUCCESS} />}
        {activeTab === 'changes' && <ChangesTab form={form} addChange={addChange} updateChange={updateChange} removeChange={removeChange} changeCount={changeCount} BLUE_DARK={BLUE_DARK} BLUE_BORDER={BLUE_BORDER} BLUE_LIGHT={BLUE_LIGHT} BLUE={BLUE} INK={INK} INK_MUTE={INK_MUTE} INK_LIGHT={INK_LIGHT} SUCCESS={SUCCESS} />}
      </div>

      {/* ===== 底部按钮 ===== */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '10px 14px', borderTop: `1px solid ${BLUE_BORDER}66`, background: '#fafbfc' }}>
        <div>{isEdit && <button onClick={del} style={BTN_DANGER}>删除</button>}</div>
        <div style={{ display: 'flex', gap: '7px' }}>
          <button onClick={onCancel} style={BTN_GHOST}>取消</button>
          <button onClick={submit} style={BTN_PRIMARY}>{isEdit ? '保存' : '添加'}</button>
        </div>
      </div>
    </div>
  );
}

// ===== Tab 图标 =====
function TabIcon({ name, active }) {
  const c = active ? '#3b82f6' : '#64748b';
  const common = { width: '13px', height: '13px', stroke: c, fill: 'none', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' };
  if (name === 'book') return (
    <svg viewBox="0 0 24 24" {...common}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
  );
  if (name === 'bulb') return (
    <svg viewBox="0 0 24 24" {...common}><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.74V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.26A7 7 0 0 0 12 2z"/></svg>
  );
  if (name === 'check') return (
    <svg viewBox="0 0 24 24" {...common}><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
  );
  if (name === 'zap') return (
    <svg viewBox="0 0 24 24" {...common}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
  );
  return null;
}

// ===== 子组件:行内 Field =====
function FieldRow({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
      <span style={{ fontSize: '10.5px', fontWeight: 600, color: BLUE_DARK, opacity: 0.85, letterSpacing: 0.1 }}>{label}</span>
      {children}
    </div>
  );
}

// ===== Tab 0: 基础信息 =====
function BasicTab({ form, set, setStatus, setPct, searchCover, coverFetching, isEbook, SELECT_STYLE, INPUT_STYLE, BLUE_DARK, BLUE_BORDER, BLUE_LIGHT, SUCCESS, INK, INK_MUTE, INK_LIGHT }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* 行1:书名+作者+分类+来源 */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '8px' }}>
        <FieldRow label="书名">
          <input className="form-input" style={{ ...INPUT_STYLE, fontSize: '12.5px', fontWeight: 600 }}
            value={form.t} onChange={e => set('t', e.target.value)} placeholder="书名" autoFocus />
        </FieldRow>
        <FieldRow label="作者">
          <input className="form-input" style={{ ...INPUT_STYLE, fontSize: '12px' }}
            value={form.author} onChange={e => set('author', e.target.value)} placeholder="作者" />
        </FieldRow>
        <FieldRow label="分类">
          <select className="form-input" style={{ ...SELECT_STYLE, fontSize: '12px' }}
            value={form.cat} onChange={e => set('cat', e.target.value)}>
            {['认知成长', '人际沟通', '商业职场', '人文叙事'].map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </FieldRow>
        <FieldRow label="来源">
          <select className="form-input" style={{ ...SELECT_STYLE, fontSize: '12px' }}
            value={form.src} onChange={e => set('src', e.target.value)}>
            {['纸质书', '电子书', '有声书', '网络'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </FieldRow>
      </div>

      {/* 行2:阅读状态+进度 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '8px' }}>
        <FieldRow label="阅读状态">
          <select className="form-input" style={{ ...SELECT_STYLE, fontSize: '12px', fontWeight: 700,
            color: form.st === 'done' ? SUCCESS : form.st === 'reading' ? BLUE_DARK : INK_MUTE,
            background: form.st === 'done' ? '#ecfdf5' : form.st === 'reading' ? BLUE_LIGHT : '#fff',
          }}
            value={form.st} onChange={e => setStatus(e.target.value)}>
            {[{ v: 'pending', lb: '未开始' }, { v: 'reading', lb: '阅读中' }, { v: 'done', lb: '已读完' }, { v: 'abandoned', lb: '已弃读' }].map(s => <option key={s.v} value={s.v}>{s.lb}</option>)}
          </select>
        </FieldRow>
        <FieldRow label={`进度 ${form.pct}%`}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, height: '30px',
            padding: '0 10px', background: '#fff', borderRadius: '8px', border: `1px solid ${BLUE_BORDER}` }}>
            <input type="range" min="0" max="100" step="1"
              value={form.pct} onChange={e => setPct(e.target.value)}
              style={{ flex: 1, accentColor: BLUE_DARK, height: '16px', minWidth: 0 }} />
            <span style={{ fontSize: '11px', fontWeight: 800, color: BLUE_DARK, tabularNums: true, minWidth: '28px', textAlign: 'right' }}>
              {form.pct}
            </span>
          </div>
        </FieldRow>
      </div>

      {/* 行3:开始+结束阅读 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        <FieldRow label="开始阅读">
          <input type="date" className="form-input" style={{ ...INPUT_STYLE, fontSize: '12px' }}
            value={form.startDate} onChange={e => set('startDate', e.target.value)} />
        </FieldRow>
        <FieldRow label="结束阅读">
          <input type="date" className="form-input" style={{ ...INPUT_STYLE, fontSize: '12px' }}
            value={form.endDate} onChange={e => set('endDate', e.target.value)} />
        </FieldRow>
      </div>

      {/* 行4:BookID(仅电子书) */}
      {isEbook && (
        <FieldRow label="微信读书 BookID">
          <input className="form-input" style={{ ...INPUT_STYLE, fontSize: '12px' }}
            value={form.bookId}
            onChange={e => {
              const bid = e.target.value.trim();
              const valid = /^[a-z0-9]{20,}$/i.test(bid.replace(/-/g, ''));
              const autoUrl = valid ? `https://weread.qq.com/web/reader/${bid}` : '';
              set(f => ({ ...f, bookId: bid, ebookUrl: autoUrl || f.ebookUrl }));
            }}
            placeholder="e1e32b00729fc94fe1e824d · 从 weread 网页版地址中复制" />
        </FieldRow>
      )}

      {/* 行5:电子书链接(仅电子书) */}
      {isEbook && (
        <FieldRow label="电子书链接 / weread 协议">
          <input className="form-input" style={{ ...INPUT_STYLE, fontSize: '12px' }}
            value={form.ebookUrl} onChange={e => set('ebookUrl', e.target.value)}
            placeholder="https://weread.qq.com/web/reader/xxx · 自动从 BookID 生成，也可自定义" />
        </FieldRow>
      )}

      {/* 行6:封面链接+搜封面(移到最下面) */}
      <FieldRow label="封面链接(微信读书/豆瓣/Google 图书链接)">
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <input className="form-input" style={{ ...INPUT_STYLE, fontSize: '12px', flex: 1 }}
            value={form.coverUrl} onChange={e => set('coverUrl', e.target.value)}
            placeholder="https://…cover_1.jpg(留空则显示分类占位图)" />
          <button type="button" onClick={searchCover} disabled={coverFetching}
            style={{
              padding: '5px 11px', borderRadius: '8px', fontSize: '11px', fontWeight: 600,
              background: 'rgba(59,130,246,0.06)', color: BLUE_DARK,
              border: `1px solid ${BLUE_BORDER}`, cursor: coverFetching ? 'not-allowed' : 'pointer',
              opacity: coverFetching ? 0.7 : 1, whiteSpace: 'nowrap',
            }}>
            {coverFetching ? '搜索中…' : '🔍 搜封面'}
          </button>
        </div>
      </FieldRow>
    </div>
  );
}

// ===== Tab 1: 读后思考 =====
function InsightsTab({ form, addInsight, updateInsight, removeInsight, insightCount, BLUE_DARK, BLUE_BORDER, BLUE_LIGHT, BLUE, INK, INK_MUTE, INK_LIGHT, YELLOW }) {
  return (
    <div>
      {/* 标题行 + 计数 + 添加按钮 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: INK }}>读后思考</span>
          <span style={{ fontSize: '10px', fontWeight: 700, padding: '1px 7px', borderRadius: '999px', background: BLUE_LIGHT, color: BLUE_DARK }}>
            {insightCount} 组思考
          </span>
        </div>
        <button type="button" onClick={addInsight} title="添加新思考"
          style={{
            width: '26px', height: '26px', borderRadius: '7px',
            border: `1.5px solid ${BLUE_BORDER}`,
            background: BLUE_LIGHT, color: BLUE_DARK,
            cursor: 'pointer', display: 'grid', placeItems: 'center',
            transition: 'all .15s',
          }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
        </button>
      </div>

      {form.insights.length === 0 ? (
        <div style={{ padding: '10px', textAlign: 'center', fontSize: '11.5px', color: INK_LIGHT, background: BLUE_LIGHT, borderRadius: '7px', border: `1px dashed ${BLUE_BORDER}` }}>
          读完后写下「核心触动」和打算怎么「应用到生活」
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {form.insights.map((ins, idx) => (
            <div key={ins.id} style={{
              padding: '10px 12px', borderRadius: '10px',
              background: `linear-gradient(135deg, ${BLUE}08 0%, ${BLUE}04 100%)`,
              border: `1px solid ${BLUE}1f`,
            }}>
              {/* 核心触动(蓝色填充图标) */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                <div style={{
                  width: '22px', height: '22px', borderRadius: '6px', flexShrink: 0,
                  background: BLUE_DARK, color: '#fff', display: 'grid', placeItems: 'center',
                }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
                  </svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: INK_MUTE, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '1px' }}>核心触动</div>
                  <textarea value={ins.text} onChange={e => updateInsight(ins.id, { text: e.target.value })}
                    placeholder="哪段话/理念最打动你" rows={1}
                    style={{
                      width: '100%', fontSize: '12px', lineHeight: '1.5', color: INK,
                      border: '1px solid rgba(59,130,246,0.1)', borderRadius: '5px',
                      padding: '4px 7px', resize: 'none', minHeight: '22px', outline: 'none', background: '#fff',
                    }} />
                </div>
              </div>

              {/* 应用场景(黄色填充图标) */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginTop: '8px' }}>
                <div style={{
                  width: '22px', height: '22px', borderRadius: '6px', flexShrink: 0,
                  background: YELLOW, color: '#fff', display: 'grid', placeItems: 'center',
                }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/>
                  </svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: INK_MUTE, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '1px' }}>应用场景</div>
                  <textarea value={ins.scene} onChange={e => updateInsight(ins.id, { scene: e.target.value })}
                    placeholder="打算具体用在哪件事/场景" rows={1}
                    style={{
                      width: '100%', fontSize: '12px', lineHeight: '1.5', color: INK,
                      border: `1px solid ${BLUE_BORDER}`, borderRadius: '5px',
                      padding: '4px 7px', resize: 'none', minHeight: '22px', outline: 'none',
                      background: BLUE_LIGHT,
                    }} />
                </div>
              </div>

              {/* 共鸣 + 操作 */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px', paddingLeft: '30px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flex: 1 }}>
                  <span style={{ fontSize: '9.5px', color: INK_LIGHT, fontWeight: 500 }}>共鸣</span>
                  <input type="range" min="1" max="10" step="1"
                    value={ins.resonance}
                    onChange={e => updateInsight(ins.id, { resonance: Number(e.target.value) })}
                    style={{ flex: 1, accentColor: resonanceColor(ins.resonance), height: '3px' }} />
                  <span style={{ fontSize: '10px', fontWeight: 700, color: resonanceColor(ins.resonance), minWidth: '15px', textAlign: 'right', tabularNums: true }}>{ins.resonance}</span>
                </div>
                <div style={{ display: 'flex', gap: '5px' }}>
                  <button type="button" onClick={() => removeInsight(ins.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', fontSize: '13px', padding: '1px 2px', lineHeight: 1 }}
                    title="删除">×</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function resonanceColor(r) {
  return r >= 9 ? '#2563eb' : r >= 7 ? '#3b82f6' : '#94a3b8';
}

// ===== Tab 2: 思后行动 =====
function ActionsTab({ form, addAction, updateAction, removeAction, actionCount, BLUE_DARK, BLUE_BORDER, BLUE_LIGHT, BLUE, INK, INK_MUTE, INK_LIGHT, SUCCESS }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: INK }}>思后行动</span>
          <span style={{ fontSize: '10px', fontWeight: 700, padding: '1px 7px', borderRadius: '999px', background: BLUE_LIGHT, color: BLUE_DARK }}>
            {actionCount} 个行动计划
          </span>
        </div>
        <button type="button" onClick={addAction} title="添加新行动"
          style={{
            width: '26px', height: '26px', borderRadius: '7px',
            border: `1.5px solid ${BLUE_BORDER}`,
            background: BLUE_LIGHT, color: BLUE_DARK,
            cursor: 'pointer', display: 'grid', placeItems: 'center',
            transition: 'all .15s',
          }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
        </button>
      </div>

      {form.actions.length === 0 ? (
        <div style={{ padding: '10px', textAlign: 'center', fontSize: '11.5px', color: INK_LIGHT, background: BLUE_LIGHT, borderRadius: '7px', border: `1px dashed ${BLUE_BORDER}` }}>
          从触动和场景里拆解出具体「要做什么」
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {form.actions.map((a, idx) => (
            <div key={a.id} style={{
              display: 'flex', alignItems: 'flex-start', gap: '8px',
              padding: '10px 12px', borderRadius: '10px',
              background: a.done ? 'rgba(34,197,94,0.05)' : `${BLUE}06`,
              border: `1px solid ${a.done ? 'rgba(34,197,94,0.14)' : `${BLUE}1a`}`,
            }}>
              {/* 复选框 */}
              <div
                onClick={() => updateAction(a.id, { done: !a.done })}
                style={{
                  width: '20px', height: '20px', borderRadius: '5px', flexShrink: 0,
                  border: `2px solid ${a.done ? SUCCESS : '#d1d1d6'}`,
                  background: a.done ? SUCCESS : 'transparent',
                  display: 'grid', placeItems: 'center',
                  cursor: 'pointer', marginTop: '1px', transition: 'all .15s',
                }}>
                {a.done && (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                )}
              </div>

              {/* 行动内容 */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <textarea value={a.text} onChange={e => updateAction(a.id, { text: e.target.value })}
                  placeholder={`第${idx + 1}条 · 具体行动`} rows={1}
                  style={{
                    width: '100%', fontSize: '12px', lineHeight: '1.5',
                    color: a.done ? INK_MUTE : INK,
                    textDecoration: a.done ? 'line-through' : 'none',
                    border: '1px solid rgba(15,23,42,0.06)', borderRadius: '5px',
                    padding: '4px 7px', resize: 'none', minHeight: '22px', outline: 'none', background: '#fff',
                  }} />
              </div>

              {/* 删除 */}
              <button type="button" onClick={() => removeAction(a.id)}
                style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', fontSize: '13px', padding: '1px 2px', lineHeight: 1 }}
                title="删除">×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ===== Tab 3: 行后改变 =====
function ChangesTab({ form, addChange, updateChange, removeChange, changeCount, BLUE_DARK, BLUE_BORDER, BLUE_LIGHT, BLUE, INK, INK_MUTE, INK_LIGHT, SUCCESS }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: INK }}>行后改变</span>
          <span style={{ fontSize: '10px', fontWeight: 700, padding: '1px 7px', borderRadius: '999px', background: BLUE_LIGHT, color: BLUE_DARK }}>
            {changeCount} 个改变
          </span>
        </div>
        <button type="button" onClick={addChange} title="添加新改变"
          style={{
            width: '26px', height: '26px', borderRadius: '7px',
            border: `1.5px solid ${BLUE_BORDER}`,
            background: BLUE_LIGHT, color: BLUE_DARK,
            cursor: 'pointer', display: 'grid', placeItems: 'center',
            transition: 'all .15s',
          }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
        </button>
      </div>

      {form.changes.length === 0 ? (
        <div style={{ padding: '10px', textAlign: 'center', fontSize: '11.5px', color: INK_LIGHT, background: BLUE_LIGHT, borderRadius: '7px', border: `1px dashed ${BLUE_BORDER}` }}>
          从行动中追踪到的实质性改变
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {form.changes.map((c) => (
            <div key={c.id} style={{
              padding: '10px 12px', borderRadius: '10px',
              background: `linear-gradient(135deg, ${BLUE}08 0%, ${BLUE}04 100%)`,
              border: `1px solid ${BLUE}1f`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
            }}>
              {/* 蓝色圆点 + 描述 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: BLUE_DARK, flexShrink: 0 }}></span>
                <textarea value={c.text} onChange={e => updateChange(c.id, { text: e.target.value })}
                  placeholder="描述你观察到的改变" rows={1}
                  style={{
                    flex: 1, fontSize: '12px', lineHeight: '1.5', color: INK,
                    border: 'none', borderRadius: '5px',
                    padding: '3px 6px', resize: 'none', minHeight: '20px', outline: 'none', background: 'transparent',
                  }} />
              </div>

              {/* 日期 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '3px', flexShrink: 0 }}>
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
                style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', fontSize: '13px', padding: '1px 2px', lineHeight: 1 }}
                title="删除">×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
