import { Router } from 'express';
import { db } from '../db.js';

const router = Router();

router.get('/', (req, res) => {
  const { date, from, to } = req.query;
  let rows;
  if (from && to) {
    rows = db.prepare(`SELECT * FROM tasks WHERE user_id = ? AND date >= ? AND date <= ? ORDER BY is_done, COALESCE(due_time, '99:99'), sort_order, id`).all(req.user.id, from, to);
  } else if (date) {
    rows = db.prepare(`SELECT * FROM tasks WHERE user_id = ? AND date = ? ORDER BY is_done, COALESCE(due_time, '99:99'), sort_order, id`).all(req.user.id, date);
  } else {
    rows = db.prepare(`SELECT * FROM tasks WHERE user_id = ? ORDER BY date DESC, id DESC LIMIT 200`).all(req.user.id);
  }
  res.json({ tasks: rows });
});

router.post('/', (req, res) => {
  const { title, date, priority, due_time, sort_order } = req.body || {};
  if (!title || !date) return res.status(400).json({ error: '标题与日期必填' });
  const info = db.prepare(`
    INSERT INTO tasks (user_id, title, date, priority, due_time, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(req.user.id, title, date, priority ?? 2, due_time || null, sort_order || 0);
  res.json({ task: db.prepare('SELECT * FROM tasks WHERE id = ?').get(info.lastInsertRowid) });
});

router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const cur = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!cur) return res.status(404).json({ error: '任务不存在' });
  const { title, date, priority, due_time, is_done, sort_order } = req.body || {};
  db.prepare(`
    UPDATE tasks SET
      title = COALESCE(?, title),
      date = COALESCE(?, date),
      priority = COALESCE(?, priority),
      due_time = COALESCE(?, due_time),
      is_done = COALESCE(?, is_done),
      sort_order = COALESCE(?, sort_order)
    WHERE id = ? AND user_id = ?
  `).run(title ?? null, date ?? null, priority ?? null, due_time ?? null,
         is_done === undefined ? null : (is_done ? 1 : 0),
         sort_order ?? null, id, req.user.id);
  res.json({ task: db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) });
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const info = db.prepare('DELETE FROM tasks WHERE id = ? AND user_id = ?').run(id, req.user.id);
  if (info.changes === 0) return res.status(404).json({ error: '任务不存在' });
  res.json({ ok: true });
});

export default router;
