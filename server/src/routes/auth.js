import { Router } from 'express';
import { db } from '../db.js';
import {
  signTokenExpress,
  hashPasswordExpress,
  verifyPasswordExpress,
  verifyTokenExpress,
  EMAIL_RE,
} from '../index.js';

const router = Router();
const INVITE_CODE = (process.env.REGISTER_INVITE_CODE || '').trim();
const BOOTSTRAP_CODE = (process.env.BOOTSTRAP_OWNER_CODE || '').trim();

const AUTH_FAIL = { error: '邮箱或密码错误', code: 'AUTH_FAIL' };
function safeUser(u) {
  if (!u) return null;
  return {
    id: String(u.id),          // 转字符串对齐 Functions/D1 前端习惯：id 全是字符串比较
    email: u.email || '',
    username: u.username || (u.email || '').split('@')[0] || ('User' + u.id),
    avatar: u.avatar || 'U',
    is_owner: !!u.is_owner,
  };
}

// 默认习惯模板（D1/线上 ethan_habits 对齐：作息 streak_goal=30 growth_type 分类等）
const DEFAULT_HABITS = [
  {
    name: '作息', emoji: '😴', accent_color: '#34C759',
    growth_type: 'energy', start_time: '23:30', end_time: '06:44', duration_min: 434,
    target_mode: 'check', target_value: null, target_unit: '天', streak_goal: 30, auto_log: 1,
  },
  {
    name: '运动', emoji: '🏃', accent_color: '#34C759',
    growth_type: 'energy', start_time: '07:00', end_time: '07:30', duration_min: 30,
    target_mode: 'check', target_value: null, target_unit: '天', streak_goal: 30, auto_log: 1,
  },
  {
    name: '喝水', emoji: '🥤', accent_color: '#34C759',
    growth_type: 'energy', target_mode: 'count', target_value: 2, target_unit: 'L/天', streak_goal: 30, auto_log: 1,
  },
  {
    name: '今日总结+明日计划', emoji: '📝', accent_color: '#007AFF',
    growth_type: 'mind', start_time: '21:30', end_time: '22:00', duration_min: 30,
    target_mode: 'check', streak_goal: 30, auto_log: 1,
  },
  {
    name: '看书', emoji: '📖', accent_color: '#007AFF',
    growth_type: 'mind', start_time: '08:00', end_time: '08:30', duration_min: 30,
    target_mode: 'check', streak_goal: 30, auto_log: 1,
  },
  {
    name: '即兴表达练习', emoji: '🎙️', accent_color: '#FFCC00',
    growth_type: 'skill', duration_min: 15, target_mode: 'check', streak_goal: 30, auto_log: 1,
  },
  {
    name: '英语口语练习', emoji: '🔤', accent_color: '#FFCC00',
    growth_type: 'skill', duration_min: 15, target_mode: 'check', streak_goal: 30, auto_log: 1,
  },
];

function seedDefaultHabits(userId) {
  const insert = db.prepare(`
    INSERT INTO habits
      (user_id, name, emoji, accent_color, growth_type,
       start_time, end_time, duration_min, sort_order,
       target_mode, target_value, target_unit, streak_goal, auto_log, archived)
    VALUES (@user_id, @name, @emoji, @accent_color, @growth_type,
            @start_time, @end_time, @duration_min, @sort_order,
            @target_mode, @target_value, @target_unit, @streak_goal, @auto_log, 0)
  `);
  const tx = db.transaction((habits) => {
    habits.forEach((h, i) => insert.run({ ...h, user_id: userId, sort_order: i }));
  });
  tx(DEFAULT_HABITS);
}

// GET /api/auth/login：模式探测
router.get('/login', (req, res) => {
  res.json({
    ok: true,
    modes: {
      ownerBootstrap: !!BOOTSTRAP_CODE,
      openRegister: !!INVITE_CODE,
    },
  });
});

// ---------------- bootstrapOwner：一次性插入本地第一个 owner（id=1，对齐 D1 DEFAULT_USER_ID 的"owner角色"）
router.post('/bootstrapOwner', (req, res) => {
  const { bootstrap_code, email, username, password } = req.body || {};
  if (!BOOTSTRAP_CODE) return res.status(400).json({ error: '未配置 BOOTSTRAP_OWNER_CODE（env）' });
  if (String(bootstrap_code || '').trim() !== BOOTSTRAP_CODE) return res.status(403).json({ error: 'bootstrap_code 不匹配' });
  if (!EMAIL_RE.test(String(email || ''))) return res.status(400).json({ error: '邮箱格式不正确' });
  if (String(password || '').length < 6) return res.status(400).json({ error: '密码至少 6 位' });
  try {
    const existingOwner = db.prepare('SELECT id FROM users WHERE is_owner = 1').get();
    if (existingOwner) return res.status(409).json({ error: 'owner 账号已存在' });
    const ph = hashPasswordExpress(password);
    const now = new Date().toISOString();
    const info = db.prepare(`INSERT INTO users (email, username, password, avatar, is_owner, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, ?, ?)`).run(
        String(email).toLowerCase(),
        username || String(email).split('@')[0],
        ph,
        ((username || email || 'E').slice(0, 1).toUpperCase()),
        now, now,
      );
    const userId = Number(info.lastInsertRowid);
    // 首个本地 owner：如果没有任何习惯，给一份默认习惯
    const cnt = db.prepare('SELECT COUNT(*) AS c FROM habits WHERE user_id = ?').get(userId).c;
    if (cnt === 0) seedDefaultHabits(userId);
    const user = db.prepare('SELECT id, email, username, avatar, is_owner FROM users WHERE id = ?').get(userId);
    const token = signTokenExpress(user.id);
    res.json({ ok: true, user: safeUser(user), token });
  } catch (e) {
    // email UNIQUE 冲突等
    if (String(e.message || '').includes('UNIQUE constraint') || String(e.message || '').includes('idx_users_email')) {
      return res.status(400).json({ error: AUTH_FAIL.error });
    }
    res.status(500).json({ error: e.message || String(e) });
  }
});

// ---------------- register：邀请码注册新用户（非 owner）
router.post('/register', (req, res) => {
  const { invite_code, inviteCode, email, username, password } = req.body || {};
  const invite = String(invite_code || inviteCode || '').trim().toUpperCase();
  if (!INVITE_CODE) return res.status(403).json({ error: '管理员未开放注册（缺少 env REGISTER_INVITE_CODE）' });
  if (!invite || invite !== INVITE_CODE.toUpperCase()) return res.status(403).json({ error: '邀请码无效或已过期' });
  if (!EMAIL_RE.test(String(email || ''))) return res.status(400).json({ error: '邮箱格式不正确' });
  if (String(password || '').length < 6) return res.status(400).json({ error: '密码至少 6 位' });
  try {
    const ph = hashPasswordExpress(password);
    const now = new Date().toISOString();
    const info = db.prepare(`INSERT INTO users (email, username, password, avatar, is_owner, created_at, updated_at)
      VALUES (?, ?, ?, ?, 0, ?, ?)`).run(
        String(email).toLowerCase(),
        username || String(email).split('@')[0],
        ph,
        ((username || email || 'U').slice(0, 1).toUpperCase()),
        now, now,
      );
    const userId = Number(info.lastInsertRowid);
    // 新用户默认给一套习惯模板，空框架更像"工作台"而不是"空表单"
    seedDefaultHabits(userId);
    const user = db.prepare('SELECT id, email, username, avatar, is_owner FROM users WHERE id = ?').get(userId);
    const token = signTokenExpress(user.id);
    res.json({ ok: true, user: safeUser(user), token });
  } catch (e) {
    if (String(e.message || '').includes('UNIQUE') || String(e.message || '').includes('idx_users_email')) {
      return res.status(400).json({ error: AUTH_FAIL.error });
    }
    res.status(500).json({ error: e.message || String(e) });
  }
});

// ---------------- login：邮箱 + 密码
router.post('/login', (req, res) => {
  const { email, username, password } = req.body || {};
  const loginEmail = String(email || username || '').trim().toLowerCase();
  const pwd = String(password || '');
  if (!EMAIL_RE.test(loginEmail) || !pwd) return res.status(401).json({ ...AUTH_FAIL });
  try {
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(loginEmail);
    if (!user) return res.status(401).json({ ...AUTH_FAIL });
    if (!verifyPasswordExpress(pwd, user.password)) return res.status(401).json({ ...AUTH_FAIL });
    // 本地老用户（demo ethan）没有习惯，补齐
    const cnt = db.prepare('SELECT COUNT(*) AS c FROM habits WHERE user_id = ? AND archived = 0').get(user.id).c;
    if (cnt === 0) seedDefaultHabits(user.id);
    const token = signTokenExpress(user.id);
    res.json({ ok: true, token, user: safeUser(user) });
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
});

// ---------------- me：当前用户
router.get('/me', (req, res) => {
  const token = (req.headers.authorization || '').startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : (req.headers['x-unlock-token'] || null);
  if (!token) return res.json({ user: null });
  const uidStr = verifyTokenExpress(token);
  if (!uidStr) return res.json({ user: null });
  const uid = Number(uidStr);
  if (Number.isNaN(uid)) return res.json({ user: null });
  const user = db.prepare('SELECT id, email, username, avatar, is_owner FROM users WHERE id = ?').get(uid);
  if (!user) return res.json({ user: null });
  return res.json({ user: safeUser(user) });
});

router.post('/logout', (req, res) => res.json({ ok: true }));

export default router;
