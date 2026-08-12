// 日期工具：所有日期统一使用本地 YYYY-MM-DD 格式，避免时区问题

export function pad(n) { return String(n).padStart(2, '0'); }

export function toISODate(d) {
  const date = d instanceof Date ? d : new Date(d);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function fromISODate(s) {
  if (!s) return new Date();
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(Number.isFinite(y) ? y : 0, (m || 1) - 1, d || 1);
}

export function today() {
  return toISODate(new Date());
}

export function addDays(d, n) {
  const date = d instanceof Date ? new Date(d) : fromISODate(d);
  date.setDate(date.getDate() + n);
  return date;
}

export function addDaysISO(s, n) {
  return toISODate(addDays(s, n));
}

export function startOfWeek(d = new Date()) {
  const date = d instanceof Date ? new Date(d) : fromISODate(d);
  const day = date.getDay(); // 0=Sun, 1=Mon...
  // 以周一为一周开始
  const diff = (day === 0 ? -6 : 1 - day);
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function endOfWeek(d = new Date()) {
  const s = startOfWeek(d);
  s.setDate(s.getDate() + 6);
  return s;
}

export function startOfMonth(d = new Date()) {
  const date = d instanceof Date ? new Date(d) : fromISODate(d);
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function endOfMonth(d = new Date()) {
  const date = d instanceof Date ? new Date(d) : fromISODate(d);
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

export function rangeOf(from, to) {
  const out = [];
  let cur = from instanceof Date ? new Date(from) : fromISODate(from);
  const end = to instanceof Date ? new Date(to) : fromISODate(to);
  while (cur <= end) {
    out.push(toISODate(cur));
    cur = addDays(cur, 1);
  }
  return out;
}

// 月历网格（含上月末尾与下月开头的占位）
export function calendarGrid(year, month /* 0-based */) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startDay = first.getDay(); // 0=Sun
  const grid = [];
  // 周一开始
  const offset = (startDay === 0 ? 6 : startDay - 1);
  // 前补
  for (let i = offset; i > 0; i--) {
    grid.push({ date: toISODate(addDays(first, -i)), inMonth: false });
  }
  // 本月
  for (let d = 1; d <= last.getDate(); d++) {
    grid.push({ date: toISODate(new Date(year, month, d)), inMonth: true });
  }
  // 后补至 42 格
  while (grid.length < 42) {
    const lastDate = grid[grid.length - 1].date;
    grid.push({ date: addDaysISO(lastDate, 1), inMonth: false });
  }
  return grid;
}

const CN_WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
export function weekdayCN(d) {
  const date = d instanceof Date ? d : fromISODate(d);
  return '星期' + CN_WEEKDAYS[date.getDay()];
}

export function formatGreeting(d = new Date()) {
  const h = d.getHours();
  if (h < 6) return '夜深了';
  if (h < 11) return '早上好';
  if (h < 13) return '中午好，记得休息☕️';
  if (h < 18) return '下午好';
  if (h < 22) return '晚上好';
  return '夜深了，早点睡';
}

export function formatChineseDate(d = new Date()) {
  const date = d instanceof Date ? d : fromISODate(d);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 · ${weekdayCN(date)}`;
}

// 时间转分钟数便于排序
export function timeToMin(t) {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

// 时长格式化
export function formatDuration(min) {
  if (!min) return '';
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h${m}m` : `${h}h`;
}

// 通过 start/end 时间字符串计算时长分钟（兜底，不依赖 duration_min 字段）
export function calcDurationMin(start, end) {
  if (!start || !end) return null;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  if ([sh, sm, eh, em].some(v => Number.isNaN(v))) return null;
  let d = (eh * 60 + em) - (sh * 60 + sm);
  if (d <= 0) d += 1440; // 跨天补偿
  return d;
}

// 同步预查缓存：命中返回 {value, ts}，否则 null
// 用于调用 setLoading(true) 之前先判断是否真的需要显示骨架屏
export function cachePeek(cacheKey, cacheRef, cacheTTL = 3000) {
  const cached = cacheRef.current.get(cacheKey);
  if (!cached) return null;
  if (Date.now() - cached.ts >= cacheTTL) return null;
  return cached;
}

// Loading Gate：首屏/空数据加载时开启 80ms 延迟门
// 若请求在 80ms 内返回 -> 根本不显示骨架屏（消除微秒级缓存/快请求的闪屏）
// 用法：const gate = loadingGate(setLoading, 80); gate.require(); ... finally { gate.done(); }
export function loadingGate(setLoadingFn, delayMs = 80) {
  let t = null;
  let fired = false;
  return {
    require() {
      t = setTimeout(() => { fired = true; setLoadingFn(true); }, delayMs);
    },
    done() {
      if (t) clearTimeout(t);
      if (fired) setLoadingFn(false);
    },
    // 如果判断根本不需要 loading（缓存命中 / 已有旧数据），可直接 cancel 避免任何状态切换
    cancel() { if (t) clearTimeout(t); }
  };
}

// 带缓存+去重的 loader 工厂：用于 React StrictMode 下避免 effect 重复触发查库
// - inFlightRef: useRef(null)，用于记录当前飞行中的 Promise
// - cacheRef:    useRef(new Map())，缓存结果，key=cacheKey
// - cacheTTL:    缓存有效期(ms)，默认 3000ms
export function cachedLoad(cacheKey, loader, inFlightRef, cacheRef, cacheTTL = 3000) {
  const peeked = cachePeek(cacheKey, cacheRef, cacheTTL);
  if (peeked) return Promise.resolve(peeked.value);
  if (inFlightRef.current && inFlightRef.current.key === cacheKey) return inFlightRef.current.promise;
  const p = Promise.resolve()
    .then(() => loader())
    .then(value => {
      cacheRef.current.set(cacheKey, { ts: Date.now(), value });
      inFlightRef.current = null;
      return value;
    })
    .catch(err => { inFlightRef.current = null; throw err; });
  inFlightRef.current = { key: cacheKey, promise: p };
  return p;
}
