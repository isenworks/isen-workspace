// ============================================================
// Cloudflare Pages Functions — 单文件通配路由入口
// 文件位置：/functions/api/[[route]].js
// 处理：GET|POST /api/*
// 环境绑定：env.DB = D1 (Variable=DB 在 Pages Settings→Functions 绑定)
// 可选 env：UNLOCK_PASSWORD_HASH（bcrypt/plain 都支持，不设则免解锁直进）
//           USER_ID（单人用户 UUID，默认 50f12e1e-d561-423e-a424-d07a21d00cf2）
// ============================================================

const DEFAULT_USER_ID = '50f12e1e-d561-423e-a424-d07a21d00cf2';

// ------------------------------------------------------------
// 工具函数
// ------------------------------------------------------------
function uid(env) {
  return env.USER_ID || DEFAULT_USER_ID;
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,X-Unlock-Token',
      ...headers,
    },
  });
}

function nowIso() {
  return new Date().toISOString();
}

// 计算连续天数：logs 按 date 降序传入 [{ date, done }]
function calcStreak(logs) {
  const doneDates = new Set(logs.filter((l) => l.done).map((l) => l.date));
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  let cursor = doneDates.has(today) ? today : yesterday;
  let streak = 0;
  while (doneDates.has(cursor)) {
    streak++;
    const d = new Date(cursor);
    d.setDate(d.getDate() - 1);
    cursor = d.toISOString().slice(0, 10);
  }
  return streak;
}

// 简单密码比对（纯文本足够，单用户场景 bcrypt 需要额外依赖不便）
function checkUnlock(env, token) {
  const expected = env.UNLOCK_PASSWORD;
  if (!expected) return true;
  return token === expected;
}

// D1 批量执行辅助：把数组 bind，只返回结果
async function dbAll(db, sql, params = []) {
  return (await db.prepare(sql).bind(...params).all()).results;
}
async function dbFirst(db, sql, params = []) {
  return (await db.prepare(sql).bind(...params).first()) || null;
}
async function dbRun(db, sql, params = []) {
  return db.prepare(sql).bind(...params).run();
}

// 转 int：SQLite 有时把 0/1 返回 number，但统一成数字
function toInt(v, dflt = 0) {
  if (v === null || v === undefined) return dflt;
  const n = Number(v);
  return Number.isNaN(n) ? dflt : Math.trunc(n);
}
function toBoolInt(v) {
  return v ? 1 : 0;
}

// ------------------------------------------------------------
// 请求分发器
// ------------------------------------------------------------
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname; // e.g. /api/habits/list
  const method = request.method.toUpperCase();

  if (method === 'OPTIONS') return json({ ok: true });

  // CORS 预检通过后，检查解锁密码（如启用）
  const unlockToken = request.headers.get('X-Unlock-Token') || url.searchParams.get('unlock') || '';
  if (!checkUnlock(env, unlockToken)) {
    return json({ error: '需要解锁密码' }, 401);
  }

  const q = Object.fromEntries(url.searchParams.entries());
  let body = null;
  if (method !== 'GET' && method !== 'OPTIONS' && request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    body = await request.json().catch(() => ({}));
  }

  try {
    // ------------------------------------------------------------
    // /api/auth/*
    // ------------------------------------------------------------
    if (path === '/api/auth/me' && method === 'GET') {
      return json({ user: { id: uid(env), email: env.USER_EMAIL || '1429000825@qq.com', username: env.USER_NAME || 'Ethan', avatar: env.USER_AVATAR || '', is_banned: false } });
    }
    if (path === '/api/auth/unlock' && method === 'POST') {
      if (!checkUnlock(env, body?.password || '')) return json({ error: '密码错误' }, 401);
      return json({ ok: true, user: { id: uid(env), username: env.USER_NAME || 'Ethan', avatar: '', email: '' } });
    }
    if (path === '/api/auth/logout' && method === 'POST') return json({ ok: true });

    // ------------------------------------------------------------
    // /api/migrate  — 批量写入 6 张表（Supabase→D1 一次性）
    // 入参：{ ethan_habits: [], ethan_habit_logs: [], ethan_schedules: [], ethan_tasks: [], ethan_summaries: [], ethan_fixed_schedules: [] }
    // ------------------------------------------------------------
    if (path === '/api/migrate' && method === 'POST') {
      return handleMigrate(env, body);
    }

    // ------------------------------------------------------------
    // /api/habits/*
    // ------------------------------------------------------------
    if (path === '/api/habits/list' && method === 'GET') return handleHabitsList(env, q);
    if (path === '/api/habits/archivedList' && method === 'GET') return handleHabitsArchivedList(env);
    if (path === '/api/habits/create' && method === 'POST') return handleHabitsCreate(env, body);
    if (path === '/api/habits/update' && method === 'POST') return handleHabitsUpdate(env, body);
    if (path === '/api/habits/reorder' && method === 'POST') return handleHabitsReorder(env, body);
    if (path === '/api/habits/archive' && method === 'POST') return handleHabitsArchive(env, body, 1);
    if (path === '/api/habits/restore' && method === 'POST') return handleHabitsArchive(env, body, 0);
    if (path === '/api/habits/remove' && method === 'POST') return handleHabitsRemove(env, body);
    if (path === '/api/habits/toggle' && method === 'POST') return handleHabitsToggle(env, body);
    if (path === '/api/habits/logSleep' && method === 'POST') return handleHabitsLogSleep(env, body);
    if (path === '/api/habits/logCount' && method === 'POST') return handleHabitsLogCount(env, body);
    if (path === '/api/habits/stats' && method === 'GET') return handleHabitsStats(env, q);

    // ------------------------------------------------------------
    // /api/tasks/*
    // ------------------------------------------------------------
    if (path === '/api/tasks/list' && method === 'GET') return handleTasksList(env, q);
    if (path === '/api/tasks/create' && method === 'POST') return handleTasksCreate(env, body);
    if (path === '/api/tasks/update' && method === 'POST') return handleTasksUpdate(env, body);
    if (path === '/api/tasks/remove' && method === 'POST') return handleTasksRemove(env, body);

    // ------------------------------------------------------------
    // /api/schedules/*
    // ------------------------------------------------------------
    if (path === '/api/schedules/list' && method === 'GET') return handleSchedulesList(env, q);
    if (path === '/api/schedules/create' && method === 'POST') return handleSchedulesCreate(env, body);
    if (path === '/api/schedules/update' && method === 'POST') return handleSchedulesUpdate(env, body);
    if (path === '/api/schedules/remove' && method === 'POST') return handleSchedulesRemove(env, body);
    if (path === '/api/schedules/sync' && method === 'POST') return handleSchedulesSync(env, body);

    // ------------------------------------------------------------
    // /api/summaries/*
    // ------------------------------------------------------------
    if (path === '/api/summaries/get' && method === 'GET') return handleSummariesGet(env, q);
    if (path === '/api/summaries/range' && method === 'GET') return handleSummariesRange(env, q);
    if (path === '/api/summaries/upsert' && method === 'POST') return handleSummariesUpsert(env, body);
    if (path === '/api/summaries/remove' && method === 'POST') return handleSummariesRemove(env, body);

    // ------------------------------------------------------------
    // /api/fixedSchedules/*
    // ------------------------------------------------------------
    if (path === '/api/fixedSchedules/list' && method === 'GET') return handleFixedSchedulesList(env);
    if (path === '/api/fixedSchedules/create' && method === 'POST') return handleFixedSchedulesCreate(env, body);
    if (path === '/api/fixedSchedules/update' && method === 'POST') return handleFixedSchedulesUpdate(env, body);
    if (path === '/api/fixedSchedules/remove' && method === 'POST') return handleFixedSchedulesRemove(env, body);

    // 404
    return json({ error: 'Not Found: ' + method + ' ' + path }, 404);
  } catch (err) {
    console.error('[api]', method, path, err);
    return json({ error: err.message || 'Server Error' }, 500);
  }
}

// ============================================================
// 具体处理器实现
// ============================================================

// ----------------------------- habits.list
async function handleHabitsList(env, q) {
  const userId = uid(env);
  const date = q.date || '';
  const rows = await dbAll(
    env.DB,
    `SELECT * FROM ethan_habits
      WHERE user_id = ? AND archived = 0
      ORDER BY sort_order, id`,
    [userId]
  );

  // 当天打卡状态
  let logsByHabit = {};
  if (date) {
    const dayLogs = await dbAll(
      env.DB,
      `SELECT habit_id, done, sleep_start, sleep_end, wake_state, energy_state, mood_state, sleep_note, data_source, actual_value, note
         FROM ethan_habit_logs
        WHERE user_id = ? AND date = ?`,
      [userId, date]
    );
    dayLogs.forEach((l) => {
      logsByHabit[l.habit_id] = l;
    });
  }

  // 全部日期打卡记录（用于计算 streak）
  const allLogs = await dbAll(
    env.DB,
    `SELECT habit_id, date, done FROM ethan_habit_logs WHERE user_id = ? ORDER BY date DESC`,
    [userId]
  );
  const logsByHabitFull = {};
  allLogs.forEach((l) => {
    if (!logsByHabitFull[l.habit_id]) logsByHabitFull[l.habit_id] = [];
    logsByHabitFull[l.habit_id].push(l);
  });

  const habits = rows.map((h) => {
    const dayLog = date ? logsByHabit[h.id] : null;
    return {
      ...h,
      done_today: dayLog ? dayLog.done === 1 : null,
      ...(dayLog
        ? {
            sleep_start: dayLog.sleep_start,
            sleep_end: dayLog.sleep_end,
            wake_state: dayLog.wake_state,
            energy_state: dayLog.energy_state,
            mood_state: dayLog.mood_state,
            sleep_note: dayLog.sleep_note,
            data_source: dayLog.data_source,
            actual_value: dayLog.actual_value,
            log_note: dayLog.note,
          }
        : {}),
      streak: calcStreak(logsByHabitFull[h.id] || []),
    };
  });

  return json({ habits });
}

async function handleHabitsArchivedList(env) {
  const rows = await dbAll(
    env.DB,
    `SELECT * FROM ethan_habits WHERE user_id = ? AND archived = 1 ORDER BY COALESCE(updated_at, created_at) DESC, id DESC`,
    [uid(env)]
  );
  return json({ habits: rows });
}

async function handleHabitsCreate(env, body) {
  const userId = uid(env);
  const data = body || {};
  const stmt = env.DB.prepare(
    `INSERT INTO ethan_habits
       (user_id,name,emoji,accent_color,growth_type,target_time,start_time,end_time,duration_min,sort_order,target_mode,target_value,target_unit,streak_goal,auto_log,archived,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,datetime('now'),datetime('now'))`
  );
  const info = await stmt
    .bind(
      userId,
      data.name,
      data.emoji || '✅',
      data.accent_color || '#34c759',
      data.growth_type || 'energy',
      data.target_time || null,
      data.start_time || data.target_time || null,
      data.end_time || null,
      data.duration_min != null ? Number(data.duration_min) : null,
      data.sort_order || 0,
      data.target_mode || 'check',
      data.target_value != null ? Number(data.target_value) : null,
      data.target_unit || null,
      data.streak_goal != null ? Number(data.streak_goal) : null,
      0
    )
    .run();
  const habit = await dbFirst(env.DB, `SELECT * FROM ethan_habits WHERE id = ?`, [Number(info.meta.last_row_id)]);
  return json({ habit });
}

async function handleHabitsUpdate(env, body) {
  const data = body || {};
  const id = Number(body?.id);
  if (!id) return json({ error: '缺少 id' }, 400);
  const sets = [];
  const params = [];
  const allowed = [
    ['name', null],
    ['emoji', null],
    ['accent_color', null],
    ['growth_type', null],
    ['target_time', null],
    ['start_time', null],
    ['end_time', null],
    ['duration_min', 'num'],
    ['target_mode', null],
    ['target_value', 'num'],
    ['target_unit', null],
    ['streak_goal', 'int'],
    ['auto_log', 'int'],
    ['sort_order', 'int'],
  ];
  allowed.forEach(([k, type]) => {
    if (data[k] !== undefined) {
      sets.push(`${k} = ?`);
      if (type === 'num') params.push(data[k] != null ? Number(data[k]) : null);
      else if (type === 'int') params.push(toInt(data[k], 0));
      else params.push(data[k] || null);
    }
  });
  if (data.archived !== undefined) {
    sets.push(`archived = ?, updated_at = datetime('now')`);
    params.push(toBoolInt(data.archived));
  }
  if (sets.length === 0) {
    const h = await dbFirst(env.DB, `SELECT * FROM ethan_habits WHERE id = ?`, [id]);
    return json({ habit: h });
  }
  params.push(id);
  await env.DB.prepare(`UPDATE ethan_habits SET ${sets.join(', ')} WHERE id = ?`).bind(...params).run();
  const habit = await dbFirst(env.DB, `SELECT * FROM ethan_habits WHERE id = ?`, [id]);
  return json({ habit });
}

async function handleHabitsReorder(env, body) {
  const orderedIds = Array.isArray(body?.orderedIds) ? body.orderedIds.map(Number) : [];
  const stmt = env.DB.prepare(`UPDATE ethan_habits SET sort_order = ? WHERE id = ?`);
  const ps = orderedIds.map((id, i) => stmt.bind(i, id));
  if (ps.length > 0) await env.DB.batch(ps);
  return json({ ok: true });
}

async function handleHabitsArchive(env, body, archived) {
  const id = Number(body?.id);
  if (!id) return json({ error: '缺少 id' }, 400);
  await dbRun(env.DB, `UPDATE ethan_habits SET archived = ?, updated_at = datetime('now') WHERE id = ?`, [archived, id]);
  return json({ ok: true });
}

async function handleHabitsRemove(env, body) {
  const id = Number(body?.id);
  if (!id) return json({ error: '缺少 id' }, 400);
  await dbRun(env.DB, `DELETE FROM ethan_habit_logs WHERE habit_id = ?`, [id]);
  await dbRun(env.DB, `DELETE FROM ethan_habits WHERE id = ?`, [id]);
  return json({ ok: true });
}

async function handleHabitsToggle(env, body) {
  const userId = uid(env);
  const habitId = Number(body?.habit_id || body?.id);
  const today = body?.date || new Date().toISOString().slice(0, 10);
  const targetDone = body?.targetDone !== undefined ? (body.targetDone ? 1 : 0) : undefined;
  if (!habitId) return json({ error: '缺少 habit_id' }, 400);

  const existing = await dbFirst(
    env.DB,
    `SELECT * FROM ethan_habit_logs WHERE habit_id = ? AND user_id = ? AND date = ?`,
    [habitId, userId, today]
  );
  if (existing) {
    const done = targetDone !== undefined ? targetDone : existing.done ? 0 : 1;
    await dbRun(env.DB, `UPDATE ethan_habit_logs SET done = ? WHERE id = ?`, [done, existing.id]);
    return json({ habit_id: habitId, date: today, done: !!done });
  }
  const wantDone = targetDone !== undefined ? targetDone : 1;
  if (wantDone !== 1) return json({ habit_id: habitId, date: today, done: false });
  await dbRun(env.DB, `INSERT INTO ethan_habit_logs (habit_id,user_id,date,done) VALUES (?,?,?,1)`, [habitId, userId, today]);
  return json({ habit_id: habitId, date: today, done: true });
}

async function handleHabitsLogSleep(env, body) {
  const userId = uid(env);
  const habitId = Number(body?.habit_id);
  const today = body?.date || new Date().toISOString().slice(0, 10);
  const { sleep_start, sleep_end, energy_state, mood_state, sleep_note } = body || {};
  if (!habitId) return json({ error: '缺少 habit_id' }, 400);

  const habit = await dbFirst(env.DB, `SELECT duration_min FROM ethan_habits WHERE id = ?`, [habitId]);
  let actualMin = null;
  if (sleep_start && sleep_end) {
    const [sh, sm] = sleep_start.split(':').map(Number);
    const [eh, em] = sleep_end.split(':').map(Number);
    if (![sh, sm, eh, em].some((v) => Number.isNaN(v))) {
      let d = eh * 60 + em - (sh * 60 + sm);
      if (d <= 0) d += 1440;
      actualMin = d;
    }
  }
  const targetMin = Number(habit?.duration_min) || 420;
  const done = actualMin != null && actualMin >= targetMin ? 1 : 0;

  const existing = await dbFirst(env.DB, `SELECT id FROM ethan_habit_logs WHERE habit_id = ? AND date = ? AND user_id = ?`, [habitId, today, userId]);
  const payload = [
    habitId, userId, today, done,
    sleep_start || null,
    sleep_end || null,
    null, // wake_state
    energy_state || null,
    mood_state || null,
    sleep_note || null,
    'manual',
  ];
  if (existing) {
    payload.push(existing.id);
    await env.DB.prepare(
      `UPDATE ethan_habit_logs SET habit_id=?,user_id=?,date=?,done=?,sleep_start=?,sleep_end=?,wake_state=?,energy_state=?,mood_state=?,sleep_note=?,data_source=? WHERE id=?`
    ).bind(...payload).run();
  } else {
    payload.push(0); // actual_value default
    payload.push(null); // note
    await env.DB.prepare(
      `INSERT INTO ethan_habit_logs (habit_id,user_id,date,done,sleep_start,sleep_end,wake_state,energy_state,mood_state,sleep_note,data_source,actual_value,note) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(...payload).run();
  }
  return json({ habit_id: habitId, date: today, done: !!done, actual_min: actualMin });
}

async function handleHabitsLogCount(env, body) {
  const userId = uid(env);
  const habitId = Number(body?.habit_id);
  const today = body?.date || new Date().toISOString().slice(0, 10);
  const add_value = Number(body?.add_value || 0);
  const note = body?.note || null;
  if (!habitId) return json({ error: '缺少 habit_id' }, 400);

  const habit = await dbFirst(env.DB, `SELECT target_value, target_unit, target_mode FROM ethan_habits WHERE id = ?`, [habitId]);
  const existing = await dbFirst(env.DB, `SELECT * FROM ethan_habit_logs WHERE habit_id=? AND date=? AND user_id=?`, [habitId, today, userId]);
  const prevValue = Number(existing?.actual_value) || 0;
  const newValue = prevValue + add_value;
  const targetVal = Number(habit?.target_value) || 0;
  const done = targetVal > 0 && newValue >= targetVal ? 1 : toInt(existing?.done, 0);

  if (existing) {
    await dbRun(
      env.DB,
      `UPDATE ethan_habit_logs SET done=?, actual_value=?, note=COALESCE(?, note) WHERE id=?`,
      [done, newValue, note || null, existing.id]
    );
  } else {
    await dbRun(
      env.DB,
      `INSERT INTO ethan_habit_logs (habit_id,user_id,date,done,actual_value,note) VALUES (?,?,?,?,?,?)`,
      [habitId, userId, today, done, newValue, note]
    );
  }
  return json({ habit_id: habitId, date: today, done: !!done, actual_value: newValue, target_value: targetVal, target_unit: habit?.target_unit || null });
}

async function handleHabitsStats(env, q) {
  const userId = uid(env);
  const { from, to } = q;
  if (!from || !to) return json({ error: '缺少 from / to' }, 400);
  const habitIds = await dbAll(env.DB, `SELECT id FROM ethan_habits WHERE user_id=? AND archived=0`, [userId]);
  const stats = [];
  for (const h of habitIds) {
    const rows = await dbAll(
      env.DB,
      `SELECT date, done FROM ethan_habit_logs WHERE habit_id=? AND user_id=? AND date>=? AND date<=?`,
      [h.id, userId, from, to]
    );
    const doneRows = rows.filter((r) => r.done);
    stats.push({
      habit_id: h.id,
      total_days: rows.length,
      done_days: doneRows.length,
      dates: doneRows.map((r) => r.date),
    });
  }
  return json({ stats });
}

// ----------------------------- tasks
async function handleTasksList(env, q) {
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
async function handleTasksCreate(env, body) {
  const data = body || {};
  const userId = uid(env);
  const info = await env.DB.prepare(
    `INSERT INTO ethan_tasks (user_id,title,date,priority,is_done,due_time,sort_order) VALUES (?,?,?,?,?,?,?)`
  )
    .bind(userId, data.title, data.date, toInt(data.priority, 2), 0, data.due_time || null, toInt(data.sort_order, 0))
    .run();
  const task = await dbFirst(env.DB, `SELECT * FROM ethan_tasks WHERE id=?`, [Number(info.meta.last_row_id)]);
  return json({ task });
}
async function handleTasksUpdate(env, body) {
  const id = Number(body?.id);
  if (!id) return json({ error: '缺少 id' }, 400);
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
async function handleTasksRemove(env, body) {
  const id = Number(body?.id);
  if (!id) return json({ error: '缺少 id' }, 400);
  await dbRun(env.DB, `DELETE FROM ethan_tasks WHERE id=?`, [id]);
  return json({ ok: true });
}

// ----------------------------- schedules
async function handleSchedulesList(env, q) {
  let sql = `SELECT * FROM ethan_schedules WHERE user_id=?`;
  const params = [uid(env)];
  if (q.from && q.to) {
    sql += ` AND date>=? AND date<=? ORDER BY date, (CASE WHEN start_time IS NULL THEN 1 ELSE 0 END), start_time, sort_order, id`;
    params.push(q.from, q.to);
  } else if (q.date) {
    sql += ` AND date=? ORDER BY (CASE WHEN start_time IS NULL THEN 1 ELSE 0 END), start_time, sort_order, id`;
    params.push(q.date);
  } else {
    sql += ` ORDER BY date DESC, id DESC LIMIT 200`;
  }
  return json({ schedules: await dbAll(env.DB, sql, params) });
}
async function handleSchedulesCreate(env, body) {
  const data = body || {};
  const userId = uid(env);
  const cat = data.category !== undefined ? Number(data.category) : null;
  const syncIsKey = cat === null ? (data.is_key ? 1 : 0) : cat === 1 || cat === 2 ? 1 : 0;
  const finalCat = cat === null ? (syncIsKey ? 2 : 3) : cat;
  const info = await env.DB.prepare(
    `INSERT INTO ethan_schedules (user_id,title,date,start_time,end_time,duration_min,is_key,category,is_done,sort_order) VALUES (?,?,?,?,?,?,?,?,?,?)`
  )
    .bind(
      userId, data.title, data.date,
      data.start_time || null, data.end_time || null,
      data.duration_min != null ? Number(data.duration_min) : null,
      syncIsKey, finalCat, 0, toInt(data.sort_order, 0)
    )
    .run();
  return json({ schedule: await dbFirst(env.DB, `SELECT * FROM ethan_schedules WHERE id=?`, [Number(info.meta.last_row_id)]) });
}
async function handleSchedulesUpdate(env, body) {
  const id = Number(body?.id);
  if (!id) return json({ error: '缺少 id' }, 400);
  const sets = [];
  const params = [];
  [
    ['title', null],
    ['date', null],
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
async function handleSchedulesRemove(env, body) {
  const id = Number(body?.id);
  if (!id) return json({ error: '缺少 id' }, 400);
  await dbRun(env.DB, `DELETE FROM ethan_schedules WHERE id=?`, [id]);
  return json({ ok: true });
}
async function handleSchedulesSync(env, body) {
  const userId = uid(env);
  const date = body?.date;
  const items = Array.isArray(body?.items) ? body.items : [];
  if (!date) return json({ error: '缺少 date' }, 400);
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

// ----------------------------- summaries
async function handleSummariesGet(env, q) {
  const date = q.date;
  if (!date) return json({ error: '缺少 date' }, 400);
  const s = await dbFirst(env.DB, `SELECT * FROM ethan_summaries WHERE user_id=? AND date=?`, [uid(env), date]);
  return json({ summary: s || null });
}
async function handleSummariesRange(env, q) {
  const { from, to } = q;
  if (!from || !to) return json({ error: '缺少 from/to' }, 400);
  return json({ summaries: await dbAll(env.DB, `SELECT * FROM ethan_summaries WHERE user_id=? AND date>=? AND date<=? ORDER BY date DESC`, [uid(env), from, to]) });
}
async function handleSummariesUpsert(env, body) {
  const userId = uid(env);
  const date = body?.date;
  if (!date) return json({ error: '缺少 date' }, 400);
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
async function handleSummariesRemove(env, body) {
  const date = body?.date;
  if (!date) return json({ error: '缺少 date' }, 400);
  await dbRun(env.DB, `DELETE FROM ethan_summaries WHERE user_id=? AND date=?`, [uid(env), date]);
  return json({ ok: true });
}

// ----------------------------- fixedSchedules
async function handleFixedSchedulesList(env) {
  return json({
    fixedSchedules: await dbAll(env.DB, `SELECT * FROM ethan_fixed_schedules WHERE user_id=? ORDER BY sort_order, id`, [uid(env)]),
  });
}
async function handleFixedSchedulesCreate(env, body) {
  const data = body || {};
  const userId = uid(env);
  const info = await env.DB.prepare(
    `INSERT INTO ethan_fixed_schedules (user_id,name,emoji,start_time,end_time,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?,datetime('now'),datetime('now'))`
  ).bind(userId, data.name, data.emoji || '📌', data.startTime || data.start_time, data.endTime || data.end_time, toInt(data.sortOrder ?? data.sort_order, 0)).run();
  return json({ fixedSchedule: await dbFirst(env.DB, `SELECT * FROM ethan_fixed_schedules WHERE id=?`, [Number(info.meta.last_row_id)]) });
}
async function handleFixedSchedulesUpdate(env, body) {
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
async function handleFixedSchedulesRemove(env, body) {
  const id = Number(body?.id);
  if (!id) return json({ error: '缺少 id' }, 400);
  await dbRun(env.DB, `DELETE FROM ethan_fixed_schedules WHERE id=?`, [id]);
  return json({ ok: true });
}

// ----------------------------- migrate（一次性批量写入 6 表，前端点按钮调用）
async function handleMigrate(env, body) {
  const userId = uid(env);
  const tables = [
    { key: 'ethan_habits', aliases: ['habits'], insert: insertHabitRow },
    { key: 'ethan_schedules', aliases: ['schedules'], insert: insertScheduleRow },
    { key: 'ethan_tasks', aliases: ['tasks'], insert: insertTaskRow },
    { key: 'ethan_habit_logs', aliases: ['habit_logs'], insert: insertLogRow, order: 2 },
    { key: 'ethan_summaries', aliases: ['summaries'], insert: insertSummaryRow },
    { key: 'ethan_fixed_schedules', aliases: ['fixed_schedules'], insert: insertFixedScheduleRow },
  ];
  const result = {};
  for (const t of tables) {
    let arr = Array.isArray(body?.[t.key]) ? body[t.key] : null;
    if (!arr) {
      for (const a of t.aliases) {
        if (Array.isArray(body?.[a])) { arr = body[a]; break; }
      }
    }
    arr = arr || [];
    let count = 0;
    for (const row of arr) {
      try {
        await t.insert(env.DB, userId, row);
        count++;
      } catch (e) {
        console.warn('[migrate] skip', t.key, row?.id, e.message);
      }
    }
    result[t.key] = count;
  }
  return json({ ok: true, counts: result });
}

function insertHabitRow(db, userId, r) {
  return db
    .prepare(
      `INSERT OR REPLACE INTO ethan_habits
       (id,user_id,name,emoji,accent_color,target_time,duration_min,sort_order,archived,start_time,end_time,growth_type,target_mode,target_value,target_unit,streak_goal,auto_log,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .bind(
      Number(r.id),
      r.user_id || userId,
      r.name,
      r.emoji || '✅',
      r.accent_color || '#34c759',
      r.target_time || null,
      r.duration_min != null ? Number(r.duration_min) : null,
      toInt(r.sort_order, 0),
      toInt(r.archived, 0),
      r.start_time || null,
      r.end_time || null,
      r.growth_type || 'energy',
      r.target_mode || 'check',
      r.target_value != null ? Number(r.target_value) : null,
      r.target_unit || null,
      r.streak_goal != null ? Number(r.streak_goal) : null,
      toInt(r.auto_log ?? 1, 1),
      r.created_at || nowIso(),
      r.updated_at || nowIso()
    )
    .run();
}

function insertScheduleRow(db, userId, r) {
  return db
    .prepare(
      `INSERT OR REPLACE INTO ethan_schedules
       (id,user_id,title,date,start_time,end_time,duration_min,is_key,category,is_done,sort_order,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .bind(
      Number(r.id),
      r.user_id || userId,
      r.title,
      r.date,
      r.start_time || null,
      r.end_time || null,
      r.duration_min != null ? Number(r.duration_min) : null,
      toInt(r.is_key, 0),
      toInt(r.category, 3),
      toInt(r.is_done, 0),
      toInt(r.sort_order, 0),
      r.created_at || nowIso()
    )
    .run();
}

function insertTaskRow(db, userId, r) {
  return db
    .prepare(
      `INSERT OR REPLACE INTO ethan_tasks
       (id,user_id,title,date,priority,is_done,due_time,sort_order,created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`
    )
    .bind(
      Number(r.id),
      r.user_id || userId,
      r.title,
      r.date,
      toInt(r.priority, 2),
      toInt(r.is_done, 0),
      r.due_time || null,
      toInt(r.sort_order, 0),
      r.created_at || nowIso()
    )
    .run();
}

function insertLogRow(db, userId, r) {
  return db
    .prepare(
      `INSERT OR REPLACE INTO ethan_habit_logs
       (id,habit_id,user_id,date,done,sleep_start,sleep_end,wake_state,energy_state,mood_state,sleep_note,data_source,actual_value,note)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .bind(
      Number(r.id),
      Number(r.habit_id),
      r.user_id || userId,
      r.date,
      toInt(r.done, 1),
      r.sleep_start || null,
      r.sleep_end || null,
      r.wake_state || null,
      r.energy_state || null,
      r.mood_state || null,
      r.sleep_note || null,
      r.data_source || null,
      r.actual_value != null ? Number(r.actual_value) : 0,
      r.note || null
    )
    .run();
}

function insertSummaryRow(db, userId, r) {
  return db
    .prepare(
      `INSERT OR REPLACE INTO ethan_summaries
       (id,user_id,date,content,mood,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?)`
    )
    .bind(
      Number(r.id),
      r.user_id || userId,
      r.date,
      r.content,
      r.mood || null,
      r.created_at || nowIso(),
      r.updated_at || nowIso()
    )
    .run();
}

function insertFixedScheduleRow(db, userId, r) {
  return db
    .prepare(
      `INSERT OR REPLACE INTO ethan_fixed_schedules
       (id,user_id,name,emoji,start_time,end_time,sort_order,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`
    )
    .bind(
      Number(r.id),
      r.user_id || userId,
      r.name,
      r.emoji || '📌',
      r.start_time || r.startTime,
      r.end_time || r.endTime,
      toInt(r.sort_order ?? r.sortOrder, 0),
      r.created_at || nowIso(),
      r.updated_at || nowIso()
    )
    .run();
}
