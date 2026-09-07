// ============================================================
// 共享基础设施：通用工具 + 鉴权 + 数据库访问 + 表懒迁移
//   被 functions/api/[[route]].js 与所有 _lib/handlers/* 引用
// ============================================================

// 农历库（lunar-javascript，vendored UMD）
import lunarLib from '../lib/lunar.js';

// ------------------------------------------------------------
// 常量
// ------------------------------------------------------------
// 单人用户 ID（兼容老部署 env.USER_ID 缺省时的兜底）
export const DEFAULT_USER_ID = '50f12e1e-d561-423e-a424-d07a21d00cf2';
export const PBKDF2_ITER = 100000;
export const PBKDF2_PREFIX = '$pbkdf2-sha256$';

// 简单邮箱格式校验
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 日期格式正则（YYYY-MM-DD）
export const ISO_DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

// 通用"邮箱或密码错误"（防用户枚举）
export const AUTH_FAIL = { error: '邮箱或密码错误', code: 'AUTH_FAIL' };

// 重复事项规则
export const REPEAT_RULES = ['daily', 'weekly', 'monthly', 'yearly', 'lunar-yearly'];

// 回收站 source_type → 业务表 映射
export const RECYCLE_TABLES = {
  task: 'ethan_tasks',
  schedule: 'ethan_schedules',
  habit: 'ethan_habits',
  fixedSchedule: 'ethan_fixed_schedules',
  summary: 'ethan_summaries',
  inbox: 'ethan_inbox',
};

// ------------------------------------------------------------
// Base64 URL-safe（无填充）
// ------------------------------------------------------------
export function ab2b64url(ab) {
  let s = '';
  const bytes = new Uint8Array(ab);
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return (typeof btoa !== 'undefined' ? btoa(s) : Buffer.from(bytes).toString('base64'))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
export function b64urlDecodeToArray(s) {
  let b = s.replace(/-/g, '+').replace(/_/g, '/');
  while (b.length % 4) b += '=';
  if (typeof atob !== 'undefined') {
    const t = atob(b);
    const arr = new Uint8Array(t.length);
    for (let i = 0; i < t.length; i++) arr[i] = t.charCodeAt(i);
    return arr;
  }
  return new Uint8Array(Buffer.from(b, 'base64'));
}
export function str2ab(s) {
  const arr = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) arr[i] = s.charCodeAt(i) & 0xff;
  return arr;
}
export function ab2hex(ab) {
  const a = new Uint8Array(ab);
  let s = '';
  for (let i = 0; i < a.length; i++) s += a[i].toString(16).padStart(2, '0');
  return s;
}
export function hex2ab(h) {
  const arr = new Uint8Array(Math.floor(h.length / 2));
  for (let i = 0; i < arr.length; i++) arr[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return arr;
}

// ------------------------------------------------------------
// HMAC-SHA256 token：<b64url(uid)>.<b64url(hmac(secret, uid))>
// ------------------------------------------------------------
export async function hmacSha256(secretStr, dataStr) {
  const enc = (s) => new TextEncoder().encode(s);
  const key = await crypto.subtle.importKey(
    'raw', enc(secretStr), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  return crypto.subtle.sign('HMAC', key, enc(dataStr));
}
export function getTokenSecret(env) {
  const s = env.HMAC_SECRET || env.WORKER_SECRET || null;
  if (s) return String(s).trim();
  // 降级（仅首次部署过渡用，风险可接受）
  const fallback = (env.REGISTER_INVITE_CODE || 'workspace-local') + '|' + (env.USER_ID || DEFAULT_USER_ID);
  return fallback;
}
export async function signToken(uid, env) {
  const secret = getTokenSecret(env);
  const uidPart = ab2b64url(str2ab(String(uid)));
  const sig = await hmacSha256(secret, String(uid));
  return uidPart + '.' + ab2b64url(sig);
}
export async function verifyToken(token, env) {
  if (!token || typeof token !== 'string') return null;
  const idx = token.lastIndexOf('.');
  if (idx <= 0) return null;
  const uidB64 = token.slice(0, idx);
  const sigB64 = token.slice(idx + 1);
  let uid;
  try { uid = new TextDecoder().decode(b64urlDecodeToArray(uidB64).buffer); }
  catch { return null; }
  const expectedSig = await hmacSha256(getTokenSecret(env), uid);
  const expected = ab2b64url(expectedSig);
  // 常量时间比较
  if (sigB64.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < sigB64.length; i++) diff |= sigB64.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0 ? String(uid) : null;
}

// ------------------------------------------------------------
// 密码哈希：PBKDF2-SHA256 格式 $pbkdf2-sha256$100000$<salt_hex>$<hash_hex>
// ------------------------------------------------------------
export async function hashPassword(password) {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const pwBytes = new TextEncoder().encode(String(password || ''));
  const keyMaterial = await crypto.subtle.importKey(
    'raw', pwBytes, 'PBKDF2', false, ['deriveBits']
  );
  const hashBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations: PBKDF2_ITER, hash: 'SHA-256' },
    keyMaterial, 256
  );
  const saltHex = ab2hex(saltBytes.buffer);
  const hashHex = ab2hex(hashBits);
  return `${PBKDF2_PREFIX}${PBKDF2_ITER}$${saltHex}$${hashHex}`;
}
export async function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string') return false;
  if (stored.startsWith(PBKDF2_PREFIX)) {
    const rest = stored.slice(PBKDF2_PREFIX.length);
    const parts = rest.split('$');
    if (parts.length !== 3) return false;
    const iter = parseInt(parts[0], 10);
    const saltHex = parts[1];
    const hashHex = parts[2];
    if (!iter || !saltHex || !hashHex) return false;
    const pwBytes = new TextEncoder().encode(String(password || ''));
    const saltArr = hex2ab(saltHex);
    const keyMaterial = await crypto.subtle.importKey(
      'raw', pwBytes, 'PBKDF2', false, ['deriveBits']
    );
    const gotBits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: saltArr.buffer, iterations: iter, hash: 'SHA-256' },
      keyMaterial, 256
    );
    const gotHex = ab2hex(gotBits);
    if (gotHex.length !== hashHex.length) return false;
    let diff = 0;
    for (let i = 0; i < gotHex.length; i++) diff |= gotHex.charCodeAt(i) ^ hashHex.charCodeAt(i);
    return diff === 0;
  }
  // 兼容：UNLOCK_PASSWORD 明文（单人模式遗留，如果部署者填明文就当明文对比）
  return stored === String(password || '');
}

// ------------------------------------------------------------
// 当前登录用户 ID 解析（从 X-Unlock-Token = HMAC token）
//   uid() 优先从挂载在 env 上的解析缓存取；onRequest 首次调用时写缓存
// ------------------------------------------------------------
export function uid(env) {
  if (env && env.__CURRENT_USER_ID__) return env.__CURRENT_USER_ID__;
  return env.USER_ID || DEFAULT_USER_ID;
}

// ------------------------------------------------------------
// 通用响应构造
// ------------------------------------------------------------
export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,X-Unlock-Token',
      ...headers,
    },
  });
}
export function nowIso() {
  return new Date().toISOString();
}

// 获取中国时区（UTC+8）的 YYYY-MM-DD 日期
export function getLocalDate(offsetDays = 0) {
  const d = new Date();
  const utc = d.getTime() + d.getTimezoneOffset() * 60000;
  const local = new Date(utc + 8 * 3600000); // UTC+8
  local.setDate(local.getDate() + offsetDays);
  return local.toISOString().slice(0, 10);
}

// 计算连续天数：logs 按 date 降序传入 [{ date, done }]
export function calcStreak(logs) {
  const doneDates = new Set(logs.filter((l) => l.done).map((l) => l.date));
  const today = getLocalDate(0);
  const yesterday = getLocalDate(-1);
  let cursor = doneDates.has(today) ? today : yesterday;
  let streak = 0;
  while (doneDates.has(cursor)) {
    streak++;
    const d = new Date(cursor);
    d.setDate(d.getDate() - 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    cursor = `${y}-${m}-${day}`;
  }
  return streak;
}

// 旧 checkUnlock 仅兼容（现在走 HMAC token 校验）
export function checkUnlock(env, token) {
  void env; void token;
  return true;
}

// ------------------------------------------------------------
// D1 批量执行辅助：把数组 bind，只返回结果
// ------------------------------------------------------------
export async function dbAll(db, sql, params = []) {
  return (await db.prepare(sql).bind(...params).all()).results;
}
export async function dbFirst(db, sql, params = []) {
  return (await db.prepare(sql).bind(...params).first()) || null;
}
export async function dbRun(db, sql, params = []) {
  return db.prepare(sql).bind(...params).run();
}

// 转 int：SQLite 有时把 0/1 返回 number，但统一成数字
export function toInt(v, dflt = 0) {
  if (v === null || v === undefined) return dflt;
  const n = Number(v);
  return Number.isNaN(n) ? dflt : Math.trunc(n);
}
export function toBoolInt(v) {
  return v ? 1 : 0;
}

// ------------------------------------------------------------
// 日期格式验证与规范化（date 字段为 TEXT，必须保证 ISO 格式）
// ------------------------------------------------------------
// 规范化日期：接受 '2026-7-1' / '2026/07/01' / '2026-07-01' 等格式，输出 '2026-07-01'
export function normalizeDate(input) {
  if (!input || typeof input !== 'string') return null;
  const s = input.trim();

  // 已经是合法 ISO 格式
  if (ISO_DATE_RE.test(s)) {
    const d = new Date(s);
    if (d.getFullYear() === Number(s.slice(0, 4)) &&
        d.getMonth() + 1 === Number(s.slice(5, 7)) &&
        d.getDate() === Number(s.slice(8, 10))) {
      return s;
    }
    return null;
  }

  // 尝试规范化：把 '/' 替换成 '-'
  let normalized = s.replace(/\//g, '-');
  const parts = normalized.split('-');
  if (parts.length === 3) {
    const y = parts[0];
    const m = parts[1].padStart(2, '0');
    const d = parts[2].padStart(2, '0');
    const candidate = `${y}-${m}-${d}`;
    if (ISO_DATE_RE.test(candidate)) {
      const dt = new Date(candidate);
      if (dt.getFullYear() === Number(y) &&
          dt.getMonth() + 1 === Number(m) &&
          dt.getDate() === Number(d)) {
        return candidate;
      }
    }
  }
  return null;
}
export function validateDate(input) {
  const normalized = normalizeDate(input);
  if (!normalized) {
    return { valid: false, error: `日期格式无效：${input}，必须为 YYYY-MM-DD 格式（如 2026-07-01）` };
  }
  return { valid: true, value: normalized };
}

// ------------------------------------------------------------
// 重复事项：repeat_rule 存在 master 行上（none/daily/weekly/monthly/yearly），
// 读取时按日期范围展开为虚拟实例；单次完成状态存 ethan_schedule_occurrences 例外表。
// ------------------------------------------------------------
export function addDaysISO(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
// 农历日期 key：月（闰月为负）+ 日。例 2026-09-07 → '7-26'
export function lunarKey(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const l = lunarLib.Solar.fromYmd(y, m, d).getLunar();
  return `${l.getMonth()}-${l.getDay()}`;
}
// 判断日期 d 是否匹配以 anchor 为锚点的重复规则（月/年重复对月末日期做钳制：31日→2月取28/29）
export function scheduleRepeatMatches(anchor, rule, d) {
  if (rule === 'daily') return true;
  const [ay, am, ad] = anchor.split('-').map(Number);
  const [, ym, yd] = d.split('-').map(Number);
  const yy = Number(d.slice(0, 4));
  if (rule === 'weekly') {
    return new Date(anchor + 'T00:00:00Z').getUTCDay() === new Date(d + 'T00:00:00Z').getUTCDay();
  }
  if (rule === 'monthly') {
    const dim = new Date(Date.UTC(yy, ym, 0)).getUTCDate();
    return yd === Math.min(ad, dim);
  }
  if (rule === 'yearly') {
    if (am === 2 && ad === 29) {
      const isLeap = (yy % 4 === 0 && yy % 100 !== 0) || yy % 400 === 0;
      return ym === 2 && yd === (isLeap ? 29 : 28);
    }
    return ym === am && yd === ad;
  }
  // 每年（农历）：农历月+日相同即命中（生日场景；闰月按同号正月对齐，与民间习惯一致）
  if (rule === 'lunar-yearly') {
    return lunarKey(anchor) === lunarKey(d);
  }
  return false;
}
export { lunarLib };

// ------------------------------------------------------------
// 安全用户返回（脱敏）
// ------------------------------------------------------------
export function safeUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    email: u.email,
    username: u.username || (u.email || '').split('@')[0],
    avatar: u.avatar || '',
    is_owner: !!u.is_owner,
    is_banned: !!u.is_banned,
  };
}

// ============================================================
// 表懒迁移：各 ensure*Table 都是幂等，任何请求都能触发
// ============================================================

// ethan_users：账号表（多用户体系 2026-09 新建）
//   注意：用户表是独立 TEXT id（UUID），与 ethan_* 业务表的 user_id 类型完全对齐
export async function ensureUsersTable(env) {
  try {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS ethan_users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      username TEXT,
      avatar TEXT,
      is_owner INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT
    ) WITHOUT ROWID`).run();
  } catch (_) {
    // 某些 SQLite 版本不支持 WITHOUT ROWID 再退化重试：纯 TEXT PK 也行
    try {
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS ethan_users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        username TEXT,
        avatar TEXT,
        is_owner INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT
      )`).run();
    } catch (_) {}
  }
  // is_banned 列迁移（多用户邀请码体系需要）
  try {
    const cols = await env.DB.prepare(`PRAGMA table_info(ethan_users)`).all();
    if (cols.results && !cols.results.some(c => c.name === 'is_banned')) {
      await env.DB.prepare(`ALTER TABLE ethan_users ADD COLUMN is_banned INTEGER NOT NULL DEFAULT 0`).run();
    }
    if (cols.results && !cols.results.some(c => c.name === 'last_login')) {
      await env.DB.prepare(`ALTER TABLE ethan_users ADD COLUMN last_login TEXT`).run();
    }
  } catch (_) {}

  // ethan_invite_codes 表（邀请码管理）
  try {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS ethan_invite_codes (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      created_by TEXT NOT NULL,
      used_by TEXT,
      used_at TEXT,
      is_disabled INTEGER NOT NULL DEFAULT 0,
      disabled_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`).run();
  } catch (_) {}
}

// ethan_user_settings 表辅助：确保表存在；KV 结构 (user_id, k, v, updated_at, version)
//   version 列：单调递增版本号，供 cloudKV 同步层做乐观并发与字段级合并
export async function ensureUserSettingsTable(env) {
  try {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS ethan_user_settings (
      user_id TEXT NOT NULL,
      k TEXT NOT NULL,
      v TEXT,
      updated_at TEXT,
      version INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, k)
    )`).run();
    // 老表迁移：补 version 列（CREATE TABLE IF NOT EXISTS 不会改既有表结构）
    try {
      await env.DB.prepare(`ALTER TABLE ethan_user_settings ADD COLUMN version INTEGER NOT NULL DEFAULT 0`).run();
    } catch (_) {}
  } catch (_) {}
}
// 返回纯字符串值（向后兼容：weread/cover handler 仍按字符串用）
export async function settingGet(env, k) {
  await ensureUserSettingsTable(env);
  const r = await dbFirst(env.DB, `SELECT v FROM ethan_user_settings WHERE user_id=? AND k=?`, [uid(env), k]);
  return r ? (r.v || '') : '';
}
// 返回 { v, version }：cloudKV 同步层用版本号追踪云端版本
export async function settingGetVersioned(env, k) {
  await ensureUserSettingsTable(env);
  const r = await dbFirst(env.DB, `SELECT v, version FROM ethan_user_settings WHERE user_id=? AND k=?`, [uid(env), k]);
  return r ? { v: r.v || '', version: r.version || 0 } : { v: '', version: 0 };
}
// 全量写入（LWW 兼容路径）：新行 version=1；既有行 version+=1。返回新版本号
export async function settingSet(env, k, v) {
  await ensureUserSettingsTable(env);
  await env.DB.prepare(`INSERT INTO ethan_user_settings(user_id,k,v,updated_at,version) VALUES(?,?,?,?,1)
    ON CONFLICT(user_id,k) DO UPDATE SET v=excluded.v, updated_at=excluded.updated_at, version=ethan_user_settings.version+1`)
    .bind(uid(env), String(k), String(v == null ? '' : v), nowIso()).run();
  const r = await dbFirst(env.DB, `SELECT version FROM ethan_user_settings WHERE user_id=? AND k=?`, [uid(env), String(k)]);
  return r ? (r.version || 0) : 0;
}
// 结构化字段级合并：partial = { fieldName: value, ... }
// 云端值形态（envelope）：{ __mv: <全局版本>, fields: { fieldName: { t: <ms 时间戳>, v: <任意值> } } }
// 后端用服务器时间戳逐字段与现存 fields 合并：incoming.t >= existing.t 则覆盖（避免假冲突）
// 多设备并发编辑不同字段不会互覆盖（如 A 改 habit_1、B 改 habit_2 → 两边都保留）
export async function settingMerge(env, k, partial) {
  await ensureUserSettingsTable(env);
  const cur = await settingGetVersioned(env, k);
  let envelope;
  try {
    const parsed = JSON.parse(cur.v || '{}');
    envelope = (parsed && parsed.__mv !== undefined && parsed.fields && typeof parsed.fields === 'object')
      ? parsed
      : { __mv: cur.version || 0, fields: {} };
  } catch { envelope = { __mv: cur.version || 0, fields: {} }; }
  const now = Date.now();
  for (const [field, val] of Object.entries(partial || {})) {
    const ex = envelope.fields[field];
    if (!ex || now >= (ex.t || 0)) envelope.fields[field] = { t: now, v: val };
  }
  const newVersion = (cur.version || 0) + 1;
  envelope.__mv = newVersion;
  const vStr = JSON.stringify(envelope);
  await env.DB.prepare(`INSERT INTO ethan_user_settings(user_id,k,v,updated_at,version) VALUES(?,?,?,?,?)
    ON CONFLICT(user_id,k) DO UPDATE SET v=excluded.v, updated_at=excluded.updated_at, version=excluded.version`)
    .bind(uid(env), String(k), vStr, nowIso(), newVersion).run();
  return { ok: true, version: newVersion, merged: envelope };
}

// ethan_recycle_bin 回收站：软删除快照（user_id, source_type, source_id, payload, deleted_at）
export async function ensureRecycleBinTable(env) {
  try {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS ethan_recycle_bin (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_id INTEGER,
      payload TEXT NOT NULL,
      deleted_at TEXT
    )`).run();
  } catch (_) {}
}

// ethan_inbox 收集箱：想法/备忘的快速捕获（无日期），空了再分派为日程/待办
//   done=1 即离开待分派列表（就地完成或已分派）；processed_type 记录去向便于追溯
export async function ensureInboxTable(env) {
  try {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS ethan_inbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      content TEXT NOT NULL,
      category INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      done INTEGER NOT NULL DEFAULT 0,
      done_at TEXT,
      processed_type TEXT,
      processed_id INTEGER
    )`).run();
  } catch (_) {}
}

// 删除前快照入站（extra 可挂附加数据，如习惯的打卡日志）。失败不阻断原删除流程。
export async function recycleSnapshot(env, sourceType, sourceId, table, extra) {
  try {
    await ensureRecycleBinTable(env);
    const row = await dbFirst(env.DB, `SELECT * FROM ${table} WHERE id = ?`, [sourceId]);
    if (!row) return;
    const payload = extra ? { row, ...extra } : { row };
    await env.DB.prepare(
      `INSERT INTO ethan_recycle_bin (user_id, source_type, source_id, payload, deleted_at) VALUES (?,?,?,?,?)`
    ).bind(uid(env), sourceType, sourceId, JSON.stringify(payload), nowIso()).run();
  } catch (_) { /* 回收站写入失败时继续硬删除，避免用户删不掉 */ }
}

// 重复事项表懒迁移：repeat_rule 列 + ethan_schedule_occurrences 例外表
export async function ensureScheduleRepeat(env) {
  try { await env.DB.prepare(`ALTER TABLE ethan_schedules ADD COLUMN repeat_rule TEXT DEFAULT 'none'`).run(); } catch (_) {}
  try {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS ethan_schedule_occurrences (
      schedule_id INTEGER NOT NULL,
      user_id TEXT,
      date TEXT NOT NULL,
      is_done INTEGER DEFAULT 0,
      PRIMARY KEY (schedule_id, date)
    )`).run();
  } catch (_) {}
}
