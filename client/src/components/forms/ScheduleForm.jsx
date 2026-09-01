import { useState, useEffect, useRef } from 'react';
import { API } from '../../api/client.js';
import { formatDuration, calcDurationMin } from '../../utils/date.js';
import FriendlyTimeInput from '../FriendlyTimeInput.jsx';
import { store } from '../../utils/store.js';
import { useToast } from '../../context/ToastContext.jsx';
import { reloadCategoryMapping } from '../../utils/categoryMapping.js';

/* ============================================================
 * 分类管理 · 6 大模块 (精力/知力/能力/工作/生活/其他)
 *   - 内置项不可删，但可改名+改色（防止模块映射断裂）
 *   - 支持「+」新增自定义类型（支持删改：文字+颜色）
 *   - 持久化到 localStorage: `schedule_cats_v1` (按用户 id 隔离)
 * ============================================================ */

// 六大内置类型 (v, label, dot)
// category 值约定：  6=精力  7=知力   2=能力   1=工作   5=生活   3=其他(原"常规")
// 自定义类别 cat 从 101 起分配，避免与内置重复
const BUILTIN_CATS = [
  { v: 6, label: '精力',  dot: '#34C759', builtin: true },
  { v: 7, label: '知力',  dot: '#007AFF', builtin: true },
  { v: 2, label: '能力',  dot: '#FF9500', builtin: true },
  { v: 1, label: '工作',  dot: '#FF3B30', builtin: true },
  { v: 5, label: '生活',  dot: '#AF52DE', builtin: true },
  { v: 3, label: '其他',  dot: '#8E8E93', builtin: true },
];

function hexToRgba(hex, a = 0.08) {
  const h = (hex || '').replace('#', '');
  if (h.length !== 6) return `rgba(142,142,147,${a})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}
function tintBorder(dot) { return hexToRgba(dot, 0.55); }

function catToStyle(c) {
  const bg = hexToRgba(c.dot, 0.09);
  const border = tintBorder(c.dot);
  return {
    dot: c.dot,
    bg,
    border,
    text: c.dot,
    textActive: '#1c1c1e',
  };
}

const LS_KEY = 'schedule_cats_v1';
function curUserId() {
  try {
    const raw = localStorage.getItem('pw_user');
    const obj = raw ? JSON.parse(raw) : null;
    return (obj && obj.id) ? String(obj.id) : 'anon';
  } catch { return 'anon'; }
}
function readCats() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return BUILTIN_CATS.map(c => ({ ...c }));
    const obj = JSON.parse(raw) || {};
    const saved = obj[curUserId()];
    if (!saved) return BUILTIN_CATS.map(c => ({ ...c }));
    // 合并：内置保留 + 自定义追加；内置 label/dot 以持久化覆盖
    const merged = BUILTIN_CATS.map(base => {
      const ov = saved.find(s => s.v === base.v);
      if (!ov) return { ...base };
      return { ...base, label: ov.label ?? base.label, dot: ov.dot ?? base.dot };
    });
    saved.forEach(s => {
      if (s.v >= 100 && !merged.find(m => m.v === s.v)) {
        merged.push({ v: s.v, label: s.label || `自定义 ${s.v}`, dot: s.dot || '#8E8E93', builtin: false });
      }
    });
    return merged;
  } catch {
    return BUILTIN_CATS.map(c => ({ ...c }));
  }
}
function writeCats(list) {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const obj = raw ? JSON.parse(raw) || {} : {};
    obj[curUserId()] = list.map(c => ({ v: c.v, label: c.label, dot: c.dot, builtin: !!c.builtin }));
    localStorage.setItem(LS_KEY, JSON.stringify(obj));
    reloadCategoryMapping();
    store.broadcast({ type: 'categories_changed' });
  } catch {}
}
function nextCustomCatId(list) {
  let id = 101;
  const occupied = new Set(list.map(c => c.v));
  while (occupied.has(id)) id++;
  return id;
}

function initialCategory(initial) {
  if (initial && initial.category) {
    const c = Number(initial.category);
    if (c === 4) return 3; // 旧数据的"习惯"类型降级为 其他
    return c;
  }
  if (initial?.is_key) {
    const st = initial.start_time;
    if (st) {
      const h = Number(st.split(':')[0]);
      if (h <= 12) return 1;
    }
    return 2;
  }
  return 3;
}

const INPUT_STYLE = {
  width: '100%',
  padding: '8px 12px',
  border: '1px solid #d1d1d6',
  borderRadius: '9px',
  fontSize: '14px',
  color: '#1c1c1e',
  background: '#ffffff',
  outline: 'none',
  transition: 'all .15s',
  boxSizing: 'border-box'
};

const LABEL_STYLE = {
  display: 'block',
  fontSize: '11px',
  fontWeight: '600',
  color: '#8e8e93',
  marginBottom: '5px',
  textTransform: 'uppercase',
  letterSpacing: '0.03em'
};

const BTN_GHOST = {
  padding: '6px 14px',
  borderRadius: '9px',
  fontSize: '13px',
  fontWeight: '600',
  background: 'rgba(120,120,128,0.12)',
  color: '#1c1c1e',
  border: 'none',
  cursor: 'pointer',
  transition: 'all .15s'
};

const BTN_PRIMARY = {
  padding: '6px 14px',
  borderRadius: '9px',
  fontSize: '13px',
  fontWeight: '600',
  background: '#007AFF',
  color: '#fff',
  border: 'none',
  cursor: 'pointer',
  transition: 'all .15s',
  boxShadow: '0 3px 8px rgba(0,122,255,0.25)'
};

export default function ScheduleForm({ initial, defaultDate, onSaved, onCancel }) {
  const toast = useToast();
  // isPreset 时：initial.title 只做 placeholder 提示，不预填真实值
  const presetHint = initial?.isPreset && initial?.title ? initial.title : null;
  const [form, setForm] = useState(() => {
    const startDate = initial?.date || initial?.start_date || initial?.schedule_date || defaultDate;
    const endDate = initial?.end_date || '';
    return {
      title: initial?.isPreset ? '' : (initial?.title || ''),
      start_date: startDate,
      end_date: endDate && endDate !== startDate ? endDate : '',
      start_time: initial?.start_time || '',
      end_time: initial?.end_time || '',
      duration_min: initial?.duration_min || '',
      category: initialCategory(initial),
      is_key: initial?.is_key ? 1 : 0,
    };
  });
  const [cats, setCats] = useState(() => readCats());
  const [catEditorOpen, setCatEditorOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  /* 删除确认弹窗（iOS 风格：需求 2 截图样式 → 与 FocusPanel 同构） */
  const [confirmDialog, setConfirmDialog] = useState(null);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }
  function refreshCats() { setCats(readCats()); }

  useEffect(() => {
    const unsub = store.subscribe(msg => {
      if (msg?.type === 'categories_changed') refreshCats();
    });
    return unsub;
  }, []);

  // 当前选中的 cat 一定在 cats 里（旧 cat=6/7/自定义都走持久化读）
  function safeCategory() {
    const c = Number(form.category);
    const found = cats.find(x => x.v === c);
    if (found) return c;
    // 选中的被删除等，兜底选「其他」
    const fallback = cats.find(x => x.v === 3);
    return fallback ? fallback.v : (cats[0]?.v ?? 3);
  }

  // 双向自动计算（无条件重算，不依赖 duration_min 是否缺失）
  // ref 记录"由程序写入"的字段值，避免程序写入再次触发 effect 造成死循环
  const programmaticRef = useRef({ start: '', end: '', dur: '' });

  useEffect(() => {
    const start = form.start_time || '';
    const end = form.end_time || '';
    const durVal = form.duration_min;
    const dur = durVal === '' || durVal == null || Number.isNaN(Number(durVal)) ? null : Number(durVal);

    // 判断哪些字段是用户刚刚手动改的（程序写入的字段跳过）
    const startChangedByUser = start !== programmaticRef.current.start;
    const endChangedByUser = end !== programmaticRef.current.end;
    const durChangedByUser = String(durVal ?? '') !== String(programmaticRef.current.dur ?? '');

    let nextStart = start;
    let nextEnd = end;
    let nextDur = durVal;
    let wroteSomething = false;

    // 1) start 或 end 有改动（用户手动） => 无条件重算 duration_min
    if (start && end && (startChangedByUser || endChangedByUser)) {
      const d = calcDurationMin(start, end);
      if (d != null && String(d) !== String(durVal)) {
        nextDur = d;
        wroteSomething = true;
      }
    }

    // 2) start 或 duration 有改动（用户手动），且 end 未被用户手动单独改动 => 无条件重算 end_time
    if (start && dur != null && start && !endChangedByUser && (startChangedByUser || durChangedByUser)) {
      const [sh, sm] = start.split(':').map(Number);
      if (!Number.isNaN(sh) && !Number.isNaN(sm)) {
        const endMin = (sh * 60 + sm + dur) % 1440;
        const eh = String(Math.floor(endMin / 60)).padStart(2, '0');
        const em = String(endMin % 60).padStart(2, '0');
        const newEnd = `${eh}:${em}`;
        if (newEnd !== end) {
          nextEnd = newEnd;
          wroteSomething = true;
        }
      }
    }

    if (wroteSomething) {
      // 记录"即将由程序写入"的值，下次 effect 触发时识别出来避免死循环
      programmaticRef.current = { start: nextStart, end: nextEnd, dur: nextDur };
      if (nextDur !== durVal) setForm(f => ({ ...f, duration_min: nextDur }));
      if (nextEnd !== end) setForm(f => ({ ...f, end_time: nextEnd }));
    } else {
      // 纯用户输入，同步记录基线
      programmaticRef.current = { start, end, dur: durVal };
    }
  }, [form.start_time, form.end_time, form.duration_min]);

  function autoDuration() {
    // 保留旧接口，空实现（useEffect 已经处理）
  }

  async function submit() {
    // isPreset 用户没改的话，用预设提示当 fallback 标题
    const finalTitle = (form.title || presetHint || '').trim();
    if (!finalTitle) return toast.warn('请输入标题');
    if (!form.start_date) return toast.warn('请选择开始日期');
    if (form.start_date && form.end_date && form.end_date < form.start_date) {
      return toast.warn('截止日期不能早于开始日期');
    }
    const cat = Number(safeCategory());
    setBusy(true);
    try {
      const payload = {
        title: finalTitle,
        date: form.start_date,                    // 兼容原字段 date → 作为开始日期
        start_date: form.start_date,              // 新增：开始日期（Supabase 若未建列会走 client.schedules 容错忽略该列）
        end_date: form.end_date || null,          // 新增：可选截止日期
        start_time: form.start_time || null,
        end_time: form.end_time || null,
        duration_min: form.duration_min ? Number(form.duration_min) : null,
        category: cat,
        is_key: (cat === 1 || cat === 2) ? 1 : 0,
      };
      let savedSchedule = null;
      if (initial?.id) {
        const r = await API.schedules.update(initial.id, payload);
        savedSchedule = r?.schedule || { ...payload, id: initial.id, is_done: payload.is_done ?? initial.is_done };
      } else {
        const r = await API.schedules.create(payload);
        savedSchedule = r?.schedule || null;
      }
      store.broadcast({ type: 'schedule_saved', schedule: savedSchedule, action: initial?.id ? 'update' : 'create', category: cat });
      store.broadcast({ type: 'reload' });
      onSaved?.(savedSchedule);
    } catch (e) { toast.error(e.message); }
    setBusy(false);
  }

  async function doDelete() {
    if (!initial?.id) return;
    try {
      await API.schedules.remove(initial.id);
      setConfirmDialog(null);
      store.broadcast({ type: 'schedule_deleted', schedule: { id: initial.id, category: initial.category } });
      store.broadcast({ type: 'reload' });
      onSaved?.();
    } catch (e) { toast.error(e.message); }
  }
  function openDeleteConfirm() {
    if (!initial?.id) return;
    setConfirmDialog({
      title: '删除日程',
      message: `确定删除「${initial.title || '该日程'}」吗？\n删除后不可恢复。`,
      danger: true,
      confirmText: '删除',
      onConfirm: doDelete,
      onCancel: () => setConfirmDialog(null),
    });
  }

  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div>
        <label style={LABEL_STYLE}>标题</label>
        <input
          className="form-input"
          style={{
            ...INPUT_STYLE,
            border: '1px solid #d1d1d6',
            fontSize: '14px',
            fontWeight: '500',
            background: '#ffffff'
          }}
          value={form.title}
          onChange={e => set('title', e.target.value)}
          placeholder={presetHint || ''}
          autoFocus
        />
      </div>

      {/* 日期 · 开始日期 + 截止日期 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '-4px' }}>
        <div>
          <label style={LABEL_STYLE}>开始日期</label>
          <input
            className="form-input"
            style={INPUT_STYLE}
            type="date"
            value={form.start_date}
            onChange={e => set('start_date', e.target.value)}
          />
        </div>
        <div>
          <label style={LABEL_STYLE}>
            截止日期
            <span style={{ fontSize: '10px', fontWeight: '500', color: '#aeaeb2', marginLeft: '4px' }}>可选</span>
          </label>
          <div style={{ position: 'relative' }}>
            <input
              className="form-input"
              style={{ ...INPUT_STYLE, paddingRight: form.end_date ? '30px' : undefined }}
              type="date"
              value={form.end_date}
              onChange={e => set('end_date', e.target.value)}
              placeholder="不设截止"
            />
            {form.end_date && (
              <button
                type="button"
                onClick={() => set('end_date', '')}
                title="清除截止日期"
                style={{
                  position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
                  width: '20px', height: '20px', borderRadius: '999px', border: 'none',
                  background: 'rgba(120,120,128,0.16)', color: '#8e8e93',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', fontSize: '12px', lineHeight: '1'
                }}
                aria-label="清除截止日期"
              >×</button>
            )}
          </div>
        </div>
      </div>

      {/* 时间 · 开始 + 结束 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div>
          <label style={LABEL_STYLE}>开始时间</label>
          <FriendlyTimeInput
            value={form.start_time}
            onChange={v => set('start_time', v)}
            placeholder="几点开始？"
          />
        </div>
        <div>
          <label style={LABEL_STYLE}>结束时间</label>
          <FriendlyTimeInput
            value={form.end_time}
            onChange={v => set('end_time', v)}
            placeholder="几点结束？"
          />
        </div>
      </div>

      <div>
        <label style={LABEL_STYLE}>时长（分钟）</label>
        <input
          className="form-input"
          style={{ ...INPUT_STYLE, width: '50%', minWidth: '160px' }}
          type="number"
          value={form.duration_min}
          onChange={e => set('duration_min', e.target.value)}
          placeholder="可留空"
        />
        {form.duration_min && (
          <span style={{ fontSize: '11px', color: '#8e8e93', marginTop: '4px', marginLeft: '10px', display: 'inline-block' }}>
            {formatDuration(Number(form.duration_min))}
          </span>
        )}
      </div>

      {/* 类型 · 2 行 × 3 列 九宫格 */}
      <CategoryPicker
        cats={cats}
        value={safeCategory()}
        onSelect={(v) => set('category', v)}
        onManage={() => setCatEditorOpen(true)}
      />

      {catEditorOpen && (
        <CategoryEditor
          cats={cats}
          onClose={() => setCatEditorOpen(false)}
          onChange={(next, newDefault) => {
            setCats(next);
            writeCats(next);
            if (newDefault != null) set('category', newDefault);
          }}
        />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', paddingTop: '8px' }}>
        <div>
          {initial?.id && (
            <button
              onClick={openDeleteConfirm}
              style={{
                ...BTN_GHOST,
                color: '#FF3B30',
                background: 'rgba(255,59,48,0.08)'
              }}
            >删除</button>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={onCancel} style={BTN_GHOST}>取消</button>
          <button
            onClick={submit}
            disabled={busy}
            style={{
              ...BTN_PRIMARY,
              opacity: busy ? 0.5 : 1,
              cursor: busy ? 'not-allowed' : 'pointer'
            }}
          >
            {busy ? '保存中...' : '保存'}
          </button>
        </div>
      </div>

      {/* ===== iOS 风格删除确认弹窗（与 FocusPanel 同构） ===== */}
      {confirmDialog && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 80,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(28,28,30,0.40)',
            backdropFilter: 'blur(4px) saturate(180%)',
          }}
          onClick={confirmDialog.onCancel}
          role="dialog"
          aria-modal="true"
        >
          <div
            style={{
              width: 360, background: '#ffffff', borderRadius: '16px', overflow: 'hidden',
              boxShadow: '0 20px 60px rgba(0,0,0,0.22), 0 4px 14px rgba(0,0,0,0.10)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: '20px 20px 18px', textAlign: 'center' }}>
              <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#1C1C1E', letterSpacing: '-0.01em', margin: 0 }}>
                {confirmDialog.title}
              </h3>
              <p style={{
                whiteSpace: 'pre-line', marginTop: '6px', marginBottom: 0,
                fontSize: '13px', lineHeight: 1.55, color: '#8E8E93',
              }}>{confirmDialog.message}</p>
            </div>
            <div style={{ display: 'flex', borderTop: '0.5px solid rgba(60,60,67,0.18)' }}>
              <button
                onClick={confirmDialog.onCancel}
                style={{
                  flex: 1, padding: '14px 0', fontSize: '15px', fontWeight: 600,
                  color: '#007AFF', background: 'transparent',
                  border: 'none', borderRight: '0.5px solid rgba(60,60,67,0.18)',
                  cursor: 'pointer', transition: 'background .15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.035)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >取消</button>
              <button
                onClick={confirmDialog.onConfirm}
                style={{
                  flex: 1, padding: '14px 0', fontSize: '15px',
                  fontWeight: confirmDialog.danger ? 700 : 600,
                  color: confirmDialog.danger ? '#FF3B30' : '#007AFF',
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  transition: 'background .15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = confirmDialog.danger
                    ? 'rgba(255,59,48,0.06)' : 'rgba(0,122,255,0.06)';
                }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >{confirmDialog.confirmText || '确认'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
 * CategoryPicker · 2×3 九宫格 · 右下格为"管理"按钮
 *   - 不足 6 项时，最后一格是「+ 管理」
 *   - ≥6 项时，右下格使用紧凑的「管理」胶囊按钮浮在右上角
 * ============================================================ */

function PickerCell({ c, active, onClick, onEdit }) {
  const s = catToStyle(c);
  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={onClick}
        style={{
          width: '100%',
          padding: '10px 0',
          borderRadius: '9px',
          fontSize: '13px',
          fontWeight: active ? '600' : '500',
          background: active ? s.bg : '#ffffff',
          color: active ? s.textActive : '#636366',
          border: active ? `1.5px solid ${s.border}` : '1px solid #d1d1d6',
          cursor: 'pointer',
          transition: 'all .15s',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          whiteSpace: 'nowrap',
          position: 'relative',
        }}
        title={c.label}
      >
        <span style={{
          display: 'inline-block',
          width: '8px', height: '8px',
          borderRadius: '2px',
          background: active ? c.dot : '#c7c7cc',
          flexShrink: 0
        }}></span>
        <span className="truncate">{c.label}</span>
      </button>
      {/* 编辑画笔（hover 显示，移动端始终有触点） */}
      <button
        type="button"
        onClick={onEdit}
        title={`编辑「${c.label}」`}
        style={{
          position: 'absolute', top: '4px', right: '4px',
          width: '18px', height: '18px',
          borderRadius: '999px', border: 'none',
          background: 'rgba(0,0,0,0.04)', color: '#8e8e93',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', fontSize: '10px', lineHeight: '1',
          opacity: 0, transition: 'opacity .15s',
        }}
        className="cat-pencil-btn"
      >✎</button>
      <style>{`
        .cat-pencil-btn:hover { background: rgba(0,122,255,0.10); color: #007AFF; }
        div:hover > .cat-pencil-btn, button:hover + .cat-pencil-btn { opacity: 1; }
        @media (hover: none) { .cat-pencil-btn { opacity: 1; } }
      `}</style>
    </div>
  );
}

function CategoryPicker({ cats, value, onSelect, onManage }) {
  // 按 3 列显示：先填内置再填自定义；如果总项 < 6，保留一个 "+" 格子。
  const cells = [...cats];
  const needPlus = cells.length < 6;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '5px' }}>
        <label style={{ ...LABEL_STYLE, marginBottom: 0 }}>类型</label>
        {!needPlus && (
          <button
            type="button"
            onClick={onManage}
            style={{
              fontSize: '11px', fontWeight: '500', color: '#007AFF',
              background: 'rgba(0,122,255,0.08)',
              padding: '3px 10px', borderRadius: '999px',
              border: 'none', cursor: 'pointer'
            }}
          >管理类型</button>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
        {cells.map(c => (
          <PickerCell
            key={c.v}
            c={c}
            active={value === c.v}
            onClick={() => onSelect(c.v)}
            onEdit={(e) => { if (e && e.stopPropagation) e.stopPropagation(); onManage(); }}
          />
        ))}
        {needPlus && (
          <button
            type="button"
            onClick={onManage}
            style={{
              borderRadius: '9px', border: '1px dashed #c7c7cc',
              background: '#ffffff', color: '#8e8e93',
              fontSize: '13px', fontWeight: '500',
              cursor: 'pointer', padding: '10px 0',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              transition: 'all .15s'
            }}
          >
            <span style={{ fontSize: '15px', lineHeight: '1', transform: 'translateY(-0.5px)' }}>+</span>
            新增 / 管理
          </button>
        )}
      </div>
    </div>
  );
}

/* ============================================================
 * CategoryEditor · 类型增删改（文字 + 颜色）
 * ============================================================ */

const COLOR_SWATCHES = [
  '#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#00C7BE',
  '#007AFF', '#5E5CE6', '#AF52DE', '#FF2D55', '#8E8E93',
  '#A2845E', '#78350F', '#06B6D4', '#22C55E', '#F97316',
  '#6366F1', '#DB2777', '#111827',
];

function CategoryEditor({ cats, onClose, onChange }) {
  const [list, setList] = useState(() => cats.map(c => ({ ...c })));
  const [focusIdx, setFocusIdx] = useState(-1);
  /* iOS 风格删除确认弹窗（与 FocusPanel / AnnualPlan 同构：需求 2 截图样式） */
  const [confirmDialog, setConfirmDialog] = useState(null);

  function patch(idx, diff) {
    setList(prev => prev.map((it, i) => i === idx ? { ...it, ...diff } : it));
  }
  function remove(idx) {
    const item = list[idx];
    if (!item || item.builtin) return;
    // 替换原生 confirm → iOS Alert（双按钮横排：取消 / 删除·红）
    setConfirmDialog({
      title: '删除类型',
      message: `确定删除「${item.label}」吗？\n原有日程将统一降级为「其他」。`,
      danger: true,
      confirmText: '删除',
      onConfirm: () => {
        setConfirmDialog(null);
        const next = list.filter((_, i) => i !== idx);
        onChange(next, 3);
      },
      onCancel: () => setConfirmDialog(null),
    });
  }
  function add() {
    const v = nextCustomCatId(list);
    const next = [
      ...list,
      { v, label: '新类型', dot: '#007AFF', builtin: false },
    ];
    setList(next);
    setFocusIdx(next.length - 1);
    // 立刻写入，保持一致
    onChange(next, v);
  }
  function save() {
    // label 去空
    const sanitized = list.map(c => ({
      ...c,
      label: typeof c.label === 'string' ? (c.label.trim() || `类型 ${c.v}`) : c.label,
    }));
    onChange(sanitized, null);
    onClose();
  }

  return (
    // 内嵌覆盖式：外层 Modal/glass-card 的 body 容器 padding 为 px-6 py-4 = 24px / 16px
    // 因此用 negative inset 精确贴到外层容器 18px 倒角内缘，不再叠一层独立 Modal 遮罩 → 消除"双重外框"
    <div
      style={{
        position: 'absolute',
        top: '-16px',
        left: '-24px',
        right: '-24px',
        bottom: '-16px',
        zIndex: 50,
        background: 'rgba(242,242,247,0.94)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        backdropFilter: 'blur(20px) saturate(180%)',
        borderRadius: '0 0 18px 18px',  // 顶部贴合外 Modal 的标题分隔线，只保留底部 18px 圆角与容器边缘一致
        padding: '20px 24px 20px',
        display: 'flex', flexDirection: 'column', gap: '14px',
        boxSizing: 'border-box',
        overflow: 'hidden',
        // 外 Modal 主体用了 overflow-y:auto，内嵌覆盖层需要允许内部自己滚动
        maxHeight: 'calc(90vh - 60px)', // 约等于外 Modal max-h-[90vh] 再扣除标题栏 ~60px
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}
      >
        <div style={{ fontSize: '16px', fontWeight: '700', color: '#1c1c1e' }}>类型管理</div>
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭类型管理"
          style={{
            width: '28px', height: '28px', borderRadius: '999px',
            border: 'none', background: 'rgba(120,120,128,0.16)',
            color: '#636366', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '14px'
          }}
        >×</button>
      </div>
      <div style={{ fontSize: '12px', color: '#636366', marginTop: '-6px', lineHeight: '1.55' }}>
        支持修改类型名称和颜色；内置 6 大类（精力/知力/能力/工作/生活/其他）不可删除，以保持年度规划 · 日历联动。
      </div>

      <div style={{
        display: 'flex', flexDirection: 'column', gap: '10px',
        overflowY: 'auto', paddingRight: '2px',
      }}>
        {list.map((c, i) => {
          const focused = focusIdx === i;
          return (
            <div
              key={c.v}
              style={{
                background: '#ffffff',
                borderRadius: '12px',
                padding: '10px 12px',
                border: focused
                  ? `1.5px solid ${c.dot || '#007AFF'}`
                  : '1px solid rgba(60,60,67,0.10)',
                boxShadow: focused
                  ? `0 0 0 3px ${hexToRgba(c.dot || '#007AFF', 0.14)}`
                  : 'none',
                display: 'flex', alignItems: 'center', gap: '10px',
                transition: 'all .15s',
              }}
              onClick={() => setFocusIdx(i)}
            >
              {/* 色块选择器 */}
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  title="点击换色"
                  style={{
                    width: '30px', height: '30px', borderRadius: '9px',
                    background: c.dot,
                    border: `1px solid ${hexToRgba(c.dot, 0.35)}`,
                    boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.6), 0 2px 6px ${hexToRgba(c.dot, 0.22)}`,
                    cursor: 'pointer', padding: 0,
                    flexShrink: 0,
                  }}
                  onClick={(e) => { e.stopPropagation(); setFocusIdx(i); }}
                />
                {focused && (
                  <div
                    onClick={e => e.stopPropagation()}
                    style={{
                      position: 'absolute', top: '36px', left: 0, zIndex: 10,
                      width: '252px', padding: '10px',
                      background: '#ffffff', borderRadius: '12px',
                      border: '1px solid rgba(60,60,67,0.10)',
                      boxShadow: '0 10px 28px rgba(0,0,0,0.14)',
                      display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '7px'
                    }}
                  >
                    {COLOR_SWATCHES.map(col => (
                      <button
                        key={col}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          patch(i, { dot: col });
                        }}
                        title={col}
                        style={{
                          width: '30px', height: '30px', borderRadius: '8px',
                          background: col, cursor: 'pointer',
                          border: c.dot === col
                            ? `2px solid #007AFF`
                            : `1px solid ${hexToRgba(col, 0.3)}`,
                          padding: 0,
                          boxShadow: c.dot === col ? '0 0 0 2px rgba(0,122,255,0.15)' : 'none',
                        }}
                      />
                    ))}
                    <label style={{
                      gridColumn: '1 / -1', marginTop: '2px',
                      display: 'flex', alignItems: 'center', gap: '8px',
                      fontSize: '11px', color: '#8e8e93',
                    }}>
                      <span>自定义</span>
                      <input
                        type="color"
                        value={c.dot}
                        onChange={e => patch(i, { dot: e.target.value })}
                        style={{
                          width: '30px', height: '30px', border: 'none',
                          borderRadius: '8px', padding: 0, cursor: 'pointer', background: 'none'
                        }}
                      />
                      <span style={{ marginLeft: 'auto', color: '#8e8e93' }}>{c.dot}</span>
                    </label>
                  </div>
                )}
              </div>

              {/* 名称输入 */}
              <input
                value={c.label}
                onChange={e => patch(i, { label: e.target.value })}
                onClick={e => e.stopPropagation()}
                onFocus={() => setFocusIdx(i)}
                placeholder="类型名称"
                style={{
                  flex: 1, minWidth: 0,
                  padding: '8px 12px',
                  border: 'none', background: 'rgba(120,120,128,0.08)',
                  borderRadius: '9px',
                  fontSize: '14px', fontWeight: '500', color: '#1c1c1e',
                  outline: 'none',
                }}
              />

              {/* 内置/自定义 标签 */}
              <span style={{
                fontSize: '10px', fontWeight: '700',
                padding: '4px 10px', borderRadius: '999px',
                background: c.builtin ? 'rgba(0,122,255,0.11)' : 'rgba(142,142,147,0.14)',
                color: c.builtin ? '#007AFF' : '#636366',
                whiteSpace: 'nowrap', flexShrink: 0,
              }}>
                {c.builtin ? '内置' : '自定义'}
              </span>

              {/* 删除（仅自定义） */}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); remove(i); }}
                disabled={c.builtin}
                title={c.builtin ? '内置类型不可删除' : '删除'}
                style={{
                  width: '28px', height: '28px', borderRadius: '999px',
                  border: 'none', cursor: c.builtin ? 'not-allowed' : 'pointer',
                  background: c.builtin ? 'rgba(142,142,147,0.08)' : 'rgba(255,59,48,0.09)',
                  color: c.builtin ? '#c7c7cc' : '#FF3B30',
                  fontSize: '14px', lineHeight: '1', flexShrink: 0,
                  opacity: c.builtin ? 0.55 : 1,
                }}
                aria-label="删除该类型"
              >×</button>
            </div>
          );
        })}
      </div>

      <div style={{
        display: 'flex', gap: '10px', justifyContent: 'space-between',
        alignItems: 'center', paddingTop: '2px', flexShrink: 0,
      }}>
        <button
          type="button"
          onClick={add}
          style={{
            padding: '8px 16px', borderRadius: '9px',
            background: 'rgba(0,122,255,0.10)',
            color: '#007AFF', border: 'none', cursor: 'pointer',
            fontSize: '13px', fontWeight: '600',
          }}
        >+ 新增类型</button>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button type="button" onClick={onClose} style={BTN_GHOST}>取消</button>
          <button type="button" onClick={save} style={BTN_PRIMARY}>保存</button>
        </div>
      </div>

      {/* ===== iOS 风格类型删除确认弹窗（需求 2：与截图样式完全一致） ===== */}
      {confirmDialog && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 80,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(28,28,30,0.40)',
            backdropFilter: 'blur(4px) saturate(180%)',
          }}
          onClick={confirmDialog.onCancel}
          role="dialog"
          aria-modal="true"
        >
          <div
            style={{
              width: 360, background: '#ffffff', borderRadius: '16px', overflow: 'hidden',
              boxShadow: '0 20px 60px rgba(0,0,0,0.22), 0 4px 14px rgba(0,0,0,0.10)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: '20px 20px 18px', textAlign: 'center' }}>
              <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#1C1C1E', letterSpacing: '-0.01em', margin: 0 }}>
                {confirmDialog.title}
              </h3>
              <p style={{
                whiteSpace: 'pre-line', marginTop: '6px', marginBottom: 0,
                fontSize: '13px', lineHeight: 1.55, color: '#8E8E93',
              }}>{confirmDialog.message}</p>
            </div>
            <div style={{ display: 'flex', borderTop: '0.5px solid rgba(60,60,67,0.18)' }}>
              <button
                onClick={confirmDialog.onCancel}
                style={{
                  flex: 1, padding: '14px 0', fontSize: '15px', fontWeight: 600,
                  color: '#007AFF', background: 'transparent',
                  border: 'none', borderRight: '0.5px solid rgba(60,60,67,0.18)',
                  cursor: 'pointer', transition: 'background .15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.035)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >取消</button>
              <button
                onClick={confirmDialog.onConfirm}
                style={{
                  flex: 1, padding: '14px 0', fontSize: '15px',
                  fontWeight: confirmDialog.danger ? 700 : 600,
                  color: confirmDialog.danger ? '#FF3B30' : '#007AFF',
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  transition: 'background .15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = confirmDialog.danger
                    ? 'rgba(255,59,48,0.06)' : 'rgba(0,122,255,0.06)';
                }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >{confirmDialog.confirmText || '确认'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
