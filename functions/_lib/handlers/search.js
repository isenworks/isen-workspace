// ============================================================
// /api/search/* 处理器（全局搜索）
//   四张表并行 LIKE 查询：schedules / tasks / habits / inbox
//   · 单表限量返回（50/50/20/20），响应体保持轻量
//   · LIKE 通配符转义（% _ \），ESCAPE '\' 防止用户输入干扰匹配
//   · 习惯只搜未归档；收集箱只搜待分派（done=0，与收集箱页可见集合一致）
//   · 空关键词直接返回空集，不发 SQL（前端防抖后才会调用）
// ============================================================
import { uid, json, dbAll, ensureInboxTable } from '../core.js';

export async function handleSearchAll(env, q) {
  const kw = String(q?.q ?? '').trim().slice(0, 100);
  const empty = { schedules: [], tasks: [], habits: [], inbox: [] };
  if (!kw) return json(empty);

  await ensureInboxTable(env);
  const userId = uid(env);
  // 转义 LIKE 特殊字符，保证关键词按字面匹配
  const esc = kw.replace(/[\\%_]/g, (m) => '\\' + m);
  const like = `%${esc}%`;
  const E = " ESCAPE '\\'";

  const [schedules, tasks, habits, inbox] = await Promise.all([
    dbAll(
      env.DB,
      `SELECT id,title,date,start_time,category,is_goal,is_done FROM ethan_schedules
       WHERE user_id=? AND (title LIKE ?${E})
       ORDER BY date DESC, id DESC LIMIT 50`,
      [userId, like]
    ),
    dbAll(
      env.DB,
      `SELECT id,title,date,due_time,is_done FROM ethan_tasks
       WHERE user_id=? AND (title LIKE ?${E})
       ORDER BY date DESC, id DESC LIMIT 50`,
      [userId, like]
    ),
    dbAll(
      env.DB,
      `SELECT id,name,emoji FROM ethan_habits
       WHERE user_id=? AND archived=0 AND (name LIKE ?${E})
       LIMIT 20`,
      [userId, like]
    ),
    dbAll(
      env.DB,
      `SELECT id,content,created_at FROM ethan_inbox
       WHERE user_id=? AND done=0 AND (content LIKE ?${E})
       ORDER BY id DESC LIMIT 20`,
      [userId, like]
    ),
  ]);
  return json({ schedules, tasks, habits, inbox });
}
