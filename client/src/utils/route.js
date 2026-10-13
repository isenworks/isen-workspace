/* ============================================================
 * route · 工作台 hash 深链路由
 *  - 形式：#/home、#/plan、#/calendar、#/annual/work、#/inbox …
 *  - 用途：刷新保持当前页、浏览器前进/后退、可分享链接
 *  - 说明：#annual / #annual-plan（无斜杠）为年度规划独立预览路由，
 *    由 App.jsx 精确匹配处理，不走本模块；本模块只认带斜杠的 #/…
 * ============================================================ */

export const MENUS = ['home', 'plan', 'calendar', 'annual', 'inbox', 'knowledge', 'ai', 'recycle'];

export const ANNUAL_VIEWS = ['overview', 'energy', 'cognition', 'ability', 'work', 'finance', 'life'];

/* 解析 location.hash → { menu, annualView }
 *  - 未知 / 空 / 独立预览路由（#annual）→ menu: null（调用方回退默认页）
 *  - annual 视图非法时回退 'overview' */
export function parseRoute(hash) {
  const raw = String(hash || '').replace(/^#\/?/, '');
  if (!raw) return { menu: null, annualView: null };
  const [m, v] = raw.split('/');
  if (!MENUS.includes(m)) return { menu: null, annualView: null };
  if (m === 'annual') {
    return { menu: 'annual', annualView: ANNUAL_VIEWS.includes(v) ? v : 'overview' };
  }
  return { menu: m, annualView: null };
}

/* 由 menu(+annualView) 生成 hash 字符串（含前导 #） */
export function buildRoute(menu, annualView) {
  if (!menu || !MENUS.includes(menu)) return '#/home';
  if (menu === 'annual') {
    return `#/annual/${ANNUAL_VIEWS.includes(annualView) ? annualView : 'overview'}`;
  }
  return `#/${menu}`;
}