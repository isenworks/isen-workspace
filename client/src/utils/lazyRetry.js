import { lazy } from 'react';

/* 懒加载分包自愈：部署后旧标签页仍持有旧 index.html，切换页面/弹窗时
   去拉已被新部署替换掉的 hash 分包（或网络瞬断），会抛
   "Failed to fetch dynamically imported module"。
   处理：首次失败直接整页刷新（浏览器拿到最新入口与分包）；5 秒内已刷新过
   则不再循环刷新（sessionStorage 跨 reload 保留），让错误正常抛出。
   所有路由级 / 弹窗级 lazy() 统一走 lazyRetry() 包装。 */
const RELOAD_KEY = 'chunk_reload_at';

export function lazyRetry(loader) {
  return lazy(() =>
    loader().catch((err) => {
      const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
      if (Date.now() - last > 5000) {
        sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
        window.location.reload();
      }
      throw err; // 刷新已发起；若 5 秒内重复失败则正常进入错误提示
    })
  );
}
