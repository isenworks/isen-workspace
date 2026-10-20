import { useState, useRef, useEffect } from 'react';
import { API } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';
import { hexToRgba } from '../utils/color.js';

/* ============================================================
 * QuickCapture · 小记输入框（新建与编辑统一同构）
 *  - 富文本编辑：contenteditable + execCommand（标题/加粗/斜体/有序无序列表/清除格式）
 *  - 内容存 HTML；空内容判断取 innerText
 *  - 标签：使用小记独立标签（tags prop，可多选）；新建/管理复用「管理标签」面板
 * ============================================================ */

// 保存成功勾：与工作台统一的 stroke 勾（viewBox 24 / currentColor / 圆角线帽），
// 替代原来的「✓」字体字符——字符勾的字重与描边不受控，跨平台渲染还易变形
const TickIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

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

const BLOCK_TAG = /^(P|H1|H2|H3|H4|LI|BLOCKQUOTE|DIV)$/;

// 收集选区覆盖的块（文档顺序）：根级块元素 + 根级列表的 li。
// 列表项粒度 —— 框选列表中一部分项时只转选中的那些（飞书行为）；
// 嵌套结构（blockquote/div 内）整体视为一个块，不深入展开。
function selectedBlocks(root, range) {
  const out = [];
  const hit = el => { try { return range.intersectsNode(el); } catch { return false; } };
  [...root.childNodes].forEach(n => {
    if (/^(UL|OL)$/.test(n.tagName || '')) {
      [...n.children].forEach(li => { if (hit(li)) out.push(li); });
    } else if (n.nodeType === 1 && BLOCK_TAG.test(n.tagName || '') && hit(n)) {
      out.push(n);
    }
  });
  return out;
}

// 块的列表类型：'checklist' | 'ul' | 'ol' | null（非列表块）
function blockListType(el) {
  if (!el || el.tagName !== 'LI') return null;
  const p = el.parentElement;
  if (!p) return null;
  if (p.classList?.contains('qc-checklist')) return 'checklist';
  if (p.tagName === 'UL') return 'ul';
  if (p.tagName === 'OL') return 'ol';
  return null;
}

// 列表归一化（每次转换后调用）：
// 1) 相邻同类列表合并 —— 转换/撤销会产生紧贴的碎片列表（如「取消复选框→再设置」），
//    ul+ul / ol+ol / checklist+checklist 各自向后吞并，保证连续同类项永远在同一个列表里（飞书行为）
// 2) 旧数据迁移：伪元素版复选列表（li 内无 .qc-box）补插真实圆点元素
function normalizeListsIn(root) {
  if (!root) return;
  const sameKind = (a, b) =>
    b && /^(UL|OL)$/.test(b.tagName || '') &&
    a.tagName === b.tagName &&
    !!a.classList?.contains('qc-checklist') === !!b.classList?.contains('qc-checklist');
  [...root.children].forEach(list => {
    if (!list.isConnected || !/^(UL|OL)$/.test(list.tagName || '')) return;
    let next = list.nextElementSibling;
    while (sameKind(list, next)) {
      const dead = next;
      next = next.nextElementSibling;
      while (dead.firstChild) list.appendChild(dead.firstChild);
      dead.remove();
    }
  });
  // 旧数据迁移：伪元素版复选列表（li 内无 .qc-box）补插真实圆点元素
  root.querySelectorAll('ul.qc-checklist > li').forEach(li => {
    if (!li.querySelector(':scope > .qc-box')) {
      li.insertAdjacentHTML('afterbegin', '<span class="qc-box" contenteditable="false"></span>');
    }
  });
}

export default function QuickCapture({ onSaved, onUpdated, onManageTags, autoFocus = true, placeholder, bare, edit, tags }) {
  const toast = useToast();
  const editorRef = useRef(null);
  const tagPopRef = useRef(null);  // 标签浮层容器（含触发按钮），用于判定「点击外部」
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
      normalizeListsIn(editorRef.current); // 修复历史数据里已存在的碎片复选列表
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

  // 标签浮层：点击浮层外任意处（失焦）或按 Esc 关闭；关闭时自动保存
  useEffect(() => {
    if (!showTags) return;
    const onDocDown = (e) => { if (!tagPopRef.current?.contains(e.target)) closeTagPop(); };
    const onKey = (e) => { if (e.key === 'Escape') closeTagPop(); };
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [showTags]);

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

  // ===== 列表块类型转换（飞书/ProseMirror 同构语义，无序/有序/复选框三个按钮共用） =====
  // 全部纯 DOM 操作：execCommand('insert*List') 只换列表标签，不清理复选框的
  // data-checked / .qc-box（转换后序号+圆点残缺同显），对自定义结构不可靠，已弃用。
  //  · 光标折叠在列表内 → 整个列表受影响（光标在 li 内点任一列表按钮 = 整表转换，飞书行为）
  //  · 光标折叠在普通块 → 整块转（行内格式保留）
  //  · 有选区 → 选区覆盖的每个块（列表项粒度）各自转换，未选中的项留在原列表里、顺序不变
  //  · toggle 语义：受影响块全部已是目标类型 → 转回普通段落（div），否则全部转为目标类型
  //  · 空编辑器/无块上下文 → 插入一个空的目标列表项
  function applyListType(target) { // target: 'ul' | 'ol' | 'checklist'
    const ed = editorRef.current;
    if (!ed) return;
    ed.focus();
    wrapRootText(ed); // 根级裸文本先包成 div，保证后续操作的都是元素块
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const nodeToEl = n => (n ? (n.nodeType === 3 ? n.parentElement : n) : null);
    const closestBlock = n => {
      const b = nodeToEl(n)?.closest?.('p,h1,h2,h3,h4,li,blockquote,div');
      return b && b !== ed && ed.contains(b) ? b : null;
    };

    let blocks;
    if (range.collapsed) {
      const block = closestBlock(range.startContainer);
      if (!block) { insertEmptyListItem(ed, range, target); touch(); return; }
      blocks = block.tagName === 'LI' ? [...block.parentElement.children] : [block];
    } else {
      blocks = selectedBlocks(ed, range);
      if (blocks.length === 0) {
        const block = closestBlock(range.startContainer);
        if (!block) { insertEmptyListItem(ed, range, target); touch(); return; }
        blocks = [block]; // 选区未覆盖任何块（同块内部分文字）→ 整块转
      }
    }

    const toParagraph = blocks.every(b => blockListType(b) === target);
    const lastNew = convertBlocks(ed, blocks, toParagraph ? null : target);
    if (lastNew) focusBlockEnd(lastNew);
    touch();
  }

  // 根级裸文本包一层 div（contenteditable 根下的裸文本没有块容器，统一成 div 块）
  function wrapRootText(ed) {
    [...ed.childNodes].forEach(n => {
      if (n.nodeType === 3 && n.textContent.trim()) {
        const div = document.createElement('div');
        n.replaceWith(div);
        div.appendChild(n);
      }
    });
  }

  // 空编辑器/无块上下文 → 光标处插入一个空的目标列表项
  function insertEmptyListItem(ed, range, target) {
    const list = document.createElement(target === 'checklist' ? 'ul' : target);
    if (target === 'checklist') list.className = 'qc-checklist';
    const li = document.createElement('li');
    if (target === 'checklist') {
      li.setAttribute('data-checked', 'false');
      li.innerHTML = '<span class="qc-box" contenteditable="false"></span><br>';
    } else {
      li.innerHTML = '<br>';
    }
    list.appendChild(li);
    range.deleteContents();
    range.insertNode(list);
    normalizeListsIn(ed);
    focusBlockEnd(li);
  }

  // blocks → 替换节点：目标段落（null）每块一个 div；目标列表整 run 一个列表、每块一个 li。
  // 行内格式保留；复选框圆点元素剔除（目标为复选列表时按原勾选态重新生成）
  function buildListNodes(blocks, target) {
    const cleanHTML = b => {
      const t = document.createElement('div');
      t.innerHTML = b.innerHTML || '';
      t.querySelectorAll('.qc-box').forEach(x => x.remove());
      return t.innerHTML.trim();
    };
    if (!target) {
      return blocks.map(b => {
        const div = document.createElement('div');
        div.innerHTML = cleanHTML(b) || '<br>';
        return div;
      });
    }
    const list = document.createElement(target === 'checklist' ? 'ul' : target);
    if (target === 'checklist') list.className = 'qc-checklist';
    blocks.forEach(b => {
      const li = document.createElement('li');
      const inner = cleanHTML(b) || '<br>';
      if (target === 'checklist') {
        const keep = blockListType(b) === 'checklist' ? (b.getAttribute('data-checked') || 'false') : 'false';
        li.setAttribute('data-checked', keep);
        li.innerHTML = `<span class="qc-box" contenteditable="false"></span>${inner}`;
      } else {
        li.innerHTML = inner;
      }
      list.appendChild(li);
    });
    return [list];
  }

  // 列表内 [i, j) 的 li 被 nodes 替换；i==0 且 j==末尾 → 整表替换，
  // 否则先把头部/尾部未受影响的 li 拆到同类型克隆列表里，保证它们留在
  // 原类型列表中且相对顺序不变（框选列表中间几项转类型时不断裂、不乱序）
  function spliceList(list, i, j, nodes) {
    const kids = [...list.children];
    if (i === 0 && j >= kids.length) {
      list.replaceWith(...nodes);
      return;
    }
    if (j < kids.length) {
      const tail = list.cloneNode(false);
      kids.slice(j).forEach(li => tail.appendChild(li));
      list.after(tail);
    }
    if (i > 0) {
      const lead = list.cloneNode(false);
      kids.slice(0, i).forEach(li => lead.appendChild(li));
      list.before(lead);
    }
    list.replaceWith(...nodes);
  }

  // 把 blocks 转成目标类型：连续相邻且同父的块合为一个 run，整 run 一次替换；
  // run 在列表内 → spliceList 拆分保序；run 在根级 → 原位替换。
  // 相邻同类列表最后由 normalizeListsIn 合并，保证转换结果是连续的一个列表
  function convertBlocks(ed, blocks, target) {
    const runs = [];
    blocks.forEach(b => {
      const prev = runs[runs.length - 1];
      if (prev && prev.parent === b.parentElement && prev.blocks[prev.blocks.length - 1].nextSibling === b) {
        prev.blocks.push(b);
      } else {
        runs.push({ parent: b.parentElement, blocks: [b] });
      }
    });

    let lastNew = null;
    runs.forEach(run => {
      const nodes = buildListNodes(run.blocks, target);
      lastNew = nodes[nodes.length - 1];
      const parent = run.parent;
      if (parent && /^(UL|OL)$/.test(parent.tagName || '')) {
        const idx = [...parent.children].indexOf(run.blocks[0]);
        spliceList(parent, idx, idx + run.blocks.length, nodes);
      } else {
        run.blocks[0].before(...nodes);
        run.blocks.forEach(b => b.remove());
      }
    });
    normalizeListsIn(ed);
    return lastNew;
  }

  // 光标落到块末（列表节点取最后一个 li；复选项的圆点 contenteditable=false 不可入）
  function focusBlockEnd(el) {
    if (!el || !el.isConnected) return;
    const t = /^(UL|OL)$/.test(el.tagName) ? (el.querySelector(':scope > li:last-of-type') || el) : el;
    const sel = window.getSelection();
    const r = document.createRange();
    r.selectNodeContents(t);
    r.collapse(false);
    sel.removeAllRanges();
    sel.addRange(r);
  }

  // 点击圆点元素本体 → 切换勾选态（真实元素命中，不再依赖坐标区间判定）
  function onEditorClick(e) {
    const box = e.target?.closest?.('.qc-box');
    if (!box) return;
    const li = box.closest('ul.qc-checklist > li');
    if (!li) return;
    e.preventDefault();
    li.setAttribute('data-checked', li.getAttribute('data-checked') === 'true' ? 'false' : 'true');
    touch();
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
      flash('已保存');
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
      return;
    }
    // 复选列表内回车：拦截浏览器克隆（会把 data-checked=true 传染给新行），
    // 有内容 → 新增未勾选复选行；空行 → 跳出列表转普通行（飞书/Notion 同款行为）
    if (e.key === 'Enter' && !e.shiftKey) {
      const sel = window.getSelection();
      const li = sel?.anchorNode
        ? (sel.anchorNode.nodeType === 3 ? sel.anchorNode.parentElement : sel.anchorNode)?.closest?.('ul.qc-checklist > li')
        : null;
      if (!li) return;
      e.preventDefault();
      if (!li.textContent.trim()) {
        // 空复选行回车 → 跳出列表
        const ul = li.closest('ul.qc-checklist');
        const div = document.createElement('div');
        div.innerHTML = '<br>';
        if (ul) {
          if (ul.children.length === 1) ul.replaceWith(div);
          else { li.remove(); ul.after(div); }
        }
        const r = document.createRange();
        r.selectNodeContents(div);
        r.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r);
      } else {
        // 有内容 → 续未勾选新行；光标后的内容拆到新行（中间回车语义，飞书/Notion 同款）
        const r2 = document.createRange();
        r2.setStart(sel.anchorNode, sel.anchorOffset);
        r2.setEnd(li, li.childNodes.length);
        const frag = r2.extractContents();
        const t = document.createElement('div');
        t.appendChild(frag);
        t.querySelectorAll('.qc-box').forEach(x => x.remove());
        if (!li.innerHTML.trim()) li.innerHTML = '<span class="qc-box" contenteditable="false"></span><br>';
        const nl = document.createElement('li');
        nl.setAttribute('data-checked', 'false');
        nl.innerHTML = `<span class="qc-box" contenteditable="false"></span>${t.innerHTML.trim() || '<br>'}`;
        li.after(nl);
        const r = document.createRange();
        r.setStart(nl, 1); // childNodes[0]=圆点(不可入)，1=文本起点
        r.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r);
      }
      touch();
      return;
    }
    // 复选列表内退格：拦截浏览器默认行为。圆点是 contenteditable=false 的独立元素
    // （CSS user-modify: read-only），空复选行按退格浏览器不会删它 → 表现为「点删除没反应」。
    // 光标落在圆点之后的行首时，把该行「退出列表」成普通行：复选框就地消失，文本保留。
    // 该行是列表首项 → 整个列表外壳被普通行顶替；位于列表中部 → 拆成前后两段仍连续
    if (e.key === 'Backspace' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const sel = window.getSelection();
      if (!sel?.anchorNode) return;
      const node = sel.anchorNode.nodeType === 3 ? sel.anchorNode.parentElement : sel.anchorNode;
      const li = node?.closest?.('ul.qc-checklist > li');
      const box = li?.querySelector(':scope > .qc-box');
      if (!box) return;
      // 只在「行首」接管：圆点之后到光标之间没有字符时才算行首，否则交给浏览器正常删字
      let atLineStart = false;
      try {
        const r = document.createRange();
        r.setStartAfter(box);
        r.setEnd(sel.anchorNode, sel.anchorOffset);
        atLineStart = r.toString() === '';
      } catch { /* 光标落在圆点之前：range 非法，不接管 */ }
      if (!atLineStart) return;
      e.preventDefault();
      const ul = li.parentElement;
      const plain = document.createElement('div');
      const clone = li.cloneNode(true);
      clone.querySelectorAll('.qc-box').forEach(x => x.remove());
      plain.innerHTML = clone.innerHTML.trim() || '<br>';
      const items = [...ul.children];
      const idx = items.indexOf(li);
      const head = items.slice(0, idx);          // 本行之前的项：留在原列表
      const tail = items.slice(idx + 1);         // 本行之后的项：移入新列表，保持列表连续
      let ulTail = null;
      if (tail.length) {
        ulTail = document.createElement('ul');
        ulTail.className = 'qc-checklist';
        tail.forEach(n => ulTail.appendChild(n));
      }
      li.remove();
      if (head.length) ul.after(plain); else ul.replaceWith(plain);
      if (ulTail) plain.after(ulTail);
      const r = document.createRange();
      r.selectNodeContents(plain);
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
      touch();
    }
  }

  // 可选标签（父级下发，新建/管理统一走「管理标签」面板）
  const tagList = tags || [];
  // 已勾选标签（底栏回显，按勾选顺序；标签被删则自动剔除）
  const selectedTags = tagIds.map(id => tagList.find(t => Number(t.id) === id)).filter(Boolean);

  function toggleTag(id) {
    const n = Number(id);
    setTagIds(prev => (prev.includes(n) ? prev.filter(x => x !== n) : [...prev, n]));
    scheduleAutosave();
  }

  // 关闭标签浮层：失焦点击任意处即自动保存
  function closeTagPop() {
    setShowTags(false);
    if (autoTimer.current) { clearTimeout(autoTimer.current); autoTimer.current = null; }
    autosaveRef.current?.();
  }

  // 标签浮层：勾选式列表（多选），点浮层外任意处关闭并自动保存
  const tagPopover = (
    <div
      className="absolute left-0 top-full mt-1.5 z-50 w-[236px] rounded-xl p-1.5 border border-ink-100/80"
      style={{ background: 'var(--surface-card)', boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}
    >
      <div className="px-1.5 pb-1 pt-0.5 text-[11px] font-semibold text-ink-400">
        选择标签{tagIds.length > 0 ? `（已选 ${tagIds.length}）` : ''}
      </div>
      <div className="max-h-[240px] overflow-y-auto nice-scroll">
        {tagList.map(t => {
          const on = tagIds.includes(Number(t.id));
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => toggleTag(t.id)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-[13px] hover:bg-ink-50 transition-colors"
            >
              <span className="w-[8px] h-[8px] rounded-full flex-shrink-0" style={{ background: t.color }} />
              <span
                className="flex-1 min-w-0 truncate"
                style={{ color: on ? 'var(--text-1)' : 'var(--text-muted)', fontWeight: on ? 600 : 400 }}
              >{t.name}</span>
              <span
                className={`tag-check ${on ? 'on' : ''}`}
                style={on ? { background: t.color, borderColor: t.color } : undefined}
              />
            </button>
          );
        })}
        {tagList.length === 0 && (
          <div className="px-2 py-2 text-[12px] text-ink-400">暂无标签</div>
        )}
      </div>
      <button
        type="button"
        onClick={() => { setShowTags(false); onManageTags?.(); }}
        className="w-full flex items-center gap-1.5 px-2 py-1.5 mt-1 rounded-md text-[12px] text-ink-500 border-t border-ink-100/70 hover:text-ink-700 transition-colors"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
        管理标签
      </button>
    </div>
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
      {/* 标签按钮（工具栏左侧）：点击展开勾选浮层 */}
      <span ref={tagPopRef} className="relative flex items-center">
        <button
          type="button"
          onClick={() => setShowTags(s => !s)}
          title="标签"
          className={`h-7 px-2 rounded-md flex items-center gap-1 text-[12px] font-medium transition-colors ${
            showTags
              ? 'bg-[rgba(var(--s-rgb),0.15)] text-[var(--s-main)]'
              : tagIds.length
                ? 'bg-[rgba(var(--s-rgb),0.1)] text-[var(--s-main)] hover:bg-[rgba(var(--s-rgb),0.15)]'
                : 'text-ink-500 hover:bg-black/5 hover:text-ink-800'
          }`}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.6 13.4 12 22l-9-9V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z"/><circle cx="7.5" cy="7.5" r="1.2" fill="currentColor" stroke="none"/></svg>
          标签{tagIds.length > 0 ? ` ${tagIds.length}` : ''}
        </button>
        {showTags && tagPopover}
      </span>
      <div className="w-px h-4 bg-ink-200 mx-1" />
      <ToolbarBtn title="标题1" onClick={() => exec('formatBlock', 'H1')}><span className="font-bold text-[13px]">H1</span></ToolbarBtn>
      <ToolbarBtn title="标题2" onClick={() => exec('formatBlock', 'H2')}><span className="font-bold text-[12px]">H2</span></ToolbarBtn>
      <ToolbarBtn title="正文" onClick={() => exec('formatBlock', 'P')}><span className="text-[12px]">正文</span></ToolbarBtn>
      <div className="w-px h-4 bg-ink-200 mx-1" />
      <ToolbarBtn title="加粗 (Ctrl+B)" onClick={() => exec('bold')}><span className="font-bold">B</span></ToolbarBtn>
      <ToolbarBtn title="斜体 (Ctrl+I)" onClick={() => exec('italic')}><span className="italic">I</span></ToolbarBtn>
      <div className="w-px h-4 bg-ink-200 mx-1" />
      <ToolbarBtn title="无序列表" onClick={() => applyListType('ul')}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3.5" cy="6" r="1.2" fill="currentColor" stroke="none"/><circle cx="3.5" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="3.5" cy="18" r="1.2" fill="currentColor" stroke="none"/></svg>
      </ToolbarBtn>
      <ToolbarBtn title="有序列表" onClick={() => applyListType('ol')}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><path d="M4 6h1v4" strokeLinejoin="round"/><path d="M4 10h2" /><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" /></svg>
      </ToolbarBtn>
      <ToolbarBtn title="复选框列表" onClick={() => applyListType('checklist')}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8.5"/><polyline points="8.4 12.3 11 14.9 15.6 9.9"/></svg>
      </ToolbarBtn>
      <div className="w-px h-4 bg-ink-200 mx-1" />
      <ToolbarBtn title="清除格式" onClick={() => exec('removeFormat')}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/></svg>
      </ToolbarBtn>
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
        <div className="mt-auto pt-3 border-t border-ink-100/80 flex items-center gap-1.5 flex-wrap">
          {selectedTags.map(t => (
            <span key={t.id} className="flex items-center gap-1 h-[20px] pl-1.5 pr-2 rounded-md text-[11.5px] font-medium whitespace-nowrap"
              style={{ background: hexToRgba(t.color, 0.13), color: t.color }}>
              <span className="w-[5px] h-[5px] rounded-full" style={{ background: t.color }} />
              {t.name}
            </span>
          ))}
          <div className="flex-1" />
          {flashMsg && <span className="text-[12px] text-[color:var(--s-main)] font-medium inline-flex items-center gap-1"><TickIcon />{flashMsg}</span>}
          {!flashMsg && savedAt && <span className="text-[11px] text-ink-400">{fmtSavedTime(savedAt)}</span>}
          <button
            onClick={save}
            disabled={busy || !getPlainText()}
            title="保存（Ctrl+S）"
            className="text-[12.5px] font-semibold px-3.5 py-1.5 rounded-lg transition-all disabled:opacity-40"
            style={{ background: 'var(--s-main)', color: 'var(--surface-card)', boxShadow: '0 2px 6px rgba(var(--s-rgb),0.25)' }}
          >{busy ? '保存中…' : '保存'}</button>
        </div>
      ) : (
        <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
          {selectedTags.map(t => (
            <span key={t.id} className="flex items-center gap-1 h-[20px] pl-1.5 pr-2 rounded-md text-[11.5px] font-medium whitespace-nowrap"
              style={{ background: hexToRgba(t.color, 0.13), color: t.color }}>
              <span className="w-[5px] h-[5px] rounded-full" style={{ background: t.color }} />
              {t.name}
            </span>
          ))}
          <div className="flex-1" />
          {flashMsg && <span className="text-[12px] text-[color:var(--s-main)] font-medium inline-flex items-center gap-1"><TickIcon />{flashMsg}</span>}
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
