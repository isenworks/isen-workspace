// ============================================================
// /api/inviteCodes/* 处理器：邀请码管理（仅 owner 可操作，后端校验权限）
// ============================================================
import { uid, json, dbAll, dbFirst, nowIso } from '../core.js';

// 生成唯一 8 位码（排除易混淆字符 I O 0 1）
export async function handleInviteCodeCreate(env) {
  const userId = uid(env);
  const owner = await dbFirst(env.DB, `SELECT is_owner FROM ethan_users WHERE id = ?`, [userId]);
  if (!owner || !owner.is_owner) return json({ error: '无权限' }, 403);

  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  let tries = 0;
  while (tries < 10) {
    code = '';
    const rnd = crypto.getRandomValues(new Uint8Array(8));
    for (let i = 0; i < 8; i++) code += chars[rnd[i] % chars.length];
    const exists = await dbFirst(env.DB, `SELECT id FROM ethan_invite_codes WHERE code = ?`, [code]);
    if (!exists) break;
    tries++;
  }

  const id = crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  await env.DB.prepare(`INSERT INTO ethan_invite_codes (id, code, created_by, is_disabled) VALUES (?, ?, ?, 0)`)
    .bind(id, code, userId).run();
  return json({ ok: true, code });
}

// 列出所有邀请码 + 使用状态
export async function handleInviteCodeList(env) {
  const userId = uid(env);
  const owner = await dbFirst(env.DB, `SELECT is_owner FROM ethan_users WHERE id = ?`, [userId]);
  if (!owner || !owner.is_owner) return json({ error: '无权限' }, 403);

  const rows = await dbAll(env.DB, `
    SELECT ic.id, ic.code, ic.created_at, ic.used_by, ic.used_at, ic.is_disabled, ic.disabled_at,
           u.email AS used_by_email
    FROM ethan_invite_codes ic
    LEFT JOIN ethan_users u ON ic.used_by = u.id
    ORDER BY ic.created_at DESC
  `);
  return json({ codes: rows || [] });
}

// 禁用邀请码
export async function handleInviteCodeDisable(env, body) {
  const userId = uid(env);
  const owner = await dbFirst(env.DB, `SELECT is_owner FROM ethan_users WHERE id = ?`, [userId]);
  if (!owner || !owner.is_owner) return json({ error: '无权限' }, 403);

  const id = String(body?.id || '');
  if (!id) return json({ error: '缺少 id' }, 400);
  await env.DB.prepare(`UPDATE ethan_invite_codes SET is_disabled = 1, disabled_at = ? WHERE id = ?`)
    .bind(nowIso(), id).run();
  return json({ ok: true });
}
