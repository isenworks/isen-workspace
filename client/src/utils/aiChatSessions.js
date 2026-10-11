/* ============================================================
 * AI 对话会话数据层（多会话）
 *   · 会话列表：localStorage 'ai_sessions' → [{ id, title, createdAt, updatedAt }]
 *   · 会话消息：localStorage 'ai_msgs_<id>'（沿用 AIChat 的消息结构）
 *   · 旧数据迁移：首次加载把旧的单会话 'ai_messages_main' 迁移为第一个会话
 * ============================================================ */

const SESSIONS_KEY = 'ai_sessions';
const LEGACY_KEY = 'ai_messages_main';

function genId() {
  return 'sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}

// 某会话的消息存储 key（供 AIChat 的 storageKey 使用）
export function sessionKey(id) {
  return `ai_msgs_${id}`;
}

function readRaw() {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function writeRaw(list) {
  try { localStorage.setItem(SESSIONS_KEY, JSON.stringify(list)); } catch { /* ignore */ }
}

// 全部会话（按最近更新倒序）
export function getSessions() {
  return readRaw().slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

// 新建会话（排在列表顶部）
export function createSession(title = '新对话') {
  const list = readRaw();
  const now = Date.now();
  const s = { id: genId(), title, createdAt: now, updatedAt: now };
  list.push(s);
  writeRaw(list);
  return s;
}

// 重命名（不改变排序位置）
export function renameSession(id, title) {
  const next = String(title || '').trim();
  if (!next) return false;
  const list = readRaw();
  const idx = list.findIndex(s => s.id === id);
  if (idx === -1) return false;
  list[idx].title = next;
  writeRaw(list);
  return true;
}

// 触碰会话（更新 updatedAt，用于排序置顶）
export function touchSession(id) {
  const list = readRaw();
  const idx = list.findIndex(s => s.id === id);
  if (idx === -1) return false;
  list[idx].updatedAt = Date.now();
  writeRaw(list);
  return true;
}

// 删除会话（连同其消息）
export function removeSession(id) {
  writeRaw(readRaw().filter(s => s.id !== id));
  try { localStorage.removeItem(sessionKey(id)); } catch { /* ignore */ }
  return true;
}

// 从首条用户提问派生会话标题
export function deriveTitle(text, max = 18) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return '新对话';
  return t.length > max ? t.slice(0, max) + '…' : t;
}

// 是否为今天
export function isToday(ts) {
  if (!ts) return false;
  const d = new Date(ts);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

// 会话时间显示：今天 → HH:mm，昨天 → 昨天，其余 → MM-DD
export function fmtSessionTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const p = n => String(n).padStart(2, '0');
  if (isToday(ts)) return `${p(d.getHours())}:${p(d.getMinutes())}`;
  const y = new Date(now); y.setDate(y.getDate() - 1);
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, y)) return '昨天';
  return `${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// 首次加载 / 数据升级：保证至少有一个会话，并迁移旧的单会话数据
export function ensureSessions() {
  let list = readRaw();
  if (list.length > 0) return getSessions();

  let migrated = null;
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (Array.isArray(arr) && arr.length > 0) {
      const now = Date.now();
      const firstUser = arr.find(m => m.role === 'user');
      const s = { id: genId(), title: deriveTitle(firstUser?.content), createdAt: now, updatedAt: now };
      localStorage.setItem(sessionKey(s.id), JSON.stringify(arr));
      localStorage.removeItem(LEGACY_KEY);
      migrated = s;
    }
  } catch { /* ignore */ }

  if (migrated) {
    list = [migrated];
  } else {
    const now = Date.now();
    list = [{ id: genId(), title: '新对话', createdAt: now, updatedAt: now }];
  }
  writeRaw(list);
  return getSessions();
}