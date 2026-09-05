import { useMemo, useState } from 'react';
import { LABEL_STYLE, INPUT_STYLE } from '../../utils/uiConstants.js';

const BTN_GHOST = { padding: '6px 14px', borderRadius: '9px', fontSize: '13px', fontWeight: '600', background: 'rgba(120,120,128,0.12)', color: '#1c1c1e', border: 'none', cursor: 'pointer', transition: 'all .15s' };
const BTN_PRIMARY = { padding: '6px 14px', borderRadius: '9px', fontSize: '13px', fontWeight: '600', background: 'var(--m-life)', color: '#fff', border: 'none', cursor: 'pointer', transition: 'all .15s', boxShadow: '0 2px 8px rgba(var(--m-life-rgb),0.25)' };
const BTN_DANGER = { padding: '6px 14px', borderRadius: '9px', fontSize: '13px', fontWeight: '600', background: 'rgba(255,59,48,0.08)', color: '#FF3B30', border: 'none', cursor: 'pointer', transition: 'all .15s' };

/* 面板配色统一：所有模块（含新建）不再区分类目色，全部跟随生活模块紫 var(--m-life) */
const ACCENT = 'var(--m-life)';

export default function EntryForm({ initial, categoryLabel, onSaved, onCancel, onDelete, lifeCategories, onAddCategory }) {
  const isEdit = !!(initial && initial.id);
  const today = new Date().toISOString().slice(0, 10);
  // initial.d 可能是 M.D / M.D-M.D / YYYY-MM-DD 等混合格式 → 拆为开始/结束日期回填（结束日期可选）
  const initialRange = (() => {
    const toISO = (s) => {
      if (!s) return '';
      if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) return s;
      const md = String(s).match(/^(\d{1,2})\.(\d{1,2})/);
      if (md) return `${new Date().getFullYear()}-${String(md[1]).padStart(2,'0')}-${String(md[2]).padStart(2,'0')}`;
      return '';
    };
    const raw = String(initial?.d || '');
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(raw)) return { s: raw, e: '' };
    const m = raw.match(/^(\d{1,2}\.\d{1,2})-(\d{1,2}\.\d{1,2})$/);
    if (m) return { s: toISO(m[1]), e: toISO(m[2]) };
    const one = toISO(raw);
    return { s: one || today, e: '' };
  })();
  const [form, setForm] = useState({
    t: initial?.t || '',
    n: initial?.n || '',
    d: initialRange.s || today,
    dEnd: initialRange.e || '',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // 选中的模块 key：编辑态固定为 initial.lifeKey（不可切换，避免移动错类目）；新增态 default lifeCategories[0]
  const [selectedKey, setSelectedKey] = useState(() => {
    if (initial?.lifeKey) return initial.lifeKey;
    if (Array.isArray(lifeCategories) && lifeCategories[0]) return lifeCategories[0].key;
    return '';
  });

  // 新建模块 mini 面板：是否展开（颜色不再可选，统一模块紫）
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCatLb, setNewCatLb] = useState('');

  // 为了 chip 渲染：LIFE 现有类目 + 实时新增项（如果 onAddCategory 有回写 parent，lifeCategories 会变）
  const cats = useMemo(() => Array.isArray(lifeCategories) ? lifeCategories : [], [lifeCategories]);
  const selCat = cats.find(c => c.key === selectedKey) || null;

  // type="date" 返回 YYYY-MM-DD → 转为 LIFE 约定的 M.D 格式；结束日期存在时拼为 M.D-M.D
  function normalizeDate(d = '') {
    if (!d) return '';
    const m = String(d).match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) return `${Number(m[2])}.${Number(m[3])}`;
    return d;
  }

  function submit() {
    if (!form.t.trim()) { alert('请输入标题'); return; }
    if (!isEdit && !selectedKey) { alert('请先选择一个模块，或点「+ 新建模块」创建新模块后再记录'); return; }
    if (form.dEnd && form.dEnd < form.d) { alert('结束日期不能早于开始日期'); return; }
    const dStr = form.dEnd && form.dEnd !== form.d
      ? `${normalizeDate(form.d)}-${normalizeDate(form.dEnd)}`
      : normalizeDate(form.d);
    const payload = {
      t: form.t.trim(), n: form.n, d: dStr,
      id: initial?.id,
      lifeKey: isEdit ? initial.lifeKey : selectedKey,
      entryIdx: initial?.entryIdx,
    };
    onSaved?.(payload);
  }

  function del() {
    if (!isEdit) return;
    if (!confirm('确认删除这条记录？')) return;
    onDelete?.({ lifeKey: initial.lifeKey, entryIdx: initial.entryIdx });
  }

  function createCategory() {
    const lb = newCatLb.trim();
    if (!lb) { alert('请输入模块名，如「健康」「运动」「书单」'); return; }
    const res = onAddCategory?.({ lb });
    // onAddCategory 约定：成功后返回 { key }；若返回 undefined，则父组件会自动回写 lifeCategories，本组件此处只关闭面板
    if (res && res.key) {
      setSelectedKey(res.key);
    }
    setNewCatLb('');
    setShowNewCat(false);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* ===== 模块选择器：新增态可自由选择；编辑态显示当前分类（只读色卡 chip） ===== */}
      <div>
        <label style={{ ...LABEL_STYLE, marginBottom: '6px', display: 'block' }}>
          {isEdit ? '所属模块（编辑时不可更改）' : '选择模块，或创建新的生活模块'}
        </label>

        {/* Chip 列表 */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {cats.map(c => {
            const active = c.key === selectedKey;
            const disabled = isEdit && c.key !== initial.lifeKey;
            return (
              <button
                key={c.key}
                type="button"
                disabled={disabled}
                onClick={() => !disabled && setSelectedKey(c.key)}
                title={c.lb}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                  padding: '5px 10px', borderRadius: '10px',
                  border: `1px solid ${active ? ACCENT : 'rgba(15,23,42,0.10)'}`,
                  background: active ? 'rgba(var(--m-life-rgb),0.07)' : 'rgba(15,23,42,0.03)',
                  color: active ? ACCENT : '#1c1c1e',
                  fontWeight: 600, fontSize: '12px', lineHeight: 1.2,
                  opacity: disabled ? 0.45 : 1,
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  transition: 'all .15s',
                }}
              >
                <span style={{ width: '8px', height: '8px', borderRadius: '999px', background: ACCENT, display: 'inline-block', flexShrink: 0 }} />
                <span style={{ maxWidth: '110px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.lb}</span>
              </button>
            );
          })}

          {/* + 新建模块 chip：展开 mini 面板 */}
          {!isEdit && (
            <button
              type="button"
              onClick={() => setShowNewCat(v => !v)}
              title="新建生活模块"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '4px',
                padding: '5px 9px', borderRadius: '10px',
                border: `1px dashed ${showNewCat ? ACCENT : 'rgba(var(--m-life-rgb),0.45)'}`,
                background: showNewCat ? 'rgba(var(--m-life-rgb),0.08)' : 'rgba(var(--m-life-rgb),0.04)',
                color: ACCENT, fontWeight: 700, fontSize: '12px', lineHeight: 1.2,
                cursor: 'pointer', transition: 'all .15s',
              }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
              新建模块
            </button>
          )}
        </div>

        {/* 新建模块 mini Form（展开时显示） */}
        {showNewCat && !isEdit && (
          <div style={{
            marginTop: '8px', padding: '10px 12px', borderRadius: '12px',
            background: 'rgba(var(--m-life-rgb),0.05)',
            border: '1px solid rgba(var(--m-life-rgb),0.18)',
            display: 'flex', flexDirection: 'column', gap: '8px',
          }}>
            <div>
              <label style={{ ...LABEL_STYLE, fontSize: '11px', color: ACCENT }}>模块名</label>
              <input
                className="form-input"
                style={{ ...INPUT_STYLE, height: '32px', fontSize: '13px' }}
                placeholder="例如：运动 / 健康 / 书单 / 探店"
                value={newCatLb}
                onChange={e => setNewCatLb(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); createCategory(); } }}
              />
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button type="button" style={BTN_GHOST} onClick={() => { setShowNewCat(false); setNewCatLb(''); }}>取消</button>
              <button type="button" style={BTN_PRIMARY} onClick={createCategory}>创建</button>
            </div>
          </div>
        )}
      </div>

      {/* 选中态信息卡：新增态显示当前选中模块 / 编辑态显示所属模块（替换旧的 categoryLabel） */}
      {selCat && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            fontSize: '12px', fontWeight: 700, letterSpacing: '0.03em',
            background: 'rgba(var(--m-life-rgb),0.07)', color: ACCENT,
            padding: '4px 10px', borderRadius: '8px', display: 'inline-block',
            border: '1px solid rgba(var(--m-life-rgb),0.15)',
          }}>
            · {selCat.lb}
          </span>
          {!isEdit && (
            <span style={{ fontSize: '11px', color: '#8e8e93' }}>
              记录将添加到「{selCat.lb}」模块
            </span>
          )}
        </div>
      )}

      <div>
        <label style={LABEL_STYLE}>标题</label>
        <input className="form-input" style={INPUT_STYLE}
          value={form.t} onChange={e => set('t', e.target.value)}
          placeholder="例如：给妈妈打电话 30 分钟" autoFocus />
      </div>
      <div>
        <label style={LABEL_STYLE}>备注</label>
        <textarea className="form-input" style={{ ...INPUT_STYLE, minHeight: '60px', resize: 'vertical' }}
          value={form.n} onChange={e => set('n', e.target.value)}
          placeholder="记下让你印象深刻的细节..." />
      </div>
      {/* 日期 · 开始日期 + 结束日期（旅游等多天记录用；复用工作台 ScheduleForm 双列设计） */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div>
          <label style={LABEL_STYLE}>开始日期</label>
          <input className="form-input" style={INPUT_STYLE} type="date"
            value={form.d} onChange={e => set('d', e.target.value)} />
        </div>
        <div>
          <label style={LABEL_STYLE}>
            结束日期
            <span style={{ fontSize: '10px', fontWeight: '500', color: '#aeaeb2', marginLeft: '4px' }}>可选</span>
          </label>
          <div style={{ position: 'relative' }}>
            <input className="form-input" style={{ ...INPUT_STYLE, paddingRight: form.dEnd ? '30px' : undefined }} type="date"
              value={form.dEnd} onChange={e => set('dEnd', e.target.value)} />
            {form.dEnd && (
              <button
                type="button"
                onClick={() => set('dEnd', '')}
                title="清除结束日期"
                aria-label="清除结束日期"
                style={{
                  position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
                  width: '20px', height: '20px', borderRadius: '999px', border: 'none',
                  background: 'rgba(120,120,128,0.16)', color: '#8e8e93',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', fontSize: '12px', lineHeight: '1'
                }}
              >×</button>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', paddingTop: '4px' }}>
        <div>{isEdit && <button onClick={del} style={BTN_DANGER}>删除</button>}</div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={onCancel} style={BTN_GHOST}>取消</button>
          <button onClick={submit} style={BTN_PRIMARY}>
            {isEdit ? '保存' : '添加'}
          </button>
        </div>
      </div>
    </div>
  );
}
