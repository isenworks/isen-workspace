import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  getKBBooks, getKBEntries, getKBTree, getKBDocs,
  addKBBook, updateKBBook, removeKBBook, ensureKBBooks,
  addKBEntry, removeKBEntry, updateKBEntry, renameKBGroup, removeKBGroup, addKBGroup, reorderKBDoc, setKBGroupOrder,
  syncKBFromCloud,
} from '../utils/aiKnowledgeBase.js';
import KnowledgeBookForm from '../components/KnowledgeBookForm.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import SearchPopover from '../components/SearchPopover.jsx';
import {
  IconPlus, IconPen, IconLink, IconImport, IconBook, IconMarkdown,
  IconFolder, IconFile, IconTrash, IconX, IconDots, IconArrowUpRight,
} from '../components/aiIcons.jsx';
import { useSplitRatio, SplitDivider } from '../components/useSplitRatio.jsx';

/* 知识库页面 · 三级结构（知识库书架 → 目录 → 正文）
   · 外层一张大卡片，内部分左右两张白卡（左：知识库；右：目录 + 正文）
   · 右卡内用一条居中的短灰线分隔「目录」与「正文」
   · 目录支持章节分组，文档可拖拽排序 / 跨组移动 */

// 来源元数据（图标 + 名称）
const SOURCE_META = {
  manual: { icon: IconPen, label: '手动' },
  feishu: { icon: IconImport, label: '飞书' },
  web: { icon: IconLink, label: '网页' },
};

// 十六进制色 → rgba（用于知识库主题色的各级透明底）
function tint(hex, alpha) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  if (Number.isNaN(n)) return `rgba(15,31,28,${alpha})`;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

function stripHtml(html) {
  if (!html) return '';
  try {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return (tmp.innerText || tmp.textContent || '').replace(/\s+/g, ' ').trim();
  } catch {
    return String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
}

function fmtDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  if (sameDay) return '今天';
  const p = n => String(n).padStart(2, '0');
  const y = d.getFullYear() === now.getFullYear() ? '' : `${d.getFullYear()}-`;
  return `${y}${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// 已保存时间（与小记一致：今天 HH:MM、昨天带「昨天」、更早带日期+时间）
function fmtSavedTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const p = n => String(n).padStart(2, '0');
  const sameDay = a => a.getFullYear() === now.getFullYear() && a.getMonth() === now.getMonth() && a.getDate() === now.getDate();
  if (sameDay(d)) return `${p(d.getHours())}:${p(d.getMinutes())}`;
  const y = new Date(now); y.setDate(y.getDate() - 1);
  if (sameDay(y)) return `昨天 ${p(d.getHours())}:${p(d.getMinutes())}`;
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// 极简 Markdown → HTML（导入 .md 用）：标题 / 粗斜体 / 行内码 / 列表 / 引用 / 分割线 / 链接 / 代码块
function mdToHtml(md) {
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = t => esc(t)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');

  const out = [];
  let list = null;       // 'ul' | 'ol'
  let inCode = false;
  let codeBuf = [];
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  const flushCode = () => { out.push(`<pre><code>${esc(codeBuf.join('\n'))}</code></pre>`); codeBuf = []; };

  for (const raw of String(md).replace(/\r\n?/g, '\n').split('\n')) {
    if (/^```/.test(raw.trim())) {
      if (inCode) { flushCode(); inCode = false; } else { closeList(); inCode = true; }
      continue;
    }
    if (inCode) { codeBuf.push(raw); continue; }

    const t = raw.trim();
    if (!t) { closeList(); continue; }
    let m;
    if ((m = /^(#{1,3})\s+(.*)$/.exec(t))) {
      closeList(); const lv = m[1].length; out.push(`<h${lv}>${inline(m[2])}</h${lv}>`); continue;
    }
    if (/^(-{3,}|\*{3,})$/.test(t)) { closeList(); out.push('<hr>'); continue; }
    if (/^>\s?/.test(t)) { closeList(); out.push(`<blockquote>${inline(t.replace(/^>\s?/, ''))}</blockquote>`); continue; }
    if ((m = /^[-*+]\s+(.*)$/.exec(t))) {
      if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul'; }
      out.push(`<li>${inline(m[1])}</li>`); continue;
    }
    if ((m = /^\d+[.)]\s+(.*)$/.exec(t))) {
      if (list !== 'ol') { closeList(); out.push('<ol>'); list = 'ol'; }
      out.push(`<li>${inline(m[1])}</li>`); continue;
    }
    closeList(); out.push(`<p>${inline(t)}</p>`);
  }
  closeList();
  if (inCode && codeBuf.length) flushCode();
  return out.join('');
}

// 内联输入（新建 / 重命名）：Enter 提交、Esc / 失焦取消
function InlineInput({ defaultValue = '', placeholder, onCommit, onCancel }) {
  const [v, setV] = useState(defaultValue);
  const ref = useRef(null);
  const done = useRef(false);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  const commit = () => {
    if (done.current) return;
    done.current = true;
    const t = v.trim();
    if (t) onCommit(t); else onCancel();
  };
  const cancel = () => { if (done.current) return; done.current = true; onCancel(); };
  return (
    <input
      ref={ref}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') cancel(); }}
      onBlur={commit}
      placeholder={placeholder}
      className="w-full px-2 py-1 rounded-md text-[12.5px] bg-white border border-ink-200 focus:border-[var(--s-main)] focus:outline-none transition-colors"
    />
  );
}

// 格式工具栏按钮：onMouseDown 阻止默认行为，避免点击时编辑区失焦（复用小记交互）
function ToolBtn({ active, onClick, title, children }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      title={title}
      className={`w-7 h-7 rounded-md flex items-center justify-center text-[13px] transition-colors ${
        active ? 'bg-[rgba(var(--s-rgb),0.15)] text-[var(--s-main)]' : 'text-ink-500 hover:bg-black/5 hover:text-ink-800'
      }`}
    >{children}</button>
  );
}

export default function KnowledgeBasePage() {
  const [books, setBooks] = useState([]);
  const [entries, setEntries] = useState([]);
  const [activeKbId, setActiveKbId] = useState(null);
  const [selectedDocId, setSelectedDocId] = useState(null);
  const [tick, setTick] = useState(0);

  // 左右分栏（书架 | 目录 + 正文）：可拖拽调宽，双击分隔条恢复默认
  const split = useSplitRatio('kb_split_ratio', { min: 0.2, max: 0.45, def: 0.28, maxWidth: 460 });
  const { leftStyle, rightStyle, bindRoot, bindDivider } = split;

  // 弹窗 / 浮层
  const [confirmRemoveDoc, setConfirmRemoveDoc] = useState(null);
  const [confirmRemoveBook, setConfirmRemoveBook] = useState(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');

  // 内联编辑状态
  const [bookFormOpen, setBookFormOpen] = useState(false);
  const [editingBook, setEditingBook] = useState(null);
  const [newGroup, setNewGroup] = useState(false);
  const [renamingGroup, setRenamingGroup] = useState(null);

  // 目录顶部「＋新建」浮层 / 正文标题「⋯」菜单
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [docMenuOpen, setDocMenuOpen] = useState(false);

  // 导入 Markdown 的文件选择器
  const mdInputRef = useRef(null);

  // 拖拽排序（文档 + 分组）
  const [dragId, setDragId] = useState(null);
  const [dragGroup, setDragGroup] = useState(null);
  const [dropHint, setDropHint] = useState(null); // { type:'doc'|'group'|'groupSort', key }

  // 正文 / 标题 · 直接点击编辑（输入防抖自动保存 + 失焦 / 切换文档 / 关闭页面兜底）
  const titleRef = useRef(null);
  const contentRef = useRef(null);
  const [savedFlash, setSavedFlash] = useState('');
  const [dirty, setDirty] = useState(false);       // 正文是否有未保存改动
  const [charCount, setCharCount] = useState(0);   // 正文字数
  const saveHintTimer = useRef(null);
  const autosaveTimer = useRef(null);              // 输入防抖自动保存定时器
  const editingDocIdRef = useRef(null);            // 当前编辑中的文档 id（同步值，兜底保存用）
  const draftRef = useRef(null);                   // 最近一次输入 { id, title, content }
  useEffect(() => () => {
    if (saveHintTimer.current) clearTimeout(saveHintTimer.current);
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
  }, []);

  const flashSaved = () => {
    setSavedFlash('✓ 已保存');
    if (saveHintTimer.current) clearTimeout(saveHintTimer.current);
    saveHintTimer.current = setTimeout(() => setSavedFlash(''), 1500);
  };

  // 富文本格式操作（保留编辑器焦点，避免失焦保存打断）
  const exec = (cmd, val) => {
    contentRef.current?.focus();
    try { document.execCommand(cmd, false, val); } catch { /* ignore */ }
    setDirty(true);
    captureDraft();
    scheduleAutosave();
  };

  const reload = useCallback(() => {
    const bs = getKBBooks();
    setBooks(bs);
    setEntries(getKBEntries());
    setActiveKbId(prev => (prev && bs.some(b => b.id === prev) ? prev : (bs[0]?.id || null)));
    setTick(t => t + 1);
  }, []);

  // 把一条草稿落到 localStorage（纯数据操作、不依赖 DOM，切换 / 关闭时也能兜底）
  const persistEntry = useCallback((id, title, html) => {
    if (!id) return null;
    const entry = getKBEntries().find(e => e.id === id);
    if (!entry) return null;
    const content = stripHtml(html) ? (html || '') : ''; // 空内容归一为空串，避免存入空标签
    const t = (title || '').replace(/\s+/g, ' ').trim() || '无标题';
    const patch = {};
    if (t !== (entry.title || '')) patch.title = t;
    if (content !== (entry.content || '')) patch.content = content;
    let changed = Object.keys(patch).length > 0;
    if (changed) updateKBEntry(id, patch);
    // 未命名笔记：用正文首行补标题（与旧新建弹窗一致的行为）
    let finalTitle = patch.title !== undefined ? patch.title : entry.title;
    if ((!finalTitle || finalTitle === '无标题') && content) {
      const first = stripHtml(content).trim().slice(0, 30);
      if (first) { updateKBEntry(id, { title: first }); finalTitle = first; changed = true; }
    }
    return { changed, finalTitle };
  }, []);

  // 落库草稿：自动保存 / 失焦 / 切换文档 / 关闭页面 的统一入口；quiet=true 不动 UI（离开时用）
  const commitDraft = useCallback((quiet = false) => {
    const d = draftRef.current;
    if (!d?.id) return;
    draftRef.current = null;
    const r = persistEntry(d.id, d.title, d.content);
    if (!r?.changed) return;
    if (d.id === editingDocIdRef.current && titleRef.current) titleRef.current.innerText = r.finalTitle;
    if (!quiet) { setDirty(false); reload(); flashSaved(); }
  }, [persistEntry, reload]);
  const commitDraftRef = useRef(commitDraft);
  commitDraftRef.current = commitDraft;

  // 输入防抖：停止输入 1.2s 后自动保存
  const scheduleAutosave = () => {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => { autosaveTimer.current = null; commitDraftRef.current?.(); }, 1200);
  };

  // 记录草稿（标题 / 正文任一改动都更新；切换或关闭时用它兜底）
  const captureDraft = () => {
    draftRef.current = {
      id: editingDocIdRef.current,
      title: titleRef.current?.innerText || '',
      content: contentRef.current?.innerHTML || '',
    };
  };

  // 关闭 / 刷新页面时兜底保存（localStorage 同步写，能赶上）
  useEffect(() => {
    const onLeave = () => commitDraftRef.current?.(true);
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, []);

  // 组件卸载时兜底保存
  useEffect(() => () => { commitDraftRef.current?.(true); }, []);

  // 加载 + 云端同步 + 旧数据迁移
  useEffect(() => {
    ensureKBBooks();
    reload();
    syncKBFromCloud().then(() => { ensureKBBooks(); reload(); });
  }, [reload]);

  // 切换知识库时，自动选中该库首篇文档
  useEffect(() => {
    if (!activeKbId) { setSelectedDocId(null); return; }
    const docs = getKBDocs(activeKbId);
    setSelectedDocId(prev => (docs.some(d => d.id === prev) ? prev : (docs[0]?.id ?? null)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKbId, tick]);

  const tree = useMemo(
    () => (activeKbId ? getKBTree(activeKbId) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeKbId, tick],
  );

  // 搜索弹窗数据源：全部知识库的文档（标题 / 正文 / 标签），meta 显示所属知识库
  const searchItems = useMemo(() => {
    const nameOf = new Map(books.map(b => [b.id, b.name]));
    return entries
      .slice()
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .map(e => ({
        id: e.id,
        title: e.title || '未命名文档',
        meta: nameOf.get(e.kbId) || '',
        kbId: e.kbId,
        hay: `${e.title || ''} ${String(e.content || '').replace(/<[^>]+>/g, ' ')} ${(e.tags || []).join(' ')}`.toLowerCase(),
      }));
  }, [entries, books]);

  const bookStats = useMemo(() => {
    const m = new Map();
    for (const e of entries) {
      const s = m.get(e.kbId) || { count: 0, updatedAt: 0 };
      s.count++;
      s.updatedAt = Math.max(s.updatedAt, e.updatedAt || 0);
      m.set(e.kbId, s);
    }
    return m;
  }, [entries]);

  const activeBook = books.find(b => b.id === activeKbId) || null;
  const selectedDoc = useMemo(() => entries.find(e => e.id === selectedDocId) || null, [entries, selectedDocId]);

  // 无自建分组时平铺文档（不显示「未分组」标题）；有分组时才按章节分组展示
  const flatDocs = (tree.length === 1 && tree[0].group === '') ? tree[0].docs : null;

  // 标题 / 正文：切换文档前先把上一篇落库，再同步新文档内容到 DOM
  useEffect(() => {
    commitDraftRef.current?.();   // 保存上一篇（草稿基于 ref，不依赖 DOM，切换不丢）
    if (autosaveTimer.current) { clearTimeout(autosaveTimer.current); autosaveTimer.current = null; }
    editingDocIdRef.current = selectedDocId;
    if (titleRef.current) titleRef.current.innerText = selectedDoc?.title || '无标题';
    if (contentRef.current) contentRef.current.innerHTML = selectedDoc?.content || '';
    setDirty(false);
    setCharCount(stripHtml(selectedDoc?.content || '').length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDoc?.id]);

  // 选中标题全文（「重命名」菜单用）
  const focusTitle = () => {
    const el = titleRef.current;
    if (!el) return;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  };

  /* ---------------- 知识库（书架） ---------------- */
  const selectBook = (id) => {
    if (id === activeKbId) return;
    setActiveKbId(id);
    setNewGroup(false);
    setRenamingGroup(null);
  };

  // 搜索弹窗选中：切到该文档所属知识库并选中它
  const handleSearchPick = (docId) => {
    const target = entries.find(e => e.id === docId);
    if (!target) return;
    if (target.kbId !== activeKbId) setActiveKbId(target.kbId);
    setSelectedDocId(docId);
  };

  const createBook = (data) => {
    const book = addKBBook(data);
    reload();
    setActiveKbId(book.id);
  };

  // 新建 / 编辑知识库：编辑时走 updateKBBook
  const saveBook = (data) => {
    if (editingBook) {
      updateKBBook(editingBook.id, data);
      reload();
    } else {
      createBook(data);
    }
    setEditingBook(null);
  };

  const openCreateBook = () => { setEditingBook(null); setBookFormOpen(true); };

  /* ---------------- 文档 ---------------- */
  // 新建笔记：直接在当前分组落一篇空文档，右侧进入编辑态（标题区/正文可直接写）
  const createNote = (group = '') => {
    if (!activeKbId) return;
    const doc = addKBEntry({ title: '', content: '', source: 'manual', sourceUrl: '', tags: [], kbId: activeKbId, group });
    reload();
    setSelectedDocId(doc.id);
    // 等正文区挂载后聚焦，用户可直接输入
    setTimeout(() => contentRef.current?.focus(), 0);
  };

  // 粘贴链接：生成一篇「网页」来源的书签笔记
  const submitLink = () => {
    const raw = linkUrl.trim();
    if (!raw || !activeKbId) return;
    const full = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    let host = full;
    try { host = new URL(full).hostname.replace(/^www\./, '') || full; } catch { /* 非法 URL 时保留原文 */ }
    const doc = addKBEntry({
      title: host,
      content: `<p><a href="${full}" target="_blank" rel="noreferrer">${full}</a></p>`,
      source: 'web',
      sourceUrl: full,
      tags: [],
      kbId: activeKbId,
      group: selectedDoc?.group || '',
    });
    setLinkUrl('');
    setLinkOpen(false);
    reload();
    setSelectedDocId(doc.id);
  };

  // 导入 Markdown：读本地 .md，转成富文本存入当前分组
  const importMarkdown = (file) => {
    if (!file || !activeKbId) return;
    const reader = new FileReader();
    reader.onload = () => {
      const doc = addKBEntry({
        title: file.name.replace(/\.(md|markdown|txt)$/i, ''),
        content: mdToHtml(reader.result),
        source: 'manual',
        sourceUrl: '',
        tags: [],
        kbId: activeKbId,
        group: selectedDoc?.group || '',
      });
      reload();
      setSelectedDocId(doc.id);
    };
    reader.readAsText(file);
  };

  /* ---------------- 拖拽排序 ---------------- */
  const handleDrop = (payload) => {
    if (!dragId) return;
    reorderKBDoc(activeKbId, dragId, payload);
    setDragId(null);
    setDropHint(null);
    reload();
  };

  // 分组排序：把 dragGroup 移到目标分组之前
  const handleGroupDrop = (targetGroup) => {
    const from = dragGroup;
    setDragGroup(null);
    setDropHint(null);
    if (!from || from === targetGroup) return;
    const names = tree.map(t => t.group).filter(g => g !== '');
    const fi = names.indexOf(from);
    const ti = names.indexOf(targetGroup);
    if (fi === -1 || ti === -1) return;
    names.splice(ti, 0, names.splice(fi, 1)[0]);
    setKBGroupOrder(activeKbId, names);
    reload();
  };

  return (
    <div className="flex-1 min-w-0 w-full flex flex-col gap-3">
      {/* 主体：左书架卡 + 右（目录 + 正文）卡，中间可拖拽调宽 */}
      <div {...bindRoot} className="split-root flex-1 min-h-0 flex items-stretch">
          {/* ---- 左：页头 + 知识库书架 ---- */}
          <div className="glass-card rounded-2xl min-w-0 flex flex-col min-h-0 p-3" style={leftStyle}>
            {/* 页头：色条 + 标题 + 计数 + 搜索 / 新建 */}
            <div className="flex items-center gap-2.5 px-1 pt-0.5 pb-2.5 flex-shrink-0">
              <span className="w-[5px] h-[20px] rounded-full flex-shrink-0 self-center" style={{ background: 'var(--s-grad-bg)' }} />
              <span className="text-[15.5px] font-bold text-ink-900 leading-none flex-shrink-0">知识库</span>
              <span className="text-[11px] text-ink-300 tabular-nums flex-shrink-0">{books.length}</span>
              <div className="flex-1" />
              <SearchPopover
                results={searchItems}
                onPick={handleSearchPick}
                placeholder="搜索标题 / 正文 / 标签"
                emptyText="没有匹配的文档"
              />
              <button
                onClick={() => { openCreateBook(); }}
                className="w-[24px] h-[24px] rounded-lg flex items-center justify-center flex-shrink-0 text-white transition-all hover:scale-105 active:scale-95"
                style={{ background: 'var(--s-grad-bg)', boxShadow: '0 2px 6px rgba(var(--s-rgb),0.25)' }}
                title="新建知识库"
              >
                <IconPlus size={13} />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-0.5">
              {books.map(b => {
                const active = b.id === activeKbId;
                const stat = bookStats.get(b.id) || { count: 0, updatedAt: 0 };
                return (
                  <div
                    key={b.id}
                    onClick={() => selectBook(b.id)}
                    className={`group flex items-center gap-3 px-2.5 min-h-[68px] rounded-xl cursor-pointer transition-colors ${active ? '' : 'hover:bg-ink-50'}`}
                    style={active ? { background: b.color ? tint(b.color, 0.08) : 'rgba(var(--s-rgb),0.08)' } : undefined}
                  >
                    <span className="w-[34px] h-[34px] rounded-[10px] flex items-center justify-center flex-shrink-0 text-[18px] leading-none text-white"
                      style={{ background: b.color || 'var(--s-main)' }}>
                      {b.icon || <IconBook size={17} />}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className={`block text-[14px] leading-snug truncate ${active ? 'font-semibold' : 'font-medium'}`}
                        style={active ? { color: b.color || 'var(--s-main)' } : { color: '#0f1f1c' }}>
                        {b.name}
                      </span>
                      <span className="block text-[11.5px] leading-snug text-ink-400 tabular-nums mt-1 truncate">
                        {stat.count} 篇{stat.updatedAt ? ` · ${fmtDate(stat.updatedAt)}` : ''}
                      </span>
                    </span>
                    <span className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingBook(b); setBookFormOpen(true); }}
                        className="w-[22px] h-[22px] rounded-md flex items-center justify-center text-ink-400 hover:text-ink-700 hover:bg-black/[0.05] transition-colors"
                        title="编辑知识库"
                      ><IconPen size={12} /></button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setConfirmRemoveBook(b); }}
                        className="w-[22px] h-[22px] rounded-md flex items-center justify-center text-ink-300 hover:text-[#FF3B30] hover:bg-[#FF3B300F] transition-colors"
                        title="删除知识库"
                      ><IconTrash size={12} /></button>
                    </span>
                  </div>
                );
              })}

              </div>

            </div>

          <SplitDivider bindDivider={bindDivider} />

          {/* ---- 右：目录 + 正文（同一张卡）---- */}
          <div className="glass-card rounded-2xl min-w-0 min-h-0 flex items-stretch" style={rightStyle}>
            {/* 目录列：纯白，与正文同底、仅靠一条通高发丝线区分（去掉双层灰，避免与画布灰糊在一起） */}
            <div className="w-[232px] flex-shrink-0 flex flex-col min-h-0 p-3 rounded-l-2xl bg-white">
              {/* 页头：知识库图标 + 名称 + 新建（新建文档 / 新建分组） */}
              <div className="relative flex items-center gap-2 px-1 pt-0.5 pb-2 flex-shrink-0">
                <span
                  className="w-[22px] h-[22px] rounded-[7px] flex items-center justify-center flex-shrink-0 text-[13px] leading-none text-white"
                  style={{ background: activeBook?.color || 'var(--s-main)' }}
                >
                  {activeBook?.icon || <IconBook size={13} strokeWidth={2} />}
                </span>
                <span className="text-[13.5px] font-semibold text-ink-900 truncate flex-1 min-w-0">{activeBook?.name || '目录'}</span>
                <button
                  onClick={() => setNewMenuOpen(v => !v)}
                  disabled={!activeKbId}
                  className="w-[22px] h-[22px] rounded-lg flex items-center justify-center flex-shrink-0 text-[var(--s-main)] hover:bg-[rgba(var(--s-rgb),0.12)] active:bg-[rgba(var(--s-rgb),0.18)] transition-colors focus:outline-none disabled:opacity-40"
                  title="新建文档 / 新建分组"
                >
                  <IconPlus size={13} strokeWidth={2.4} />
                </button>

                {newMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setNewMenuOpen(false)} />
                    <div
                      className="absolute right-1 top-[calc(100%-2px)] z-40 w-[176px] rounded-xl bg-white border border-ink-100 py-1"
                      style={{ boxShadow: '0 12px 32px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.06)' }}
                    >
                      {/* 新建 */}
                      <button
                        onClick={() => { setNewMenuOpen(false); createNote(selectedDoc?.group || ''); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-[12.5px] text-ink-700 hover:bg-ink-50 transition-colors text-left"
                      ><IconPen size={13} className="text-ink-400 flex-shrink-0" />新建笔记</button>
                      <button
                        onClick={() => { setNewMenuOpen(false); setLinkUrl(''); setLinkOpen(true); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-[12.5px] text-ink-700 hover:bg-ink-50 transition-colors text-left"
                      ><IconLink size={13} className="text-ink-400 flex-shrink-0" />粘贴链接</button>

                      {/* 导入 */}
                      <div className="h-px bg-ink-100 mx-2 my-1" />
                      <button
                        onClick={() => { setNewMenuOpen(false); mdInputRef.current?.click(); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-[12.5px] text-ink-700 hover:bg-ink-50 transition-colors text-left"
                      ><IconMarkdown size={13} className="text-ink-400 flex-shrink-0" />导入 Markdown</button>

                      {/* 组织 */}
                      <div className="h-px bg-ink-100 mx-2 my-1" />
                      <button
                        onClick={() => { setNewMenuOpen(false); setNewGroup(true); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-[12.5px] text-ink-700 hover:bg-ink-50 transition-colors text-left"
                      ><IconFolder size={13} className="text-ink-400 flex-shrink-0" />新建分组</button>
                    </div>
                  </>
                )}

                {/* 粘贴链接：链接输入浮层 */}
                {linkOpen && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setLinkOpen(false)} />
                    <div
                      className="absolute right-1 top-[calc(100%-2px)] z-40 w-[268px] rounded-xl bg-white border border-ink-100 p-2.5"
                      style={{ boxShadow: '0 12px 32px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.06)' }}
                    >
                      <div className="text-[12px] font-semibold text-ink-700 mb-1.5">粘贴链接</div>
                      <input
                        autoFocus
                        type="text"
                        value={linkUrl}
                        onChange={(e) => setLinkUrl(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') submitLink();
                          if (e.key === 'Escape') setLinkOpen(false);
                        }}
                        placeholder="https://example.com/article"
                        className="w-full px-2.5 py-1.5 rounded-lg text-[12.5px] bg-white border border-ink-200 focus:border-[var(--s-main)] focus:outline-none transition-colors"
                      />
                      <div className="flex items-center justify-end gap-1.5 mt-2">
                        <button
                          onClick={() => setLinkOpen(false)}
                          className="px-2.5 py-1 rounded-lg text-[12px] font-medium text-ink-600 bg-ink-100 hover:bg-ink-200/70 transition-colors"
                        >取消</button>
                        <button
                          onClick={submitLink}
                          disabled={!linkUrl.trim()}
                          className="px-3 py-1 rounded-lg text-[12px] font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                          style={{ background: 'var(--s-grad-bg)', boxShadow: '0 2px 6px rgba(var(--s-rgb),0.25)' }}
                        >添加</button>
                      </div>
                    </div>
                  </>
                )}

                {/* 导入 Markdown 的文件选择器（隐藏） */}
                <input
                  ref={mdInputRef}
                  type="file"
                  accept=".md,.markdown,.txt,text/markdown"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) importMarkdown(f);
                  }}
                />
              </div>

              {/* 标题下分割线：固定页头与可滚动目录列表分离，结构更清晰 */}
              <div className="h-px flex-shrink-0 mb-2 mx-0.5" style={{ background: 'rgba(15,31,28,0.07)' }} />

              <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-0.5">
                {tree.length === 0 && (
                  <div className="px-2 py-3 text-[12px] text-ink-300 leading-relaxed">
                    还没有文档，点右上角「＋」新建
                  </div>
                )}

                {tree.map(({ group, docs }) => {
                  const isRenamingGroup = renamingGroup !== null && renamingGroup === group;
                  const hideHeader = flatDocs !== null; // 无自建分组：平铺，不出现「未分组」标题
                  return (
                    <div key={group || '__none__'} className="flex flex-col">
                      {!hideHeader && (
                      <div
                        draggable={group !== '' && !isRenamingGroup}
                        onDragStart={(e) => { e.stopPropagation(); setDragGroup(group); setDragId(null); }}
                        onDragEnd={() => { setDragGroup(null); setDropHint(null); }}
                        onDragOver={(e) => {
                          if (dragGroup) { e.preventDefault(); setDropHint({ type: 'groupSort', key: group }); }
                          else if (dragId) { e.preventDefault(); setDropHint({ type: 'group', key: group }); }
                        }}
                        onDrop={(e) => { e.preventDefault(); if (dragGroup) handleGroupDrop(group); else handleDrop({ group }); }}
                        className={`group flex items-center gap-1.5 pl-4 pr-2 pt-2 pb-1 rounded-md transition-colors ${group !== '' && !isRenamingGroup ? 'cursor-grab active:cursor-grabbing' : ''} ${
                          (dropHint?.type === 'groupSort' && dropHint?.key === group) ? 'bg-[rgba(var(--s-rgb),0.1)]'
                          : (dropHint?.type === 'group' && dropHint?.key === group) ? 'bg-[rgba(var(--s-rgb),0.06)]' : ''
                        }`}
                      >
                        {isRenamingGroup ? (
                          <div className="flex-1 min-w-0">
                            <InlineInput
                              defaultValue={group}
                              placeholder="分组名称"
                              onCommit={(name) => { renameKBGroup(activeKbId, group, name); setRenamingGroup(null); reload(); }}
                              onCancel={() => setRenamingGroup(null)}
                            />
                          </div>
                        ) : (
                          <>
                            <span className="flex-1 min-w-0 text-[13px] font-semibold text-ink-500 truncate">
                              {group || '未分组'}
                            </span>
                            <span className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => setRenamingGroup(group)}
                                className="w-[20px] h-[20px] rounded-md flex items-center justify-center text-ink-400 hover:text-ink-700 hover:bg-black/[0.05]"
                                title="重命名分组"
                              ><IconPen size={11} /></button>
                              <button
                                onClick={() => { removeKBGroup(activeKbId, group); reload(); }}
                                className="w-[20px] h-[20px] rounded-md flex items-center justify-center text-ink-300 hover:text-[#FF3B30] hover:bg-[#FF3B300F]"
                                title="删除分组（文档移到未分组）"
                              ><IconTrash size={11} /></button>
                            </span>
                          </>
                        )}
                      </div>
                      )}

                      {docs.map(doc => {
                        const active = doc.id === selectedDocId;
                        const isDropTarget = dropHint?.type === 'doc' && dropHint?.key === doc.id;
                        const isLink = doc.source === 'web' && !!doc.sourceUrl; // 网页来源：左侧用链接图标 + 右侧可跳转
                        return (
                          <div
                            key={doc.id}
                            draggable
                            onDragStart={() => { setDragId(doc.id); setDragGroup(null); }}
                            onDragEnd={() => { setDragId(null); setDropHint(null); }}
                            onDragOver={(e) => { if (dragId && dragId !== doc.id) { e.preventDefault(); setDropHint({ type: 'doc', key: doc.id }); } }}
                            onDrop={(e) => { e.preventDefault(); handleDrop({ targetId: doc.id }); }}
                            onClick={() => setSelectedDocId(doc.id)}
                            className={`group flex items-center gap-2 pl-4 pr-2 py-1.5 rounded-lg cursor-pointer border border-transparent transition-colors ${active ? '' : 'hover:bg-ink-50'} ${isDropTarget ? 'ring-1 ring-[rgba(var(--s-rgb),0.4)]' : ''}`}
                            style={active ? { background: 'rgba(var(--s-rgb),0.09)' } : undefined}
                          >
                            {isLink
                              ? <IconLink size={12} className="flex-shrink-0" style={{ color: active ? 'var(--s-main)' : '#C2C9C6' }} />
                              : <IconFile size={12} className="flex-shrink-0" style={{ color: active ? 'var(--s-main)' : '#C2C9C6' }} />}
                            <span className={`flex-1 min-w-0 text-[14px] truncate ${active ? 'font-semibold text-ink-900' : 'text-ink-700'}`}>
                              {doc.title || '无标题'}
                            </span>
                            {isLink && (
                              <button
                                onClick={(e) => { e.stopPropagation(); window.open(doc.sourceUrl, '_blank', 'noopener,noreferrer'); }}
                                className="w-[20px] h-[20px] rounded-md flex items-center justify-center flex-shrink-0 text-ink-300 hover:text-[var(--s-main)] hover:bg-[rgba(var(--s-rgb),0.1)] opacity-0 group-hover:opacity-100 transition-opacity"
                                title="打开链接"
                              ><IconArrowUpRight size={12} /></button>
                            )}
                            <button
                              onClick={(e) => { e.stopPropagation(); setConfirmRemoveDoc(doc); }}
                              className="w-[20px] h-[20px] rounded-md flex items-center justify-center flex-shrink-0 text-ink-300 hover:text-[#FF3B30] hover:bg-[#FF3B300F] opacity-0 group-hover:opacity-100 transition-opacity"
                              title="删除文档"
                            ><IconX size={12} /></button>
                          </div>
                        );
                      })}

                      {docs.length === 0 && !isRenamingGroup && (
                        <div className="pl-6 pr-2 py-1 text-[11px] text-ink-300">拖动文档到此分组</div>
                      )}
                    </div>
                  );
                })}

                {newGroup && (
                  <div className="px-1 py-0.5">
                    <InlineInput
                      placeholder="分组名称（如：第一章）"
                      onCommit={(name) => { addKBGroup(activeKbId, name); setNewGroup(false); reload(); }}
                      onCancel={() => setNewGroup(false)}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* 目录 / 正文分割线：整条通高、极浅灰，柔和而不抢眼（参考语雀） */}
            <div className="w-px flex-shrink-0 self-stretch" style={{ background: 'rgba(15,31,28,0.07)' }} />

            {/* 正文 */}
            <div className="flex-1 min-w-0 flex flex-col min-h-0 p-5">
              {!selectedDoc ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center gap-2">
                  <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#C7C7CC" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                  </svg>
                  <div className="text-[13.5px] font-medium text-ink-300">选择左侧一篇文档</div>
                </div>
              ) : (
                <>
                  {/* 标题行：标题（点击即编辑） + ⋯（文档信息 / 重命名 / 删除）
                      面包屑与更新/来源信息已并入 ⋯ 菜单，保持正文画布简洁 */}
                  <div className="flex items-start gap-2 flex-shrink-0">
                    <div
                      ref={titleRef}
                      contentEditable
                      suppressContentEditableWarning
                      data-placeholder="无标题"
                      onInput={() => { captureDraft(); scheduleAutosave(); }}
                      onBlur={() => commitDraft()}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); titleRef.current?.blur(); } }}
                      className="kb-inline flex-1 min-w-0 text-[20px] font-bold text-ink-900 leading-snug break-words rounded-md px-1.5 -ml-1.5 py-0.5 hover:bg-[rgba(0,0,0,0.035)] focus:bg-[rgba(0,0,0,0.035)] transition-colors"
                    />
                    <div className="relative flex-shrink-0 mt-0.5">
                      <button
                        onClick={() => setDocMenuOpen(v => !v)}
                        className="w-[26px] h-[26px] rounded-lg flex items-center justify-center text-ink-400 hover:text-ink-700 hover:bg-ink-50 transition-colors focus:outline-none"
                        title="更多"
                      ><IconDots size={14} /></button>
                      {docMenuOpen && (
                        <>
                          <div className="fixed inset-0 z-30" onClick={() => setDocMenuOpen(false)} />
                          <div
                            className="absolute right-0 top-[calc(100%+4px)] z-40 w-[190px] rounded-xl bg-white border border-ink-100 py-1"
                            style={{ boxShadow: '0 12px 32px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.06)' }}
                          >
                            {/* 文档信息（只读）：更新于 / 来源 / 标签 */}
                            <div className="px-3 pt-1 pb-2">
                              <div className="text-[11px] text-ink-400 leading-relaxed whitespace-nowrap">
                                更新于 {fmtDate(selectedDoc.updatedAt)} · 来源：{SOURCE_META[selectedDoc.source]?.label || '手动'}
                              </div>
                              {selectedDoc.tags?.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1.5">
                                  {selectedDoc.tags.map(t => (
                                    <span key={t} className="px-1.5 py-px rounded-md text-[10.5px] bg-ink-50 text-ink-500">{t}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div className="h-px bg-ink-100 mx-1 my-0.5" />
                            <button
                              onClick={() => { setDocMenuOpen(false); focusTitle(); }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-[12.5px] text-ink-700 hover:bg-ink-50 transition-colors text-left"
                            ><IconPen size={13} className="text-ink-400 flex-shrink-0" />重命名</button>
                            <button
                              onClick={() => { setDocMenuOpen(false); setConfirmRemoveDoc(selectedDoc); }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-[12.5px] transition-colors text-left hover:bg-[#FF3B300F]"
                              style={{ color: '#FF3B30' }}
                            ><IconTrash size={13} className="flex-shrink-0" />删除文档</button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* 正文编辑区：无边框画布 + 格式工具栏 + 底栏（去掉卡中卡边框，书写面更干净、更接近 Notion/小记） */}
                  <div className="flex-1 min-h-0 flex flex-col mt-4">
                    {/* 格式工具栏 */}
                    <div className="flex items-center gap-0.5 px-1.5 py-1 border-b border-ink-100 flex-shrink-0 flex-wrap">
                      <ToolBtn title="标题1" onClick={() => exec('formatBlock', 'H1')}><span className="font-bold text-[12px]">H1</span></ToolBtn>
                      <ToolBtn title="标题2" onClick={() => exec('formatBlock', 'H2')}><span className="font-bold text-[11.5px]">H2</span></ToolBtn>
                      <ToolBtn title="正文" onClick={() => exec('formatBlock', 'P')}><span className="text-[11.5px]">正文</span></ToolBtn>
                      <span className="w-px h-4 bg-ink-150 mx-1" />
                      <ToolBtn title="加粗 (Ctrl+B)" onClick={() => exec('bold')}><span className="font-bold">B</span></ToolBtn>
                      <ToolBtn title="斜体 (Ctrl+I)" onClick={() => exec('italic')}><span className="italic">I</span></ToolBtn>
                      <ToolBtn title="下划线 (Ctrl+U)" onClick={() => exec('underline')}><span className="underline">U</span></ToolBtn>
                      <span className="w-px h-4 bg-ink-150 mx-1" />
                      <ToolBtn title="无序列表" onClick={() => exec('insertUnorderedList')}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><circle cx="3.5" cy="6" r="1.2" fill="currentColor" stroke="none" /><circle cx="3.5" cy="12" r="1.2" fill="currentColor" stroke="none" /><circle cx="3.5" cy="18" r="1.2" fill="currentColor" stroke="none" /></svg>
                      </ToolBtn>
                      <ToolBtn title="有序列表" onClick={() => exec('insertOrderedList')}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="10" y1="6" x2="21" y2="6" /><line x1="10" y1="12" x2="21" y2="12" /><line x1="10" y1="18" x2="21" y2="18" /><path d="M4 6h1v4" strokeLinejoin="round" /><path d="M4 10h2" /><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" /></svg>
                      </ToolBtn>
                      <span className="w-px h-4 bg-ink-150 mx-1" />
                      <ToolBtn title="引用" onClick={() => exec('formatBlock', 'BLOCKQUOTE')}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z" /><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z" /></svg>
                      </ToolBtn>
                      <ToolBtn title="清除格式" onClick={() => exec('removeFormat')}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7V4h16v3" /><path d="M9 20h6" /><path d="M12 4v16" /></svg>
                      </ToolBtn>
                    </div>

                    {/* 正文（点击即可编辑） */}
                    <div
                      ref={contentRef}
                      contentEditable
                      suppressContentEditableWarning
                      data-placeholder="开始记录…"
                      onInput={() => {
                        setDirty(true);
                        setCharCount(stripHtml(contentRef.current?.innerHTML || '').length);
                        captureDraft();
                        scheduleAutosave();
                      }}
                      onBlur={() => commitDraft()}
                      onKeyDown={(e) => {
                        if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) { e.preventDefault(); commitDraft(); }
                      }}
                      className="kb-inline kb-prose flex-1 min-h-0 overflow-y-auto px-0.5 py-3"
                    />

                    {/* 底栏：字数 + 保存状态（未保存 / ✓ 已保存 / 保存时间）+ 保存 */}
                    <div className="flex items-center gap-2 px-1.5 py-1.5 border-t border-ink-100 flex-shrink-0">
                      <span className="text-[11px] text-ink-300 tabular-nums">{charCount} 字</span>
                      <span className="flex-1" />
                      {dirty
                        ? <span className="text-[11.5px] text-ink-300">未保存</span>
                        : savedFlash
                          ? <span className="text-[11.5px] font-medium" style={{ color: 'var(--s-main)' }}>{savedFlash}</span>
                          : selectedDoc?.updatedAt
                            ? <span className="text-[11px] text-ink-400 tabular-nums">{fmtSavedTime(selectedDoc.updatedAt)}</span>
                            : null}
                      <button
                        onClick={() => commitDraft()}
                        disabled={!dirty}
                        className="h-[26px] px-3 rounded-lg text-[12px] font-semibold transition-all focus:outline-none disabled:cursor-default"
                        style={dirty
                          ? { background: 'var(--s-grad-bg)', color: '#fff', boxShadow: '0 2px 6px rgba(var(--s-rgb),0.25)' }
                          : { background: 'rgba(15,31,28,0.05)', color: '#9AA5A2' }}
                      >保存</button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
      </div>

      {/* 新建 / 编辑知识库 */}
      <KnowledgeBookForm
        open={bookFormOpen}
        onClose={() => { setBookFormOpen(false); setEditingBook(null); }}
        book={editingBook}
        onSave={saveBook}
      />

      {/* 删除文档确认 */}
      <ConfirmDialog
        open={!!confirmRemoveDoc}
        title="删除文档"
        message={`确定删除「${confirmRemoveDoc?.title || ''}」？删除后不可恢复。`}
        confirmText="删除"
        danger
        onConfirm={() => { removeKBEntry(confirmRemoveDoc.id); setConfirmRemoveDoc(null); reload(); }}
        onCancel={() => setConfirmRemoveDoc(null)}
      />

      {/* 删除知识库确认 */}
      <ConfirmDialog
        open={!!confirmRemoveBook}
        title="删除知识库"
        message={`删除「${confirmRemoveBook?.name || ''}」将同时删除其下全部文档，且不可恢复。`}
        confirmText="删除"
        danger
        onConfirm={() => { removeKBBook(confirmRemoveBook.id); setConfirmRemoveBook(null); reload(); }}
        onCancel={() => setConfirmRemoveBook(null)}
      />

      {/* 正文排版 */}
      <style>{`
        .kb-prose { font-size: 14px; line-height: 1.78; color: #0f1f1c; }
        .kb-prose p { margin: 0 0 10px; }
        .kb-prose h1 { font-size: 18px; font-weight: 700; line-height: 1.5; margin: 18px 0 8px; }
        .kb-prose h2 { font-size: 15.5px; font-weight: 600; line-height: 1.5; margin: 15px 0 8px; }
        .kb-prose h3 { font-size: 14px; font-weight: 600; margin: 13px 0 6px; }
        .kb-prose ul { list-style: disc; padding-left: 20px; margin: 0 0 10px; }
        .kb-prose ol { list-style: decimal; padding-left: 20px; margin: 0 0 10px; }
        .kb-prose blockquote { margin: 0 0 10px; padding: 3px 0 3px 12px; border-left: 3px solid rgba(var(--s-rgb),0.5); color: #4d5a57; }
        .kb-prose a { color: var(--s-main); text-decoration: underline; }
        .kb-prose b, .kb-prose strong { font-weight: 600; }
        .kb-prose img { max-width: 100%; border-radius: 8px; }
        /* 标题 / 正文 · 直接点击编辑：去掉浏览器默认蓝色聚焦框，仅保留柔和底色 */
        .kb-inline[contenteditable] { outline: none; }
        .kb-inline[contenteditable]:focus { outline: none; box-shadow: none; }
        .kb-inline[data-placeholder]:empty::before {
          content: attr(data-placeholder);
          color: #b3bab8;
          pointer-events: none;
        }
      `}</style>
    </div>
  );
}