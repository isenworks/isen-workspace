import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { db } from './db.js';
import authRoutes from './routes/auth.js';
import scheduleRoutes from './routes/schedules.js';
import taskRoutes from './routes/tasks.js';
import habitRoutes from './routes/habits.js';
import summaryRoutes from './routes/summaries.js';

const app = express();
const PORT = process.env.PORT || 4000;
// HMAC token 签名密钥（同 Functions 端：HMAC-SHA256两段式 <b64(uid)>.<b64(hmac)>）
export const HMAC_SECRET = process.env.HMAC_SECRET || process.env.JWT_SECRET || 'personal-workspace-dev-secret-change-me';
export const PBKDF2_ITER = 100000;
export const PBKDF2_PREFIX = '$pbkdf2-sha256$';

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// 静态托管前端构建产物（生产环境）
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const clientDist = join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
}

// ============================================================
// HMAC token / PBKDF2 工具（同 Functions 端，crypto 原生 Node 实现）
// ============================================================
function ab2b64url(buf) {
  const a = Buffer.isBuffer(buf) ? buf : Buffer.from(new Uint8Array(buf.buffer || buf));
  return a.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function b64urlDecode(s) {
  let b = s.replace(/-/g, '+').replace(/_/g, '/');
  while (b.length % 4) b += '=';
  return Buffer.from(b, 'base64');
}
export function signTokenExpress(userId) {
  const uidStr = String(userId);
  const uidB64 = ab2b64url(Buffer.from(uidStr, 'utf8'));
  const sig = crypto.createHmac('sha256', HMAC_SECRET).update(uidStr).digest();
  return uidB64 + '.' + ab2b64url(sig);
}
export function verifyTokenExpress(token) {
  if (!token || typeof token !== 'string') return null;
  const idx = token.lastIndexOf('.');
  if (idx <= 0) return null;
  const uidB64 = token.slice(0, idx);
  const sigB64 = token.slice(idx + 1);
  let uid;
  try { uid = b64urlDecode(uidB64).toString('utf8'); }
  catch { return null; }
  const expected = ab2b64url(crypto.createHmac('sha256', HMAC_SECRET).update(String(uid)).digest());
  if (sigB64.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < sigB64.length; i++) diff |= sigB64.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0 ? String(uid) : null;
}
export function hashPasswordExpress(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(String(password || ''), Buffer.from(salt, 'hex'), PBKDF2_ITER, 32, 'sha256').toString('hex');
  return `${PBKDF2_PREFIX}${PBKDF2_ITER}$${salt}$${hash}`;
}
export function verifyPasswordExpress(password, stored) {
  if (!stored || typeof stored !== 'string') return false;
  if (stored.startsWith(PBKDF2_PREFIX)) {
    const rest = stored.slice(PBKDF2_PREFIX.length);
    const parts = rest.split('$');
    if (parts.length !== 3) return false;
    const iter = parseInt(parts[0], 10);
    const salt = parts[1];
    const expected = parts[2];
    if (!iter || !salt || !expected) return false;
    try {
      const got = crypto.pbkdf2Sync(String(password || ''), Buffer.from(salt, 'hex'), iter, 32, 'sha256').toString('hex');
      if (got.length !== expected.length) return false;
      let d = 0;
      for (let i = 0; i < got.length; i++) d |= got.charCodeAt(i) ^ expected.charCodeAt(i);
      return d === 0;
    } catch { return false; }
  }
  // 兼容老 bcrypt hash（Express 旧系统用户）
  if (/^\$2[ayb]\$/.test(stored)) {
    try { return bcrypt.compareSync(String(password || ''), stored); }
    catch { return false; }
  }
  // 明文降级（极少用）
  return stored === String(password || '');
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export { EMAIL_RE };

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// 鉴权中间件（与 Functions 端对齐：从 X-Unlock-Token 或 Authorization Bearer 取 HMAC token）
export function auth(req, res, next) {
  let token = (req.headers.authorization || '').startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : null;
  if (!token) token = req.headers['x-unlock-token'] || null;
  if (!token) return res.status(401).json({ error: '需要登录' });
  const uidStr = verifyTokenExpress(token);
  if (!uidStr) return res.status(401).json({ error: '登录已过期，请重新登录' });
  // Express 侧 users.id 是整数（autoinc），SQLite INTEGER 存储的 user_id 在业务表里都为 INTEGER：转数字
  const uid = Number(uidStr);
  if (Number.isNaN(uid) || !Number.isFinite(uid)) return res.status(401).json({ error: '登录信息无效' });
  const user = db.prepare('SELECT id, email, username, avatar, is_owner FROM users WHERE id = ?').get(uid);
  if (!user) return res.status(401).json({ error: '用户不存在' });
  req.user = {
    id: user.id,
    email: user.email || '',
    username: user.username || (user.email || '').split('@')[0] || ('User' + user.id),
    avatar: user.avatar || 'U',
    is_owner: !!user.is_owner,
  };
  next();
}

app.use('/api/auth', authRoutes);
app.use('/api/schedules', auth, scheduleRoutes);
app.use('/api/tasks', auth, taskRoutes);
app.use('/api/habits', auth, habitRoutes);
app.use('/api/summaries', auth, summaryRoutes);

// 兜底：SPA 路由回退到 index.html
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  if (fs.existsSync(clientDist)) {
    res.sendFile(join(clientDist, 'index.html'));
  } else {
    res.status(404).json({ error: '前端未构建，请先运行 npm run build' });
  }
});

// 统一错误处理
app.use((err, req, res, next) => {
  console.error('[ERROR]', err);
  res.status(500).json({ error: err.message || '服务器错误' });
});

app.listen(PORT, () => {
  console.log(`✅ Workspace API running at http://localhost:${PORT}`);
});
