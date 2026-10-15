import { useState, useRef, useEffect, useMemo } from 'react';
import { API } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';
import { hexToRgba } from '../utils/color.js';

/* ============================================================
 * QuickCapture · 小记输入框（新建与编辑统一同构）
 *  - 富文本编辑：contenteditable + execCommand（标题/加粗/斜体/有序无序列表/清除格式）
 *  - 内容存 HTML；空内容判断取 innerText
 *  - 标签：使用小记独立标签（tags prop，可多选）；新建/管理复用「管理标签」面板
 * ============================================================ */

// 解析小记的标签列表：优先 tag_ids（JSON 数组），兼容旧的单值 tag_id
export function parseItemTagIds(it) {
  const raw = it?.tag_ids;
  if (Array.isArray(raw)) return raw.map(Number).filter(n => !Number.isNaN(n));
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) return p.map(Number).filter(n => !Number.isNaN(n));
    } catch { /* ignore */ }
  }
  return it?.tag_id != null ? [Number(it.tag_id)] : [];
}

// ===== 编辑器光标偏移（自管 undo 用：快照/恢复光标到等价文本位置） =====
function getCaretOffset(root) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return 0;
  try {
    const pre = document.createRange();
    pre.selectNodeContents(root);
    const r = sel.getRangeAt(0);
    pre.setEnd(r.endContainer, r.endOffset);
    return pre.toString().length;
  } catch { return 0; }
}

function setCaretOffset(root, offset) {
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let cur = 0, node;
  while ((node = walker.nextNode())) {
    const len = node.textContent.length;
    if (cur + len >= offset) {
      const r = document.createRange();
      r.setStart(node, Math.max(0, offset - cur));
      r.collapse(true);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
      return;
    }
    cur += len;
  }
  const r = document.createRange();
  r.selectNodeContents(root);
  r.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(r);
}

// 收集选区覆盖的顶层块（嵌套块只取最外层；每块将转为一个独立复选项）
const BLOCK_TAG = /^(P|H1|H2|H3|H4|LI|BLOCKQUOTE|DIV)$/;
function selectedBlocks(root, range) {
  const blocks = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
    acceptNode: n => {
      if (n === root || !BLOCK_TAG.test(n.tagName || '')) return NodeFilter.FILTER_SKIP;
      try { if (!range.intersectsNode(n)) return NodeFilter.FILTER_SKIP; } catch { return NodeFilter.FILTER_SKIP; }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let n;
  while ((n = walker.nextNode())) {
    const p = n.parentElement;
    if (p && p !== root && BLOCK_TAG.test(p.tagName || '')) continue;
    blocks.push(n);
  }
  return blocks;
}

export default function QuickCapture({ onSaved, onUpdated, onDispatch, onManageTags, autoFocus = true, placeholder, bare, edit, tags }) {
  const toast = useToast();
  const editorRef = useRef(null);
  const [tagIds, setTagIds] = useState(() => parseItemTagIds(edit));
  const [showTags, setShowTags] = useState(false);
  const [busy, setBusy] = useState(false);
  const [flashMsg, setFlashMsg] = useState('');
  const [savedAt, setSavedAt] = useState(edit?.updated_at || edit?.created_at || '');
  const [focused, setFocused] = useState(false);
  const flashTimer = useRef(null);
  const autoTimer = useRef(null);                      // 输入防抖自动保存定时器
  const draftRef = useRef({ content: '', plain: '' }); // 最近一次输入（卸载兜底用）
  // 自管 undo/redo：DOM 直改（复选转换/勾选）会打断浏览器原生撤销栈，
  // 因此编辑器内 Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y 全部走这里的快照栈
  const undoStack = useRef([]);   // [{ html, caret }]
  const undoIdx = useRef(-1);
  const undoTimer = useRef(null); // 输入快照防抖（连续打字合并为一步）
  const activeIdRef = useRef(edit?.id ?? null);        // 当前记录 id：编辑=edit.id；新建首次自动保存后回填
  const tagIdsRef = useRef(tagIds);                    // 标签同步值（供异步自动保存读最新）
  tagIdsRef.current = tagIds;

  // 初始化编辑器内容（HTML）：仅在「切换记录」时同步，避免自动保存后重渲染打断光标
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = edit ? String(edit.content || '') : '';
    }
    draftRef.current = { content: '', plain: '' };
    undoStack.current = [{ html: editorRef.current?.innerHTML || '', caret: 0 }];
    undoIdx.current = 0;
    setTagIds(parseItemTagIds(edit));
    setSavedAt(edit?.updated_at || edit?.created_at || '');
  }, [edit?.id]);

  useEffect(() => {
    if (autoFocus) editorRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => () => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
    if (autoTimer.current) clearTimeout(autoTimer.current);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    // 卸载时若有未保存内容，立即落库（fire-and-forget），避免切走丢失
    const d = draftRef.current;
    if (d.plain) {
      const payload = { content: d.content, tag_ids: tagIdsRef.current };
      if (activeIdRef.current) API.inbox.update(activeIdRef.current, payload).catch(() => {});
      else API.inbox.create(payload).catch(() => {});
    }
  }, []);

  // ===== 自管 undo/redo =====
  function pushUndo() {
    const ed = editorRef.current;
    if (!ed) return;
    const html = ed.innerHTML;
    const top = undoStack.current[undoIdx.current];
    if (top && top.html === html) return;
    undoStack.current = undoStack.current.slice(0, undoIdx.current + 1);
    undoStack.current.push({ html, caret: getCaretOffset(ed) });
    if (undoStack.current.length > 120) undoStack.current.shift();
    undoIdx.current = undoStack.current.length - 1;
  }
  function restoreSnap(snap) {
    const ed = editorRef.current;
    if (!ed || !snap) return;
    ed.innerHTML = snap.html;
    setCaretOffset(ed, snap.caret);
    draftRef.current = { content: snap.html, plain: (ed.innerText || '').trim() };
    scheduleAutosave();
  }
  function applyUndo() {
    if (undoIdx.current <= 0) return;
    undoIdx.current -= 1;
    restoreSnap(undoStack.current[undoIdx.current]);
  }
  function applyRedo() {
    if (undoIdx.current >= undoStack.current.length - 1) return;
    undoIdx.current += 1;
    restoreSnap(undoStack.current[undoIdx.current]);
  }

  function fmtSavedTime(iso) {
    if (!iso) return '';
    // D1 datetime('now') 返回 UTC 字符串无时区后缀，必须显式按 UTC 解析
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/);
    const d = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])) : new Date(iso);
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
    pushUndo();
  }

  // 手动改 DOM（插入复选行/勾选切换/转换）后统一走这里：压 undo 快照 + 同步草稿 + 触发防抖自动保存
  function touch() {
    pushUndo();
    draftRef.current = { content: getContent(), plain: getPlainText() };
    scheduleAutosave();
  }

  // ===== 复选框列表（ul.qc-checklist > li[data-checked]） =====
  // 全部纯 DOM 操作（execCommand('insertHTML') 会被浏览器清洗掉 class/data 属性，
  // 导致复选样式退化为普通列表）。按钮为 toggle 语义（同 B/I）：
  //  · 光标行是复选项 → 取消复选框，转回普通行（光标原位保留）
  //  · 选区全是复选项 → 全部取消
  //  · 光标在普通行内 → 整行转复选项（内容与行内格式保留）
  //  · 光标在普通列表内 → 整个列表转复选列表
  //  · 选中文字 → 选区覆盖的每一块各自转为一个复选项（一行一个圆点）
  //  · 空编辑器/无块上下文 → 插入空复选行
  function insertChecklist() {
    const ed = editorRef.current;
    if (!ed) return;
    ed.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const nodeToEl = n => (n ? (n.nodeType === 3 ? n.parentElement : n) : null);
    const focusLi = (li, atStart) => {
      if (!li) return;
      const r = document.createRange();
      r.selectNodeContents(li);
      r.collapse(!!atStart);
      sel.removeAllRanges();
      sel.addRange(r);
    };

    const buildLi = (srcEl, checked) => {
      const li = document.createElement('li');
      li.setAttribute('data-checked', checked || 'false');
      li.innerHTML = srcEl?.innerHTML?.trim() ? srcEl.innerHTML : '<br>';
      return li;
    };
    // 复选项 → 普通行（取消复选框）：内容不变，文本偏移等价，可精确恢复光标
    const toPlainDiv = (li) => {
      const off = getCaretOffset(li);
      const div = document.createElement('div');
      div.innerHTML = li.innerHTML || '<br>';
      if (li.parentElement && li.parentElement.children.length === 1) li.parentElement.replaceWith(div);
      else li.replaceWith(div);
      setCaretOffset(div, off);
      return div;
    };

    // 1) 光标在复选项内 → toggle 取消：该行转回普通行
    const curLi = nodeToEl(range.startContainer)?.closest?.('ul.qc-checklist > li');
    if (curLi) {
      toPlainDiv(curLi);
      touch();
      return;
    }

    // 2) 光标折叠：整行/整列表转换
    if (range.collapsed) {
      let block = nodeToEl(range.startContainer)?.closest?.('p,h1,h2,h3,h4,li,blockquote,div');
      if (block === ed || (block && !ed.contains(block))) block = null;
      if (block && block.tagName === 'LI' && !block.closest('ul.qc-checklist')) {
        // 2a) 普通列表 → 整个列表转复选列表
        const list = block.closest('ul,ol');
        const idx = [...list.children].indexOf(block);
        const nu = document.createElement('ul');
        nu.className = 'qc-checklist';
        nu.innerHTML = list.innerHTML;
        nu.querySelectorAll('li').forEach(x => x.setAttribute('data-checked', 'false'));
        list.replaceWith(nu);
        focusLi(nu.children[idx] || nu.querySelector('li'), false);
        touch();
        return;
      }
      if (block) {
        // 2b) 段落/标题/引用行 → 整行转复选项
        const ul = document.createElement('ul');
        ul.className = 'qc-checklist';
        ul.appendChild(buildLi(block));
        block.replaceWith(ul);
        focusLi(ul.querySelector('li'), false);
        touch();
        return;
      }
      // 2c) 编辑器直接文本/空内容 → 光标处插空复选行
      const ul = document.createElement('ul');
      ul.className = 'qc-checklist';
      const li = document.createElement('li');
      li.setAttribute('data-checked', 'false');
      li.innerHTML = '<br>';
      ul.appendChild(li);
      range.deleteContents();
      range.insertNode(ul);
      focusLi(li, true);
      touch();
      return;
    }

    // 3) 有选区
    const blocks = selectedBlocks(ed, range);
    if (blocks.length === 0) {
      // 选区未覆盖任何块（同块内部分文字）：整块转
      let block = nodeToEl(range.startContainer)?.closest?.('p,h1,h2,h3,h4,li,blockquote,div');
      if (block === ed || (block && !ed.contains(block))) block = null;
      if (block) {
        const ul = document.createElement('ul');
        ul.className = 'qc-checklist';
        ul.appendChild(buildLi(block));
        block.replaceWith(ul);
        focusLi(ul.querySelector('li'), false);
      }
      touch();
      return;
    }
    // 3a) 选区全部是复选项 → 全部取消复选框
    if (blocks.every(b => b.closest('ul.qc-checklist'))) {
      let lastDiv = null;
      blocks.forEach(b => { lastDiv = toPlainDiv(b); });
      if (lastDiv) focusLi(lastDiv, false);
      touch();
      return;
    }
    // 3b) 转复选：每一块一个复选项（保留原勾选态与行内格式）
    const ul = document.createElement('ul');
    ul.className = 'qc-checklist';
    blocks.forEach(b => {
      const checked = b.closest('ul.qc-checklist') ? (b.getAttribute('data-checked') || 'false') : 'false';
      ul.appendChild(buildLi(b, checked));
    });
    // 新列表插到选区起点之前；起点在原列表内时插到整个列表之前，避免嵌套
    const anchor = /^(UL|OL)$/.test(blocks[0].parentElement?.tagName || '') ? blocks[0].parentElement : blocks[0];
    anchor.before(ul);
    blocks.forEach(b => b.remove());
    focusLi(ul.querySelector('li:last-of-type'), false);
    touch();
  }

  // 编辑区内点击复选行左侧圆点区域 → 切换勾选态（data-checked 持久化在 HTML 里）
  function onEditorClick(e) {
    const li = e.target?.closest?.('ul.qc-checklist > li');
    if (!li) return;
    const rect = li.getBoundingClientRect();
    if (e.clientX - rect.left <= 28) {
      e.preventDefault();
      li.setAttribute('data-checked', li.getAttribute('data-checked') === 'true' ? 'false' : 'true');
      touch();
    }
  }

  // 手动保存：编辑态=更新，新建态=收录；都不清空编辑区，保持显示已保存内容
  //  - 已自动落库的新建记录会复用同一 id，避免重复创建
  //  - 新建时把记录回传给父级，父级可据此选中它（编辑区随之为「已保存」态）
  async function save() {
    const content = getContent();
    if (!getPlainText() || busy) return;
    setBusy(true);
    try {
      const targetId = edit?.id ?? activeIdRef.current;
      let r;
      if (targetId) {
        r = await API.inbox.update(targetId, { content, tag_ids: tagIds });
        activeIdRef.current = targetId;
        onUpdated?.();
      } else {
        r = await API.inbox.create({ content, tag_ids: tagIds });
        activeIdRef.current = r?.item?.id ?? null;
      }
      setSavedAt(r?.item?.updated_at || new Date().toISOString());
      draftRef.current = { content: '', plain: '' };
      flash('✓ 已保存');
      if (!edit) onSaved?.(r?.item);
    } catch (e) {
      toast.error(e.message || '保存失败');
    } finally {
      setBusy(false);
      requestAnimationFrame(() => editorRef.current?.focus());
    }
  }

  // 自动保存（输入防抖触发）：编辑态直接更新；新建态首次落库后转为更新，避免重复创建
  async function autosave() {
    if (busy) return;
    const content = getContent();
    const plain = getPlainText();
    if (!plain) return;
    try {
      if (edit?.id ?? activeIdRef.current) {
        const id = edit?.id ?? activeIdRef.current;
        const r = await API.inbox.update(id, { content, tag_ids: tagIdsRef.current });
        setSavedAt(r?.item?.updated_at || new Date().toISOString());
        onUpdated?.();
      } else {
        const r = await API.inbox.create({ content, tag_ids: tagIdsRef.current });
        if (r?.item?.id != null) activeIdRef.current = r.item.id;
        setSavedAt(r?.item?.updated_at || new Date().toISOString());
        // 自动收录：刷新列表让左侧卡片立即出现（不带记录，避免自动选中重挂打断输入）
        onSaved?.();
      }
      // 期间没有新输入则视为已落库，清掉草稿标记（卸载时不再重复提交）
      if (draftRef.current.content === content) draftRef.current = { content: '', plain: '' };
    } catch { /* 自动保存失败静默，保留手动「保存」兜底 */ }
  }
  const autosaveRef = useRef(autosave);
  autosaveRef.current = autosave;

  // 停止输入 1s 后自动保存
  function scheduleAutosave() {
    if (autoTimer.current) clearTimeout(autoTimer.current);
    autoTimer.current = setTimeout(() => { autoTimer.current = null; autosaveRef.current?.(); }, 1000);
  }

  // 分派
  async function dispatch() {
    const content = getContent();
    if (!getPlainText() || busy) return;
    setBusy(true);
    try {
      const id = edit?.id ?? activeIdRef.current;   // 复用自动落库的记录，避免重复创建
      if (id) {
        await API.inbox.update(id, { content, tag_ids: tagIds });
        onUpdated?.();
        onDispatch?.({ ...(edit || { id }), content, tag_ids: tagIds });
      } else {
        const r = await API.inbox.create({ content, tag_ids: tagIds });
        activeIdRef.current = null;
        editorRef.current.innerHTML = '';
        draftRef.current = { content: '', plain: '' };
        setTagIds([]);
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
      return;
    }
    // 自管 undo/redo：拦截原生撤销（DOM 直改后原生栈不可靠）
    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      if (e.shiftKey) applyRedo(); else applyUndo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
      e.preventDefault();
      applyRedo();
    }
  }

  // 可选标签（父级下发，新建/管理统一走「管理标签」面板）
  const tagList = tags || [];
  const tagMap = useMemo(() => new Map(tagList.map(t => [Number(t.id), t])), [tagList]);
  const selectedTags = tagIds.map(id => tagMap.get(id)).filter(Boolean);
  const tagLabel = selectedTags.length === 0
    ? '标签'
    : (selectedTags.length === 1 ? selectedTags[0].name : `${selectedTags[0].name} +${selectedTags.length - 1}`);

  function toggleTag(id) {
    const n = Number(id);
    setTagIds(prev => (prev.includes(n) ? prev.filter(x => x !== n) : [...prev, n]));
    scheduleAutosave();
  }

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
      <ToolbarBtn title="复选框列表" onClick={insertChecklist}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8.5"/><polyline points="8.4 12.3 11 14.9 15.6 9.9"/></svg>
      </ToolbarBtn>
      <div className="w-px h-4 bg-ink-200 mx-1" />
      <ToolbarBtn title="清除格式" onClick={() => exec('removeFormat')}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/></svg>
      </ToolbarBtn>
    </div>
  );

  // 标签选择器（多选；新建/管理复用「管理标签」面板）
  const tagPicker = (
    <div>
      <div className="text-[11px] font-semibold text-ink-400 mb-1.5 tracking-wide">
        标签{tagIds.length > 0 ? `（已选 ${tagIds.length}）` : ''}
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {tagList.map(t => {
          const on = tagIds.includes(Number(t.id));
          return (
            <button
              key={t.id}
              onClick={() => toggleTag(t.id)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] transition-all"
              style={{
                background: on ? hexToRgba(t.color, 0.14) : 'rgba(120,120,128,0.06)',
                color: on ? t.color : 'var(--text-muted)',
                border: `1px solid ${on ? hexToRgba(t.color, 0.55) : 'transparent'}`,
                fontWeight: on ? 600 : 400,
              }}
            >
              <span className="w-[7px] h-[7px] rounded-full flex-shrink-0" style={{ background: t.color }} />
              {t.name}
              {on && <span className="text-[10px] leading-none">✓</span>}
            </button>
          );
        })}
        {tagList.length === 0 && (
          <span className="text-[12px] text-ink-400">暂无标签</span>
        )}
        <button
          onClick={() => onManageTags?.()}
          className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] text-ink-500 border border-dashed border-ink-200 hover:border-ink-300 hover:text-ink-700 transition-colors"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
          管理标签
        </button>
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
        onInput={() => {
          draftRef.current = { content: getContent(), plain: getPlainText() };
          // 输入快照防抖压栈（连续打字合并为一步 undo）
          if (undoTimer.current) clearTimeout(undoTimer.current);
          undoTimer.current = setTimeout(() => pushUndo(), 600);
          scheduleAutosave();
        }}
        onKeyDown={onKeyDown}
        onClick={onEditorClick}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        data-placeholder={placeholder}
        className={`qc-editor mx-[1.5px] outline-none rounded-[9px] transition-all ${bare ? 'flex-1 min-h-0 overflow-auto' : 'w-[calc(100%_-_3px)]'}`}
        style={{
          background: 'var(--surface-card)',
          border: '1px solid transparent',
          boxShadow: focused
            ? '0 1px 4px rgba(0,0,0,0.06), 0 0 0 1.5px rgba(var(--s-rgb),0.25)'
            : '0 1px 4px rgba(0,0,0,0.08)',
          padding: '12px 14px',
          fontSize: '14px',
          lineHeight: '22px',
          color: 'var(--text-1)',
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
                  {tagLabel}
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
              style={{ background: 'var(--s-main)', color: 'var(--surface-card)', boxShadow: '0 2px 6px rgba(var(--s-rgb),0.25)' }}
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
            {tagLabel}
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
            style={{ background: 'var(--s-main)', color: 'var(--surface-card)', boxShadow: '0 2px 6px rgba(var(--s-rgb),0.25)' }}
          >保存</button>
        </div>
      )}
    </div>
  );
}
