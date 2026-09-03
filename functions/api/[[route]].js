// ============================================================
// Cloudflare Pages Functions — 单文件通配路由入口
// 文件位置：/functions/api/[[route]].js
// 处理：GET|POST /api/*
// 环境绑定：env.DB = D1 (Variable=DB 在 Pages Settings→Functions 绑定)
// 可选 env：UNLOCK_PASSWORD_HASH（bcrypt/plain 都支持，不设则免解锁直进）
//           USER_ID（单人用户 UUID，默认 50f12e1e-d561-423e-a424-d07a21d00cf2）
// ============================================================

// 农历库（lunar-javascript，vendored UMD）：农历/节气/节日换算
import lunarLib from '../lib/lunar.js';

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

// 获取中国时区（UTC+8）的 YYYY-MM-DD 日期
function getLocalDate(offsetDays = 0) {
  const d = new Date();
  const utc = d.getTime() + d.getTimezoneOffset() * 60000;
  const local = new Date(utc + 8 * 3600000); // UTC+8
  local.setDate(local.getDate() + offsetDays);
  return local.toISOString().slice(0, 10);
}

// 计算连续天数：logs 按 date 降序传入 [{ date, done }]
function calcStreak(logs) {
  const doneDates = new Set(logs.filter((l) => l.done).map((l) => l.date));
  const today = getLocalDate(0);
  const yesterday = getLocalDate(-1);
  let cursor = doneDates.has(today) ? today : yesterday;
  let streak = 0;
  while (doneDates.has(cursor)) {
    streak++;
    const d = new Date(cursor);
    d.setDate(d.getDate() - 1);
    // 直接用日期字符串操作，避免时区问题
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    cursor = `${y}-${m}-${day}`;
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
// 日期格式验证与规范化（date 字段为 TEXT，必须保证 ISO 格式）
// ------------------------------------------------------------
const ISO_DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

// 规范化日期：接受 '2026-7-1' / '2026/07/01' / '2026-07-01' 等格式，输出 '2026-07-01'
function normalizeDate(input) {
  if (!input || typeof input !== 'string') return null;
  const s = input.trim();
  
  // 已经是合法 ISO 格式
  if (ISO_DATE_RE.test(s)) {
    // 额外验证日期有效性（如 2026-02-30 不合法）
    const d = new Date(s);
    if (d.getFullYear() === Number(s.slice(0, 4)) && 
        d.getMonth() + 1 === Number(s.slice(5, 7)) && 
        d.getDate() === Number(s.slice(8, 10))) {
      return s;
    }
    return null;
  }
  
  // 尝试规范化：把 '/' 替换成 '-'
  let normalized = s.replace(/\//g, '-');
  
  // 尝试解析 YYYY-M-D 格式（补零）
  const parts = normalized.split('-');
  if (parts.length === 3) {
    const y = parts[0];
    const m = parts[1].padStart(2, '0');
    const d = parts[2].padStart(2, '0');
    const candidate = `${y}-${m}-${d}`;
    
    if (ISO_DATE_RE.test(candidate)) {
      // 验证日期有效性
      const dt = new Date(candidate);
      if (dt.getFullYear() === Number(y) && 
          dt.getMonth() + 1 === Number(m) && 
          dt.getDate() === Number(d)) {
        return candidate;
      }
    }
  }
  
  return null;
}

// 验证日期：必须是合法的 YYYY-MM-DD 格式
function validateDate(input) {
  const normalized = normalizeDate(input);
  if (!normalized) {
    return { valid: false, error: `日期格式无效：${input}，必须为 YYYY-MM-DD 格式（如 2026-07-01）` };
  }
  return { valid: true, value: normalized };
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
  // list 类接口兼容 GET/POST：POST 时把 body 参数合并到 q
  const qOrBody = method === 'GET' ? q : (body || {});

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
    // /api/migrate  — 批量写入 6 表（Supabase→D1 一次性）
    // 入参：{ ethan_habits: [], ethan_habit_logs: [], ethan_schedules: [], ethan_tasks: [], ethan_summaries: [], ethan_fixed_schedules: [] }
    // ------------------------------------------------------------
    if (path === '/api/migrate' && method === 'POST') {
      return handleMigrate(env, body);
    }

    // ------------------------------------------------------------
    // /api/habits/*
    // ------------------------------------------------------------
    if ((path === '/api/habits/list') && (method === 'GET' || method === 'POST')) return handleHabitsList(env, qOrBody);
    if ((path === '/api/habits/archivedList') && (method === 'GET' || method === 'POST')) return handleHabitsArchivedList(env);
    if (path === '/api/habits/create' && method === 'POST') return handleHabitsCreate(env, body);
    if (path === '/api/habits/update' && method === 'POST') return handleHabitsUpdate(env, body);
    if (path === '/api/habits/reorder' && method === 'POST') return handleHabitsReorder(env, body);
    if (path === '/api/habits/archive' && method === 'POST') return handleHabitsArchive(env, body, 1);
    if (path === '/api/habits/restore' && method === 'POST') return handleHabitsArchive(env, body, 0);
    if (path === '/api/habits/remove' && method === 'POST') return handleHabitsRemove(env, body);
    if (path === '/api/habits/toggle' && method === 'POST') return handleHabitsToggle(env, body);
    if (path === '/api/habits/logSleep' && method === 'POST') return handleHabitsLogSleep(env, body);
    if (path === '/api/habits/logCount' && method === 'POST') return handleHabitsLogCount(env, body);
    if ((path === '/api/habits/stats') && (method === 'GET' || method === 'POST')) return handleHabitsStats(env, qOrBody);

    // ------------------------------------------------------------
    // /api/tasks/*
    // ------------------------------------------------------------
    if ((path === '/api/tasks/list') && (method === 'GET' || method === 'POST')) return handleTasksList(env, qOrBody);
    if (path === '/api/tasks/create' && method === 'POST') return handleTasksCreate(env, body);
    if (path === '/api/tasks/update' && method === 'POST') return handleTasksUpdate(env, body);
    if (path === '/api/tasks/remove' && method === 'POST') return handleTasksRemove(env, body);

    // ------------------------------------------------------------
    // /api/schedules/*
    // ------------------------------------------------------------
    if ((path === '/api/schedules/list') && (method === 'GET' || method === 'POST')) return handleSchedulesList(env, qOrBody);
    if (path === '/api/schedules/create' && method === 'POST') return handleSchedulesCreate(env, body);
    if (path === '/api/schedules/update' && method === 'POST') return handleSchedulesUpdate(env, body);
    if (path === '/api/schedules/remove' && method === 'POST') return handleSchedulesRemove(env, body);
    if (path === '/api/schedules/sync' && method === 'POST') return handleSchedulesSync(env, body);

    // ------------------------------------------------------------
    // /api/summaries/*
    // ------------------------------------------------------------
    if ((path === '/api/summaries/get') && (method === 'GET' || method === 'POST')) return handleSummariesGet(env, qOrBody);
    if ((path === '/api/summaries/range') && (method === 'GET' || method === 'POST')) return handleSummariesRange(env, qOrBody);
    if (path === '/api/summaries/upsert' && method === 'POST') return handleSummariesUpsert(env, body);
    if (path === '/api/summaries/remove' && method === 'POST') return handleSummariesRemove(env, body);

    // ------------------------------------------------------------
    // /api/fixedSchedules/*
    // ------------------------------------------------------------
    if ((path === '/api/fixedSchedules/list') && (method === 'GET' || method === 'POST')) return handleFixedSchedulesList(env);
    if (path === '/api/fixedSchedules/create' && method === 'POST') return handleFixedSchedulesCreate(env, body);
    if (path === '/api/fixedSchedules/update' && method === 'POST') return handleFixedSchedulesUpdate(env, body);
    if (path === '/api/fixedSchedules/remove' && method === 'POST') return handleFixedSchedulesRemove(env, body);

    // ------------------------------------------------------------
    // /api/recycleBin/*  — 回收站（软删除快照：删除前先入站，可还原/永久删除/清空）
    //   source_type: task | schedule | habit | fixedSchedule | summary
    // ------------------------------------------------------------
    if ((path === '/api/recycleBin/list') && (method === 'GET' || method === 'POST')) return handleRecycleBinList(env);
    if (path === '/api/recycleBin/restore' && method === 'POST') return handleRecycleBinRestore(env, body);
    if (path === '/api/recycleBin/remove' && method === 'POST') return handleRecycleBinRemove(env, body);
    if (path === '/api/recycleBin/clear' && method === 'POST') return handleRecycleBinClear(env);

    // ------------------------------------------------------------
    // /api/auth/*  — 工作台解锁（部署者可选：设置 Pages Var UNLOCK_PASSWORD_HASH 开启）
    //              — 未设置 Var 时：直接放行（个人私用工作台默认免密码）
    // ------------------------------------------------------------
    if (path === '/api/auth/login') return handleAuthLogin(env, body, method);

    // ------------------------------------------------------------
    // /api/userSettings/*  — 用户级配置（weread key 等）D1 ethan_user_settings
    // ------------------------------------------------------------
    if (path === '/api/userSettings/get' && method === 'GET') return handleUserSettingsGet(env, q.k || '');
    if (path === '/api/userSettings/set' && method === 'POST') return handleUserSettingsSet(env, body);

    // ------------------------------------------------------------
    // /api/weread/*  — 微信读书 Skills 官方 API（wrk-xxx）
    // ------------------------------------------------------------
    if (path === '/api/weread/sync' && method === 'GET') return handleWereadSync(env, q);
    if (path === '/api/weread/search' && method === 'GET') return handleWereadSearch(env, q);

    // ------------------------------------------------------------
    // /api/cover/search  — 封面兜底：豆瓣 → Google Books
    //              /proxy — 豆瓣/微信读书 图片防盗链同源代理
    // ------------------------------------------------------------
    if (path === '/api/cover/search' && method === 'GET') return handleCoverSearch(env, q);
    if (path === '/api/cover/proxy' && method === 'GET') return handleCoverProxy(env, q.url || '');

    // ------------------------------------------------------------
    // /api/birthday-migrate  — 一次性迁移：录入生日事项
    // ------------------------------------------------------------
    if (path === '/api/birthday-migrate' && method === 'GET') return handleBirthdayMigrate(env);

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
  // 回收站快照：习惯定义 + 全部打卡日志
  const logs = await dbAll(env.DB, `SELECT * FROM ethan_habit_logs WHERE habit_id = ?`, [id]);
  await recycleSnapshot(env, 'habit', id, 'ethan_habits', { logs });
  await dbRun(env.DB, `DELETE FROM ethan_habit_logs WHERE habit_id = ?`, [id]);
  await dbRun(env.DB, `DELETE FROM ethan_habits WHERE id = ?`, [id]);
  return json({ ok: true });
}

async function handleHabitsToggle(env, body) {
  const userId = uid(env);
  const habitId = Number(body?.habit_id || body?.id);
  const dateRaw = body?.date || getLocalDate();
  const dateCheck = validateDate(dateRaw);
  if (!dateCheck.valid) return json({ error: dateCheck.error }, 400);
  const today = dateCheck.value;
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
  const habitId = Number(body?.habit_id ?? body?.habitId);
  const dateRaw = body?.date || getLocalDate();
  const dateCheck = validateDate(dateRaw);
  if (!dateCheck.valid) return json({ error: dateCheck.error }, 400);
  const today = dateCheck.value;
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
  const habitId = Number(body?.habit_id ?? body?.habitId);
  const dateRaw = body?.date || getLocalDate();
  const dateCheck = validateDate(dateRaw);
  if (!dateCheck.valid) return json({ error: dateCheck.error }, 400);
  const today = dateCheck.value;
  const add_value = Number(body?.add_value || body?.addValue || 0);
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
async function handleTasksUpdate(env, body) {
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
async function handleTasksRemove(env, body) {
  const id = Number(body?.id);
  if (!id) return json({ error: '缺少 id' }, 400);
  await recycleSnapshot(env, 'task', id, 'ethan_tasks');
  await dbRun(env.DB, `DELETE FROM ethan_tasks WHERE id=?`, [id]);
  return json({ ok: true });
}

// ----------------------------- schedules
// 重复事项：repeat_rule 存在 master 行上（none/daily/weekly/monthly/yearly），
// 读取时按日期范围展开为虚拟实例；单次完成状态存 ethan_schedule_occurrences 例外表。
async function ensureScheduleRepeat(env) {
  try { await env.DB.prepare(`ALTER TABLE ethan_schedules ADD COLUMN repeat_rule TEXT DEFAULT 'none'`).run(); } catch (_) {}
  try {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS ethan_schedule_occurrences (
      schedule_id INTEGER NOT NULL,
      user_id TEXT,
      date TEXT NOT NULL,
      is_done INTEGER DEFAULT 0,
      PRIMARY KEY (schedule_id, date)
    )`).run();
  } catch (_) {}
}
const REPEAT_RULES = ['daily', 'weekly', 'monthly', 'yearly', 'lunar-yearly'];
function addDaysISO(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
// 农历日期 key：月（闰月为负）+ 日。例 2026-09-07 → '7-26'
function lunarKey(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const l = lunarLib.Solar.fromYmd(y, m, d).getLunar();
  return `${l.getMonth()}-${l.getDay()}`;
}
// 判断日期 d 是否匹配以 anchor 为锚点的重复规则（月/年重复对月末日期做钳制：31日→2月取28/29）
function scheduleRepeatMatches(anchor, rule, d) {
  if (rule === 'daily') return true;
  const [ay, am, ad] = anchor.split('-').map(Number);
  const [, ym, yd] = d.split('-').map(Number);
  const yy = Number(d.slice(0, 4));
  if (rule === 'weekly') {
    return new Date(anchor + 'T00:00:00Z').getUTCDay() === new Date(d + 'T00:00:00Z').getUTCDay();
  }
  if (rule === 'monthly') {
    const dim = new Date(Date.UTC(yy, ym, 0)).getUTCDate();
    return yd === Math.min(ad, dim);
  }
  if (rule === 'yearly') {
    if (am === 2 && ad === 29) {
      const isLeap = (yy % 4 === 0 && yy % 100 !== 0) || yy % 400 === 0;
      return ym === 2 && yd === (isLeap ? 29 : 28);
    }
    return ym === am && yd === ad;
  }
  // 每年（农历）：农历月+日相同即命中（生日场景；闰月按同号正月对齐，与民间习惯一致）
  if (rule === 'lunar-yearly') {
    return lunarKey(anchor) === lunarKey(d);
  }
  return false;
}
async function handleSchedulesList(env, q) {
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
async function handleSchedulesCreate(env, body) {
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
    `INSERT INTO ethan_schedules (user_id,title,date,start_time,end_time,duration_min,is_key,category,is_done,sort_order,repeat_rule) VALUES (?,?,?,?,?,?,?,?,?,?,?)`
  )
    .bind(
      userId, data.title, dateCheck.value,
      data.start_time || null, data.end_time || null,
      data.duration_min != null ? Number(data.duration_min) : null,
      syncIsKey, finalCat, 0, toInt(data.sort_order, 0), rule
    )
    .run();
  return json({ schedule: await dbFirst(env.DB, `SELECT * FROM ethan_schedules WHERE id=?`, [Number(info.meta.last_row_id)]) });
}
async function handleSchedulesUpdate(env, body) {
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
async function handleSchedulesRemove(env, body) {
  const id = Number(body?.id);
  if (!id) return json({ error: '缺少 id' }, 400);
  await recycleSnapshot(env, 'schedule', id, 'ethan_schedules');
  await dbRun(env.DB, `DELETE FROM ethan_schedules WHERE id=?`, [id]);
  return json({ ok: true });
}
async function handleSchedulesSync(env, body) {
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
async function handleSummariesRemove(env, body) {
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
  await recycleSnapshot(env, 'fixedSchedule', id, 'ethan_fixed_schedules');
  await dbRun(env.DB, `DELETE FROM ethan_fixed_schedules WHERE id=?`, [id]);
  return json({ ok: true });
}

// ============================================================================
// ethan_user_settings 表辅助：确保表存在；KV 结构 (user_id, k, v, updated_at)
// ============================================================================
async function ensureUserSettingsTable(env) {
  try {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS ethan_user_settings (
      user_id TEXT NOT NULL,
      k TEXT NOT NULL,
      v TEXT,
      updated_at TEXT,
      PRIMARY KEY (user_id, k)
    )`).run();
  } catch (_) {}
}
async function settingGet(env, k) {
  await ensureUserSettingsTable(env);
  const r = await dbFirst(env.DB, `SELECT v FROM ethan_user_settings WHERE user_id=? AND k=?`, [uid(env), k]);
  return r ? (r.v || '') : '';
}
async function settingSet(env, k, v) {
  await ensureUserSettingsTable(env);
  await env.DB.prepare(`INSERT INTO ethan_user_settings(user_id,k,v,updated_at) VALUES(?,?,?,?)
    ON CONFLICT(user_id,k) DO UPDATE SET v=excluded.v, updated_at=excluded.updated_at`)
    .bind(uid(env), String(k), String(v == null ? '' : v), nowIso()).run();
}
// ---------------- userSettings.get / set
async function handleUserSettingsGet(env, k) {
  const keys = k ? [k] : ['weread_api_key'];
  const out = {};
  for (const key of keys) {
    let v = await settingGet(env, key);
    out[key] = (key === 'weread_api_key') ? { configured: !!v, value: v } : v;
  }
  return json({ ok: true, data: out });
}
async function handleUserSettingsSet(env, body) {
  if (!body || typeof body.k !== 'string') return json({ error: '缺少 k' }, 400);
  await settingSet(env, body.k, body.v == null ? '' : String(body.v));
  return json({ ok: true });
}

// ============================================================================
// ethan_recycle_bin 回收站：软删除快照（user_id, source_type, source_id, payload, deleted_at）
// ============================================================================
async function ensureRecycleBinTable(env) {
  try {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS ethan_recycle_bin (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_id INTEGER,
      payload TEXT NOT NULL,
      deleted_at TEXT
    )`).run();
  } catch (_) {}
}
// 删除前快照入站（extra 可挂附加数据，如习惯的打卡日志）。失败不阻断原删除流程。
async function recycleSnapshot(env, sourceType, sourceId, table, extra) {
  try {
    await ensureRecycleBinTable(env);
    const row = await dbFirst(env.DB, `SELECT * FROM ${table} WHERE id = ?`, [sourceId]);
    if (!row) return;
    const payload = extra ? { row, ...extra } : { row };
    await env.DB.prepare(
      `INSERT INTO ethan_recycle_bin (user_id, source_type, source_id, payload, deleted_at) VALUES (?,?,?,?,?)`
    ).bind(uid(env), sourceType, sourceId, JSON.stringify(payload), nowIso()).run();
  } catch (_) { /* 回收站写入失败时继续硬删除，避免用户删不掉 */ }
}
const RECYCLE_TABLES = {
  task: 'ethan_tasks',
  schedule: 'ethan_schedules',
  habit: 'ethan_habits',
  fixedSchedule: 'ethan_fixed_schedules',
  summary: 'ethan_summaries',
};
async function handleRecycleBinList(env) {
  await ensureRecycleBinTable(env);
  const items = await dbAll(env.DB, `SELECT * FROM ethan_recycle_bin WHERE user_id=? ORDER BY id DESC`, [uid(env)]);
  return json({ ok: true, items });
}
async function handleRecycleBinRestore(env, body) {
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
async function handleRecycleBinRemove(env, body) {
  const id = Number(body?.id);
  if (!id) return json({ error: '缺少 id' }, 400);
  await ensureRecycleBinTable(env);
  await dbRun(env.DB, `DELETE FROM ethan_recycle_bin WHERE id=? AND user_id=?`, [id, uid(env)]);
  return json({ ok: true });
}
async function handleRecycleBinClear(env) {
  await ensureRecycleBinTable(env);
  await dbRun(env.DB, `DELETE FROM ethan_recycle_bin WHERE user_id=?`, [uid(env)]);
  return json({ ok: true });
}

// ---------------- auth.login：工作台解锁（D1单人模式）
// 规则（双保险·小白友好）：
//   ① Pages Variables 里没设 UNLOCK_PASSWORD_HASH → 永远 ok=true 免密码
//   ② 设了但值"不是 bcrypt $2a$ 前缀" → 当明文密码对比（部署者直接写"123456"也能用）
//   ③ 设了且是 $2a$/$2b$ 前缀 → 优先 bcryptjs.compareSync，模块不存在时降级明文
async function handleAuthLogin(env, body, method) {
  const DEFAULT_USER_ID = '50f12e1e-d561-423e-a424-d07a21d00cf2';
  if (method !== 'POST' && method !== 'GET') return json({ ok: false, error: 'Method Not Allowed' }, 405);
  try {
    const configured = (env && env.UNLOCK_PASSWORD_HASH) ? String(env.UNLOCK_PASSWORD_HASH).trim() : '';
    // ① 未配置解锁密码 → 直接放行
    if (!configured) {
      return json({ ok: true, skip: true, token: '', user: { id: DEFAULT_USER_ID } }, 200);
    }
    // 特殊值：部署者填 "EMPTY_DISABLE_LOGIN_2026" → 也关闭解锁
    if (configured === 'EMPTY_DISABLE_LOGIN_2026' || configured === 'DISABLE' || configured === 'OFF') {
      return json({ ok: true, skip: true, token: '', user: { id: DEFAULT_USER_ID } }, 200);
    }
    const pass = String(body?.password || '').trim();
    let ok = false;
    const isHash = /^\$2[ayb]\$/.test(configured);
    if (isHash) {
      try {
        const bcrypt = require('bcryptjs');
        ok = bcrypt.compareSync(pass || '', configured);
      } catch (_) {
        ok = (pass === configured); // 模块缺失降级明文
      }
    } else {
      ok = (pass === configured);
    }
    if (ok) return json({ ok: true, token: '', user: { id: DEFAULT_USER_ID } }, 200);
    return json({ ok: false, error: '密码错误' }, 401);
  } catch (e) {
    return json({ ok: false, error: String(e.message || e) }, 500);
  }
}

// ---------------- weread.sync：用官方 Weread Skills key 拉书架
// 官方统一网关：POST https://i.weread.qq.com/api/agent/gateway
//   Header: Authorization: Bearer wrk-xxx
//   Body:   { "api_name": "/shelf/sync", "skill_version": "1.0.3", ... }
// 参考 weread.qq.com/r/weread-skills（官方 Skill 文档）
async function handleWereadSync(env, q) {
  const key = await settingGet(env, 'weread_api_key');
  if (!key) return json({ error: '未配置 Weread Skills API Key。请到书架右上角「设置」填入 wrk- 开头的 key。' }, 400);

  const GATEWAY = 'https://i.weread.qq.com/api/agent/gateway';
  const SKILL_VER = '1.0.3';

  // 1) 先调 /shelf/sync 获取书架书籍列表（含 bookId、状态、进度）
  async function callWeread(apiName, extra = {}) {
    const body = { api_name: apiName, skill_version: SKILL_VER, ...extra };
    const r = await fetch(GATEWAY, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + key,
        'Content-Type': 'application/json',
        'User-Agent': 'Ethan-Workbench/1.0',
        'Accept': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const text = await r.text().catch(() => '');
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { _raw: text }; }
    if (!r.ok) {
      const msg = (data && (data.message || data.statusMessage || data.error)) || text || `HTTP ${r.status}`;
      throw new Error(`${r.status}: ${JSON.stringify(msg).slice(0, 200)}`);
    }
    return data;
  }

  let shelfResp = null;
  let lastErr = null;
  // Weread 官方 skill 有两个常见书架接口名，按顺序尝试
  for (const name of ['/shelf/sync', '/shelf/list']) {
    try {
      shelfResp = await callWeread(name);
      if (shelfResp && (Array.isArray(shelfResp.books) || Array.isArray(shelfResp.data?.books) || Array.isArray(shelfResp.data))) break;
    } catch (e) { lastErr = e.message; shelfResp = null; }
  }
  if (!shelfResp) {
    return json({ error: '微信读书书架接口未返回有效数据，最后错误：' + (lastErr || 'unknown') }, 502);
  }

  // 归一化 books[]
  const raw = shelfResp.books || shelfResp.data?.books || shelfResp.data || [];
  const bookList = (Array.isArray(raw) ? raw : []).slice(0, 500);

  // 2) 对每本书调用 /book/info 补封面 + 作者 + 详情（batch 5 本并行）
  //    先把列表里已经有的字段填好，没有 cover/author 的再补
  const isHashBookId = (v) => typeof v === 'string' && /^[a-z0-9]{20,}$/i.test(v.replace(/-/g, ''));
  const extractHashFromDeepLink = (deepLink) => {
    if (!deepLink || typeof deepLink !== 'string') return '';
    const m = deepLink.match(/v=([a-z0-9]+)/);
    return m ? m[1] : '';
  };
  const books = bookList.map(x => {
    const rawId = x.bookId || x.book_id || x.id || x.bookid || '';
    const hashFromDeepLink = extractHashFromDeepLink(x.deepLink);
    const bookId = isHashBookId(hashFromDeepLink) ? hashFromDeepLink : (isHashBookId(rawId) ? rawId : '');
    const numericId = !bookId && /^\d+$/.test(String(rawId)) ? String(rawId) : '';
    return {
      title: String(x.title || x.bookTitle || x.name || '').trim(),
      author: String(x.author || x.bookAuthor || x.authors || (Array.isArray(x.authors) ? x.authors.join('/') : '') || '').trim(),
      cover: x.cover || x.coverUrl || x.cover_img || x.coverImg || '',
      bookId,
      numericId,
      status: x.readStatus ?? x.read_status ?? x.status ?? (x.finishedReading || x.finished ? 4 : x.reading || x.isReading ? 3 : 1),
      progress: Number(x.readingProgress ?? x.progress ?? x.pct ?? x.reading_progress ?? 0),
      startDate: x.startDate || x.start_read_date || x.startTime || '',
      endDate: x.endDate || x.finish_date || x.endTime || x.finishDate || '',
    };
  }).filter(b => b.title);

  // 对缺封面/作者/bookId的，再查一次详情
  const BATCH = 5;
  for (let i = 0; i < books.length; i += BATCH) {
    const slice = books.slice(i, i + BATCH);
    await Promise.all(slice.map(async (b) => {
      const needInfo = !b.cover || !b.author || !b.bookId;
      if (!needInfo) return;
      try {
        const params = {};
        if (b.bookId) params.bookId = b.bookId;
        else if (b.numericId) params.id = b.numericId;
        else params.title = b.title;
        const info = await callWeread('/book/info', params);
        const d = info?.data || info || {};
        if (!b.cover && (d.cover || d.coverUrl)) b.cover = d.cover || d.coverUrl;
        if (!b.author && d.author) b.author = d.author;
        if (!b.author && d.authors) b.author = Array.isArray(d.authors) ? d.authors.join('/') : String(d.authors);
        // 优先从 deepLink 提取哈希 ID
        const hashFromDeepLink = extractHashFromDeepLink(d.deepLink);
        if (hashFromDeepLink && isHashBookId(hashFromDeepLink)) {
          b.bookId = hashFromDeepLink;
        } else {
          const newBookId = d.bookId || d.book_id || '';
          if (newBookId && isHashBookId(newBookId)) b.bookId = newBookId;
        }
        if (d.title && !b.title) b.title = d.title;
      } catch (_) { /* 忽略单本失败，继续 */ }
    }));
  }

  return json({ ok: true, books, total: books.length, rawDebug: (q.debug === '1') ? shelfResp : undefined });
}

// ---------------- weread.search：按书名搜索微信读书，返回 bookId + reader URL
async function handleWereadSearch(env, q) {
  const key = await settingGet(env, 'weread_api_key');
  if (!key) return json({ error: '未配置 Weread Skills API Key' }, 400);

  const query = String(q.q || '').trim();
  if (!query) return json({ error: '缺少书名 q' }, 400);

  const GATEWAY = 'https://i.weread.qq.com/api/agent/gateway';

  try {
    const body = {
      api_name: '/store/search',
      skill_version: '1.0.3',
      keyword: query,
      scope: 10,
      count: 5,
    };
    const r = await fetch(GATEWAY, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + key,
        'Content-Type': 'application/json',
        'User-Agent': 'Ethan-Workbench/1.0',
        'Accept': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const text = await r.text().catch(() => '');
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { _raw: text }; }
    if (!r.ok) {
      const msg = (data && (data.message || data.statusMessage || data.error)) || text || `HTTP ${r.status}`;
      throw new Error(`${r.status}: ${JSON.stringify(msg).slice(0, 200)}`);
    }

    // Parse: results[].books[].bookInfo -> extract hashId from deepLink
    const isHashId = (v) => typeof v === 'string' && /^[a-z0-9]{20,}$/i.test(v.replace(/-/g, ''));
    const results = [];
    const resultGroups = data?.results || [];
    for (const group of resultGroups) {
      const books = group?.books || [];
      for (const item of books) {
        const info = item?.bookInfo || {};
        const deepLink = info.deepLink || '';
        const hashMatch = deepLink.match(/v=([a-z0-9]+)/);
        const hashId = hashMatch ? hashMatch[1] : '';
        if (!hashId || !isHashId(hashId)) continue;
        results.push({
          title: String(info.title || '').trim(),
          author: String(info.author || '').trim(),
          bookId: hashId,
          cover: info.cover || '',
          rating: info.newRating ? String(info.newRating) : '',
        });
      }
    }
    return json({ ok: true, results, total: results.length });
  } catch (e) {
    return json({ error: e.message || '搜索失败' }, 502);
  }
}

// ---------------- cover.search：weread 优先 → 豆瓣 → Google Books 兜底
async function handleCoverSearch(env, q) {
  const query = String(q.q || '').trim();
  const author = String(q.author || '').trim();
  if (!query) return json({ error: '缺少 q' }, 400);

  // 0) weread 搜索（如果已配置 weread key，优先使用）
  const wereadKey = await settingGet(env, 'weread_api_key');
  if (wereadKey) {
    try {
      const GATEWAY = 'https://i.weread.qq.com/api/agent/gateway';
      const resp = await fetch(GATEWAY, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + wereadKey,
          'Content-Type': 'application/json',
          'User-Agent': 'Ethan-Workbench/1.0',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ api_name: '/store/search', skill_version: '1.0.3', keyword: query, scope: 10, count: 3 }),
      });
      if (resp.ok) {
        const data = await resp.json().catch(() => null);
        // Parse: results[].books[].bookInfo
        const resultGroups = data?.results || [];
        const items = [];
        for (const group of resultGroups) {
          const books = group?.books || [];
          for (const item of books) {
            const info = item?.bookInfo || {};
            if (info.cover) {
              items.push({
                title: info.title || '',
                author: info.author || '',
                cover: info.cover,
              });
            }
          }
        }
        if (items.length > 0) {
          let pick = null;
          if (author) {
            pick = items.find(x =>
              String(x.title || '').includes(query.slice(0, 2)) &&
              String(x.author || '').includes(author.slice(0, 2))
            );
          }
          if (!pick) pick = items.find(x => String(x.title || '').includes(query.slice(0, 2)));
          if (!pick) pick = items[0];
          if (pick && pick.cover) {
            const rawCover = pick.cover;
            const proxied = '/api/cover/proxy?url=' + encodeURIComponent(String(rawCover));
            return json({ ok: true, coverUrl: proxied, source: 'weread', title: pick.title, author: pick.author });
          }
        }
      }
    } catch (_) { /* ignore, fallthrough to Douban */ }
  }

  // 1) 豆瓣建议搜索（中文书首选）
  try {
    const s = encodeURIComponent(query + (author ? ' ' + author : ''));
    const douban = await fetch(`https://book.douban.com/j/subject_suggest?q=${s}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Referer': 'https://book.douban.com/',
      }
    });
    if (douban.ok) {
      const arr = (await douban.json().catch(() => [])) || [];
      // 优先匹配书名+作者精确，否则取第一条
      let pick = null;
      if (author) {
        pick = arr.find(x => String(x.title || '').includes(query) && String(x.author || '').includes(author));
      }
      if (!pick) pick = arr.find(x => String(x.title || '').includes(query));
      if (!pick) pick = arr[0];
      if (pick && pick.img) {
        // 豆瓣有防盗链，前端必须走同源代理
        const proxied = '/api/cover/proxy?url=' + encodeURIComponent(String(pick.img));
        return json({ ok: true, coverUrl: proxied, source: 'douban', title: pick.title, author: pick.author });
      }
    }
  } catch (e) {
    // ignore, fallthrough
  }

  // 2) Google Books fallback（英文书/漏网译著）
  try {
    const s = encodeURIComponent(`intitle:${query}${author ? ' inauthor:' + author : ''}`);
    const gbUrl = `https://www.googleapis.com/books/v1/volumes?q=${s}&country=CN&maxResults=3&printType=books&fields=items(volumeInfo(imageLinks/thumbnail,title,authors))`;
    const r = await fetch(gbUrl);
    if (r.ok) {
      const d = await r.json().catch(() => ({}));
      const it = (d.items || []).find(x => x?.volumeInfo?.imageLinks?.thumbnail);
      if (it) {
        let u = it.volumeInfo.imageLinks.thumbnail;
        // Google 默认 zoom=1 缩略，升到 zoom=2
        u = u.replace(/&zoom=\d+/, '&zoom=2').replace(/(http:\/\/|^\/\/)/, 'https://');
        return json({ ok: true, coverUrl: u, source: 'google', title: it.volumeInfo.title, author: (it.volumeInfo.authors || []).join('/') });
      }
    }
  } catch (e) { /* ignore */ }

  return json({ ok: false, error: '豆瓣 & Google Books 均未匹配到封面；可手动粘贴图片链接' });
}

// ---------------- cover.proxy：豆瓣/杂项图片防盗链同源代理
async function handleCoverProxy(env, url) {
  if (!url || typeof url !== 'string') return new Response('missing url', { status: 400 });
  let safeUrl = url;
  // 协议归一
  if (safeUrl.startsWith('//')) safeUrl = 'https:' + safeUrl;
  if (!/^https?:\/\//i.test(safeUrl)) return new Response('bad url', { status: 400 });

  // 允许的域名白名单（防止 SSRF）
  const u = new URL(safeUrl);
  const ALLOWED = /(doubanio\.com|douban\.com|weread\.qq\.com|qq\.com|google\.com|googleapis\.com|googleusercontent\.com|books\.google\.com|books\.googleapis\.com|res\.weread\.qq\.com|img[0-9]+\.doubanio\.com|myqcloud\.com|wfqqreader-10000000\.image\.myqcloud\.com|cos\.ap-beijing\.myqcloud\.com|tencent-cloud\.com|qpic\.cn)$/i;
  if (!ALLOWED.test(u.hostname)) return new Response('domain not allowed', { status: 403 });

  try {
    // 智能 Referer 伪装
    let referer = u.origin + '/';
    let ua = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36';
    if (/douban/.test(u.hostname)) {
      referer = 'https://book.douban.com/';
    } else if (/weread|myqcloud|qq\.com/.test(u.hostname)) {
      referer = 'https://weread.qq.com/';
      ua = 'WeRead/1.0 (Linux;Android) Mozilla/5.0 Chrome/120 Safari/537.36';
    }
    const r = await fetch(safeUrl, {
      headers: {
        'User-Agent': ua,
        'Referer': referer,
        'Origin': referer.replace(/\/$/, ''),
        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
      cf: { cacheTtl: 60 * 60 * 24 * 14, cacheEverything: true },
    });
    const ct = r.headers.get('content-type') || 'image/jpeg';
    const buf = await r.arrayBuffer();
    return new Response(buf, {
      status: r.status,
      headers: {
        'Content-Type': ct,
        'Content-Length': String(buf.byteLength),
        'Cache-Control': 'public, max-age=1209600, stale-while-revalidate=86400',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (e) {
    return new Response('proxy error: ' + e.message, { status: 502 });
  }
}

// ----------------------------- birthday-migrate（一次性录入生日事项）
async function handleBirthdayMigrate(env) {
  const userId = uid(env);
  await ensureScheduleRepeat(env);

  // 存量修正：把所有生日事项统一归为「生活」(category=5)
  await env.DB.prepare(
    `UPDATE ethan_schedules SET category=5 WHERE user_id=? AND title LIKE '%生日%'`
  ).bind(userId).run();

  const BIRTHDAYS = [
    { title: '🎂溪客生日', solar: { month: 10, day: 9 }, type: 'yearly' },
    { title: '🎂宝贝生日', lunar: { month: 9, day: 10 }, type: 'lunar-yearly' },
    { title: '🎂丈母娘生日', lunar: { month: 9, day: 14 }, type: 'lunar-yearly' },
    { title: '🎂老妈生日', lunar: { month: 9, day: 17 }, type: 'lunar-yearly' },
    { title: '🎂我的生日', lunar: { month: 9, day: 26 }, type: 'lunar-yearly' },
    { title: '🎂三姐生日', lunar: { month: 12, day: 4 }, type: 'lunar-yearly' },
    { title: '🎂大姐生日', lunar: { month: 12, day: 13 }, type: 'lunar-yearly' },
    { title: '🎂拾柒生日', solar: { month: 2, day: 28 }, type: 'yearly' },
    { title: '🎂哥生日', lunar: { month: 2, day: 27 }, type: 'lunar-yearly' },
    { title: '🎂二姐生日', lunar: { month: 3, day: 24 }, type: 'lunar-yearly' },
    { title: '🎂老爸生日', lunar: { month: 5, day: 8 }, type: 'lunar-yearly' },
    { title: '🎂嘉澍生日', solar: { month: 8, day: 11 }, type: 'yearly' },
    { title: '🎂云峰生日', solar: { month: 8, day: 22 }, type: 'yearly' },
  ];

  // 去重：查已有同名事项
  const existing = await env.DB.prepare(
    `SELECT title FROM ethan_schedules WHERE user_id=? AND repeat_rule IN ('yearly','lunar-yearly')`
  ).bind(userId).all();
  const existingTitles = new Set((existing.results || []).map(r => r.title));

  const results = [];
  for (const bd of BIRTHDAYS) {
    if (existingTitles.has(bd.title)) {
      results.push({ title: bd.title, status: 'skipped' });
      continue;
    }
    // 计算初始日期（2026年对应的阳历日期）
    let dateStr;
    if (bd.type === 'lunar-yearly') {
      const lunar = lunarLib.Lunar.fromYmd(2026, bd.lunar.month, bd.lunar.day);
      const solar = lunar.getSolar();
      dateStr = `${solar.getYear()}-${String(solar.getMonth()).padStart(2,'0')}-${String(solar.getDay()).padStart(2,'0')}`;
    } else {
      dateStr = `2026-${String(bd.solar.month).padStart(2,'0')}-${String(bd.solar.day).padStart(2,'0')}`;
    }
    await env.DB.prepare(
      `INSERT INTO ethan_schedules (user_id, title, date, start_time, end_time, duration_min, is_key, category, is_done, sort_order, repeat_rule) VALUES (?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(
      userId, bd.title, dateStr,
      null, null, null,
      0, 5, 0, 0, bd.type
    ).run();
    results.push({ title: bd.title, date: dateStr, repeat: bd.type, status: 'created' });
  }

  return json({
    total: BIRTHDAYS.length,
    created: results.filter(r => r.status === 'created').length,
    skipped: results.filter(r => r.status === 'skipped').length,
    results
  });
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
  const date = normalizeDate(r.date);
  if (!date) throw new Error(`无效日期格式: ${r.date}`);
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
      date,
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
  const date = normalizeDate(r.date);
  if (!date) throw new Error(`无效日期格式: ${r.date}`);
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
      date,
      toInt(r.priority, 2),
      toInt(r.is_done, 0),
      r.due_time || null,
      toInt(r.sort_order, 0),
      r.created_at || nowIso()
    )
    .run();
}

function insertLogRow(db, userId, r) {
  const date = normalizeDate(r.date);
  if (!date) throw new Error(`无效日期格式: ${r.date}`);
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
      date,
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
  const date = normalizeDate(r.date);
  if (!date) throw new Error(`无效日期格式: ${r.date}`);
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
