// ============================================================
// /api/backup/* 处理器：全量数据导出 / 还原（导出只读；还原为覆盖式写回）
//   用途：设置 → 备份与迁移 → 导出全量备份 / 从备份还原
//   设计要点：
//   · 导出：直接按表查询，绕过 list 接口的截断（财务流水 LIMIT 100、习惯统计只回 done 日期）
//   · 还原：按表「先清空当前用户数据 → 再写回备份行」，保留原始 id 以维持表间引用
//           （schedule_id / habit_id 等外键关系不会断）
//   · 强制归属：写回时用当前登录用户覆盖 user_id，备份来自谁都能安全还原到当前账号
//   · 标识符白名单校验，避免列名被拼接进 SQL
//   · 排除 ethan_user_settings 的 weread_api_key（密钥不落进导出文件）
// ============================================================
import { json, uid, dbAll } from '../core.js';

// [导出字段名, 数据库表名, 导出排序]
const SPECS = [
  ['schedules',           'ethan_schedules',              'date, id'],
  ['scheduleOccurrences', 'ethan_schedule_occurrences',   'date, schedule_id'],
  ['fixedSchedules',      'ethan_fixed_schedules',        'sort_order, id'],
  ['habits',              'ethan_habits',                 'sort_order, id'],
  ['habitLogs',           'ethan_habit_logs',             'date, id'],
  ['inbox',               'ethan_inbox',                  'id'],
  ['inboxTags',           'ethan_inbox_tags',             'id'],
  ['summaries',           'ethan_summaries',              'date'],
  ['recycleBin',          'ethan_recycle_bin',            'id'],
  ['financeAccounts',     'ethan_finance_accounts',       'sort_order, id'],
  ['financeCategories',   'ethan_finance_categories',     'type, sort_order, id'],
  ['financeGoals',        'ethan_finance_goals',          'sort_order, id'],
  ['financeTransactions', 'ethan_finance_transactions',   'date, id'],
  ['plants',              'plants',                       'z_index, id'],
  ['userSettings',        'ethan_user_settings',          'k'],
];

const TABLE_BY_KEY = Object.fromEntries(SPECS.map(([k, t]) => [k, t]));

// 受保护键：既不写进备份文件，还原时也不清除——避免密钥外泄，也避免还原后密钥丢失
const PROTECTED = { userSettings: ['weread_api_key'] };

const isIdent = (s) => typeof s === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(s);
const CHUNK = 100;

// 生成「排除受保护键」的 SQL 片段与绑定参数
function protectedClause(key) {
  const list = PROTECTED[key];
  if (!list || !list.length) return { sql: '', args: [] };
  return { sql: ` AND k NOT IN (${list.map(() => '?').join(',')})`, args: list };
}

// ---------------- 导出 ----------------
export async function handleBackupExport(env) {
  const userId = uid(env);
  const tables = {};
  const errors = [];

  await Promise.all(SPECS.map(async ([key, table, order]) => {
    try {
      const p = protectedClause(key);
      tables[key] = await dbAll(
        env.DB,
        `SELECT * FROM ${table} WHERE user_id=?${p.sql} ORDER BY ${order}`,
        [userId, ...p.args]
      );
    } catch (e) {
      errors.push({ table: key, message: String((e && e.message) || e) });
    }
  }));

  const counts = {};
  for (const [k, v] of Object.entries(tables)) counts[k] = v.length;

  return json({ ok: true, exportedAt: new Date().toISOString(), userId, counts, tables, errors });
}

// ---------------- 还原（覆盖式） ----------------
export async function handleBackupRestore(env, body) {
  const userId = uid(env);
  const tables = body && body.tables;

  // 服务端二次确认：前端已有一道，这里再挡一次，避免误调用清空数据
  if (!body || body.confirm !== true) return json({ error: '缺少确认标记，已中止还原' }, 400);
  if (!tables || typeof tables !== 'object' || Array.isArray(tables)) {
    return json({ error: '备份数据格式不正确' }, 400);
  }

  const restored = [];
  const errors = [];
  const db = env.DB;

  for (const [key, rows] of Object.entries(tables)) {
    const table = TABLE_BY_KEY[key];
    if (!table) { errors.push({ table: key, message: '未知的数据表，已跳过' }); continue; }
    if (!Array.isArray(rows)) { errors.push({ table: key, message: '该表数据不是数组，已跳过' }); continue; }

    // 先把全部行转成语句，任一行不合法就整表跳过，避免清空后写不回去
    // 清空时保留受保护键（如 weread_api_key），它们在备份里本就不存在，删了就找不回来
    const p = protectedClause(key);
    const stmts = [db.prepare(`DELETE FROM ${table} WHERE user_id=?${p.sql}`).bind(userId, ...p.args)];
    let bad = null;
    for (const row of rows) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) { bad = '存在非对象行'; break; }
      // 若旧备份里混进了受保护键，直接跳过不写
      if (PROTECTED[key] && typeof row.k === 'string' && PROTECTED[key].includes(row.k)) continue;
      const cols = Object.keys(row).filter((c) => isIdent(c) && c !== 'user_id' && row[c] !== undefined);
      if (!cols.length) { bad = '存在空行'; break; }
      const values = cols.map((c) => row[c]);
      // 强制归属当前用户，备份来自其它账号也能安全还原
      cols.push('user_id');
      values.push(userId);
      stmts.push(
        db.prepare(`INSERT OR REPLACE INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`)
          .bind(...values)
      );
    }
    if (bad) { errors.push({ table: key, message: bad + '，已整表跳过' }); continue; }

    try {
      // 分批提交：单批语句数过多会超 D1 限制；批内是事务，失败则该批回滚
      for (let i = 0; i < stmts.length; i += CHUNK) {
        await db.batch(stmts.slice(i, i + CHUNK));
      }
      restored.push({ table: key, rows: rows.length });
    } catch (e) {
      errors.push({ table: key, message: String((e && e.message) || e) });
    }
  }

  return json({ ok: errors.length === 0, restored, errors });
}