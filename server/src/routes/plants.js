// ============================================================
// /api/plants/* 植物花架 CRUD
//   图片以 base64 data URL 存 SQLite（与 avatar 同策略，生产环境可接 R2）
// ============================================================
import { Router } from 'express';
import { db } from '../db.js';

const router = Router();

const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);
const MAX_IMAGE_SIZE = 2 * 1024 * 1024; // 2MB

// GET /list  → { plants: [...] }
router.post('/list', (req, res) => {
  const plants = db.prepare(
    'SELECT * FROM plants WHERE user_id = ? ORDER BY z_index ASC, created_at ASC'
  ).all(req.user.id);
  res.json({ plants });
});

router.get('/list', (req, res) => {
  const plants = db.prepare(
    'SELECT * FROM plants WHERE user_id = ? ORDER BY z_index ASC, created_at ASC'
  ).all(req.user.id);
  res.json({ plants });
});

// POST /create  → { plant }
router.post('/create', (req, res) => {
  const { name, image, pos_x, pos_y, z_index, planted_at, traits, care_method, water_cycle_days, last_watered } = req.body;
  if (!image) return res.status(400).json({ error: '缺少植物图片' });

  const info = db.prepare(
    `INSERT INTO plants (user_id, name, image, pos_x, pos_y, z_index, planted_at, traits, care_method, water_cycle_days, last_watered)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    req.user.id,
    (name || '').trim(),
    image,
    pos_x ?? 50,
    pos_y ?? 50,
    z_index ?? Date.now() % 100000,
    planted_at || new Date().toISOString().slice(0, 10),
    (traits || '').trim(),
    (care_method || '').trim(),
    water_cycle_days || 7,
    last_watered || null
  );
  const plant = db.prepare('SELECT * FROM plants WHERE id = ?').get(info.lastInsertRowid);
  res.json({ plant });
});

// POST /update  → { plant }
router.post('/update', (req, res) => {
  const { id, name, image, pos_x, pos_y, z_index, planted_at, traits, care_method, water_cycle_days, last_watered } = req.body;
  const existing = db.prepare('SELECT * FROM plants WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!existing) return res.status(404).json({ error: '植物不存在' });

  const updates = {};
  if (name !== undefined) updates.name = name;
  if (image !== undefined) updates.image = image;
  if (pos_x !== undefined) updates.pos_x = pos_x;
  if (pos_y !== undefined) updates.pos_y = pos_y;
  if (z_index !== undefined) updates.z_index = z_index;
  if (planted_at !== undefined) updates.planted_at = planted_at;
  if (traits !== undefined) updates.traits = traits;
  if (care_method !== undefined) updates.care_method = care_method;
  if (water_cycle_days !== undefined) updates.water_cycle_days = water_cycle_days;
  if (last_watered !== undefined) updates.last_watered = last_watered;

  const fields = Object.keys(updates);
  if (fields.length === 0) return res.json({ plant: existing });

  const setClause = fields.map(f => `${f} = ?`).join(', ');
  db.prepare(`UPDATE plants SET ${setClause} WHERE id = ? AND user_id = ?`)
    .run(...fields.map(f => updates[f]), id, req.user.id);

  const plant = db.prepare('SELECT * FROM plants WHERE id = ?').get(id);
  res.json({ plant });
});

// POST /remove  → { ok: true }
router.post('/remove', (req, res) => {
  const { id } = req.body;
  const existing = db.prepare('SELECT * FROM plants WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!existing) return res.status(404).json({ error: '植物不存在' });
  db.prepare('DELETE FROM plants WHERE id = ? AND user_id = ?').run(id, req.user.id);
  res.json({ ok: true });
});

// POST /upload  — 接收 base64 data URL，校验后原样返回（前端自行存入 plant.image）
//   body: { file: dataURL }  → { image: dataURL }
router.post('/upload', (req, res) => {
  const { file } = req.body;
  if (!file || typeof file !== 'string' || !file.startsWith('data:')) {
    return res.status(400).json({ error: '缺少图片数据' });
  }
  // 校验 MIME type
  const mimeMatch = file.match(/^data:(image\/\w+);/);
  if (!mimeMatch || !ALLOWED_IMAGE_TYPES.has(mimeMatch[1])) {
    return res.status(400).json({ error: '不支持的图片格式（请用 PNG/JPG/WebP）' });
  }
  // 校验大小（base64 约膨胀 1.37x）
  if (file.length > MAX_IMAGE_SIZE * 1.4) {
    return res.status(400).json({ error: '图片过大（上限 2MB），请压缩后重试' });
  }
  res.json({ image: file });
});

export default router;
