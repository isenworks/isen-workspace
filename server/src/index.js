import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from './db.js';
import authRoutes from './routes/auth.js';
import scheduleRoutes from './routes/schedules.js';
import taskRoutes from './routes/tasks.js';
import habitRoutes from './routes/habits.js';
import summaryRoutes from './routes/summaries.js';

const app = express();
const PORT = process.env.PORT || 4000;
export const JWT_SECRET = process.env.JWT_SECRET || 'personal-workspace-dev-secret-change-me';

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

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// 鉴权中间件
export function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: '未登录' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT id, username, avatar FROM users WHERE id = ?').get(payload.uid);
    if (!user) return res.status(401).json({ error: '用户不存在' });
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: '登录已过期，请重新登录' });
  }
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
