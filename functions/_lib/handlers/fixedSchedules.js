// ============================================================
// /api/fixedSchedules/* 处理器（固定日程，每日重复的时间线提醒）
// ============================================================
import { uid, json, dbAll, dbFirst, toInt, recycleSnapshot, dbRun } from '../core.js';

export async function handleFixedSchedulesList(env) {
  return json({
    fixedSchedules: await dbAll(env.DB, `SELECT * FROM ethan_fixed_schedules WHERE user_id=? ORDER BY sort_order, id`, [uid(env)]),
  });
}

export async function handleFixedSchedulesCreate(env, body) {
  const data = body || {};
  const userId = uid(env);
  const info = await env.DB.prepare(
    `INSERT INTO ethan_fixed_schedules (user_id,name,emoji,start_time,end_time,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?,datetime('now'),datetime('now'))`
  ).bind(userId, data.name, data.emoji || '📌', data.startTime || data.start_time, data.endTime || data.end_time, toInt(data.sortOrder ?? data.sort_order, 0)).run();
  return json({ fixedSchedule: await dbFirst(env.DB, `SELECT * FROM ethan_fixed_schedules WHERE id=?`, [Number(info.meta.last_row_id)]) });
}

export async function handleFixedSchedulesUpdate(env, body) {
  const id = Number(body?.id);
  if (!id) return json({ error: '缺少 id' }, 400);
  const sets = [];
  const params = [];
  const map = {
    name: 'name', emoji: 'emoji',
    startTime: 'start_time', start_time: 'start_time',
    endTime: 'end_time', end_time: 'end_time',
    sortOrder: 'sort_order', sort_order: 'sort_order',
  };
  Object.keys(map).forEach((k) => {
    if (body[k] !== undefined) {
      sets.push(`${map[k]}=?`);
      params.push(body[k] === map[k] && (k === 'sort_order' || k === 'sortOrder') ? toInt(body[k], 0) : body[k]);
    }
  });
  if (sets.length === 0) return json({ fixedSchedule: await dbFirst(env.DB, `SELECT * FROM ethan_fixed_schedules WHERE id=?`, [id]) });
  sets.push(`updated_at=datetime('now')`);
  params.push(id);
  await env.DB.prepare(`UPDATE ethan_fixed_schedules SET ${sets.join(', ')} WHERE id=?`).bind(...params).run();
  return json({ fixedSchedule: await dbFirst(env.DB, `SELECT * FROM ethan_fixed_schedules WHERE id=?`, [id]) });
}

export async function handleFixedSchedulesRemove(env, body) {
  const id = Number(body?.id);
  if (!id) return json({ error: '缺少 id' }, 400);
  await recycleSnapshot(env, 'fixedSchedule', id, 'ethan_fixed_schedules');
  await dbRun(env.DB, `DELETE FROM ethan_fixed_schedules WHERE id=?`, [id]);
  return json({ ok: true });
}
