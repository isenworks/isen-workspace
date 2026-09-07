// ============================================================
// /api/tasks/* 处理器
// ============================================================
import { uid, json, dbAll, dbFirst, toInt, toBoolInt, validateDate, recycleSnapshot } from '../core.js';

export async function handleTasksList(env, q) {
  let sql = `SELECT * FROM ethan_tasks WHERE user_id=?`;
  const params = [uid(env)];
  if (q.from && q.to) {
    sql += ` AND date >= ? AND date <= ? ORDER BY is_done, (CASE WHEN due_time IS NULL THEN 1 ELSE 0 END), due_time, sort_order, id`;
    params.push(q.from, q.to);
  } else if (q.date) {
    sql += ` AND date = ? ORDER BY is_done, (CASE WHEN due_time IS NULL THEN 1 ELSE 0 END), due_time, sort_order, id`;
    params.push(q.date);
  } else {
    sql += ` ORDER BY date DESC, id DESC LIMIT 200`;
  }
  return json({ tasks: await dbAll(env.DB, sql, params) });
}

export async function handleTasksCreate(env, body) {
  const data = body || {};
  const userId = uid(env);
  const dateCheck = validateDate(data.date);
  if (!dateCheck.valid) return json({ error: dateCheck.error }, 400);
  const info = await env.DB.prepare(
    `INSERT INTO ethan_tasks (user_id,title,date,priority,is_done,due_time,sort_order) VALUES (?,?,?,?,?,?,?)`
  )
    .bind(userId, data.title, dateCheck.value, toInt(data.priority, 2), 0, data.due_time || null, toInt(data.sort_order, 0))
    .run();
  const task = await dbFirst(env.DB, `SELECT * FROM ethan_tasks WHERE id=?`, [Number(info.meta.last_row_id)]);
  return json({ task });
}

export async function handleTasksUpdate(env, body) {
  const id = Number(body?.id);
  if (!id) return json({ error: '缺少 id' }, 400);
  if (body.date !== undefined) {
    const dateCheck = validateDate(body.date);
    if (!dateCheck.valid) return json({ error: dateCheck.error }, 400);
    body.date = dateCheck.value;
  }
  const sets = [];
  const params = [];
  [
    ['title', null],
    ['date', null],
    ['priority', 'int'],
    ['due_time', null],
    ['sort_order', 'int'],
  ].forEach(([k, type]) => {
    if (body[k] !== undefined) {
      sets.push(`${k}=?`);
      if (type === 'int') params.push(toInt(body[k]));
      else params.push(body[k] || null);
    }
  });
  if (body.is_done !== undefined) {
    sets.push(`is_done=?`);
    params.push(toBoolInt(body.is_done));
  }
  if (sets.length === 0) return json({ task: await dbFirst(env.DB, `SELECT * FROM ethan_tasks WHERE id=?`, [id]) });
  params.push(id);
  await env.DB.prepare(`UPDATE ethan_tasks SET ${sets.join(', ')} WHERE id=?`).bind(...params).run();
  return json({ task: await dbFirst(env.DB, `SELECT * FROM ethan_tasks WHERE id=?`, [id]) });
}

export async function handleTasksRemove(env, body) {
  const id = Number(body?.id);
  if (!id) return json({ error: '缺少 id' }, 400);
  await recycleSnapshot(env, 'task', id, 'ethan_tasks');
  await env.DB.prepare(`DELETE FROM ethan_tasks WHERE id=?`).bind(id).run();
  return json({ ok: true });
}
