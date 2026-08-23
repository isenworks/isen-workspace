-- ============================================================
-- Cloudflare D1 初始化 SQL（SQLite 方言）
-- 真实表结构与 Supabase 迁移 1:1 对齐
-- 用法：Cloudflare Dashboard → D1 → ethan-workspace-db → Console → 整段粘贴 Run
-- ============================================================

PRAGMA foreign_keys = ON;

-- ------------------------------------------------------------
-- 1. ethan_profiles （单用户简化：无外键 auth.users，id 即 user_id 存 UUID 字符串）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ethan_profiles (
  id           TEXT PRIMARY KEY,          -- UUID 字符串
  username     TEXT,
  avatar       TEXT DEFAULT '',
  is_banned    INTEGER DEFAULT 0,         -- 0=false, 1=true
  created_at   TEXT DEFAULT (datetime('now'))
);

-- ------------------------------------------------------------
-- 2. ethan_schedules（日程/事项）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ethan_schedules (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      TEXT NOT NULL,
  title        TEXT NOT NULL,
  date         TEXT NOT NULL,              -- 'YYYY-MM-DD'
  start_time   TEXT,                       -- 'HH:MM'
  end_time     TEXT,                       -- 'HH:MM'
  duration_min INTEGER,
  is_key       INTEGER DEFAULT 0,
  category     INTEGER DEFAULT 3,
  is_done      INTEGER DEFAULT 0,
  sort_order   INTEGER DEFAULT 0,
  created_at   TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ethan_schedules_user_date ON ethan_schedules(user_id, date);

-- ------------------------------------------------------------
-- 3. ethan_tasks（待办任务）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ethan_tasks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      TEXT NOT NULL,
  title        TEXT NOT NULL,
  date         TEXT NOT NULL,              -- 'YYYY-MM-DD'
  priority     INTEGER DEFAULT 2,
  is_done      INTEGER DEFAULT 0,
  due_time     TEXT,                       -- 'HH:MM'
  sort_order   INTEGER DEFAULT 0,
  created_at   TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ethan_tasks_user_date ON ethan_tasks(user_id, date);

-- ------------------------------------------------------------
-- 4. ethan_habits（习惯定义）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ethan_habits (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       TEXT NOT NULL,
  name          TEXT NOT NULL,
  emoji         TEXT DEFAULT '✅',
  accent_color  TEXT DEFAULT '#34c759',
  target_time   TEXT,                      -- 'HH:MM' 单目标时间（兼容旧）
  duration_min  INTEGER,
  sort_order    INTEGER DEFAULT 0,
  archived      INTEGER DEFAULT 0,
  start_time    TEXT,                      -- 时间线显示开始时间
  end_time      TEXT,                      -- 时间线显示结束时间
  growth_type   TEXT DEFAULT 'energy',     -- energy / mind / skill / work / life
  target_mode   TEXT DEFAULT 'check',      -- check | count
  target_value  REAL,                      -- count 模式目标数量，SQLite 用 REAL
  target_unit   TEXT,                      -- 次/杯/毫升/...
  streak_goal   INTEGER,                   -- 连续天数目标
  auto_log      INTEGER DEFAULT 1,
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now'))
);

-- ------------------------------------------------------------
-- 5. ethan_habit_logs（打卡记录，保留全部增强字段）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ethan_habit_logs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  habit_id     INTEGER NOT NULL,
  user_id      TEXT NOT NULL,
  date         TEXT NOT NULL,
  done         INTEGER DEFAULT 1,
  sleep_start  TEXT,
  sleep_end    TEXT,
  wake_state   TEXT,                       -- 兼容旧字段
  energy_state TEXT,                       -- energized / normal / poor
  mood_state   TEXT,                       -- positive / neutral / negative
  sleep_note   TEXT,
  data_source  TEXT,                       -- manual | huawei | feishu_import
  actual_value REAL DEFAULT 0,             -- count 模式实际值
  note         TEXT,
  UNIQUE(habit_id, date)
);
CREATE INDEX IF NOT EXISTS idx_ethan_habit_logs_user_date ON ethan_habit_logs(user_id, date);
CREATE INDEX IF NOT EXISTS idx_ethan_habit_logs_habit_date ON ethan_habit_logs(habit_id, date);

-- ------------------------------------------------------------
-- 6. ethan_summaries（每日复盘）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ethan_summaries (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      TEXT NOT NULL,
  date         TEXT NOT NULL,
  content      TEXT NOT NULL,
  mood         TEXT,
  created_at   TEXT DEFAULT (datetime('now')),
  updated_at   TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, date)
);
CREATE INDEX IF NOT EXISTS idx_ethan_summaries_user_date ON ethan_summaries(user_id, date);

-- ------------------------------------------------------------
-- 7. ethan_fixed_schedules（固定日程，每日重复的时间线提醒）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ethan_fixed_schedules (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      TEXT NOT NULL,
  name         TEXT NOT NULL,
  emoji        TEXT DEFAULT '📌',
  start_time   TEXT NOT NULL,              -- 'HH:MM'
  end_time     TEXT NOT NULL,              -- 'HH:MM'
  sort_order   INTEGER DEFAULT 0,
  created_at   TEXT DEFAULT (datetime('now')),
  updated_at   TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ethan_fixed_schedules_user ON ethan_fixed_schedules(user_id, sort_order);
