// ============================================================
// /api/plants/* 植物花架 CRUD（Cloudflare Pages Functions · D1 + R2）
//   图片以 base64 data URL 存 D1 plants.image 列；
//   生产环境如需 R2 大图存储，可扩展 POST /upload 走 multipart → R2
// ============================================================
import { json, uid } from '../core.js';

const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);
const MAX_IMAGE_SIZE = 2 * 1024 * 1024;

export async function ensurePlantsTable(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS plants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      name TEXT DEFAULT '',
      image TEXT,
      pos_x REAL DEFAULT 50,
      pos_y REAL DEFAULT 50,
      z_index INTEGER DEFAULT 0,
      planted_at TEXT,
      traits TEXT DEFAULT '',
      care_method TEXT DEFAULT '',
      water_cycle_days INTEGER DEFAULT 7,
      last_watered TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_plants_user ON plants(user_id)`).run();
}

export async function handlePlantsList(env, qOrBody) {
  await ensurePlantsTable(env);
  const r = await env.DB.prepare(
    'SELECT * FROM plants WHERE user_id = ? ORDER BY z_index ASC, created_at ASC'
  ).bind(uid(env)).all();
  return json({ plants: r.results || [] });
}

export async function handlePlantsCreate(env, body) {
  await ensurePlantsTable(env);
  const { name, image, pos_x, pos_y, z_index, planted_at, traits, care_method, water_cycle_days, last_watered } = body;
  if (!image) return json({ error: '缺少植物图片' }, 400);

  const r = await env.DB.prepare(
    `INSERT INTO plants (user_id, name, image, pos_x, pos_y, z_index, planted_at, traits, care_method, water_cycle_days, last_watered)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    uid(env),
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
  ).run();

  const plant = await env.DB.prepare('SELECT * FROM plants WHERE id = ?').bind(r.meta.last_row_id).first();
  return json({ plant });
}

export async function handlePlantsUpdate(env, body) {
  await ensurePlantsTable(env);
  const { id, name, image, pos_x, pos_y, z_index, planted_at, traits, care_method, water_cycle_days, last_watered } = body;
  const existing = await env.DB.prepare('SELECT * FROM plants WHERE id = ? AND user_id = ?').bind(id, uid(env)).first();
  if (!existing) return json({ error: '植物不存在' }, 404);

  const fields = ['name','image','pos_x','pos_y','z_index','planted_at','traits','care_method','water_cycle_days','last_watered'];
  const updates = [];
  const values = [];
  for (const f of fields) {
    if (body[f] !== undefined) { updates.push(`${f} = ?`); values.push(body[f]); }
  }
  if (updates.length === 0) return json({ plant: existing });
  values.push(id, uid(env));
  await env.DB.prepare(`UPDATE plants SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`).bind(...values).run();
  const plant = await env.DB.prepare('SELECT * FROM plants WHERE id = ?').bind(id).first();
  return json({ plant });
}

export async function handlePlantsRemove(env, body) {
  await ensurePlantsTable(env);
  const { id } = body;
  const existing = await env.DB.prepare('SELECT * FROM plants WHERE id = ? AND user_id = ?').bind(id, uid(env)).first();
  if (!existing) return json({ error: '植物不存在' }, 404);
  await env.DB.prepare('DELETE FROM plants WHERE id = ? AND user_id = ?').bind(id, uid(env)).run();
  return json({ ok: true });
}

export async function handlePlantsUpload(env, body) {
  const { file } = body;
  if (!file || typeof file !== 'string' || !file.startsWith('data:')) {
    return json({ error: '缺少图片数据' }, 400);
  }
  const mimeMatch = file.match(/^data:(image\/\w+);/);
  if (!mimeMatch || !ALLOWED_IMAGE_TYPES.has(mimeMatch[1])) {
    return json({ error: '不支持的图片格式（请用 PNG/JPG/WebP）' }, 400);
  }
  if (file.length > MAX_IMAGE_SIZE * 1.4) {
    return json({ error: '图片过大（上限 2MB），请压缩后重试' }, 400);
  }
  return json({ image: file });
}
