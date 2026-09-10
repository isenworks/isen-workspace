import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { CATEGORIES } from './data.js';
import { CategoryIcon } from './ui.jsx';
import { Sparkline } from './OverviewView.jsx';

export function NavBar({ onExport, onImport, onReset }) {
  const year = new Date().getFullYear();
  return (
    <div className="flex items-center justify-between mb-5">
      <a href="#/" className="inline-flex items-center gap-2 text-sm font-medium text-ink-500 hover:text-accent-blue transition">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round"/></svg>
        返回工作台
      </a>
      <div className="flex items-center gap-3">
        <div className="inline-flex items-center rounded-xl border border-ink-100 bg-white p-0.5 gap-0.5">
          <button onClick={onExport} title="导出年度数据为JSON"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-ink-600 hover:bg-ink-50 transition">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" strokeLinecap="round" strokeLinejoin="round"/></svg>
            导出
          </button>
          <label title="从JSON导入年度数据"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-ink-600 hover:bg-ink-50 transition cursor-pointer">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" strokeLinecap="round" strokeLinejoin="round"/></svg>
            导入
            <input type="file" accept="application/json" className="hidden" onChange={onImport}/>
          </label>
        </div>
        <button onClick={onReset} title="重置为初始模板"
          className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-xl text-xs font-semibold text-ink-400 hover:text-accent-red hover:bg-accent-red/5 transition">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <div className="inline-flex items-center gap-2 text-xs font-semibold text-ink-500">
          <span className="px-2 py-0.5 rounded-full bg-ink-100 text-ink-700">{year}</span>
          <span>年度规划</span>
        </div>
      </div>
    </div>
  );
}

/* ---------- 5. 子组件 · Sidebar 导航 ---------- */
const SIDEBAR_ITEMS = [
  { key: 'overview',  label: '年度概览', cat: null, icon: <CategoryIcon catKey="overview" className="w-4 h-4" /> },
  ...CATEGORIES.map(c => ({
    key: c.key, label: c.label, cat: c.key,
    icon: <CategoryIcon catKey={c.key} className="w-4 h-4" />,
    catColor: c.color, catRgb: c.rgb,
  })),
];

export function Sidebar({ active, onChange, stats }) {
  const ring = stats.weighted;
  const year = new Date().getFullYear();
  const yy = String(year).slice(-2);
  return (
    <aside className="w-full lg:w-[260px] flex-shrink-0 flex lg:flex-col gap-2.5 lg:sticky lg:top-6 lg:max-h-[calc(100vh-48px)] overflow-y-auto overflow-x-hidden annual-sidebar">
      {/* Logo + 总进度环 · 宽屏完整 / 窄屏压缩为一行 */}
      <div className="glass-card p-4 lg:w-full">
        <div className="flex items-center gap-3 lg:w-full lg:mb-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-sm flex-shrink-0" style={{ background: 'var(--s-grad-bg)' }}>
            {yy}
          </div>
          <div className="flex flex-col flex-1 min-w-0">
            <span className="text-sm font-bold text-ink-900 leading-tight whitespace-nowrap">{year} 年度规划</span>
            <span className="text-[11px] text-ink-500 mt-0.5 whitespace-nowrap">个人成长计划 · {ring}%</span>
          </div>
          {/* 窄屏：总进度环小圆徽章；宽屏：显示下方完整卡 */}
          <div className="lg:hidden relative w-10 h-10 flex-shrink-0">
            <svg viewBox="0 0 36 36" className="w-10 h-10 -rotate-90">
              <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" className="text-ink-100" strokeWidth="3"/>
              <circle cx="18" cy="18" r="15" fill="none" stroke="#007AFF" strokeWidth="3"
                strokeDasharray={`${(ring / 100) * 94.2} 94.2`} strokeLinecap="round"/>
            </svg>
            <div className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-ink-900 tabular-nums">{ring}</div>
          </div>
        </div>
        <div className="hidden lg:flex items-center gap-3 p-3 rounded-xl bg-surface-soft border border-ink-100">
          <div className="relative w-14 h-14 flex-shrink-0">
            <svg viewBox="0 0 36 36" className="w-14 h-14 -rotate-90">
              <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" className="text-ink-100" strokeWidth="3"/>
              <circle cx="18" cy="18" r="15" fill="none" stroke="#007AFF" strokeWidth="3"
                strokeDasharray={`${(ring / 100) * 94.2} 94.2`} strokeLinecap="round"/>
            </svg>
            <div className="absolute inset-0 flex items-center justify-center text-sm font-bold text-ink-900 tabular-nums">{ring}</div>
          </div>
          <div className="flex flex-col gap-1 min-w-0">
            <span className="text-xs text-ink-500">年度总进度</span>
            <span className="text-[13px] font-semibold text-ink-900 truncate">已完成 {ring}%</span>
          </div>
        </div>
      </div>

      {/* 导航 · 窄屏：横向Tab条可横滑；宽屏：竖向列 */}
      <div className="glass-card p-2 lg:flex-1 lg:flex lg:flex-col w-full overflow-x-auto lg:overflow-visible">
        <div className="hidden lg:block px-2.5 pt-1 pb-2 text-[10px] font-semibold uppercase tracking-wider text-ink-500">年度导航</div>
        <nav className="flex lg:flex-col gap-1 lg:gap-0.5 lg:px-1 lg:pb-1 min-w-max lg:min-w-0 annual-sidebar-nav">
          {SIDEBAR_ITEMS.map(item => {
            const on = active === item.key;
            const pctVal = item.cat ? Math.round(stats.perCat[CATEGORIES.findIndex(c => c.key === item.cat)]) : null;
            return (
              <button key={item.key} onClick={() => onChange(item.key)}
                style={on ? { background: 'var(--s-grad-bg)' } : undefined}
                className={[
                  'lg:w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-[13px] transition-all whitespace-nowrap flex-shrink-0 lg:flex-shrink',
                  on ? 'text-white font-semibold shadow-sm'
                     : 'text-ink-700 font-medium hover:bg-ink-100'
                ].join(' ')}>
                <span className={['w-6 h-6 rounded-md grid place-items-center flex-shrink-0',
                  on ? 'bg-white/15 text-white' : item.cat ? '' : 'bg-ink-100 text-ink-500'
                ].join(' ')}
                  style={item.cat && !on ? { background: `rgba(${item.catRgb},0.06)`, color: item.catColor } : undefined}>
                  {item.icon}
                </span>
                <span className="hidden lg:block flex-1 text-left truncate">{item.label}</span>
                {pctVal !== null && (
                  <span className={['hidden lg:inline-block text-[11px] font-bold tabular-nums',
                    on ? 'text-white/90' : 'text-ink-500'
                  ].join(' ')}>{pctVal}%</span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* 底部说明（仅宽屏） */}
      <div className="hidden lg:block px-2 text-[11px] text-ink-400 leading-relaxed">
        五大类目 · 差异化追踪模型<br/>
        工作台年度规划
      </div>
    </aside>
  );
}

/* ---------- 通用 Sparkline 迷你折线图（带月份标注+顶点Hover Tooltip） ---------- */
