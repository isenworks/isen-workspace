// ============================================================
// /api/schedules/* 处理器（含重复事项展开逻辑）
// ============================================================
import {
  uid, json, dbAll, dbFirst, dbRun, toInt, toBoolInt,
  validateDate, ensureScheduleRepeat,
  REPEAT_RULES, addDaysISO, scheduleRepeatMatches,
  recycleSnapshot,
} from '../core.js';

export async function handleSchedulesList(env, q) {
  const userId = uid(env);
  await ensureScheduleRepeat(env);
  const hasRange = !!(q.from && q.to);
  if (!hasRange && !q.date) {
    return json({ schedules: await dbAll(env.DB, `SELECT * FROM ethan_schedules WHERE user_id=? ORDER BY date DESC, id DESC LIMIT 200`, [userId]) });
  }
  const from = hasRange ? q.from : q.date;
  const to = hasRange ? q.to : q.date;
  // 跨度 > 800 天（全量导出场景）：不展开重复，按原逻辑返回区间内的 master
  const spanDays = Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000);
  if (spanDays > 800) {
    return json({ schedules: await dbAll(env.DB,
      `SELECT * FROM ethan_schedules WHERE user_id=? AND date>=? AND date<=? ORDER BY date, (CASE WHEN start_time IS NULL THEN 1 ELSE 0 END), start_time, sort_order, id`,
      [userId, from, to]) });
  }
  // 拉出锚点 ≤ to 的全部 master，在 JS 里按规则展开
  const masters = await dbAll(env.DB, `SELECT * FROM ethan_schedules WHERE user_id=? AND date<=?`, [userId, to]);
  const exMap = new Map(); // `${schedule_id}|${date}` → is_done（单次完成例外）
  if (masters.length > 0) {
    const exs = await dbAll(env.DB, `SELECT * FROM ethan_schedule_occurrences WHERE user_id=? AND date>=? AND date<=?`, [userId, from, to]);
    exs.forEach(e => exMap.set(`${e.schedule_id}|${e.date}`, e.is_done ? 1 : 0));
  }
  const out = [];
  for (const m of masters) {
    const rule = REPEAT_RULES.includes(m.repeat_rule) ? m.repeat_rule : null;
    if (!rule) {
      if (m.date >= from && m.date <= to) out.push({ ...m });
      continue;
    }
    let cur = m.date > from ? m.date : from;
    let guard = 0;
    while (cur <= to && guard++ < 900) {
      if (scheduleRepeatMatches(m.date, rule, cur)) {
        const ex = exMap.get(`${m.id}|${cur}`);
        const isDone = ex !== undefined ? ex : (cur === m.date ? (m.is_done ? 1 : 0) : 0);
        out.push({ ...m, date: cur, is_done: isDone, repeat_rule: rule, _repeat_occurrence: cur === m.date ? 0 : 1, _anchor_date: m.date });
      }
      cur = addDaysISO(cur);
    }
  }
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)
    || ((a.start_time || '99:99') < (b.start_time || '99:99') ? -1 : (a.start_time || '99:99') > (b.start_time || '99:99') ? 1 : 0)
    || ((a.sort_order || 0) - (b.sort_order || 0))
    || (a.id - b.id));
  return json({ schedules: out });
}

// 按 id 取单条（用于右键编辑等场景，避免 list 全表展开只为找一条）
// 注意：返回 master 行本身；重复事项的单次例外完成状态不在本接口展开
export async function handleSchedulesGet(env, q) {
  const id = Number(q?.id);
  if (!id) return json({ error: '缺少 id' }, 400);
  const schedule = await dbFirst(env.DB, `SELECT * FROM ethan_schedules WHERE id=? AND user_id=?`, [id, uid(env)]);
  return json({ schedule: schedule || null });
}

export async function handleSchedulesCreate(env, body) {
  const data = body || {};
  const userId = uid(env);
  await ensureScheduleRepeat(env);
  const dateCheck = validateDate(data.date);
  if (!dateCheck.valid) return json({ error: dateCheck.error }, 400);
  const cat = data.category !== undefined ? Number(data.category) : null;
  const syncIsKey = cat === null ? (data.is_key ? 1 : 0) : cat === 1 || cat === 2 ? 1 : 0;
  const finalCat = cat === null ? (syncIsKey ? 2 : 3) : cat;
  const rule = REPEAT_RULES.includes(data.repeat_rule) ? data.repeat_rule : 'none';
  const info = await env.DB.prepare(
    `INSERT INTO ethan_schedules (user_id,title,date,start_date,end_date,start_time,end_time,duration_min,is_key,category,is_done,sort_order,repeat_rule) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
  )
    .bind(
      userId, data.title, dateCheck.value,
      data.start_date || dateCheck.value, data.end_date || null,
      data.start_time || null, data.end_time || null,
      data.duration_min != null ? Number(data.duration_min) : null,
      syncIsKey, finalCat, 0, toInt(data.sort_order, 0), rule
    )
    .run();
  return json({ schedule: await dbFirst(env.DB, `SELECT * FROM ethan_schedules WHERE id=?`, [Number(info.meta.last_row_id)]) });
}

export async function handleSchedulesUpdate(env, body) {
  const id = Number(body?.id);
  if (!id) return json({ error: '缺少 id' }, 400);
  await ensureScheduleRepeat(env);
  // 重复事项的单次完成（iOS「仅此事件」语义）：is_done 打在例外表，不影响整个序列
  if (body.is_done !== undefined && body.occurrence_date && body.date === undefined) {
    const row = await dbFirst(env.DB, `SELECT * FROM ethan_schedules WHERE id=?`, [id]);
    if (row && REPEAT_RULES.includes(row.repeat_rule) && row.date !== body.occurrence_date) {
      const v = toBoolInt(body.is_done);
      await env.DB.prepare(
        `INSERT INTO ethan_schedule_occurrences (schedule_id,user_id,date,is_done) VALUES (?,?,?,?)
         ON CONFLICT(schedule_id,date) DO UPDATE SET is_done=excluded.is_done`
      ).bind(id, uid(env), body.occurrence_date, v).run();
      return json({ schedule: { ...row, date: body.occurrence_date, is_done: v } });
    }
  }
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
    ['start_date', null],
    ['end_date', null],
    ['start_time', null],
    ['end_time', null],
    ['duration_min', 'num'],
    ['sort_order', 'int'],
  ].forEach(([k, type]) => {
    if (body[k] !== undefined) {
      sets.push(`${k}=?`);
      if (type === 'num') params.push(body[k] != null ? Number(body[k]) : null);
      else if (type === 'int') params.push(toInt(body[k]));
      else params.push(body[k] || null);
    }
  });
  if (body.is_done !== undefined) { sets.push('is_done=?'); params.push(toBoolInt(body.is_done)); }
  if (body.repeat_rule !== undefined) { sets.push('repeat_rule=?'); params.push(REPEAT_RULES.includes(body.repeat_rule) ? body.repeat_rule : 'none'); }
  if (body.category !== undefined) {
    const cat = Number(body.category);
    sets.push('category=?, is_key=?');
    params.push(cat, cat === 1 || cat === 2 ? 1 : 0);
  }
  if (sets.length === 0) return json({ schedule: await dbFirst(env.DB, `SELECT * FROM ethan_schedules WHERE id=?`, [id]) });
  params.push(id);
  await env.DB.prepare(`UPDATE ethan_schedules SET ${sets.join(', ')} WHERE id=?`).bind(...params).run();
  return json({ schedule: await dbFirst(env.DB, `SELECT * FROM ethan_schedules WHERE id=?`, [id]) });
}

export async function handleSchedulesRemove(env, body) {
  const id = Number(body?.id);
  if (!id) return json({ error: '缺少 id' }, 400);
  await recycleSnapshot(env, 'schedule', id, 'ethan_schedules');
  await dbRun(env.DB, `DELETE FROM ethan_schedules WHERE id=?`, [id]);
  return json({ ok: true });
}

export async function handleSchedulesSync(env, body) {
  const userId = uid(env);
  const dateRaw = body?.date;
  const dateCheck = validateDate(dateRaw);
  if (!dateCheck.valid) return json({ error: dateCheck.error }, 400);
  const date = dateCheck.value;
  const items = Array.isArray(body?.items) ? body.items : [];
  await dbRun(env.DB, `DELETE FROM ethan_schedules WHERE user_id=? AND date=?`, [userId, date]);
  if (items.length > 0) {
    const stmt = env.DB.prepare(
      `INSERT INTO ethan_schedules (user_id,title,date,start_time,end_time,duration_min,is_key,category,is_done,sort_order) VALUES (?,?,?,?,?,?,?,?,?,?)`
    );
    const ps = items.map((it, i) => {
      const cat = it.category !== undefined ? Number(it.category) : null;
      const syncIsKey = cat === null ? (it.is_key ? 1 : 0) : cat === 1 || cat === 2 ? 1 : 0;
      const finalCat = cat === null ? (syncIsKey ? 2 : 3) : cat;
      return stmt.bind(
        userId, it.title, date,
        it.start_time || null, it.end_time || null,
        it.duration_min != null ? Number(it.duration_min) : null,
        syncIsKey, finalCat,
        it.is_done ? 1 : 0,
        it.sort_order != null ? Number(it.sort_order) : i
      );
    });
    await env.DB.batch(ps);
  }
  const schedules = await dbAll(
    env.DB,
    `SELECT * FROM ethan_schedules WHERE user_id=? AND date=? ORDER BY (CASE WHEN start_time IS NULL THEN 1 ELSE 0 END), start_time, sort_order, id`,
    [userId, date]
  );
  return json({ schedules });
}
