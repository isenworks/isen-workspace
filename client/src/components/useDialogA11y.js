import { useEffect, useRef } from 'react';

/* 可聚焦元素选择器（排除 disabled 与 tabindex=-1 的容器本身） */
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/* 弹窗内可聚焦元素（过滤不可见项） */
function focusablesIn(node) {
  if (!node) return [];
  return Array.from(node.querySelectorAll(FOCUSABLE))
    .filter((el) => el.getClientRects().length > 0);
}

/**
 * 弹窗可访问性行为：焦点陷阱 + 背景滚动锁定 + Esc 关闭 + 关闭后焦点归还。
 * 返回的 ref 绑定到弹窗内容容器即可（无需手动加 tabIndex）。
 *
 * 多个弹窗叠加时按「后开先锁」处理：内层卸载时会把 body overflow 还原为
 * 外层设定的值（仍是 'hidden'），外层关闭时才恢复原状，不会误解除锁定。
 *
 * @param {boolean} open 是否打开
 * @param {{ onClose?: () => void, escape?: boolean, lockScroll?: boolean }} [opts]
 *   escape=false 时不接管 Esc（用于「弹窗内二次确认」，避免同时关掉确认层与外层表单）
 */
export function useDialogA11y(open, { onClose, escape = true, lockScroll = true } = {}) {
  const ref = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const node = ref.current;
    const prevActive = document.activeElement;
    const prevOverflow = document.body.style.overflow;

    if (lockScroll) document.body.style.overflow = 'hidden';

    // 初始焦点：优先第一个表单字段（输入类弹窗直接可打字），否则第一个可聚焦元素
    const preferred = node && node.querySelector(
      'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])'
    );
    const target = (preferred && preferred.getClientRects().length > 0) ? preferred : focusablesIn(node)[0];
    if (target) target.focus();
    else if (node) {
      if (!node.hasAttribute('tabindex')) node.setAttribute('tabindex', '-1');
      node.focus();
    }

    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (escape) onCloseRef.current?.();
        return;
      }
      if (e.key !== 'Tab' || !node) return;
      const list = focusablesIn(node);
      if (list.length === 0) { e.preventDefault(); return; }
      const firstEl = list[0];
      const lastEl = list[list.length - 1];
      const active = document.activeElement;
      // 焦点跑到弹窗之外（含首次 Tab）时也要拉回来
      if (!node.contains(active)) { e.preventDefault(); (e.shiftKey ? lastEl : firstEl).focus(); return; }
      if (e.shiftKey && active === firstEl) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && active === lastEl) { e.preventDefault(); firstEl.focus(); }
    };
    document.addEventListener('keydown', onKey, true);

    return () => {
      document.removeEventListener('keydown', onKey, true);
      if (lockScroll) document.body.style.overflow = prevOverflow;
      if (prevActive && typeof prevActive.focus === 'function') prevActive.focus();
    };
  }, [open, escape, lockScroll]);

  return ref;
}