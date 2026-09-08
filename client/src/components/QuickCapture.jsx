import { useState, useRef, useEffect } from 'react';
import { API } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';
import { readCats } from './forms/ScheduleForm.jsx';

// hex → rgba（分类 chip 底色/描边，与 ScheduleForm catToStyle 同规则）
function hexToRgba(hex, a = 0.08) {
  const h = (hex || '').replace('#', '');
  if (h.length !== 6) return `rgba(142,142,147,${a})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

/* ============================================================
 * QuickCapture · 快速捕获框（收集箱入口之一）
 *  - 大输入区（无边框悬浮卡）：默认约占左栏一半高度，内容超出自动向下拉伸
 *    （无滚动条），保存后恢复默认高度；Enter 换行、Ctrl/Cmd+S 保存
 *  - 静息态中性阴影定义边缘，聚焦态主题色光环反馈输入状态
 *  - 保存按钮与「＋ 标签」同一行；保存成功后短暂显示「✓ 已收进」
 *  - 两处复用：全局快捷键 N 弹窗（Workspace）+ 收集箱页内输入区（InboxPage）
 * ============================================================ */
export default function QuickCapture({ onSaved, autoFocus = true, placeholder, fill }) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [cat, setCat] = useState(null);          // 选中的分类 v；null=未选
  const [showCats, setShowCats] = useState(false);
  const [busy, setBusy] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef(null);
  const flashTimer = useRef(null);

  // fill 模式（二分布局右侧面板）：输入区撑满剩余高度，内容超出再向下拉伸
  useEffect(() => {
    if (!fill || !inputRef.current) return;
    const el = inputRef.current;
    const apply = () => {
      const parent = el.parentElement;
      if (!parent) return;
      el.style.height = 'auto';
      el.style.height = Math.max(200, parent.clientHeight - el.offsetTop - 8) + 'px';
    };
    apply();
    const ro = new ResizeObserver(apply);
    if (el.parentElement) ro.observe(el.parentElement);
    return () => ro.disconnect();
  }, [fill]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);

  // 自动增高：内容行数超过默认高度时撑开（不用滚动条）；fill 模式以面板剩余高度为基准
  function autoGrow(el) {
    if (!el) return;
    el.style.height = 'auto';
    let base = 200;
    if (fill) {
      const parent = el.parentElement;
      if (parent) base = Math.max(200, parent.clientHeight - el.offsetTop - 8);
    }
    el.style.height = Math.max(base, el.scrollHeight) + 'px';
  }

  async function save() {
    const content = text.trim();
    if (!content || busy) return;
    setBusy(true);
    try {
      await API.inbox.create({ content, category: cat });
      setText('');
      // 恢复默认高度（fill 模式回到面板撑满高度）
      if (inputRef.current) {
        autoGrow(inputRef.current);
      }
      setSavedFlash(true);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setSavedFlash(false), 1500);
      onSaved?.();
    } catch (e) {
      toast.error(e.message || '保存失败');
    } finally {
      setBusy(false);
      // 保存后焦点回到输入框，支持连续录入
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  function onKeyDown(e) {
    // Enter 换行（textarea 原生行为）；Ctrl/Cmd+S 保存
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      if (text.trim()) save();
    }
  }

  const cats = readCats();

  return (
    <div>
      {/* 输入区：无边框悬浮卡片——静息中性阴影定义边缘，聚焦主题色光环；默认约左栏一半高，超出自动撑开（fill 模式撑满面板） */}
      <textarea
        ref={inputRef}
        value={text}
        onChange={(e) => { setText(e.target.value); autoGrow(e.target); }}
        onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder || '记录想法/待办'}
        className="w-full bg-transparent outline-none resize-none text-[14px] leading-[22px] text-[#1c1c1e] placeholder:text-ink-400 rounded-[9px] transition-all"
        style={{
          background: '#ffffff',
          border: '1px solid transparent',
          boxShadow: focused
            ? '0 1px 4px rgba(0,0,0,0.06), 0 0 0 1.5px rgba(var(--s-rgb),0.25)'
            : '0 1px 4px rgba(0,0,0,0.08)',
          height: 200,
          padding: '12px 14px',
          overflow: 'hidden',
          display: 'block',
        }}
      />

      {/* 操作行：时间 + 保存 + 标签（与输入区解耦） */}
      <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
        <button
          onClick={() => setShowCats(s => !s)}
          className="flex items-center gap-1 text-[12px] font-medium px-2.5 py-1 rounded-full transition-colors"
          style={{ background: 'rgba(var(--s-rgb),0.1)', color: 'var(--s-main)' }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
          标签
        </button>
        {showCats && (
          <>
            {cats.map(c => {
              const on = cat === c.v;
              return (
                <button
                  key={c.v}
                  onClick={() => setCat(on ? null : c.v)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] transition-all"
                  style={{
                    background: on ? hexToRgba(c.dot, 0.14) : 'rgba(120,120,128,0.08)',
                    color: on ? c.dot : '#8e8e93',
                    border: `1px solid ${on ? hexToRgba(c.dot, 0.55) : 'transparent'}`,
                    fontWeight: on ? 600 : 400,
                  }}
                >
                  <span className="w-[7px] h-[7px] rounded-full flex-shrink-0" style={{ background: c.dot }} />
                  {c.label}
                </button>
              );
            })}
            <button
              onClick={() => { setShowCats(false); setCat(null); }}
              className="text-[12px] text-ink-400 hover:text-ink-600 px-1.5 py-1 transition-colors"
              title="收起标签"
            >收起</button>
          </>
        )}
        <div className="flex-1" />
        {savedFlash && <span className="text-[12px] text-[color:var(--s-main)] font-medium">✓ 已收进</span>}
        <button
          onClick={save}
          disabled={busy || !text.trim()}
          title="保存（Ctrl+S）"
          className="text-[12.5px] font-semibold px-3.5 py-1.5 rounded-lg transition-all disabled:opacity-40"
          style={{ background: 'var(--s-main)', color: '#fff', boxShadow: '0 2px 6px rgba(var(--s-rgb),0.25)' }}
        >保存</button>
      </div>
    </div>
  );
}
