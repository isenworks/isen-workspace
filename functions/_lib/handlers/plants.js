// ============================================================
// /api/plants/* 植物花架 CRUD（Cloudflare Pages Functions · D1）
//   图片以 base64 data URL 存 D1 plants.image 列（≤2MB）
//   性能：list 不返回 image（只回 has_image 标记），图片走 /plants/image 单独拉取
//   并带 Cache-Control（URL 含 image_ver 版本号，图片变了 URL 变，可安全长缓存）
// ============================================================
import { json, uid } from '../core.js';

const MAX_IMAGE_SIZE = 2 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = /^data:image\/(png|jpeg|jpg|webp);base64,/;

// 懒迁移完成标记（Worker isolate 内复用，避免每次请求都跑 5-6 条 DDL 往返）
let _plantsTableReady = false;

export async function ensurePlantsTable(env) {
  if (_plantsTableReady) return;
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
        fert_cycle_days INTEGER DEFAULT 30,
        last_fertilized TEXT,
        size REAL DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `).run();
    // 旧表迁移：补施肥两列 + 缩放系数（并发容错，已存在则忽略报错）
    try {
      await env.DB.prepare(`ALTER TABLE plants ADD COLUMN fert_cycle_days INTEGER DEFAULT 30`).run();
    } catch { /* 列已存在 */ }
    try {
      await env.DB.prepare(`ALTER TABLE plants ADD COLUMN last_fertilized TEXT`).run();
    } catch { /* 列已存在 */ }
    try {
      await env.DB.prepare(`ALTER TABLE plants ADD COLUMN size REAL DEFAULT 1`).run();
    } catch { /* 列已存在 */ }
    try {
      await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_plants_user ON plants(user_id)`).run();
    } catch { /* ignore */ }
    // 图片版本号（图片更新时 +1，前端把它拼进 /plants/image URL 做缓存键）
    try {
      await env.DB.prepare(`ALTER TABLE plants ADD COLUMN image_ver INTEGER DEFAULT 0`).run();
    } catch { /* 列已存在 */ }
    _plantsTableReady = true;
  } catch (e) {
    // 忽略表创建错误（可能并发）
  }
}

function clampPos(x, fallback = 50) {
  const n = Number(x);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, n));
}

function clampSize(v, fallback = 1) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.max(0.4, Math.min(2.5, n));
}

function safeStr(v, fallback = '') {
  if (v === undefined || v === null) return fallback;
  return String(v).slice(0, 500);
}

// 列表只回元数据（不含 image 大字段，响应从数 MB 降到几 KB，花架秒开）
export async function handlePlantsList(env, qOrBody) {
  await ensurePlantsTable(env);
  const r = await env.DB.prepare(
    `SELECT id, name, pos_x, pos_y, z_index, planted_at, traits, care_method,
            water_cycle_days, last_watered, fert_cycle_days, last_fertilized, size,
            COALESCE(image_ver, 0) AS image_ver, (image IS NOT NULL) AS has_image
     FROM plants WHERE user_id = ? ORDER BY z_index ASC, id ASC`
  ).bind(uid(env)).all();
  return json({ plants: r.results || [] });
}

// 单株图片：前端按 id+image_ver 拼 URL 拉取；图片只有更新时 ver 才变 → URL 变 → 可长缓存
export async function handlePlantsImage(env, qOrBody) {
  await ensurePlantsTable(env);
  const q = qOrBody || {};
  const id = Number(q.id);
  if (!id) return json({ error: '缺少 id' }, 400);
  const r = await env.DB.prepare(
    'SELECT image, COALESCE(image_ver, 0) AS image_ver FROM plants WHERE id = ? AND user_id = ?'
  ).bind(id, uid(env)).first();
  if (!r) return json({ error: '植物不存在' }, 404);
  return json({ id, image: r.image || null, image_ver: r.image_ver || 0 }, 200, {
    'Cache-Control': 'private, max-age=604800', // 7 天（URL 含版本号，内容变即换 URL）
  });
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
    `INSERT INTO plants (user_id, name, image, pos_x, pos_y, z_index, planted_at, traits, care_method, water_cycle_days, last_watered, fert_cycle_days, last_fertilized, size)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
    Number(b.fert_cycle_days) || 30,
    b.last_fertilized ? safeStr(b.last_fertilized) : null,
    clampSize(b.size, 1),
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
  // 图片变更 → 版本号 +1（前端图片 URL 随之改变，缓存自动失效）
  if (b.image !== undefined) { sets.push('image_ver'); vals.push((existing.image_ver || 0) + 1); }
  push('pos_x', b.pos_x, v => clampPos(v));
  push('pos_y', b.pos_y, v => clampPos(v));
  push('z_index', b.z_index, v => Number(v) || 0);
  push('planted_at', b.planted_at, v => safeStr(v));
  push('traits', b.traits, v => safeStr(v));
  push('care_method', b.care_method, v => safeStr(v));
  push('water_cycle_days', b.water_cycle_days, v => Number(v) || 7);
  push('last_watered', b.last_watered, v => v ? safeStr(v) : null);
  push('fert_cycle_days', b.fert_cycle_days, v => Number(v) || 30);
  push('last_fertilized', b.last_fertilized, v => v ? safeStr(v) : null);
  push('size', b.size, v => clampSize(v));

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
