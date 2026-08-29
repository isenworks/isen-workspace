import { useMemo, useState } from 'react';
import { LABEL_STYLE, INPUT_STYLE } from '../../utils/uiConstants.js';

const BTN_GHOST = { padding: '6px 14px', borderRadius: '9px', fontSize: '13px', fontWeight: '600', background: 'rgba(120,120,128,0.12)', color: '#1c1c1e', border: 'none', cursor: 'pointer', transition: 'all .15s' };
const BTN_PRIMARY = { padding: '6px 14px', borderRadius: '9px', fontSize: '13px', fontWeight: '600', background: '#AF52DE', color: '#fff', border: 'none', cursor: 'pointer', transition: 'all .15s', boxShadow: '0 2px 8px rgba(175,82,222,0.25)' };
const BTN_DANGER = { padding: '6px 14px', borderRadius: '9px', fontSize: '13px', fontWeight: '600', background: 'rgba(255,59,48,0.08)', color: '#FF3B30', border: 'none', cursor: 'pointer', transition: 'all .15s' };

// 5 个预定义紫色色板（模块新建时点击 chip 选一个；LIFE 既有 color 仍显示真实颜色）
const PALETTE = ['#AF52DE', '#B77FE3', '#8B5CF6', '#C084FC', '#7D3AA0'];

export default function EntryForm({ initial, categoryLabel, onSaved, onCancel, onDelete, lifeCategories, onAddCategory }) {
  const isEdit = !!(initial && initial.id);
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    t: initial?.t || '',
    n: initial?.n || '',
    d: initial?.d || today,
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // 选中的模块 key：编辑态固定为 initial.lifeKey（不可切换，避免移动错类目）；新增态 default lifeCategories[0]
  const [selectedKey, setSelectedKey] = useState(() => {
    if (initial?.lifeKey) return initial.lifeKey;
    if (Array.isArray(lifeCategories) && lifeCategories[0]) return lifeCategories[0].key;
    return '';
  });

  // 新建模块 mini 面板：是否展开
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCat, setNewCat] = useState({ lb: '', color: PALETTE[0] });

  // 为了 chip 渲染：LIFE 现有类目 + 实时新增项（如果 onAddCategory 有回写 parent，lifeCategories 会变）
  const cats = useMemo(() => Array.isArray(lifeCategories) ? lifeCategories : [], [lifeCategories]);
  const selCat = cats.find(c => c.key === selectedKey) || null;
  const selColor = selCat?.color || '#AF52DE';

  function submit() {
    if (!form.t.trim()) { alert('请输入标题'); return; }
    if (!isEdit && !selectedKey) { alert('请先选择一个模块，或点「+ 新建模块」创建新模块后再记录'); return; }
    const payload = {
      t: form.t.trim(), n: form.n, d: form.d,
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
    const lb = newCat.lb.trim();
    if (!lb) { alert('请输入模块名，如「健康」「运动」「书单」'); return; }
    const res = onAddCategory?.({ lb, color: newCat.color || PALETTE[0] });
    // onAddCategory 约定：成功后返回 { key }；若返回 undefined，则父组件会自动回写 lifeCategories，本组件此处只关闭面板
    if (res && res.key) {
      setSelectedKey(res.key);
    }
    setNewCat({ lb: '', color: PALETTE[0] });
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
            const col = c.color || '#AF52DE';
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
                  border: `1px solid ${active ? col : 'rgba(15,23,42,0.10)'}`,
                  background: active ? `${col}12` : 'rgba(15,23,42,0.03)',
                  color: active ? col : '#1c1c1e',
                  fontWeight: 600, fontSize: '12px', lineHeight: 1.2,
                  opacity: disabled ? 0.45 : 1,
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  transition: 'all .15s',
                }}
              >
                <span style={{ width: '8px', height: '8px', borderRadius: '999px', background: col, display: 'inline-block', flexShrink: 0 }} />
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
                border: `1px dashed ${showNewCat ? '#AF52DE' : 'rgba(175,82,222,0.45)'}`,
                background: showNewCat ? 'rgba(175,82,222,0.08)' : 'rgba(175,82,222,0.04)',
                color: '#AF52DE', fontWeight: 700, fontSize: '12px', lineHeight: 1.2,
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
            background: 'rgba(175,82,222,0.05)',
            border: '1px solid rgba(175,82,222,0.18)',
            display: 'flex', flexDirection: 'column', gap: '8px',
          }}>
            <div>
              <label style={{ ...LABEL_STYLE, fontSize: '11px', color: '#AF52DE' }}>模块名</label>
              <input
                className="form-input"
                style={{ ...INPUT_STYLE, height: '32px', fontSize: '13px' }}
                placeholder="例如：运动 / 健康 / 书单 / 探店"
                value={newCat.lb}
                onChange={e => setNewCat(s => ({ ...s, lb: e.target.value }))}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); createCategory(); } }}
              />
            </div>
            <div>
              <label style={{ ...LABEL_STYLE, fontSize: '11px', color: '#AF52DE' }}>颜色</label>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '2px' }}>
                {PALETTE.map(col => (
                  <button
                    key={col}
                    type="button"
                    onClick={() => setNewCat(s => ({ ...s, color: col }))}
                    title={col}
                    style={{
                      width: '20px', height: '20px', borderRadius: '999px',
                      background: col, cursor: 'pointer',
                      border: newCat.color === col ? '2px solid #1c1c1e' : '2px solid transparent',
                      boxSizing: 'border-box',
                      transition: 'transform .15s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.12)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                  />
                ))}
                <span style={{ marginLeft: '6px', color: '#8e8e93', fontSize: '11px' }}>为你的新模块选一种紫色</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button type="button" style={BTN_GHOST} onClick={() => { setShowNewCat(false); setNewCat({ lb: '', color: PALETTE[0] }); }}>取消</button>
              <button type="button" style={{ ...BTN_PRIMARY, background: newCat.color || BTN_PRIMARY.background, boxShadow: `0 2px 8px ${newCat.color || BTN_PRIMARY.background}40` }} onClick={createCategory}>创建</button>
            </div>
          </div>
        )}
      </div>

      {/* 选中态信息卡：新增态显示当前选中模块 / 编辑态显示所属模块（替换旧的 categoryLabel） */}
      {selCat && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            fontSize: '12px', fontWeight: 700, letterSpacing: '0.03em',
            background: `${selColor}12`, color: selColor,
            padding: '4px 10px', borderRadius: '8px', display: 'inline-block',
            border: `1px solid ${selColor}25`,
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
      <div>
        <label style={LABEL_STYLE}>日期</label>
        <input className="form-input" style={INPUT_STYLE} type="date"
          value={form.d} onChange={e => set('d', e.target.value)} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', paddingTop: '4px' }}>
        <div>{isEdit && <button onClick={del} style={BTN_DANGER}>删除</button>}</div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={onCancel} style={BTN_GHOST}>取消</button>
          <button onClick={submit} style={{ ...BTN_PRIMARY, background: selColor, boxShadow: `0 2px 8px ${selColor}40` }}>
            {isEdit ? '保存' : '添加'}
          </button>
        </div>
      </div>
    </div>
  );
}
