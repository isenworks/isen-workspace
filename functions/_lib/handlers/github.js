// ============================================================
// /api/github/* 处理器：GitHub PAT 托管 + AI 推送授权（仅 owner，锁定指定账号）
//   安全设计（三层）：
//   1) 存储层：PAT 经 GitHub API 验证后 AES-GCM 加密落 D1（ethan_github_tokens），
//      密钥来自 Cloudflare Secrets 的 GITHUB_PAT_ENC_KEY（缺省时降级用 HMAC_SECRET 派生）；
//      登录态接口一律不回 PAT 明文（status 只返回掩码）——「只写不读」。
//   2) 签发层：「AI 推送授权」开关开启时生成时限 grant code（256 位随机，默认 1 天、
//      可选 1 个月 / 3 个月，库里只存 SHA-256，明文只在 owner 界面显示一次）；
//      关闭 / 过期 / 重新开启 / 切换时长 → 旧 code 立即作废。
//   3) 兜底层：issueGrant 为公开路径（AI 沙盒无登录态），凭 grant code 换取 PAT 明文
//      用于 git push；每次签发写审计（次数 / 时间 / IP）。PAT 本身建议用
//      fine-grained 最小权限（单仓库 + Contents:write + 短有效期），泄露影响面可控。
// ============================================================
import { json, nowIso, dbFirst, dbRun, ab2hex, toInt } from '../core.js';

// 本功能仅对 owner 开放，且锁定到指定账号（双重校验，防止未来出现多个 owner 时误开放）
const OWNER_EMAIL = '1429000825@qq.com';
// grant code 有效期选项（小时 → 毫秒）：默认 1 天，owner 可选 1 天 / 1 个月 / 3 个月
const GRANT_TTL_HOURS = { 24: 86400000, 720: 2592000000, 2160: 7776000000 };
const DEFAULT_GRANT_TTL_HOURS = 24;

function isGithubOwner(currentUser) {
  return !!currentUser
    && toInt(currentUser.is_owner) === 1
    && String(currentUser.email || '').trim().toLowerCase() === OWNER_EMAIL;
}

// ------------------------------------------------------------
// 表懒迁移：ethan_github_tokens（每用户一行，user_id 主键）
// ------------------------------------------------------------
async function ensureGithubTable(env) {
  try {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS ethan_github_tokens (
      user_id TEXT PRIMARY KEY,
      enc_token TEXT NOT NULL,
      mask TEXT NOT NULL DEFAULT '',
      pat_login TEXT,
      grant_enabled INTEGER NOT NULL DEFAULT 0,
      grant_code_hash TEXT,
      grant_expires_at INTEGER,
      grant_issued_count INTEGER NOT NULL DEFAULT 0,
      grant_last_issued_at TEXT,
      grant_last_ip TEXT,
      grant_ttl_hours INTEGER,
      updated_at TEXT
    )`).run();
    // 兼容已上线的旧表：补列（列已存在时忽略报错）
    try {
      await env.DB.prepare(`ALTER TABLE ethan_github_tokens ADD COLUMN grant_ttl_hours INTEGER`).run();
    } catch (_) {}
  } catch (_) {}
}

// ------------------------------------------------------------
// AES-GCM 加解密（密钥从 Secret 派生，IV 随机 12 字节前缀拼接密文）
// ------------------------------------------------------------
async function deriveAesKey(env) {
  const secret = env.GITHUB_PAT_ENC_KEY || env.HMAC_SECRET || '';
  if (!secret) throw new Error('服务器未配置加密密钥（请在 Cloudflare Secrets 添加 GITHUB_PAT_ENC_KEY）');
  const material = await crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode('github-pat-enc:' + String(secret))
  );
  return crypto.subtle.importKey('raw', material, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function encryptPat(env, plaintext) {
  const key = await deriveAesKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext)
  );
  const bytes = new Uint8Array(12 + ct.byteLength);
  bytes.set(iv, 0);
  bytes.set(new Uint8Array(ct), 12);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

async function decryptPat(env, b64) {
  const key = await deriveAesKey(env);
  const raw = atob(b64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: bytes.slice(0, 12) }, key, bytes.slice(12)
  );
  return new TextDecoder().decode(pt);
}

function maskPat(pat) {
  if (!pat) return '';
  if (pat.length <= 14) return pat.slice(0, 4) + '****';
  return pat.slice(0, 10) + '…' + pat.slice(-4);
}

// ------------------------------------------------------------
// POST /api/github/setToken — 验证 PAT 有效性并加密保存（仅 owner）
// ------------------------------------------------------------
export async function handleGithubSetToken(env, body, currentUser) {
  if (!isGithubOwner(currentUser)) return json({ error: '无权访问' }, 403);
  const pat = String(body?.pat || '').trim();
  if (!pat || pat.length < 20) return json({ error: 'PAT 格式不正确' }, 400);

  // 调 GitHub API 验证有效性（顺便取登录名，界面回显确认）
  let login = '';
  try {
    const r = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: 'Bearer ' + pat,
        'User-Agent': 'ethan-workspace',
        Accept: 'application/vnd.github+json',
      },
    });
    if (!r.ok) return json({ error: 'PAT 验证失败：GitHub 返回 ' + r.status + '（无效或已过期）' }, 400);
    login = (await r.json()).login || '';
  } catch (e) {
    return json({ error: '无法连接 GitHub 验证 PAT：' + e.message }, 502);
  }

  await ensureGithubTable(env);
  const enc = await encryptPat(env, pat);
  const mask = maskPat(pat);
  // 换新 PAT 时同步作废未过期的授权开关（旧 code 换到的可能是旧 PAT，直接关掉最干净）
  await dbRun(env.DB,
    `INSERT INTO ethan_github_tokens (user_id, enc_token, mask, pat_login, grant_enabled, grant_code_hash, grant_expires_at, updated_at)
     VALUES (?,?,?,?,0,NULL,NULL,?)
     ON CONFLICT(user_id) DO UPDATE SET
       enc_token=excluded.enc_token, mask=excluded.mask, pat_login=excluded.pat_login,
       grant_enabled=0, grant_code_hash=NULL, grant_expires_at=NULL, updated_at=excluded.updated_at`,
    [currentUser.id, enc, mask, login, nowIso()]);
  return json({ ok: true, mask, pat_login: login });
}

// ------------------------------------------------------------
// GET /api/github/status — 托管状态（仅 owner，只回掩码/开关/审计，不回明文）
// ------------------------------------------------------------
export async function handleGithubStatus(env, currentUser) {
  if (!isGithubOwner(currentUser)) return json({ error: '无权访问' }, 403);
  await ensureGithubTable(env);
  const row = await dbFirst(env.DB, `SELECT * FROM ethan_github_tokens WHERE user_id=?`, [currentUser.id]);
  // 开关过期 → 懒视为关闭（不回显 code，code 只在 toggleGrant 开启那一刻返回一次）
  const grantActive = !!(
    row && row.grant_enabled && row.grant_code_hash
    && row.grant_expires_at && Date.now() < row.grant_expires_at
  );
  return json({
    ok: true,
    configured: !!row,
    mask: row?.mask || '',
    pat_login: row?.pat_login || '',
    updated_at: row?.updated_at || '',
    grant: {
      enabled: grantActive,
      expires_at: grantActive ? row.grant_expires_at : null,
      ttl_hours: (row?.grant_ttl_hours && GRANT_TTL_HOURS[row.grant_ttl_hours]) ? row.grant_ttl_hours : DEFAULT_GRANT_TTL_HOURS,
      issued_count: row ? toInt(row.grant_issued_count) : 0,
      last_issued_at: row?.grant_last_issued_at || null,
    },
  });
}

// ------------------------------------------------------------
// POST /api/github/toggleGrant — 开/关 AI 推送授权（仅 owner）
//   开启：按 ttl_hours（24 / 720 / 2160，缺省 24）生成新 grant code（旧的立即作废），
//         明文 code 只在本次响应返回一次；切换时长 = 重新生成 code
//   关闭：清除 code，之后 issueGrant 一律拒绝
// ------------------------------------------------------------
export async function handleGithubToggleGrant(env, body, currentUser) {
  if (!isGithubOwner(currentUser)) return json({ error: '无权访问' }, 403);
  await ensureGithubTable(env);
  const row = await dbFirst(env.DB, `SELECT * FROM ethan_github_tokens WHERE user_id=?`, [currentUser.id]);
  if (!row) return json({ error: '请先保存 GitHub PAT' }, 400);

  if (!body?.enabled) {
    await dbRun(env.DB,
      `UPDATE ethan_github_tokens SET grant_enabled=0, grant_code_hash=NULL, grant_expires_at=NULL WHERE user_id=?`,
      [currentUser.id]);
    return json({ ok: true, grant: { enabled: false } });
  }

  const ttlHours = toInt(body?.ttl_hours);
  const ttlMs = GRANT_TTL_HOURS[ttlHours] || GRANT_TTL_HOURS[DEFAULT_GRANT_TTL_HOURS];
  const effectiveTtl = GRANT_TTL_HOURS[ttlHours] ? ttlHours : DEFAULT_GRANT_TTL_HOURS;
  const code = ab2hex(crypto.getRandomValues(new Uint8Array(32)).buffer);
  const codeHash = ab2hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code)));
  const expiresAt = Date.now() + ttlMs;
  await dbRun(env.DB,
    `UPDATE ethan_github_tokens SET grant_enabled=1, grant_code_hash=?, grant_expires_at=?, grant_ttl_hours=? WHERE user_id=?`,
    [codeHash, expiresAt, effectiveTtl, currentUser.id]);
  return json({ ok: true, grant: { enabled: true, code, expires_at: expiresAt, ttl_hours: effectiveTtl } });
}

// ------------------------------------------------------------
// POST /api/github/issueGrant — 公开路径：凭 grant code 换取 PAT（供 AI 沙盒 git push）
//   校验：code 哈希命中 + 开关开启 + 未过期；时间窗内可多次签发（每次记审计）
// ------------------------------------------------------------
export async function handleGithubIssueGrant(env, body, request) {
  const code = String(body?.grant_code || '').trim();
  if (!code) return json({ error: '缺少 grant_code' }, 400);
  await ensureGithubTable(env);
  const codeHash = ab2hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code)));
  const row = await dbFirst(env.DB,
    `SELECT * FROM ethan_github_tokens WHERE grant_code_hash=? AND grant_enabled=1`, [codeHash]);
  if (!row) return json({ error: '授权码无效，或推送授权已关闭' }, 403);
  if (!row.grant_expires_at || Date.now() >= row.grant_expires_at) {
    return json({ error: '授权码已过期，请重新开启推送授权' }, 403);
  }

  let pat;
  try {
    pat = await decryptPat(env, row.enc_token);
  } catch (_) {
    return json({ error: '解密失败：GITHUB_PAT_ENC_KEY 可能已变更，请重新保存 PAT' }, 500);
  }

  // 审计：次数 / 时间 / IP（不记 code 明文，hash 已在行上）
  const ip = request?.headers?.get('cf-connecting-ip') || '';
  await dbRun(env.DB,
    `UPDATE ethan_github_tokens SET grant_issued_count=grant_issued_count+1, grant_last_issued_at=?, grant_last_ip=? WHERE user_id=?`,
    [nowIso(), ip, row.user_id]);

  return json({ ok: true, pat, mask: row.mask, expires_at: row.grant_expires_at });
}

// ------------------------------------------------------------
// POST /api/github/clearToken — 彻底删除托管的 PAT 及授权状态（仅 owner）
// ------------------------------------------------------------
export async function handleGithubClearToken(env, currentUser) {
  if (!isGithubOwner(currentUser)) return json({ error: '无权访问' }, 403);
  await ensureGithubTable(env);
  await dbRun(env.DB, `DELETE FROM ethan_github_tokens WHERE user_id=?`, [currentUser.id]);
  return json({ ok: true });
}
