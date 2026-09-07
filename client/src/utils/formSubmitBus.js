import { useEffect, useRef } from 'react';

/* ============================================================
 * Ctrl+S 表单提交通道
 * 打开的表单通过 useFormSubmit 注册提交函数（挂载入栈 / 卸载出栈），
 * Ctrl+S 优先提交栈顶（最近打开的）表单——保存成功后自动走各自同步管线；
 * 无表单打开时 Ctrl+S 才执行全局同步（由调用方降级处理）
 * ============================================================ */
const stack = [];

/* 表单内调用：useFormSubmit(submit)——始终调用最新闭包，避免 stale state */
export function useFormSubmit(submitFn) {
  const ref = useRef(submitFn);
  ref.current = submitFn;
  useEffect(() => {
    const fn = () => ref.current?.();
    stack.push(fn);
    return () => { const i = stack.indexOf(fn); if (i >= 0) stack.splice(i, 1); };
  }, []);
}

/* 返回 true 表示已有表单被触发提交；false 表示当前无表单打开 */
export function trySubmitTopForm() {
  const fn = stack[stack.length - 1];
  if (!fn) return false;
  fn();
  return true;
}
