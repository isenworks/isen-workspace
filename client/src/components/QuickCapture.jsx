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
 *  - 大输入区：默认约占左栏一半高度，内容超出自动向下拉伸（无滚动条），
 *    保存后恢复默认高度；Enter 保存、Shift+Enter 换行
 *  - 时间与保存按钮不在输入区内，与「＋ 标签」同一行，输入区更纯粹
 *  - 标签 chips 默认收起（「＋ 标签」浅蓝底），展开可选
 *  - 两处复用：全局快捷键 N 弹窗（Workspace）+ 收集箱页内输入区（InboxPage）
 * ============================================================ */
export default function QuickCapture({ onSaved, autoFocus = true, placeholder }) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [cat, setCat] = useState(null);          // 选中的分类 v；null=未选
  const [showCats, setShowCats] = useState(false);
  const [busy, setBusy] = useState(false);
  const [nowLabel, setNowLabel] = useState('');
  const [savedFlash, setSavedFlash] = useState(false);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef(null);
  const flashTimer = useRef(null);

  // 记录时间：挂载时确定（条目的 created_at 由后端记，这里只是给用户看当前时刻）
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setNowLabel(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
    };
    tick();
    const t = setInterval(tick, 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);

  // 自动增高：内容行数超过 minRows 时撑开（不用滚动条）
  function autoGrow(el) {
    if (!el) return;
    el.style.height = 'auto';
    // min 高度约左栏一半（340px 输入体验），超出按内容撑开
    el.style.height = Math.max(200, el.scrollHeight) + 'px';
  }

  async function save() {
    const content = text.trim();
    if (!content || busy) return;
    setBusy(true);
    try {
      await API.inbox.create({ content, category: cat });
      setText('');
      // 恢复默认高度
      if (inputRef.current) {
        inputRef.current.style.height = '200px';
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
      {/* 输入区：白色圆角容器，默认约左栏一半高，超出自动撑开（无滚动条） */}
      <textarea
        ref={inputRef}
        value={text}
        onChange={(e) => { setText(e.target.value); autoGrow(e.target); }}
        onKeyDown={onKeyDown}
        placeholder={placeholder || '记录想法/待办'}
        className="w-full bg-transparent outline-none resize-none text-[14px] leading-[22px] text-[#1c1c1e] placeholder:text-ink-400 rounded-[9px] transition-all"
        style={{
          background: '#ffffff',
          border: '1px solid #d1d1d6',
          boxShadow: focused ? '0 2px 8px rgba(var(--s-rgb),0.12)' : 'none',
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
        <span className="text-[12px] tabular-nums text-ink-400">{savedFlash ? '✓ 已收进' : nowLabel}</span>
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
