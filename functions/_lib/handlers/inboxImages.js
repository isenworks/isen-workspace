// ============================================================
// /api/inbox/image/* — 小记图片（R2 对象存储）
//   正文只存 URL，二进制走 R2：小记 content 保持在 KB 级，不写 D1。
//   · 上传：POST /api/inbox/image/upload  multipart/form-data 字段 file
//   · 读取：GET  /api/inbox/image/file/:key  → 直出二进制，1 年强缓存
//   · 删除：DELETE /api/inbox/image/file/:key
//   · 路径：note/{userId}/{YYYY-MM}/{随机 id}.{webp|jpg|png}
//
// 环境绑定：env.NOTE_BUCKET（可选，独立图片桶）→ 回退 env.HERO_BUCKET
// ============================================================
import { uid, json } from '../core.js';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const MAX_SIZE = 8 * 1024 * 1024; // 单图 8MB（前端已压到 1600px/WebP，正常 150–300KB）

function bucketOf(env) {
  return env.NOTE_BUCKET || env.HERO_BUCKET || null;
}

function extOf(type) {
  if (type === 'image/png') return 'png';
  if (type === 'image/webp') return 'webp';
  return 'jpg';
}

function contentTypeOf(key) {
  if (key.endsWith('.png')) return 'image/png';
  if (key.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

// 只允许当前用户自己的 note/ 前缀，防越权与路径穿越
function safeKey(env, key) {
  const u = uid(env).replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  const re = new RegExp(`^note/${u}/\\d{4}-\\d{2}/[a-z0-9]+\\.(webp|jpg|png)$`, 'i');
  return re.test(key) ? key : null;
}

function randomId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '');
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

// POST /api/inbox/image/upload
//   body: multipart/form-data { file: Blob }
//   返回: { key, url, size }
export async function handleInboxImageUpload(env, request) {
  const bucket = bucketOf(env);
  if (!bucket) return json({ error: '图片存储未配置（R2 未绑定 NOTE_BUCKET / HERO_BUCKET）' }, 500);

  const fd = await request.formData();
  const file = fd.get('file');
  if (!file || typeof file.arrayBuffer !== 'function') return json({ error: '缺少文件' }, 400);
  if (!ALLOWED_TYPES.has(String(file.type).toLowerCase())) return json({ error: '不支持的图片格式' }, 400);
  if (file.size > MAX_SIZE) return json({ error: '图片过大（上限 8MB）' }, 400);

  const month = new Date().toISOString().slice(0, 7);
  const key = `note/${uid(env)}/${month}/${randomId()}.${extOf(String(file.type).toLowerCase())}`;
  const buf = await file.arrayBuffer();

  await bucket.put(key, buf, {
    httpMetadata: { contentType: file.type },
    customMetadata: { userId: uid(env) },
  });

  return json({
    key,
    url: `/api/inbox/image/file/${encodeURIComponent(key)}`,
    size: buf.byteLength,
  });
}

// GET /api/inbox/image/file/:key
export async function handleInboxImageFile(env, key) {
  const bucket = bucketOf(env);
  if (!bucket) return json({ error: '图片存储未配置' }, 500);

  const safe = safeKey(env, decodeURIComponent(key));
  if (!safe) return json({ error: 'key 无效' }, 400);

  const obj = await bucket.get(safe);
  if (!obj) return json({ error: '图片不存在' }, 404);

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('etag', obj.httpEtag);
  // 文件名不可变（每次上传新 key），可以放心长缓存
  headers.set('cache-control', 'public, max-age=31536000, immutable');
  if (!headers.has('content-type')) headers.set('content-type', contentTypeOf(safe));
  return new Response(obj.body, { status: 200, headers });
}

// DELETE /api/inbox/image/file/:key
export async function handleInboxImageDelete(env, key) {
  const bucket = bucketOf(env);
  if (!bucket) return json({ error: '图片存储未配置' }, 500);

  const safe = safeKey(env, decodeURIComponent(key));
  if (!safe) return json({ error: 'key 无效' }, 400);

  await bucket.delete(safe);
  return json({ ok: true });
}
