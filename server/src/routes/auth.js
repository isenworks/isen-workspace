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

// 登录（D1 单人模式 + 常规登录双兼容）
router.post('/login', (req, res) => {
  const { username, password, email } = req.body || {};
  const uname = username || email || '';
  const pwd = password || '';

  // D1 单人免登录模式：Pages Functions 同款，空邮箱空密码 = 解锁进入
  if (!uname && !pwd) {
    const user = db.prepare('SELECT id, username, avatar FROM users ORDER BY id LIMIT 1').get();
    if (!user) return res.status(400).json({ error: '请先注册用户' });
    // D1 版默认习惯初始化
    const count = db.prepare('SELECT COUNT(*) as c FROM habits WHERE user_id = ? AND archived = 0').get(user.id).c;
    if (count === 0) {
      const insertHabit = db.prepare(`
        INSERT INTO habits (user_id, name, emoji, accent_color, target_time, duration_min, sort_order,
                            start_time, end_time, growth_type, target_mode, streak_goal, auto_log)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const tx = db.transaction((habits) => {
        habits.forEach((h, i) => {
          const sleep = /睡|作息/.test(h.name);
          const exercise = /运动/.test(h.name);
          const water = /水/.test(h.name);
          const reading = /看书/.test(h.name);
          const growthType = sleep || exercise || water ? 'energy' : (reading ? 'mind' : 'skill');
          insertHabit.run(
            user.id, h.name, h.emoji, h.accent_color,
            h.target_time, h.duration_min, i,
            sleep ? '23:30' : (h.target_time || null),
            sleep ? '06:44' : null,
            growthType,
            water ? 'count' : 'check',
            water ? 2 : null, '天',
            30, 1
          );
        });
      });
      tx(DEFAULT_HABITS);
    }
    const token = sign(user);
    return res.json({
      user: { id: String(user.id), username: user.username, avatar: user.avatar },
      token,
    });
  }

  if (!uname || !pwd) return res.status(400).json({ error: '用户名和密码必填' });
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(uname);
  if (!user) return res.status(400).json({ error: '用户不存在' });
  if (!bcrypt.compareSync(pwd, user.password)) return res.status(400).json({ error: '密码错误' });
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
