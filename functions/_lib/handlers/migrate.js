// ============================================================
// /api/migrate + /api/birthday-migrate 处理器
//   - migrate：批量写入 6 表（Supabase→D1 一次性迁移，前端点按钮调用）
//   - birthday-migrate：一次性录入生日事项（每年/农历年重复）
// ============================================================
import {
  uid, json, toInt, nowIso, normalizeDate,
  ensureScheduleRepeat, lunarLib,
} from '../core.js';

// ----------------------------- birthday-migrate（一次性录入生日事项）
export async function handleBirthdayMigrate(env) {
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
// 入参：{ ethan_habits: [], ethan_habit_logs: [], ethan_schedules: [], ethan_tasks: [], ethan_summaries: [], ethan_fixed_schedules: [] }
export async function handleMigrate(env, body) {
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

// ============================================================
// 单行插入辅助（INSERT OR REPLACE，按原 id 还原）
// ============================================================
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
