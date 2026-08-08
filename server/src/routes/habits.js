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

// 列出习惯（含某日打卡情况）
router.get('/', (req, res) => {
  const date = req.query.date; // 可选，若提供则附带该日打卡状态
  const habits = db.prepare(`SELECT * FROM habits WHERE user_id = ? AND archived = 0 ORDER BY sort_order, id`).all(req.user.id);
  let logsByHabit = {};
  if (date) {
    const logs = db.prepare(`SELECT habit_id, done FROM habit_logs WHERE user_id = ? AND date = ?`).all(req.user.id, date);
    logsByHabit = Object.fromEntries(logs.map(l => [l.habit_id, l.done]));
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
    habits: habits.map(h => ({
      ...h,
      done_today: date ? (logsByHabit[h.id] === 1) : null,
      streak: streaks[h.id] || 0
    }))
  });
});

router.post('/', (req, res) => {
  const { name, emoji, accent_color, target_time, duration_min, sort_order } = req.body || {};
  if (!name) return res.status(400).json({ error: '习惯名称必填' });
  const info = db.prepare(`
    INSERT INTO habits (user_id, name, emoji, accent_color, target_time, duration_min, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(req.user.id, name, emoji || '✅', accent_color || '#34c759', target_time || null, duration_min || null, sort_order || 0);
  res.json({ habit: db.prepare('SELECT * FROM habits WHERE id = ?').get(info.lastInsertRowid) });
});

router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const cur = db.prepare('SELECT * FROM habits WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!cur) return res.status(404).json({ error: '习惯不存在' });
  const { name, emoji, accent_color, target_time, duration_min, sort_order, archived } = req.body || {};
  db.prepare(`
    UPDATE habits SET
      name = COALESCE(?, name),
      emoji = COALESCE(?, emoji),
      accent_color = COALESCE(?, accent_color),
      target_time = COALESCE(?, target_time),
      duration_min = COALESCE(?, duration_min),
      sort_order = COALESCE(?, sort_order),
      archived = COALESCE(?, archived)
    WHERE id = ? AND user_id = ?
  `).run(name ?? null, emoji ?? null, accent_color ?? null, target_time ?? null, duration_min ?? null,
         sort_order ?? null, archived === undefined ? null : (archived ? 1 : 0),
         id, req.user.id);
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

export default router;
