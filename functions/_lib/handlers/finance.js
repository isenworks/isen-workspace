// ============================================================
// /api/finance/* 处理器（财务模块 · 发展规划第 6 模块）
//   四表：ethan_finance_accounts / _categories / _transactions / _goals
//   金额约定：DB 内以「分」(INTEGER) 存储避免浮点误差；API 层进出均换算为「元」
//   统计口径：transfer 不计收支；净资产 = 资产账户余额 − 负债账户余额
//   回收站：流水(financeTx)/目标(financeGoal) 删除前快照入站，可还原
// ============================================================
import { uid, json, dbAll, dbFirst, dbRun, recycleSnapshot, normalizeDate } from '../core.js';

// 预置收支分类（首访种子；is_system=1 不可删）
const DEFAULT_CATEGORIES = [
  // 支出
  { name: '餐饮', type: 'expense', icon: '🍜', color: '#FF9500' },
  { name: '交通', type: 'expense', icon: '🚌', color: '#007AFF' },
  { name: '购物', type: 'expense', icon: '🛍️', color: '#FF2D55' },
  { name: '居住', type: 'expense', icon: '🏠', color: '#34C759' },
  { name: '娱乐', type: 'expense', icon: '🎮', color: '#AF52DE' },
  { name: '通讯', type: 'expense', icon: '📱', color: '#5856D6' },
  { name: '健康', type: 'expense', icon: '❤️', color: '#FF3B30' },
  { name: '教育', type: 'expense', icon: '📚', color: '#30B0C7' },
  { name: '人情', type: 'expense', icon: '🎁', color: '#FFB627' },
  // 收入
  { name: '工资', type: 'income', icon: '💼', color: '#34C759' },
  { name: '副业', type: 'income', icon: '🚀', color: '#FFB627' },
  { name: '理财收益', type: 'income', icon: '📈', color: '#30B0C7' },
  { name: '其他收入', type: 'income', icon: '✨', color: '#8E8E93' },
];

// 预置账户（首访种子；可改名/归档/删除）
const DEFAULT_ACCOUNTS = [
  { name: '现金', type: 'cash', icon: '💵' },
  { name: '微信零钱', type: 'virtual', icon: '💬' },
  { name: '储蓄卡', type: 'debit', icon: '🏦' },
];

const TX_TYPES = ['expense', 'income', 'transfer'];
const ACCOUNT_TYPES = ['cash', 'debit', 'credit', 'virtual', 'invest', 'debt'];
const LIABILITY_TYPES = ['credit', 'debt'];

// 元 → 分（防浮点尾差）
function yuanToCents(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100);
}
// 分 → 元
function centsToYuan(c) {
  return (Number(c) || 0) / 100;
}

// ------------------------------------------------------------
// 表懒迁移（幂等；模块级缓存，每 Worker 实例只跑一次，稳态 0 开销）
// ------------------------------------------------------------
let _tablesReady = null;
export function ensureFinanceTables(env) {
  if (!_tablesReady) {
    _tablesReady = (async () => {
      const ddl = [
        `CREATE TABLE IF NOT EXISTS ethan_finance_accounts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL,
          name TEXT NOT NULL,
          type TEXT NOT NULL DEFAULT 'debit',
          initial_balance INTEGER NOT NULL DEFAULT 0,
          icon TEXT DEFAULT '🏦',
          color TEXT DEFAULT '#FFB627',
          include_in_net_worth INTEGER NOT NULL DEFAULT 1,
          sort_order INTEGER NOT NULL DEFAULT 0,
          archived INTEGER NOT NULL DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now'))
        )`,
        `CREATE TABLE IF NOT EXISTS ethan_finance_categories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL,
          name TEXT NOT NULL,
          type TEXT NOT NULL DEFAULT 'expense',
          icon TEXT DEFAULT '🏷️',
          color TEXT DEFAULT '#8E8E93',
          sort_order INTEGER NOT NULL DEFAULT 0,
          is_system INTEGER NOT NULL DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now'))
        )`,
        `CREATE TABLE IF NOT EXISTS ethan_finance_transactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL,
          type TEXT NOT NULL DEFAULT 'expense',
          amount INTEGER NOT NULL,
          account_id INTEGER,
          to_account_id INTEGER,
          category_id INTEGER,
          goal_id INTEGER,
          date TEXT NOT NULL,
          note TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        )`,
        `CREATE TABLE IF NOT EXISTS ethan_finance_goals (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL,
          name TEXT NOT NULL,
          target_amount INTEGER NOT NULL,
          current_amount INTEGER NOT NULL DEFAULT 0,
          deadline TEXT,
          monthly_plan INTEGER,
          account_id INTEGER,
          status TEXT NOT NULL DEFAULT 'active',
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now'))
        )`,
      ];
      // 四张表并行建（独立表，互不依赖）
      await Promise.all(ddl.map((sql) => env.DB.prepare(sql).run().catch(() => {})));
      // 流水查询加速索引（按用户+日期排序/过滤）
      await Promise.all([
        env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_ethan_fin_tx_user_date ON ethan_finance_transactions(user_id, date, id)`).run().catch(() => {}),
      ]);
    })().catch((e) => { _tablesReady = null; throw e; });
  }
  return _tablesReady;
}

// 首访种子：无分类则种预置分类；无账户则种预置账户（per-user 缓存，稳态 0 开销）
const _seededUsers = new Set();
async function ensureSeed(env) {
  const userId = uid(env);
  if (_seededUsers.has(userId)) return;
  const cat = await dbFirst(env.DB, `SELECT id FROM ethan_finance_categories WHERE user_id=? LIMIT 1`, [userId]);
  if (!cat) {
    await Promise.all(DEFAULT_CATEGORIES.map((c, i) =>
      env.DB.prepare(
        `INSERT INTO ethan_finance_categories (user_id,name,type,icon,color,sort_order,is_system) VALUES (?,?,?,?,?,?,1)`
      ).bind(userId, c.name, c.type, c.icon, c.color, i).run()));
  }
  const acc = await dbFirst(env.DB, `SELECT id FROM ethan_finance_accounts WHERE user_id=? LIMIT 1`, [userId]);
  if (!acc) {
    await Promise.all(DEFAULT_ACCOUNTS.map((a, i) =>
      env.DB.prepare(
        `INSERT INTO ethan_finance_accounts (user_id,name,type,icon,sort_order) VALUES (?,?,?,?,?)`
      ).bind(userId, a.name, a.type, a.icon, i).run()));
  }
  _seededUsers.add(userId);
}

// ------------------------------------------------------------
// 仪表盘计算（SQL 聚合输入：账户余额 / 净资产 / 月度收支 / 目标进度）
//   outAgg：[{account_id, type, s}] 出账聚合（income +s / expense、transfer -s；
//           transfer 且 to_account_id 为空的纯虚拟目标进度行已在 SQL 排除）
//   inAgg：[{to_account_id, s}]   transfer 入账聚合
//   monthAgg：[{m, type, category_id, s}] 当月+上月的收支分类聚合（transfer 不计）
// ------------------------------------------------------------
function computeDashboard(accounts, categories, goals, outAgg, inAgg, monthAgg, month, prevMonth) {
  const catMap = new Map(categories.map(c => [c.id, c]));

  // 1) 账户余额
  const bal = new Map(accounts.map(a => [a.id, Number(a.initial_balance) || 0]));
  for (const r of outAgg) {
    if (!bal.has(r.account_id)) continue;
    const s = Number(r.s) || 0;
    if (r.type === 'income') bal.set(r.account_id, bal.get(r.account_id) + s);
    else bal.set(r.account_id, bal.get(r.account_id) - s); // expense / transfer 出账
  }
  for (const r of inAgg) {
    if (!bal.has(r.to_account_id)) continue;
    bal.set(r.to_account_id, bal.get(r.to_account_id) + (Number(r.s) || 0));
  }

  // 2) 净资产（sign 约定：负债账户余额为负）
  let assets = 0, liabilities = 0;
  accounts.forEach(a => {
    if (!a.include_in_net_worth) return;
    const b = bal.get(a.id) || 0;
    if (LIABILITY_TYPES.includes(a.type) ? b < 0 : b >= 0) assets += b;
    else liabilities += -b; // 负债绝对值
  });
  // 资产侧出现负余额（如储蓄卡透支）计入负债；负债侧正余额（信用卡溢缴）计入资产
  const netWorth = assets - liabilities;

  // 3) 月度收支（monthAgg 已按月/类型/分类聚合）
  const sumMonth = (m) => {
    let income = 0, expense = 0;
    const incByCat = new Map(), expByCat = new Map();
    for (const r of monthAgg) {
      if (r.m !== m) continue;
      const s = Number(r.s) || 0;
      if (r.type === 'income') {
        income += s;
        incByCat.set(r.category_id, (incByCat.get(r.category_id) || 0) + s);
      } else if (r.type === 'expense') {
        expense += s;
        expByCat.set(r.category_id, (expByCat.get(r.category_id) || 0) + s);
      }
    }
    return { income, expense, incByCat, expByCat };
  };
  const cur = sumMonth(month);
  const prev = sumMonth(prevMonth);

  const catList = (m) => {
    const arr = [...m.entries()].map(([cid, amt]) => ({
      id: cid, name: catMap.get(cid)?.name || '未分类', icon: catMap.get(cid)?.icon || '🏷️',
      amount: centsToYuan(amt),
    })).filter(x => x.amount > 0).sort((a, b) => b.amount - a.amount);
    return arr;
  };

  // 4) 目标进度 + 资金存放
  const accMap = new Map(accounts.map(a => [a.id, a]));
  const goalsOut = goals.map(g => ({
    ...g,
    target_amount: centsToYuan(g.target_amount),
    current_amount: centsToYuan(g.current_amount),
    monthly_plan: g.monthly_plan != null ? centsToYuan(g.monthly_plan) : null,
    account_name: accMap.get(g.account_id)?.name || '',
    progress: g.target_amount > 0 ? Math.min(100, Math.round((g.current_amount / g.target_amount) * 100)) : 0,
  }));

  return { bal, netWorth: { assets: centsToYuan(assets), liabilities: centsToYuan(liabilities), netWorth: centsToYuan(netWorth) },
    monthStats: { income: centsToYuan(cur.income), expense: centsToYuan(cur.expense),
      incomeByCat: catList(cur.incByCat), expenseByCat: catList(cur.expByCat) },
    prevStats: { income: centsToYuan(prev.income), expense: centsToYuan(prev.expense) },
    goals: goalsOut };
}

// ------------------------------------------------------------
// GET|POST /api/finance/bootstrap — 仪表盘一次拉全
//   body: { month: 'YYYY-MM' }（默认当月）
//   性能：7 条查询并行一次往返；流水不拉全量，改为 SQL 聚合（余额/月度）
//   + 近期 100 条，账目增长不影响耗时
// ------------------------------------------------------------
export async function handleFinanceBootstrap(env, body) {
  await ensureFinanceTables(env);
  await ensureSeed(env);
  const userId = uid(env);
  let month = String(body?.month || '').trim();
  if (!/^\d{4}-\d{2}$/.test(month)) {
    const d = new Date();
    month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  // 上月（用于「较上月」变化）
  const [y, mo] = month.split('-').map(Number);
  const prevDate = new Date(Date.UTC(y, mo - 2, 1));
  const prevMonth = `${prevDate.getUTCFullYear()}-${String(prevDate.getUTCMonth() + 1).padStart(2, '0')}`;

  const [accounts, categories, goals, outAgg, inAgg, monthAgg, recentRows] = await Promise.all([
    dbAll(env.DB,
      `SELECT * FROM ethan_finance_accounts WHERE user_id=? AND archived=0 ORDER BY sort_order, id`, [userId]),
    dbAll(env.DB,
      `SELECT * FROM ethan_finance_categories WHERE user_id=? ORDER BY type, sort_order, id`, [userId]),
    dbAll(env.DB,
      `SELECT * FROM ethan_finance_goals WHERE user_id=? AND status != 'archived' ORDER BY sort_order, id DESC`, [userId]),
    // 出账聚合：income +s / expense、transfer -s（transfer 且 to_account_id 为空的纯虚拟目标进度行排除）
    dbAll(env.DB,
      `SELECT account_id, type, SUM(amount) AS s FROM ethan_finance_transactions
       WHERE user_id=? AND account_id IS NOT NULL AND NOT (type='transfer' AND to_account_id IS NULL)
       GROUP BY account_id, type`, [userId]),
    // transfer 入账聚合
    dbAll(env.DB,
      `SELECT to_account_id, SUM(amount) AS s FROM ethan_finance_transactions
       WHERE user_id=? AND type='transfer' AND to_account_id IS NOT NULL
       GROUP BY to_account_id`, [userId]),
    // 当月+上月收支分类聚合（transfer 不计）
    dbAll(env.DB,
      `SELECT substr(date,1,7) AS m, type, category_id, SUM(amount) AS s FROM ethan_finance_transactions
       WHERE user_id=? AND type IN ('income','expense') AND substr(date,1,7) IN (?,?)
       GROUP BY substr(date,1,7), type, category_id`, [userId, month, prevMonth]),
    // 近期流水（最多 100 条）
    dbAll(env.DB,
      `SELECT * FROM ethan_finance_transactions WHERE user_id=? ORDER BY date DESC, id DESC LIMIT 100`, [userId]),
  ]);

  const dash = computeDashboard(accounts, categories, goals, outAgg, inAgg, monthAgg, month, prevMonth);

  // 近期流水（带分类/账户名）
  const accMap = new Map(accounts.map(a => [a.id, a]));
  const catMap = new Map(categories.map(c => [c.id, c]));
  const recent = recentRows.map(t => ({
    ...t,
    amount: centsToYuan(t.amount),
    account_name: accMap.get(t.account_id)?.name || '',
    to_account_name: accMap.get(t.to_account_id)?.name || '',
    category_name: catMap.get(t.category_id)?.name || '',
    category_icon: catMap.get(t.category_id)?.icon || '🏷️',
  }));

  return json({
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
}

// ------------------------------------------------------------
// 账户 CRUD
// ------------------------------------------------------------
export async function handleFinanceAccountCreate(env, body) {
  await ensureFinanceTables(env);
  const d = body || {};
  const name = String(d.name || '').trim();
  if (!name) return json({ error: '账户名称必填' }, 400);
  const type = ACCOUNT_TYPES.includes(d.type) ? d.type : 'debit';
  const initC = d.initialBalance != null ? Math.round(Number(d.initialBalance) * 100) : 0;
  // 信用/负债类账户：正输入视为欠款（负余额），符合「负债账户余额为负」约定
  const signedInit = LIABILITY_TYPES.includes(type) && initC > 0 ? -initC : initC;
  const info = await env.DB.prepare(
    `INSERT INTO ethan_finance_accounts (user_id,name,type,initial_balance,icon,color,include_in_net_worth,sort_order) VALUES (?,?,?,?,?,?,?,?)`
  ).bind(uid(env), name, type, signedInit, d.icon || '🏦', d.color || '#FFB627',
    d.includeInNetWorth === false ? 0 : 1, Number(d.sortOrder) || 0).run();
  return json({ ok: true, account: await dbFirst(env.DB, `SELECT * FROM ethan_finance_accounts WHERE id=?`, [Number(info.meta.last_row_id)]) });
}

export async function handleFinanceAccountUpdate(env, body) {
  const id = Number(body?.id);
  if (!id) return json({ error: '缺少 id' }, 400);
  const d = body || {};
  const sets = [], params = [];
  if (d.name !== undefined) { sets.push('name=?'); params.push(String(d.name).trim()); }
  if (d.type !== undefined && ACCOUNT_TYPES.includes(d.type)) { sets.push('type=?'); params.push(d.type); }
  if (d.initialBalance !== undefined) {
    let c = Math.round(Number(d.initialBalance) * 100) || 0;
    const row = await dbFirst(env.DB, `SELECT type FROM ethan_finance_accounts WHERE id=? AND user_id=?`, [id, uid(env)]);
    if (row && LIABILITY_TYPES.includes(row.type) && c > 0) c = -c;
    sets.push('initial_balance=?'); params.push(c);
  }
  if (d.icon !== undefined) { sets.push('icon=?'); params.push(d.icon); }
  if (d.color !== undefined) { sets.push('color=?'); params.push(d.color); }
  if (d.includeInNetWorth !== undefined) { sets.push('include_in_net_worth=?'); params.push(d.includeInNetWorth ? 1 : 0); }
  if (d.sortOrder !== undefined) { sets.push('sort_order=?'); params.push(Number(d.sortOrder) || 0); }
  if (d.archived !== undefined) { sets.push('archived=?'); params.push(d.archived ? 1 : 0); }
  if (!sets.length) return json({ error: '没有可更新字段' }, 400);
  params.push(id);
  await env.DB.prepare(`UPDATE ethan_finance_accounts SET ${sets.join(',')} WHERE id=? AND user_id=?`).bind(...params, uid(env)).run();
  return json({ ok: true });
}

export async function handleFinanceAccountRemove(env, body) {
  const id = Number(body?.id);
  if (!id) return json({ error: '缺少 id' }, 400);
  await recycleSnapshot(env, 'financeAccount', id, 'ethan_finance_accounts');
  await dbRun(env.DB, `DELETE FROM ethan_finance_accounts WHERE id=? AND user_id=?`, [id, uid(env)]);
  return json({ ok: true });
}

// ------------------------------------------------------------
// 分类 CRUD（管理按钮：副业等收支项的自定义）
// ------------------------------------------------------------
export async function handleFinanceCategoryCreate(env, body) {
  await ensureFinanceTables(env);
  const d = body || {};
  const name = String(d.name || '').trim();
  if (!name) return json({ error: '分类名称必填' }, 400);
  const type = d.type === 'income' ? 'income' : 'expense';
  const maxRow = await dbFirst(env.DB, `SELECT MAX(sort_order) AS m FROM ethan_finance_categories WHERE user_id=? AND type=?`, [uid(env), type]);
  const info = await env.DB.prepare(
    `INSERT INTO ethan_finance_categories (user_id,name,type,icon,color,sort_order) VALUES (?,?,?,?,?,?)`
  ).bind(uid(env), name, type, d.icon || (type === 'income' ? '✨' : '🏷️'), d.color || '#8E8E93',
    Number(maxRow?.m || 0) + 1).run();
  return json({ ok: true, category: await dbFirst(env.DB, `SELECT * FROM ethan_finance_categories WHERE id=?`, [Number(info.meta.last_row_id)]) });
}

export async function handleFinanceCategoryUpdate(env, body) {
  const id = Number(body?.id);
  if (!id) return json({ error: '缺少 id' }, 400);
  const d = body || {};
  const sets = [], params = [];
  if (d.name !== undefined) { sets.push('name=?'); params.push(String(d.name).trim()); }
  if (d.icon !== undefined) { sets.push('icon=?'); params.push(d.icon); }
  if (d.color !== undefined) { sets.push('color=?'); params.push(d.color); }
  if (d.sortOrder !== undefined) { sets.push('sort_order=?'); params.push(Number(d.sortOrder) || 0); }
  if (!sets.length) return json({ error: '没有可更新字段' }, 400);
  params.push(id);
  await env.DB.prepare(`UPDATE ethan_finance_categories SET ${sets.join(',')} WHERE id=? AND user_id=?`).bind(...params, uid(env)).run();
  return json({ ok: true });
}

export async function handleFinanceCategoryRemove(env, body) {
  const id = Number(body?.id);
  if (!id) return json({ error: '缺少 id' }, 400);
  const row = await dbFirst(env.DB, `SELECT * FROM ethan_finance_categories WHERE id=? AND user_id=?`, [id, uid(env)]);
  if (!row) return json({ error: '分类不存在' }, 404);
  if (row.is_system) return json({ error: '预置分类不可删除' }, 400);
  await recycleSnapshot(env, 'financeCategory', id, 'ethan_finance_categories');
  await dbRun(env.DB, `UPDATE ethan_finance_transactions SET category_id=NULL WHERE category_id=? AND user_id=?`, [id, uid(env)]);
  await dbRun(env.DB, `DELETE FROM ethan_finance_categories WHERE id=? AND user_id=?`, [id, uid(env)]);
  return json({ ok: true });
}

// ------------------------------------------------------------
// 流水 CRUD
// ------------------------------------------------------------
export async function handleFinanceTxCreate(env, body) {
  await ensureFinanceTables(env);
  const d = body || {};
  const type = TX_TYPES.includes(d.type) ? d.type : 'expense';
  const amountC = yuanToCents(d.amount);
  if (!amountC) return json({ error: '金额必须大于 0' }, 400);
  const date = normalizeDate(d.date) || new Date().toISOString().slice(0, 10);
  let accountId = d.accountId != null ? Number(d.accountId) : null;
  let toAccountId = d.toAccountId != null ? Number(d.toAccountId) : null;
  if (type === 'transfer') {
    if (!accountId || !toAccountId) return json({ error: '转账需要转出与转入账户' }, 400);
    if (accountId === toAccountId) return json({ error: '转出与转入账户不能相同' }, 400);
  } else if (!accountId) {
    return json({ error: '请选择账户' }, 400);
  }
  const info = await env.DB.prepare(
    `INSERT INTO ethan_finance_transactions (user_id,type,amount,account_id,to_account_id,category_id,goal_id,date,note,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,datetime('now'))`
  ).bind(uid(env), type, amountC, accountId, type === 'transfer' ? toAccountId : null,
    type === 'transfer' ? null : (d.categoryId != null ? Number(d.categoryId) : null),
    d.goalId != null ? Number(d.goalId) : null, date, d.note || null).run();
  return json({ ok: true, transaction: await dbFirst(env.DB, `SELECT * FROM ethan_finance_transactions WHERE id=?`, [Number(info.meta.last_row_id)]) });
}

export async function handleFinanceTxUpdate(env, body) {
  const id = Number(body?.id);
  if (!id) return json({ error: '缺少 id' }, 400);
  const d = body || {};
  const row = await dbFirst(env.DB, `SELECT * FROM ethan_finance_transactions WHERE id=? AND user_id=?`, [id, uid(env)]);
  if (!row) return json({ error: '流水不存在' }, 404);
  const sets = [], params = [];
  if (d.amount !== undefined) {
    const c = yuanToCents(d.amount);
    if (!c) return json({ error: '金额必须大于 0' }, 400);
    sets.push('amount=?'); params.push(c);
  }
  if (d.date !== undefined) { const dd = normalizeDate(d.date); if (dd) { sets.push('date=?'); params.push(dd); } }
  if (d.note !== undefined) { sets.push('note=?'); params.push(d.note || null); }
  if (d.categoryId !== undefined) { sets.push('category_id=?'); params.push(d.categoryId != null ? Number(d.categoryId) : null); }
  if (d.accountId !== undefined) { sets.push('account_id=?'); params.push(d.accountId != null ? Number(d.accountId) : null); }
  if (d.toAccountId !== undefined) { sets.push('to_account_id=?'); params.push(d.toAccountId != null ? Number(d.toAccountId) : null); }
  if (!sets.length) return json({ error: '没有可更新字段' }, 400);
  params.push(id);
  await env.DB.prepare(`UPDATE ethan_finance_transactions SET ${sets.join(',')} WHERE id=? AND user_id=?`).bind(...params, uid(env)).run();
  // 目标存入流水金额变化 → 同步目标累计（保持目标与流水一致）
  if (row.goal_id && d.amount !== undefined) {
    const diff = yuanToCents(d.amount) - Number(row.amount);
    if (diff !== 0) {
      await dbRun(env.DB, `UPDATE ethan_finance_goals SET current_amount = MAX(0, current_amount + ?) WHERE id=? AND user_id=?`, [diff, row.goal_id, uid(env)]);
      await dbRun(env.DB, `UPDATE ethan_finance_goals SET status=CASE WHEN current_amount>=target_amount THEN 'done' ELSE 'active' END WHERE id=? AND user_id=?`, [row.goal_id, uid(env)]);
    }
  }
  return json({ ok: true });
}

export async function handleFinanceTxRemove(env, body) {
  const id = Number(body?.id);
  if (!id) return json({ error: '缺少 id' }, 400);
  const row = await dbFirst(env.DB, `SELECT * FROM ethan_finance_transactions WHERE id=? AND user_id=?`, [id, uid(env)]);
  if (!row) return json({ error: '流水不存在' }, 404);
  await recycleSnapshot(env, 'financeTx', id, 'ethan_finance_transactions');
  await dbRun(env.DB, `DELETE FROM ethan_finance_transactions WHERE id=? AND user_id=?`, [id, uid(env)]);
  // 目标存入流水被删 → 回退目标累计
  if (row.goal_id) {
    await dbRun(env.DB, `UPDATE ethan_finance_goals SET current_amount = MAX(0, current_amount - ?) WHERE id=? AND user_id=?`, [Number(row.amount) || 0, row.goal_id, uid(env)]);
    await dbRun(env.DB, `UPDATE ethan_finance_goals SET status=CASE WHEN current_amount>=target_amount THEN 'done' ELSE 'active' END WHERE id=? AND user_id=?`, [row.goal_id, uid(env)]);
  }
  return json({ ok: true });
}

// ------------------------------------------------------------
// 目标 CRUD + 存入（生成 transfer 流水 + 累计进度）
// ------------------------------------------------------------
export async function handleFinanceGoalCreate(env, body) {
  await ensureFinanceTables(env);
  const d = body || {};
  const name = String(d.name || '').trim();
  if (!name) return json({ error: '目标名称必填' }, 400);
  const targetC = yuanToCents(d.targetAmount);
  if (!targetC) return json({ error: '目标金额必须大于 0' }, 400);
  const deadline = normalizeDate(d.deadline) || null;
  const monthlyC = d.monthlyPlan != null && Number(d.monthlyPlan) > 0 ? Math.round(Number(d.monthlyPlan) * 100) : null;
  const info = await env.DB.prepare(
    `INSERT INTO ethan_finance_goals (user_id,name,target_amount,current_amount,deadline,monthly_plan,account_id,status,sort_order)
     VALUES (?,?,?,?,?,?,?,?,?)`
  ).bind(uid(env), name, targetC, 0, deadline, monthlyC,
    d.accountId != null ? Number(d.accountId) : null, 'active', Number(d.sortOrder) || 0).run();
  return json({ ok: true, goal: await dbFirst(env.DB, `SELECT * FROM ethan_finance_goals WHERE id=?`, [Number(info.meta.last_row_id)]) });
}

export async function handleFinanceGoalUpdate(env, body) {
  const id = Number(body?.id);
  if (!id) return json({ error: '缺少 id' }, 400);
  const d = body || {};
  const sets = [], params = [];
  if (d.name !== undefined) { sets.push('name=?'); params.push(String(d.name).trim()); }
  if (d.targetAmount !== undefined) {
    const c = yuanToCents(d.targetAmount);
    if (!c) return json({ error: '目标金额必须大于 0' }, 400);
    sets.push('target_amount=?'); params.push(c);
  }
  if (d.deadline !== undefined) { sets.push('deadline=?'); params.push(normalizeDate(d.deadline) || null); }
  if (d.monthlyPlan !== undefined) { sets.push('monthly_plan=?'); params.push(d.monthlyPlan != null && Number(d.monthlyPlan) > 0 ? Math.round(Number(d.monthlyPlan) * 100) : null); }
  if (d.accountId !== undefined) { sets.push('account_id=?'); params.push(d.accountId != null ? Number(d.accountId) : null); }
  if (d.sortOrder !== undefined) { sets.push('sort_order=?'); params.push(Number(d.sortOrder) || 0); }
  if (!sets.length) return json({ error: '没有可更新字段' }, 400);
  params.push(id);
  await env.DB.prepare(`UPDATE ethan_finance_goals SET ${sets.join(',')} WHERE id=? AND user_id=?`).bind(...params, uid(env)).run();
  await dbRun(env.DB, `UPDATE ethan_finance_goals SET status=CASE WHEN current_amount>=target_amount THEN 'done' ELSE 'active' END WHERE id=? AND user_id=?`, [id, uid(env)]);
  return json({ ok: true });
}

export async function handleFinanceGoalRemove(env, body) {
  const id = Number(body?.id);
  if (!id) return json({ error: '缺少 id' }, 400);
  const row = await dbFirst(env.DB, `SELECT * FROM ethan_finance_goals WHERE id=? AND user_id=?`, [id, uid(env)]);
  if (!row) return json({ error: '目标不存在' }, 404);
  await recycleSnapshot(env, 'financeGoal', id, 'ethan_finance_goals');
  await dbRun(env.DB, `UPDATE ethan_finance_transactions SET goal_id=NULL WHERE goal_id=? AND user_id=?`, [id, uid(env)]);
  await dbRun(env.DB, `DELETE FROM ethan_finance_goals WHERE id=? AND user_id=?`, [id, uid(env)]);
  return json({ ok: true });
}

// 存入：fromAccountId → goal.account_id 的 transfer + goal.current_amount 累加
export async function handleFinanceGoalDeposit(env, body) {
  const d = body || {};
  const id = Number(d?.goalId);
  const amountC = yuanToCents(d?.amount);
  if (!id) return json({ error: '缺少 goalId' }, 400);
  if (!amountC) return json({ error: '存入金额必须大于 0' }, 400);
  const goal = await dbFirst(env.DB, `SELECT * FROM ethan_finance_goals WHERE id=? AND user_id=?`, [id, uid(env)]);
  if (!goal) return json({ error: '目标不存在' }, 404);
  const date = normalizeDate(d.date) || new Date().toISOString().slice(0, 10);
  const fromId = d.fromAccountId != null ? Number(d.fromAccountId) : null;
  const toId = goal.account_id != null ? Number(goal.account_id) : null;
  // 真实资金转移才生成流水（同账户或无关联账户 → 仅累计进度，不动账）
  if (fromId && toId && fromId !== toId) {
    await env.DB.prepare(
      `INSERT INTO ethan_finance_transactions (user_id,type,amount,account_id,to_account_id,category_id,goal_id,date,note,created_at)
       VALUES (?, 'transfer', ?, ?, ?, NULL, ?, ?, ?, datetime('now'))`
    ).bind(uid(env), amountC, fromId, toId, id, date, d.note || `存入「${goal.name}」`).run();
  }
  await dbRun(env.DB, `UPDATE ethan_finance_goals SET current_amount = current_amount + ? WHERE id=? AND user_id=?`, [amountC, id, uid(env)]);
  await dbRun(env.DB, `UPDATE ethan_finance_goals SET status=CASE WHEN current_amount>=target_amount THEN 'done' ELSE 'active' END WHERE id=? AND user_id=?`, [id, uid(env)]);
  return json({ ok: true, goal: await dbFirst(env.DB, `SELECT * FROM ethan_finance_goals WHERE id=?`, [id]) });
}
