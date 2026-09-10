import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { HABITS, LIFE } from './data.js';
import { pct, uid } from './utils.js';
import { EditableTitle } from './ui.jsx';
import { usePersistentState } from './hooks.js';
import { useSplitRatio, SplitDivider } from '../useSplitRatio.jsx'
import { moduleColor, moduleRgba } from '../../utils/color.js'
import { API } from '../../api/client.js'
import EntryForm from '../forms/EntryForm.jsx'

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
  const known = ['relation', 'food', 'travel', 'movie', 'shop'];
  return (
    <svg className={cls} style={style} fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      {catKey === 'relation' && (<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>)}
      {catKey === 'food' && (<><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/></>)}
      {catKey === 'travel' && (<><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></>)}
      {catKey === 'movie' && (<><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></>)}
      {catKey === 'shop' && (<><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></>)}
      {isPet && (<><circle cx="11" cy="4" r="2"/><circle cx="18" cy="8" r="2"/><circle cx="20" cy="16" r="2"/><path d="M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z"/></>)}
      {!isPet && !known.includes(catKey) && (<><path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r="1" fill="currentColor" stroke="none"/></>)}
    </svg>
  );
}

export function LifeView({ lifeData, onEntryAdd, onEntryEdit, onStartHighlights, highlightedIds, docLinks, onDocLinksChange, onCatAdd }) {
  const dynLife = lifeData || LIFE;
  const totalEntries = dynLife.reduce((s, c) => s + c.entries.length, 0);
  // 生活模块完成率：有记录的类目数 / 总类目数 * 100（体验型鼓励每个类目都有内容）
  const lifePct = Math.round((dynLife.filter(c => c.entries.length > 0).length / dynLife.length) * 100);
  const hlCount = Array.isArray(highlightedIds) ? highlightedIds.length : 0;

  /* ===== 双面板布局：左类目导航（筛选器）+ 右时间流（唯一主视图） ===== */
  const [lifeFilter, setLifeFilter] = useState(null); // null=全部 | 类目 key
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
      else groups.push({ mo: r.mo, year: r.yr, label: r.mo ? `${r.mo}月` : '无日期', items: [r] });
    });
    return groups;
  }, [dynLife, lifeFilter]);

  /* ===== 需求 2：链接按钮 · 右键菜单增删改 · 点击跳转 ===== */
  const [linkMenu, setLinkMenu] = useState(null); // { x, y, editingId } | null
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
            {/* 各类目：图标 + 名称 + 条数；hover 出 + 直接带类目添加；激活态图标/标题/数字/加号全紫 */}
            {dynLife.map(c => {
              const active = lifeFilter === c.key;
              return (
                <div key={c.key}
                  className={`group flex items-center gap-2 pl-8 pr-2.5 h-9 rounded-lg text-sm transition text-left ${active ? 'font-bold bg-[rgba(var(--m-life-rgb),0.10)]' : 'font-medium text-ink-700 hover:bg-surface-soft'}`}
                  style={active ? { color: 'var(--m-life)' } : undefined}>
                  <button onClick={() => setLifeFilter(active ? null : c.key)}
                    className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer text-left"
                    title={active ? '点击取消筛选' : `筛选${c.lb}记录`}>
                    <LifeCatIcon catKey={c.key} lb={c.lb} className="w-4 h-4 flex-shrink-0" />
                    <span className="flex-1 truncate">{c.lb}</span>
                  </button>
                  <span className={`text-[12px] tabular-nums ${active ? '' : 'text-ink-400'}`}>{c.entries.length}</span>
                  <button onClick={() => onEntryAdd?.(c.key, c.lb)} title={`添加${c.lb}记录`}
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
            {timeGroups.length === 0 && (
              <div className="flex items-center justify-center py-8 rounded-xl border border-dashed border-ink-100 text-[12px] text-ink-500">
                {selFilterCat ? `「${selFilterCat.lb}」还没有记录，点左侧类目行的 + 添加` : '还没有生活记录，点左侧类目行的 + 添加'}
              </div>
            )}
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
                  {/* 月份列（组首行）：与当月首条标题行等高居中（h-5 对齐标题行，不受笔记行影响） */}
                  <div className="w-9 flex-shrink-0">
                    {ri === 0 && (
                      <div className="h-5 flex items-center justify-end">
                        <span className="text-sm font-bold text-ink-700 leading-none">{g.label}</span>
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
      </div>
    </div>
  );
}

/* ---------- 12. 通用 · Section Header ---------- */
