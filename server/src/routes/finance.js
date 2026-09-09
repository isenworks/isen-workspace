// ============================================================
// /api/finance/* 路由（财务模块 · Express 本地开发镜像）
//   与 functions/_lib/handlers/finance.js 逻辑对齐：
//   - 表：finance_accounts / finance_categories / finance_transactions / finance_goals（无前缀，对齐 Express 现有表）
//   - 金额：DB 存「分」(INTEGER)，API 进出换算「元」
//   - 统计：transfer 不计收支；净资产 = 资产余额 − 负债
// ============================================================
import { Router } from 'express';
import { db } from '../db.js';

const router = Router();

const TX_TYPES = ['expense', 'income', 'transfer'];
const ACCOUNT_TYPES = ['cash', 'debit', 'credit', 'virtual', 'invest', 'debt'];
const LIABILITY_TYPES = ['credit', 'debt'];

const DEFAULT_CATEGORIES = [
  { name: '餐饮', type: 'expense', icon: '🍜', color: '#FF9500' },
  { name: '交通', type: 'expense', icon: '🚌', color: '#007AFF' },
  { name: '购物', type: 'expense', icon: '🛍️', color: '#FF2D55' },
  { name: '居住', type: 'expense', icon: '🏠', color: '#34C759' },
  { name: '娱乐', type: 'expense', icon: '🎮', color: '#AF52DE' },
  { name: '通讯', type: 'expense', icon: '📱', color: '#5856D6' },
  { name: '健康', type: 'expense', icon: '❤️', color: '#FF3B30' },
  { name: '教育', type: 'expense', icon: '📚', color: '#30B0C7' },
  { name: '人情', type: 'expense', icon: '🎁', color: '#FFB627' },
  { name: '工资', type: 'income', icon: '💼', color: '#34C759' },
  { name: '副业', type: 'income', icon: '🚀', color: '#FFB627' },
  { name: '理财收益', type: 'income', icon: '📈', color: '#30B0C7' },
  { name: '其他收入', type: 'income', icon: '✨', color: '#8E8E93' },
];

const DEFAULT_ACCOUNTS = [
  { name: '现金', type: 'cash', icon: '💵' },
  { name: '微信零钱', type: 'virtual', icon: '💬' },
  { name: '储蓄卡', type: 'debit', icon: '🏦' },
];

function yuanToCents(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100);
}
function centsToYuan(c) {
  return (Number(c) || 0) / 100;
}
function normalizeDate(input) {
  if (!input || typeof input !== 'string') return null;
  const m = input.trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const iso = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const dt = new Date(iso + 'T00:00:00Z');
  return (dt.getUTCFullYear() === y && dt.getUTCMonth() + 1 === mo && dt.getUTCDate() === d) ? iso : null;
}

// 首访种子：无分类种预置分类；无账户种预置账户（幂等）
function ensureSeed(userId) {
  const hasCat = db.prepare(`SELECT id FROM finance_categories WHERE user_id = ? LIMIT 1`).get(userId);
  if (!hasCat) {
    const ins = db.prepare(`INSERT INTO finance_categories (user_id,name,type,icon,color,sort_order,is_system) VALUES (?,?,?,?,?,?,1)`);
    DEFAULT_CATEGORIES.forEach((c, i) => ins.run(userId, c.name, c.type, c.icon, c.color, i));
  }
  const hasAcc = db.prepare(`SELECT id FROM finance_accounts WHERE user_id = ? LIMIT 1`).get(userId);
  if (!hasAcc) {
    const ins = db.prepare(`INSERT INTO finance_accounts (user_id,name,type,icon,sort_order) VALUES (?,?,?,?,?)`);
    DEFAULT_ACCOUNTS.forEach((a, i) => ins.run(userId, a.name, a.type, a.icon, i));
  }
}

// 仪表盘派生计算（与 D1 端 computeDashboard 对齐）
function computeDashboard(accounts, categories, goals, txs, month) {
  const accMap = new Map(accounts.map(a => [a.id, a]));
  const catMap = new Map(categories.map(c => [c.id, c]));

  const bal = new Map();
  accounts.forEach(a => bal.set(a.id, Number(a.initial_balance) || 0));
  txs.forEach(t => {
    const amt = Number(t.amount) || 0;
    if (t.type === 'income' && bal.has(t.account_id)) {
      bal.set(t.account_id, bal.get(t.account_id) + amt);
    } else if (t.type === 'expense' && bal.has(t.account_id)) {
      bal.set(t.account_id, bal.get(t.account_id) - amt);
    } else if (t.type === 'transfer' && t.to_account_id != null) {
      if (bal.has(t.account_id)) bal.set(t.account_id, bal.get(t.account_id) - amt);
      if (bal.has(t.to_account_id)) bal.set(t.to_account_id, bal.get(t.to_account_id) + amt);
    }
  });

  let assets = 0, liabilities = 0;
  accounts.forEach(a => {
    if (!a.include_in_net_worth) return;
    const b = bal.get(a.id) || 0;
    if (LIABILITY_TYPES.includes(a.type) ? b < 0 : b >= 0) assets += b;
    else liabilities += -b;
  });

  const monthOf = (d) => String(d || '').slice(0, 7);
  const sumMonth = (m) => {
    let income = 0, expense = 0;
    const incByCat = new Map(), expByCat = new Map();
    txs.forEach(t => {
      if (monthOf(t.date) !== m) return;
      if (t.type === 'income') {
        income += Number(t.amount) || 0;
        incByCat.set(t.category_id, (incByCat.get(t.category_id) || 0) + (Number(t.amount) || 0));
      } else if (t.type === 'expense') {
        expense += Number(t.amount) || 0;
        expByCat.set(t.category_id, (expByCat.get(t.category_id) || 0) + (Number(t.amount) || 0));
      }
    });
    return { income, expense, incByCat, expByCat };
  };
  const cur = sumMonth(month);
  const [y, mo] = month.split('-').map(Number);
  const prevDate = new Date(Date.UTC(y, mo - 2, 1));
  const prevMonth = `${prevDate.getUTCFullYear()}-${String(prevDate.getUTCMonth() + 1).padStart(2, '0')}`;
  const prev = sumMonth(prevMonth);

  const catList = (m) => [...m.entries()].map(([cid, amt]) => ({
    id: cid, name: catMap.get(cid)?.name || '未分类', icon: catMap.get(cid)?.icon || '🏷️',
    amount: centsToYuan(amt),
  })).filter(x => x.amount > 0).sort((a, b) => b.amount - a.amount);

  const goalsOut = goals.map(g => ({
    ...g,
    target_amount: centsToYuan(g.target_amount),
    current_amount: centsToYuan(g.current_amount),
    monthly_plan: g.monthly_plan != null ? centsToYuan(g.monthly_plan) : null,
    account_name: accMap.get(g.account_id)?.name || '',
    progress: g.target_amount > 0 ? Math.min(100, Math.round((g.current_amount / g.target_amount) * 100)) : 0,
  }));

  return {
    bal,
    netWorth: { assets: centsToYuan(assets), liabilities: centsToYuan(liabilities), netWorth: centsToYuan(assets - liabilities) },
    monthStats: { income: centsToYuan(cur.income), expense: centsToYuan(cur.expense), incomeByCat: catList(cur.incByCat), expenseByCat: catList(cur.expByCat) },
    prevStats: { income: centsToYuan(prev.income), expense: centsToYuan(prev.expense) },
    goals: goalsOut,
  };
}

// POST /api/finance/bootstrap — 仪表盘一次拉全 { month: 'YYYY-MM' }
router.post('/bootstrap', (req, res) => {
  const userId = req.user.id;
  ensureSeed(userId);
  let month = String(req.body?.month || '').trim();
  if (!/^\d{4}-\d{2}$/.test(month)) {
    const d = new Date();
    month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  const accounts = db.prepare(`SELECT * FROM finance_accounts WHERE user_id=? AND archived=0 ORDER BY sort_order, id`).all(userId);
  const categories = db.prepare(`SELECT * FROM finance_categories WHERE user_id=? ORDER BY type, sort_order, id`).all(userId);
  const goals = db.prepare(`SELECT * FROM finance_goals WHERE user_id=? AND status != 'archived' ORDER BY sort_order, id DESC`).all(userId);
  const txs = db.prepare(`SELECT * FROM finance_transactions WHERE user_id=? ORDER BY date DESC, id DESC`).all(userId);

  const dash = computeDashboard(accounts, categories, goals, txs, month);
  const accMap = new Map(accounts.map(a => [a.id, a]));
  const catMap = new Map(categories.map(c => [c.id, c]));
  const recent = txs.slice(0, 100).map(t => ({
    ...t,
    amount: centsToYuan(t.amount),
    account_name: accMap.get(t.account_id)?.name || '',
    to_account_name: accMap.get(t.to_account_id)?.name || '',
    category_name: catMap.get(t.category_id)?.name || '',
    category_icon: catMap.get(t.category_id)?.icon || '🏷️',
  }));

  res.json({
    ok: true,
    month,
    accounts: accounts.map(a => ({ ...a, initial_balance: centsToYuan(a.initial_balance), balance: centsToYuan(dash.bal.get(a.id) || 0) })),
    categories,
    goals: dash.goals,
    transactions: recent,
    monthStats: dash.monthStats,
    prevStats: dash.prevStats,
    netWorth: dash.netWorth,
  });
});

// ===== 账户 =====
router.post('/accountCreate', (req, res) => {
  const d = req.body || {};
  const name = String(d.name || '').trim();
  if (!name) return res.status(400).json({ error: '账户名称必填' });
  const type = ACCOUNT_TYPES.includes(d.type) ? d.type : 'debit';
  let initC = d.initialBalance != null ? Math.round(Number(d.initialBalance) * 100) : 0;
  if (LIABILITY_TYPES.includes(type) && initC > 0) initC = -initC;
  const info = db.prepare(
    `INSERT INTO finance_accounts (user_id,name,type,initial_balance,icon,color,include_in_net_worth,sort_order) VALUES (?,?,?,?,?,?,?,?)`
  ).run(req.user.id, name, type, initC, d.icon || '🏦', d.color || '#FFB627', d.includeInNetWorth === false ? 0 : 1, Number(d.sortOrder) || 0);
  res.json({ ok: true, account: db.prepare(`SELECT * FROM finance_accounts WHERE id=?`).get(info.lastInsertRowid) });
});

router.post('/accountUpdate', (req, res) => {
  const id = Number(req.body?.id);
  if (!id) return res.status(400).json({ error: '缺少 id' });
  const d = req.body || {};
  const sets = [], params = [];
  if (d.name !== undefined) { sets.push('name=?'); params.push(String(d.name).trim()); }
  if (d.type !== undefined && ACCOUNT_TYPES.includes(d.type)) { sets.push('type=?'); params.push(d.type); }
  if (d.initialBalance !== undefined) {
    let c = Math.round(Number(d.initialBalance) * 100) || 0;
    const row = db.prepare(`SELECT type FROM finance_accounts WHERE id=? AND user_id=?`).get(id, req.user.id);
    if (row && LIABILITY_TYPES.includes(row.type) && c > 0) c = -c;
    sets.push('initial_balance=?'); params.push(c);
  }
  if (d.icon !== undefined) { sets.push('icon=?'); params.push(d.icon); }
  if (d.color !== undefined) { sets.push('color=?'); params.push(d.color); }
  if (d.includeInNetWorth !== undefined) { sets.push('include_in_net_worth=?'); params.push(d.includeInNetWorth ? 1 : 0); }
  if (d.sortOrder !== undefined) { sets.push('sort_order=?'); params.push(Number(d.sortOrder) || 0); }
  if (d.archived !== undefined) { sets.push('archived=?'); params.push(d.archived ? 1 : 0); }
  if (!sets.length) return res.status(400).json({ error: '没有可更新字段' });
  params.push(id, req.user.id);
  db.prepare(`UPDATE finance_accounts SET ${sets.join(',')} WHERE id=? AND user_id=?`).run(...params);
  res.json({ ok: true });
});

router.post('/accountRemove', (req, res) => {
  const id = Number(req.body?.id);
  if (!id) return res.status(400).json({ error: '缺少 id' });
  db.prepare(`DELETE FROM finance_accounts WHERE id=? AND user_id=?`).run(id, req.user.id);
  res.json({ ok: true });
});

// ===== 分类 =====
router.post('/categoryCreate', (req, res) => {
  const d = req.body || {};
  const name = String(d.name || '').trim();
  if (!name) return res.status(400).json({ error: '分类名称必填' });
  const type = d.type === 'income' ? 'income' : 'expense';
  const maxRow = db.prepare(`SELECT MAX(sort_order) AS m FROM finance_categories WHERE user_id=? AND type=?`).get(req.user.id, type);
  const info = db.prepare(
    `INSERT INTO finance_categories (user_id,name,type,icon,color,sort_order) VALUES (?,?,?,?,?,?)`
  ).run(req.user.id, name, type, d.icon || (type === 'income' ? '✨' : '🏷️'), d.color || '#8E8E93', Number(maxRow?.m || 0) + 1);
  res.json({ ok: true, category: db.prepare(`SELECT * FROM finance_categories WHERE id=?`).get(info.lastInsertRowid) });
});

router.post('/categoryUpdate', (req, res) => {
  const id = Number(req.body?.id);
  if (!id) return res.status(400).json({ error: '缺少 id' });
  const d = req.body || {};
  const sets = [], params = [];
  if (d.name !== undefined) { sets.push('name=?'); params.push(String(d.name).trim()); }
  if (d.icon !== undefined) { sets.push('icon=?'); params.push(d.icon); }
  if (d.color !== undefined) { sets.push('color=?'); params.push(d.color); }
  if (d.sortOrder !== undefined) { sets.push('sort_order=?'); params.push(Number(d.sortOrder) || 0); }
  if (!sets.length) return res.status(400).json({ error: '没有可更新字段' });
  params.push(id, req.user.id);
  db.prepare(`UPDATE finance_categories SET ${sets.join(',')} WHERE id=? AND user_id=?`).run(...params);
  res.json({ ok: true });
});

router.post('/categoryRemove', (req, res) => {
  const id = Number(req.body?.id);
  if (!id) return res.status(400).json({ error: '缺少 id' });
  const row = db.prepare(`SELECT * FROM finance_categories WHERE id=? AND user_id=?`).get(id, req.user.id);
  if (!row) return res.status(404).json({ error: '分类不存在' });
  if (row.is_system) return res.status(400).json({ error: '预置分类不可删除' });
  db.prepare(`UPDATE finance_transactions SET category_id=NULL WHERE category_id=? AND user_id=?`).run(id, req.user.id);
  db.prepare(`DELETE FROM finance_categories WHERE id=? AND user_id=?`).run(id, req.user.id);
  res.json({ ok: true });
});

// ===== 流水 =====
router.post('/txCreate', (req, res) => {
  const d = req.body || {};
  const type = TX_TYPES.includes(d.type) ? d.type : 'expense';
  const amountC = yuanToCents(d.amount);
  if (!amountC) return res.status(400).json({ error: '金额必须大于 0' });
  const date = normalizeDate(d.date) || new Date().toISOString().slice(0, 10);
  const accountId = d.accountId != null ? Number(d.accountId) : null;
  const toAccountId = d.toAccountId != null ? Number(d.toAccountId) : null;
  if (type === 'transfer') {
    if (!accountId || !toAccountId) return res.status(400).json({ error: '转账需要转出与转入账户' });
    if (accountId === toAccountId) return res.status(400).json({ error: '转出与转入账户不能相同' });
  } else if (!accountId) {
    return res.status(400).json({ error: '请选择账户' });
  }
  const info = db.prepare(
    `INSERT INTO finance_transactions (user_id,type,amount,account_id,to_account_id,category_id,goal_id,date,note) VALUES (?,?,?,?,?,?,?,?,?)`
  ).run(req.user.id, type, amountC, accountId, type === 'transfer' ? toAccountId : null,
    type === 'transfer' ? null : (d.categoryId != null ? Number(d.categoryId) : null),
    d.goalId != null ? Number(d.goalId) : null, date, d.note || null);
  res.json({ ok: true, transaction: db.prepare(`SELECT * FROM finance_transactions WHERE id=?`).get(info.lastInsertRowid) });
});

router.post('/txUpdate', (req, res) => {
  const id = Number(req.body?.id);
  if (!id) return res.status(400).json({ error: '缺少 id' });
  const d = req.body || {};
  const row = db.prepare(`SELECT * FROM finance_transactions WHERE id=? AND user_id=?`).get(id, req.user.id);
  if (!row) return res.status(404).json({ error: '流水不存在' });
  const sets = [], params = [];
  if (d.amount !== undefined) {
    const c = yuanToCents(d.amount);
    if (!c) return res.status(400).json({ error: '金额必须大于 0' });
    sets.push('amount=?'); params.push(c);
  }
  if (d.date !== undefined) { const dd = normalizeDate(d.date); if (dd) { sets.push('date=?'); params.push(dd); } }
  if (d.note !== undefined) { sets.push('note=?'); params.push(d.note || null); }
  if (d.categoryId !== undefined) { sets.push('category_id=?'); params.push(d.categoryId != null ? Number(d.categoryId) : null); }
  if (d.accountId !== undefined) { sets.push('account_id=?'); params.push(d.accountId != null ? Number(d.accountId) : null); }
  if (d.toAccountId !== undefined) { sets.push('to_account_id=?'); params.push(d.toAccountId != null ? Number(d.toAccountId) : null); }
  if (!sets.length) return res.status(400).json({ error: '没有可更新字段' });
  params.push(id, req.user.id);
  db.prepare(`UPDATE finance_transactions SET ${sets.join(',')} WHERE id=? AND user_id=?`).run(...params);
  if (row.goal_id && d.amount !== undefined) {
    const diff = yuanToCents(d.amount) - Number(row.amount);
    if (diff !== 0) {
      db.prepare(`UPDATE finance_goals SET current_amount = MAX(0, current_amount + ?) WHERE id=? AND user_id=?`).run(diff, row.goal_id, req.user.id);
      db.prepare(`UPDATE finance_goals SET status=CASE WHEN current_amount>=target_amount THEN 'done' ELSE 'active' END WHERE id=? AND user_id=?`).run(row.goal_id, req.user.id);
    }
  }
  res.json({ ok: true });
});

router.post('/txRemove', (req, res) => {
  const id = Number(req.body?.id);
  if (!id) return res.status(400).json({ error: '缺少 id' });
  const row = db.prepare(`SELECT * FROM finance_transactions WHERE id=? AND user_id=?`).get(id, req.user.id);
  if (!row) return res.status(404).json({ error: '流水不存在' });
  db.prepare(`DELETE FROM finance_transactions WHERE id=? AND user_id=?`).run(id, req.user.id);
  if (row.goal_id) {
    db.prepare(`UPDATE finance_goals SET current_amount = MAX(0, current_amount - ?) WHERE id=? AND user_id=?`).run(Number(row.amount) || 0, row.goal_id, req.user.id);
    db.prepare(`UPDATE finance_goals SET status=CASE WHEN current_amount>=target_amount THEN 'done' ELSE 'active' END WHERE id=? AND user_id=?`).run(row.goal_id, req.user.id);
  }
  res.json({ ok: true });
});

// ===== 目标 =====
router.post('/goalCreate', (req, res) => {
  const d = req.body || {};
  const name = String(d.name || '').trim();
  if (!name) return res.status(400).json({ error: '目标名称必填' });
  const targetC = yuanToCents(d.targetAmount);
  if (!targetC) return res.status(400).json({ error: '目标金额必须大于 0' });
  const monthlyC = d.monthlyPlan != null && Number(d.monthlyPlan) > 0 ? Math.round(Number(d.monthlyPlan) * 100) : null;
  const info = db.prepare(
    `INSERT INTO finance_goals (user_id,name,target_amount,current_amount,deadline,monthly_plan,account_id,status,sort_order) VALUES (?,?,?,?,?,?,?,?,?)`
  ).run(req.user.id, name, targetC, 0, normalizeDate(d.deadline) || null, monthlyC,
    d.accountId != null ? Number(d.accountId) : null, 'active', Number(d.sortOrder) || 0);
  res.json({ ok: true, goal: db.prepare(`SELECT * FROM finance_goals WHERE id=?`).get(info.lastInsertRowid) });
});

router.post('/goalUpdate', (req, res) => {
  const id = Number(req.body?.id);
  if (!id) return res.status(400).json({ error: '缺少 id' });
  const d = req.body || {};
  const sets = [], params = [];
  if (d.name !== undefined) { sets.push('name=?'); params.push(String(d.name).trim()); }
  if (d.targetAmount !== undefined) {
    const c = yuanToCents(d.targetAmount);
    if (!c) return res.status(400).json({ error: '目标金额必须大于 0' });
    sets.push('target_amount=?'); params.push(c);
  }
  if (d.deadline !== undefined) { sets.push('deadline=?'); params.push(normalizeDate(d.deadline) || null); }
  if (d.monthlyPlan !== undefined) { sets.push('monthly_plan=?'); params.push(d.monthlyPlan != null && Number(d.monthlyPlan) > 0 ? Math.round(Number(d.monthlyPlan) * 100) : null); }
  if (d.accountId !== undefined) { sets.push('account_id=?'); params.push(d.accountId != null ? Number(d.accountId) : null); }
  if (d.sortOrder !== undefined) { sets.push('sort_order=?'); params.push(Number(d.sortOrder) || 0); }
  if (!sets.length) return res.status(400).json({ error: '没有可更新字段' });
  params.push(id, req.user.id);
  db.prepare(`UPDATE finance_goals SET ${sets.join(',')} WHERE id=? AND user_id=?`).run(...params);
  db.prepare(`UPDATE finance_goals SET status=CASE WHEN current_amount>=target_amount THEN 'done' ELSE 'active' END WHERE id=? AND user_id=?`).run(id, req.user.id);
  res.json({ ok: true });
});

router.post('/goalRemove', (req, res) => {
  const id = Number(req.body?.id);
  if (!id) return res.status(400).json({ error: '缺少 id' });
  const row = db.prepare(`SELECT * FROM finance_goals WHERE id=? AND user_id=?`).get(id, req.user.id);
  if (!row) return res.status(404).json({ error: '目标不存在' });
  db.prepare(`UPDATE finance_transactions SET goal_id=NULL WHERE goal_id=? AND user_id=?`).run(id, req.user.id);
  db.prepare(`DELETE FROM finance_goals WHERE id=? AND user_id=?`).run(id, req.user.id);
  res.json({ ok: true });
});

// 存入：fromAccountId → goal.account_id 的 transfer + current_amount 累加
router.post('/goalDeposit', (req, res) => {
  const d = req.body || {};
  const id = Number(d?.goalId);
  const amountC = yuanToCents(d?.amount);
  if (!id) return res.status(400).json({ error: '缺少 goalId' });
  if (!amountC) return res.status(400).json({ error: '存入金额必须大于 0' });
  const goal = db.prepare(`SELECT * FROM finance_goals WHERE id=? AND user_id=?`).get(id, req.user.id);
  if (!goal) return res.status(404).json({ error: '目标不存在' });
  const date = normalizeDate(d.date) || new Date().toISOString().slice(0, 10);
  const fromId = d.fromAccountId != null ? Number(d.fromAccountId) : null;
  const toId = goal.account_id != null ? Number(goal.account_id) : null;
  if (fromId && toId && fromId !== toId) {
    db.prepare(
      `INSERT INTO finance_transactions (user_id,type,amount,account_id,to_account_id,category_id,goal_id,date,note) VALUES (?, 'transfer', ?, ?, ?, NULL, ?, ?, ?)`
    ).run(req.user.id, amountC, fromId, toId, id, date, d.note || `存入「${goal.name}」`);
  }
  db.prepare(`UPDATE finance_goals SET current_amount = current_amount + ? WHERE id=? AND user_id=?`).run(amountC, id, req.user.id);
  db.prepare(`UPDATE finance_goals SET status=CASE WHEN current_amount>=target_amount THEN 'done' ELSE 'active' END WHERE id=? AND user_id=?`).run(id, req.user.id);
  res.json({ ok: true, goal: db.prepare(`SELECT * FROM finance_goals WHERE id=?`).get(id) });
});

export default router;
