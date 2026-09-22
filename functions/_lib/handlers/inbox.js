// ============================================================
// /api/inbox/* 处理器（收集箱：想法/备忘的快速捕获与分派）
//   捕获：只有 content 必填（记录时间 created_at 自动），category 可选
//   分派：process 单请求原子完成「建日程/待办 + 标记已处理」，避免两段式请求
//         中途失败产生重复或悬挂条目
// ============================================================
import {
  uid, json, dbAll, dbFirst, dbRun, toBoolInt, toInt, nowIso, ensureInboxTable, ensureInboxTagsTable, recycleSnapshot,
} from '../core.js';
import { handleSchedulesCreate } from './schedules.js';
import { handleTasksCreate } from './tasks.js';

// 待分派列表（done=0），新记录在前；上限 200 条防超大响应
export async function handleInboxList(env) {
  await ensureInboxTable(env);
  const items = await dbAll(env.DB, `SELECT * FROM ethan_inbox WHERE user_id=? AND done=0 ORDER BY id DESC LIMIT 200`, [uid(env)]);
  return json({ items });
}

export async function handleInboxCreate(env, body) {
  await ensureInboxTable(env);
  const content = String(body?.content || '').slice(0, 10000);
  if (!content.trim()) return json({ error: '内容不能为空' }, 400);
  const cat = body?.category !== undefined && body?.category !== null && body?.category !== ''
    ? toInt(body.category, null) : null;
  const tagId = body?.tag_id !== undefined && body?.tag_id !== null && body?.tag_id !== ''
    ? toInt(body.tag_id, null) : null;
  const info = await env.DB.prepare(`INSERT INTO ethan_inbox (user_id,content,category,tag_id,created_at) VALUES (?,?,?,?,datetime('now'))`)
    .bind(uid(env), content, cat, tagId).run();
  return json({ item: await dbFirst(env.DB, `SELECT * FROM ethan_inbox WHERE id=?`, [Number(info.meta.last_row_id)]) });
}

// 编辑内容 / 改分类 / 改标签 / 就地完成 / 详细模式分派后回写去向
export async function handleInboxUpdate(env, body) {
  const id = Number(body?.id);
  if (!id) return json({ error: '缺少 id' }, 400);
  await ensureInboxTable(env);
  const sets = [];
  const params = [];
  if (typeof body.content === 'string') {
    const content = body.content.slice(0, 10000);
    if (!content.trim()) return json({ error: '内容不能为空' }, 400);
    sets.push('content=?');
    params.push(content);
  }
  if (body.category !== undefined) {
    sets.push('category=?');
    params.push(body.category === null || body.category === '' ? null : toInt(body.category, null));
  }
  if (body.tag_id !== undefined) {
    sets.push('tag_id=?');
    params.push(body.tag_id === null || body.tag_id === '' ? null : toInt(body.tag_id, null));
  }
  if (body.is_done !== undefined) {
    sets.push('done=?', 'done_at=?');
    params.push(toBoolInt(body.is_done), body.is_done ? nowIso() : null);
  }
  if (typeof body.processed_type === 'string' && body.processed_type) {
    // 详细模式：前端已通过 ScheduleForm 建好日程，这里只回写分派去向
    if (!['schedule', 'task', 'done'].includes(body.processed_type)) return json({ error: '无效的分派类型' }, 400);
    sets.push('done=1', 'done_at=?', 'processed_type=?', 'processed_id=?');
    params.push(nowIso(), body.processed_type, body.processed_id != null ? Number(body.processed_id) : null);
  }
  if (!sets.length) return json({ item: await dbFirst(env.DB, `SELECT * FROM ethan_inbox WHERE id=? AND user_id=?`, [id, uid(env)]) });
  sets.push('updated_at=datetime(\'now\')');
  params.push(id, uid(env));
  await env.DB.prepare(`UPDATE ethan_inbox SET ${sets.join(', ')} WHERE id=? AND user_id=?`).bind(...params).run();
  return json({ item: await dbFirst(env.DB, `SELECT * FROM ethan_inbox WHERE id=?`, [id]) });
}

// 行内快速分派（原子）：直接建日程/待办并标记条目已处理
//   body: { id, type: 'schedule'|'task', fields: { title, date, category?, start_time?, priority?, due_time? } }
export async function handleInboxProcess(env, body) {
  const id = Number(body?.id);
  if (!id) return json({ error: '缺少 id' }, 400);
  await ensureInboxTable(env);
  const item = await dbFirst(env.DB, `SELECT * FROM ethan_inbox WHERE id=? AND user_id=?`, [id, uid(env)]);
  if (!item) return json({ error: '条目不存在' }, 404);
  const type = body?.type;
  if (type !== 'schedule' && type !== 'task') return json({ error: '无效的分派类型' }, 400);

  // 复用现有 create handler 的校验与插入逻辑（返回 Response，透传校验失败）
  const f = { ...body?.fields };
  if (!f.title) f.title = item.content;
  const res = type === 'schedule' ? await handleSchedulesCreate(env, f) : await handleTasksCreate(env, f);
  if (res.status !== 200) return res;
  let data = null;
  try { data = await res.json(); } catch (_) {}
  const targetId = type === 'schedule' ? (data?.schedule?.id ?? null) : (data?.task?.id ?? null);
  if (targetId == null) return json({ error: '分派失败，请重试' }, 500);

  await env.DB.prepare(`UPDATE ethan_inbox SET done=1, done_at=?, processed_type=?, processed_id=? WHERE id=?`)
    .bind(nowIso(), type, targetId, id).run();
  return json({ ok: true, targetId, [type]: data?.[type] });
}

export async function handleInboxRemove(env, body) {
  const id = Number(body?.id);
  if (!id) return json({ error: '缺少 id' }, 400);
  await ensureInboxTable(env);
  await recycleSnapshot(env, 'inbox', id, 'ethan_inbox');
  await dbRun(env.DB, `DELETE FROM ethan_inbox WHERE id=? AND user_id=?`, [id, uid(env)]);
  return json({ ok: true });
}

// ==================== 小记标签（独立于工作台六大分类） ====================

export async function handleInboxTagsList(env) {
  await ensureInboxTagsTable(env);
  const tags = await dbAll(env.DB, `SELECT * FROM ethan_inbox_tags WHERE user_id=? ORDER BY sort_order ASC, id ASC`, [uid(env)]);
  return json({ tags });
}

export async function handleInboxTagCreate(env, body) {
  await ensureInboxTagsTable(env);
  const name = String(body?.name || '').trim().slice(0, 20);
  if (!name) return json({ error: '标签名不能为空' }, 400);
  const color = /^#[0-9a-fA-F]{6}$/.test(body?.color || '') ? body.color : '#8E8E93';
  const sortOrder = toInt(body?.sort_order, 0);
  const info = await env.DB.prepare(`INSERT INTO ethan_inbox_tags (user_id,name,color,sort_order) VALUES (?,?,?,?)`)
    .bind(uid(env), name, color, sortOrder).run();
  return json({ tag: await dbFirst(env.DB, `SELECT * FROM ethan_inbox_tags WHERE id=?`, [Number(info.meta.last_row_id)]) });
}

export async function handleInboxTagUpdate(env, body) {
  const id = Number(body?.id);
  if (!id) return json({ error: '缺少 id' }, 400);
  await ensureInboxTagsTable(env);
  const sets = [];
  const params = [];
  if (typeof body.name === 'string') {
    const name = body.name.trim().slice(0, 20);
    if (!name) return json({ error: '标签名不能为空' }, 400);
    sets.push('name=?');
    params.push(name);
  }
  if (body.color !== undefined) {
    sets.push('color=?');
    params.push(/^#[0-9a-fA-F]{6}$/.test(body.color || '') ? body.color : '#8E8E93');
  }
  if (body.sort_order !== undefined) {
    sets.push('sort_order=?');
    params.push(toInt(body.sort_order, 0));
  }
  if (!sets.length) return json({ tag: await dbFirst(env.DB, `SELECT * FROM ethan_inbox_tags WHERE id=? AND user_id=?`, [id, uid(env)]) });
  params.push(id, uid(env));
  await env.DB.prepare(`UPDATE ethan_inbox_tags SET ${sets.join(', ')} WHERE id=? AND user_id=?`).bind(...params).run();
  return json({ tag: await dbFirst(env.DB, `SELECT * FROM ethan_inbox_tags WHERE id=?`, [id]) });
}

export async function handleInboxTagRemove(env, body) {
  const id = Number(body?.id);
  if (!id) return json({ error: '缺少 id' }, 400);
  await ensureInboxTagsTable(env);
  await env.DB.prepare(`DELETE FROM ethan_inbox_tags WHERE id=? AND user_id=?`).bind(id, uid(env)).run();
  // 解绑已使用该标签的小记
  await env.DB.prepare(`UPDATE ethan_inbox SET tag_id=NULL WHERE tag_id=? AND user_id=?`).bind(id, uid(env)).run();
  return json({ ok: true });
}
