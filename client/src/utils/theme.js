/* ============================================================
 * 工作台结构色主题（按钮 / tab 选中态 / 链接 / 复选框等交互元素）
 * 通过 CSS 变量注入 <html>，与内容语义色（五模块 categoryMapping）完全解耦
 * 持久化：localStorage `ws_theme`
 * ============================================================ */

export const THEMES = {
  blue: {
    key: 'blue',
    label: '经典蓝',
    desc: 'iOS 标准蓝',
    main: '#007AFF',
    deep: '#0040DD',
    rgb: '0,122,255',
    gradFrom: '#007AFF',
    gradTo: '#007AFF',
  },
  sky: {
    key: 'sky',
    label: '天青晨曦',
    desc: '浅天蓝 → 亮蓝渐变',
    main: '#2E7CF6',
    deep: '#1E5FD6',
    rgb: '46,124,246',
    gradFrom: '#62B7FF',
    gradTo: '#2E7CF6',
  },
  graphite: {
    key: 'graphite',
    label: '石墨灰',
    desc: '石墨灰阶渐变',
    main: '#3A3A3C',
    deep: '#2C2C2E',
    rgb: '110,110,115',
    gradFrom: '#6E6E73',
    gradTo: '#3A3A3C',
  },
};

const LS_KEY = 'ws_theme';

export function getThemeKey() {
  try {
    const k = localStorage.getItem(LS_KEY);
    return THEMES[k] ? k : 'blue';
  } catch { return 'blue'; }
}

export function applyTheme(key) {
  const t = THEMES[key] ? THEMES[key] : THEMES.blue;
  try { localStorage.setItem(LS_KEY, t.key); } catch { /* ignore */ }
  const root = document.documentElement;
  root.setAttribute('data-theme', t.key);
  root.style.setProperty('--s-main', t.main);
  root.style.setProperty('--s-deep', t.deep);
  root.style.setProperty('--s-rgb', t.rgb);
  root.style.setProperty('--s-grad-bg', `linear-gradient(135deg, ${t.gradFrom} 0%, ${t.gradTo} 100%)`);
}

// 初始化（main.jsx 渲染前调用，避免主题闪烁）
export function initTheme() {
  applyTheme(getThemeKey());
}
