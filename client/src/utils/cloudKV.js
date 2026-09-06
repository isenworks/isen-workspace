/* ============================================================
 * 云端 KV 同步层：localStorage 为主存储、D1 ethan_user_settings 为镜像
 * 目标：年度规划/主题/日程分类等前端数据多设备同步
 *
 * 策略（简单可靠，适配低频编辑场景）：
 *   · 拉取：页面加载时批量拉云端；云端存在且 ≠ 本地 → 云端胜（写回 localStorage）
 *   · 推送：本地变更后防抖 1.5s 推 D1；首次上云（云端无值）视为迁移自动完成
 *   · 冲突：后写覆盖（LWW）。未登录/请求失败静默降级为纯本地，不阻断 UI
 * ============================================================ */

const PULL_BATCH_DELAY = 0;      // 同一 tick 内的拉取合并成一次请求
const PUSH_DEBOUNCE_MS = 1500;   // 本地写入后防抖推送

const pendingPulls = new Map();  // key → resolve
const pushTimers = new Map();    // key → { timer, value } 待推送/待重试队列
let pullFlushScheduled = false;

function isAuthed() {
  try { return !!localStorage.getItem('pw_unlock_token'); } catch { return false; }
}

/* ---- 拉取：同 tick 的 key 合并为一次逗号分隔 GET ---- */
export function cloudPull(key) {
  return new Promise((resolve) => {
    pendingPulls.set(key, resolve);
    if (!pullFlushScheduled) {
      pullFlushScheduled = true;
      setTimeout(flushPulls, PULL_BATCH_DELAY);
    }
  });
}
async function flushPulls() {
  pullFlushScheduled = false;
  const keys = [...pendingPulls.keys()];
  const resolvers = [...pendingPulls.values()];
  pendingPulls.clear();
  if (!keys.length || !isAuthed()) { resolvers.forEach(r => r(null)); return; }
  try {
    const res = await fetch(`/api/userSettings/get?k=${encodeURIComponent(keys.join(','))}`, {
      headers: { 'X-Unlock-Token': localStorage.getItem('pw_unlock_token') || '' },
    });
    const data = await res.json().catch(() => null);
    const map = (res.ok && data?.ok && data.data) ? data.data : null;
    resolvers.forEach((r, i) => r(map ? (map[keys[i]] ?? null) : null));
  } catch {
    resolvers.forEach(r => r(null));
  }
}

/* ---- 状态事件：侧边栏同步指示器监听（syncing / synced / error / pulled） ---- */
function emit(status, key) {
  try { window.dispatchEvent(new CustomEvent('cloudkv', { detail: { status, key } })); } catch {}
}

/* ---- 推送：按 key 防抖；失败 30s 自动重试（最多 5 次），重试期间新变更会打断并合并 ---- */
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
    emit('synced', key);
  } catch {
    emit('error', key);
    if (attempt < 5) {
      pushTimers.set(key, { timer: setTimeout(() => doPush(key, valueStr, attempt + 1), 30000), value: valueStr });
    }
    // 重试耗尽：数据仍在本地，下次变更时再整体重推
  }
}

/* ---- 手动全量同步（同步按钮 / Ctrl+S）：先冲刷待推送（跳过防抖），再拉云端覆盖 ----
 * 拉取注册表：syncKey 挂载时登记各 key 的 onCloud（各自负责写 localStorage 并应用），
 * 手动同步时重放拉取比较，云端较新则覆盖本地 → 不刷新页面也能拿到其他设备的更新 */
const pullRegistry = new Map();
export async function syncCloudNow() {
  // 1. 立即冲刷所有待推送（必须先于拉取，避免把云端旧值拉回来覆盖本地新值）
  const entries = [...pushTimers.entries()];
  entries.forEach(([, p]) => clearTimeout(p.timer));
  await Promise.all(entries.map(([key, p]) => doPush(key, p.value, 0)));
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
