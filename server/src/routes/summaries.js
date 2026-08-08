import { Router } from 'express';
import { db } from '../db.js';

const router = Router();

router.get('/', (req, res) => {
  const { date, from, to } = req.query;
  let row;
  if (from && to) {
    row = db.prepare(`SELECT * FROM summaries WHERE user_id = ? AND date >= ? AND date <= ? ORDER BY date DESC`).all(req.user.id, from, to);
    return res.json({ summaries: row });
  } else if (date) {
    row = db.prepare(`SELECT * FROM summaries WHERE user_id = ? AND date = ?`).get(req.user.id, date);
    return res.json({ summary: row });
  }
  return res.status(400).json({ error: '请提供 date 或 from/to' });
});

router.post('/', (req, res) => {
  const { date, content, mood } = req.body || {};
  if (!date || !content) return res.status(400).json({ error: '日期与内容必填' });
  db.prepare(`
    INSERT INTO summaries (user_id, date, content, mood)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, date) DO UPDATE SET
      content = excluded.content,
      mood = excluded.mood,
      updated_at = datetime('now')
  `).run(req.user.id, date, content, mood || null);
  res.json({ summary: db.prepare(`SELECT * FROM summaries WHERE user_id = ? AND date = ?`).get(req.user.id, date) });
});

router.delete('/:date', (req, res) => {
  const date = req.params.date;
  const info = db.prepare('DELETE FROM summaries WHERE user_id = ? AND date = ?').run(req.user.id, date);
  if (info.changes === 0) return res.status(404).json({ error: '总结不存在' });
  res.json({ ok: true });
});

export default router;
