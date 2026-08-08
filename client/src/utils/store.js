// 轻量 patch 广播：toggle 时各面板即时同步，无需重新 load
const listeners = new Set();
export const store = {
  broadcast(patch) { listeners.forEach(fn => fn(patch)); },
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
};
