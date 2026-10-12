// ============================================================
// 全量数据备份：把「服务端 D1」+「浏览器 localStorage」两层数据打成一个 JSON 文件
//   · 服务端走 /api/backup/export（只读，按表全量返回，不受 list 接口截断影响）
//   · 客户端收 localStorage 全量（主题 / 模块色 / 分类映射 / annual_* / AI 数据 / 布局偏好）
//   · 登录凭证 pw_unlock_token 不入备份文件
//   返回 { fileName, serverCounts, localCount, errors }，便于界面反馈
// ============================================================
import { API } from '../api/client.js';

// 不入备份的键：pw_unlock_token 是登录会话凭证，恢复时重新登录即可
const SKIP_LS_KEYS = new Set(['pw_unlock_token', 'weread_api_key']);

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
  const payload = {
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
  };

  downloadJson(fileName, payload);

  return {
    fileName,
    localCount: Object.keys(local).length,
    serverCounts: (server && server.counts) || {},
    errors: [...errors, ...((server && server.errors) || [])],
  };
}