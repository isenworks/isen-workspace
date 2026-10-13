import { useRef, useCallback } from 'react';

/* ============================================================
 * useLongPress · 触摸端「长按」手势 → 替代桌面右键菜单
 *  - 仅接管 touch / pen 指针；鼠标保留原生右键，互不干扰
 *  - 长按 ~500ms 触发；期间移动超过阈值（滚动/拖拽）自动取消
 *  - 触发后抑制随后合成的 click，避免行内点击（打开编辑）被误触发
 *
 * 用法（同一组件只调用一次 hook，多行共用同一计时器即可）：
 *   const lp = useLongPress();
 *   <div {...lp.bind(() => showMenu(x, y))} onClick={openEdit} />
 *   → bind(handler) 返回可展开的 pointer 事件处理器；handler 收到 { clientX, clientY }
 * ============================================================ */
export function useLongPress({ delay = 500, moveThreshold = 10 } = {}) {
  const st = useRef({ timer: null, x: 0, y: 0, fired: false, handler: null });

  const cancel = useCallback(() => {
    if (st.current.timer) { clearTimeout(st.current.timer); st.current.timer = null; }
  }, []);

  const bind = useCallback((handler) => ({
    onPointerDown: (e) => {
      if (e.pointerType === 'mouse') return;
      st.current.handler = handler;
      st.current.x = e.clientX;
      st.current.y = e.clientY;
      st.current.fired = false;
      cancel();
      st.current.timer = setTimeout(() => {
        st.current.timer = null;
        st.current.fired = true;
        st.current.handler?.({ clientX: st.current.x, clientY: st.current.y });
      }, delay);
    },
    onPointerMove: (e) => {
      if (!st.current.timer) return;
      if (Math.abs(e.clientX - st.current.x) > moveThreshold || Math.abs(e.clientY - st.current.y) > moveThreshold) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
    // 长按已唤出菜单：吞掉本次 click（capture 阶段拦截，阻止冒泡到行的 onClick）
    onClickCapture: (e) => {
      if (st.current.fired) { st.current.fired = false; e.stopPropagation(); e.preventDefault(); }
    },
  }), [delay, moveThreshold, cancel]);

  return { bind };
}