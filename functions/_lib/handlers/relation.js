// ============================================================
// /api/relation/* 关系记录（每天相处状态 + 经期区间）
//   设计要点：
//   · 每天一条状态（融洽/一般/有摩擦/她不舒服），空标签+空备注 = 删除该天记录
//   · 经期是「区间」不是逐日勾选：开始/结束两个动作，统计时按相位（经前/经期/经后）切分
//   · 空白天 = 未记录，不默认成「融洽」（避免把没记的日子当成好日子）
// ============================================================
import { json, uid, dbAll, dbFirst, dbRun } from '../core.js';

export const REL_TAGS = ['harmony', 'normal', 'friction', 'unwell'];
// 首次使用时写入的默认标签（key 固定，改的是 label/color，统计口径不随改名漂移）
const SEED_TAGS = [
  { key: 'harmony', label: '融洽', color: '#34C759', sort: 1 },
  { key: 'normal', label: '一般', color: '#FFCC00', sort: 2 },
  { key: 'friction', label: '有摩擦', color: '#FF3B30', sort: 3 },
  { key: 'unwell', label: '她不舒服', color: '#AF52DE', sort: 4 },
];
// 心情固定预设（记录用，不参与标签增删）
export const REL_MOODS = ['happy', 'steady', 'low', 'irritable'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// 懒迁移：Worker isolate 内复用，避免每次请求都跑 DDL
let _relationReady = false;

export async function ensureRelationTables(env) {
  if (_relationReady) return;
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS ethan_relation_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      date TEXT NOT NULL,
      tag TEXT DEFAULT '',
      mood TEXT DEFAULT '',
      note TEXT DEFAULT '',
      mood_note TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `).run();
  // 老库补列：心情及其原因是后加的字段
  const cols = await dbAll(env.DB, `PRAGMA table_info(ethan_relation_logs)`);
  if (!cols.some(c => c.name === 'mood')) {
    await env.DB.prepare(`ALTER TABLE ethan_relation_logs ADD COLUMN mood TEXT DEFAULT ''`).run();
  }
  if (!cols.some(c => c.name === 'mood_note')) {
    await env.DB.prepare(`ALTER TABLE ethan_relation_logs ADD COLUMN mood_note TEXT DEFAULT ''`).run();
  }
  await env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_relation_logs_user_date ON ethan_relation_logs(user_id, date)`).run();
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS ethan_relation_periods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_relation_periods_user ON ethan_relation_periods(user_id, start_date)`).run();
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS ethan_relation_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      key TEXT NOT NULL,
      label TEXT NOT NULL,
      color TEXT DEFAULT '#8E8E93',
      sort INTEGER DEFAULT 0,
      UNIQUE(user_id, key)
    )
  `).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_relation_tags_user ON ethan_relation_tags(user_id, sort)`).run();
  _relationReady = true;
}

// 每个用户首次访问时灌默认标签（放在按用户查询的入口里，DDL 不关心用户）
async function ensureRelationTags(env, userId) {
  const row = await dbFirst(env.DB, `SELECT COUNT(*) AS n FROM ethan_relation_tags WHERE user_id = ?`, [userId]);
  if (Number(row?.n) > 0) return;
  for (const t of SEED_TAGS) {
    await dbRun(
      env.DB,
      `INSERT OR IGNORE INTO ethan_relation_tags (user_id, key, label, color, sort) VALUES (?, ?, ?, ?, ?)`,
      [userId, t.key, t.label, t.color, t.sort]
    );
  }
}

async function listTags(env, userId) {
  return dbAll(
    env.DB,
    `SELECT key, label, color FROM ethan_relation_tags WHERE user_id = ? ORDER BY sort, id`,
    [userId]
  );
}

// ---------------- relation.list
// 入参 { from, to }：返回区间内的每日记录 + 与该区间有交集的经期
export async function handleRelationList(env, q) {
  await ensureRelationTables(env);
  const userId = uid(env);
  await ensureRelationTags(env, userId);
  const from = DATE_RE.test(q?.from) ? q.from : '1970-01-01';
  const to = DATE_RE.test(q?.to) ? q.to : '2999-12-31';

  const logs = await dbAll(
    env.DB,
    `SELECT date, tag, mood, note, mood_note FROM ethan_relation_logs
      WHERE user_id = ? AND date >= ? AND date <= ?
      ORDER BY date`,
    [userId, from, to]
  );
  // 经期多取一段（from 之前开始的区间可能仍覆盖 from），由前端按日期裁剪
  const periods = await dbAll(
    env.DB,
    `SELECT id, start_date, end_date FROM ethan_relation_periods
      WHERE user_id = ? AND start_date <= ? AND (end_date IS NULL OR end_date >= ?)
      ORDER BY start_date DESC`,
    [userId, to, from]
  );
  const tags = await listTags(env, userId);
  return json({ logs, periods, tags });
}

// ---------------- relation.tags
// 入参 { action: 'save'|'remove', key?, label?, color? }
export async function handleRelationTags(env, body) {
  await ensureRelationTables(env);
  const userId = uid(env);
  await ensureRelationTags(env, userId);
  const action = String(body?.action || 'list');

  if (action === 'list') return json({ tags: await listTags(env, userId) });

  if (action === 'save') {
    const label = String(body?.label || '').trim().slice(0, 12);
    const color = /^#[0-9a-fA-F]{6}$/.test(String(body?.color || '')) ? body.color : '#8E8E93';
    if (!label) return json({ error: '标签名不能为空' }, 400);
    const key = String(body?.key || '').trim();
    if (key) {
      await dbRun(
        env.DB,
        `UPDATE ethan_relation_tags SET label = ?, color = ? WHERE user_id = ? AND key = ?`,
        [label, color, userId, key]
      );
    } else {
      const cnt = await dbFirst(env.DB, `SELECT COUNT(*) AS n FROM ethan_relation_tags WHERE user_id = ?`, [userId]);
      const newKey = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
      await dbRun(
        env.DB,
        `INSERT INTO ethan_relation_tags (user_id, key, label, color, sort) VALUES (?, ?, ?, ?, ?)`,
        [userId, newKey, label, color, Number(cnt?.n || 0) + 1]
      );
    }
    return json({ ok: true, tags: await listTags(env, userId) });
  }

  if (action === 'remove') {
    const key = String(body?.key || '');
    if (!key) return json({ error: '缺少标签 key' }, 400);
    await dbRun(env.DB, `DELETE FROM ethan_relation_tags WHERE user_id = ? AND key = ?`, [userId, key]);
    // 历史记录保留原始 key：卡片按「已删除」灰标签展示，不静默丢数据
    return json({ ok: true, tags: await listTags(env, userId) });
  }

  return json({ error: '未知操作' }, 400);
}

// ---------------- relation.log
// 入参 { date, tag, mood, note, moodNote }；全部为空 → 删除该天记录
export async function handleRelationLog(env, body) {
  await ensureRelationTables(env);
  const userId = uid(env);
  const date = String(body?.date || '');
  if (!DATE_RE.test(date)) return json({ error: '日期格式不正确' }, 400);

  const tag = body?.tag == null ? '' : String(body.tag);
  const mood = body?.mood == null ? '' : String(body.mood);
  const note = String(body?.note || '').slice(0, 1000);
  const moodNote = String(body?.moodNote || '').slice(0, 1000);
  if (mood && !REL_MOODS.includes(mood)) return json({ error: '无效的心情' }, 400);

  if (!tag && !mood && !note && !moodNote) {
    await dbRun(env.DB, `DELETE FROM ethan_relation_logs WHERE user_id = ? AND date = ?`, [userId, date]);
    return json({ ok: true, deleted: true });
  }
  await dbRun(
    env.DB,
    `INSERT INTO ethan_relation_logs (user_id, date, tag, mood, note, mood_note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
     ON CONFLICT(user_id, date) DO UPDATE SET
       tag = excluded.tag,
       mood = excluded.mood,
       note = excluded.note,
       mood_note = excluded.mood_note,
       updated_at = datetime('now')`,
    [userId, date, tag, mood, note, moodNote]
  );
  return json({ ok: true });
}

// ---------------- relation.period
// 入参 { action: start|end|clear, date }
export async function handleRelationPeriod(env, body) {
  await ensureRelationTables(env);
  const userId = uid(env);
  const date = String(body?.date || '');
  const action = String(body?.action || '');
  if (!DATE_RE.test(date)) return json({ error: '日期格式不正确' }, 400);

  const open = await dbFirst(
    env.DB,
    `SELECT id, start_date FROM ethan_relation_periods
      WHERE user_id = ? AND end_date IS NULL
      ORDER BY start_date DESC LIMIT 1`,
    [userId]
  );

  if (action === 'start') {
    // 同日重复点击视为无变化，避免产生 0 天空区间
    if (open && open.start_date === date) return json({ ok: true, unchanged: true });
    // 上一段还没结束就开了新一段：把上一段补到开始前一天，防止区间互相覆盖
    if (open) {
      const prev = addDays(date, -1);
      await dbRun(env.DB, `UPDATE ethan_relation_periods SET end_date = ? WHERE id = ?`, [
        prev < open.start_date ? open.start_date : prev,
        open.id,
      ]);
    }
    await dbRun(
      env.DB,
      `INSERT INTO ethan_relation_periods (user_id, start_date, created_at) VALUES (?, ?, datetime('now'))`,
      [userId, date]
    );
    return json({ ok: true });
  }

  if (action === 'end') {
    if (!open) return json({ ok: true, unchanged: true });
    // 结束日不能早于开始日
    const end = date < open.start_date ? open.start_date : date;
    await dbRun(env.DB, `UPDATE ethan_relation_periods SET end_date = ? WHERE id = ?`, [end, open.id]);
    return json({ ok: true });
  }

  if (action === 'create') {
    // 手动补录一段（历史补记）：起止都可指定，结束可空（进行中）
    const start = String(body?.start_date || '');
    const endRaw = body?.end_date == null ? '' : String(body.end_date);
    if (!DATE_RE.test(start)) return json({ error: '开始日期格式不正确' }, 400);
    if (endRaw && !DATE_RE.test(endRaw)) return json({ error: '结束日期格式不正确' }, 400);
    if (endRaw && endRaw < start) return json({ error: '结束日期不能早于开始日期' }, 400);
    await dbRun(
      env.DB,
      `INSERT INTO ethan_relation_periods (user_id, start_date, end_date, created_at) VALUES (?, ?, ?, datetime('now'))`,
      [userId, start, endRaw || null]
    );
    return json({ ok: true });
  }

  if (action === 'update') {
    const id = Number(body?.id);
    const start = String(body?.start_date || '');
    const endRaw = body?.end_date == null ? '' : String(body.end_date);
    if (!id || !DATE_RE.test(start)) return json({ error: '日期格式不正确' }, 400);
    if (endRaw && !DATE_RE.test(endRaw)) return json({ error: '结束日期格式不正确' }, 400);
    if (endRaw && endRaw < start) return json({ error: '结束日期不能早于开始日期' }, 400);
    await dbRun(
      env.DB,
      `UPDATE ethan_relation_periods SET start_date = ?, end_date = ? WHERE id = ? AND user_id = ?`,
      [start, endRaw || null, id, userId]
    );
    return json({ ok: true });
  }

  if (action === 'remove') {
    const id = Number(body?.id);
    if (!id) return json({ error: '缺少区间 id' }, 400);
    await dbRun(env.DB, `DELETE FROM ethan_relation_periods WHERE id = ? AND user_id = ?`, [id, userId]);
    return json({ ok: true });
  }

  if (action === 'clear') {
    if (!open) return json({ ok: true, unchanged: true });
    await dbRun(env.DB, `DELETE FROM ethan_relation_periods WHERE id = ?`, [open.id]);
    return json({ ok: true });
  }

  return json({ error: '无效的操作' }, 400);
}

// 日期加减（date-only，按 UTC 避免时区偏移）
function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d) + n * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}
