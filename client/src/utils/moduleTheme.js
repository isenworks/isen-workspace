/* ============================================================
 * 五大模块色（精力/知力/能力/工作/生活）
 * 通过 CSS 变量注入 <html>，与结构色主题（theme.js）完全解耦
 * 持久化：localStorage `ws_module_colors`
 * ============================================================ */

export const MODULE_COLORS = {
  energy:    { key: 'energy',    label: '精力', default: '#34C759' },
  cognition: { key: 'cognition', label: '知力', default: '#007AFF' },
  ability:   { key: 'ability',   label: '能力', default: '#FF9500' },
  work:      { key: 'work',      label: '工作', default: '#FF3B30' },
  life:      { key: 'life',      label: '生活', default: '#AF52DE' },
};

const LS_KEY = 'ws_module_colors';

/* hex → "r,g,b" 三元组 */
function hexToRgb(hex) {
  const h = (hex || '').replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `${r},${g},${b}`;
}

export function isValidHex(hex) {
  return /^#[0-9a-fA-F]{6}$/.test(hex || '');
}

export function getModuleColors() {
  const result = {};
  try {
    const raw = localStorage.getItem(LS_KEY);
    const saved = raw ? JSON.parse(raw) : {};
    for (const [k, v] of Object.entries(MODULE_COLORS)) {
      const hex = saved[k] || v.default;
      result[k] = { ...v, hex, rgb: hexToRgb(hex) || hexToRgb(v.default) };
    }
  } catch {
    for (const [k, v] of Object.entries(MODULE_COLORS)) {
      result[k] = { ...v, hex: v.default, rgb: hexToRgb(v.default) };
    }
  }
  return result;
}

export function saveModuleColor(key, hex) {
  let saved = {};
  try {
    const raw = localStorage.getItem(LS_KEY);
    saved = raw ? JSON.parse(raw) : {};
  } catch { /* ignore */ }
  saved[key] = hex;
  try { localStorage.setItem(LS_KEY, JSON.stringify(saved)); } catch { /* ignore */ }
}

export function resetModuleColor(key) {
  let saved = {};
  try {
    const raw = localStorage.getItem(LS_KEY);
    saved = raw ? JSON.parse(raw) : {};
  } catch { /* ignore */ }
  delete saved[key];
  try { localStorage.setItem(LS_KEY, JSON.stringify(saved)); } catch { /* ignore */ }
}

export function resetAllModuleColors() {
  try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
}

export function applyModuleColors() {
  const colors = getModuleColors();
  const root = document.documentElement;
  for (const [k, v] of Object.entries(colors)) {
    root.style.setProperty(`--m-${k}`, v.hex);
    root.style.setProperty(`--m-${k}-rgb`, v.rgb);
  }
}

export function initModuleColors() {
  applyModuleColors();
}
