import { Router } from 'express';
import { db } from '../db.js';

const router = Router();

// 默认习惯模板（来自 demo）
const DEFAULT_HABITS = [
  { name: '睡眠', emoji: '😴', accent_color: '#34c759', target_time: '23:00', duration_min: 420 },
  { name: '每日运动', emoji: '🏃', accent_color: '#34c759', target_time: '06:00', duration_min: 60 },
  { name: '喝够2L水', emoji: '💧', accent_color: '#34c759', target_time: null, duration_min: null },
  { name: '看书半小时', emoji: '📖', accent_color: '#007aff', target_time: '07:30', duration_min: 30 },
  { name: '即兴表达练习', emoji: '🎤', accent_color: '#ffcc00', target_time: '07:00', duration_min: 15 },
  { name: '英语口语练习', emoji: '🗣️', accent_color: '#ffcc00', target_time: '07:15', duration_min: 15 },
];

// 初始化默认习惯（补齐缺失的默认习惯，用于老用户首次加载）
router.post('/init-defaults', (req, res) => {
  const existingNames = db.prepare('SELECT name FROM habits WHERE user_id = ? AND archived = 0').all(req.user.id).map(h => h.name);
  const missing = DEFAULT_HABITS.filter(h => !existingNames.includes(h.name));
  if (missing.length === 0) {
    return res.json({ created: 0, message: '默认习惯已齐全' });
  }
  // 找出当前最大 sort_order，避免重复
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) as m FROM habits WHERE user_id = ?').get(req.user.id).m;
  const insertHabit = db.prepare(`
    INSERT INTO habits (user_id, name, emoji, accent_color, target_time, duration_min, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const tx = db.transaction((habits) => {
    habits.forEach((h, i) => {
      insertHabit.run(req.user.id, h.name, h.emoji, h.accent_color, h.target_time, h.duration_min, maxOrder + 1 + i);
    });
  });
  tx(missing);
  res.json({ created: missing.length });
});

function calcDurationMin(start, end) {
  if (!start || !end) return null;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  if ([sh, sm, eh, em].some(n => Number.isNaN(n))) return null;
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins <= 0) mins += 24 * 60; // 跨天（如 23:00 -> 06:44）
  return mins;
}

const LOG_FIELDS_SQL = `SELECT habit_id, done, sleep_start, sleep_end, wake_state, energy_state, mood_state, sleep_note, data_source, actual_value, note
                         FROM habit_logs WHERE user_id = ? AND date = ?`;

// 列出习惯（含某日打卡情况）
router.get('/', (req, res) => {
  const date = req.query.date; // 可选，若提供则附带该日打卡状态
  const habits = db.prepare(`SELECT * FROM habits WHERE user_id = ? AND archived = 0 ORDER BY sort_order, id`).all(req.user.id);
  let logsByHabit = {};
  if (date) {
    const logs = db.prepare(LOG_FIELDS_SQL).all(req.user.id, date);
    logsByHabit = Object.fromEntries(logs.map(l => [l.habit_id, l]));
  }
  // 连续天数
  const today = new Date();
  const streaks = {};
  for (const h of habits) {
    let streak = 0;
    let d = new Date(today);
    while (true) {
      const ds = d.toISOString().slice(0, 10);
      const log = db.prepare(`SELECT done FROM habit_logs WHERE habit_id = ? AND date = ?`).get(h.id, ds);
      if (log && log.done) {
        streak++;
        d.setDate(d.getDate() - 1);
      } else {
        // 允许今天尚未打卡，回看昨日继续算连续
        if (streak === 0 && d.toISOString().slice(0, 10) === today.toISOString().slice(0, 10)) {
          d.setDate(d.getDate() - 1);
          continue;
        }
        break;
      }
    }
    streaks[h.id] = streak;
  }
  res.json({
    habits: habits.map(h => {
      const log = logsByHabit[h.id];
      return {
        ...h,
        done_today: date ? !!((log && log.done) === 1 || (typeof log === 'object' && log && log.done)) : null,
        streak: streaks[h.id] || 0,
        // 增强字段（来自 ethan_habit_logs / D1 对齐）
        sleep_start:  log ? log.sleep_start  : null,
        sleep_end:    log ? log.sleep_end    : null,
        wake_state:   log ? log.wake_state   : null,
        energy_state: log ? log.energy_state : null,
        mood_state:   log ? log.mood_state   : null,
        sleep_note:   log ? log.sleep_note   : null,
        data_source:  log ? log.data_source  : null,
        actual_value: log ? Number(log.actual_value || 0) : 0,
        log_note:     log ? log.note         : null,
      };
    })
  });
});

router.post('/', (req, res) => {
  const b = req.body || {};
  const { name, emoji, accent_color, target_time, duration_min, sort_order,
          start_time, end_time, growth_type, target_mode, target_value, target_unit, streak_goal, auto_log } = b;
  if (!name) return res.status(400).json({ error: '习惯名称必填' });
  const info = db.prepare(`
    INSERT INTO habits (user_id, name, emoji, accent_color, target_time, duration_min, sort_order,
                        start_time, end_time, growth_type, target_mode, target_value, target_unit, streak_goal, auto_log)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.user.id, name, emoji || '✅', accent_color || '#34c759', target_time || null, duration_min || null, sort_order || 0,
         start_time || null, end_time || null, growth_type || 'energy',
         target_mode || 'check', target_value ?? null, target_unit || null, streak_goal ?? null,
         auto_log === undefined ? 1 : (auto_log ? 1 : 0));
  res.json({ habit: db.prepare('SELECT * FROM habits WHERE id = ?').get(info.lastInsertRowid) });
});

router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const cur = db.prepare('SELECT * FROM habits WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!cur) return res.status(404).json({ error: '习惯不存在' });
  const b = req.body || {};
  const { name, emoji, accent_color, target_time, duration_min, sort_order, archived,
          start_time, end_time, growth_type, target_mode, target_value, target_unit, streak_goal, auto_log } = b;
  db.prepare(`
    UPDATE habits SET
      name = COALESCE(?, name),
      emoji = COALESCE(?, emoji),
      accent_color = COALESCE(?, accent_color),
      target_time = COALESCE(?, target_time),
      duration_min = COALESCE(?, duration_min),
      sort_order = COALESCE(?, sort_order),
      archived = COALESCE(?, archived),
      start_time = COALESCE(?, start_time),
      end_time = COALESCE(?, end_time),
      growth_type = COALESCE(?, growth_type),
      target_mode = COALESCE(?, target_mode),
      target_value = ?,
      target_unit = COALESCE(?, target_unit),
      streak_goal = ?,
      auto_log = ?,
      updated_at = datetime('now')
    WHERE id = ? AND user_id = ?
  `).run(
    name ?? null, emoji ?? null, accent_color ?? null, target_time ?? null, duration_min ?? null,
    sort_order ?? null, archived === undefined ? null : (archived ? 1 : 0),
    start_time ?? null, end_time ?? null, growth_type ?? null, target_mode ?? null,
    target_value === undefined ? null : target_value,
    target_unit ?? null,
    streak_goal === undefined ? null : streak_goal,
    auto_log === undefined ? null : (auto_log ? 1 : 0),
    id, req.user.id
  );
  res.json({ habit: db.prepare('SELECT * FROM habits WHERE id = ?').get(id) });
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const info = db.prepare('DELETE FROM habits WHERE id = ? AND user_id = ?').run(id, req.user.id);
  if (info.changes === 0) return res.status(404).json({ error: '习惯不存在' });
  res.json({ ok: true });
});

// 打卡 / 取消打卡
router.post('/:id/toggle', (req, res) => {
  const id = Number(req.params.id);
  const date = (req.body && req.body.date) || new Date().toISOString().slice(0, 10);
  const habit = db.prepare('SELECT * FROM habits WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!habit) return res.status(404).json({ error: '习惯不存在' });
  const log = db.prepare('SELECT * FROM habit_logs WHERE habit_id = ? AND date = ?').get(id, date);
  let done;
  if (log) {
    done = log.done ? 0 : 1;
    db.prepare('UPDATE habit_logs SET done = ? WHERE id = ?').run(done, log.id);
  } else {
    done = 1;
    db.prepare('INSERT INTO habit_logs (habit_id, user_id, date, done) VALUES (?, ?, ?, ?)').run(id, req.user.id, date, done);
  }
  res.json({ habit_id: id, date, done: !!done });
});

// 月度完成率
router.get('/stats', (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: '请提供 from 与 to' });
  const habits = db.prepare(`SELECT id FROM habits WHERE user_id = ? AND archived = 0`).all(req.user.id);
  const stats = habits.map(h => {
    const rows = db.prepare(`SELECT date, done FROM habit_logs WHERE habit_id = ? AND date >= ? AND date <= ?`).all(h.id, from, to);
    return {
      habit_id: h.id,
      total_days: rows.length,
      done_days: rows.filter(r => r.done).length,
      dates: rows.filter(r => r.done).map(r => r.date)
    };
  });
  res.json({ stats });
});

// 列出归档的习惯
router.get('/archived/list', (req, res) => {
  const list = db.prepare(`
    SELECT * FROM habits WHERE user_id = ? AND archived = 1 ORDER BY updated_at DESC, id DESC
  `).all(req.user.id);
  res.json({ habits: list });
});

// 软删除：归档（而不是真删）
router.post('/:id/archive', (req, res) => {
  const id = Number(req.params.id);
  const cur = db.prepare('SELECT * FROM habits WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!cur) return res.status(404).json({ error: '习惯不存在' });
  db.prepare('UPDATE habits SET archived = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?').run(id, req.user.id);
  res.json({ ok: true });
});

// 从归档恢复
router.post('/:id/restore', (req, res) => {
  const id = Number(req.params.id);
  const cur = db.prepare('SELECT * FROM habits WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!cur) return res.status(404).json({ error: '习惯不存在' });
  db.prepare('UPDATE habits SET archived = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?').run(id, req.user.id);
  res.json({ ok: true });
});

// === D1 动作式路由别名 ===
router.post('/list', (req, res) => {
  const date = (req.body || {}).date;
  const habits = db.prepare(`SELECT * FROM habits WHERE user_id = ? AND archived = 0 ORDER BY sort_order, id`).all(req.user.id);
  let logsByHabit = {};
  if (date) {
    const logs = db.prepare(LOG_FIELDS_SQL).all(req.user.id, date);
    logsByHabit = Object.fromEntries(logs.map(l => [l.habit_id, l]));
  }
  const today = new Date();
  const streaks = {};
  for (const h of habits) {
    let streak = 0;
    let d = new Date(today);
    while (true) {
      const ds = d.toISOString().slice(0, 10);
      const log = db.prepare(`SELECT done FROM habit_logs WHERE habit_id = ? AND date = ?`).get(h.id, ds);
      if (log && log.done) {
        streak++;
        d.setDate(d.getDate() - 1);
      } else {
        if (streak === 0 && d.toISOString().slice(0, 10) === today.toISOString().slice(0, 10)) {
          d.setDate(d.getDate() - 1);
          continue;
        }
        break;
      }
    }
    streaks[h.id] = streak;
  }
  res.json({
    habits: habits.map(h => {
      const log = logsByHabit[h.id];
      return {
        ...h,
        done_today: date ? !!((log && log.done) === 1 || (typeof log === 'object' && log && log.done)) : null,
        streak: streaks[h.id] || 0,
        sleep_start:  log ? log.sleep_start  : null,
        sleep_end:    log ? log.sleep_end    : null,
        wake_state:   log ? log.wake_state   : null,
        energy_state: log ? log.energy_state : null,
        mood_state:   log ? log.mood_state   : null,
        sleep_note:   log ? log.sleep_note   : null,
        data_source:  log ? log.data_source  : null,
        actual_value: log ? Number(log.actual_value || 0) : 0,
        log_note:     log ? log.note         : null,
      };
    })
  });
});

router.post('/create', (req, res) => {
  const b = req.body || {};
  const { name, emoji, accent_color, target_time, duration_min, sort_order,
          start_time, end_time, growth_type, target_mode, target_value, target_unit, streak_goal, auto_log } = b;
  if (!name) return res.status(400).json({ error: '习惯名称必填' });
  const info = db.prepare(`
    INSERT INTO habits (user_id, name, emoji, accent_color, target_time, duration_min, sort_order,
                        start_time, end_time, growth_type, target_mode, target_value, target_unit, streak_goal, auto_log)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.user.id, name, emoji || '✅', accent_color || '#34c759', target_time || null, duration_min || null, sort_order || 0,
         start_time || null, end_time || null, growth_type || 'energy',
         target_mode || 'check', target_value ?? null, target_unit || null, streak_goal ?? null,
         auto_log === undefined ? 1 : (auto_log ? 1 : 0));
  res.json({ habit: db.prepare('SELECT * FROM habits WHERE id = ?').get(info.lastInsertRowid), id: info.lastInsertRowid });
});

router.post('/update', (req, res) => {
  const b = req.body || {};
  const id = Number(b.id);
  if (!id) return res.status(400).json({ error: 'id 必填' });
  const cur = db.prepare('SELECT * FROM habits WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!cur) return res.status(404).json({ error: '习惯不存在' });
  const { name, emoji, accent_color, target_time, duration_min, sort_order, archived,
          start_time, end_time, growth_type, target_mode, target_value, target_unit, streak_goal, auto_log } = b;
  db.prepare(`
    UPDATE habits SET
      name = COALESCE(?, name), emoji = COALESCE(?, emoji), accent_color = COALESCE(?, accent_color),
      target_time = COALESCE(?, target_time), duration_min = COALESCE(?, duration_min),
      sort_order = COALESCE(?, sort_order), archived = COALESCE(?, archived),
      start_time = COALESCE(?, start_time), end_time = COALESCE(?, end_time),
      growth_type = COALESCE(?, growth_type), target_mode = COALESCE(?, target_mode),
      target_value = ?, target_unit = COALESCE(?, target_unit),
      streak_goal = ?, auto_log = ?,
      updated_at = datetime('now')
    WHERE id = ? AND user_id = ?
  `).run(
    name ?? null, emoji ?? null, accent_color ?? null, target_time ?? null, duration_min ?? null,
    sort_order ?? null, archived === undefined ? null : (archived ? 1 : 0),
    start_time ?? null, end_time ?? null, growth_type ?? null, target_mode ?? null,
    target_value === undefined ? null : target_value,
    target_unit ?? null,
    streak_goal === undefined ? null : streak_goal,
    auto_log === undefined ? null : (auto_log ? 1 : 0),
    id, req.user.id
  );
  res.json({ habit: db.prepare('SELECT * FROM habits WHERE id = ?').get(id) });
});

router.post('/remove', (req, res) => {
  const id = Number((req.body || {}).id);
  if (!id) return res.status(400).json({ error: 'id 必填' });
  const info = db.prepare('DELETE FROM habits WHERE id = ? AND user_id = ?').run(id, req.user.id);
  if (info.changes === 0) return res.status(404).json({ error: '习惯不存在' });
  res.json({ ok: true });
});

router.post('/reorder', (req, res) => {
  const { orderedIds } = req.body || {};
  if (!Array.isArray(orderedIds)) return res.status(400).json({ error: 'orderedIds 必填' });
  const stmt = db.prepare('UPDATE habits SET sort_order = ? WHERE id = ? AND user_id = ?');
  const tx = db.transaction(() => orderedIds.forEach((id, i) => stmt.run(i, Number(id), req.user.id)));
  tx();
  res.json({ ok: true });
});

router.post('/toggle', (req, res) => {
  const { id, date, targetDone } = req.body || {};
  const habitId = Number(id);
  const finalDate = date || new Date().toISOString().slice(0, 10);
  const habit = db.prepare('SELECT * FROM habits WHERE id = ? AND user_id = ?').get(habitId, req.user.id);
  if (!habit) return res.status(404).json({ error: '习惯不存在' });
  const log = db.prepare('SELECT * FROM habit_logs WHERE habit_id = ? AND date = ?').get(habitId, finalDate);
  let done;
  if (log) {
    done = targetDone !== undefined ? (targetDone ? 1 : 0) : (log.done ? 0 : 1);
    db.prepare('UPDATE habit_logs SET done = ? WHERE id = ?').run(done, log.id);
  } else {
    done = targetDone !== undefined ? (targetDone ? 1 : 0) : 1;
    db.prepare('INSERT INTO habit_logs (habit_id, user_id, date, done) VALUES (?, ?, ?, ?)').run(habitId, req.user.id, finalDate, done);
  }
  res.json({ habit_id: habitId, date: finalDate, done: !!done });
});

// ========= 睡眠记录（对齐 ethan_habit_logs / logSleep D1 接口） =========
router.post('/logSleep', (req, res) => {
  const b = req.body || {};
  const habitId = Number(b.habitId ?? b.habit_id);
  const date = (b.date || new Date().toISOString().slice(0, 10));
  if (!habitId) return res.status(400).json({ error: 'habitId 必填' });
  const habit = db.prepare('SELECT * FROM habits WHERE id = ? AND user_id = ?').get(habitId, req.user.id);
  if (!habit) return res.status(404).json({ error: '习惯不存在' });
  const { sleep_start, sleep_end, energy_state, mood_state, sleep_note } = b;
  // 计算是否达标（有起止时间才计算）
  const durMin = calcDurationMin(sleep_start, sleep_end);
  const targetMin = habit.duration_min || 420;
  let done = 0;
  if (durMin != null && durMin >= targetMin) done = 1;
  const existing = db.prepare('SELECT id FROM habit_logs WHERE habit_id = ? AND date = ? AND user_id = ?').get(habitId, date, req.user.id);
  const payload = {
    sleep_start: sleep_start || null,
    sleep_end: sleep_end || null,
    wake_state: null,
    energy_state: energy_state || null,
    mood_state: mood_state || null,
    sleep_note: sleep_note || null,
    data_source: 'manual',
  };
  if (existing) {
    db.prepare(`
      UPDATE habit_logs SET
        habit_id=?, user_id=?, date=?, done=?,
        sleep_start=?, sleep_end=?, wake_state=?, energy_state=?, mood_state=?, sleep_note=?, data_source=?
      WHERE id=?
    `).run(habitId, req.user.id, date, done,
           payload.sleep_start, payload.sleep_end, payload.wake_state,
           payload.energy_state, payload.mood_state, payload.sleep_note,
           payload.data_source, existing.id);
  } else {
    db.prepare(`
      INSERT INTO habit_logs
        (habit_id, user_id, date, done, sleep_start, sleep_end, wake_state, energy_state, mood_state, sleep_note, data_source, actual_value, note)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(habitId, req.user.id, date, done,
           payload.sleep_start, payload.sleep_end, payload.wake_state,
           payload.energy_state, payload.mood_state, payload.sleep_note,
           payload.data_source, 0, null);
  }
  res.json({ done: !!done, duration_min: durMin, target_min: targetMin });
});

// ========= 量化打卡（对齐 ethan_habit_logs / logCount D1 接口） =========
router.post('/logCount', (req, res) => {
  const b = req.body || {};
  const habitId = Number(b.habitId ?? b.habit_id);
  const date = (b.date || new Date().toISOString().slice(0, 10));
  if (!habitId) return res.status(400).json({ error: 'habitId 必填' });
  const habit = db.prepare('SELECT * FROM habits WHERE id = ? AND user_id = ?').get(habitId, req.user.id);
  if (!habit) return res.status(404).json({ error: '习惯不存在' });
  const addValue = Number(b.add_value ?? b.addValue ?? 0);
  const note = b.note || null;
  const existing = db.prepare('SELECT * FROM habit_logs WHERE habit_id=? AND date=? AND user_id=?').get(habitId, date, req.user.id);
  let actualValue;
  if (existing) {
    actualValue = Number(existing.actual_value || 0) + addValue;
    const target = Number(habit.target_value) || 1;
    const done = actualValue >= target ? 1 : 0;
    db.prepare(`UPDATE habit_logs SET done=?, actual_value=?, note=COALESCE(?, note) WHERE id=?`)
      .run(done, actualValue, note, existing.id);
    res.json({ done: !!done, actual_value: actualValue, target_value: Number(habit.target_value) || 0 });
  } else {
    actualValue = Math.max(0, addValue);
    const target = Number(habit.target_value) || 1;
    const done = actualValue >= target ? 1 : 0;
    db.prepare(`INSERT INTO habit_logs (habit_id,user_id,date,done,actual_value,note) VALUES (?,?,?,?,?,?)`)
      .run(habitId, req.user.id, date, done, actualValue, note);
    res.json({ done: !!done, actual_value: actualValue, target_value: Number(habit.target_value) || 0 });
  }
});

router.post('/stats', (req, res) => {
  const { from, to } = req.body || {};
  if (!from || !to) return res.status(400).json({ error: '请提供 from 与 to' });
  const habits = db.prepare(`SELECT id FROM habits WHERE user_id = ? AND archived = 0`).all(req.user.id);
  const stats = habits.map(h => {
    const rows = db.prepare(`SELECT date, done FROM habit_logs WHERE habit_id = ? AND date >= ? AND date <= ?`).all(h.id, from, to);
    return { habit_id: h.id, total_days: rows.length, done_days: rows.filter(r => r.done).length, dates: rows.filter(r => r.done).map(r => r.date) };
  });
  res.json({ stats });
});

router.post('/archivedList', (req, res) => {
  const list = db.prepare(`SELECT * FROM habits WHERE user_id = ? AND archived = 1 ORDER BY updated_at DESC, id DESC`).all(req.user.id);
  res.json({ habits: list });
});

router.post('/archive', (req, res) => {
  const id = Number((req.body || {}).id);
  if (!id) return res.status(400).json({ error: 'id 必填' });
  const cur = db.prepare('SELECT * FROM habits WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!cur) return res.status(404).json({ error: '习惯不存在' });
  db.prepare('UPDATE habits SET archived = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?').run(id, req.user.id);
  res.json({ ok: true });
});

router.post('/restore', (req, res) => {
  const id = Number((req.body || {}).id);
  if (!id) return res.status(400).json({ error: 'id 必填' });
  const cur = db.prepare('SELECT * FROM habits WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!cur) return res.status(404).json({ error: '习惯不存在' });
  db.prepare('UPDATE habits SET archived = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?').run(id, req.user.id);
  res.json({ ok: true });
});

export default router;
