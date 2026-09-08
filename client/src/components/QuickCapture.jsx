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
 *  - 只有一个文本域 + 自动记录时间，Enter 保存并保持焦点，可连续倾倒
 *  - 分类 chips 默认收起（「顺手选个分类」），展开可选，不增加默认负担
 *  - 两处复用：全局快捷键 N 弹窗（Workspace）+ 收集箱页内输入行（InboxPage）
 * ============================================================ */
export default function QuickCapture({ onSaved, autoFocus = true, placeholder }) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [cat, setCat] = useState(null);          // 选中的分类 v；null=未选
  const [showCats, setShowCats] = useState(false);
  const [busy, setBusy] = useState(false);
  const [nowLabel, setNowLabel] = useState('');
  const [savedFlash, setSavedFlash] = useState(false);
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

  async function save() {
    const content = text.trim();
    if (!content || busy) return;
    setBusy(true);
    try {
      await API.inbox.create({ content, category: cat });
      setText('');
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
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      save();
    }
  }

  const cats = readCats();

  return (
    <div>
      {/* 输入行：✎ 图标 + 文本域 + 当前时间 + 保存按钮 */}
      <div className="flex items-center gap-2.5">
        <span className="flex-shrink-0 w-[30px] h-[30px] rounded-lg flex items-center justify-center" style={{ background: 'rgba(var(--s-rgb),0.08)', color: 'var(--s-main)' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
          </svg>
        </span>
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder || '记录一个想法或备忘，回车收进收集箱…'}
          className="flex-1 min-w-0 bg-transparent outline-none text-[14px] text-[#1c1c1e] placeholder:text-ink-400"
        />
        <span className="flex-shrink-0 text-[12px] tabular-nums text-ink-400">{savedFlash ? '✓ 已收进' : nowLabel}</span>
        <button
          onClick={save}
          disabled={busy || !text.trim()}
          className="flex-shrink-0 text-[12.5px] font-semibold px-3 py-1.5 rounded-lg transition-all disabled:opacity-40"
          style={{ background: 'var(--s-main)', color: '#fff', boxShadow: '0 2px 6px rgba(var(--s-rgb),0.25)' }}
        >收进收集箱</button>
      </div>

      {/* 分类 chips：默认收起，点「顺手选个分类」展开 */}
      <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
        {!showCats ? (
          <button
            onClick={() => setShowCats(true)}
            className="text-[12px] text-ink-400 hover:text-ink-600 px-2 py-1 rounded-md hover:bg-ink-50 transition-colors"
          >
            ＋ 顺手选个分类（可选）
          </button>
        ) : (
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
              title="收起分类"
            >收起</button>
          </>
        )}
      </div>
    </div>
  );
}
