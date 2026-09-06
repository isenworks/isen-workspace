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
const pushTimers = new Map();    // key → timer
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
  clearTimeout(pushTimers.get(key));
  pushTimers.set(key, setTimeout(() => doPush(key, valueStr, 0), PUSH_DEBOUNCE_MS));
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
      pushTimers.set(key, setTimeout(() => doPush(key, valueStr, attempt + 1), 30000));
    }
    // 重试耗尽：数据仍在本地，下次变更时再整体重推
  }
}

/* ---- 同步原语：拉云端 → 云端有且不同则云端胜；否则本地为准并确保上云 ----
 * onCloud(value) 云端较新时回调（调用方负责写 localStorage 并应用）
 * 返回 'cloud' | 'local' | 'none' */
export async function syncKey(key, localValueStr, onCloud) {
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
