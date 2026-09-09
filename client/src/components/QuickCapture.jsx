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
 * QuickCapture · 收集箱输入框（新建与编辑统一同构）
 *  - 新建（不传 edit）：大输入区（无边框悬浮卡）默认约占左栏一半高度，
 *    内容超出自动向下拉伸（无滚动条），保存后清空；Enter 换行、Ctrl/Cmd+S 保存；
 *    静息中性阴影定义边缘，聚焦主题色光环反馈输入状态
 *  - 编辑（传 edit={item}，配合 key={item.id} 重挂载）：输入区预填条目内容，
 *    保存走更新（内容+标签），成功显示「✓ 已保存」且不清空
 *  - bare 模式（面板内）：输入区撑满整个面板，超出滚动；底部按钮行
 *    「＋ 标签 [分派] … 保存」固定在面板底部
 *  - 「分派」按钮（传 onDispatch 时显示）：新建先收进、编辑先更新，
 *    再交给宿主打开详细分派弹窗（InboxPage · ScheduleForm 预填）
 * ============================================================ */
export default function QuickCapture({ onSaved, onUpdated, onDispatch, autoFocus = true, placeholder, bare, edit }) {
  const toast = useToast();
  const [text, setText] = useState(edit ? String(edit.content || '') : '');
  const [cat, setCat] = useState(edit && edit.category != null ? Number(edit.category) : null);
  const [showCats, setShowCats] = useState(false);
  const [busy, setBusy] = useState(false);
  const [flashMsg, setFlashMsg] = useState('');
  const [focused, setFocused] = useState(false);
  const inputRef = useRef(null);
  const flashTimer = useRef(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);

  function flash(msg) {
    setFlashMsg(msg);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlashMsg(''), 1500);
  }

  // 自动增高（默认模式）：内容行数超过默认高度时撑开（不用滚动条）；bare 模式由 flex 撑满，无需 JS 计算
  function autoGrow(el) {
    if (!el || bare) return;
    el.style.height = 'auto';
    el.style.height = Math.max(200, el.scrollHeight) + 'px';
  }

  // 保存：新建 → 收进收集箱后清空；编辑 → 更新内容与标签（不清空）
  async function save() {
    const content = text.trim();
    if (!content || busy) return;
    setBusy(true);
    try {
      if (edit) {
        await API.inbox.update(edit.id, { content, category: cat });
        flash('✓ 已保存');
        onUpdated?.();
      } else {
        await API.inbox.create({ content, category: cat });
        setText('');
        flash('✓ 已收进');
        onSaved?.();
      }
    } catch (e) {
      toast.error(e.message || '保存失败');
    } finally {
      setBusy(false);
      // 保存后焦点回到输入框，支持连续录入/继续编辑
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  // 分派：新建先收进、编辑先更新（含标签），再交给宿主打开详细分派弹窗
  async function dispatch() {
    const content = text.trim();
    if (!content || busy) return;
    setBusy(true);
    try {
      if (edit) {
        await API.inbox.update(edit.id, { content, category: cat });
        onUpdated?.();
        onDispatch?.({ ...edit, content, category: cat });
      } else {
        const r = await API.inbox.create({ content, category: cat });
        setText('');
        onSaved?.();
        onDispatch?.(r.item);
      }
    } catch (e) {
      toast.error(e.message || '分派失败');
    } finally {
      setBusy(false);
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
  const dispatchBtn = onDispatch && (
    <button
      onClick={dispatch}
      disabled={busy || !text.trim()}
      title="转为日程"
      className="text-[12px] font-medium px-2.5 py-1 rounded-full transition-colors disabled:opacity-40"
      style={{ background: 'rgba(var(--s-rgb),0.1)', color: 'var(--s-main)' }}
    >分派</button>
  );

  return (
    <div className={bare ? 'flex-1 flex flex-col min-h-0 gap-3' : undefined}>
      {/* 输入区：无边框悬浮卡片——静息中性阴影定义边缘，聚焦主题色光环；默认约左栏一半高、超出自动撑开，bare 模式撑满面板、超出滚动。
          左右各内收 1.5px：聚焦光环（box-shadow 向外扩 1.5px）外缘与卡片 16px 内边距线（页头色条左缘）精确对齐 */}
      <textarea
        ref={inputRef}
        value={text}
        onChange={(e) => { setText(e.target.value); autoGrow(e.target); }}
        onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder || '记录想法/待办'}
        className={`mx-[1.5px] bg-transparent outline-none resize-none text-[14px] leading-[22px] text-[#1c1c1e] placeholder:text-ink-400 rounded-[9px] transition-all ${bare ? 'flex-1 min-h-0 w-auto' : 'w-[calc(100%_-_3px)]'}`}
        style={{
          background: '#ffffff',
          border: '1px solid transparent',
          boxShadow: focused
            ? '0 1px 4px rgba(0,0,0,0.06), 0 0 0 1.5px rgba(var(--s-rgb),0.25)'
            : '0 1px 4px rgba(0,0,0,0.08)',
          padding: '12px 14px',
          overflow: bare ? 'auto' : 'hidden',
          ...(bare ? {} : { height: 200, display: 'block' }),
        }}
      />

      {bare ? (
        <>
          {/* 标签面板：展开时出现在按钮行上方（按钮行位置不动） */}
          {showCats && (
            <div>
              <div className="text-[11px] font-semibold text-ink-400 mb-1.5 tracking-wide">标签</div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {cats.map(c => {
                  const on = cat === c.v;
                  return (
                    <button
                      key={c.v}
                      onClick={() => setCat(on ? null : c.v)}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] transition-all"
                      style={{
                        background: on ? hexToRgba(c.dot, 0.14) : 'rgba(120,120,128,0.06)',
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
              </div>
            </div>
          )}

          {/* 底部按钮行：＋ 标签（展开时变「收起」）[分派] … 保存 */}
          <div className="mt-auto pt-3 border-t border-ink-100/80 flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setShowCats(s => !s)}
              className="flex items-center gap-1 text-[12px] font-medium px-2.5 py-1 rounded-full transition-colors"
              style={{ background: 'rgba(var(--s-rgb),0.1)', color: 'var(--s-main)' }}
            >
              {showCats ? '收起' : (
                <>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
                  标签
                </>
              )}
            </button>
            {dispatchBtn}
            <div className="flex-1" />
            {flashMsg && <span className="text-[12px] text-[color:var(--s-main)] font-medium">{flashMsg}</span>}
            <button
              onClick={save}
              disabled={busy || !text.trim()}
              title="保存（Ctrl+S）"
              className="text-[12.5px] font-semibold px-3.5 py-1.5 rounded-lg transition-all disabled:opacity-40"
              style={{ background: 'var(--s-main)', color: '#fff', boxShadow: '0 2px 6px rgba(var(--s-rgb),0.25)' }}
            >{busy ? '保存中…' : '保存'}</button>
          </div>
        </>
      ) : (
        /* 操作行：标签 + [分派] + 保存（与输入区解耦） */
        <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setShowCats(s => !s)}
            className="flex items-center gap-1 text-[12px] font-medium px-2.5 py-1 rounded-full transition-colors"
            style={{ background: 'rgba(var(--s-rgb),0.1)', color: 'var(--s-main)' }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
            标签
          </button>
          {dispatchBtn}
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
          {flashMsg && <span className="text-[12px] text-[color:var(--s-main)] font-medium">{flashMsg}</span>}
          <button
            onClick={save}
            disabled={busy || !text.trim()}
            title="保存（Ctrl+S）"
            className="text-[12.5px] font-semibold px-3.5 py-1.5 rounded-lg transition-all disabled:opacity-40"
            style={{ background: 'var(--s-main)', color: '#fff', boxShadow: '0 2px 6px rgba(var(--s-rgb),0.25)' }}
          >保存</button>
        </div>
      )}
    </div>
  );
}
