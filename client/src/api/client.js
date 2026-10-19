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

// 通用 fetch 包装（15 秒超时兜底 + 瞬时故障退避重试）
//   幂等读请求（GET / list / stats 等）：网络错误、超时、边缘 502/503/504 均退避重试（最多 2 次）。
//     移动蜂窝弱网（实测 <15KB/s）下，超时是最常见的瞬时失败形态（Functions+D1 冷启动叠加慢传输），
//     把它排除在重试外 = 弱网下一次超时即永久判死 —— 这正是「电脑正常、手机必现不同步」的根因。
//   非幂等写请求（create/remove/toggle 等）：超时后服务端可能已执行成功，重试有重复写入风险，
//     不自动重试（失败抛错由 UI 呈现，用户手动重试一次即可）。
const RETRYABLE_STATUS = new Set([502, 503, 504]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 幂等路径判定：GET 天然幂等；POST 中以下列词结尾的接口是「读 / 覆盖式」语义，重发无副作用
const IDEMPOTENT_POST = /\/(list|archivedList|stats|range|search|bootstrap|image|export|status|sync|upsert|reorder|archive|restore)$/;

async function fetchPages(path, body = {}, method = 'POST') {
  const isGET = String(method).toUpperCase() === 'GET';
  const idempotent = isGET || IDEMPOTENT_POST.test(path);
  const hdrs = {
    'X-Unlock-Token': unlockToken(),
  };
  if (!isGET) hdrs['Content-Type'] = 'application/json';
  const init = {
    method,
    headers: hdrs,
  };
  if (!isGET) init.body = JSON.stringify(body || {});

  let res;
  for (let attempt = 0; ; attempt++) {
    // 每次尝试用独立的 AbortController：15 秒超时（覆盖弱网 + Functions/D1 冷启动）
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 15000);
    let netErr = null;
    try {
      res = await fetch('/api' + path, { ...init, signal: ctl.signal });
    } catch (e) {
      netErr = e;
    } finally {
      clearTimeout(timer);
    }
    // 可重试判定：网络错误（含超时）仅对幂等请求重试；边缘 5xx 未进业务处理，任何请求重试都安全
    const retryable = netErr
      ? idempotent
      : RETRYABLE_STATUS.has(res.status);
    if (retryable && attempt < 2) { await sleep(attempt === 0 ? 600 : 3000); continue; }
    if (netErr) throw netErr;
    break;
  }

  let data;
  try { data = await res.json(); } catch { data = null; }
  // 200 但响应体不是 JSON（如 Functions 路由缺失时被 SPA 兜底 `/* /index.html 200` 接管）：
  // 此时 data 为 null，若不显式抛错，写操作会拿到 null 却误报「创建成功」
  if (data === null || typeof data !== 'object') {
    throw new Error(`接口响应异常（HTTP ${res.status}，非 JSON），请刷新页面重试，若持续出现请联系排查`);
  }
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
      if (res?.user) {
        localStorage.setItem('pw_user', JSON.stringify(res.user));
        // token 回传：localStorage 被移动端浏览器清掉后，靠 HttpOnly Cookie 兜底
        // 认证成功时，这里把 token 重新写回 localStorage（会话自愈）
        if (res?.token) localStorage.setItem('pw_unlock_token', String(res.token));
      } else {
        localStorage.removeItem('pw_user');
        localStorage.removeItem('pw_unlock_token');
      }
      return res;
    },
    async updateMe({ avatar }) {
      return fetchPages('/auth/updateMe', { avatar });
    },
    async uploadAvatar(file) {
      // 头像用 Base64 存 D1（单人够用，避免 Storage 依赖）
      if (!file.type.startsWith('image/')) throw new Error('请选择图片文件');
      // Base64 会膨胀约 1/3，需与后端 2M 字符上限对齐（二进制约 1.5MB）
      if (file.size > 1.5 * 1024 * 1024) throw new Error('图片不能超过 1.5MB');
      const reader = new FileReader();
      const dataUrl = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      if (!dataUrl || dataUrl.length > 2 * 1024 * 1024) throw new Error('图片过大，请换一张或压缩后重试');
      await fetchPages('/auth/updateMe', { avatar: dataUrl });
      const prev = JSON.parse(localStorage.getItem('pw_user') || '{}');
      const next = { ...prev, avatar: dataUrl };
      localStorage.setItem('pw_user', JSON.stringify(next));
      return { avatar: dataUrl };
    },
    async logout() {
      // 必须先通知服务端清 HttpOnly 凭证 Cookie（pw_token）：
      // 只清 localStorage 的话 Cookie 仍有效，重开浏览器会被自动登回
      try { await fetchPages('/auth/logout', {}); } catch (_) {}
      localStorage.removeItem('pw_user');
      localStorage.removeItem('pw_unlock_token');
      return { ok: true };
    },
  },

  schedules: {
    async list(params) { return fetchPages('/schedules/list', params || {}); },
    // 按 id 取单条：替代「list 全表再 find」的编辑路径
    async get(id) { return fetchPages('/schedules/get', { id }); },
    async create(data) { return fetchPages('/schedules/create', data); },
    async update(id, data) { return fetchPages('/schedules/update', { id, ...data }); },
    async remove(id) { return fetchPages('/schedules/remove', { id }); },
    async sync(date, items) { return fetchPages('/schedules/sync', { date, items }); },
  },

  // 收集箱：想法/备忘快速捕获（无日期），空了再分派为事项
  inbox: {
    async list() { return fetchPages('/inbox/list', {}, 'GET'); },
    async create(data) { return fetchPages('/inbox/create', data); },
    async update(id, data) { return fetchPages('/inbox/update', { id, ...data }); },
    // 行内快速分派（原子）：单请求完成建日程/待办 + 标记已处理
    async process(data) { return fetchPages('/inbox/process', data); },
    async remove(id) { return fetchPages('/inbox/remove', { id }); },
    // 小记独立标签
    async tags() { return fetchPages('/inbox/tags', {}, 'GET'); },
    async tagCreate(data) { return fetchPages('/inbox/tag/create', data); },
    async tagUpdate(id, data) { return fetchPages('/inbox/tag/update', { id, ...data }); },
    async tagRemove(id) { return fetchPages('/inbox/tag/remove', { id }); },
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

  // 全局搜索：四表 LIKE 并行查询（服务端全量历史，前端 300ms 防抖后调用）
  search: {
    async all(q) { return fetchPages('/search/all', { q }); },
  },

  // Hero 背景图 R2 对象存储（原图保留，支持无损重新取景）
  //   upload: multipart 上传文件，kind='src'（原图）|'out'（成品图），返回 { key, url, size }
  //   remove: 按 key 删除 R2 中的文件
  hero: {
    async upload(file, { kind = 'out', id = '' } = {}) {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kind', kind);
      fd.append('id', id);
      const res = await fetch('/api/hero/upload', {
        method: 'POST',
        headers: { 'X-Unlock-Token': unlockToken() },
        body: fd,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || data?.error) throw new Error(data?.error || `上传失败 (${res.status})`);
      return data;
    },
    async remove(key) {
      const res = await fetch(`/api/hero/img/${encodeURIComponent(key)}`, {
        method: 'DELETE',
        headers: { 'X-Unlock-Token': unlockToken() },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || data?.error) throw new Error(data?.error || `删除失败 (${res.status})`);
      return data;
    },
  },

  // 财务模块（发展规划 · 第 6 模块：攒钱目标 / 资产负债 / 当月收支 / 流水）
  //   bootstrap 一次拉全仪表盘；金额 API 层统一「元」，服务端以「分」存储
  finance: {
    async bootstrap(month) { return fetchPages('/finance/bootstrap', { month }); },
    async accountCreate(data) { return fetchPages('/finance/accountCreate', data); },
    async accountUpdate(id, data) { return fetchPages('/finance/accountUpdate', { id, ...data }); },
    async accountRemove(id) { return fetchPages('/finance/accountRemove', { id }); },
    async categoryCreate(data) { return fetchPages('/finance/categoryCreate', data); },
    async categoryUpdate(id, data) { return fetchPages('/finance/categoryUpdate', { id, ...data }); },
    async categoryRemove(id) { return fetchPages('/finance/categoryRemove', { id }); },
    async txCreate(data) { return fetchPages('/finance/txCreate', data); },
    async txUpdate(id, data) { return fetchPages('/finance/txUpdate', { id, ...data }); },
    async txRemove(id) { return fetchPages('/finance/txRemove', { id }); },
    async goalCreate(data) { return fetchPages('/finance/goalCreate', data); },
    async goalUpdate(id, data) { return fetchPages('/finance/goalUpdate', { id, ...data }); },
    async goalRemove(id) { return fetchPages('/finance/goalRemove', { id }); },
    async goalDeposit(data) { return fetchPages('/finance/goalDeposit', data); },
  },

  migrate: {
    async run(payload) { return fetchPages('/migrate', payload); },
  },

  // 全量数据导出（只读）：服务端按表返回当前用户全部业务数据，供「设置 → 备份与迁移」一键备份
  //   返回 { ok, exportedAt, userId, counts, tables, errors }
  backup: {
    async export() { return fetchPages('/backup/export', {}, 'GET'); },
    // 覆盖式还原：tables 为导出文件里的 server.tables，confirm 为服务端二次确认标记
    async restore(tables) { return fetchPages('/backup/restore', { tables, confirm: true }); },
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

  // 种植花架（生活页 · 种植类目）：图片 base64 存后端，CRUD 对齐其他模块
  plants: {
    // list 只回元数据（秒开）；image 按 id+ver 单独拉取，ver 变则 URL 变（浏览器缓存友好）
    //   archived 传 true 时只回已归档（归档箱），缺省只回在架植物
    async list(archived) { return fetchPages(`/plants/list${archived ? '?archived=1' : ''}`, {}, 'GET'); },
    async image(id, ver) { return fetchPages(`/plants/image?id=${id}&v=${ver || 0}`, {}, 'GET'); },
    async create(data) { return fetchPages('/plants/create', data); },
    async update(id, data) { return fetchPages('/plants/update', { id, ...data }); },
    async remove(id) { return fetchPages('/plants/remove', { id }); },
    // 归档 / 恢复：归档走 update 的 archived 位（stamp 传客户端本地时间，保证归档日期与用户时钟一致）
    async archive(id, stamp) { return fetchPages('/plants/update', { id, archived: true, archived_at: stamp || '' }); },
    async restore(id) { return fetchPages('/plants/update', { id, archived: false }); },
    async upload(dataUrl) { return fetchPages('/plants/upload', { file: dataUrl }); },
    // 养护记录（plant_care_logs）：时间轴是事实来源，last_watered/last_fertilized 为其派生缓存
    //   careLogs 传 kind 可按动作筛选；carePhoto 按 id+ver 拉单张照片（可空，形如 { image: null }）
    async careLogs(plantId, kind) {
      const q = `/plants/careLogs?plant_id=${plantId}${kind ? `&kind=${kind}` : ''}`;
      return fetchPages(q, {}, 'GET');
    },
    async careLogCreate(data) { return fetchPages('/plants/careLog/create', data); },
    async careLogUpdate(id, data) { return fetchPages('/plants/careLog/update', { id, ...data }); },
    async careLogRemove(id) { return fetchPages('/plants/careLog/remove', { id }); },
    async carePhoto(id, ver) { return fetchPages(`/plants/carePhoto?id=${id}&v=${ver || 0}`, {}, 'GET'); },
  },

  // GitHub PAT 托管 + AI 推送授权（仅 owner，后端锁定 1429000825@qq.com）
  github: {
    // 托管状态：只返回掩码 / 授权开关 / 审计信息，永不返回 PAT 明文
    async status() { return fetchPages('/github/status', {}, 'GET'); },
    // 验证并加密保存 PAT（返回掩码 + GitHub 登录名）
    async setToken(pat) { return fetchPages('/github/setToken', { pat }); },
    // 开启返回时限 grant code（默认 1 天，可选 720=1 个月 / 2160=3 个月），关闭作废全部 code
    async toggleGrant(enabled, ttlHours) { return fetchPages('/github/toggleGrant', { enabled: !!enabled, ttl_hours: ttlHours || 24 }); },
    // 彻底删除托管的 PAT 及授权状态
    async clearToken() { return fetchPages('/github/clearToken', {}); },
  },
};

// 兼容引用：保留 DEFAULT_USER_ID 导出（部分旧代码可能引用）
export { DEFAULT_USER_ID };
