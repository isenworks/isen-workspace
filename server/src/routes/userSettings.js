import { Router } from 'express';
import { db } from '../db.js';

/* ============================================================
 * /api/userSettings/* — 用户级配置 KV（本地 Express 端）
 * 与线上 Cloudflare Functions（functions/_lib/handlers/userSettings.js）协议对齐：
 *   GET  /get?k=key1,key2 → { ok, data: { key: { v, version } } }
 *       （weread_api_key 特例：只回 configured 标志，不明文流转）
 *   POST /set { k, v }            → 全量覆盖（LWW），version+=1
 *   POST /set { k, partial: {...} } → 结构化字段级合并（envelope + 服务器时间戳）
 *
 * 背景：本地此前没有这组路由，cloudKV 同步层静默降级为纯本地 localStorage——
 *      预览地址/端口一变（5173→4000）或浏览器数据被清，自定义主题等数据即丢失。
 *      补齐后 localhost 也有云端镜像，登录状态下数据可跨浏览器恢复。
 * ============================================================ */

const router = Router();

function nowIso() {
  return new Date().toISOString();
}

function getVersioned(userId, k) {
  const r = db.prepare('SELECT v, version FROM user_settings WHERE user_id = ? AND k = ?').get(userId, k);
  return r ? { v: r.v || '', version: r.version || 0 } : { v: '', version: 0 };
}

function setFull(userId, k, v) {
  db.prepare(`INSERT INTO user_settings(user_id, k, v, updated_at, version) VALUES(?, ?, ?, ?, 1)
    ON CONFLICT(user_id, k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at, version = user_settings.version + 1`)
    .run(userId, String(k), String(v == null ? '' : v), nowIso());
  return getVersioned(userId, k).version;
}

/* 结构化字段级合并：envelope = { __mv, fields: { field: { t: 毫秒时间戳, v } } }
 * incoming.t >= existing.t 才覆盖，多设备并发编辑不同字段互不冲掉 */
function mergePartial(userId, k, partial) {
  const cur = getVersioned(userId, k);
  let envelope;
  try {
    const parsed = JSON.parse(cur.v || '{}');
    envelope = (parsed && parsed.__mv !== undefined && parsed.fields && typeof parsed.fields === 'object')
      ? parsed
      : { __mv: cur.version || 0, fields: {} };
  } catch { envelope = { __mv: cur.version || 0, fields: {} }; }
  const now = Date.now();
  for (const [field, val] of Object.entries(partial || {})) {
    const ex = envelope.fields[field];
    if (!ex || now >= (ex.t || 0)) envelope.fields[field] = { t: now, v: val };
  }
  const newVersion = (cur.version || 0) + 1;
  envelope.__mv = newVersion;
  db.prepare(`INSERT INTO user_settings(user_id, k, v, updated_at, version) VALUES(?, ?, ?, ?, ?)
    ON CONFLICT(user_id, k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at, version = excluded.version`)
    .run(userId, String(k), JSON.stringify(envelope), nowIso(), newVersion);
  return { version: newVersion, merged: envelope };
}

router.get('/get', (req, res) => {
  const keys = req.query.k ? String(req.query.k).split(',').filter(Boolean) : ['weread_api_key'];
  const out = {};
  for (const key of keys) {
    if (key === 'weread_api_key') {
      const v = db.prepare('SELECT v FROM user_settings WHERE user_id = ? AND k = ?').get(req.user.id, key)?.v || '';
      out[key] = { configured: !!v, value: v, version: 0 };
    } else {
      out[key] = getVersioned(req.user.id, key);
    }
  }
  res.json({ ok: true, data: out });
});

router.post('/set', (req, res) => {
  const body = req.body || {};
  if (typeof body.k !== 'string') return res.status(400).json({ error: '缺少 k' });
  if (body.partial && typeof body.partial === 'object') {
    const r = mergePartial(req.user.id, body.k, body.partial);
    return res.json({ ok: true, version: r.version, merged: r.merged });
  }
  const version = setFull(req.user.id, body.k, body.v);
  res.json({ ok: true, version });
});

export default router;
