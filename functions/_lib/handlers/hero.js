// ============================================================
// /api/hero/* 处理器（Hero 背景图 R2 对象存储）
//   · 上传：multipart/form-data，字段名 file，返回 key + url
//   · 读取：GET /api/hero/img/:key，带 Cache-Control，直出二进制
//   · 删除：DELETE /api/hero/img/:key
//   · 存储路径：hero/{userId}/{kind}/{id}.jpg （kind = src|out）
//
// 环境绑定：env.HERO_BUCKET = R2 存储桶（在 Pages Settings → Functions → R2 Bucket Bindings 配置）
//   未绑定时接口会返回错误，前端自动降级为 localStorage base64 模式
// ============================================================
import { uid, json } from '../core.js';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const MAX_SIZE = 10 * 1024 * 1024;   // 单图上限 10MB（原图 + 成品图合计绰绰有余）

function safeKey(key) {
  // 只允许 hero/{uid}/{src|out}/{id}.jpg 格式，防路径穿越
  const u = uid({ HERO_BUCKET: null });
  const re = new RegExp(`^hero/${u.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}/(src|out)/[a-z0-9_]+\\.jpg$`, 'i');
  return re.test(key) ? key : null;
}

function contentTypeFromKey(key) {
  if (key.endsWith('.jpg') || key.endsWith('.jpeg')) return 'image/jpeg';
  if (key.endsWith('.png')) return 'image/png';
  if (key.endsWith('.webp')) return 'image/webp';
  return 'application/octet-stream';
}

// POST /api/hero/upload
//   body: multipart/form-data  { file: Blob, kind: 'src'|'out', id: string }
//   返回: { key, url, size }
export async function handleHeroUpload(env, request) {
  if (!env.HERO_BUCKET) return json({ error: 'R2 存储桶未绑定（HERO_BUCKET）' }, 500);

  const fd = await request.formData();
  const file = fd.get('file');
  const kind = String(fd.get('kind') || 'out');
  const id = String(fd.get('id') || '').slice(0, 64);

  if (!file || typeof file.arrayBuffer !== 'function') return json({ error: '缺少文件' }, 400);
  if (!['src', 'out'].includes(kind)) return json({ error: 'kind 无效' }, 400);
  if (!id) return json({ error: '缺少 id' }, 400);
  if (!ALLOWED_TYPES.has(file.type)) return json({ error: '不支持的图片格式' }, 400);
  if (file.size > MAX_SIZE) return json({ error: '图片过大（上限 10MB）' }, 400);

  const key = `hero/${uid(env)}/${kind}/${id}.jpg`;
  const buf = await file.arrayBuffer();

  await env.HERO_BUCKET.put(key, buf, {
    httpMetadata: { contentType: 'image/jpeg' },
    customMetadata: { kind, id, userId: uid(env) },
  });

  const url = `/api/hero/img/${encodeURIComponent(key)}`;
  return json({ key, url, size: buf.byteLength });
}

// GET /api/hero/img/:key —— 直出二进制，带 30 天浏览器缓存
export async function handleHeroImg(env, key) {
  if (!env.HERO_BUCKET) return json({ error: 'R2 存储桶未绑定' }, 500);

  const safe = safeKey(decodeURIComponent(key));
  if (!safe) return json({ error: 'key 无效' }, 400);

  const obj = await env.HERO_BUCKET.get(safe);
  if (!obj) return json({ error: '图片不存在' }, 404);

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('etag', obj.httpEtag);
  headers.set('cache-control', 'public, max-age=2592000, immutable');   // 30 天强缓存
  if (!headers.has('content-type')) headers.set('content-type', contentTypeFromKey(safe));

  return new Response(obj.body, { status: 200, headers });
}

// DELETE /api/hero/img/:key —— 从 R2 删除
export async function handleHeroDelete(env, key) {
  if (!env.HERO_BUCKET) return json({ error: 'R2 存储桶未绑定' }, 500);

  const safe = safeKey(decodeURIComponent(key));
  if (!safe) return json({ error: 'key 无效' }, 400);

  await env.HERO_BUCKET.delete(safe);
  return json({ ok: true });
}
