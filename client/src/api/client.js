// ============================================================
// API 客户端：Cloudflare Pages Functions + D1 后端
//   所有请求统一走 fetchPages('/api/...')
//   鉴权：X-Unlock-Token 头（HMAC token，由 /auth/login 返回）
// ============================================================

// 单人用户 ID（与 Pages Functions 中 DEFAULT_USER_ID 保持一致，作为兜底）
const DEFAULT_USER_ID = '50f12e1e-d561-423e-a424-d07a21d00cf2';

// D1 模式下统一从 localStorage 取登录 token
function unlockToken() {
  return localStorage.getItem('pw_unlock_token') || '';
}

// 通用 fetch 包装
async function fetchPages(path, body = {}, method = 'POST') {
  const isGET = String(method).toUpperCase() === 'GET';
  const hdrs = {
    'X-Unlock-Token': unlockToken(),
  };
  if (!isGET) hdrs['Content-Type'] = 'application/json';
  const init = {
    method,
    headers: hdrs,
  };
  if (!isGET) init.body = JSON.stringify(body || {});
  const res = await fetch('/api' + path, init);
  let data;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok || data?.error) {
    const msg = data?.error || (data?.message) || `请求失败 (${res.status})`;
    if (res.status === 401) {
      localStorage.removeItem('pw_user');
      localStorage.removeItem('pw_unlock_token');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('pw:auth-expired'));
      }
      throw new Error('登录已过期，请重新登录');
    }
    throw new Error(msg);
  }
  return data;
}

// 习惯连续天数计算（前后端都实现一份，保持一致）
export function calcStreak(logs) {
  const doneDates = new Set((logs || []).filter(l => l.done).map(l => l.date));
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  let cursor = doneDates.has(today) ? today : yesterday;
  let streak = 0;
  while (doneDates.has(cursor)) {
    streak++;
    const d = new Date(cursor);
    d.setDate(d.getDate() - 1);
    cursor = d.toISOString().slice(0, 10);
  }
  return streak;
}

// ============================================================
// 导出 API 对象（仅 D1 实现，生产环境统一走 Cloudflare Pages Functions）
// ============================================================
export const API = {
  auth: {
    // POST /auth/register（需要 invite_code）
    async register(email, password, { username, avatar, inviteCode } = {}) {
      const res = await fetchPages('/auth/register', {
        email: (email || '').trim(),
        password: String(password || ''),
        username: (username || '').trim(),
        avatar: avatar || '',
        invite_code: (inviteCode || '').trim(),
      });
      // 登录凭证写入 localStorage
      if (res?.token) localStorage.setItem('pw_unlock_token', String(res.token));
      const u = res?.user || null;
      if (u) localStorage.setItem('pw_user', JSON.stringify(u));
      return { user: u, session: null };
    },
    // POST /auth/login（邮箱 + 密码）
    async login(email, password) {
      const res = await fetchPages('/auth/login', {
        email: (email || '').trim(),
        password: String(password || ''),
      });
      if (res?.token) localStorage.setItem('pw_unlock_token', String(res.token));
      const u = res?.user || null;
      if (u) localStorage.setItem('pw_user', JSON.stringify(u));
      return { user: u, session: null };
    },
    async me() {
      const res = await fetchPages('/auth/me', {}, 'GET');
      if (res?.user) localStorage.setItem('pw_user', JSON.stringify(res.user));
      else { localStorage.removeItem('pw_user'); localStorage.removeItem('pw_unlock_token'); }
      return res;
    },
    async updateMe({ avatar }) {
      return fetchPages('/auth/updateMe', { avatar });
    },
    async uploadAvatar(file) {
      // 头像用 Base64 localStorage 存（单人够用，避免 Storage 依赖）
      if (!file.type.startsWith('image/')) throw new Error('请选择图片文件');
      if (file.size > 2 * 1024 * 1024) throw new Error('图片不能超过 2MB');
      const reader = new FileReader();
      const dataUrl = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await fetchPages('/auth/updateMe', { avatar: dataUrl });
      const prev = JSON.parse(localStorage.getItem('pw_user') || '{}');
      const next = { ...prev, avatar: dataUrl };
      localStorage.setItem('pw_user', JSON.stringify(next));
      return { avatar: dataUrl };
    },
    async logout() {
      localStorage.removeItem('pw_user');
      localStorage.removeItem('pw_unlock_token');
      return { ok: true };
    },
  },

  schedules: {
    async list(params) { return fetchPages('/schedules/list', params || {}); },
    async create(data) { return fetchPages('/schedules/create', data); },
    async update(id, data) { return fetchPages('/schedules/update', { id, ...data }); },
    async remove(id) { return fetchPages('/schedules/remove', { id }); },
    async sync(date, items) { return fetchPages('/schedules/sync', { date, items }); },
  },

  tasks: {
    async list(params) { return fetchPages('/tasks/list', params || {}); },
    async create(data) { return fetchPages('/tasks/create', data); },
    async update(id, data) { return fetchPages('/tasks/update', { id, ...data }); },
    async remove(id) { return fetchPages('/tasks/remove', { id }); },
  },

  habits: {
    async list(params) { return fetchPages('/habits/list', params || {}); },
    async create(data) { return fetchPages('/habits/create', data); },
    async update(id, data) { return fetchPages('/habits/update', { id, ...data }); },
    async reorder(orderedIds) { return fetchPages('/habits/reorder', { orderedIds }); },
    async remove(id) { return fetchPages('/habits/remove', { id }); },
    async toggle(id, date, targetDone) { return fetchPages('/habits/toggle', { id, date, targetDone }); },
    async logSleep(habitId, date, payload) { return fetchPages('/habits/logSleep', { habitId, date, ...payload }); },
    async logCount(habitId, date, payload) { return fetchPages('/habits/logCount', { habitId, date, ...payload }); },
    async stats(from, to) { return fetchPages('/habits/stats', { from, to }); },
    async archivedList() { return fetchPages('/habits/archivedList'); },
    async archive(id) { return fetchPages('/habits/archive', { id }); },
    async restore(id) { return fetchPages('/habits/restore', { id }); },
  },

  fixedSchedules: {
    async list() { return fetchPages('/fixedSchedules/list'); },
    async create(data) { return fetchPages('/fixedSchedules/create', data); },
    async update(id, data) { return fetchPages('/fixedSchedules/update', { id, ...data }); },
    async remove(id) { return fetchPages('/fixedSchedules/remove', { id }); },
  },

  summaries: {
    async get(date) { return fetchPages('/summaries/get', { date }); },
    async range(from, to) { return fetchPages('/summaries/range', { from, to }); },
    async upsert(data) { return fetchPages('/summaries/upsert', data); },
    async remove(date) { return fetchPages('/summaries/remove', { date }); },
  },

  recycleBin: {
    async list() { return fetchPages('/recycleBin/list'); },
    async restore(id) { return fetchPages('/recycleBin/restore', { id }); },
    async remove(id) { return fetchPages('/recycleBin/remove', { id }); },
    async clear() { return fetchPages('/recycleBin/clear', {}); },
  },

  migrate: {
    async run(payload) { return fetchPages('/migrate', payload); },
  },

  // 邀请码管理（仅 owner 可调用，后端校验权限）
  inviteCodes: {
    async create() { return fetchPages('/inviteCodes/create', {}); },
    async list() { return fetchPages('/inviteCodes/list', {}, 'GET'); },
    async disable(id) { return fetchPages('/inviteCodes/disable', { id }); },
  },
  // 用户管理（仅 owner 可调用）
  users: {
    async list() { return fetchPages('/users/list', {}, 'GET'); },
    async ban(userId) { return fetchPages('/users/ban', { user_id: userId }); },
    async unban(userId) { return fetchPages('/users/unban', { user_id: userId }); },
  },
};

// 兼容引用：保留 DEFAULT_USER_ID 导出（部分旧代码可能引用）
export { DEFAULT_USER_ID };
