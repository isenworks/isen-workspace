// ============================================================
// /api/recycleBin/* 处理器：软删除快照（user_id, source_type, source_id, payload, deleted_at）
//   source_type: task | schedule | habit | fixedSchedule | summary
// ============================================================
import { uid, json, dbAll, dbFirst, dbRun, nowIso, ensureRecycleBinTable, RECYCLE_TABLES } from '../core.js';

export async function handleRecycleBinList(env) {
  await ensureRecycleBinTable(env);
  const items = await dbAll(env.DB, `SELECT * FROM ethan_recycle_bin WHERE user_id=? ORDER BY id DESC`, [uid(env)]);
  return json({ ok: true, items });
}

export async function handleRecycleBinRestore(env, body) {
  const id = Number(body?.id);
  if (!id) return json({ error: '缺少 id' }, 400);
  await ensureRecycleBinTable(env);
  const item = await dbFirst(env.DB, `SELECT * FROM ethan_recycle_bin WHERE id=? AND user_id=?`, [id, uid(env)]);
  if (!item) return json({ error: '条目不存在' }, 404);
  let payload = null;
  try { payload = JSON.parse(item.payload); } catch (_) {}
  const table = RECYCLE_TABLES[item.source_type];
  if (!table || !payload || !payload.row) return json({ error: '快照数据无效，无法还原' }, 400);
  // 按原 id 还原（行已删除，id 空闲；异常冲突时 REPLACE 兜底）
  const cols = Object.keys(payload.row);
  await env.DB.prepare(
    `INSERT OR REPLACE INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`
  ).bind(...cols.map(c => payload.row[c])).run();
  // 习惯：连同打卡日志一起还原
  if (item.source_type === 'habit' && Array.isArray(payload.logs)) {
    for (const log of payload.logs) {
      const lc = Object.keys(log);
      await env.DB.prepare(
        `INSERT OR REPLACE INTO ethan_habit_logs (${lc.join(',')}) VALUES (${lc.map(() => '?').join(',')})`
      ).bind(...lc.map(c => log[c])).run();
    }
  }
  await dbRun(env.DB, `DELETE FROM ethan_recycle_bin WHERE id=?`, [id]);
  return json({ ok: true });
}

export async function handleRecycleBinRemove(env, body) {
  const id = Number(body?.id);
  if (!id) return json({ error: '缺少 id' }, 400);
  await ensureRecycleBinTable(env);
  await dbRun(env.DB, `DELETE FROM ethan_recycle_bin WHERE id=? AND user_id=?`, [id, uid(env)]);
  return json({ ok: true });
}

export async function handleRecycleBinClear(env) {
  await ensureRecycleBinTable(env);
  await dbRun(env.DB, `DELETE FROM ethan_recycle_bin WHERE user_id=?`, [uid(env)]);
  return json({ ok: true });
}

export { nowIso }; // 兼容 re-export（部分调用方可能从本模块取）
