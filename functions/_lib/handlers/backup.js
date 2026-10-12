// ============================================================
// /api/backup/* 处理器：全量数据导出（只读）
//   用途：设置 → 备份与迁移 → 导出全量备份
//   设计要点：
//   · 直接按表查询，绕过 list 接口的截断（财务流水 LIMIT 100、习惯统计只回 done 日期）
//   · 逐表容错：某张表不存在或查询失败只记录 errors，不影响其余表
//   · 排除 ethan_user_settings 的 weread_api_key（密钥不落进导出文件）
// ============================================================
import { json, uid, dbAll } from '../core.js';

// 表 → 查询（全部带 user_id 隔离；顺序稳定，便于前后对比两份备份）
const EXPORT_QUERIES = [
  ['schedules',            `SELECT * FROM ethan_schedules WHERE user_id=? ORDER BY date, id`],
  ['scheduleOccurrences',  `SELECT * FROM ethan_schedule_occurrences WHERE user_id=? ORDER BY date, id`],
  ['fixedSchedules',       `SELECT * FROM ethan_fixed_schedules WHERE user_id=? ORDER BY sort_order, id`],
  ['habits',               `SELECT * FROM ethan_habits WHERE user_id=? ORDER BY sort_order, id`],
  ['habitLogs',            `SELECT * FROM ethan_habit_logs WHERE user_id=? ORDER BY date, id`],
  ['inbox',                `SELECT * FROM ethan_inbox WHERE user_id=? ORDER BY id`],
  ['inboxTags',            `SELECT * FROM ethan_inbox_tags WHERE user_id=? ORDER BY id`],
  ['summaries',            `SELECT * FROM ethan_summaries WHERE user_id=? ORDER BY date`],
  ['recycleBin',           `SELECT * FROM ethan_recycle_bin WHERE user_id=? ORDER BY id`],
  ['financeAccounts',      `SELECT * FROM ethan_finance_accounts WHERE user_id=? ORDER BY sort_order, id`],
  ['financeCategories',    `SELECT * FROM ethan_finance_categories WHERE user_id=? ORDER BY type, sort_order, id`],
  ['financeGoals',         `SELECT * FROM ethan_finance_goals WHERE user_id=? ORDER BY sort_order, id`],
  ['financeTransactions',  `SELECT * FROM ethan_finance_transactions WHERE user_id=? ORDER BY date, id`],
  ['plants',               `SELECT * FROM plants WHERE user_id=? ORDER BY z_index, id`],
  ['userSettings',         `SELECT k, v, updated_at, version FROM ethan_user_settings WHERE user_id=? AND k <> 'weread_api_key' ORDER BY k`],
];

export async function handleBackupExport(env) {
  const userId = uid(env);
  const tables = {};
  const errors = [];

  await Promise.all(EXPORT_QUERIES.map(async ([key, sql]) => {
    try {
      tables[key] = await dbAll(env.DB, sql, [userId]);
    } catch (e) {
      errors.push({ table: key, message: String((e && e.message) || e) });
    }
  }));

  const counts = {};
  for (const [k, v] of Object.entries(tables)) counts[k] = v.length;

  return json({
    ok: true,
    exportedAt: new Date().toISOString(),
    userId,
    counts,
    tables,
    errors,
  });
}