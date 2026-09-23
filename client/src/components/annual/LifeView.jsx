import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { HABITS, LIFE } from './data.js';
import { pct, uid } from './utils.js';
import { EditableTitle } from './ui.jsx';
import { usePersistentState } from './hooks.js';
import { useSplitRatio, SplitDivider } from '../useSplitRatio.jsx'
import { moduleColor, moduleRgba } from '../../utils/color.js'
import { API } from '../../api/client.js'
import lunarLib from '../../vendor/lunar.js';
import EntryForm from '../forms/EntryForm.jsx'
import PlantingShelf from './PlantingShelf.jsx'

/* 农历生日胶囊文案：把存储的公历日期换算回农历，得「农历八月初一」；
 * 公历生日返回「公历」；换算失败回退「农历」 */
function lunarBadgeText(b) {
  if (b.repeat_rule !== 'lunar-yearly') return '公历';
  try {
    const parts = String(b.date || '').split('-');
    const y = parseInt(parts[0], 10), mo = parseInt(parts[1], 10), d = parseInt(parts[2], 10);
    if (!y || !mo || !d) return '农历';
    const lun = lunarLib.Solar.fromYmd(y, mo, d).getLunar();
    return `农历${lun.getMonthInChinese()}月${lun.getDayInChinese()}`;
  } catch { return '农历'; }
}

function LifeStatsBar({ categories }) {
  const total = categories.reduce((s, c) => s + c.count, 0) || 1;
  const max = Math.max(...categories.map(c => c.count), 1);
  return (
    <div className="glass-card p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg grid place-items-center bg-accent-red/10 text-accent-red">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M3 3v18h18M7 14l4-4 4 4 5-5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span className="text-sm font-bold text-ink-900">生活记录分布</span>
        </div>
        <span className="text-[11px] font-semibold text-ink-500">共 <span className="tabular-nums text-ink-700">{total}</span> 条记录</span>
      </div>
      {/* 堆叠百分比条 */}
      <div className="flex h-3 rounded-full overflow-hidden bg-ink-50">
        {categories.map((c, i) => {
          const w = (c.count / total) * 100;
          if (w < 1) return null;
          return <div key={c.key} style={{ width: `${w}%`, background: c.color }} className={i === 0 ? 'rounded-l-full' : i === categories.length - 1 ? 'rounded-r-full' : ''} />;
        })}
      </div>
      {/* 单项进度排行 */}
      <div className="flex flex-col gap-2">
        {[...categories].sort((a, b) => b.count - a.count).map((c, i) => {
          const pct = Math.round((c.count / max) * 100);
          const share = Math.round((c.count / total) * 100);
          return (
            <div key={c.key} className="flex items-center gap-2.5">
              <span className="text-xs w-4 h-4 rounded-full grid place-items-center flex-shrink-0 font-bold"
                style={{ background: `${c.color}15`, color: c.color }}>
                {i + 1}
              </span>
              <span className="text-xs font-semibold text-ink-700 w-10 flex-shrink-0">{c.label}</span>
              <div className="flex-1 h-2 rounded-full bg-ink-50 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: c.color }} />
              </div>
              <span className="text-[11px] font-bold tabular-nums text-ink-700 w-10 text-right flex-shrink-0">
                {c.count} · {share}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- 2.5 真实习惯数据获取 · Energy ---------- */
// 从工作台习惯打卡 API 读取精力类习惯的年度数据
// 未登录/API 失败时回退到 mock HABITS，保证沙盒模式可用
//
// 首屏闪 mock 数据的根因：realHabits 初始为 null，要等异步 API 返回（数秒）才换成真实习惯名/进度。
// 修复：localStorage 写穿缓存 —— 初始化同步读缓存（打开即真实数据），API 成功后回写校准（换设备/清缓存场景）。
function LifeCatIcon({ catKey, lb, className, style }) {
  const cls = className || 'w-4 h-4';
  const isPet = catKey === 'pet' || lb === '宠物';
  const isBd = catKey === 'birthday' || lb === '生日';
  const known = ['relation', 'food', 'travel', 'movie', 'shop', 'birthday'];
  return (
    <svg className={cls} style={style} fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      {catKey === 'relation' && (<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>)}
      {catKey === 'food' && (<><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/></>)}
      {catKey === 'travel' && (<><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></>)}
      {catKey === 'movie' && (<><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></>)}
      {catKey === 'shop' && (<><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></>)}
      {isBd && (<><path d="M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8"/><path d="M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1"/><path d="M2 21h20"/><path d="M7 8v3"/><path d="M12 8v3"/><path d="M17 8v3"/><path d="M7 4h.01"/><path d="M12 4h.01"/><path d="M17 4h.01"/></>)}
      {isPet && (<><circle cx="11" cy="4" r="2"/><circle cx="18" cy="8" r="2"/><circle cx="20" cy="16" r="2"/><path d="M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z"/></>)}
      {!isPet && !known.includes(catKey) && (<><path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r="1" fill="currentColor" stroke="none"/></>)}
    </svg>
  );
}

export function LifeView({ lifeData, onEntryAdd, onEntryEdit, onStartHighlights, highlightedIds, docLinks, onDocLinksChange, onCatAdd, onBirthdayAdd, onBirthdayEdit, onBirthdayDelete, bdRefreshKey }) {
  const dynLife = lifeData || LIFE;
  const totalEntries = dynLife.reduce((s, c) => s + c.entries.length, 0);
  // 生活模块完成率：有记录的类目数 / 总类目数 * 100（体验型鼓励每个类目都有内容）
  const lifePct = Math.round((dynLife.filter(c => c.entries.length > 0).length / dynLife.length) * 100);
  const hlCount = Array.isArray(highlightedIds) ? highlightedIds.length : 0;

  /* ===== 双面板布局：左类目导航（筛选器）+ 右时间流（唯一主视图） ===== */
  const [lifeFilter, setLifeFilter] = useState(null); // null=全部 | 类目 key | 'birthday'=生日虚拟分类
  // 生日数据（从 schedules API 获取，title 含"生日" + repeat_rule=yearly/lunar-yearly）
  const [birthdays, setBirthdays] = useState([]);
  const [bdLoading, setBdLoading] = useState(false);
  const refreshBirthdays = useCallback(async () => {
    setBdLoading(true);
    try {
      const res = await API.schedules.list({});
      const all = (res?.schedules || res?.schedule || []);
      // 生日 = 标题含「生日」且（每年重复 或 🎂 前缀标记）；一次性「生日聚会」不会误入
      setBirthdays(all.filter(s => {
        const t = String(s.title || '');
        return t.includes('生日') && (s.repeat_rule === 'yearly' || s.repeat_rule === 'lunar-yearly' || t.startsWith('🎂'));
      }));
    } catch (e) { /* ignore */ }
    setBdLoading(false);
  }, []);
  useEffect(() => { refreshBirthdays(); }, [refreshBirthdays, bdRefreshKey]);
  /* 「全部分类」行 + 号：新建模块 mini 输入行（交互设计复用 EntryForm 的新建模块面板） */
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCatLb, setNewCatLb] = useState('');
  // 页头标题：右键可编辑（usePersistentState 持久化，清空回落默认文案）
  const [lifeTitle, setLifeTitle] = usePersistentState('annual_life_title', () => '');
  function createCategory() {
    const lb = newCatLb.trim();
    if (lb) onCatAdd?.({ lb });
    setNewCatLb('');
    setShowNewCat(false);
  }
  const selFilterCat = lifeFilter ? dynLife.find(c => c.key === lifeFilter) : null;
  // 模块色/类目色转 rgba：var(--m-life) → rgba(var(--m-life-rgb), a)；hex → 拼接透明度
  const lifeRgba = (color, a) => {
    if (typeof color === 'string' && color.startsWith('var(')) return `rgba(var(${color.slice(4, -1)}-rgb), ${a})`;
    if (/^#[0-9a-fA-F]{6}$/.test(color)) return `${color}${Math.round(a * 255).toString(16).padStart(2, '0')}`;
    return color;
  };
  // 扁平化（可被筛选）→ 解析 d(如 8.24 / 8.17-8.18 取起始日) → 按月分组倒序
  const timeGroups = useMemo(() => {
    const rows = [];
    // 年份：条目可带 e.y 扩展字段；缺省视为当年（当前数据 e.d 仅存"8.24"月日格式）
    const currentYear = new Date().getFullYear();
    (lifeFilter ? dynLife.filter(c => c.key === lifeFilter) : dynLife || []).forEach(c => (c.entries || []).forEach((e, i) => {
      const m = String(e.d || '').match(/(\d{1,2})\s*[./]\s*(\d{1,2})/);
      rows.push({ cat: c, e, idx: i, mo: m ? +m[1] : 0, day: m ? +m[2] : 0, yr: e.y || currentYear });
    }));
    rows.sort((a, b) => (b.yr - a.yr) || (b.mo - a.mo) || (b.day - a.day));
    const groups = [];
    rows.forEach(r => {
      const last = groups[groups.length - 1];
      if (last && last.mo === r.mo && last.year === r.yr) last.items.push(r);
      else groups.push({ mo: r.mo, year: r.yr, label: r.mo ? `${String(r.mo).padStart(2, '0')}月` : '无日期', items: [r] });
    });
    return groups;
  }, [dynLife, lifeFilter]);

  // 生日倒计时：计算今年/明年下次生日距今天数（nextYear 用于正确分组年份）
  const bdCountdown = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return birthdays.map(b => {
      // 从 title 去掉 🎂 前缀和"生日"后缀得到姓名
      const name = String(b.title || '').replace(/^🎂/, '').replace(/生日$/, '').trim() || b.title;
      // 从 date 字段解析月日
      const parts = String(b.date || '').split('-');
      const mo = parts[1] ? parseInt(parts[1], 10) : 0;
      const day = parts[2] ? parseInt(parts[2], 10) : 0;
      if (!mo || !day) return { ...b, name, mo, day, daysLeft: 9999, passed: false, nextYear: today.getFullYear(), lunarText: lunarBadgeText(b) };
      // 计算今年生日
      let thisYearBd = new Date(today.getFullYear(), mo - 1, day);
      thisYearBd.setHours(0, 0, 0, 0);
      let nextBd = thisYearBd;
      let passed = false;
      if (nextBd < today) {
        // 今年已过，算明年
        nextBd = new Date(today.getFullYear() + 1, mo - 1, day);
        passed = true;
      }
      const daysLeft = Math.round((nextBd - today) / (1000 * 60 * 60 * 24));
      const daysPassed = passed ? Math.round((today - thisYearBd) / (1000 * 60 * 60 * 24)) : 0;
      return { ...b, name, mo, day, daysLeft, daysPassed, passed, nextYear: nextBd.getFullYear(), isLunar: b.repeat_rule === 'lunar-yearly', lunarText: lunarBadgeText(b) };
    }).sort((a, b) => a.daysLeft - b.daysLeft);
  }, [birthdays]);

  /* ===== 需求 2：链接按钮 · 右键菜单增删改 · 点击跳转 ===== */
  const [linkMenu, setLinkMenu] = useState(null); // { x, y, editingId } | null
  const [bdMenu, setBdMenu] = useState(null); // { x, y, bd } | null
  /* 生日视图切换：date=按日期时间流 / person=按人列表（记忆用户偏好） */
  const [bdView, setBdView] = usePersistentState('annual_life_bd_view', () => 'date');
  /* 按日期视图的浏览年份（默认当年；◀▶ 切换，不持久化避免停在旧年份） */
  const [bdYear, setBdYear] = useState(new Date().getFullYear());

  /* 按日期视图：浏览年 bdYear 内各生日的「当次日期」。
   * 语义与按人视图（下次生日）不同 —— 年份切换浏览的是日历年内所有人该年的生日：
   *   - 公历：直接用存储的月/日
   *   - 农历：存储的是创建年的公历日期 → 先转回农历月日，再换算到浏览年（农历生日每年公历日期会漂移）
   */
  const bdYearRows = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return birthdays.map(b => {
      const name = String(b.title || '').replace(/^🎂/, '').replace(/生日$/, '').trim() || b.title;
      const parts = String(b.date || '').split('-');
      const mo = parts[1] ? parseInt(parts[1], 10) : 0;
      const day = parts[2] ? parseInt(parts[2], 10) : 0;
      const baseYear = parts[0] ? parseInt(parts[0], 10) : today.getFullYear();
      if (!mo || !day) return { ...b, name, mo, day, daysLeft: 9999, daysPassed: 0, passed: false, isLunar: b.repeat_rule === 'lunar-yearly', lunarText: lunarBadgeText(b) };
      let yMo = mo, yDay = day;
      if (b.repeat_rule === 'lunar-yearly') {
        try {
          const lun = lunarLib.Solar.fromYmd(baseYear, mo, day).getLunar();
          const solarY = lunarLib.Lunar.fromYmd(bdYear, lun.getMonth(), lun.getDay()).getSolar();
          yMo = solarY.getMonth();
          yDay = solarY.getDay();
        } catch { /* 换算失败回退固定月日 */ }
      }
      const yBd = new Date(bdYear, yMo - 1, yDay);
      yBd.setHours(0, 0, 0, 0);
      const diff = Math.round((yBd - today) / (1000 * 60 * 60 * 24));
      return {
        ...b, name, mo: yMo, day: yDay,
        daysLeft: diff, daysPassed: diff < 0 ? -diff : 0, passed: diff < 0,
        isToday: diff === 0, isLunar: b.repeat_rule === 'lunar-yearly', lunarText: lunarBadgeText(b),
      };
    }).sort((a, b) => (a.mo - b.mo) || (a.day - b.day));
  }, [birthdays, bdYear]);
  /* ===== 左侧分类手动排序：HTML5 拖拽，顺序持久化（含生日虚拟行；「全部分类」固定第一不参与） ===== */
  const allRowKeys = useMemo(() => ['birthday', ...dynLife.map(c => c.key)], [dynLife]);
  const [rowOrder, setRowOrder] = usePersistentState('annual_life_rows_order', () => []);
  // 展示顺序 = 已保存顺序（过滤已删除项）+ 未记录的新类目追加尾部
  const orderedRows = useMemo(() => {
    const saved = (Array.isArray(rowOrder) ? rowOrder : []).filter(k => allRowKeys.includes(k));
    const rest = allRowKeys.filter(k => !saved.includes(k));
    return [...saved, ...rest].map(k => (k === 'birthday' ? { key: 'birthday' } : dynLife.find(c => c.key === k))).filter(Boolean);
  }, [rowOrder, allRowKeys, dynLife]);
  const dragCatKey = useRef(null);
  const [dragSrcKey, setDragSrcKey] = useState(null);
  const [dragOver, setDragOver] = useState(null); // { key, pos: 'before' | 'after' }
  const resetDrag = () => { dragCatKey.current = null; setDragSrcKey(null); setDragOver(null); };
  const handleRowDragStart = (e, key) => {
    dragCatKey.current = key;
    setDragSrcKey(key);
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', key); } catch { /* Firefox 需要 setData 才能触发拖拽 */ }
  };
  const handleRowDragOver = (e, key) => {
    if (!dragCatKey.current) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragCatKey.current === key) { setDragOver(null); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
    if (!dragOver || dragOver.key !== key || dragOver.pos !== pos) setDragOver({ key, pos });
  };
  const handleRowDrop = (e, key) => {
    e.preventDefault();
    e.stopPropagation();
    const src = dragCatKey.current;
    const pos = dragOver && dragOver.key === key ? dragOver.pos : 'before';
    if (src && src !== key) {
      const keys = orderedRows.map(r => r.key);
      const from = keys.indexOf(src);
      if (from >= 0) {
        keys.splice(from, 1);
        let to = keys.indexOf(key);
        if (to >= 0) {
          if (pos === 'after') to++;
          keys.splice(to, 0, src);
          setRowOrder(keys);
        }
      }
    }
    resetDrag();
  };
  /* 生日视图切换控件（右卡顶部）：iOS segmented 风格，与日历表单重复分段控件同语言 */
  const bdToggle = (
    <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-[rgba(120,120,128,0.10)]">
      {[['date', '按日期'], ['person', '按人']].map(([v, lb]) => (
        <button key={v} onClick={() => setBdView(v)}
          className={`px-2.5 py-1 text-[11px] font-bold rounded-[7px] transition cursor-pointer ${bdView === v ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-700'}`}>
          {lb}
        </button>
      ))}
    </div>
  );
  const [linkListPopup, setLinkListPopup] = useState(null); // { x, y } | null — 多链接时点击弹出选择面板
  const [linkForm, setLinkForm] = useState({ title: '', url: '' }); // 编辑/新建 mini 表单
  const links = Array.isArray(docLinks) ? docLinks : [];
  const closeAllMenus = () => { setLinkMenu(null); setLinkListPopup(null); setLinkForm({ title: '', url: '' }); };

  // ===== 左右分栏拖拽（38:62，与收集箱二分布局同款交互，独立记忆） =====
  const { leftStyle, rightStyle, bindRoot, bindDivider } = useSplitRatio('life_split_ratio');

  // 点击链接按钮：1条直接跳转；多条弹出选择
  function handleLinkButtonClick(e) {
    e.stopPropagation();
    if (!links || links.length === 0) {
      // 没有链接 → 直接触发新建表单（模拟右键→添加）
      const rect = e.currentTarget.getBoundingClientRect();
      setLinkMenu({ x: rect.left, y: rect.bottom + 6, editingId: null });
      return;
    }
    if (links.length === 1) {
      window.open(links[0].url, '_blank', 'noopener,noreferrer');
      return;
    }
    // 多条 → 弹出选择列表面板
    const rect = e.currentTarget.getBoundingClientRect();
    setLinkListPopup({ x: rect.left, y: rect.bottom + 6 });
  }
  // 右键：弹出增删改菜单
  function handleLinkButtonContext(e) {
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setLinkListPopup(null);
    setLinkMenu({ x: rect.left, y: rect.bottom + 6, editingId: null });
  }
  // 更新链接列表操作（增/删/改）
  function addLink() {
    if (!linkForm.url.trim()) { alert('请输入链接地址'); return; }
    onDocLinksChange?.([...links, { id: uid(), title: linkForm.title.trim() || linkForm.url.trim(), url: linkForm.url.trim() }]);
    setLinkForm({ title: '', url: '' });
    closeAllMenus();
  }
  function updateLink(id) {
    if (!linkForm.url.trim()) { alert('请输入链接地址'); return; }
    onDocLinksChange?.(links.map(l => l.id === id ? { ...l, title: linkForm.title.trim() || linkForm.url.trim(), url: linkForm.url.trim() } : l));
    setLinkForm({ title: '', url: '' });
    closeAllMenus();
  }
  function deleteLink(id) {
    if (!confirm('确认删除此文档链接？')) return;
    onDocLinksChange?.(links.filter(l => l.id !== id));
    setLinkForm({ title: '', url: '' });
    closeAllMenus();
  }

  return (
    <div {...bindRoot} onClick={closeAllMenus} className="flex items-stretch min-h-[560px]">
      {/* ===== 左列（38%）：卡①页头 + 卡②类目导航 ===== */}
      <div className="flex flex-col gap-3 min-w-0" style={leftStyle}>
        {/* 卡① 页头卡：色条 + 16px标题 + 链接按钮（与其他5模块页头同构；年度精选 CTA 已移至右卡首年份行） */}
        <div className="bg-white rounded-2xl border border-ink-100 p-4">
          <div className="flex items-center gap-3 flex-wrap">
          <span className="w-[5px] h-[18px] rounded-full flex-shrink-0" style={{ background: 'var(--m-life)' }}></span>
          <EditableTitle value={lifeTitle} onChange={setLifeTitle} fallback={`${new Date().getFullYear()}年 · 生活体验`}
            className="text-[16px] font-bold text-ink-900 leading-none" inputClassName="text-[16px] font-bold text-ink-900" />
          {/* 链接按钮（需求 2：圆角正方形；左键跳转 / 右键增删改）—— 在年度精选左边 */}
          <div className="relative ml-auto">
            <button
              onClick={handleLinkButtonClick}
              onContextMenu={handleLinkButtonContext}
              title={links.length ? `文档链接（${links.length} 条，右键增删改）` : '右键添加飞书文档链接'}
              className="inline-flex items-center justify-center w-[22px] h-[22px] rounded-lg transition hover:brightness-105 active:scale-[0.98] cursor-pointer"
              style={{ background: moduleRgba('life', 0.10), border: `1px solid ${moduleRgba('life', 0.25)}` }}>
              {/* 外链图标：当前 UI 风格线形 · 紫 */}
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="var(--m-life)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
              </svg>
            </button>

            {/* ===== 右键菜单：增删改 ===== */}
            {linkMenu && (
              <div onClick={(e) => e.stopPropagation()} style={{
                position: 'fixed', top: linkMenu.y,
                // 右边界钳制：按钮在右上角时面板 230px+边距 会溢出视口被裁剪，改为右对齐收缩
                left: Math.max(8, Math.min(linkMenu.x, window.innerWidth - 246)), zIndex: 200,
                minWidth: '230px', padding: '6px', borderRadius: '12px',
                background: '#fff', border: '1px solid rgba(15,23,42,0.08)',
                boxShadow: '0 10px 30px rgba(15,23,42,0.12), 0 2px 6px rgba(15,23,42,0.06)',
              }}>
                {/* 现有链接条目列表 · hover 高亮 · 右侧 edit/delete */}
                {links.length === 0 && (
                  <div style={{ padding: '6px 10px', fontSize: '11px', color: '#8e8e93', fontWeight: 600 }}>
                    暂无文档链接，下面添加一条
                  </div>
                )}
                {links.map(l => (
                  <div key={l.id} style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '6px 8px', borderRadius: '8px', marginBottom: '2px',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = `${moduleRgba('life', 0.08)}`; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                    <span style={{
                      flex: 1, minWidth: 0, fontSize: '12px', fontWeight: 600, color: '#1c1c1e',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      cursor: 'pointer',
                    }}
                    title={l.url}
                    onClick={() => { window.open(l.url, '_blank', 'noopener,noreferrer'); closeAllMenus(); }}>
                      {l.title}
                    </span>
                    {/* 编辑按钮 */}
                    <button title="编辑" onClick={() => { setLinkMenu({ ...linkMenu, editingId: l.id }); setLinkForm({ title: l.title, url: l.url }); }}
                      style={{
                        width: '22px', height: '22px', borderRadius: '6px', border: 'none',
                        background: 'transparent', color: '#8e8e93', cursor: 'pointer',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = `${moduleRgba('life', 0.14)}`; e.currentTarget.style.color = 'var(--m-life)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#8e8e93'; }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                      </svg>
                    </button>
                    {/* 删除按钮 */}
                    <button title="删除" onClick={() => deleteLink(l.id)}
                      style={{
                        width: '22px', height: '22px', borderRadius: '6px', border: 'none',
                        background: 'transparent', color: '#8e8e93', cursor: 'pointer',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,59,48,0.14)'; e.currentTarget.style.color = '#FF3B30'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#8e8e93'; }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/>
                        <path d="M10 11v6M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>
                      </svg>
                    </button>
                  </div>
                ))}
                {/* 分隔线 */}
                {(linkMenu.editingId || links.length > 0) && (
                  <div style={{ height: 1, background: 'rgba(15,23,42,0.08)', margin: '4px 2px' }} />
                )}
                {/* 编辑表单（在 editingId 非空或 0 条时显示） */}
                {(linkMenu.editingId || links.length === 0) && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '6px 4px' }}>
                    <div style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--m-life)', letterSpacing: '0.04em' }}>
                      {linkMenu.editingId ? '编辑链接' : '新增链接'}
                    </div>
                    <input placeholder="标题（如：飞书·全年计划表）" value={linkForm.title}
                      onChange={(e) => setLinkForm(f => ({ ...f, title: e.target.value }))}
                      style={{
                        fontSize: '12px', padding: '5px 8px', borderRadius: '8px',
                        border: '1px solid rgba(15,23,42,0.10)', background: '#fff', outline: 'none',
                        fontWeight: 500,
                      }} />
                    <input placeholder="链接地址（支持 https://）" value={linkForm.url}
                      onChange={(e) => setLinkForm(f => ({ ...f, url: e.target.value }))}
                      style={{
                        fontSize: '12px', padding: '5px 8px', borderRadius: '8px',
                        border: '1px solid rgba(15,23,42,0.10)', background: '#fff', outline: 'none',
                        fontWeight: 500,
                      }} />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                      <button onClick={closeAllMenus}
                        style={{
                          padding: '4px 10px', borderRadius: '7px', fontSize: '11px', fontWeight: 600,
                          border: 'none', cursor: 'pointer',
                          background: 'rgba(120,120,128,0.12)', color: '#1c1c1e',
                        }}>取消</button>
                      <button onClick={() => linkMenu.editingId ? updateLink(linkMenu.editingId) : addLink()}
                        style={{
                          padding: '4px 10px', borderRadius: '7px', fontSize: '11px', fontWeight: 600,
                          border: 'none', cursor: 'pointer',
                          background: 'var(--m-life)', color: '#fff',
                          boxShadow: `0 1px 4px ${moduleRgba('life', 0.28)}`,
                        }}>{linkMenu.editingId ? '保存' : '添加'}</button>
                    </div>
                  </div>
                )}
                {/* 添加一条新的入口（已有条目且未编辑态） */}
                {links.length > 0 && !linkMenu.editingId && (
                  <button onClick={() => { setLinkMenu({ ...linkMenu, editingId: null }); setLinkForm({ title: '', url: '' }); }}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: '6px',
                      padding: '6px 8px', borderRadius: '8px', border: 'none',
                      background: 'transparent', color: 'var(--m-life)',
                      fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = `${moduleRgba('life', 0.08)}`; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                      <path d="M12 5v14M5 12h14"/>
                    </svg>
                    新增一条链接
                  </button>
                )}
              </div>
            )}

            {/* ===== 单左键多链接选择面板（简洁列表） ===== */}
            {linkListPopup && (
              <div onClick={(e) => e.stopPropagation()} style={{
                position: 'fixed', top: linkListPopup.y,
                left: Math.max(8, Math.min(linkListPopup.x, window.innerWidth - 236)), zIndex: 200,
                minWidth: '220px', padding: '6px', borderRadius: '12px',
                background: '#fff', border: '1px solid rgba(15,23,42,0.08)',
                boxShadow: '0 10px 30px rgba(15,23,42,0.12), 0 2px 6px rgba(15,23,42,0.06)',
              }}>
                <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#8e8e93', letterSpacing: '0.04em', padding: '4px 8px' }}>
                  选择要打开的文档
                </div>
                {links.map(l => (
                  <button key={l.id} onClick={() => { window.open(l.url, '_blank', 'noopener,noreferrer'); closeAllMenus(); }}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '7px 10px', borderRadius: '8px', border: 'none',
                      background: 'transparent', cursor: 'pointer',
                      fontSize: '12px', fontWeight: 600, color: '#1c1c1e',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = `${moduleRgba('life', 0.08)}`; e.currentTarget.style.color = 'var(--m-life)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#1c1c1e'; }}
                    title={l.url}>
                    {l.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        </div>
        {/* 卡② 类目导航卡：拉伸铺满左列剩余高度（全部分类 / 各类目 / 新建模块） */}
        <div className="bg-white rounded-2xl border border-ink-100 p-3 flex-1 flex flex-col gap-1">
            {/* 全部分类（默认）：与子类目同构（数字+18px加号占位 → 计数列严格对齐）；行尾 + 新建模块 */}
            <div
              className={`group flex items-center gap-2 px-2.5 h-9 rounded-lg text-sm transition text-left ${!lifeFilter ? 'font-bold bg-[rgba(var(--m-life-rgb),0.10)]' : 'font-medium text-ink-700 hover:bg-surface-soft'}`}
              style={!lifeFilter ? { color: 'var(--m-life)' } : undefined}>
              <button onClick={() => setLifeFilter(null)}
                className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer text-left"
                title="显示全部记录">
                <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" rx="1.5"/>
                  <rect x="14" y="3" width="7" height="7" rx="1.5"/>
                  <rect x="3" y="14" width="7" height="7" rx="1.5"/>
                  <rect x="14" y="14" width="7" height="7" rx="1.5"/>
                </svg>
                <span className="flex-1 truncate">全部分类</span>
              </button>
              <span className={`text-[12px] tabular-nums ${!lifeFilter ? '' : 'text-ink-400'}`}>{totalEntries}</span>
              <button onClick={() => { setShowNewCat(v => !v); setNewCatLb(''); }} title="新建模块"
                className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-md flex-shrink-0 cursor-pointer transition"
                style={{ background: `${moduleRgba('life', 0.10)}`, color: 'var(--m-life)' }}>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
              </button>
            </div>
            {/* 新建模块 mini 输入行（复用 EntryForm 新建模块面板的交互） */}
            {showNewCat && (
              <div className="flex items-center gap-1.5 pl-8 pr-2.5 h-9">
                <input autoFocus value={newCatLb} onChange={(e) => setNewCatLb(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') createCategory(); if (e.key === 'Escape') setShowNewCat(false); }}
                  placeholder="模块名，如「健康」"
                  className="flex-1 min-w-0 text-[12px] px-2 py-1 rounded-md border outline-none"
                  style={{ borderColor: `${moduleRgba('life', 0.35)}`, background: '#fff' }} />
                <button onClick={createCategory} title="确认新建"
                  className="inline-flex items-center justify-center w-[22px] h-[22px] rounded-md flex-shrink-0 cursor-pointer"
                  style={{ background: 'var(--m-life)', color: '#fff' }}>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>
                </button>
              </div>
            )}
            {/* 生日虚拟行 + 各类目行：统一渲染；支持拖拽手动排序（顺序持久化）；hover 出 + 直接添加；激活态全紫 */}
            {orderedRows.map(row => {
              const key = row.key;
              const isBd = key === 'birthday';
              const active = lifeFilter === key;
              const cnt = isBd ? birthdays.length : row.entries.length;
              return (
                <div key={key}
                  draggable
                  onDragStart={(e) => handleRowDragStart(e, key)}
                  onDragOver={(e) => handleRowDragOver(e, key)}
                  onDrop={(e) => handleRowDrop(e, key)}
                  onDragEnd={resetDrag}
                  title="拖拽可调整顺序"
                  className={`group relative flex items-center gap-2 pl-8 pr-2.5 h-9 rounded-lg text-sm transition text-left cursor-grab active:cursor-grabbing ${active ? 'font-bold bg-[rgba(var(--m-life-rgb),0.10)]' : 'font-medium text-ink-700 hover:bg-surface-soft'} ${dragSrcKey === key ? 'opacity-40' : ''}`}
                  style={active ? { color: 'var(--m-life)' } : undefined}>
                  {/* 拖拽插入位置指示线 */}
                  {dragOver && dragOver.key === key && (
                    <div className="absolute left-1.5 right-1.5 h-[2px] rounded-full pointer-events-none"
                      style={{ background: 'var(--m-life)', top: dragOver.pos === 'before' ? -3 : undefined, bottom: dragOver.pos === 'after' ? -3 : undefined }} />
                  )}
                  <button onClick={() => setLifeFilter(active ? null : key)}
                    className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer text-left"
                    title={active ? '点击取消筛选' : isBd ? '筛选生日记录' : `筛选${row.lb}记录`}>
                    <LifeCatIcon catKey={key} lb={isBd ? '生日' : row.lb} className="w-4 h-4 flex-shrink-0" />
                    <span className="flex-1 truncate">{isBd ? '生日' : row.lb}</span>
                  </button>
                  <span className={`text-[12px] tabular-nums ${active ? '' : 'text-ink-400'}`}>{cnt}</span>
                  <button onClick={() => isBd ? onBirthdayAdd?.() : onEntryAdd?.(row.key, row.lb)}
                    title={isBd ? '新建生日' : `添加${row.lb}记录`}
                    className={`${active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition inline-flex items-center justify-center w-[18px] h-[18px] rounded-md flex-shrink-0 cursor-pointer`}
                    style={{ background: `${moduleRgba('life', 0.10)}`, color: 'var(--m-life)' }}>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
                  </button>
                </div>
              );
            })}
        </div>
      </div>

      <SplitDivider bindDivider={bindDivider} />

      {/* 卡③ 时间流主视图（右侧全高卡，62%，唯一主视图） */}
      <div className="bg-white rounded-2xl border border-ink-100 p-4 min-w-0" style={rightStyle}>
            {selFilterCat?.lb === '种植' ? (
              <PlantingShelf />
            ) : lifeFilter === 'birthday' ? (
              bdCountdown.length === 0 ? (
                <div className="flex items-center justify-center py-8 rounded-xl border border-dashed border-ink-100 text-[12px] text-ink-500">
                  {bdLoading ? '正在加载生日…' : '还没有生日记录，点左侧「生日」行的 + 添加'}
                </div>
              ) : bdView === 'person' ? (
                <React.Fragment>
                  {/* 按人视图 · 顶部：人数大字 + 视图切换（与按日期视图首年份行同构） */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="pl-3.5 text-[22px] font-extrabold text-ink-900 tabular-nums tracking-wide">{bdCountdown.length} 位</div>
                    {bdToggle}
                  </div>
                  <div className="flex flex-col gap-2.5">
                    {bdCountdown.map((b, i) => (
                      <div key={b.id || i}
                        className={`flex items-center gap-3 pl-2.5 pr-3 h-[52px] rounded-xl bg-[rgba(120,120,128,0.08)] hover:bg-[rgba(120,120,128,0.12)] transition cursor-pointer ${b.passed ? 'opacity-50' : ''}`}
                        onClick={() => onBirthdayEdit?.(b)}
                        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); const rect = e.currentTarget.getBoundingClientRect(); setBdMenu({ x: rect.left, y: rect.bottom + 4, bd: b }); }}>
                        {/* 姓名首字头像 */}
                        <span className="w-8 h-8 rounded-full grid place-items-center flex-shrink-0 text-[13px] font-bold"
                          style={{ background: moduleRgba('life', 0.10), color: 'var(--m-life)' }}>
                          {(b.name || '?').slice(0, 1)}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-[#1c1c1e] truncate">{b.name}</span>
                            <span className="flex-shrink-0 px-1.5 py-0.5 rounded-md text-[11px] leading-none"
                              style={b.isLunar
                                ? { background: moduleRgba('life', 0.12), color: 'var(--m-life)', fontWeight: 600 }
                                : { background: 'rgba(255,255,255,0.75)', color: '#8e8e93' }}>
                              {b.lunarText || (b.isLunar ? '农历' : '公历')}
                            </span>
                          </div>
                          <div className="text-[11px] text-ink-500 tabular-nums mt-0.5">下次生日 {b.nextYear}年{b.mo}月{b.day}日</div>
                        </div>
                        <span className="flex-shrink-0 text-[11px] font-bold tabular-nums"
                          style={{ color: b.passed ? 'var(--ink-400, #999)' : b.daysLeft <= 7 ? '#FF3B30' : b.daysLeft <= 30 ? '#FF9500' : 'var(--m-life)' }}>
                          {b.passed ? `已过 ${b.daysPassed}天` : `还有 ${b.daysLeft} 天`}
                        </span>
                      </div>
                    ))}
                  </div>
                </React.Fragment>
              ) : (
                <React.Fragment>
                  {/* 年份行：浏览年大字 + ◀▶ 年份切换（SVG chevron）+ 偏离今年时的「今年」快捷回位 + 右侧视图切换 */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-1 pl-3.5">
                      <span className="text-[22px] font-extrabold text-ink-900 tabular-nums tracking-wide">{bdYear}年</span>
                      <div className="flex items-center gap-0.5 ml-1.5">
                        <button onClick={() => setBdYear(y => y - 1)} title="上一年"
                          className="w-6 h-6 grid place-items-center rounded-md text-ink-400 hover:text-ink-700 hover:bg-[rgba(120,120,128,0.12)] transition cursor-pointer active:scale-95">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                        </button>
                        <button onClick={() => setBdYear(y => y + 1)} title="下一年"
                          className="w-6 h-6 grid place-items-center rounded-md text-ink-400 hover:text-ink-700 hover:bg-[rgba(120,120,128,0.12)] transition cursor-pointer active:scale-95">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                        </button>
                      </div>
                      {bdYear !== new Date().getFullYear() && (
                        <button onClick={() => setBdYear(new Date().getFullYear())} title="回到今年"
                          className="ml-1 px-2 py-0.5 text-[11px] font-bold rounded-md transition cursor-pointer hover:brightness-105 active:scale-95"
                          style={{ background: moduleRgba('life', 0.10), color: 'var(--m-life)' }}>
                          今年
                        </button>
                      )}
                    </div>
                    {bdToggle}
                  </div>
                  {/* 浏览年内时间流：按月升序分组；农历生日已换算到该年的公历日期 */}
                  {(() => {
                    const groups = [];
                    bdYearRows.forEach(b => {
                      const g = groups.find(x => x.mo === b.mo);
                      if (g) g.items.push(b);
                      else groups.push({ mo: b.mo, label: b.mo ? `${String(b.mo).padStart(2, '0')}月` : '无日期', items: [b] });
                    });
                    const flat = [];
                    groups.forEach(g => g.items.forEach((b, i) => flat.push({ b, label: i === 0 ? g.label : null })));
                    return flat.map(({ b, label }, idx) => {
                      const isLast = idx === flat.length - 1;
                      return (
                        <div key={b.id || idx} className={`flex gap-2.5 cursor-pointer ${b.passed ? 'opacity-50' : ''}`}
                          onClick={() => onBirthdayEdit?.(b)}
                          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); const rect = e.currentTarget.getBoundingClientRect(); setBdMenu({ x: rect.left, y: rect.bottom + 4, bd: b }); }}>
                          {/* 月份列（组首行）：pl-3.5 与年份缩进同源，左缘与年份大字严格对齐；补零后月份等宽，右缘也自然整齐 */}
                          <div className="w-12 flex-shrink-0">
                            {label && (
                              <div className="h-5 flex items-center justify-start pl-3.5">
                                <span className="text-sm font-bold text-ink-700 leading-none whitespace-nowrap">{label}</span>
                              </div>
                            )}
                          </div>
                          <div className="w-6 flex-shrink-0 h-5 flex items-center justify-end">
                            <span className="text-[12px] font-semibold text-ink-400 tabular-nums leading-none">{b.day ? String(b.day).padStart(2, '0') : '--'}</span>
                          </div>
                          <div className="flex flex-col items-center flex-shrink-0">
                            <span className="h-5 flex items-center"><span className="w-[7px] h-[7px] rounded-full" style={{ background: 'var(--m-life)' }} /></span>
                            {!isLast && <span className="flex-1 w-px bg-ink-100" />}
                          </div>
                          <div className={`flex-1 min-w-0 relative h-7 flex items-center gap-2.5 px-2.5 rounded-lg bg-[rgba(120,120,128,0.08)] transition hover:bg-[rgba(120,120,128,0.12)] ${isLast ? '' : 'mb-4'}`}>
                            <LifeCatIcon catKey="birthday" lb="生日" className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--m-life)' }} />
                            <span className="text-sm font-normal text-[#1c1c1e] truncate">{b.name}生日</span>
                            <span className="flex-shrink-0 px-1.5 py-0.5 rounded-md text-[11px] leading-none"
                              style={b.isLunar
                                ? { background: moduleRgba('life', 0.12), color: 'var(--m-life)', fontWeight: 600 }
                                : { background: 'rgba(255,255,255,0.75)', color: '#8e8e93' }}>
                              {b.lunarText || (b.isLunar ? '农历' : '公历')}
                            </span>
                            <span className="ml-auto flex-shrink-0 text-[11px] font-bold tabular-nums"
                              style={{ color: b.isToday ? '#FF3B30' : b.passed ? 'var(--ink-400, #999)' : b.daysLeft <= 7 ? '#FF3B30' : b.daysLeft <= 30 ? '#FF9500' : 'var(--m-life)' }}>
                              {b.isToday ? '今天' : b.passed ? `已过 ${b.daysPassed}天` : `还有 ${b.daysLeft} 天`}
                            </span>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </React.Fragment>
              )
            ) : timeGroups.length === 0 ? (
              <div className="flex items-center justify-center py-8 rounded-xl border border-dashed border-ink-100 text-[12px] text-ink-500">
                {selFilterCat ? `「${selFilterCat.lb}」还没有记录，点左侧类目行的 + 添加` : '还没有生活记录，点左侧类目行的 + 添加'}
              </div>
            ) : (
              <React.Fragment>
                {timeGroups.map((g, gi) => {
              /* 年份大字分隔（方案 C）：每年一个，始终显示当年；出现跨年记录时自动追加（数据可带 e.y 扩展字段）。
                  首个年份行右侧同排挂年度精选 CTA：精选星标就在本卡条目上（作用域匹配），年份左、动作右对角平衡 */
              const showYear = gi === 0 || timeGroups[gi - 1].year !== g.year;
              return (
                <React.Fragment key={`yg-${g.year}-${g.mo}`}>
                  {showYear && (gi === 0 ? (
                    <div className="flex items-center justify-between mb-4">
                      <div className="pl-3.5 text-[22px] font-extrabold text-ink-900 tabular-nums tracking-wide">{g.year}年</div>
                      {/* 年度精选 CTA（Step2-3 牵引入口） */}
                      <button
                        onClick={() => onStartHighlights?.()}
                        disabled={totalEntries === 0}
                        className="flex-shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold rounded-md transition hover:brightness-105 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{ background: 'linear-gradient(135deg, var(--m-life) 0%, #FF2D55 100%)', color: '#fff', boxShadow: `0 1px 3px ${moduleRgba('life', 0.25)}` }}>
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" strokeLinejoin="round" strokeLinecap="round"/>
                        </svg>
                        年度精选{hlCount > 0 && <span className="opacity-95">· {hlCount}</span>}
                      </button>
                    </div>
                  ) : (
                    <div className="pl-3.5 text-[22px] font-extrabold text-ink-900 tabular-nums tracking-wide mt-3 mb-4">{g.year}年</div>
                  ))}
                  {g.items.map((r, ri) => {
              const isLast = gi === timeGroups.length - 1 && ri === g.items.length - 1;
              const hl = Array.isArray(highlightedIds) && highlightedIds.includes(r.e.id);
              return (
                <div key={`${r.cat.key}-${r.idx}`} className="flex gap-2.5 cursor-pointer"
                  onClick={() => onEntryEdit?.(r.cat.key, r.idx, r.e)}>
                  {/* 月份列（组首行）：pl-3.5 与年份缩进同源，左缘与年份大字严格对齐；补零后月份等宽，右缘也自然整齐 */}
                  <div className="w-12 flex-shrink-0">
                    {ri === 0 && (
                      <div className="h-5 flex items-center justify-start pl-3.5">
                        <span className="text-sm font-bold text-ink-700 leading-none whitespace-nowrap">{g.label}</span>
                      </div>
                    )}
                  </div>
                  {/* 日期列（DD 两位补零）：移至时间线左侧，与标题行垂直居中 */}
                  <div className="w-6 flex-shrink-0 h-5 flex items-center justify-end">
                    <span className="text-[12px] font-semibold text-ink-400 tabular-nums leading-none">{r.day ? String(r.day).padStart(2, '0') : '--'}</span>
                  </div>
                  {/* 时间轴列：圆点容器与标题行严格等高(h-5)居中；颜色统一生活主题紫 */}
                  <div className="flex flex-col items-center flex-shrink-0">
                    <span className="h-5 flex items-center"><span className="w-[7px] h-[7px] rounded-full" style={{ background: 'var(--m-life)' }} /></span>
                    {!isLast && <span className="flex-1 w-px bg-ink-100" />}
                  </div>
                  {/* 内容列：标题 + 右侧类目标签（工作台搜索框同款灰底小圆角长方形） */}
                  <div className={`flex-1 min-w-0 relative h-7 flex items-center gap-2.5 px-2.5 rounded-lg bg-[rgba(120,120,128,0.08)] transition hover:bg-[rgba(120,120,128,0.12)] ${isLast ? '' : 'mb-4'}`}>
                    {hl && (
                      <div className="absolute -top-1 right-0 w-5 h-5 rounded-full grid place-items-center"
                        style={{ background: 'linear-gradient(135deg,var(--m-life),#FF2D55)', color: '#fff', boxShadow: `0 1px 3px ${moduleRgba('life', 0.35)}` }}
                        title="年度精选">
                        <svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                      </div>
                    )}
                    <span className="text-sm font-normal text-[#1c1c1e] truncate">{r.e.t}</span>
                    {/* 类目标签：紧跟标题（内容左聚，不钉死最右） */}
                    <span className="flex-shrink-0 px-1.5 py-0.5 rounded-md text-[11px] leading-none font-normal"
                      style={{ background: 'rgba(255,255,255,0.75)', color: lifeRgba(r.cat.color, 0.85) }}>
                      {r.cat.lb}
                    </span>
                  </div>
                  {r.e.n && <div className="text-xs text-ink-500 leading-relaxed -mt-1 mb-3 max-w-[620px]">{r.e.n}</div>}
                </div>
              );
                  })}
                </React.Fragment>
              );
            })}
              </React.Fragment>
            )}
      </div>
      {/* 生日条目右键菜单 */}
      {bdMenu && (
        <div className="fixed inset-0 z-50" onClick={() => setBdMenu(null)}>
          <div className="absolute glass-card p-1.5 flex flex-col gap-0.5 min-w-[120px]"
            style={{ left: bdMenu.x, top: bdMenu.y }}>
            <button className="px-3 py-1.5 text-left text-sm rounded-md hover:bg-surface-soft transition"
              onClick={() => { onBirthdayEdit?.(bdMenu.bd); setBdMenu(null); }}>
              编辑
            </button>
            <button className="px-3 py-1.5 text-left text-sm rounded-md hover:bg-red-50 text-red-500 transition"
              onClick={() => { onBirthdayDelete?.(bdMenu.bd); setBdMenu(null); }}>
              删除
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- 12. 通用 · Section Header ---------- */
