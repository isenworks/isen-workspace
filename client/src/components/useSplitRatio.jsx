import { useState, useEffect, useRef, useCallback } from 'react';

const DEFAULTS = { min: 0.24, max: 0.55, width: 480 };

/* ============================================================
 * useSplitRatio · 左右分栏拖拽比例（含 localStorage 记忆）
 *  - 返回 { ratio, leftStyle, rightStyle, bindRoot, bindDivider }
 *  - leftStyle：左栏 flex 基准（percentage，封顶 maxWidth）
 *    rightStyle：右栏吃满剩余；bindRoot 绑到分栏容器（拖拽坐标基准）
 *  - 拖拽：mousedown 开始 → mousemove 实时更新 → mouseup 持久化；
 *    双击分隔条恢复默认；范围默认 24%~55%
 *  - 复用：收集箱（InboxPage）/ 今日计划（Workspace）等，
 *    每个 key 独立记忆（不同页面内容密度不同，理想比例不同）
 * ============================================================ */
export function useSplitRatio(key, defaults) {
  const { min = DEFAULTS.min, max = DEFAULTS.max, def = 0.38, maxWidth = DEFAULTS.width } = defaults || {};

  const [ratio, setRatio] = useState(() => {
    try {
      const v = parseFloat(localStorage.getItem(key));
      if (!isNaN(v) && v >= min && v <= max) return v;
    } catch {}
    return def;
  });

  const rootRef = useRef(null);
  const draggingRef = useRef(false);
  const ratioRef = useRef(ratio); // 供 mouseup 闭包读取最新值
  useEffect(() => { ratioRef.current = ratio; }, [ratio]);

  useEffect(() => {
    function onMove(e) {
      if (!draggingRef.current || !rootRef.current) return;
      const w = rootRef.current.getBoundingClientRect();
      setRatio(Math.min(max, Math.max(min, (e.clientX - w.left) / w.width)));
    }
    function onUp() {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      try { localStorage.setItem(key, String(ratioRef.current)); } catch {}
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [key, min, max]);

  const startDrag = useCallback((e) => {
    e.preventDefault();
    draggingRef.current = true;
    document.body.style.userSelect = 'none';  // 拖拽期间禁选中
    document.body.style.cursor = 'col-resize';
  }, []);

  const reset = useCallback(() => {
    setRatio(def);
    try { localStorage.setItem(key, String(def)); } catch {}
  }, [key, def]);

  return {
    ratio,
    leftStyle: { flex: `0 0 ${Math.round(ratio * 100)}%`, maxWidth },
    rightStyle: { flex: 1 },
    bindRoot: { ref: rootRef },
    bindDivider: { onMouseDown: startDrag, onDoubleClick: reset },
  };
}

/* ============================================================
 * SplitDivider · 分栏拖拽分隔条（配 useSplitRatio.bindDivider）
 *  - 居中于两栏 16px 间隙；静息小胶囊、hover 主题色高亮
 * ============================================================ */
export function SplitDivider({ bindDivider, title }) {
  return (
    <div
      {...bindDivider}
      title={title || '拖动调整分栏宽度（双击恢复默认）'}
      className="relative flex-shrink-0 w-[16px] -my-1 flex items-center justify-center cursor-col-resize group"
    >
      <span className="w-[3px] h-[30px] rounded-full transition-colors" style={{ background: 'rgba(120,120,128,0.16)' }}></span>
      <span className="absolute inset-y-0 left-[6px] w-[4px] rounded-full opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: 'rgba(var(--s-rgb),0.25)' }}></span>
    </div>
  );
}
