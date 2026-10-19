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

// ============================================================
// 养护记录（plant_care_logs）+ 记录照片（plant_care_photos）
//   分工：日志是「事实来源」；plants.last_watered / last_fertilized 降级为
//   「同类记录里最新一条」的派生缓存 —— 写入 / 改期 / 删除后按 MAX 重算。
//   列表只回照片 id（不含图片本体），图片走 /plants/carePhoto 单独拉取，
//   与 plants 的 list / image 拆分同源：时间轴再长，列表响应也只是几十 KB。
// ============================================================

const CARE_KINDS = ['water', 'fertilize', 'spray', 'photo', 'prune', 'repot'];
const MAX_LOG_PHOTOS = 9;

let _careTablesReady = false;

export async function ensurePlantCareTables(env) {
  if (_careTablesReady) return;
  try {
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS plant_care_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        plant_id INTEGER NOT NULL,
        kind TEXT NOT NULL,
        happened_at TEXT NOT NULL,
        note TEXT DEFAULT '',
        photos TEXT,
        created_at INTEGER
      )
    `).run();
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS plant_care_photos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        log_id INTEGER NOT NULL,
        image TEXT,
        ver INTEGER DEFAULT 0,
        created_at INTEGER
      )
    `).run();
    try {
      await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_care_logs ON plant_care_logs(user_id, plant_id, kind, happened_at)`).run();
    } catch { /* ignore */ }
    try {
      await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_care_photos ON plant_care_photos(user_id, log_id)`).run();
    } catch { /* ignore */ }
    _careTablesReady = true;
  } catch { /* 并发建表 */ }
}

// 统一成 'YYYY-MM-DD HH:mm'（同格式才能直接字符串排序）；缺时间补 00:00，非法值回落到现在
function normHappenedAt(v) {
  const m = String(v == null ? '' : v).trim().match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}))?/);
  if (m) return `${m[1]} ${m[2] || '00:00'}`;
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function shapeLog(row) {
  if (!row) return null;
  let photos = [];
  try { photos = row.photos ? JSON.parse(row.photos) : []; } catch { photos = []; }
  if (!Array.isArray(photos)) photos = [];
  return {
    id: row.id,
    plant_id: row.plant_id,
    kind: row.kind,
    happened_at: row.happened_at || '',
    note: row.note || '',
    photos: photos.map(String),
    created_at: row.created_at || 0,
  };
}

// 派生缓存重算：把 last_watered / last_fertilized 拉回「同类记录里最新的一条」
async function syncLastFor(env, plantId, kind) {
  const col = kind === 'water' ? 'last_watered' : kind === 'fertilize' ? 'last_fertilized' : null;
  if (!col) return;
  const r = await env.DB.prepare(
    `SELECT MAX(substr(happened_at, 1, 10)) AS d FROM plant_care_logs
     WHERE user_id = ? AND plant_id = ? AND kind = ?`
  ).bind(uid(env), plantId, kind).first();
  await env.DB.prepare(`UPDATE plants SET ${col} = ? WHERE id = ? AND user_id = ?`)
    .bind(r && r.d ? r.d : null, plantId, uid(env)).run();
}

async function assertPlant(env, plantId) {
  return env.DB.prepare('SELECT id FROM plants WHERE id = ? AND user_id = ?').bind(plantId, uid(env)).first();
}

// 老数据回填：这株还没有任何记录、但 plants 里已有「上次浇水/施肥」时，
// 各补一条，免得时间轴一进来是空的（备注明说是补全而来，不冒充真实记录）
async function backfillLogsIfEmpty(env, plantId) {
  const cnt = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM plant_care_logs WHERE user_id = ? AND plant_id = ?'
  ).bind(uid(env), plantId).first();
  if (cnt && Number(cnt.n) > 0) return;
  const p = await env.DB.prepare(
    'SELECT last_watered, last_fertilized FROM plants WHERE id = ? AND user_id = ?'
  ).bind(plantId, uid(env)).first();
  if (!p) return;
  const seed = [];
  if (p.last_watered) seed.push(['water', p.last_watered]);
  if (p.last_fertilized) seed.push(['fertilize', p.last_fertilized]);
  for (const [kind, date] of seed) {
    await env.DB.prepare(
      `INSERT INTO plant_care_logs (user_id, plant_id, kind, happened_at, note, photos, created_at)
       VALUES (?, ?, ?, ?, ?, NULL, ?)`
    ).bind(uid(env), plantId, kind, normHappenedAt(date), '由「上次浇水 / 施肥」自动补全', Date.now()).run();
  }
}

// 写入记录附带的照片：逐张落 plant_care_photos，日志里只存 id
async function insertPhotos(env, logId, list) {
  const ids = [];
  for (const dataUrl of list) {
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) continue;
    if (dataUrl.length > MAX_IMAGE_SIZE * 1.5) continue;
    const r = await env.DB.prepare(
      `INSERT INTO plant_care_photos (user_id, log_id, image, ver, created_at) VALUES (?, ?, ?, 0, ?)`
    ).bind(uid(env), logId, dataUrl, Date.now()).run();
    if (r.meta?.last_row_id) ids.push(r.meta.last_row_id);
  }
  return ids;
}

// 时间轴列表：默认倒序；kind 可选筛选（浇水 / 施肥…）
export async function handleCareLogsList(env, qOrBody) {
  await ensurePlantCareTables(env);
  const q = qOrBody || {};
  const plantId = Number(q.plant_id);
  if (!plantId) return json({ error: '缺少 plant_id' }, 400);
  if (!(await assertPlant(env, plantId))) return json({ error: '植物不存在' }, 404);
  await backfillLogsIfEmpty(env, plantId);

  const kind = CARE_KINDS.includes(q.kind) ? q.kind : null;
  const limit = Math.max(1, Math.min(Number(q.limit) || 100, 300));
  const sql = `SELECT * FROM plant_care_logs WHERE user_id = ? AND plant_id = ?${kind ? ' AND kind = ?' : ''}
               ORDER BY happened_at DESC, id DESC LIMIT ?`;
  const stmt = kind
    ? env.DB.prepare(sql).bind(uid(env), plantId, kind, limit)
    : env.DB.prepare(sql).bind(uid(env), plantId, limit);
  const r = await stmt.all();
  return json({ logs: (r.results || []).map(shapeLog) });
}

// 新增一条记录（打卡 = 记一条 + 派生缓存跟着走；补录就是 happened_at 填过去的日期）
export async function handleCareLogCreate(env, body) {
  await ensurePlantCareTables(env);
  const b = body || {};
  const plantId = Number(b.plant_id);
  const kind = String(b.kind || '');
  if (!plantId) return json({ error: '缺少 plant_id' }, 400);
  if (!CARE_KINDS.includes(kind)) return json({ error: '不支持的动作类型' }, 400);
  if (!(await assertPlant(env, plantId))) return json({ error: '植物不存在' }, 404);

  const when = normHappenedAt(b.happened_at);
  const photos = Array.isArray(b.photos) ? b.photos.slice(0, MAX_LOG_PHOTOS) : [];
  const r = await env.DB.prepare(
    `INSERT INTO plant_care_logs (user_id, plant_id, kind, happened_at, note, photos, created_at)
     VALUES (?, ?, ?, ?, ?, NULL, ?)`
  ).bind(uid(env), plantId, kind, when, safeStr(b.note, ''), Date.now()).run();

  const logId = r.meta?.last_row_id;
  const photoIds = photos.length ? await insertPhotos(env, logId, photos) : [];
  if (photoIds.length) {
    await env.DB.prepare('UPDATE plant_care_logs SET photos = ? WHERE id = ? AND user_id = ?')
      .bind(JSON.stringify(photoIds), logId, uid(env)).run();
  }
  await syncLastFor(env, plantId, kind);

  const row = await env.DB.prepare('SELECT * FROM plant_care_logs WHERE id = ?').bind(logId).first();
  const plant = await env.DB.prepare('SELECT * FROM plants WHERE id = ?').bind(plantId).first();
  return json({ log: shapeLog(row), plant });
}

// 修改一条记录：备注 / 发生时间（改了时间要重算派生缓存）；照片用追加与删除两种操作
export async function handleCareLogUpdate(env, body) {
  await ensurePlantCareTables(env);
  const b = body || {};
  const id = Number(b.id);
  if (!id) return json({ error: '缺少 id' }, 400);
  const existing = await env.DB.prepare(
    'SELECT * FROM plant_care_logs WHERE id = ? AND user_id = ?'
  ).bind(id, uid(env)).first();
  if (!existing) return json({ error: '记录不存在' }, 404);

  const sets = [];
  const vals = [];
  if (b.note !== undefined) { sets.push('note'); vals.push(safeStr(b.note, '')); }
  if (b.happened_at !== undefined) { sets.push('happened_at'); vals.push(normHappenedAt(b.happened_at)); }

  // 追加照片
  if (Array.isArray(b.add_photos) && b.add_photos.length) {
    const cur = shapeLog(existing).photos;
    const room = Math.max(0, MAX_LOG_PHOTOS - cur.length);
    const added = room ? await insertPhotos(env, id, b.add_photos.slice(0, room)) : [];
    if (added.length) { sets.push('photos'); vals.push(JSON.stringify(cur.concat(added))); }
  }
  // 删除照片（按 id）
  if (Array.isArray(b.remove_photo_ids) && b.remove_photo_ids.length) {
    const kill = b.remove_photo_ids.map(Number).filter(Boolean);
    if (kill.length) {
      const marks = kill.map(() => '?').join(',');
      await env.DB.prepare(
        `DELETE FROM plant_care_photos WHERE user_id = ? AND log_id = ? AND id IN (${marks})`
      ).bind(uid(env), id, ...kill).run();
      const kept = shapeLog(existing).photos.filter((p) => !kill.includes(Number(p)));
      sets.push('photos'); vals.push(kept.length ? JSON.stringify(kept) : null);
    }
  }

  if (sets.length) {
    vals.push(id, uid(env));
    await env.DB.prepare(`UPDATE plant_care_logs SET ${sets.map((c) => c + '=?').join(',')} WHERE id = ? AND user_id = ?`)
      .bind(...vals).run();
    if (b.happened_at !== undefined) await syncLastFor(env, existing.plant_id, existing.kind);
  }

  const row = await env.DB.prepare('SELECT * FROM plant_care_logs WHERE id = ?').bind(id).first();
  return json({ log: shapeLog(row) });
}

// 删除一条记录：连照片一起清，并按剩下的记录重算派生缓存
export async function handleCareLogRemove(env, body) {
  await ensurePlantCareTables(env);
  const id = Number((body || {}).id);
  if (!id) return json({ error: '缺少 id' }, 400);
  const existing = await env.DB.prepare(
    'SELECT * FROM plant_care_logs WHERE id = ? AND user_id = ?'
  ).bind(id, uid(env)).first();
  if (!existing) return json({ ok: true });

  await env.DB.prepare('DELETE FROM plant_care_photos WHERE user_id = ? AND log_id = ?').bind(uid(env), id).run();
  await env.DB.prepare('DELETE FROM plant_care_logs WHERE id = ? AND user_id = ?').bind(id, uid(env)).run();
  await syncLastFor(env, existing.plant_id, existing.kind);

  const plant = await env.DB.prepare('SELECT * FROM plants WHERE id = ?').bind(existing.plant_id).first();
  return json({ ok: true, plant });
}

// 单张记录照片：按 id 拉取，与 plants/image 同构（URL 带 ver，可长缓存）
export async function handleCarePhoto(env, qOrBody) {
  await ensurePlantCareTables(env);
  const id = Number((qOrBody || {}).id);
  if (!id) return json({ error: '缺少 id' }, 400);
  const r = await env.DB.prepare(
    'SELECT image, COALESCE(ver, 0) AS ver FROM plant_care_photos WHERE id = ? AND user_id = ?'
  ).bind(id, uid(env)).first();
  if (!r) return json({ error: '照片不存在' }, 404);
  return json({ id, image: r.image || null, ver: r.ver || 0 }, 200, {
    'Cache-Control': 'private, max-age=604800',
  });
}
