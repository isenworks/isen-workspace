import { useEffect, useRef } from 'react';

/* ============================================================
 * ScheduleContextMenu · 日程右键菜单（今日计划 / 日历页共用）
 * 菜单项与主页完全一致：编辑 / 标记未完成 / 移入小记 / 删除
 *
 * 动作由宿主 onAction(action) 实现（两页数据源不同，各自适配落库与状态同步）：
 *   'edit' | 'markFailed' | 'moveToInbox' | 'delete'
 *
 * menu: { x, y, type: 'schedule' | 'habit', task: {...} } | null
 *   - type='schedule' 且 task 存在 → 显示"标记未完成/取消未完成"（task.is_failed 三态）
 *   - type='habit' → 删除项文案为"归档"
 * ============================================================ */
export default function ScheduleContextMenu({ menu, onAction, onClose }) {
  const ref = useRef(null);
  const shownAt = useRef(0);

  /* 全局点击/滚动/Esc 关闭（自 Workspace 移植）
     · 右键触发的 350ms 内的 mousedown 属于同一次手势（click/mouseup），忽略，避免菜单闪关 */
  useEffect(() => {
    if (!menu) return;
    shownAt.current = Date.now();
    function onMouseDown(e) {
      if (Date.now() - shownAt.current < 350) return;
      const el = ref.current;
      if (!el || !el.contains(e.target)) onClose();
    }
    function onScroll() { onClose(); }
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('scroll', onScroll, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('scroll', onScroll, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [menu, onClose]);

  if (!menu) return null;

  // 定位钳制：菜单约 168×208，触碰/长按在屏幕右缘或下缘时回收进视口，避免被裁掉
  const CW = 168, CH = 208, PAD = 8;
  const vw = window.innerWidth, vh = window.innerHeight;
  const px = Math.max(PAD, Math.min(menu.x, vw - CW - PAD));
  const py = Math.max(PAD, Math.min(menu.y, vh - CH - PAD));

  const itemStyle = { padding: '8px 12px', fontSize: '13px', cursor: 'pointer', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '8px' };
  const hover = (bg) => ({
    onMouseEnter: (e) => { e.currentTarget.style.background = bg; },
    onMouseLeave: (e) => { e.currentTarget.style.background = 'transparent'; },
  });
  // 图标统一为 15px 线性图标（与主页右键菜单、侧边栏导航同一套语言，不再混用 emoji）
  const icon = (children) => (
    <svg width="15" height="15" style={{ flexShrink: 0 }} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">{children}</svg>
  );

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left: px,
        top: py,
        zIndex: 'var(--z-popover)',
        background: 'var(--surface-card)',
        borderRadius: '10px',
        padding: '6px',
        minWidth: '140px',
        boxShadow: '0 10px 30px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08)',
        border: '1px solid rgba(0,0,0,0.06)'
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        style={{ ...itemStyle, color: 'var(--text-1)' }}
        {...hover('rgba(var(--s-rgb),0.08)')}
        onClick={() => onAction('edit')}
      >
        {icon(<><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></>)}
        编辑
      </div>
      {menu.type === 'schedule' && menu.task && (
        <div
          style={{ ...itemStyle, color: menu.task.is_failed ? 'var(--s-main)' : 'var(--warning)' }}
          {...hover('rgba(120,120,128,0.08)')}
          onClick={() => onAction('markFailed')}
        >
          {menu.task.is_failed
            ? icon(<><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></>)
            : icon(<><path d="M18 6 6 18M6 6l12 12" /></>)}
          {menu.task.is_failed ? '取消未完成' : '标记未完成'}
        </div>
      )}
      {menu.type === 'schedule' && (
        <div
          style={{ ...itemStyle, color: 'var(--text-1)' }}
          {...hover('rgba(120,120,128,0.08)')}
          onClick={() => onAction('moveToInbox')}
        >
          {icon(<><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.375 2.625a2.121 2.121 0 1 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z" /></>)}
          移入小记
        </div>
      )}
      <div style={{ height: '1px', background: 'var(--ink-100)', margin: '4px 2px' }}></div>
      <div
        style={{ ...itemStyle, color: 'var(--danger)' }}
        {...hover('rgba(255,59,48,0.08)')}
        onClick={() => onAction('delete')}
      >
        {menu.type === 'habit'
          ? icon(<><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /></>)
          : icon(<><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></>)}
        {menu.type === 'habit' ? '归档' : '删除'}
      </div>
    </div>
  );
}
