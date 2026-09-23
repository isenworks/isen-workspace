// ============================================================
// /api/plants/* 植物花架 CRUD（Cloudflare Pages Functions · D1）
//   图片以 base64 data URL 存 D1 plants.image 列（≤2MB）
// ============================================================
import { json, uid } from '../core.js';

const MAX_IMAGE_SIZE = 2 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = /^data:image\/(png|jpeg|jpg|webp);base64,/;

export async function ensurePlantsTable(env) {
  try {
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
    try {
      await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_plants_user ON plants(user_id)`).run();
    } catch { /* ignore */ }
  } catch (e) {
    // 忽略表创建错误（可能并发）
  }
}

function clampPos(x, fallback = 50) {
  const n = Number(x);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, n));
}

function safeStr(v, fallback = '') {
  if (v === undefined || v === null) return fallback;
  return String(v).slice(0, 500);
}

export async function handlePlantsList(env, qOrBody) {
  await ensurePlantsTable(env);
  const r = await env.DB.prepare(
    'SELECT * FROM plants WHERE user_id = ? ORDER BY z_index ASC, id ASC'
  ).bind(uid(env)).all();
  return json({ plants: r.results || [] });
}

export async function handlePlantsCreate(env, body) {
  await ensurePlantsTable(env);
  const b = body || {};
  const image = b.image;
  if (!image || typeof image !== 'string' || !image.startsWith('data:image/')) {
    return json({ error: '缺少有效图片' }, 400);
  }
  if (image.length > MAX_IMAGE_SIZE * 1.5) {
    return json({ error: '图片过大（上限 2MB）' }, 400);
  }

  const nowISO = new Date().toISOString().slice(0, 10);
  const z = b.z_index ?? (Date.now() % 100000);

  const r = await env.DB.prepare(
    `INSERT INTO plants (user_id, name, image, pos_x, pos_y, z_index, planted_at, traits, care_method, water_cycle_days, last_watered)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    uid(env),
    safeStr(b.name, '新植物'),
    image,
    clampPos(b.pos_x, 50),
    clampPos(b.pos_y, 30),
    Number(z) || 0,
    safeStr(b.planted_at, nowISO) || nowISO,
    safeStr(b.traits, ''),
    safeStr(b.care_method, ''),
    Number(b.water_cycle_days) || 7,
    b.last_watered ? safeStr(b.last_watered) : null,
  ).run();

  const id = r.meta?.last_row_id;
  const plant = await env.DB.prepare('SELECT * FROM plants WHERE id = ?').bind(id).first();
  return json({ plant });
}

export async function handlePlantsUpdate(env, body) {
  await ensurePlantsTable(env);
  const b = body || {};
  if (!b.id) return json({ error: '缺少 id' }, 400);

  const existing = await env.DB.prepare('SELECT * FROM plants WHERE id = ? AND user_id = ?').bind(b.id, uid(env)).first();
  if (!existing) return json({ error: '植物不存在' }, 404);

  const sets = [];
  const vals = [];
  const push = (col, v, transform) => {
    if (v !== undefined) { sets.push(col); vals.push(transform ? transform(v) : v); }
  };
  push('name', b.name, v => safeStr(v, ''));
  push('image', b.image);
  push('pos_x', b.pos_x, v => clampPos(v));
  push('pos_y', b.pos_y, v => clampPos(v));
  push('z_index', b.z_index, v => Number(v) || 0);
  push('planted_at', b.planted_at, v => safeStr(v));
  push('traits', b.traits, v => safeStr(v));
  push('care_method', b.care_method, v => safeStr(v));
  push('water_cycle_days', b.water_cycle_days, v => Number(v) || 7);
  push('last_watered', b.last_watered, v => v ? safeStr(v) : null);

  if (sets.length === 0) return json({ plant: existing });

  vals.push(b.id, uid(env));
  await env.DB.prepare(`UPDATE plants SET ${sets.map(c => c + '=?').join(',')} WHERE id = ? AND user_id = ?`).bind(...vals).run();

  const plant = await env.DB.prepare('SELECT * FROM plants WHERE id = ?').bind(b.id).first();
  return json({ plant });
}

export async function handlePlantsRemove(env, body) {
  await ensurePlantsTable(env);
  const id = (body || {}).id;
  if (!id) return json({ error: '缺少 id' }, 400);

  await env.DB.prepare('DELETE FROM plants WHERE id = ? AND user_id = ?').bind(id, uid(env)).run();
  return json({ ok: true });
}

export async function handlePlantsUpload(env, body) {
  // 仅做校验：返回校验后的 dataURL 原样（前端也可以直接 create，不需要走 upload）
  const b = body || {};
  const file = b.file;
  if (!file || typeof file !== 'string' || !file.startsWith('data:')) {
    return json({ error: '缺少图片数据' }, 400);
  }
  if (!ALLOWED_IMAGE_TYPES.test(file)) {
    return json({ error: '不支持的图片格式（请用 PNG/JPG/WebP）' }, 400);
  }
  if (file.length > MAX_IMAGE_SIZE * 1.5) {
    return json({ error: '图片过大（上限 2MB）' }, 400);
  }
  return json({ image: file });
}
