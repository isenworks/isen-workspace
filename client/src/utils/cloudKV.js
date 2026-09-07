/* ============================================================
 * 云端 KV 同步层：localStorage 为主存储、D1 ethan_user_settings 为镜像
 * 目标：年度规划/主题/日程分类等前端数据多设备同步
 *
 * 策略：
 *   · 简单值（主题/分类等字符串、数组）：后写覆盖（LWW），低频编辑场景足够
 *   · 结构化对象（按 id 索引的记录如 annual_habit_targets/ability_score_history）：
 *     字段级合并 —— 每个字段带服务器时间戳，多设备并发编辑不同字段不会互覆盖
 *   · 拉取：页面加载时批量拉云端；云端存在且 ≠ 本地 → 云端胜（写回 localStorage）
 *   · 推送：本地变更后防抖 1.5s 推 D1；首次上云（云端无值）视为迁移自动完成
 *   · 冲突：LWW 用于简单值；字段级合并用于结构化对象。未登录/请求失败静默降级为纯本地
 *
 * 结构化合并协议（云端值形态 envelope）：
 *   { __mv: <全局版本号>, fields: { fieldName: { t: <服务器毫秒时间戳>, v: <任意值> } } }
 *   客户端通过 cloudMergePush(key, partialObj) 触发字段级合并，
 *   后端用服务器时间戳逐字段与现存 envelope 合并（incoming.t >= existing.t 则覆盖）
 * ============================================================ */

const PULL_BATCH_DELAY = 0;      // 同一 tick 内的拉取合并成一次请求
const PUSH_DEBOUNCE_MS = 1500;   // 本地写入后防抖推送
const MERGE_DEBOUNCE_MS = 1500;  // 字段级合并同样防抖

const pendingPulls = new Map();  // key → [{ resolve, versioned }]
const pushTimers = new Map();    // key → { timer, value } 待推送/待重试队列
const mergeTimers = new Map();   // key → { timer, partial } 待合并/待重试队列
let pullFlushScheduled = false;

// 本地已知云端版本号（拉取/推送响应时更新；供乐观并发与冲突检测）
const localVersion = new Map();

function isAuthed() {
  try { return !!localStorage.getItem('pw_unlock_token'); } catch { return false; }
}

/* ---- 拉取：同 tick 的 key 合并为一次逗号分隔 GET ----
 * cloudPull         返回字符串值（向后兼容：syncKey 调用方仍按字符串用）
 * cloudPullVersioned 返回 { v, version }（新协议：字段级合并 / 版本追踪用）
 */
export function cloudPull(key) {
  return new Promise((resolve) => {
    if (!pendingPulls.has(key)) pendingPulls.set(key, []);
    pendingPulls.get(key).push({ resolve, versioned: false });
    scheduleFlush();
  });
}
export function cloudPullVersioned(key) {
  return new Promise((resolve) => {
    if (!pendingPulls.has(key)) pendingPulls.set(key, []);
    pendingPulls.get(key).push({ resolve, versioned: true });
    scheduleFlush();
  });
}
function scheduleFlush() {
  if (!pullFlushScheduled) {
    pullFlushScheduled = true;
    setTimeout(flushPulls, PULL_BATCH_DELAY);
  }
}
async function flushPulls() {
  pullFlushScheduled = false;
  const keys = [...pendingPulls.keys()];
  const waitersPerKey = [...pendingPulls.values()];
  pendingPulls.clear();
  if (!keys.length || !isAuthed()) {
    waitersPerKey.forEach(w => w.forEach(x => x.resolve(null)));
    return;
  }
  try {
    const res = await fetch(`/api/userSettings/get?k=${encodeURIComponent(keys.join(','))}`, {
      headers: { 'X-Unlock-Token': localStorage.getItem('pw_unlock_token') || '' },
    });
    const data = await res.json().catch(() => null);
    const map = (res.ok && data?.ok && data.data) ? data.data : null;
    waitersPerKey.forEach((waiters, i) => {
      const key = keys[i];
      const entry = map ? map[key] : null;
      if (!entry) { waiters.forEach(w => w.resolve(null)); return; }
      // 规整为 { v, version }，兼容老协议纯字符串
      let v, version;
      if (key === 'weread_api_key') {
        v = entry.configured ? entry.value : null;
        version = entry.version || 0;
      } else if (entry && typeof entry === 'object' && 'v' in entry) {
        v = entry.v;
        version = entry.version || 0;
      } else {
        v = entry; // 老协议纯字符串
        version = 0;
      }
      localVersion.set(key, version || 0);
      waiters.forEach(w => w.resolve(w.versioned ? { v, version } : v));
    });
  } catch {
    waitersPerKey.forEach(w => w.forEach(x => x.resolve(null)));
  }
}

/* ---- 状态事件：侧边栏同步指示器监听（syncing / synced / error / pulled） ---- */
function emit(status, key) {
  try { window.dispatchEvent(new CustomEvent('cloudkv', { detail: { status, key } })); } catch {}
}

/* ---- 推送（简单值 LWW）：按 key 防抖；失败 30s 自动重试（最多 5 次），重试期间新变更会打断并合并 ---- */
export function cloudPush(key, valueStr) {
  if (!isAuthed()) return;
  const prev = pushTimers.get(key);
  if (prev) clearTimeout(prev.timer);
  pushTimers.set(key, { timer: setTimeout(() => doPush(key, valueStr, 0), PUSH_DEBOUNCE_MS), value: valueStr });
}
async function doPush(key, valueStr, attempt) {
  pushTimers.delete(key);
  emit('syncing', key);
  try {
    const res = await fetch('/api/userSettings/set', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Unlock-Token': localStorage.getItem('pw_unlock_token') || '',
      },
      body: JSON.stringify({ k: key, v: String(valueStr == null ? '' : valueStr) }),
    });
    if (!res.ok) throw new Error(`http ${res.status}`);
    const data = await res.json().catch(() => null);
    if (data?.version != null) localVersion.set(key, data.version); // 记录新版本号
    emit('synced', key);
  } catch {
    emit('error', key);
    if (attempt < 5) {
      pushTimers.set(key, { timer: setTimeout(() => doPush(key, valueStr, attempt + 1), 30000), value: valueStr });
    }
    // 重试耗尽：数据仍在本地，下次变更时再整体重推
  }
}

/* ---- 推送（结构化对象字段级合并）：按 key 防抖累加 partial ----
 * cloudMergePush(key, partialObj)
 *   partialObj = { fieldName: newValue, ... } —— 只传本次变化的字段
 *   防抖期间多次调用会累加 partial（同字段后写覆盖），最后一次统一推送
 * 后端按服务器时间戳逐字段与现存 envelope 合并，多设备编辑不同字段不会互覆盖
 * 例：A 改 {habit_1: x'}、B 改 {habit_2: y'} → 云端最终 {habit_1: x', habit_2: y'}，两边都保留
 * 调用方拿不到 merged 响应数据 —— 通过后续 cloudPull/cloudMergePull 拉回合并结果
 */
export function cloudMergePush(key, partialObj) {
  if (!isAuthed() || !partialObj || typeof partialObj !== 'object') return;
  const prev = mergeTimers.get(key);
  const merged = { ...(prev?.partial || {}), ...partialObj }; // 防抖期间累加 partial
  if (prev) clearTimeout(prev.timer);
  mergeTimers.set(key, {
    timer: setTimeout(() => doMergePush(key, merged, 0), MERGE_DEBOUNCE_MS),
    partial: merged,
  });
}
async function doMergePush(key, partial, attempt) {
  mergeTimers.delete(key);
  emit('syncing', key);
  try {
    const res = await fetch('/api/userSettings/set', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Unlock-Token': localStorage.getItem('pw_unlock_token') || '',
      },
      body: JSON.stringify({ k: key, partial }),
    });
    if (!res.ok) throw new Error(`http ${res.status}`);
    const data = await res.json().catch(() => null);
    if (data?.version != null) localVersion.set(key, data.version);
    emit('synced', key);
  } catch {
    emit('error', key);
    if (attempt < 5) {
      mergeTimers.set(key, {
        timer: setTimeout(() => doMergePush(key, partial, attempt + 1), 30000),
        partial,
      });
    }
  }
}

/* ---- 拉取结构化合并值：返回普通对象（envelope 解包） ----
 * envelope = { __mv, fields: { field: { t, v } } } → 解为 { data: { field: v }, version }
 * 非 envelope 形态（老数据 / 简单 LWW 值）：原样返回 { data: <原值>, version }
 * 返回 null 表示云端无值
 */
export async function cloudMergePull(key) {
  const entry = await cloudPullVersioned(key);
  if (!entry || !entry.v) return null;
  try {
    const parsed = JSON.parse(entry.v);
    if (parsed && parsed.__mv !== undefined && parsed.fields && typeof parsed.fields === 'object') {
      const data = {};
      for (const [f, info] of Object.entries(parsed.fields)) {
        if (info && info.v !== undefined) data[f] = info.v;
      }
      return { data, version: entry.version };
    }
    return { data: parsed, version: entry.version };
  } catch {
    return null;
  }
}

/* ---- 手动全量同步（同步按钮 / Ctrl+S）：先冲刷待推送（跳过防抖），再拉云端覆盖 ----
 * 拉取注册表：syncKey 挂载时登记各 key 的 onCloud（各自负责写 localStorage 并应用），
 * 手动同步时重放拉取比较，云端较新则覆盖本地 → 不刷新页面也能拿到其他设备的更新 */
const pullRegistry = new Map();
export async function syncCloudNow() {
  // 1. 立即冲刷所有待推送（push + merge 两类，必须先于拉取，避免把云端旧值拉回来覆盖本地新值）
  const pushEntries = [...pushTimers.entries()];
  pushEntries.forEach(([, p]) => clearTimeout(p.timer));
  const mergeEntries = [...mergeTimers.entries()];
  mergeEntries.forEach(([, m]) => clearTimeout(m.timer));
  await Promise.all([
    ...pushEntries.map(([key, p]) => doPush(key, p.value, 0)),
    ...mergeEntries.map(([key, m]) => doMergePush(key, m.partial, 0)),
  ]);
  // 2. 拉云端：与本地一致则无动作；云端较新 → onCloud 覆盖应用
  const targets = [...pullRegistry.entries()];
  await Promise.all(targets.map(async ([key, onCloud]) => {
    const cloud = await cloudPull(key);
    const local = (() => { try { return localStorage.getItem(key); } catch { return null; } })();
    if (cloud != null && cloud !== local) {
      try { onCloud?.(cloud); emit('pulled', key); } catch {}
    }
  }));
}

/* ---- 同步原语：拉云端 → 云端有且不同则云端胜；否则本地为准并确保上云 ----
 * onCloud(value) 云端较新时回调（调用方负责写 localStorage 并应用）
 * 返回 'cloud' | 'local' | 'none' */
export async function syncKey(key, localValueStr, onCloud) {
  if (onCloud) pullRegistry.set(key, onCloud); // 登记以便手动同步时重放拉取
  const cloud = await cloudPull(key);
  if (cloud != null && cloud !== localValueStr) {
    onCloud?.(cloud);
    emit('pulled', key); // 云端较新已覆盖本地（多设备拉新）
    return 'cloud';
  }
  if (cloud == null && localValueStr != null) {
    cloudPush(key, localValueStr); // 首次迁移上云
    return 'local';
  }
  return 'none';
}
