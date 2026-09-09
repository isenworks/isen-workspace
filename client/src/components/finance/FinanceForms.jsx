import { useMemo, useState, useEffect } from 'react';
import { API } from '../../api/client.js';
import { useFormSubmit } from '../../utils/formSubmitBus.js';
import { LABEL_STYLE, INPUT_STYLE } from '../../utils/uiConstants.js';
import { finFmt } from './FinanceView.jsx';

/* ============================================================
   财务模块弹窗表单组：记一笔 / 攒钱目标 / 存入 / 管理收支分类 / 账户 / 目标详情
   - 表单样式复用工作台 LABEL_STYLE / INPUT_STYLE / 按钮规范，模块色统一 var(--m-finance)
   - 全部直连 API.finance.*，成功后 onSaved() → 父级关弹窗 + 刷新 bootstrap
   ============================================================ */

const FIN = 'var(--m-finance)';
const GREEN = '#34C759';
const RED = '#FF3B30';

const BTN_GHOST = { padding: '7px 16px', borderRadius: '9px', fontSize: '13px', fontWeight: '600', background: 'rgba(120,120,128,0.12)', color: '#1c1c1e', border: 'none', cursor: 'pointer', transition: 'all .15s' };
const BTN_PRIMARY = { padding: '7px 16px', borderRadius: '9px', fontSize: '13px', fontWeight: '600', background: FIN, color: '#fff', border: 'none', cursor: 'pointer', transition: 'all .15s', boxShadow: '0 2px 8px rgba(var(--m-finance-rgb),0.30)' };
const BTN_DANGER = { padding: '7px 16px', borderRadius: '9px', fontSize: '13px', fontWeight: '600', background: 'rgba(255,59,48,0.08)', color: RED, border: 'none', cursor: 'pointer', transition: 'all .15s' };

const ACCOUNT_TYPES = [
  { k: 'cash',    lb: '现金',     icon: '💵' },
  { k: 'debit',   lb: '储蓄卡',   icon: '🏦' },
  { k: 'credit',  lb: '信用卡',   icon: '💳' },
  { k: 'virtual', lb: '虚拟账户', icon: '💬' },
  { k: 'invest',  lb: '投资账户', icon: '📈' },
  { k: 'debt',    lb: '负债账户', icon: '📉' },
];

/* 计划达成文案（与卡片一致，不补零） */
const planText = (d) => {
  const m = String(d || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  return m ? `${Number(m[1])}-${Number(m[2])}-${Number(m[3])}` : '';
};

const todayISO = () => new Date().toISOString().slice(0, 10);

/* 月份安全加法：day 超出目标月天数时收敛到该月最后一天 */
function addMonthsISO(dateStr, n) {
  const m = String(dateStr || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return '';
  const [, y, mo, d] = m.map(Number);
  const t = new Date(y, mo - 1 + n, 1);
  const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  t.setDate(Math.min(d, last));
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

/* 自动推算达成日期：目标金额 ÷ 每月计划 = 存入笔数，首笔在基准日
 * 例：1月1日建目标，12 万 ÷ 每月 1 万 = 12 笔，落在 1/1…12/1 → 计划 12-1 达成 */
function autoDeadline(targetAmt, monthlyAmt, baseDateStr) {
  const t = Number(targetAmt), m = Number(monthlyAmt);
  if (!Number.isFinite(t) || !Number.isFinite(m) || t <= 0 || m <= 0) return '';
  const months = Math.max(1, Math.ceil(t / m));
  return addMonthsISO(baseDateStr, months - 1);
}

/* ============================================================
   ① 记一笔 / 编辑流水（支出 · 收入 · 转账）
   ============================================================ */
export function FinanceTxForm({ initial, accounts, categories, onSaved, onCancel, onDelete }) {
  const isEdit = !!(initial && initial.id);
  const [type, setType] = useState(initial?.type || 'expense');
  const [amount, setAmount] = useState(initial?.amount != null ? String(initial.amount) : '');
  const [categoryId, setCategoryId] = useState(initial?.category_id != null ? initial.category_id : null);
  const [accountId, setAccountId] = useState(initial?.account_id != null ? initial.account_id : (accounts[0]?.id ?? null));
  const [toAccountId, setToAccountId] = useState(initial?.to_account_id != null ? initial.to_account_id : (accounts[1]?.id ?? null));
  const [date, setDate] = useState(initial?.date || todayISO());
  const [note, setNote] = useState(initial?.note || '');
  const [busy, setBusy] = useState(false);

  const typeCats = useMemo(() => (categories || []).filter(c => c.type === type), [categories, type]);

  async function submit() {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) { alert('请输入正确的金额（大于 0）'); return; }
    if (type !== 'transfer' && !accountId) { alert('请选择账户'); return; }
    if (type === 'transfer') {
      if (!accountId || !toAccountId) { alert('转账需要转出与转入账户'); return; }
      if (accountId === toAccountId) { alert('转出与转入账户不能相同'); return; }
    }
    const payload = {
      type, amount: amt, date, note: note.trim(),
      accountId, toAccountId: type === 'transfer' ? toAccountId : null,
      categoryId: type === 'transfer' ? null : categoryId,
    };
    setBusy(true);
    try {
      if (isEdit) await API.finance.txUpdate(initial.id, payload);
      else await API.finance.txCreate(payload);
      onSaved?.(payload);
    } catch (e) { alert(e.message || '保存失败'); } finally { setBusy(false); }
  }
  useFormSubmit(submit);

  function del() {
    if (!isEdit) return;
    if (!confirm('确认删除这笔流水？')) return;
    onDelete?.(initial);
  }

  const TYPE_TABS = [
    { k: 'expense', lb: '支出', color: RED },
    { k: 'income', lb: '收入', color: GREEN },
    { k: 'transfer', lb: '转账', color: '#8E8E93' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* 类型分段器（编辑时锁定类型，避免语义漂移） */}
      <div style={{ display: 'flex', gap: '4px', background: 'rgba(120,120,128,0.10)', borderRadius: '10px', padding: '3px' }}>
        {TYPE_TABS.map(t => {
          const active = type === t.k;
          return (
            <button key={t.k} type="button" disabled={isEdit} onClick={() => { setType(t.k); setCategoryId(null); }}
              style={{
                flex: 1, padding: '7px 0', borderRadius: '8px', border: 'none', cursor: isEdit ? 'not-allowed' : 'pointer',
                background: active ? '#fff' : 'transparent', color: active ? t.color : '#8e8e93',
                fontWeight: 700, fontSize: '13px', boxShadow: active ? '0 1px 4px rgba(0,0,0,0.10)' : 'none',
                transition: 'all .15s', opacity: isEdit && !active ? 0.45 : 1,
              }}>{t.lb}</button>
          );
        })}
      </div>

      {/* 金额 */}
      <div>
        <label style={{ ...LABEL_STYLE, marginBottom: '6px' }}>金额</label>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '18px', fontWeight: 700, color: '#8e8e93' }}>¥</span>
          <input type="number" inputMode="decimal" min="0" step="0.01" autoFocus value={amount}
            onChange={e => setAmount(e.target.value)} placeholder="0.00"
            style={{ ...INPUT_STYLE, paddingLeft: '30px', fontSize: '19px', fontWeight: 700 }} />
        </div>
      </div>

      {/* 分类（转账无分类） */}
      {type !== 'transfer' && (
        <div>
          <label style={{ ...LABEL_STYLE, marginBottom: '6px' }}>
            {type === 'income' ? '收入分类（没有想要的分类？点左下角「管理」添加，如「副业」）' : '支出分类'}
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxHeight: '132px', overflowY: 'auto' }}>
            {typeCats.map(c => {
              const active = categoryId === c.id;
              return (
                <button key={c.id} type="button" onClick={() => setCategoryId(c.id)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '5px',
                    padding: '5px 10px', borderRadius: '10px',
                    border: `1px solid ${active ? FIN : 'rgba(15,23,42,0.10)'}`,
                    background: active ? 'rgba(var(--m-finance-rgb),0.08)' : 'rgba(15,23,42,0.03)',
                    color: active ? FIN : '#1c1c1e',
                    fontWeight: 600, fontSize: '12px', lineHeight: 1.2, cursor: 'pointer', transition: 'all .15s',
                  }}>
                  <span>{c.icon}</span><span>{c.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 账户 */}
      {type === 'transfer' ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div>
            <label style={{ ...LABEL_STYLE, marginBottom: '6px' }}>转出账户</label>
            <select value={accountId ?? ''} onChange={e => setAccountId(Number(e.target.value))} style={INPUT_STYLE}>
              <option value="">请选择</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ ...LABEL_STYLE, marginBottom: '6px' }}>转入账户</label>
            <select value={toAccountId ?? ''} onChange={e => setToAccountId(Number(e.target.value))} style={INPUT_STYLE}>
              <option value="">请选择</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        </div>
      ) : (
        <div>
          <label style={{ ...LABEL_STYLE, marginBottom: '6px' }}>账户</label>
          <select value={accountId ?? ''} onChange={e => setAccountId(Number(e.target.value))} style={INPUT_STYLE}>
            <option value="">请选择账户</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}{a.balance != null ? `（余额 ${finFmt(a.balance)}）` : ''}</option>)}
          </select>
        </div>
      )}

      {/* 日期 + 备注 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: '10px' }}>
        <div>
          <label style={{ ...LABEL_STYLE, marginBottom: '6px' }}>日期</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={INPUT_STYLE} />
        </div>
        <div>
          <label style={{ ...LABEL_STYLE, marginBottom: '6px' }}>备注（可选）</label>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="如：和朋友的周末聚餐" style={INPUT_STYLE} />
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginTop: '2px' }}>
        {isEdit
          ? <button type="button" onClick={del} style={BTN_DANGER}>删除</button>
          : <span style={{ fontSize: '11px', color: '#8e8e93', alignSelf: 'center' }}>收入分类可在「本月收支 → 管理」中添加</span>}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button type="button" onClick={onCancel} style={BTN_GHOST}>取消</button>
          <button type="button" onClick={submit} disabled={busy} style={BTN_PRIMARY}>{isEdit ? '保存修改' : '记一笔'}</button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   ② 新建 / 编辑攒钱目标
   · 达成日期：按 目标金额 ÷ 每月计划 自动推算（基准=创建日），可手动调整，
     手动后显示「恢复自动推算」；改金额/月计划时未锁定则重新推算
   · 资金存放账户：下拉 + 内联增删改（新增/编辑/删除当前选中账户）
   ============================================================ */
export function FinanceGoalForm({ initial, accounts, onSaved, onCancel, onDelete }) {
  const isEdit = !!(initial && initial.id);
  const [name, setName] = useState(initial?.name || '');
  const [targetAmount, setTargetAmount] = useState(initial?.target_amount != null ? String(initial.target_amount) : '');
  const [monthlyPlan, setMonthlyPlan] = useState(initial?.monthly_plan != null && initial.monthly_plan !== '' ? String(initial.monthly_plan) : '');
  const [deadline, setDeadline] = useState(initial?.deadline || '');
  const [deadlineManual, setDeadlineManual] = useState(false); // 手动调整后锁定，不再自动推算
  const [accountId, setAccountId] = useState(initial?.account_id != null ? initial.account_id : (accounts[0]?.id ?? null));
  const [busy, setBusy] = useState(false);

  // 自动推算基准日：新建=今天；编辑=目标创建日（created_at "YYYY-MM-DD HH:MM:SS"）
  const baseDate = (isEdit && /^\d{4}-\d{2}-\d{2}/.test(initial?.created_at || '')) ? initial.created_at.slice(0, 10) : todayISO();
  const autoDate = autoDeadline(targetAmount, monthlyPlan, baseDate);

  /* 金额/月计划变化 → 未手动锁定时自动重算达成日期 */
  const applyAuto = (t, m) => {
    if (deadlineManual) return;
    const d = autoDeadline(t, m, baseDate);
    if (d) setDeadline(d);
  };

  /* ---- 账户内联管理（增删改） ---- */
  const [accList, setAccList] = useState(accounts || []);
  useEffect(() => { setAccList(accounts || []); }, [accounts]);
  const [accEdit, setAccEdit] = useState(null); // null | { mode: 'add' } | { mode: 'edit', id }
  const [accName, setAccName] = useState('');
  const [accType, setAccType] = useState('debit');
  const [accBusy, setAccBusy] = useState(false);
  const selectedAcc = accList.find(a => a.id === accountId) || null;

  async function saveAccount() {
    const n = accName.trim();
    if (!n) { alert('请输入账户名称'); return; }
    setAccBusy(true);
    try {
      if (accEdit?.mode === 'add') {
        const res = await API.finance.accountCreate({ name: n, type: accType, includeInNetWorth: true });
        const raw = res?.account;
        if (raw) {
          const acc = { ...raw, balance: raw.balance != null ? raw.balance : (Number(raw.initial_balance) || 0) / 100 };
          setAccList(prev => [...prev, acc]);
          setAccountId(acc.id); // 新建后自动选中
        }
      } else if (accEdit?.mode === 'edit') {
        await API.finance.accountUpdate(accEdit.id, { name: n, type: accType });
        setAccList(prev => prev.map(a => a.id === accEdit.id ? { ...a, name: n, type: accType } : a));
      }
      setAccEdit(null);
    } catch (e) { alert(e.message || '保存失败'); } finally { setAccBusy(false); }
  }

  async function removeAccount() {
    if (!selectedAcc) return;
    if (!confirm(`确认删除账户「${selectedAcc.name}」？\n关联流水将变为未指定账户。`)) return;
    setAccBusy(true);
    try {
      await API.finance.accountRemove(selectedAcc.id);
      const next = accList.filter(a => a.id !== selectedAcc.id);
      setAccList(next);
      setAccountId(next[0]?.id ?? null);
      setAccEdit(null);
    } catch (e) { alert(e.message || '删除失败'); } finally { setAccBusy(false); }
  }

  async function submit() {
    if (!name.trim()) { alert('请输入目标名称'); return; }
    const tgt = Number(targetAmount);
    if (!Number.isFinite(tgt) || tgt <= 0) { alert('请输入正确的目标金额（大于 0）'); return; }
    const payload = { name: name.trim(), targetAmount: tgt, deadline, accountId };
    const mp = Number(monthlyPlan);
    if (monthlyPlan !== '' && Number.isFinite(mp) && mp > 0) payload.monthlyPlan = mp;
    setBusy(true);
    try {
      if (isEdit) await API.finance.goalUpdate(initial.id, payload);
      else await API.finance.goalCreate(payload);
      onSaved?.(payload);
    } catch (e) { alert(e.message || '保存失败'); } finally { setBusy(false); }
  }
  useFormSubmit(submit);

  function del() {
    if (!isEdit) return;
    if (!confirm(`确认删除目标「${initial.name}」？此操作不可撤销。`)) return;
    onDelete?.(initial);
  }

  const miniBtn = (disabled) => ({
    padding: '3px 9px', borderRadius: '7px', fontSize: '11.5px', fontWeight: 600,
    border: '1px solid rgba(15,23,42,0.10)', background: '#fff', color: disabled ? '#c7c7cc' : '#3a3a3c',
    cursor: disabled ? 'not-allowed' : 'pointer', transition: 'all .15s',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div>
        <label style={{ ...LABEL_STYLE, marginBottom: '6px' }}>目标名称</label>
        <input value={name} onChange={e => setName(e.target.value)} autoFocus style={INPUT_STYLE} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <div>
          <label style={{ ...LABEL_STYLE, marginBottom: '6px' }}>目标金额（¥）</label>
          <input type="number" inputMode="decimal" min="0" step="0.01" value={targetAmount}
            onChange={e => { setTargetAmount(e.target.value); applyAuto(e.target.value, monthlyPlan); }} style={INPUT_STYLE} />
        </div>
        <div>
          <label style={{ ...LABEL_STYLE, marginBottom: '6px' }}>每月计划存入（可选）</label>
          <input type="number" inputMode="decimal" min="0" step="0.01" value={monthlyPlan}
            onChange={e => { setMonthlyPlan(e.target.value); applyAuto(targetAmount, e.target.value); }} style={INPUT_STYLE} />
        </div>
      </div>
      <div>
        <label style={{ ...LABEL_STYLE, marginBottom: '6px' }}>计划达成日期（卡片将显示「计划2026-9-30达成」）</label>
        <input type="date" value={deadline}
          onChange={e => { setDeadline(e.target.value); setDeadlineManual(true); }} style={INPUT_STYLE} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px', minHeight: '16px' }}>
          {autoDate && !deadlineManual && (
            <span style={{ fontSize: '11px', color: '#8e8e93' }}>已按目标金额与每月计划自动推算，可手动调整</span>
          )}
          {autoDate && deadlineManual && (
            <>
              <span style={{ fontSize: '11px', color: '#8e8e93' }}>已手动指定</span>
              <button type="button"
                onClick={() => { setDeadlineManual(false); setDeadline(autoDate); }}
                style={{ fontSize: '11px', fontWeight: 600, color: FIN, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                恢复自动推算（{planText(autoDate)}）
              </button>
            </>
          )}
        </div>
      </div>
      <div>
        <label style={{ ...LABEL_STYLE, marginBottom: '6px' }}>资金存放账户（详情中可查看）</label>
        <select value={accountId ?? ''} onChange={e => setAccountId(Number(e.target.value))} style={INPUT_STYLE}>
          <option value="">暂不指定</option>
          {accList.map(a => <option key={a.id} value={a.id}>{a.name}{a.balance != null ? `（余额 ${finFmt(a.balance)}）` : ''}</option>)}
        </select>
        {/* 账户增删改（作用于下拉当前选中项；新增后自动选中） */}
        <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
          <button type="button" disabled={accBusy}
            onClick={() => { setAccEdit({ mode: 'add' }); setAccName(''); setAccType('debit'); }}
            style={miniBtn(accBusy)}>＋ 新增账户</button>
          <button type="button" disabled={!selectedAcc || accBusy}
            onClick={() => { setAccEdit({ mode: 'edit', id: selectedAcc.id }); setAccName(selectedAcc.name); setAccType(selectedAcc.type || 'debit'); }}
            style={miniBtn(!selectedAcc || accBusy)}>编辑</button>
          <button type="button" disabled={!selectedAcc || accBusy} onClick={removeAccount}
            style={{ ...miniBtn(!selectedAcc || accBusy), color: !selectedAcc || accBusy ? '#c7c7cc' : '#FA503E', borderColor: 'rgba(250,80,62,0.25)' }}>删除</button>
        </div>
        {accEdit && (
          <div style={{ marginTop: '8px', border: '1px solid rgba(15,23,42,0.08)', borderRadius: '10px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <input value={accName} onChange={e => setAccName(e.target.value)} autoFocus
              onKeyDown={e => { if (e.key === 'Enter') saveAccount(); }}
              style={INPUT_STYLE} />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {ACCOUNT_TYPES.map(t => {
                const active = accType === t.k;
                return (
                  <button key={t.k} type="button" onClick={() => setAccType(t.k)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '4px',
                      padding: '4px 9px', borderRadius: '9px',
                      border: `1px solid ${active ? FIN : 'rgba(15,23,42,0.10)'}`,
                      background: active ? 'rgba(var(--m-finance-rgb),0.08)' : '#fff',
                      color: active ? FIN : '#3a3a3c',
                      fontWeight: 600, fontSize: '11.5px', cursor: 'pointer', transition: 'all .15s',
                    }}>
                    <span>{t.icon}</span><span>{t.lb}</span>
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button type="button" onClick={() => setAccEdit(null)} style={{ ...BTN_GHOST, padding: '5px 12px', fontSize: '12px' }}>取消</button>
              <button type="button" onClick={saveAccount} disabled={accBusy}
                style={{ ...BTN_PRIMARY, padding: '5px 12px', fontSize: '12px' }}>{accEdit.mode === 'add' ? '创建账户' : '保存账户'}</button>
            </div>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginTop: '2px' }}>
        {isEdit ? <button type="button" onClick={del} style={BTN_DANGER}>删除</button> : <span />}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button type="button" onClick={onCancel} style={BTN_GHOST}>取消</button>
          <button type="button" onClick={submit} disabled={busy} style={BTN_PRIMARY}>{isEdit ? '保存修改' : '创建目标'}</button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   ③ 目标存入（生成一笔指向目标账户的转账）
   ============================================================ */
export function FinanceDepositForm({ goal, accounts, onSaved, onCancel }) {
  const [amount, setAmount] = useState('');
  const [fromAccountId, setFromAccountId] = useState(accounts[0]?.id ?? null);
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const remain = Math.max(0, (Number(goal?.target_amount) || 0) - (Number(goal?.current_amount) || 0));

  async function submit() {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) { alert('请输入正确的存入金额（大于 0）'); return; }
    setBusy(true);
    try {
      await API.finance.goalDeposit({ goalId: goal.id, amount: amt, fromAccountId, date, note: note.trim() });
      onSaved?.();
    } catch (e) { alert(e.message || '存入失败'); } finally { setBusy(false); }
  }
  useFormSubmit(submit);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* 目标概要 */}
      <div style={{ background: 'rgba(var(--m-finance-rgb),0.07)', borderRadius: '12px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#1c1c1e' }}>{goal?.name}</span>
          <span style={{ fontSize: '12px', color: '#8e8e93', tabular: 'true' }}>还差 {finFmt(remain)}</span>
        </div>
        <div style={{ fontSize: '12px', color: '#666', tabular: 'true' }}>
          已存 <b style={{ color: FIN }}>{finFmt(goal?.current_amount)}</b> / 目标 {finFmt(goal?.target_amount)}（{goal?.progress || 0}%）
        </div>
      </div>
      <div>
        <label style={{ ...LABEL_STYLE, marginBottom: '6px' }}>存入金额（¥）</label>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '18px', fontWeight: 700, color: '#8e8e93' }}>¥</span>
          <input type="number" inputMode="decimal" min="0" step="0.01" autoFocus value={amount}
            onChange={e => setAmount(e.target.value)} placeholder="0.00"
            style={{ ...INPUT_STYLE, paddingLeft: '30px', fontSize: '19px', fontWeight: 700 }} />
        </div>
        {Number(goal?.monthly_plan) > 0 && (
          <button type="button" onClick={() => setAmount(String(goal.monthly_plan))}
            style={{ marginTop: '6px', fontSize: '11.5px', fontWeight: 600, color: FIN, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            按每月计划填入 {finFmt(goal.monthly_plan)}
          </button>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: '10px' }}>
        <div>
          <label style={{ ...LABEL_STYLE, marginBottom: '6px' }}>从账户转出</label>
          <select value={fromAccountId ?? ''} onChange={e => setFromAccountId(Number(e.target.value))} style={INPUT_STYLE}>
            <option value="">不关联账户</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}{a.balance != null ? `（${finFmt(a.balance)}）` : ''}</option>)}
          </select>
        </div>
        <div>
          <label style={{ ...LABEL_STYLE, marginBottom: '6px' }}>备注（可选）</label>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="如：10月工资结余" style={INPUT_STYLE} />
        </div>
      </div>
      <input type="hidden" value={date} onChange={() => {}} />
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center', marginTop: '2px' }}>
        <span style={{ fontSize: '11px', color: '#8e8e93' }}>存入会计入目标进度{goal?.account_name ? `，并转入「${goal.account_name}」` : ''}</span>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button type="button" onClick={onCancel} style={BTN_GHOST}>取消</button>
          <button type="button" onClick={submit} disabled={busy} style={BTN_PRIMARY}>确认存入</button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   ④ 管理收支分类（需求6：如新增「副业」收入项）
   ============================================================ */
export function FinanceManageForm({ categories, onSaved, onCancel }) {
  const [tab, setTab] = useState('income'); // 先看收入：副业场景
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState('');
  const [busy, setBusy] = useState(false);
  const list = (categories || []).filter(c => c.type === tab);

  async function addCategory() {
    const name = newName.trim();
    if (!name) { alert('请输入分类名称'); return; }
    if (list.some(c => c.name === name)) { alert('该分类已存在'); return; }
    setBusy(true);
    try {
      await API.finance.categoryCreate({ name, type: tab, icon: newIcon.trim() || (tab === 'income' ? '✨' : '🏷️') });
      setNewName(''); setNewIcon('');
      onSaved?.(false); // 不关弹窗，继续管理
    } catch (e) { alert(e.message || '添加失败'); } finally { setBusy(false); }
  }

  async function removeCategory(c) {
    if (!confirm(`确认删除分类「${c.name}」？\n已使用该分类的流水将变为「未分类」。`)) return;
    setBusy(true);
    try {
      await API.finance.categoryRemove(c.id);
      onSaved?.(false);
    } catch (e) { alert(e.message || '删除失败'); } finally { setBusy(false); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* 收入 / 支出 tab */}
      <div style={{ display: 'flex', gap: '4px', background: 'rgba(120,120,128,0.10)', borderRadius: '10px', padding: '3px' }}>
        {[{ k: 'income', lb: `收入分类 (${(categories || []).filter(c => c.type === 'income').length})` },
          { k: 'expense', lb: `支出分类 (${(categories || []).filter(c => c.type === 'expense').length})` }].map(t => {
          const active = tab === t.k;
          return (
            <button key={t.k} type="button" onClick={() => setTab(t.k)}
              style={{
                flex: 1, padding: '7px 0', borderRadius: '8px', border: 'none', cursor: 'pointer',
                background: active ? '#fff' : 'transparent', color: active ? '#1c1c1e' : '#8e8e93',
                fontWeight: 700, fontSize: '12.5px', boxShadow: active ? '0 1px 4px rgba(0,0,0,0.10)' : 'none', transition: 'all .15s',
              }}>{t.lb}</button>
          );
        })}
      </div>

      {/* 新增行：icon + 名称 + 添加 */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
        <div style={{ width: '56px' }}>
          <label style={{ ...LABEL_STYLE, marginBottom: '6px' }}>图标</label>
          <input value={newIcon} onChange={e => setNewIcon(e.target.value)} placeholder="🚀" maxLength={4}
            style={{ ...INPUT_STYLE, textAlign: 'center' }} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ ...LABEL_STYLE, marginBottom: '6px' }}>新增{tab === 'income' ? '收入' : '支出'}分类</label>
          <input value={newName} onChange={e => setNewName(e.target.value)}
            placeholder={tab === 'income' ? '如：副业、奖金、租金' : '如：宠物、旅行、医疗'}
            style={INPUT_STYLE} onKeyDown={e => { if (e.key === 'Enter') addCategory(); }} />
        </div>
        <button type="button" onClick={addCategory} disabled={busy}
          style={{ ...BTN_PRIMARY, flexShrink: 0 }}>添加</button>
      </div>

      {/* 分类列表 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxHeight: '220px', overflowY: 'auto' }}>
        {list.map(c => (
          <div key={c.id}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '5px 6px 5px 10px', borderRadius: '10px',
              border: '1px solid rgba(15,23,42,0.10)', background: 'rgba(15,23,42,0.03)',
              fontSize: '12px', fontWeight: 600, color: '#1c1c1e',
            }}>
            <span>{c.icon}</span><span>{c.name}</span>
            {c.is_system
              ? <span style={{ fontSize: '9.5px', color: '#b0b0b5', fontWeight: 500, marginLeft: '2px' }}>预置</span>
              : <button type="button" onClick={() => removeCategory(c)} disabled={busy} title="删除分类"
                  style={{ width: '18px', height: '18px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                    background: 'rgba(255,59,48,0.08)', color: RED, fontSize: '11px', lineHeight: 1,
                    display: 'grid', placeItems: 'center' }}>✕</button>}
          </div>
        ))}
        {list.length === 0 && <span style={{ fontSize: '12px', color: '#8e8e93' }}>暂无分类</span>}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '2px' }}>
        <button type="button" onClick={onCancel} style={BTN_GHOST}>完成</button>
      </div>
    </div>
  );
}

/* ============================================================
   ⑤ 新建 / 编辑账户
   ============================================================ */
export function FinanceAccountForm({ initial, onSaved, onCancel, onDelete }) {
  const isEdit = !!(initial && initial.id);
  const [name, setName] = useState(initial?.name || '');
  const [type, setType] = useState(initial?.type || 'debit');
  const [icon, setIcon] = useState(initial?.icon || '');
  const [initialBalance, setInitialBalance] = useState(initial?.initial_balance != null ? String(initial.initial_balance) : '');
  const [includeInNetWorth, setIncludeInNetWorth] = useState(initial ? initial.include_in_net_worth !== 0 && initial.include_in_net_worth !== false : true);
  const [busy, setBusy] = useState(false);
  const isLiability = type === 'credit' || type === 'debt';

  async function submit() {
    if (!name.trim()) { alert('请输入账户名称'); return; }
    const payload = {
      name: name.trim(), type,
      icon: icon.trim() || ACCOUNT_TYPES.find(t => t.k === type)?.icon,
      includeInNetWorth,
    };
    if (initialBalance !== '') {
      let v = Number(initialBalance) || 0;
      // 负债类账户：正数表示欠款，后端按负余额入账
      if (isLiability && v > 0) v = v; // 后端自动取负，这里传正数
      payload.initialBalance = v;
    }
    setBusy(true);
    try {
      if (isEdit) await API.finance.accountUpdate(initial.id, payload);
      else await API.finance.accountCreate(payload);
      onSaved?.(payload);
    } catch (e) { alert(e.message || '保存失败'); } finally { setBusy(false); }
  }
  useFormSubmit(submit);

  function del() {
    if (!isEdit) return;
    if (!confirm(`确认删除账户「${initial.name}」？\n关联流水将失去账户信息，此操作不可撤销。`)) return;
    onDelete?.(initial);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div>
        <label style={{ ...LABEL_STYLE, marginBottom: '6px' }}>账户名称</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="如：招商储蓄 / 微信零钱" autoFocus style={INPUT_STYLE} />
      </div>
      <div>
        <label style={{ ...LABEL_STYLE, marginBottom: '6px' }}>账户类型{isLiability ? '（负债类：余额按欠款计）' : ''}</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {ACCOUNT_TYPES.map(t => {
            const active = type === t.k;
            return (
              <button key={t.k} type="button" onClick={() => setType(t.k)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '5px',
                  padding: '5px 10px', borderRadius: '10px',
                  border: `1px solid ${active ? FIN : 'rgba(15,23,42,0.10)'}`,
                  background: active ? 'rgba(var(--m-finance-rgb),0.08)' : 'rgba(15,23,42,0.03)',
                  color: active ? FIN : '#1c1c1e',
                  fontWeight: 600, fontSize: '12px', cursor: 'pointer', transition: 'all .15s',
                }}>
                <span>{t.icon}</span><span>{t.lb}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <div>
          <label style={{ ...LABEL_STYLE, marginBottom: '6px' }}>图标（可选）</label>
          <input value={icon} onChange={e => setIcon(e.target.value)} placeholder="🏦" maxLength={4} style={{ ...INPUT_STYLE, textAlign: 'center' }} />
        </div>
        <div>
          <label style={{ ...LABEL_STYLE, marginBottom: '6px' }}>{isEdit ? '期初余额（调整会重算）' : '期初余额'}</label>
          <input type="number" inputMode="decimal" step="0.01" value={initialBalance}
            onChange={e => setInitialBalance(e.target.value)} placeholder={isLiability ? '如 8500（欠款）' : '如 12000'} style={INPUT_STYLE} />
        </div>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#1c1c1e', cursor: 'pointer' }}>
        <input type="checkbox" checked={includeInNetWorth} onChange={e => setIncludeInNetWorth(e.target.checked)}
          style={{ width: '16px', height: '16px', accentColor: 'var(--m-finance)' }} />
        计入净资产
      </label>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginTop: '2px' }}>
        {isEdit ? <button type="button" onClick={del} style={BTN_DANGER}>删除</button> : <span />}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button type="button" onClick={onCancel} style={BTN_GHOST}>取消</button>
          <button type="button" onClick={submit} disabled={busy} style={BTN_PRIMARY}>{isEdit ? '保存修改' : '创建账户'}</button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   ⑥ 目标详情（⋮ 菜单 → 查看详情：资金存放位置等）
   ============================================================ */
export function FinanceGoalDetail({ goal, onEdit, onClose }) {
  const rows = [
    ['目标金额', finFmt(goal?.target_amount)],
    ['已存入', `${finFmt(goal?.current_amount)}（${goal?.progress || 0}%）`],
    ['还差', finFmt(Math.max(0, (Number(goal?.target_amount) || 0) - (Number(goal?.current_amount) || 0)))],
    ['每月计划', goal?.monthly_plan != null && Number(goal.monthly_plan) > 0 ? finFmt(goal.monthly_plan) : '未设置'],
    ['计划达成日期', goal?.deadline ? `计划${planText(goal.deadline)}达成` : '未设定'],
    ['资金存放位置', goal?.account_name || '未指定账户'],
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* 头部：名称 + 进度条 */}
      <div style={{ background: 'rgba(var(--m-finance-rgb),0.07)', borderRadius: '12px', padding: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '10px' }}>
          <span style={{ fontSize: '15px', fontWeight: 700, color: '#1c1c1e' }}>{goal?.name}</span>
          <span style={{ fontSize: '12px', fontWeight: 700, color: FIN, tabular: 'true' }}>{goal?.progress || 0}%</span>
        </div>
        <div style={{ height: '6px', borderRadius: '3px', background: 'rgba(120,120,128,0.15)', overflow: 'hidden' }}>
          <div style={{ height: '100%', borderRadius: '3px', background: FIN, width: `${Math.max(2, Math.min(100, goal?.progress || 0))}%`, transition: 'width .4s' }} />
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {rows.map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '9px 2px', borderBottom: '1px solid rgba(60,60,67,0.08)' }}>
            <span style={{ fontSize: '12.5px', color: '#8e8e93' }}>{k}</span>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#1c1c1e', tabular: 'true' }}>{v}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '2px' }}>
        <button type="button" onClick={onClose} style={BTN_GHOST}>关闭</button>
        <button type="button" onClick={onEdit} style={BTN_PRIMARY}>编辑目标</button>
      </div>
    </div>
  );
}
