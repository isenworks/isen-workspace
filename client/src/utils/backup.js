// ============================================================
// 全量数据备份 / 还原：把「服务端 D1」+「浏览器 localStorage」两层数据打成一个 JSON
//   · 导出：走 /api/backup/export（只读，按表全量返回，不受 list 接口截断影响）
//   · 还原：覆盖式写回。先服务端、后本地；服务端失败则不动本地
//   · 登录凭证 pw_unlock_token 既不导出也不写回（还原后登录态保持不变）
// ============================================================
import { API } from '../api/client.js';

// 不入备份 / 不写回的键：登录凭证与第三方密钥
const SKIP_LS_KEYS = new Set(['pw_unlock_token', 'weread_api_key']);

// 导出字段名 → 界面展示名（还原预览用）
export const TABLE_LABELS = {
  schedules: '日程',
  scheduleOccurrences: '日程重复实例',
  fixedSchedules: '固定日程',
  habits: '习惯',
  habitLogs: '习惯打卡明细',
  inbox: '收集箱',
  inboxTags: '收集箱标签',
  summaries: '每日复盘',
  recycleBin: '回收站',
  financeAccounts: '财务 · 账户',
  financeCategories: '财务 · 分类',
  financeGoals: '财务 · 攒钱目标',
  financeTransactions: '财务 · 流水',
  plants: '种植花架',
  userSettings: '云同步键值',
};

function collectLocalStorage() {
  const out = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || SKIP_LS_KEYS.has(k)) continue;
      out[k] = localStorage.getItem(k);
    }
  } catch { /* 隐私模式下可能不可用，忽略 */ }
  return out;
}

function readUser() {
  try { return JSON.parse(localStorage.getItem('pw_user') || 'null'); } catch { return null; }
}

function downloadJson(fileName, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ---------------- 导出 ----------------
export async function exportFullBackup() {
  const local = collectLocalStorage();
  const errors = [];
  let server = null;

  try {
    server = await API.backup.export();
  } catch (e) {
    errors.push({ table: 'server', message: String((e && e.message) || e) });
  }

  const now = new Date();
  const fileName = `workspace-backup-${now.toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`;
  downloadJson(fileName, {
    meta: {
      app: 'ethan-workspace',
      version: 1,
      exportedAt: now.toISOString(),
      origin: typeof location !== 'undefined' ? location.origin : '',
      user: readUser(),
    },
    localStorage: local,
    server,
    errors,
  });

  return {
    fileName,
    localCount: Object.keys(local).length,
    serverCounts: (server && server.counts) || {},
    errors: [...errors, ...((server && server.errors) || [])],
  };
}

// ---------------- 还原 ----------------
// 解析并校验备份文件；返回 { data } 或 { error }
export function parseBackupFile(text) {
  let data;
  try { data = JSON.parse(text); }
  catch { return { error: '文件不是合法的 JSON' }; }
  if (!data || typeof data !== 'object') return { error: '文件内容为空' };
  if (!data.meta || data.meta.app !== 'ethan-workspace') return { error: '这不是本工作台导出的备份文件' };
  if (!data.server || typeof data.server !== 'object' || !data.server.tables) {
    return { error: '备份文件缺少服务端数据，无法还原' };
  }
  if (typeof data.server.tables !== 'object' || Array.isArray(data.server.tables)) {
    return { error: '备份文件的服务端数据格式不正确' };
  }
  return { data };
}

// 覆盖式还原：先写服务端，成功后再写本地设置
export async function restoreFullBackup(payload) {
  const result = { restored: [], errors: [], localCount: 0 };

  const r = await API.backup.restore(payload.server.tables);
  result.restored = (r && r.restored) || [];
  result.errors = (r && r.errors) || [];

  // 服务端整批失败（抛错）时不会走到这里，本地设置保持原样
  const local = payload.localStorage;
  if (local && typeof local === 'object') {
    for (const [k, v] of Object.entries(local)) {
      if (SKIP_LS_KEYS.has(k) || typeof v !== 'string') continue;
      try { localStorage.setItem(k, v); result.localCount++; } catch { /* 配额不足等，跳过 */ }
    }
  }

  return result;
}