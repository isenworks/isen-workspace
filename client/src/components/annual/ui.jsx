import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { catMeta } from './utils.js';
import { createPortal } from 'react-dom'

export function CategoryIcon({ catKey, className, style }) {
  const cls = className || 'w-4 h-4';
  return (
    <svg className={cls} style={style} fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      {catKey === 'overview' && (<><path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></>)}
      {catKey === 'energy' && (<><path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7Z"/><path d="M3.2 12H9l1.5-3 2.5 5.5L15 12h5.2"/></>)}
      {catKey === 'cognition' && (<><path d="M2.06 12.35a1 1 0 0 1 0-.7 11.5 11.5 0 0 1 19.88 0 1 1 0 0 1 0 .7 11.5 11.5 0 0 1-19.88 0"/><circle cx="12" cy="12" r="3"/></>)}
      {catKey === 'ability' && (<><path d="M12 2 15.1 8.3 22 9.3l-5 4.9 1.2 6.9L12 17.8l-6.2 3.3L7 14.2 2 9.3l6.9-1z"/></>)}
      {catKey === 'work' && (<><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/></>)}
      {catKey === 'life' && (<><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.9 4.9 1.4 1.4"/><path d="m17.7 17.7 1.4 1.4"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.3 17.7-1.4 1.4"/><path d="m19.1 4.9-1.4 1.4"/></>)}
      {catKey === 'finance' && (<><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></>)}
    </svg>
  );
}

export function ProgressBar({ value, color, variant }) {
  // P1-3 / 4.1 进度条分层规范：
  //  default = 标准 4px (类目卡 / Hero / SectionHeader)
  //  dense   = 细 3px (KR列表 / 书籍明细 - 场景密集，减少视觉噪声)
  const h = variant === 'dense' ? 'h-0.75' : 'h-1';
  return (
    <div className={`${h} rounded-full bg-ink-100 overflow-hidden`}>
      <div className="h-full rounded-full transition-all duration-500 ease-out" style={{ width: `${value}%`, background: color || '#007AFF' }} />
    </div>
  );
}

export function AddButton({ label, onClick, compact }) {
  if (compact) {
    return (
      <button onClick={onClick || (() => {})} className="mt-auto p-1.5 rounded-lg border border-ink-100 text-ink-500 text-[11px] font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-ink-50 hover:border-ink-200 hover:text-ink-700 transition cursor-pointer w-full">
        <span className="w-4 h-4 rounded-md bg-ink-100 grid place-items-center text-ink-600 flex-shrink-0">
          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" strokeLinecap="round"/></svg>
        </span>
        <span>{label}</span>
      </button>
    );
  }
  return (
    <button onClick={onClick || (() => {})} className="mt-auto p-2 rounded-xl border border-ink-100 text-ink-500 text-xs font-semibold inline-flex items-center justify-center gap-2 hover:bg-ink-50 hover:border-ink-200 hover:text-ink-700 transition cursor-pointer w-full">
      <span className="w-5 h-5 rounded-md bg-ink-100 grid place-items-center text-ink-600 flex-shrink-0">
        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" strokeLinecap="round"/></svg>
      </span>
      <span>{label}</span>
    </button>
  );
}

/* ---------- 通用：文字编辑组件
   · 默认（mode 不填）：历史遗留，点击即编辑
   · mode="contextmenu"：右击弹出小菜单（编辑/删除），符合用户新设计；
     此时需要额外传 onDelete 以支持"删除/恢复默认"，不传则隐藏删除项
--------------------------------------------------------------------- */
export function InlineEdit({
  value, onChange, onDelete,
  className, inputClassName, title, placeholder = '', style,
  mode, // 'contextmenu' | undefined
  menuWidth = 140, // 右键菜单宽度，可按需覆盖
  onEditClick, // 可选：右键"编辑"时的自定义回调（用于弹窗编辑而非行内编辑）
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const ref = React.useRef(null);
  // 右键菜单：{x, y} 打开中；null 关闭
  const [menu, setMenu] = React.useState(null);

  React.useEffect(() => { if (!editing) setDraft(value); }, [value, editing]);
  React.useEffect(() => { if (editing) setTimeout(() => ref.current?.focus(), 0); }, [editing]);

  // 点击外部 / 滚动 → 关闭右键菜单
  React.useEffect(() => {
    if (!menu) return;
    const hide = () => setMenu(null);
    window.addEventListener('mousedown', hide);
    window.addEventListener('touchstart', hide);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      window.removeEventListener('mousedown', hide);
      window.removeEventListener('touchstart', hide);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, [menu]);

  const commit = () => {
    setEditing(false);
    const v = draft == null ? '' : String(draft).trim();
    const origin = value == null ? '' : String(value);
    if (v !== origin) onChange(v);
  };
  const cancel = () => { setEditing(false); setDraft(value ?? ''); };

  const openContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    // 计算位置，超出右边界则左对齐
    const pad = 12;
    const maxX = window.innerWidth - menuWidth - pad;
    const maxY = window.innerHeight - 92 - pad;
    setMenu({
      x: Math.min(e.clientX, maxX),
      y: Math.min(e.clientY, maxY),
    });
  };

  // -------- 编辑态：输入框 --------
  if (editing) {
    return (
      <input
        ref={ref}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') cancel(); }}
        className={`outline-none border border-brand-300 rounded px-1.5 py-0.5 bg-white text-left ${inputClassName || ''}`}
      />
    );
  }

  // -------- 显示态：带 hover / contextmenu --------
  const isCtxMode = mode === 'contextmenu';
  return (
    <>
      <span
        title={title || (isCtxMode ? '右键编辑' : '点击编辑')}
        onClick={(e) => {
          if (isCtxMode) return; // 右键模式下禁用单击编辑
          e.stopPropagation(); setEditing(true);
        }}
        onContextMenu={isCtxMode ? openContextMenu : undefined}
        style={style}
        className={`${isCtxMode ? 'cursor-context-menu' : 'cursor-text'} hover:opacity-80 transition select-none ${className || ''}`}>
        {value ? (
          <span>{value}</span>
        ) : placeholder ? (
          <span>{placeholder}</span>
        ) : null}
      </span>

      {/* ---- 右键浮层菜单：编辑 / 删除（通过 portal 输出到 body，避免被容器裁剪）---- */}
      {isCtxMode && menu && typeof document !== 'undefined' && document.body && createPortal(
        <div
          onMouseDown={(e) => e.stopPropagation()}
          style={{ position: 'fixed', left: menu.x, top: menu.y, zIndex: 999999, width: menuWidth, backgroundColor: '#ffffff' }}
          className="rounded-xl shadow-2xl border border-ink-100 py-1 overflow-hidden">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMenu(null);
              if (onEditClick) { onEditClick(); } else { setEditing(true); }
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium text-ink-800 hover:bg-ink-50 transition">
            <svg className="w-4 h-4 text-accent-amber flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M15.232 5.232l3.536 3.536M9 19h4l7.586-7.586a2 2 0 0 0-2.828-2.828L11 16v3z" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span>编辑</span>
          </button>
          {onDelete && (
            <>
              <div className="my-0.5 h-px bg-ink-100 mx-2" />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setMenu(null);
                  onDelete();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium text-accent-red hover:bg-accent-red/7 transition">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span>删除</span>
              </button>
            </>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}

/* ---------- P2-2.5: 模块页头标题 · 右键编辑统一组件 ----------
   「2026年 · XX」层级标题统一交互：右键菜单编辑 / 删除（清空回落默认文案）
   value=''（未自定义）时显示 placeholder（fallback，动态生成保持年份/月份新鲜） */
export function EditableTitle({ value, onChange, fallback, className, inputClassName }) {
  /* value 兜底 fallback：右键编辑时输入框预填「当前显示文字」（书架标题同款体验），
     直接在已有文字上修改；清空/删除 → onChange('') → 显示回落 fallback */
  const display = value || fallback;
  return (
    <InlineEdit
      value={display}
      onChange={(v) => onChange(String(v || '').trim())}
      onDelete={() => onChange('')}
      placeholder={fallback}
      mode="contextmenu"
      title="右键修改标题"
      className={className}
      inputClassName={inputClassName}
    />
  );
}

/* ---------- P2-2: 知力 OKR 漏斗 (输入量 → 思考量 → 行动量 → 改变量) ---------- */
export function SectionHeader({ cat, title, progress, right }) {
  const c = catMeta(cat);
  return (
    <div className="flex items-center gap-3 pb-3 border-b border-ink-100">
      {/* P1-1: 竖条→32×32图标块 */}
      <div className="w-8 h-8 rounded-xl grid place-items-center flex-shrink-0"
        style={{ background: `rgba(${c.rgb},0.07)`, color: c.color }}>
        <CategoryIcon catKey={c.key} className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <h2 className="text-base font-bold text-ink-900 leading-tight tracking-tight">{title}</h2>
      </div>
      {/* P1-1: 右侧完成率 badge 或自定义内容 */}
      {typeof progress === 'number' && (
        <div className="flex items-center gap-2">
          <div className="w-16"><ProgressBar value={progress} color={c.color} /></div>
          <span className="text-[11px] font-bold tabular-nums" style={{color: c.color}}>{progress}%</span>
        </div>
      )}
      {right}
    </div>
  );
}

/* ---------- 13. localStorage 持久化 hook（云端同步版） ----------
 * 本地照写（离线可用+秒开），挂载时拉 D1 镜像：
 *   · 云端有且不同 → 云端胜（多设备拉新）；云端无 → 本地数据自动上云（首次迁移）
 *   · 后续每次变更防抖推送 D1，实现多设备持续同步
 * 结构化对象（按 id 索引的记录如 habit_targets / ability_score_history / work_kr_microactions）
 *   走字段级合并：只推送本次变化的顶层字段，后端按服务器时间戳逐字段合并，
 *   多设备并发编辑不同字段不会互覆盖；拉取时云端 envelope 字段级合并回本地，不丢本地未同步字段。
 * 数组 / 原始值仍走 LWW 全量推送（数组元素级合并成本高，低频编辑场景 LWW 足够）。*/
