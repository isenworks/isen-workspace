// ============================================================
// /api/habits/* 处理器
// ============================================================
import {
  uid, json, dbAll, dbFirst, dbRun, toInt, toBoolInt,
  getLocalDate, calcStreak, validateDate, recycleSnapshot, addDaysISO,
} from '../core.js';

// ---------------- habits.list
export async function handleHabitsList(env, q) {
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

// ---------------- habits.archivedList
export async function handleHabitsArchivedList(env) {
  const rows = await dbAll(
    env.DB,
    `SELECT * FROM ethan_habits WHERE user_id = ? AND archived = 1 ORDER BY COALESCE(updated_at, created_at) DESC, id DESC`,
    [uid(env)]
  );
  return json({ habits: rows });
}

// ---------------- habits.create
export async function handleHabitsCreate(env, body) {
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

// ---------------- habits.update
export async function handleHabitsUpdate(env, body) {
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

// ---------------- habits.reorder
export async function handleHabitsReorder(env, body) {
  const orderedIds = Array.isArray(body?.orderedIds) ? body.orderedIds.map(Number) : [];
  const stmt = env.DB.prepare(`UPDATE ethan_habits SET sort_order = ? WHERE id = ?`);
  const ps = orderedIds.map((id, i) => stmt.bind(i, id));
  if (ps.length > 0) await env.DB.batch(ps);
  return json({ ok: true });
}

// ---------------- habits.archive / habits.restore
export async function handleHabitsArchive(env, body, archived) {
  const id = Number(body?.id);
  if (!id) return json({ error: '缺少 id' }, 400);
  await dbRun(env.DB, `UPDATE ethan_habits SET archived = ?, updated_at = datetime('now') WHERE id = ?`, [archived, id]);
  return json({ ok: true });
}

// ---------------- habits.remove（连带打卡日志一起进回收站）
export async function handleHabitsRemove(env, body) {
  const id = Number(body?.id);
  if (!id) return json({ error: '缺少 id' }, 400);
  const logs = await dbAll(env.DB, `SELECT * FROM ethan_habit_logs WHERE habit_id = ?`, [id]);
  await recycleSnapshot(env, 'habit', id, 'ethan_habits', { logs });
  await dbRun(env.DB, `DELETE FROM ethan_habit_logs WHERE habit_id = ?`, [id]);
  await dbRun(env.DB, `DELETE FROM ethan_habits WHERE id = ?`, [id]);
  return json({ ok: true });
}

// ---------------- 未完成原因（打卡三态：完成 / 未打卡 / 已标记未完成）
//   missed=1 表示「确实没做到」，与「没有记录」区分开，才能做长期归因。
//   列采用懒迁移：老库首次访问时补列，失败吞错（已存在即会抛错）。
let _missColsReady = false;
async function ensureHabitMissColumns(env) {
  if (_missColsReady) return;
  const ddl = [
    `ALTER TABLE ethan_habit_logs ADD COLUMN missed INTEGER DEFAULT 0`,
    `ALTER TABLE ethan_habit_logs ADD COLUMN miss_reasons TEXT`,
    `ALTER TABLE ethan_habit_logs ADD COLUMN miss_note TEXT`,
  ];
  for (const sql of ddl) { try { await env.DB.prepare(sql).run(); } catch (_) {} }
  _missColsReady = true;
}

function parseReasons(raw) {
  if (Array.isArray(raw)) return raw.map(v => String(v).trim()).filter(Boolean).slice(0, 12);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? parseReasons(arr) : [];
  } catch { return []; }
}

// ---------------- habits.setMissed
export async function handleHabitsSetMissed(env, body) {
  const userId = uid(env);
  await ensureHabitMissColumns(env);
  const habitId = Number(body?.habit_id ?? body?.habitId ?? body?.id);
  const dateCheck = validateDate(body?.date || getLocalDate());
  if (!habitId) return json({ error: '缺少 habit_id' }, 400);
  if (!dateCheck.valid) return json({ error: dateCheck.error }, 400);
  const date = dateCheck.value;
  const missed = body?.missed === false || body?.missed === 0 ? 0 : 1;
  const reasons = missed ? parseReasons(body?.reasons) : [];
  const note = missed ? String(body?.note || '').trim().slice(0, 200) : '';
  const reasonsJson = missed ? JSON.stringify(reasons) : null;

  const existing = await dbFirst(
    env.DB,
    `SELECT id FROM ethan_habit_logs WHERE habit_id=? AND user_id=? AND date=?`,
    [habitId, userId, date]
  );
  if (existing) {
    await dbRun(
      env.DB,
      `UPDATE ethan_habit_logs
          SET missed=?, miss_reasons=?, miss_note=?,
              done=CASE WHEN ?=1 THEN 0 ELSE done END
        WHERE id=?`,
      [missed, reasonsJson, note || null, missed, existing.id]
    );
  } else if (missed) {
    await dbRun(
      env.DB,
      `INSERT INTO ethan_habit_logs (habit_id,user_id,date,done,missed,miss_reasons,miss_note)
       VALUES (?,?,?,0,1,?,?)`,
      [habitId, userId, date, reasonsJson, note || null]
    );
  }
  return json({ habit_id: habitId, date, missed: !!missed, reasons, note });
}

// ---------------- habits.missed（按区间回读，供周矩阵三态与长期归因）
export async function handleHabitsMissed(env, q) {
  const { from, to } = q || {};
  if (!from || !to) return json({ error: '缺少 from / to' }, 400);
  await ensureHabitMissColumns(env);
  const rows = await dbAll(
    env.DB,
    `SELECT habit_id, date, miss_reasons, miss_note
       FROM ethan_habit_logs
      WHERE user_id=? AND missed=1 AND date>=? AND date<=?
      ORDER BY date DESC
      LIMIT 500`,
    [uid(env), from, to]
  );
  return json({
    records: rows.map((r) => ({
      habit_id: r.habit_id,
      date: r.date,
      reasons: parseReasons(r.miss_reasons),
      note: r.miss_note || '',
    })),
  });
}

// ---------------- habits.missStats（区间归因聚合）
//   统一「7 天 = 完成 + 未完成(带原因) + 未打卡」口径，供堆叠柱状图使用：
//   · reasons 只按主因（第一个原因）归入，保证每根柱子段之和 = 天数
//   · reasonTotals 统计全部原因（含次因），用于「哪个原因最常出现」
export async function handleHabitsMissStats(env, q) {
  const userId = uid(env);
  const fromCheck = validateDate((q || {}).from || '');
  const toCheck = validateDate((q || {}).to || '');
  if (!fromCheck.valid || !toCheck.valid) return json({ error: '缺少或无效的 from / to' }, 400);
  const from = fromCheck.value;
  const to = toCheck.value;
  if (from > to) return json({ error: 'from 不能晚于 to' }, 400);
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1;
  if (days > 62) return json({ error: '区间过长（最多 62 天）' }, 400);

  await ensureHabitMissColumns(env);
  const growth = String((q || {}).growth_type || '').trim();
  const habits = await dbAll(
    env.DB,
    `SELECT id, name, emoji, growth_type, accent_color FROM ethan_habits
      WHERE user_id = ? AND archived = 0${growth ? ' AND growth_type = ?' : ''}
      ORDER BY sort_order, id`,
    growth ? [userId, growth] : [userId]
  );
  const logs = await dbAll(
    env.DB,
    `SELECT habit_id, date, done, missed, miss_reasons
       FROM ethan_habit_logs
      WHERE user_id = ? AND date >= ? AND date <= ?`,
    [userId, from, to]
  );
  const logMap = new Map();
  logs.forEach((l) => logMap.set(`${l.habit_id}|${l.date}`, l));

  const reasonTotals = new Map();
  const items = habits.map((h) => {
    let done = 0;
    let missed = 0;
    let blank = 0;
    const primary = new Map();
    let day = from;
    for (let i = 0; i < days; i++) {
      const log = logMap.get(`${h.id}|${day}`);
      day = addDaysISO(day);
      if (!log) { blank++; continue; }
      if (Number(log.done) === 1) { done++; continue; }
      if (Number(log.missed) === 1) {
        missed++;
        const rs = parseReasons(log.miss_reasons);
        const key = rs[0] || '未注明';
        primary.set(key, (primary.get(key) || 0) + 1);
        rs.forEach((r) => reasonTotals.set(r, (reasonTotals.get(r) || 0) + 1));
        continue;
      }
      blank++; // 有记录但未达成（如计数型只完成一半）也归入「未打卡」
    }
    return {
      id: h.id,
      name: h.name,
      label: h.name,
      emoji: h.emoji || '',
      growth_type: h.growth_type || 'energy',
      accent_color: h.accent_color || '#34c759',
      done,
      missed,
      blank,
      total: days,
      reasons: [...primary.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
    };
  });

  return json({
    from,
    to,
    days,
    habits: items,
    reasonTotals: [...reasonTotals.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
  });
}

// ---------------- habits.toggle
export async function handleHabitsToggle(env, body) {
  const userId = uid(env);
  await ensureHabitMissColumns(env);
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
    // 完成即覆盖「未完成」记录：三态互斥，避免同一格同时是绿和黄
    if (done) {
      await dbRun(
        env.DB,
        `UPDATE ethan_habit_logs SET done=1, missed=0, miss_reasons=NULL, miss_note=NULL WHERE id=?`,
        [existing.id]
      );
    } else {
      await dbRun(env.DB, `UPDATE ethan_habit_logs SET done=0 WHERE id=?`, [existing.id]);
    }
    return json({ habit_id: habitId, date: today, done: !!done });
  }
  const wantDone = targetDone !== undefined ? targetDone : 1;
  if (wantDone !== 1) return json({ habit_id: habitId, date: today, done: false });
  await dbRun(env.DB, `INSERT INTO ethan_habit_logs (habit_id,user_id,date,done) VALUES (?,?,?,1)`, [habitId, userId, today]);
  return json({ habit_id: habitId, date: today, done: true });
}

// ---------------- habits.logSleep
export async function handleHabitsLogSleep(env, body) {
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

// ---------------- habits.logCount
export async function handleHabitsLogCount(env, body) {
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
  return json({ habit_id: habitId, date: today, done: !!done, actual_value: newValue, target_value: targetVal, target_unit: habit?.target_unit });
}

// ---------------- habits.stats
//   原实现按 habit 循环 N 次查询（N+1 性能问题），现改为 2 次查询：
//     1) 取未归档 habit id 列表
//     2) 单次 GROUP BY 聚合所有日志：COUNT(*) 计总、SUM(done) 计完成、GROUP_CONCAT 拼完成日期
//   无日志的 habit 仍以 0/0/[] 占位返回，保持响应结构一致
export async function handleHabitsStats(env, q) {
  const userId = uid(env);
  const { from, to } = q;
  if (!from || !to) return json({ error: '缺少 from / to' }, 400);

  const habitIds = await dbAll(
    env.DB,
    `SELECT id FROM ethan_habits WHERE user_id=? AND archived=0`,
    [userId]
  );

  // 单次聚合查询：GROUP_CONCAT 自动跳过 NULL，等价于"只拼 done=1 的日期"
  const agg = await dbAll(
    env.DB,
    `SELECT habit_id,
            COUNT(*) AS total_days,
            SUM(CASE WHEN done=1 THEN 1 ELSE 0 END) AS done_days,
            GROUP_CONCAT(CASE WHEN done=1 THEN date END) AS dates_str
       FROM ethan_habit_logs
      WHERE user_id=? AND date>=? AND date<=?
      GROUP BY habit_id`,
    [userId, from, to]
  );
  const aggMap = new Map(agg.map((r) => [r.habit_id, r]));

  const stats = habitIds.map((h) => {
    const a = aggMap.get(h.id);
    if (!a) return { habit_id: h.id, total_days: 0, done_days: 0, dates: [] };
    return {
      habit_id: h.id,
      total_days: a.total_days,
      done_days: a.done_days,
      dates: a.dates_str ? String(a.dates_str).split(',') : [],
    };
  });
  return json({ stats });
}
