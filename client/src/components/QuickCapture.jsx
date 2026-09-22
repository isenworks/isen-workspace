import { useState, useRef, useEffect } from 'react';
import { API } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';
import { hexToRgba } from '../utils/color.js';

/* ============================================================
 * QuickCapture · 小记输入框（新建与编辑统一同构）
 *  - 富文本编辑：contenteditable + execCommand（标题/加粗/斜体/有序无序列表/清除格式）
 *  - 内容存 HTML；空内容判断取 innerText
 *  - 标签：使用小记独立标签（tags prop，tag_id）
 * ============================================================ */
export default function QuickCapture({ onSaved, onUpdated, onDispatch, autoFocus = true, placeholder, bare, edit, tags }) {
  const toast = useToast();
  const editorRef = useRef(null);
  const [tagId, setTagId] = useState(edit && edit.tag_id != null ? Number(edit.tag_id) : null);
  const [showTags, setShowTags] = useState(false);
  const [busy, setBusy] = useState(false);
  const [flashMsg, setFlashMsg] = useState('');
  const [savedAt, setSavedAt] = useState(edit?.created_at || '');
  const [focused, setFocused] = useState(false);
  const flashTimer = useRef(null);

  // 初始化编辑器内容（HTML）
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = edit ? String(edit.content || '') : '';
    }
    setSavedAt(edit?.created_at || '');
  }, [edit]);

  useEffect(() => {
    if (autoFocus) editorRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);

  function fmtSavedTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const now = new Date();
    const p = n => String(n).padStart(2, '0');
    const sameDay = a => a.getFullYear() === now.getFullYear() && a.getMonth() === now.getMonth() && a.getDate() === now.getDate();
    if (sameDay(d)) return `${p(d.getHours())}:${p(d.getMinutes())}`;
    const y = new Date(now); y.setDate(y.getDate() - 1);
    if (sameDay(y)) return `昨天 ${p(d.getHours())}:${p(d.getMinutes())}`;
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  function flash(msg) {
    setFlashMsg(msg);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlashMsg(''), 1500);
  }

  function getContent() {
    return editorRef.current?.innerHTML || '';
  }
  function getPlainText() {
    return (editorRef.current?.innerText || '').trim();
  }

  // 富文本操作
  function exec(cmd, val) {
    editorRef.current?.focus();
    document.execCommand(cmd, false, val);
  }

  // 保存
  async function save() {
    const content = getContent();
    if (!getPlainText() || busy) return;
    setBusy(true);
    try {
      if (edit) {
        await API.inbox.update(edit.id, { content, tag_id: tagId });
        setSavedAt(new Date().toISOString());
        flash('✓ 已保存');
        onUpdated?.();
      } else {
        await API.inbox.create({ content, tag_id: tagId });
        editorRef.current.innerHTML = '';
        setTagId(null);
        setSavedAt('');
        flash('✓ 已收进');
        onSaved?.();
      }
    } catch (e) {
      toast.error(e.message || '保存失败');
    } finally {
      setBusy(false);
      requestAnimationFrame(() => editorRef.current?.focus());
    }
  }

  // 分派
  async function dispatch() {
    const content = getContent();
    if (!getPlainText() || busy) return;
    setBusy(true);
    try {
      if (edit) {
        await API.inbox.update(edit.id, { content, tag_id: tagId });
        onUpdated?.();
        onDispatch?.({ ...edit, content, tag_id: tagId });
      } else {
        const r = await API.inbox.create({ content, tag_id: tagId });
        editorRef.current.innerHTML = '';
        setTagId(null);
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
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      if (getPlainText()) save();
    }
  }

  const tagList = tags || [];
  const currentTag = tagList.find(t => t.id === tagId) || null;

  const dispatchBtn = onDispatch && (
    <button
      onClick={dispatch}
      disabled={busy || !getPlainText()}
      title="转为日程"
      className="text-[12px] font-medium px-2.5 py-1 rounded-full transition-colors disabled:opacity-40"
      style={{ background: 'rgba(var(--s-rgb),0.1)', color: 'var(--s-main)' }}
    >分派</button>
  );

  // 工具栏按钮
  const ToolbarBtn = ({ active, onClick, title, children }) => (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      title={title}
      className={`w-7 h-7 rounded-md flex items-center justify-center text-[13px] transition-colors ${
        active ? 'bg-[rgba(var(--s-rgb),0.15)] text-[var(--s-main)]' : 'text-ink-500 hover:bg-black/5 hover:text-ink-800'
      }`}
    >{children}</button>
  );

  const toolbar = (
    <div className="flex items-center gap-0.5 px-1 py-1 rounded-lg bg-ink-50/70 border border-ink-100/80">
      <ToolbarBtn title="标题1" onClick={() => exec('formatBlock', 'H1')}><span className="font-bold text-[13px]">H1</span></ToolbarBtn>
      <ToolbarBtn title="标题2" onClick={() => exec('formatBlock', 'H2')}><span className="font-bold text-[12px]">H2</span></ToolbarBtn>
      <ToolbarBtn title="正文" onClick={() => exec('formatBlock', 'P')}><span className="text-[12px]">正文</span></ToolbarBtn>
      <div className="w-px h-4 bg-ink-200 mx-1" />
      <ToolbarBtn title="加粗 (Ctrl+B)" onClick={() => exec('bold')}><span className="font-bold">B</span></ToolbarBtn>
      <ToolbarBtn title="斜体 (Ctrl+I)" onClick={() => exec('italic')}><span className="italic">I</span></ToolbarBtn>
      <div className="w-px h-4 bg-ink-200 mx-1" />
      <ToolbarBtn title="无序列表" onClick={() => exec('insertUnorderedList')}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3.5" cy="6" r="1.2" fill="currentColor" stroke="none"/><circle cx="3.5" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="3.5" cy="18" r="1.2" fill="currentColor" stroke="none"/></svg>
      </ToolbarBtn>
      <ToolbarBtn title="有序列表" onClick={() => exec('insertOrderedList')}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><path d="M4 6h1v4" strokeLinejoin="round"/><path d="M4 10h2" /><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" /></svg>
      </ToolbarBtn>
      <div className="w-px h-4 bg-ink-200 mx-1" />
      <ToolbarBtn title="清除格式" onClick={() => exec('removeFormat')}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/></svg>
      </ToolbarBtn>
    </div>
  );

  // 标签选择器
  const tagPicker = (
    <div>
      <div className="text-[11px] font-semibold text-ink-400 mb-1.5 tracking-wide">标签</div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {tagList.length === 0 ? (
          <span className="text-[12px] text-ink-400">暂无标签，可在左侧栏管理</span>
        ) : tagList.map(t => {
          const on = tagId === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTagId(on ? null : t.id)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] transition-all"
              style={{
                background: on ? hexToRgba(t.color, 0.14) : 'rgba(120,120,128,0.06)',
                color: on ? t.color : '#8e8e93',
                border: `1px solid ${on ? hexToRgba(t.color, 0.55) : 'transparent'}`,
                fontWeight: on ? 600 : 400,
              }}
            >
              <span className="w-[7px] h-[7px] rounded-full flex-shrink-0" style={{ background: t.color }} />
              {t.name}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className={bare ? 'flex-1 flex flex-col min-h-0 gap-3' : undefined}>
      {/* 工具栏 */}
      {toolbar}

      {/* 富文本编辑区 */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={() => {}}
        onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        data-placeholder={placeholder}
        className={`qc-editor mx-[1.5px] outline-none rounded-[9px] transition-all ${bare ? 'flex-1 min-h-0 overflow-auto' : 'w-[calc(100%_-_3px)]'}`}
        style={{
          background: '#ffffff',
          border: '1px solid transparent',
          boxShadow: focused
            ? '0 1px 4px rgba(0,0,0,0.06), 0 0 0 1.5px rgba(var(--s-rgb),0.25)'
            : '0 1px 4px rgba(0,0,0,0.08)',
          padding: '12px 14px',
          fontSize: '14px',
          lineHeight: '22px',
          color: '#1c1c1e',
          ...(bare ? {} : { minHeight: 200 }),
        }}
      />

      {bare ? (
        <>
          {showTags && tagPicker}
          <div className="mt-auto pt-3 border-t border-ink-100/80 flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setShowTags(s => !s)}
              className="flex items-center gap-1 text-[12px] font-medium px-2.5 py-1 rounded-full transition-colors"
              style={{ background: 'rgba(var(--s-rgb),0.1)', color: 'var(--s-main)' }}
            >
              {showTags ? '收起' : (
                <>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
                  {currentTag ? currentTag.name : '标签'}
                </>
              )}
            </button>
            {dispatchBtn}
            <div className="flex-1" />
            {flashMsg && <span className="text-[12px] text-[color:var(--s-main)] font-medium">{flashMsg}</span>}
            {!flashMsg && savedAt && <span className="text-[11px] text-ink-400">{fmtSavedTime(savedAt)}</span>}
            <button
              onClick={save}
              disabled={busy || !getPlainText()}
              title="保存（Ctrl+S）"
              className="text-[12.5px] font-semibold px-3.5 py-1.5 rounded-lg transition-all disabled:opacity-40"
              style={{ background: 'var(--s-main)', color: '#fff', boxShadow: '0 2px 6px rgba(var(--s-rgb),0.25)' }}
            >{busy ? '保存中…' : '保存'}</button>
          </div>
        </>
      ) : (
        <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setShowTags(s => !s)}
            className="flex items-center gap-1 text-[12px] font-medium px-2.5 py-1 rounded-full transition-colors"
            style={{ background: 'rgba(var(--s-rgb),0.1)', color: 'var(--s-main)' }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
            {currentTag ? currentTag.name : '标签'}
          </button>
          {dispatchBtn}
          {showTags && tagPicker}
          <div className="flex-1" />
          {flashMsg && <span className="text-[12px] text-[color:var(--s-main)] font-medium">{flashMsg}</span>}
          {!flashMsg && savedAt && <span className="text-[11px] text-ink-400">{fmtSavedTime(savedAt)}</span>}
          <button
            onClick={save}
            disabled={busy || !getPlainText()}
            title="保存（Ctrl+S）"
            className="text-[12.5px] font-semibold px-3.5 py-1.5 rounded-lg transition-all disabled:opacity-40"
            style={{ background: 'var(--s-main)', color: '#fff', boxShadow: '0 2px 6px rgba(var(--s-rgb),0.25)' }}
          >保存</button>
        </div>
      )}
    </div>
  );
}
