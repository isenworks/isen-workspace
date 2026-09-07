// ============================================================
// /api/auth/* 处理器：多用户账号体系（HMAC token + PBKDF2 密码）
//   bootstrapOwner：一次性初始化 owner 账号
//   register：用户注册（需要邀请码）
//   login：邮箱 + 密码登录（GET 用于 modes 探测，POST 用于实际登录）
// ============================================================
import {
  uid, json, dbFirst, nowIso, EMAIL_RE, AUTH_FAIL,
  DEFAULT_USER_ID, ensureUsersTable,
  hashPassword, verifyPassword, signToken, safeUser,
} from '../core.js';

// auth.bootstrapOwner：一次性创建 owner 账号（id=DEFAULT_USER_ID）
// 只有当 ethan_users 完全为空、且传入的 bootstrap_code === env.BOOTSTRAP_OWNER_CODE 时执行
// 执行成功后自动把 BOOTSTRAP_OWNER_CODE 标记为已使用（写 ethan_user_settings），之后无法重复调用
export async function handleAuthBootstrapOwner(env, body) {
  const data = body || {};
  const code = String(data.bootstrap_code || '').trim();
  const email = String(data.email || '').trim().toLowerCase();
  const username = String(data.username || '').trim();
  const password = String(data.password || '');
  const expected = env.BOOTSTRAP_OWNER_CODE ? String(env.BOOTSTRAP_OWNER_CODE).trim() : '';
  if (!expected) return json({ error: '未配置 BOOTSTRAP_OWNER_CODE，请在 Cloudflare Pages → Settings → Secrets 中设置后重试。' }, 400);
  if (code !== expected) return json({ error: 'bootstrap_code 不匹配' }, 403);
  if (!EMAIL_RE.test(email)) return json({ error: '邮箱格式不正确' }, 400);
  if (password.length < 6) return json({ error: '密码至少 6 位' }, 400);

  await ensureUsersTable(env);
  // 一次性锁：ethan_users 已经有 owner 行 / 已消耗过 bootstrap_code
  const marker = await dbFirst(env.DB, `SELECT v FROM ethan_user_settings WHERE user_id='0' AND k='owner_bootstrapped'`).catch(() => null);
  if (marker) return json({ error: 'owner 账号已初始化，无需再次执行（如需要重置，请先 DELETE FROM ethan_users WHERE is_owner=1 并删除 ethan_user_settings owner_bootstrapped 标记）' }, 409);
  const existingOwner = await dbFirst(env.DB, `SELECT id FROM ethan_users WHERE is_owner = 1`);
  if (existingOwner) return json({ error: 'owner 账号已存在' }, 409);

  let owner = await dbFirst(env.DB, `SELECT * FROM ethan_users WHERE email = ?`, [email]);
  const passwordHash = await hashPassword(password);
  const now = nowIso();
  if (!owner) {
    await env.DB.prepare(`INSERT INTO ethan_users (id, email, password_hash, username, avatar, is_owner, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?)`).bind(
        DEFAULT_USER_ID, email, passwordHash,
        (username || email.split('@')[0]),
        ((username || email || 'E').slice(0, 1).toUpperCase()),
        now, now
      ).run();
    owner = await dbFirst(env.DB, `SELECT * FROM ethan_users WHERE id = ?`, [DEFAULT_USER_ID]);
  } else {
    await env.DB.prepare(`UPDATE ethan_users SET password_hash=?, username=?, is_owner=1, updated_at=? WHERE id=?`)
      .bind(passwordHash, (username || owner.username || email.split('@')[0]), now, owner.id).run();
    owner = await dbFirst(env.DB, `SELECT * FROM ethan_users WHERE id = ?`, [owner.id]);
  }
  // 写入已消耗标记（虚拟 user_id='0' 全局配置）
  try {
    await env.DB.prepare(`INSERT INTO ethan_user_settings(user_id,k,v,updated_at) VALUES('0','owner_bootstrapped',?,?)
      ON CONFLICT(user_id,k) DO UPDATE SET v=excluded.v, updated_at=excluded.updated_at`)
      .bind('1', nowIso()).run();
  } catch (_) {}

  const token = await signToken(owner.id, env);
  return json({ ok: true, user: safeUser(owner), token });
}

// auth.register：用户注册（校验 ethan_invite_codes 表中的一次性邀请码）
export async function handleAuthRegister(env, body) {
  const data = body || {};
  const inviteCode = String(data.invite_code || data.inviteCode || '').trim().toUpperCase();
  if (!inviteCode) return json({ error: '请输入邀请码' }, 400);

  const email = String(data.email || '').trim().toLowerCase();
  const username = String(data.username || '').trim();
  const password = String(data.password || '');
  if (!EMAIL_RE.test(email)) return json({ error: '邮箱格式不正确' }, 400);
  if (password.length < 6) return json({ error: '密码至少 6 位' }, 400);

  await ensureUsersTable(env);

  // 校验邀请码：必须存在、未禁用、未使用
  const codeRow = await dbFirst(env.DB, `SELECT * FROM ethan_invite_codes WHERE code = ?`, [inviteCode]);
  if (!codeRow) return json({ error: '邀请码无效或已过期' }, 403);
  if (codeRow.is_disabled) return json({ error: '邀请码已被禁用' }, 403);
  if (codeRow.used_by) return json({ error: '邀请码已被使用' }, 403);

  // 邮箱唯一性
  const exists = await dbFirst(env.DB, `SELECT id FROM ethan_users WHERE email = ?`, [email]);
  if (exists) return json({ error: AUTH_FAIL.error }, 400);

  // 新用户 UUID
  let newId = crypto.randomUUID ? crypto.randomUUID() : null;
  if (!newId) {
    const rnd = crypto.getRandomValues(new Uint8Array(16));
    rnd[6] = (rnd[6] & 0x0f) | 0x40; rnd[8] = (rnd[8] & 0x3f) | 0x80;
    newId = Array.from(rnd).map((b, i) =>
      ([4, 6, 8, 10].includes(i) ? '-' : '') + b.toString(16).padStart(2, '0')).join('');
  }
  const passwordHash = await hashPassword(password);
  const now = nowIso();
  await env.DB.prepare(`INSERT INTO ethan_users (id, email, password_hash, username, avatar, is_owner, is_banned, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)`).bind(
      newId, email, passwordHash,
      (username || email.split('@')[0]),
      ((username || email || 'U').slice(0, 1).toUpperCase()),
      now, now
    ).run();

  // 标记邀请码已使用
  await env.DB.prepare(`UPDATE ethan_invite_codes SET used_by = ?, used_at = ? WHERE code = ?`)
    .bind(newId, now, inviteCode).run();

  const user = await dbFirst(env.DB, `SELECT * FROM ethan_users WHERE id = ?`, [newId]);
  const token = await signToken(user.id, env);
  return json({ ok: true, user: safeUser(user), token });
}

// auth.login：邮箱 + 密码登录，返回 HMAC token
//   method === 'GET'：健康检查 / 前端探测接口（登录页根据返回的 modes 动态显示 Tab）
//   method === 'POST'：实际登录
export async function handleAuthLogin(env, body, method, currentUser) {
  if (method === 'GET') {
    const bootstrapCode = env.BOOTSTRAP_OWNER_CODE ? String(env.BOOTSTRAP_OWNER_CODE).trim() : '';
    // 1) 是否允许 ownerBootstrap：仅当 ethan_users 没有任何 owner 记录、且 bootstrap_code 还未被消耗时才为 true
    let ownerBootstrapAllowed = false;
    try {
      if (bootstrapCode) {
        const marker = await dbFirst(env.DB, `SELECT v FROM ethan_user_settings WHERE user_id='0' AND k='owner_bootstrapped'`).catch(() => null);
        const existingOwner = await dbFirst(env.DB, `SELECT id FROM ethan_users WHERE is_owner = 1 LIMIT 1`).catch(() => null);
        ownerBootstrapAllowed = !marker && !existingOwner;
      }
    } catch (_) {}
    // 2) 是否开放注册：只要 ethan_invite_codes 里有"未使用 + 未禁用"的邀请码，就显示注册 Tab
    //    （closed-beta 模式：注册必须靠邀请码，没有可用邀请码就不渲染注册 Tab）
    let openRegister = false;
    try {
      const cnt = await dbFirst(env.DB, `SELECT COUNT(*) AS c FROM ethan_invite_codes WHERE is_disabled = 0 AND used_by IS NULL`);
      openRegister = (cnt && Number(cnt.c) > 0);
    } catch (_) {}
    return json({
      ok: true,
      modes: {
        ownerBootstrap: ownerBootstrapAllowed,
        openRegister,
      },
      user: currentUser ? safeUser(currentUser) : null,
    });
  }
  if (method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);
  try {
    const data = body || {};
    const email = String(data.email || '').trim().toLowerCase();
    const password = String(data.password || '');
    if (!EMAIL_RE.test(email) || !password) return json({ ...AUTH_FAIL }, 401);

    await ensureUsersTable(env);
    const row = await dbFirst(env.DB, `SELECT * FROM ethan_users WHERE email = ?`, [email]);
    if (!row) return json({ ...AUTH_FAIL }, 401);
    const pwOk = await verifyPassword(password, row.password_hash);
    if (!pwOk) return json({ ...AUTH_FAIL }, 401);
    if (row.is_banned) return json({ error: '账号已被禁用，请联系管理员' }, 403);

    // 更新最近登录时间
    try {
      await env.DB.prepare(`UPDATE ethan_users SET last_login = datetime('now') WHERE id = ?`).bind(row.id).run();
      row.last_login = new Date().toISOString();
    } catch (_) {}

    const token = await signToken(row.id, env);
    return json({ ok: true, token, user: safeUser(row) }, 200);
  } catch (e) {
    return json({ error: String(e.message || e) }, 500);
  }
}
