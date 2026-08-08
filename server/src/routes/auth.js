import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../db.js';
import { JWT_SECRET, auth } from '../index.js';

const router = Router();

function sign(user) {
  return jwt.sign({ uid: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
}

// 默认习惯模板（来自 demo）
const DEFAULT_HABITS = [
  { name: '睡眠', emoji: '😴', accent_color: '#34c759', target_time: '23:00', duration_min: 420 },
  { name: '每日运动', emoji: '🏃', accent_color: '#34c759', target_time: '06:00', duration_min: 60 },
  { name: '喝够2L水', emoji: '💧', accent_color: '#34c759', target_time: null, duration_min: null },
  { name: '看书半小时', emoji: '📖', accent_color: '#007aff', target_time: '07:30', duration_min: 30 },
  { name: '即兴表达练习', emoji: '🎤', accent_color: '#ffcc00', target_time: '07:00', duration_min: 15 },
  { name: '英语口语练习', emoji: '🗣️', accent_color: '#ffcc00', target_time: '07:15', duration_min: 15 },
];

// 注册
router.post('/register', (req, res) => {
  const { username, password, avatar } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: '用户名和密码必填' });
  if (username.length < 2 || username.length > 20) return res.status(400).json({ error: '用户名长度 2-20' });
  if (password.length < 6) return res.status(400).json({ error: '密码至少 6 位' });

  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (exists) return res.status(400).json({ error: '用户名已被占用' });

  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare('INSERT INTO users (username, password, avatar) VALUES (?, ?, ?)').run(
    username, hash, (avatar || username.charAt(0).toUpperCase())
  );
  const user = db.prepare('SELECT id, username, avatar FROM users WHERE id = ?').get(info.lastInsertRowid);

  // 插入默认习惯
  const insertHabit = db.prepare(`
    INSERT INTO habits (user_id, name, emoji, accent_color, target_time, duration_min, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const tx = db.transaction((habits) => {
    habits.forEach((h, i) => {
      insertHabit.run(user.id, h.name, h.emoji, h.accent_color, h.target_time, h.duration_min, i);
    });
  });
  tx(DEFAULT_HABITS);

  return res.json({ user, token: sign(user) });
});

// 登录
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: '用户名和密码必填' });
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) return res.status(400).json({ error: '用户不存在' });
  if (!bcrypt.compareSync(password, user.password)) return res.status(400).json({ error: '密码错误' });

  const safe = { id: user.id, username: user.username, avatar: user.avatar };
  return res.json({ user: safe, token: sign(user) });
});

// 当前用户信息
router.get('/me', auth, (req, res) => {
  res.json({ user: req.user });
});

// 更新资料
router.put('/me', auth, (req, res) => {
  const { avatar } = req.body || {};
  if (avatar) {
    db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(avatar.slice(0, 4), req.user.id);
  }
  const user = db.prepare('SELECT id, username, avatar FROM users WHERE id = ?').get(req.user.id);
  res.json({ user });
});

export default router;
