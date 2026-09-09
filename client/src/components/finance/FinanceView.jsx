import React, { useState } from 'react';

/* ============================================================
   FinanceView · 财务模块四行驾驶舱（攒钱目标 / 资产负债 / 本月收支 / 交易流水）
   设计约定（对齐工作台已有设计）：
   - 模块色统一 var(--m-finance)=#FF2D55（与能力橙 #FF9500、工作红 #FF3B30 区分）
   - 收入绿 #34C759 / 支出红 #FF3B30 语义色保持不变
   - 标题行：5×18 色条 + 16px 加粗标题，卡片内边距 p-4=16px，
     色条与标题间距 gap-3=12px（与精力/能力/工作/生活各页页头一致）
   - 攒钱目标卡：无图标，名称与金额间灰色分割线，两个金额同字号同色
   - 达成日期文案：「计划2026-9-30达成」（年-月-日 不补零）
   ============================================================ */

const FIN = 'var(--m-finance)';
const GREEN = '#34C759';
const RED = '#FF3B30';

/* 金额格式：¥12,345.5 */
export const finFmt = (v) => '¥' + (Number(v) || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 });

/* 账户类型元数据 */
const ACCOUNT_TYPE_META = {
  cash:    { lb: '现金',     icon: '💵' },
  debit:   { lb: '储蓄卡',   icon: '🏦' },
  credit:  { lb: '信用卡',   icon: '💳' },
  virtual: { lb: '虚拟账户', icon: '💬' },
  invest:  { lb: '投资账户', icon: '📈' },
  debt:    { lb: '负债账户', icon: '📉' },
};
const accTypeMeta = (t) => ACCOUNT_TYPE_META[t] || { lb: '账户', icon: '💰' };

/* 需求3：deadline(YYYY-MM-DD) → 「计划2026-9-30达成」（不补零） */
function planLabel(deadline) {
  const m = String(deadline || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return '';
  return `计划${Number(m[1])}-${Number(m[2])}-${Number(m[3])}达成`;
}

/* 细进度条（模块橙） */
function FinProgress({ value }) {
  return (
    <div className="h-1.5 rounded-full bg-ink-100 overflow-hidden flex-1">
      <div className="h-full rounded-full transition-all duration-500"
        style={{ width: `${Math.max(2, Math.min(100, value))}%`, background: FIN }} />
    </div>
  );
}

/* ===== 通用标题行：色条 + 标题 + 计数 + 右侧动作 ===== */
function FinHeader({ title, countLabel, right }) {
  return (
    <div className="flex items-center gap-3 flex-wrap mb-3.5">
      <div className="flex items-center gap-3 min-w-0 flex-shrink-0">
        <span className="w-[5px] h-[18px] rounded-full flex-shrink-0" style={{ background: FIN }}></span>
        <h2 className="text-[16px] font-bold text-ink-900 leading-none whitespace-nowrap">{title}</h2>
        {countLabel != null && (
          <span className="text-[11px] text-ink-400 tabular-nums leading-none whitespace-nowrap">{countLabel}</span>
        )}
      </div>
      {right && <div className="flex items-center gap-1.5 ml-auto flex-shrink-0">{right}</div>}
    </div>
  );
}

/* ===== 26×26 圆角加号按钮（与能力/工作页页头同款） ===== */
function PlusBtn({ title, onClick }) {
  return (
    <button onClick={onClick} title={title}
      className="inline-flex items-center justify-center w-[26px] h-[26px] rounded-lg transition flex-shrink-0 hover:brightness-105 active:scale-95"
      style={{ color: FIN, background: 'rgba(var(--m-finance-rgb),0.10)' }}>
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" strokeLinecap="round" /></svg>
    </button>
  );
}

/* ===== 需求2：目标卡右上角 ⋮ 菜单（查看详情 / 编辑 / 删除） ===== */
function GoalMenu({ goal, onDetail, onEdit, onRemove }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const item = 'w-full text-left px-3.5 py-2 text-[13px] hover:bg-[#f2f2f7] hover:rounded-md transition-colors';
  return (
    <div className="relative flex-shrink-0" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-ink-100/70 active:bg-ink-200/60 transition-colors"
        style={{ color: FIN }}
        title="更多操作">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <circle cx="12" cy="5" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="12" cy="19" r="1.4" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={close} />
          <div className="absolute right-0 top-8 z-50 bg-white rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-ink-100 py-1.5 w-36 overflow-hidden animate-fade-in">
            <button onClick={() => { close(); onDetail(); }} className={`${item} text-[#1d1d1f]`}>查看详情</button>
            <button onClick={() => { close(); onEdit(); }} className={`${item} text-[#1d1d1f]`}>编辑目标</button>
            <button onClick={() => { close(); onRemove(); }} className={`${item} text-[#FA503E]`}>删除目标</button>
          </div>
        </>
      )}
    </div>
  );
}

/* ===== 需求1/2/3：攒钱目标卡（无图标 · 分割线 · 同字号金额 · 计划x-x-x达成） ===== */
function GoalCard({ goal, onDetail, onEdit, onRemove, onDeposit }) {
  const plan = planLabel(goal.deadline);
  const isDone = goal.status === 'done' || (goal.target_amount > 0 && goal.current_amount >= goal.target_amount);
  return (
    <div className="bg-[rgba(120,120,128,0.08)] rounded-xl p-3.5 flex flex-col gap-3">
      {/* 标题行：目标名 + ⋮（需求2：右上角纵向三点） */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 pt-[2px]">
          <span className="text-[15px] font-bold text-ink-900 leading-snug">{goal.name}</span>
          {isDone && (
            <span className="inline-flex items-center gap-1 ml-2 align-middle px-1.5 h-[17px] rounded-full text-[10px] font-bold"
              style={{ background: 'rgba(52,199,89,0.10)', color: GREEN }}>已达成</span>
          )}
        </div>
        <GoalMenu goal={goal} onDetail={() => onDetail(goal)} onEdit={() => onEdit(goal)} onRemove={() => onRemove(goal)} />
      </div>

      {/* 需求1：名称与金额之间的灰色分割线 */}
      <div className="h-px bg-ink-200/70" />

      {/* 需求1：¥18,600 / ¥30,000 —— 同字号同色 */}
      <div className="flex items-baseline gap-1.5 flex-wrap">
        <span className="text-[21px] font-bold text-ink-900 tabular-nums tracking-tight leading-none">{finFmt(goal.current_amount)}</span>
        <span className="text-[21px] font-bold text-ink-300 leading-none">/</span>
        <span className="text-[21px] font-bold text-ink-900 tabular-nums tracking-tight leading-none">{finFmt(goal.target_amount)}</span>
      </div>

      {/* 进度条 + 百分比（模块橙） */}
      <div className="flex items-center gap-2.5">
        <FinProgress value={goal.progress || 0} />
        <span className="text-[11px] font-bold tabular-nums flex-shrink-0" style={{ color: FIN }}>{goal.progress || 0}%</span>
      </div>

      {/* 需求3：计划2026-9-30达成 + 存入 */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11.5px] text-ink-400 truncate">{plan || '未设定达成日期'}</span>
        <button onClick={() => onDeposit(goal)} disabled={isDone}
          className="inline-flex items-center h-[24px] px-2.5 rounded-lg text-[11.5px] font-bold transition flex-shrink-0 hover:brightness-105 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: 'rgba(var(--m-finance-rgb),0.12)', color: FIN }}>
          存入
        </button>
      </div>
    </div>
  );
}

/* ===== 月份切换 ‹ 2026年9月 › ===== */
function MonthNav({ month, onChange }) {
  const [y, m] = String(month || '').split('-').map(Number);
  const shift = (d) => {
    const dt = new Date(y, m - 1 + d, 1);
    onChange(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`);
  };
  const now = new Date();
  const isCur = y === now.getFullYear() && m === now.getMonth() + 1;
  return (
    <div className="inline-flex items-center gap-0.5 bg-ink-50 rounded-lg p-0.5">
      <button onClick={() => shift(-1)} title="上个月"
        className="w-[22px] h-[22px] rounded-md grid place-items-center text-ink-500 hover:text-ink-800 hover:bg-white transition">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" /></svg>
      </button>
      <span className="text-[12px] font-bold text-ink-800 tabular-nums px-1.5 select-none whitespace-nowrap">{y}年{m}月</span>
      <button onClick={() => shift(1)} disabled={isCur} title="下个月"
        className="w-[22px] h-[22px] rounded-md grid place-items-center text-ink-500 hover:text-ink-800 hover:bg-white transition disabled:opacity-30 disabled:cursor-not-allowed">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6" /></svg>
      </button>
    </div>
  );
}

/* ===== 环比变化 chip（收入升绿/降红，支出反之） ===== */
function DeltaChip({ cur, prev, goodWhenUp }) {
  if (!(prev > 0) || !(cur > 0) || cur === prev) return null;
  const up = cur > prev;
  const pct = Math.round(Math.abs(cur - prev) / prev * 100);
  const good = goodWhenUp ? up : !up;
  return (
    <span className="text-[10.5px] font-semibold tabular-nums" style={{ color: good ? GREEN : RED }}>
      {up ? '↑' : '↓'}{pct}% 较上月
    </span>
  );
}

/* ============================================================ */
export default function FinanceView({
  data, loading,
  month, onMonthChange,
  onTxAdd, onTxEdit, onTxRemove,
  onGoalAdd, onGoalEdit, onGoalRemove, onGoalDetail, onDeposit,
  onManage, onAccountAdd, onAccountEdit, onAccountRemove,
}) {
  const [txFilter, setTxFilter] = useState('all'); // all | expense | income | transfer

  const goals = data?.goals || [];
  const accounts = data?.accounts || [];
  const txs = data?.transactions || [];
  const nw = data?.netWorth || { assets: 0, liabilities: 0, netWorth: 0 };
  const ms = data?.monthStats || { income: 0, expense: 0, incomeByCat: [], expenseByCat: [] };
  const ps = data?.prevStats || { income: 0, expense: 0 };
  const balance = (Number(ms.income) || 0) - (Number(ms.expense) || 0);

  const activeGoals = goals.filter(g => g.status !== 'done');
  const filteredTxs = txs.filter(t => txFilter === 'all' || t.type === txFilter);

  /* 月份导航时全局淡显 */
  const dim = loading ? 'opacity-60 pointer-events-none' : 'opacity-100';
  const transition = 'transition-opacity duration-200';

  return (
    <div className="flex flex-col gap-3">
      {/* ================= 行一 · 攒钱目标 ================= */}
      <section className={`bg-white rounded-2xl border border-ink-100 p-4 ${transition} ${dim}`}>
        <FinHeader title="攒钱目标" countLabel={activeGoals.length ? `${activeGoals.length} 个进行中` : null}
          right={<PlusBtn title="新建攒钱目标" onClick={onGoalAdd} />} />
        {goals.length === 0 ? (
          <button onClick={onGoalAdd}
            className="w-full rounded-xl border border-dashed border-ink-200 py-8 flex flex-col items-center gap-1.5 text-ink-400 hover:text-ink-600 hover:border-ink-300 transition group">
            <span className="w-8 h-8 rounded-full grid place-items-center bg-ink-50 group-hover:bg-ink-100 transition">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" strokeLinecap="round" /></svg>
            </span>
            <span className="text-[12.5px] font-semibold">还没有攒钱目标，点这里创建</span>
          </button>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3">
            {goals.map(g => (
              <GoalCard key={g.id} goal={g}
                onDetail={onGoalDetail} onEdit={onGoalEdit} onRemove={onGoalRemove} onDeposit={onDeposit} />
            ))}
            {/* 新建目标占位卡 */}
            <button onClick={onGoalAdd}
              className="rounded-xl border border-dashed border-ink-200 min-h-[148px] grid place-items-center text-ink-400 hover:text-ink-600 hover:border-ink-300 transition group">
              <span className="flex flex-col items-center gap-1.5">
                <span className="w-8 h-8 rounded-full grid place-items-center bg-ink-50 group-hover:bg-ink-100 transition">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" strokeLinecap="round" /></svg>
                </span>
                <span className="text-[12.5px] font-semibold">新建目标</span>
              </span>
            </button>
          </div>
        )}
      </section>

      {/* ================= 行二 · 资产负债 ================= */}
      <section className={`bg-white rounded-2xl border border-ink-100 p-4 ${transition} ${dim}`}>
        <FinHeader title="资产负债" countLabel={`${accounts.length} 个账户`}
          right={<PlusBtn title="新建账户" onClick={onAccountAdd} />} />
        <div className="flex flex-col lg:flex-row gap-4">
          {/* 左：净资产（需求5：大数字用模块橙） */}
          <div className="lg:w-[280px] flex-shrink-0 flex flex-col justify-center gap-2 lg:border-r border-ink-100 lg:pr-4">
            <span className="text-[11px] font-semibold text-ink-400 tracking-wide uppercase">净资产</span>
            <span className="text-[30px] font-extrabold tabular-nums tracking-tight leading-none" style={{ color: FIN }}>
              {finFmt(nw.netWorth)}
            </span>
            <div className="flex items-center gap-4 text-[12px]">
              <span className="text-ink-400">资产
                <b className="ml-1 text-ink-800 tabular-nums">{finFmt(nw.assets)}</b>
              </span>
              <span className="text-ink-400">负债
                <b className="ml-1 text-ink-800 tabular-nums">{finFmt(nw.liabilities)}</b>
              </span>
            </div>
          </div>
          {/* 右：账户列表（点击编辑） */}
          <div className="flex-1 min-w-0">
            {accounts.length === 0 ? (
              <button onClick={onAccountAdd}
                className="w-full rounded-xl border border-dashed border-ink-200 py-6 text-[12.5px] font-semibold text-ink-400 hover:text-ink-600 hover:border-ink-300 transition">
                + 新建第一个账户（现金 / 储蓄卡 / 信用卡…）
              </button>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                {accounts.map(a => {
                  const meta = accTypeMeta(a.type);
                  const neg = (Number(a.balance) || 0) < 0;
                  return (
                    <button key={a.id} onClick={() => onAccountEdit(a)} title="编辑账户"
                      className="bg-[rgba(120,120,128,0.08)] rounded-xl px-3 py-2.5 flex items-center justify-between gap-2 text-left hover:brightness-[0.98] active:scale-[0.99] transition">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[16px] flex-shrink-0">{a.icon || meta.icon}</span>
                        <div className="min-w-0">
                          <div className="text-[12.5px] font-semibold text-ink-700 truncate leading-tight">{a.name}</div>
                          <div className="text-[10px] text-ink-400 leading-tight mt-[1px]">{meta.lb}{a.include_in_net_worth ? '' : ' · 不计净资产'}</div>
                        </div>
                      </div>
                      <span className={`text-[13.5px] font-bold tabular-nums flex-shrink-0 ${neg ? '' : 'text-ink-900'}`}
                        style={neg ? { color: RED } : undefined}>
                        {finFmt(a.balance)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ================= 行三 · 本月收支（需求6：管理按钮） ================= */}
      <section className={`bg-white rounded-2xl border border-ink-100 p-4 ${transition} ${dim}`}>
        <FinHeader title="本月收支"
          right={
            <>
              <MonthNav month={month} onChange={onMonthChange} />
              {/* 需求6：管理按钮 —— 增删收支分类（如新增副业收入项） */}
              <button onClick={onManage}
                className="inline-flex items-center gap-1 h-[26px] px-2.5 rounded-lg text-[11.5px] font-semibold transition hover:brightness-105 active:scale-95"
                style={{ background: 'rgba(var(--m-finance-rgb),0.10)', color: FIN }}
                title="管理收支分类（如新增副业收入）">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
                </svg>
                管理
              </button>
              {/* 记一笔主操作 */}
              <button onClick={onTxAdd}
                className="inline-flex items-center gap-1 h-[26px] px-3 rounded-lg text-[11.5px] font-bold text-white transition hover:brightness-105 active:scale-95 flex-shrink-0"
                style={{ background: FIN, boxShadow: '0 2px 8px rgba(var(--m-finance-rgb),0.30)' }}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" strokeLinecap="round" /></svg>
                记一笔
              </button>
            </>
          } />
        {/* 三指标：收入（绿）/ 支出（红）/ 结余（模块橙）——红绿语义不变 */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-[rgba(120,120,128,0.08)] rounded-xl px-3.5 py-3 flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-ink-400">收入</span>
            <span className="text-[19px] font-bold tabular-nums tracking-tight leading-none" style={{ color: GREEN }}>{finFmt(ms.income)}</span>
            <DeltaChip cur={ms.income} prev={ps.income} goodWhenUp />
          </div>
          <div className="bg-[rgba(120,120,128,0.08)] rounded-xl px-3.5 py-3 flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-ink-400">支出</span>
            <span className="text-[19px] font-bold tabular-nums tracking-tight leading-none" style={{ color: RED }}>{finFmt(ms.expense)}</span>
            <DeltaChip cur={ms.expense} prev={ps.expense} goodWhenUp={false} />
          </div>
          <div className="bg-[rgba(120,120,128,0.08)] rounded-xl px-3.5 py-3 flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-ink-400">结余</span>
            <span className="text-[19px] font-bold tabular-nums tracking-tight leading-none" style={{ color: FIN }}>{finFmt(balance)}</span>
            <span className="text-[10.5px] text-ink-400 tabular-nums">{ms.income || ms.expense ? `结余率 ${Math.round(balance / Math.max(ms.income, 1) * 100)}%` : '本月暂无收支'}</span>
          </div>
        </div>
        {/* 收支构成（按分类） */}
        {(ms.incomeByCat.length > 0 || ms.expenseByCat.length > 0) && (
          <div className="mt-3 pt-3 border-t border-ink-100 flex flex-col gap-2">
            {ms.incomeByCat.length > 0 && (
              <div className="flex items-start gap-2 flex-wrap">
                <span className="text-[11px] font-semibold text-ink-400 flex-shrink-0 mt-[2px]">收入构成</span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {ms.incomeByCat.slice(0, 6).map(c => (
                    <span key={`inc-${c.id ?? c.name}`} className="inline-flex items-center gap-1 px-2 h-[22px] rounded-full text-[11px] font-semibold"
                      style={{ background: 'rgba(52,199,89,0.08)', color: GREEN }}>
                      <span>{c.icon}</span><span>{c.name}</span>
                      <span className="tabular-nums font-bold">{finFmt(c.amount)}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
            {ms.expenseByCat.length > 0 && (
              <div className="flex items-start gap-2 flex-wrap">
                <span className="text-[11px] font-semibold text-ink-400 flex-shrink-0 mt-[2px]">支出构成</span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {ms.expenseByCat.slice(0, 8).map(c => (
                    <span key={`exp-${c.id ?? c.name}`} className="inline-flex items-center gap-1 px-2 h-[22px] rounded-full text-[11px] font-semibold"
                      style={{ background: 'rgba(255,59,48,0.07)', color: RED }}>
                      <span>{c.icon}</span><span>{c.name}</span>
                      <span className="tabular-nums font-bold">{finFmt(c.amount)}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ================= 行四 · 交易流水 ================= */}
      <section className={`bg-white rounded-2xl border border-ink-100 p-4 ${transition} ${dim}`}>
        <FinHeader title="交易流水" countLabel={txs.length ? `最近 ${txs.length} 笔` : null}
          right={
            <div className="flex items-center gap-1 bg-ink-50 rounded-lg p-0.5">
              {[{ k: 'all', lb: '全部' }, { k: 'expense', lb: '支出' }, { k: 'income', lb: '收入' }, { k: 'transfer', lb: '转账' }].map(t => {
                const active = txFilter === t.k;
                return (
                  <button key={t.k} onClick={() => setTxFilter(t.k)}
                    className={`px-2 h-[22px] rounded-md text-[11px] font-semibold transition ${active ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-700'}`}>
                    {t.lb}
                  </button>
                );
              })}
            </div>
          } />
        {filteredTxs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-ink-200 py-8 flex flex-col items-center gap-1.5 text-ink-400">
            <span className="text-[12.5px] font-semibold">{txs.length === 0 ? '暂无交易记录' : '该类型暂无记录'}</span>
            <span className="text-[11px]">点上方「记一笔」开始记录</span>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-ink-100/70 -mx-1">
            {filteredTxs.map(t => {
              const isIn = t.type === 'income';
              const isOut = t.type === 'expense';
              return (
                <button key={t.id} onClick={() => onTxEdit(t)} title="编辑这笔记录"
                  className="flex items-center gap-3 px-1 py-2.5 rounded-lg hover:bg-ink-50/80 transition text-left group">
                  <div className="w-9 h-9 rounded-xl grid place-items-center text-[16px] flex-shrink-0"
                    style={{
                      background: isIn ? 'rgba(52,199,89,0.08)' : isOut ? 'rgba(255,59,48,0.07)' : 'rgba(120,120,128,0.08)',
                    }}>
                    {t.type === 'transfer' ? '🔄' : (t.category_icon || '🏷️')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[13.5px] font-semibold text-ink-800 truncate">
                        {t.type === 'transfer' ? `${t.account_name || '?'} → ${t.to_account_name || '?'}` : (t.category_name || '未分类')}
                      </span>
                      {t.goal_id != null && (
                        <span className="text-[10px] px-1.5 h-[16px] inline-flex items-center rounded-full font-semibold flex-shrink-0"
                          style={{ background: 'rgba(var(--m-finance-rgb),0.12)', color: FIN }}>🎯</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-[2px] text-[11px] text-ink-400 min-w-0">
                      <span className="tabular-nums flex-shrink-0">{String(t.date || '').slice(5)}</span>
                      {t.type !== 'transfer' && t.account_name && <><span>·</span><span className="truncate">{t.account_name}</span></>}
                      {t.note && <><span>·</span><span className="truncate">{t.note}</span></>}
                    </div>
                  </div>
                  <span className={`text-[13.5px] font-bold tabular-nums flex-shrink-0 ${isIn ? '' : isOut ? '' : 'text-ink-700'}`}
                    style={isIn ? { color: GREEN } : isOut ? { color: RED } : undefined}>
                    {isIn ? '+' : isOut ? '-' : ''}{finFmt(t.amount)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
