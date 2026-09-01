import { Router } from 'express';
import { db } from '../db.js';

const router = Router();

// 查询某天的日程（自动含每日重复习惯不在此处）
router.get('/', (req, res) => {
  const { date, from, to } = req.query;
  let rows;
  if (from && to) {
    rows = db.prepare(`
      SELECT * FROM schedules
      WHERE user_id = ? AND date >= ? AND date <= ?
      ORDER BY date, COALESCE(start_time, '99:99'), sort_order, id
    `).all(req.user.id, from, to);
  } else if (date) {
    rows = db.prepare(`
      SELECT * FROM schedules
      WHERE user_id = ? AND date = ?
      ORDER BY COALESCE(start_time, '99:99'), sort_order, id
    `).all(req.user.id, date);
  } else {
    rows = db.prepare(`SELECT * FROM schedules WHERE user_id = ? ORDER BY date DESC, id DESC LIMIT 200`).all(req.user.id);
  }
  res.json({ schedules: rows });
});

// 根据 category 计算同步的 is_key 标志（1,2->1; 3,4->0）
function deriveIsKey(category) {
  const c = Number(category);
  return (c === 1 || c === 2) ? 1 : 0;
}

// 创建
router.post('/', (req, res) => {
  const { title, date, start_time, end_time, duration_min, is_key, category, sort_order } = req.body || {};
  if (!title || !date) return res.status(400).json({ error: '标题与日期必填' });
  const cat = category === undefined ? null : Number(category);
  const syncIsKey = cat === null ? (is_key ? 1 : 0) : deriveIsKey(cat);
  const finalCat = cat === null ? (syncIsKey ? 2 : 3) : cat;
  const info = db.prepare(`
    INSERT INTO schedules (user_id, title, date, start_time, end_time, duration_min, is_key, category, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.user.id, title, date, start_time || null, end_time || null, duration_min || null, syncIsKey, finalCat, sort_order || 0);
  const row = db.prepare('SELECT * FROM schedules WHERE id = ?').get(info.lastInsertRowid);
  res.json({ schedule: row });
});

// 更新
router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const cur = db.prepare('SELECT * FROM schedules WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!cur) return res.status(404).json({ error: '日程不存在' });
  const { title, date, start_time, end_time, duration_min, is_key, category, is_done, sort_order } = req.body || {};
  const cat = category === undefined ? null : Number(category);
  const newIsKey = cat === null
    ? (is_key === undefined ? null : (is_key ? 1 : 0))
    : deriveIsKey(cat);
  const newCat = cat;
  db.prepare(`
    UPDATE schedules SET
      title = COALESCE(?, title),
      date = COALESCE(?, date),
      start_time = COALESCE(?, start_time),
      end_time = COALESCE(?, end_time),
      duration_min = COALESCE(?, duration_min),
      is_key = COALESCE(?, is_key),
      category = COALESCE(?, category),
      is_done = COALESCE(?, is_done),
      sort_order = COALESCE(?, sort_order)
    WHERE id = ? AND user_id = ?
  `).run(
    title ?? null, date ?? null, start_time ?? null, end_time ?? null, duration_min ?? null,
    newIsKey,
    newCat,
    is_done === undefined ? null : (is_done ? 1 : 0),
    sort_order ?? null,
    id, req.user.id
  );
  const row = db.prepare('SELECT * FROM schedules WHERE id = ?').get(id);
  res.json({ schedule: row });
});

// 删除
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const info = db.prepare('DELETE FROM schedules WHERE id = ? AND user_id = ?').run(id, req.user.id);
  if (info.changes === 0) return res.status(404).json({ error: '日程不存在' });
  res.json({ ok: true });
});

// 批量同步（用于一次性替换某天的日程）
router.post('/sync', (req, res) => {
  const { date, items } = req.body || {};
  if (!date || !Array.isArray(items)) return res.status(400).json({ error: 'date 与 items 必填' });
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM schedules WHERE user_id = ? AND date = ?').run(req.user.id, date);
    const stmt = db.prepare(`
      INSERT INTO schedules (user_id, title, date, start_time, end_time, duration_min, is_key, category, is_done, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    items.forEach((it, i) => {
      const cat = it.category === undefined ? null : Number(it.category);
      const syncIsKey = cat === null ? (it.is_key ? 1 : 0) : deriveIsKey(cat);
      const finalCat = cat === null ? (syncIsKey ? 2 : 3) : cat;
      stmt.run(
        req.user.id, it.title, date,
        it.start_time || null, it.end_time || null, it.duration_min || null,
        syncIsKey, finalCat, it.is_done ? 1 : 0, it.sort_order ?? i
      );
    });
  });
  tx();
  const rows = db.prepare('SELECT * FROM schedules WHERE user_id = ? AND date = ? ORDER BY COALESCE(start_time, \'99:99\'), sort_order, id').all(req.user.id, date);
  res.json({ schedules: rows });
});

// === D1 动作式路由别名（适配 Cloudflare Functions 风格，让 Express 本地开发也能跑 pages-d1 client）===
// list
router.post('/list', (req, res) => {
  const { date, from, to } = req.body || {};
  if (from && to) {
    const rows = db.prepare(`
      SELECT * FROM schedules WHERE user_id = ? AND date >= ? AND date <= ?
      ORDER BY date, COALESCE(start_time, '99:99'), sort_order, id
    `).all(req.user.id, from, to);
    return res.json({ schedules: rows });
  }
  if (date) {
    const rows = db.prepare(`
      SELECT * FROM schedules WHERE user_id = ? AND date = ?
      ORDER BY COALESCE(start_time, '99:99'), sort_order, id
    `).all(req.user.id, date);
    return res.json({ schedules: rows });
  }
  const rows = db.prepare(`SELECT * FROM schedules WHERE user_id = ? ORDER BY date DESC, id DESC LIMIT 200`).all(req.user.id);
  res.json({ schedules: rows });
});

// create（D1 格式：返回 schedule + id，兼容两种 client）
router.post('/create', (req, res) => {
  const body = req.body || {};
  const { title, date, start_date, end_date, start_time, end_time, duration_min, is_key, category, sort_order, note } = body;
  // 兼容 start_date 或 date 字段
  const finalDate = date || start_date;
  if (!title || !finalDate) return res.status(400).json({ error: '标题与日期必填' });
  const cat = category === undefined ? null : Number(category);
  const syncIsKey = cat === null ? (is_key ? 1 : 0) : deriveIsKey(cat);
  const finalCat = cat === null ? (syncIsKey ? 2 : 3) : cat;
  const info = db.prepare(`
    INSERT INTO schedules (user_id, title, date, start_time, end_time, duration_min, is_key, category, sort_order, note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.user.id, title, finalDate, start_time || null, end_time || null, duration_min || null, syncIsKey, finalCat, sort_order || 0, note || null);
  const row = db.prepare('SELECT * FROM schedules WHERE id = ?').get(info.lastInsertRowid);
  res.json({ schedule: row, id: row.id });
});

// update（D1 格式：body 里带 id 字段）
router.post('/update', (req, res) => {
  const body = req.body || {};
  const id = Number(body.id);
  if (!id) return res.status(400).json({ error: 'id 必填' });
  const cur = db.prepare('SELECT * FROM schedules WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!cur) return res.status(404).json({ error: '日程不存在' });
  const { title, date, start_date, end_date, start_time, end_time, duration_min, is_key, category, is_done, sort_order, note } = body;
  const finalDate = date || start_date || null;
  const cat = category === undefined ? null : Number(category);
  const newIsKey = cat === null
    ? (is_key === undefined ? null : (is_key ? 1 : 0))
    : deriveIsKey(cat);
  const newCat = cat;
  db.prepare(`
    UPDATE schedules SET
      title = COALESCE(?, title),
      date = COALESCE(?, date),
      start_time = COALESCE(?, start_time),
      end_time = COALESCE(?, end_time),
      duration_min = COALESCE(?, duration_min),
      is_key = COALESCE(?, is_key),
      category = COALESCE(?, category),
      is_done = COALESCE(?, is_done),
      sort_order = COALESCE(?, sort_order),
      note = COALESCE(?, note)
    WHERE id = ? AND user_id = ?
  `).run(
    title ?? null, finalDate, start_time ?? null, end_time ?? null, duration_min ?? null,
    newIsKey, newCat,
    is_done === undefined ? null : (is_done ? 1 : 0),
    sort_order ?? null, note ?? null,
    id, req.user.id
  );
  const row = db.prepare('SELECT * FROM schedules WHERE id = ?').get(id);
  res.json({ schedule: row });
});

// remove（D1 格式：body 里带 id）
router.post('/remove', (req, res) => {
  const id = Number((req.body || {}).id);
  if (!id) return res.status(400).json({ error: 'id 必填' });
  const info = db.prepare('DELETE FROM schedules WHERE id = ? AND user_id = ?').run(id, req.user.id);
  if (info.changes === 0) return res.status(404).json({ error: '日程不存在' });
  res.json({ ok: true });
});

export default router;
