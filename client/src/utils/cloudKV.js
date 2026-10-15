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

// 拉取失败哨兵：与「云端无值(null)」严格区分。
// 弱网下拉取超时/失败如果被当作 null，syncKey 会把陈旧/空的本地值推上云覆盖云端好数据（数据事故），
// 页面也会永远停留在旧数据且无人重试 —— 这是移动端「数据不同步」的核心根因之一
const PULL_FAILED = Symbol('cloudkv_pull_failed');

// 带超时的 fetch（15s）：移动端弱网下裸 fetch 可能长时间挂起，拉取永不完成。
// 15s 而非 8s：需覆盖 Functions + D1 冷启动叠加慢速传输的极端场景（用户实测 <15KB/s 蜂窝网络）
async function fetchWithTimeout(url, opts = {}, timeoutMs = 15000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: ctl.signal });
  } finally {
    clearTimeout(timer);
  }
}

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
  if (!keys.length) {
    waitersPerKey.forEach(w => w.forEach(x => x.resolve(null)));
    return;
  }
  if (!isAuthed()) {
    // 未登录：语义等同「云端无值」，调用方各自降级为纯本地
    waitersPerKey.forEach(w => w.forEach(x => x.resolve(null)));
    return;
  }
  // 15s 超时 + 退避重试（最多 2 次，600ms / 3s）：拉取是幂等 GET，网络错误（含超时）
  // 与边缘 5xx 均可安全重试。超时在移动蜂窝弱网下是最常见的瞬时失败形态（冷启动+慢传输），
  // 此前把 AbortError 排除在重试外 —— 弱网一次超时即判死，四张成长卡持续「云端同步失败」
  const headers = { 'X-Unlock-Token': localStorage.getItem('pw_unlock_token') || '' };
  let res = null, netErr = null;
  for (let attempt = 0; ; attempt++) {
    netErr = null; res = null;
    try {
      res = await fetchWithTimeout(`/api/userSettings/get?k=${encodeURIComponent(keys.join(','))}`, { headers });
    } catch (e) { netErr = e; }
    const retryable = netErr
      ? true
      : [502, 503, 504].includes(res.status);
    if (retryable && attempt < 2) { await new Promise(r => setTimeout(r, attempt === 0 ? 600 : 3000)); continue; }
    break;
  }
  const fail = () => waitersPerKey.forEach(w => w.forEach(x => x.resolve(PULL_FAILED)));
  if (!res || netErr || !res.ok) { fail(); return; } // 网络失败/HTTP 错误 → 失败哨兵
  const data = await res.json().catch(() => null);
  if (!data || data.ok !== true || !data.data) { fail(); return; } // 非 JSON（SPA 兜底 HTML）/业务失败 → 同样不是「云端无值」
  const map = data.data;
  waitersPerKey.forEach((waiters, i) => {
    const key = keys[i];
    const entry = map[key];
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
    advanceLocal(key, String(valueStr == null ? '' : valueStr)); // 推送成功：云端=该值，基准推进（防全量同步重放误报）
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
    advanceLocal(key, null); // 合并推送成功：服务器端合并后的最终值不可知，基准回落到同名 localStorage 读取
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
  // 失败哨兵必须传播：调用方据此区分「拉取失败」与「云端无值(null)」，
  // 否则失败被误判为无值 → 触发「首次迁移上云」用本地空值覆盖云端好数据
  if (entry === PULL_FAILED) return PULL_FAILED;
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
 * 拉取注册表：syncKey 挂载时登记各 key 的 onCloud（各自负责写 localStorage 并应用）+
 * local 基准值（调用方声明的"当前本地值"）。
 * 为什么比较用登记的基准而不是 localStorage.getItem(key)：
 *   部分调用方的本地镜像 key 与云端 key 不同名（导航标题 nav_labels→nav_labels_ls、
 *   总结模板、知识库等），同名读取永远得到 null → 每轮全量同步都误判"云端有更新"
 *   → emit pulled → 上层监听者再次触发同步 → 死循环（页面数据反复跳动）。
 * 基准推进时机：拉取应用后（local=cloud）、推送成功后（local=推送值）、
 * 合并推送成功后（local 置 null，回落到同名 localStorage 读取——合并后的本地最终值不可知） */
const pullRegistry = new Map(); // key → { onCloud, local }
function advanceLocal(key, value) {
  const reg = pullRegistry.get(key);
  if (reg) reg.local = value;
}
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
  // 2. 拉云端：与本地基准一致则无动作；云端较新 → onCloud 覆盖应用；拉取失败（PULL_FAILED 哨兵）跳过且不覆盖本地
  const targets = [...pullRegistry.entries()];
  await Promise.all(targets.map(async ([key, reg]) => {
    const cloud = await cloudPull(key);
    if (cloud == null || cloud === PULL_FAILED) return;
    const local = reg.local != null
      ? reg.local
      : (() => { try { return localStorage.getItem(key); } catch { return null; } })();
    if (cloud !== local) {
      try { reg.onCloud?.(cloud); advanceLocal(key, cloud); emit('pulled', key); } catch {}
    }
  }));
}

/* ---- 同步原语：拉云端 → 云端有且不同则云端胜；否则本地为准并确保上云 ----
 * onCloud(value) 云端较新时回调（调用方负责写 localStorage 并应用）
 * 返回 'cloud' | 'local' | 'none' | 'error'
 * 失败语义（关键）：拉取失败 ≠ 云端无值。失败时不推送本地 —— 防止弱网下用陈旧/空
 * 本地值覆盖云端好数据；广播 error 事件（侧边栏指示器变红），3s/10s 指数退避共重试 2 次 */
export async function syncKey(key, localValueStr, onCloud, attempt = 0) {
  if (onCloud) pullRegistry.set(key, { onCloud, local: localValueStr }); // 登记以便手动同步时重放拉取
  const cloud = await cloudPull(key);
  if (cloud === PULL_FAILED) {
    emit('error', key);
    // 指数退避重试（3s → 10s，共 2 次）：弱网下单次 3s 重试几乎必然再次失败，
    // 然后整页数据卡死到下一次 visibilitychange / 15s 轮询 —— 退避两轮基本都能穿过冷启动窗口
    if (attempt < 2) {
      setTimeout(() => { syncKey(key, localValueStr, onCloud, attempt + 1); }, attempt === 0 ? 3000 : 10000);
    }
    return 'error';
  }
  if (cloud != null && cloud !== localValueStr) {
    onCloud?.(cloud);
    advanceLocal(key, cloud); // 基准推进：否则全量同步重放时对同一值再次误报"有更新"
    emit('pulled', key); // 云端较新已覆盖本地（多设备拉新）
    return 'cloud';
  }
  if (cloud == null && localValueStr != null) {
    cloudPush(key, localValueStr); // 首次迁移上云（仅在确认云端确实无值时才推）
    return 'local';
  }
  return 'none';
}
