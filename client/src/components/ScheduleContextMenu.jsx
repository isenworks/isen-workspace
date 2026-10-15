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

  const itemStyle = { padding: '8px 12px', fontSize: '13px', cursor: 'pointer', borderRadius: '6px' };
  const hover = (bg) => ({
    onMouseEnter: (e) => { e.currentTarget.style.background = bg; },
    onMouseLeave: (e) => { e.currentTarget.style.background = 'transparent'; },
  });

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
      >✏️ 编辑</div>
      {menu.type === 'schedule' && menu.task && (
        <div
          style={{ ...itemStyle, color: menu.task.is_failed ? 'var(--s-main)' : 'var(--text-1)' }}
          {...hover('rgba(120,120,128,0.08)')}
          onClick={() => onAction('markFailed')}
        >{menu.task.is_failed ? '↩ 取消未完成' : '✕ 标记未完成'}</div>
      )}
      {menu.type === 'schedule' && (
        <div
          style={{ ...itemStyle, color: 'var(--text-1)' }}
          {...hover('rgba(120,120,128,0.08)')}
          onClick={() => onAction('moveToInbox')}
        >📝 移入小记</div>
      )}
      <div style={{ height: '1px', background: 'var(--ink-100)', margin: '4px 2px' }}></div>
      <div
        style={{ ...itemStyle, color: 'var(--danger)' }}
        {...hover('rgba(255,59,48,0.08)')}
        onClick={() => onAction('delete')}
      >{menu.type === 'habit' ? '📁 归档' : '🗑️ 删除'}</div>
    </div>
  );
}
