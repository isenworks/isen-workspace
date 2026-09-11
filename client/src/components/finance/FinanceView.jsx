import React, { useState } from 'react';
import { moduleRgba } from '../../utils/color.js';

/* ============================================================
   FinanceView · 财务模块四行驾驶舱（攒钱目标 / 资产负债 / 本月收支 / 交易流水）
   设计约定（对齐工作台已有设计）：
   - 模块色统一 var(--m-finance)=#FF2D55（与能力橙 #FF9500、工作红 #FF3B30 区分）
   - 收入绿 #34C759 / 支出红 #FF3B30 语义色保持不变
   - 标题行：5×18 色条 + 16px 加粗标题，卡片内边距 p-4=16px，
     色条与标题间距 gap-3=12px（与精力/能力/工作/生活各页页头一致）
   - 攒钱目标卡 v4：白底+浅红阴影（无边框），居中水位球（浅红细线框+淡红轨道底+饱和红水+球心红/白百分比），
     球下「¥完成值 / ¥目标值」斜杠金额行 + 还差行，过期目标日期行红色「已过期」，
     网格 auto-fill minmax(240px,1fr) 窄卡自适应
   - 达成日期文案：「计划2026-9-30达成」（年-月-日 不补零）
   ============================================================ */

const FIN = 'var(--m-finance)';
const GREEN = '#34C759';
const RED = '#FF3B30';
const GOLD = '#C9A227'; // 净资产 / 月结余 强调色（金色）

/* 金额格式：¥12,345.5 */
export const finFmt = (v) => '¥' + (Number(v) || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
/* 纯数字格式（无 ¥ 前缀，用于公式 112,300 - 25,800） */
const finNum = (v) => (Number(v) || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 });

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
      style={{ color: FIN, background: moduleRgba('finance', 0.10) }}>
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
        className="w-7 h-7 -mr-2.5 rounded-full flex items-center justify-center hover:bg-[rgba(var(--m-finance-rgb),0.08)] active:bg-[rgba(var(--m-finance-rgb),0.14)] transition-colors text-ink-400 hover:text-[var(--m-finance)]"
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

/* ===== 需求1/2/3：攒钱目标卡 v4（水位球 · 斜杠金额 · 还差行 · 计划x-x-x达成） ===== */
function GoalCard({ goal, onDetail, onEdit, onRemove, onDeposit }) {
  const plan = planLabel(goal.deadline);
  const target = Number(goal.target_amount) || 0;
  const current = Number(goal.current_amount) || 0;
  const isDone = goal.status === 'done' || (target > 0 && current >= target);
  /* 进度前端实时计算（不依赖后端字段），超额封顶 100% */
  const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
  const remain = Math.max(0, target - current);
  /* 未达成且截止日早于今天 → 已过期 */
  const overdue = !isDone && (() => {
    const m = String(goal.deadline || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!m) return false;
    const dl = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return dl < today;
  })();
  /* 水位涨过球心（≥50%）后，球心百分比切白字 */
  const onWater = pct >= 50;
  return (
    <div className="bg-white rounded-xl p-2 px-3 flex flex-col gap-1"
      style={{ boxShadow: `0 2px 10px ${moduleRgba('finance', 0.12)}` }}>
      {/* 标题行：目标名 + 已达成徽标 + ⋮（需求2：右上角纵向三点） */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center min-w-0 gap-1.5">
          <span className="text-[15px] font-bold text-ink-900 leading-snug truncate">{goal.name}</span>
          {isDone && (
            <span className="inline-flex items-center align-middle px-1.5 h-[17px] rounded-full text-[10px] font-bold flex-shrink-0"
              style={{ background: 'rgba(52,199,89,0.10)', color: GREEN }}>已达成</span>
          )}
        </div>
        <GoalMenu goal={goal} onDetail={() => onDetail(goal)} onEdit={() => onEdit(goal)} onRemove={() => onRemove(goal)} />
      </div>

      {/* 居中区：水位球 + 斜杠金额行 + 还差行 */}
      <div className="flex flex-col items-center gap-1.5 py-0">
        {/* 水位球：浅红细线框 + 淡红轨道底 + 饱和水，球心红/白动态百分比 */}
        <div className="relative w-[60px] h-[60px] rounded-full overflow-hidden flex-shrink-0 border-2"
          style={{ background: moduleRgba('finance', 0.06), borderColor: moduleRgba('finance', 0.35) }} role="img" aria-label={`进度 ${pct}%`}>
          <div className="absolute left-0 right-0 bottom-0 transition-[height] duration-500 ease-out"
            style={{ height: `${pct}%`, background: FIN }} />
          <span className="absolute inset-0 grid place-items-center text-[13px] font-bold tabular-nums"
            style={{ color: onWater ? '#fff' : FIN }}>{pct}%</span>
        </div>
        {/* ¥43,500 / ¥150,000 —— 完成值粗体、目标值弱化，整组居中 */}
        <div className="flex items-baseline justify-center gap-1.5 flex-wrap leading-none">
          <span className="text-[15px] font-bold text-ink-900 tabular-nums">{finFmt(current)}</span>
          <span className="text-[11px] font-semibold text-ink-300">/</span>
          <span className="text-[12px] font-semibold text-ink-400 tabular-nums">{finFmt(target)}</span>
        </div>
        {/* 还差行（达成后变绿色 ✓ 已达成） */}
        {isDone ? (
          <span className="text-[10.5px] font-bold" style={{ color: GREEN }}>✓ 已达成</span>
        ) : (
          <span className="text-[10.5px] text-ink-400 tabular-nums">还差 {finFmt(remain)}</span>
        )}
      </div>

      {/* 需求3：计划2026-9-30达成（过期红色提示）+ 存入 */}
      <div className="flex items-center justify-between gap-2 mt-auto">
        <span className="text-[11px] truncate" style={overdue ? { color: FIN, fontWeight: 700 } : undefined}>
          <span className={overdue ? '' : 'text-ink-400'}>{overdue ? '已过期' : (plan || '未设定达成日期')}</span>
        </span>
        <button onClick={() => onDeposit(goal)} disabled={isDone}
          className="inline-flex items-center h-[24px] px-2.5 rounded-lg text-[11.5px] font-bold transition flex-shrink-0 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed bg-ink-50 text-ink-400 hover:bg-[rgba(var(--m-finance-rgb),0.12)] hover:text-[var(--m-finance)]">
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
          <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
            {/* 窄卡自适应：240px 起步，一行自动排满 */}
            {goals.map(g => (
              <GoalCard key={g.id} goal={g}
                onDetail={onGoalDetail} onEdit={onGoalEdit} onRemove={onGoalRemove} onDeposit={onDeposit} />
            ))}
            {/* 新建目标占位卡 */}
            <button onClick={onGoalAdd}
              className="rounded-xl border border-dashed border-ink-200 min-h-[156px] grid place-items-center text-ink-400 hover:text-ink-600 hover:border-ink-300 transition group">
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

      {/* ================= 行二三 · 资产负债 + 本月收支（≥lg 左右并排，<lg 上下堆叠） ================= */}
      <div className="grid gap-3 lg:grid-cols-2 items-stretch">
      {/* 资产负债（左右两栏 + 底部净资产通栏卡） */}
      <section className={`bg-white rounded-2xl border border-ink-100 p-4 flex flex-col ${transition} ${dim}`}>
        <FinHeader title="资产负债" countLabel={`${accounts.length} 个账户`}
          right={
            <button onClick={onAccountAdd}
              className="inline-flex items-center h-[26px] px-3 rounded-lg text-[11.5px] font-semibold transition hover:brightness-105 active:scale-95"
              style={{ background: moduleRgba('finance', 0.10), color: FIN }}>
              管理账户
            </button>
          } />
        {accounts.length === 0 ? (
          <button onClick={onAccountAdd}
            className="w-full rounded-xl border border-dashed border-ink-200 py-6 text-[12.5px] font-semibold text-ink-400 hover:text-ink-600 hover:border-ink-300 transition">
            + 新建第一个账户（现金 / 储蓄卡 / 信用卡…）
          </button>
        ) : (
          (() => {
            // 按余额正负拆分资产/负债（正→资产列，负→负债列显示为绝对值）
            const assetAccs = accounts.filter(a => (Number(a.balance) || 0) >= 0);
            const liabAccs = accounts.filter(a => (Number(a.balance) || 0) < 0);
            const assetTotal = assetAccs.reduce((s, a) => s + (Number(a.balance) || 0), 0);
            const liabTotal = liabAccs.reduce((s, a) => s + Math.abs(Number(a.balance) || 0), 0);
            const netWorth = assetTotal - liabTotal;
            const nwDelta = (Number(ms.income) || 0) - (Number(ms.expense) || 0); // 当月净资产变化=收入-支出
            return (
              <div className="flex flex-col gap-3 flex-1">
                {/* 左右两栏：资产 / 负债 —— 缩进 17px 与标题文字左端对齐，右 17px 与边缘留距，中缝灰色间隔线 */}
                <div className="grid grid-cols-2 pl-[17px] pr-[17px]">
                  {/* 资产 */}
                  <div className="flex flex-col gap-2.5 min-w-0 pr-6">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-[15px] font-semibold text-ink-700">
                        <span className="w-[22px] h-[22px] rounded-[6.5px] grid place-items-center flex-shrink-0"
                          style={{ background: moduleRgba('finance', 0.09), color: FIN }}>
                          <svg className="w-[13px] h-[13px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="17" height="17" rx="3.5" /><circle cx="12" cy="12" r="3.2" /></svg>
                        </span>
                        资产
                      </span>
                      <span className="text-[16px] font-bold tabular-nums text-ink-900 leading-none">{finFmt(assetTotal)}</span>
                    </div>
                    <div className="flex flex-col">
                      {assetAccs.length === 0 ? (
                        <span className="text-[12px] text-ink-300 py-1">暂无资产账户</span>
                      ) : assetAccs.map(a => {
                        const meta = accTypeMeta(a.type);
                        return (
                          <button key={a.id} onClick={() => onAccountEdit(a)} title="编辑账户"
                            className="flex items-center justify-between gap-2 py-1 text-left hover:bg-ink-50/80 rounded-md px-1 -mx-1 transition">
                            <span className="flex items-center gap-2 min-w-0">
                              <span className="text-[15px] flex-shrink-0">{a.icon || meta.icon}</span>
                              <span className="text-[14px] text-ink-800 truncate">{a.name}</span>
                            </span>
                            <span className="text-[14px] tabular-nums text-ink-900 flex-shrink-0">{finFmt(a.balance)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {/* 负债（左缘灰色间隔线） */}
                  <div className="flex flex-col gap-2.5 min-w-0 border-l border-ink-100 pl-6">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-[15px] font-semibold text-ink-700">
                        <span className="w-[22px] h-[22px] rounded-[6.5px] grid place-items-center flex-shrink-0"
                          style={{ background: moduleRgba('finance', 0.09), color: FIN }}>
                          <svg className="w-[13px] h-[13px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="2.5" y="5.5" width="19" height="13" rx="2.5" /><path d="M2.5 10h19" /></svg>
                        </span>
                        负债
                      </span>
                      <span className="text-[16px] font-bold tabular-nums leading-none text-ink-900">{finFmt(liabTotal)}</span>
                    </div>
                    <div className="flex flex-col">
                      {liabAccs.length === 0 ? (
                        <span className="text-[12px] text-ink-300 py-1">暂无负债</span>
                      ) : liabAccs.map(a => {
                        const meta = accTypeMeta(a.type);
                        return (
                          <button key={a.id} onClick={() => onAccountEdit(a)} title="编辑账户"
                            className="flex items-center justify-between gap-2 py-1 text-left hover:bg-ink-50/80 rounded-md px-1 -mx-1 transition">
                            <span className="flex items-center gap-2 min-w-0">
                              <span className="text-[15px] flex-shrink-0">{a.icon || meta.icon}</span>
                              <span className="text-[14px] text-ink-800 truncate">{a.name}</span>
                            </span>
                            <span className="text-[14px] tabular-nums flex-shrink-0 text-ink-900">-{finFmt(Math.abs(Number(a.balance) || 0))}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
                {/* 分割线 */}
                <div className="h-px bg-ink-100 mt-auto" />
                {/* 底部：净资产行（白底，左右与两栏内容对齐） */}
                <div className="rounded-xl px-[17px] py-1 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <span className="text-[15px] font-semibold text-ink-700">净资产</span>
                    <span className="text-[12px] text-ink-400 tabular-nums">{finNum(assetTotal)} - {finNum(liabTotal)}</span>
                    {nwDelta !== 0 && (
                      <span className="text-[11px] font-semibold tabular-nums" style={{ color: nwDelta > 0 ? GREEN : RED }}>
                        {nwDelta > 0 ? '▲' : '▼'} 本月 {nwDelta > 0 ? '+' : ''}{finFmt(nwDelta)}
                      </span>
                    )}
                  </div>
                  <span className="text-[18px] font-bold tabular-nums tracking-tight leading-none flex-shrink-0" style={{ color: FIN }}>
                    {finFmt(netWorth)}
                  </span>
                </div>
              </div>
            );
          })()
        )}
      </section>

      {/* 本月收支（需求6：管理按钮） */}
      <section className={`bg-white rounded-2xl border border-ink-100 p-4 flex flex-col ${transition} ${dim}`}>
        <FinHeader title="本月收支"
          right={
            <>
              <MonthNav month={month} onChange={onMonthChange} />
              {/* 需求6：管理按钮 —— 增删收支分类（如新增副业收入项）；样式与资产负债"管理账户"按钮统一 */}
              <button onClick={onManage}
                className="inline-flex items-center h-[26px] px-3 rounded-lg text-[11.5px] font-semibold transition hover:brightness-105 active:scale-95"
                style={{ background: moduleRgba('finance', 0.10), color: FIN }}
                title="管理收支分类（如新增副业收入）">
                管理分类
              </button>
              {/* 记一笔主操作 */}
              <button onClick={onTxAdd}
                className="inline-flex items-center gap-1 h-[26px] px-3 rounded-lg text-[11.5px] font-bold text-white transition hover:brightness-105 active:scale-95 flex-shrink-0"
                style={{ background: FIN, boxShadow: `0 2px 8px ${moduleRgba('finance', 0.30)}` }}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" strokeLinecap="round" /></svg>
                记一笔
              </button>
            </>
          } />
        {/* 左右两栏：收入 / 支出 + 底部月结余通栏卡 */}
        {(() => {
          const income = Number(ms.income) || 0;
          const expense = Number(ms.expense) || 0;
          const prevIncome = Number(ps.income) || 0;
          const prevExpense = Number(ps.expense) || 0;
          const monthBalance = income - expense;
          const balDelta = monthBalance - (prevIncome - prevExpense); // 较上月结余变化
          return (
            <div className="flex flex-col gap-3 flex-1">
              {/* 左右两栏：收入 / 支出 —— 缩进 17px 与标题文字左端对齐，右 17px 与边缘留距，中缝灰色间隔线 */}
              <div className="grid grid-cols-2 pl-[17px] pr-[17px]">
                {/* 收入 */}
                <div className="flex flex-col gap-2.5 min-w-0 pr-6">
                  <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-[15px] font-semibold text-ink-700">
                        <span className="w-[22px] h-[22px] rounded-[6.5px] grid place-items-center flex-shrink-0"
                          style={{ background: moduleRgba('finance', 0.09), color: FIN }}>
                          <svg className="w-[13px] h-[13px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M12 5v13" /><path d="M6.5 12.5L12 18l5.5-5.5" /></svg>
                        </span>
                        收入
                      </span>
                      <span className="text-[16px] font-bold tabular-nums leading-none text-ink-900">+{finFmt(income)}</span>
                    </div>
                  <div className="flex flex-col">
                    {ms.incomeByCat.length === 0 ? (
                      <span className="text-[12px] text-ink-300 py-1">本月暂无收入</span>
                    ) : ms.incomeByCat.map(c => (
                      <div key={`inc-${c.id ?? c.name}`} className="flex items-center justify-between gap-2 py-1">
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="text-[15px] flex-shrink-0">{c.icon}</span>
                          <span className="text-[14px] text-ink-800 truncate">{c.name}</span>
                        </span>
                        <span className="text-[14px] tabular-nums flex-shrink-0 text-ink-900">+{finFmt(c.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                {/* 支出（左缘灰色间隔线） */}
                <div className="flex flex-col gap-2.5 min-w-0 border-l border-ink-100 pl-6">
                  <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-[15px] font-semibold text-ink-700">
                        <span className="w-[22px] h-[22px] rounded-[6.5px] grid place-items-center flex-shrink-0"
                          style={{ background: moduleRgba('finance', 0.09), color: FIN }}>
                          <svg className="w-[13px] h-[13px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M12 19V6" /><path d="M6.5 11.5L12 6l5.5 5.5" /></svg>
                        </span>
                        支出
                      </span>
                      <span className="text-[16px] font-bold tabular-nums leading-none text-ink-900">{finFmt(expense)}</span>
                    </div>
                  <div className="flex flex-col">
                    {ms.expenseByCat.length === 0 ? (
                      <span className="text-[12px] text-ink-300 py-1">本月暂无支出</span>
                    ) : ms.expenseByCat.map(c => (
                      <div key={`exp-${c.id ?? c.name}`} className="flex items-center justify-between gap-2 py-1">
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="text-[15px] flex-shrink-0">{c.icon}</span>
                          <span className="text-[14px] text-ink-800 truncate">{c.name}</span>
                        </span>
                        <span className="text-[14px] tabular-nums flex-shrink-0 text-ink-900">{finFmt(c.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              {/* 分割线 */}
              <div className="h-px bg-ink-100 mt-auto" />
              {/* 底部：月结余行（白底，左右与两栏内容对齐） */}
              <div className="rounded-xl px-[17px] py-1 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <span className="text-[15px] font-semibold text-ink-700">月结余</span>
                  <span className="text-[12px] text-ink-400 tabular-nums">{finNum(income)} - {finNum(expense)}</span>
                  {balDelta !== 0 && (
                    <span className="text-[11px] font-semibold tabular-nums" style={{ color: balDelta > 0 ? GREEN : RED }}>
                      {balDelta > 0 ? '▲' : '▼'} 较上月 {balDelta > 0 ? '+' : ''}{finFmt(balDelta)}
                    </span>
                  )}
                </div>
                <span className="text-[18px] font-bold tabular-nums tracking-tight leading-none flex-shrink-0" style={{ color: FIN }}>
                  {monthBalance >= 0 ? '+' : ''}{finFmt(monthBalance)}
                </span>
              </div>
            </div>
          );
        })()}
      </section>
      </div>

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
          <div className="flex flex-col divide-y divide-ink-100/70 -mx-1 pr-[17px]">
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
                          style={{ background: moduleRgba('finance', 0.12), color: FIN }}>🎯</span>
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
