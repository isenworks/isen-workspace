/* ============================================================
 * 工作台结构色主题（按钮 / tab 选中态 / 链接 / 复选框等交互元素）
 * 通过 CSS 变量注入 <html>，与内容语义色（五模块 categoryMapping）完全解耦
 * 持久化：localStorage `ws_theme`（当前选择）、`ws_custom_themes`（自定义列表）
 * ============================================================ */

/* ---- hex → rgb 三元组 ---- */
function hexToRgb(hex) {
  const h = (hex || '').replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `${r},${g},${b}`;
}

/* ---- 从 main hex 派生 deep（通道 ×0.7） ---- */
function deriveDeep(hex) {
  const h = (hex || '').replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return '#0040DD';
  const r = Math.round(parseInt(h.slice(0, 2), 16) * 0.7);
  const g = Math.round(parseInt(h.slice(2, 4), 16) * 0.7);
  const b = Math.round(parseInt(h.slice(4, 6), 16) * 0.7);
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

/* ---- 从 hex 生成完整主题对象（纯色，gradFrom=gradTo=main） ---- */
function makeThemeFromHex(hex, label, key) {
  const rgb = hexToRgb(hex) || '0,122,255';
  return {
    key: key || ('custom_' + Date.now()),
    label: label || '自定义',
    desc: hex.toUpperCase(),
    main: hex,
    deep: deriveDeep(hex),
    rgb,
    gradFrom: hex,
    gradTo: hex,
    custom: true,
  };
}

/* ---- 内置主题（不可删改） ---- */
export const THEMES = {
  blue: {
    key: 'blue',
    label: 'iOS蓝',
    desc: 'iOS 标准蓝',
    main: '#007AFF',
    deep: '#0040DD',
    rgb: '0,122,255',
    gradFrom: '#007AFF',
    gradTo: '#007AFF',
  },
};

const LS_KEY = 'ws_theme';
const LS_CUSTOM = 'ws_custom_themes';

/* ---- 自定义主题增删改查 ---- */
export function getCustomThemes() {
  try {
    const raw = localStorage.getItem(LS_CUSTOM);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

export function saveCustomThemes(arr) {
  try { localStorage.setItem(LS_CUSTOM, JSON.stringify(arr)); } catch { /* ignore */ }
}

export function addCustomTheme(hex, label) {
  const t = makeThemeFromHex(hex, label);
  const arr = getCustomThemes();
  arr.push(t);
  saveCustomThemes(arr);
  return t;
}

export function updateCustomTheme(key, hex, label) {
  const arr = getCustomThemes();
  const idx = arr.findIndex(t => t.key === key);
  if (idx < 0) return null;
  const updated = makeThemeFromHex(hex, label || arr[idx].label, key);
  arr[idx] = updated;
  saveCustomThemes(arr);
  return updated;
}

export function deleteCustomTheme(key) {
  const arr = getCustomThemes().filter(t => t.key !== key);
  saveCustomThemes(arr);
}

/* ---- 合并集合 ---- */
export function getAllThemes() {
  const custom = getCustomThemes();
  const merged = { ...THEMES };
  custom.forEach(t => { merged[t.key] = t; });
  return merged;
}

export function getThemeKey() {
  try {
    const k = localStorage.getItem(LS_KEY);
    return getAllThemes()[k] ? k : 'blue';
  } catch { return 'blue'; }
}

export function applyTheme(key) {
  const all = getAllThemes();
  const t = all[key] ? all[key] : THEMES.blue;
  try { localStorage.setItem(LS_KEY, t.key); } catch { /* ignore */ }
  const root = document.documentElement;
  root.setAttribute('data-theme', t.key);
  root.style.setProperty('--s-main', t.main);
  root.style.setProperty('--s-deep', t.deep);
  root.style.setProperty('--s-rgb', t.rgb);
  root.style.setProperty('--s-grad-bg', `linear-gradient(135deg, ${t.gradFrom} 0%, ${t.gradTo} 100%)`);
}

/* ---- 校验 hex ---- */
export function isValidHex(hex) {
  return /^#[0-9a-fA-F]{6}$/.test(hex || '');
}

// 初始化（main.jsx 渲染前调用，避免主题闪烁）
export function initTheme() {
  applyTheme(getThemeKey());
}
