// ============================================================
// /api/relation/* 关系记录（每天相处状态 + 经期区间）
//   设计要点：
//   · 每天一条状态（融洽/一般/有摩擦/她不舒服），空标签+空备注 = 删除该天记录
//   · 经期是「区间」不是逐日勾选：开始/结束两个动作，统计时按相位（经前/经期/经后）切分
//   · 空白天 = 未记录，不默认成「融洽」（避免把没记的日子当成好日子）
// ============================================================
import { json, uid, dbAll, dbFirst, dbRun } from '../core.js';

export const REL_TAGS = ['harmony', 'normal', 'friction', 'unwell'];
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
      note TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `).run();
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
  _relationReady = true;
}

// ---------------- relation.list
// 入参 { from, to }：返回区间内的每日记录 + 与该区间有交集的经期
export async function handleRelationList(env, q) {
  await ensureRelationTables(env);
  const userId = uid(env);
  const from = DATE_RE.test(q?.from) ? q.from : '1970-01-01';
  const to = DATE_RE.test(q?.to) ? q.to : '2999-12-31';

  const logs = await dbAll(
    env.DB,
    `SELECT date, tag, note FROM ethan_relation_logs
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
  return json({ logs, periods });
}

// ---------------- relation.log
// 入参 { date, tag, note }；tag 为空且无备注 → 删除该天记录
export async function handleRelationLog(env, body) {
  await ensureRelationTables(env);
  const userId = uid(env);
  const date = String(body?.date || '');
  if (!DATE_RE.test(date)) return json({ error: '日期格式不正确' }, 400);

  const tag = body?.tag == null ? '' : String(body.tag);
  const note = String(body?.note || '').slice(0, 1000);
  if (tag && !REL_TAGS.includes(tag)) return json({ error: '无效的状态' }, 400);

  if (!tag && !note) {
    await dbRun(env.DB, `DELETE FROM ethan_relation_logs WHERE user_id = ? AND date = ?`, [userId, date]);
    return json({ ok: true, deleted: true });
  }
  await dbRun(
    env.DB,
    `INSERT INTO ethan_relation_logs (user_id, date, tag, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
     ON CONFLICT(user_id, date) DO UPDATE SET
       tag = excluded.tag,
       note = excluded.note,
       updated_at = datetime('now')`,
    [userId, date, tag, note]
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
