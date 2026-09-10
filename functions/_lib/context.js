// ============================================================
// 请求上下文解析：从 X-Unlock-Token 解析当前用户，挂到 env 上供 handler 取用
// ============================================================
import { ensureUsersTable, verifyToken, dbFirst } from './core.js';

// 白名单：无需登录即可访问的接口
export const PUBLIC_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/bootstrapOwner',
  '/api/auth/unlock',    // 旧接口兼容
  '/api/auth/me',        // 未登录返回 null 给前端判断
  '/api/auth/logout',
  '/api/health',
  '/api/github/issueGrant',  // AI 沙盒凭 grant code 换取 PAT（code 本身即凭证，30 分钟一次性）
]);

/**
 * 解析请求上下文：
 *   - 懒触发 ensureUsersTable
 *   - 从 X-Unlock-Token 头解析 HMAC token → curUserId
 *   - 查 ethan_users 校验用户是否存在 / 是否被禁用
 *   - 把 curUserId 挂到 env.__CURRENT_USER_ID__，后续 handler 调 uid(env) 直接拿到
 *
 * @returns {{ curUserId: string|null, currentUser: object|null, body: object|null, q: object, qOrBody: object, path: string, method: string }}
 */
export async function resolveUser({ request, env }) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();

  // 1) 确保 ethan_users 表存在（懒迁移，任何请求都能触发）
  try { await ensureUsersTable(env); } catch (_) {}

  // 2) 从 X-Unlock-Token 取 HMAC token 并解析
  const rawToken = request.headers.get('X-Unlock-Token') || url.searchParams.get('unlock') || '';
  let curUserId = null;
  let currentUser = null;
  if (rawToken) {
    curUserId = await verifyToken(rawToken, env);
    if (curUserId) {
      try {
        currentUser = await dbFirst(env.DB, `SELECT id, email, username, avatar, is_owner, is_banned FROM ethan_users WHERE id = ?`, [curUserId]);
      } catch (_) { currentUser = null; }
      if (!currentUser) curUserId = null;        // token 合法但用户被删了 → 失效
      else if (currentUser.is_banned) curUserId = null; // 被禁用的用户 → token 失效
    }
  }
  // 解析结果挂 env，后续所有 handler 里调用 uid(env) 能直接拿到
  if (curUserId) env.__CURRENT_USER_ID__ = curUserId;

  const q = Object.fromEntries(url.searchParams.entries());
  let body = null;
  if (method !== 'GET' && method !== 'OPTIONS' && request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    body = await request.json().catch(() => ({}));
  }
  // list 类接口兼容 GET/POST：POST 时把 body 参数合并到 q
  const qOrBody = method === 'GET' ? q : (body || {});

  return { curUserId, currentUser, body, q, qOrBody, path, method };
}

/**
 * 判断是否公开路径（白名单 + 几个特殊前缀）
 */
export function isPublicPath(path) {
  return PUBLIC_PATHS.has(path)
    || path.startsWith('/api/weread/')
    || path.startsWith('/api/cover/')
    || path === '/api/birthday-migrate'
    || path === '/api/migrate';
}
