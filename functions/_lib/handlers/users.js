// ============================================================
// /api/users/* 处理器：用户管理（仅 owner 可操作）
// ============================================================
import { uid, json, dbAll, dbFirst, nowIso } from '../core.js';

// 列出所有注册用户（owner 才能看）
export async function handleUsersList(env) {
  const userId = uid(env);
  const owner = await dbFirst(env.DB, `SELECT is_owner FROM ethan_users WHERE id = ?`, [userId]);
  if (!owner || !owner.is_owner) return json({ error: '无权限' }, 403);

  const rows = await dbAll(env.DB, `
    SELECT id, email, username, avatar, is_owner, is_banned, created_at, last_login
    FROM ethan_users
    ORDER BY created_at DESC
  `);
  const users = (rows || []).map(u => ({
    user_id: u.id,
    email: u.email,
    username: u.username || (u.email || '').split('@')[0],
    avatar: u.avatar || '',
    is_owner: !!u.is_owner,
    is_banned: !!u.is_banned,
    created_at: u.created_at,
    last_login: u.last_login || null,
  }));
  return json({ users });
}

// users.ban / users.unban：禁用/恢复用户
export async function handleUsersBan(env, body, ban) {
  const userId = uid(env);
  const owner = await dbFirst(env.DB, `SELECT is_owner FROM ethan_users WHERE id = ?`, [userId]);
  if (!owner || !owner.is_owner) return json({ error: '无权限' }, 403);

  const targetId = String(body?.user_id || body?.userId || '');
  if (!targetId) return json({ error: '缺少 user_id' }, 400);
  if (targetId === userId) return json({ error: '不能禁用自己' }, 400);

  await env.DB.prepare(`UPDATE ethan_users SET is_banned = ?, updated_at = ? WHERE id = ?`)
    .bind(ban ? 1 : 0, nowIso(), targetId).run();
  return json({ ok: true });
}
