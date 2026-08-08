import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dataDir = join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = join(dataDir, 'workspace.db');
export const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ============ Schema ============
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    avatar TEXT DEFAULT 'E',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    date TEXT NOT NULL,            -- YYYY-MM-DD
    start_time TEXT,              -- HH:mm
    end_time TEXT,                -- HH:mm
    duration_min INTEGER,
    is_key INTEGER DEFAULT 0,     -- 兼容旧字段：是否重点事项
    category INTEGER DEFAULT 3,   -- 1=重要紧急,2=重要不紧急,3=常规,4=习惯
    is_done INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_schedules_user_date ON schedules(user_id, date);

  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    date TEXT NOT NULL,
    priority INTEGER DEFAULT 2,    -- 1 高 / 2 中 / 3 低
    is_done INTEGER DEFAULT 0,
    due_time TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_tasks_user_date ON tasks(user_id, date);

  CREATE TABLE IF NOT EXISTS habits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    emoji TEXT DEFAULT '✅',
    accent_color TEXT DEFAULT '#34c759',  -- 圆点颜色: #34c759绿 / #007aff蓝 / #ffcc00黄 / #ff9500琥珀 / #ff3b30红 / #8e8e93灰
    target_time TEXT,             -- 计划时间 HH:mm
    duration_min INTEGER,
    sort_order INTEGER DEFAULT 0,
    archived INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS habit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    habit_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    date TEXT NOT NULL,           -- YYYY-MM-DD
    done INTEGER DEFAULT 1,
    UNIQUE(habit_id, date),
    FOREIGN KEY(habit_id) REFERENCES habits(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_habit_logs_user_date ON habit_logs(user_id, date);

  CREATE TABLE IF NOT EXISTS summaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    content TEXT NOT NULL,
    mood TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, date),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_summaries_user_date ON summaries(user_id, date);
`);

// 旧数据迁移：若 schedules 没有 category 列则添加，并基于 is_key + start_time 填充
try {
  const cols = db.prepare("PRAGMA table_info(schedules)").all();
  const hasCategory = cols.some(c => c.name === 'category');
  if (!hasCategory) {
    db.exec(`ALTER TABLE schedules ADD COLUMN category INTEGER DEFAULT 3`);
    db.exec(`
      UPDATE schedules SET category = 1
      WHERE is_key = 1 AND start_time IS NOT NULL AND CAST(SUBSTR(start_time,1,2) AS INTEGER) <= 12;
      UPDATE schedules SET category = 2
      WHERE is_key = 1 AND (start_time IS NULL OR CAST(SUBSTR(start_time,1,2) AS INTEGER) > 12);
    `);
  }
} catch (e) {
  console.warn('migrate category warn:', e.message);
}

// habits 表迁移：若没有 accent_color 列则添加
try {
  const cols = db.prepare("PRAGMA table_info(habits)").all();
  const hasAccent = cols.some(c => c.name === 'accent_color');
  if (!hasAccent) {
    db.exec(`ALTER TABLE habits ADD COLUMN accent_color TEXT DEFAULT '#34c759'`);
  }
} catch (e) {
  console.warn('migrate accent_color warn:', e.message);
}

export default db;
