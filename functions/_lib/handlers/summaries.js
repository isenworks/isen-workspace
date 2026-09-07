// ============================================================
// /api/summaries/* 处理器（每日复盘）
// ============================================================
import { uid, json, dbAll, dbFirst, dbRun, nowIso, validateDate, recycleSnapshot } from '../core.js';

export async function handleSummariesGet(env, q) {
  const date = q.date;
  if (!date) return json({ error: '缺少 date' }, 400);
  const s = await dbFirst(env.DB, `SELECT * FROM ethan_summaries WHERE user_id=? AND date=?`, [uid(env), date]);
  return json({ summary: s || null });
}

export async function handleSummariesRange(env, q) {
  const { from, to } = q;
  if (!from || !to) return json({ error: '缺少 from/to' }, 400);
  return json({ summaries: await dbAll(env.DB, `SELECT * FROM ethan_summaries WHERE user_id=? AND date>=? AND date<=? ORDER BY date DESC`, [uid(env), from, to]) });
}

export async function handleSummariesUpsert(env, body) {
  const userId = uid(env);
  const dateRaw = body?.date;
  const dateCheck = validateDate(dateRaw);
  if (!dateCheck.valid) return json({ error: dateCheck.error }, 400);
  const date = dateCheck.value;
  const existing = await dbFirst(env.DB, `SELECT id FROM ethan_summaries WHERE user_id=? AND date=?`, [userId, date]);
  const content = body?.content || '';
  const mood = body?.mood || null;
  const now = nowIso();
  if (existing) {
    await dbRun(env.DB, `UPDATE ethan_summaries SET content=?, mood=?, updated_at=? WHERE id=?`, [content, mood, now, existing.id]);
    return json({ summary: await dbFirst(env.DB, `SELECT * FROM ethan_summaries WHERE id=?`, [existing.id]) });
  }
  const info = await env.DB.prepare(`INSERT INTO ethan_summaries (user_id,date,content,mood,created_at,updated_at) VALUES (?,?,?,?,?,?)`)
    .bind(userId, date, content, mood, now, now).run();
  return json({ summary: await dbFirst(env.DB, `SELECT * FROM ethan_summaries WHERE id=?`, [Number(info.meta.last_row_id)]) });
}

export async function handleSummariesRemove(env, body) {
  const dateRaw = body?.date;
  const dateCheck = validateDate(dateRaw);
  if (!dateCheck.valid) return json({ error: dateCheck.error }, 400);
  const date = dateCheck.value;
  // 回收站快照（按 user+date 定位的删除）
  const row = await dbFirst(env.DB, `SELECT * FROM ethan_summaries WHERE user_id=? AND date=?`, [uid(env), date]);
  if (row) await recycleSnapshot(env, 'summary', row.id, 'ethan_summaries');
  await dbRun(env.DB, `DELETE FROM ethan_summaries WHERE user_id=? AND date=?`, [uid(env), date]);
  return json({ ok: true });
}
