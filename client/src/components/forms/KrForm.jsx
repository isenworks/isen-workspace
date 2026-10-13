import { useState } from 'react';
import { useFormSubmit } from '../../utils/formSubmitBus.js';
import { LABEL_STYLE, INPUT_STYLE } from '../../utils/uiConstants.js';
import { useToast } from '../../context/ToastContext.jsx';
import ConfirmAlert from '../ConfirmAlert.jsx';

const BTN_GHOST = { padding: '6px 14px', borderRadius: '9px', fontSize: '13px', fontWeight: '600', background: 'rgba(120,120,128,0.12)', color: 'var(--text-1)', border: 'none', cursor: 'pointer', transition: 'all .15s' };
const BTN_PRIMARY = { padding: '6px 14px', borderRadius: '9px', fontSize: '13px', fontWeight: '600', background: 'var(--danger)', color: 'var(--surface-card)', border: 'none', cursor: 'pointer', transition: 'all .15s', boxShadow: '0 2px 8px rgba(255,59,48,0.25)' };
const BTN_DANGER = { padding: '6px 14px', borderRadius: '9px', fontSize: '13px', fontWeight: '600', background: 'rgba(255,59,48,0.08)', color: 'var(--danger)', border: 'none', cursor: 'pointer', transition: 'all .15s' };

const STATUSES = [
  { v: 'done',    lb: '已完成' },
  { v: 'doing',   lb: '进行中' },
  { v: 'pending', lb: '待启动' },
];

export default function KrForm({ initial, onSaved, onCancel, onDelete }) {
  const toast = useToast();
  const isEdit = !!(initial && initial.id);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [form, setForm] = useState({
    t: initial?.t || '',
    v: initial?.v ?? 0,
    tgt: initial?.tgt ?? 100,
    u: initial?.u || '',
    st: initial?.st || 'pending',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Ctrl+S 优先提交本表单（无表单打开时 Ctrl+S 才走全局同步）
  useFormSubmit(submit);

  function submit() {
    if (!form.t.trim()) return toast.warn('请输入 KR 标题');
    onSaved?.({
      t: form.t.trim(), v: Number(form.v) || 0, tgt: Number(form.tgt) || 100,
      u: form.u, st: form.st,
      id: initial?.id, workIdx: initial?.workIdx, krIdx: initial?.krIdx,
    });
  }

  function del() {
    if (!isEdit) return;
    setConfirmOpen(true);
  }

  function doDelete() {
    setConfirmOpen(false);
    onDelete?.({ workIdx: initial.workIdx, krIdx: initial.krIdx });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div>
        <label style={LABEL_STYLE}>KR 标题</label>
        <input className="form-input" style={INPUT_STYLE}
          value={form.t} onChange={e => set('t', e.target.value)}
          placeholder="例如：投递 80 份数据分析简历" autoFocus />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div>
          <label style={LABEL_STYLE}>当前值</label>
          <input className="form-input" type="number" style={INPUT_STYLE}
            value={form.v} onChange={e => set('v', e.target.value)}
            min="0" />
        </div>
        <div>
          <label style={LABEL_STYLE}>目标值</label>
          <input className="form-input" type="number" style={INPUT_STYLE}
            value={form.tgt} onChange={e => set('tgt', e.target.value)}
            min="1" />
        </div>
      </div>
      <div>
        <label style={LABEL_STYLE}>单位</label>
        <input className="form-input" style={INPUT_STYLE}
          value={form.u} onChange={e => set('u', e.target.value)}
          placeholder="例如：份 / 次 / %" />
      </div>
      <div>
        <label style={LABEL_STYLE}>状态</label>
        <div style={{ display: 'flex', gap: '8px' }}>
          {STATUSES.map(s => {
            const on = form.st === s.v;
            return (
              <button key={s.v} type="button" onClick={() => set('st', s.v)}
                style={{
                  flex: 1, padding: '7px 0', borderRadius: '9px',
                  fontSize: '13px', fontWeight: on ? '600' : '500',
                  background: on ? 'var(--danger-soft)' : 'rgba(120,120,128,0.08)',
                  color: on ? 'var(--danger)' : 'var(--text-muted)',
                  border: 'none', cursor: 'pointer', transition: 'all .15s',
                }}>{s.lb}</button>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', paddingTop: '4px' }}>
        <div>{isEdit && <button onClick={del} style={BTN_DANGER}>删除</button>}</div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={onCancel} style={BTN_GHOST}>取消</button>
          <button onClick={submit} style={BTN_PRIMARY}>{isEdit ? '保存' : '添加'}</button>
        </div>
      </div>

      {confirmOpen && (
        <ConfirmAlert
          danger
          title="删除确认"
          message="确定删除这个 KR 吗？"
          confirmText="删除"
          onConfirm={doDelete}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
    </div>
  );
}
