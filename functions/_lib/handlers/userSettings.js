// ============================================================
// /api/userSettings/* 处理器：用户级配置 KV（weread key、年度规划镜像等）
//   表结构见 core.js → ensureUserSettingsTable：ethan_user_settings (user_id, k, v, updated_at, version)
//   GET  返回 { key: { v, version } }，cloudKV 同步层用 version 追踪云端版本
//   SET  支持两种模式：
//        · full（默认 LWW）：{ k, v } → 全量覆盖，version+=1
//        · partial（字段级合并）：{ k, partial: { field: value } } → 服务端逐字段合并，version+=1
// ============================================================
import { uid, json, settingGet, settingGetVersioned, settingSet, settingMerge } from '../core.js';

// 支持逗号分隔批量拉取（年度规划云端同步一次请求拉全部 key）
export async function handleUserSettingsGet(env, k) {
  const keys = k ? String(k).split(',').filter(Boolean) : ['weread_api_key'];
  const out = {};
  for (const key of keys) {
    if (key === 'weread_api_key') {
      // weread key 不在前端明文流转：只回 configured 标志
      const v = await settingGet(env, key);
      out[key] = { configured: !!v, value: v, version: 0 };
    } else {
      // 其他 key：返回 { v, version } 供 cloudKV 做版本追踪
      out[key] = await settingGetVersioned(env, key);
    }
  }
  return json({ ok: true, data: out });
}

export async function handleUserSettingsSet(env, body) {
  if (!body || typeof body.k !== 'string') return json({ error: '缺少 k' }, 400);
  // partial 模式：{ k, partial: { field: value, ... } } → 字段级合并（带服务器时间戳）
  // 适用于结构化对象（如 annual_habit_targets 按 id 索引的记录），多设备并发编辑不同字段不会互覆盖
  if (body.partial && typeof body.partial === 'object') {
    const r = await settingMerge(env, body.k, body.partial);
    return json({ ok: true, version: r.version, merged: r.merged });
  }
  // full 模式（默认 LWW 兼容路径）：全量覆盖
  const version = await settingSet(env, body.k, body.v == null ? '' : String(body.v));
  return json({ ok: true, version });
}

// 导出 settingGet/Set 供其他 handler 复用（如 weread 需要 weread_api_key）
export { settingGet, settingSet };
