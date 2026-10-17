import { useMemo, useState } from 'react';
import { useFormSubmit } from '../../utils/formSubmitBus.js';
import { LABEL_STYLE, INPUT_STYLE } from '../../utils/uiConstants.js';
import { useToast } from '../../context/ToastContext.jsx';
import ConfirmAlert from '../ConfirmAlert.jsx';

const BTN_GHOST = { padding: '6px 14px', borderRadius: '9px', fontSize: '13px', fontWeight: '600', background: 'rgba(120,120,128,0.12)', color: 'var(--text-1)', border: 'none', cursor: 'pointer', transition: 'all .15s' };
const BTN_PRIMARY = { padding: '6px 14px', borderRadius: '9px', fontSize: '13px', fontWeight: '600', background: 'var(--m-life)', color: 'var(--surface-card)', border: 'none', cursor: 'pointer', transition: 'all .15s', boxShadow: '0 2px 8px rgba(var(--m-life-rgb),0.25)' };
const BTN_DANGER = { padding: '6px 14px', borderRadius: '9px', fontSize: '13px', fontWeight: '600', background: 'rgba(255,59,48,0.08)', color: 'var(--danger)', border: 'none', cursor: 'pointer', transition: 'all .15s' };

/* 面板配色统一：所有模块（含新建）不再区分类目色，全部跟随生活模块紫 var(--m-life) */
const ACCENT = 'var(--m-life)';

export default function EntryForm({ initial, categoryLabel, onSaved, onCancel, onDelete, lifeCategories, onAddCategory }) {
  const toast = useToast();
  const isEdit = !!(initial && initial.id);
  const [confirmOpen, setConfirmOpen] = useState(false);
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
  // 编辑态只读展示当前类目；类目已被删除时回退到父级传入的 categoryLabel
  const editCat = cats.find(c => c.key === initial?.lifeKey)
    || (initial?.lifeKey ? { key: initial.lifeKey, lb: categoryLabel || initial.lifeKey } : null);

  // type="date" 返回 YYYY-MM-DD → 转为 LIFE 约定的 M.D 格式；结束日期存在时拼为 M.D-M.D
  function normalizeDate(d = '') {
    if (!d) return '';
    const m = String(d).match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) return `${Number(m[2])}.${Number(m[3])}`;
    return d;
  }

  // Ctrl+S 优先提交本表单（无表单打开时 Ctrl+S 才走全局同步）
  useFormSubmit(submit);

  function submit() {
    if (!form.t.trim()) { toast.warn('请输入标题'); return; }
    if (!isEdit && !selectedKey) { toast.warn('请先选择一个类目，或点「+」新建类目后再记录'); return; }
    if (form.dEnd && form.dEnd < form.d) { toast.warn('结束日期不能早于开始日期'); return; }
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
    setConfirmOpen(true);
  }

  function doDelete() {
    setConfirmOpen(false);
    onDelete?.({ lifeKey: initial.lifeKey, entryIdx: initial.entryIdx });
  }

  function createCategory() {
    const lb = newCatLb.trim();
    if (!lb) { toast.warn('请输入类目名称'); return; }
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
      {/* ===== 类目选择器：新增态可选可新建；编辑态只读展示当前类目 ===== */}
      <div>
        {/* 标题行：左「类目」，右「+」新建（编辑态为只读提示） */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '7px' }}>
          <label style={{ ...LABEL_STYLE, marginBottom: 0 }}>类目</label>
          {isEdit ? (
            <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)' }}>编辑时不可更改</span>
          ) : (
            <button
              type="button"
              onClick={() => setShowNewCat(v => !v)}
              title="新建类目"
              aria-label="新建类目"
              aria-expanded={showNewCat}
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: '22px', height: '22px', borderRadius: '7px',
                border: 'none', cursor: 'pointer', transition: 'all .15s',
                background: showNewCat ? ACCENT : 'rgba(var(--m-life-rgb),0.10)',
                color: showNewCat ? 'var(--surface-card)' : ACCENT,
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
            </button>
          )}
        </div>

        {/* 类目胶囊：选中态填充模块紫（对齐工作台「类型」选择器），未选中白底灰边；
            去掉统一色的圆点装饰（所有类目同色，圆点无信息量、只增噪音） */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {(isEdit ? [editCat].filter(Boolean) : cats).map(c => {
            const active = c.key === selectedKey;
            return (
              <button
                key={c.key}
                type="button"
                disabled={isEdit}
                onClick={() => !isEdit && setSelectedKey(c.key)}
                title={c.lb}
                style={{
                  padding: '6px 13px', borderRadius: '9px',
                  fontSize: '12.5px', fontWeight: active ? 700 : 600, lineHeight: 1.25,
                  background: active ? ACCENT : 'var(--surface-card)',
                  color: active ? 'var(--surface-card)' : '#636366',
                  border: active ? 'none' : '1px solid var(--ink-200)',
                  boxShadow: active ? '0 2px 6px rgba(var(--m-life-rgb),0.30)' : 'none',
                  cursor: isEdit ? 'default' : 'pointer',
                  transition: 'all .15s',
                  maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
              >
                {c.lb}
              </button>
            );
          })}
        </div>

        {/* 新建类目 mini 面板（点「+」展开） */}
        {showNewCat && !isEdit && (
          <div style={{
            marginTop: '8px', padding: '10px 12px', borderRadius: '12px',
            background: 'rgba(var(--m-life-rgb),0.05)',
            border: '1px solid rgba(var(--m-life-rgb),0.18)',
            display: 'flex', flexDirection: 'column', gap: '8px',
          }}>
            <input
              className="form-input"
              style={{ ...INPUT_STYLE, height: '34px', fontSize: '13px' }}
              placeholder="新类目名称"
              value={newCatLb}
              onChange={e => setNewCatLb(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); createCategory(); } }}
            />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button type="button" style={BTN_GHOST} onClick={() => { setShowNewCat(false); setNewCatLb(''); }}>取消</button>
              <button type="button" style={BTN_PRIMARY} onClick={createCategory}>创建</button>
            </div>
          </div>
        )}
      </div>

      <div>
        <label style={LABEL_STYLE}>标题</label>
        <input className="form-input" style={INPUT_STYLE}
          value={form.t} onChange={e => set('t', e.target.value)} autoFocus />
      </div>
      <div>
        <label style={LABEL_STYLE}>备注</label>
        <textarea className="form-input" style={{ ...INPUT_STYLE, minHeight: '60px', resize: 'vertical' }}
          value={form.n} onChange={e => set('n', e.target.value)} />
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
                  background: 'rgba(120,120,128,0.16)', color: 'var(--text-muted)',
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

      {confirmOpen && (
        <ConfirmAlert
          danger
          title="删除确认"
          message="确认删除这条记录？"
          confirmText="删除"
          onConfirm={doDelete}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
    </div>
  );
}
