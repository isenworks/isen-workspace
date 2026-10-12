import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  getKBBooks, getKBEntries, getKBTree, getKBDocs,
  addKBBook, updateKBBook, removeKBBook, ensureKBBooks,
  removeKBEntry, updateKBEntry, renameKBGroup, removeKBGroup, addKBGroup, reorderKBDoc,
  syncKBFromCloud,
} from '../utils/aiKnowledgeBase.js';
import KnowledgeForm from '../components/KnowledgeForm.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import SearchPopover from '../components/SearchPopover.jsx';
import {
  IconPlus, IconPen, IconLink, IconImport, IconBook,
  IconFolder, IconFile, IconTrash, IconX, IconDots,
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

  // 弹窗
  const [formOpen, setFormOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState(null);
  const [formGroup, setFormGroup] = useState('');
  const [confirmRemoveDoc, setConfirmRemoveDoc] = useState(null);
  const [confirmRemoveBook, setConfirmRemoveBook] = useState(null);

  // 内联编辑状态
  const [newBook, setNewBook] = useState(false);
  const [renamingBookId, setRenamingBookId] = useState(null);
  const [newGroup, setNewGroup] = useState(false);
  const [renamingGroup, setRenamingGroup] = useState(null);

  // 目录顶部「＋新建」浮层 / 正文标题「⋯」菜单
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [docMenuOpen, setDocMenuOpen] = useState(false);

  // 拖拽排序
  const [dragId, setDragId] = useState(null);
  const [dropHint, setDropHint] = useState(null); // { type:'doc'|'group', key }

  // 正文 / 标题 · 直接点击编辑（失焦自动保存）
  const titleRef = useRef(null);
  const contentRef = useRef(null);
  const [savedFlash, setSavedFlash] = useState('');
  const [dirty, setDirty] = useState(false);       // 正文是否有未保存改动
  const [charCount, setCharCount] = useState(0);   // 正文字数
  const saveHintTimer = useRef(null);
  useEffect(() => () => { if (saveHintTimer.current) clearTimeout(saveHintTimer.current); }, []);

  const flashSaved = () => {
    setSavedFlash('已保存');
    if (saveHintTimer.current) clearTimeout(saveHintTimer.current);
    saveHintTimer.current = setTimeout(() => setSavedFlash(''), 1500);
  };

  // 富文本格式操作（保留编辑器焦点，避免失焦保存打断）
  const exec = (cmd, val) => {
    contentRef.current?.focus();
    try { document.execCommand(cmd, false, val); } catch { /* ignore */ }
    setDirty(true);
  };

  const reload = useCallback(() => {
    const bs = getKBBooks();
    setBooks(bs);
    setEntries(getKBEntries());
    setActiveKbId(prev => (prev && bs.some(b => b.id === prev) ? prev : (bs[0]?.id || null)));
    setTick(t => t + 1);
  }, []);

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

  // 标题 / 正文：仅在「切换文档」时同步 DOM，避免失焦保存后重渲染打断光标
  useEffect(() => {
    if (titleRef.current) titleRef.current.innerText = selectedDoc?.title || '无标题';
    if (contentRef.current) contentRef.current.innerHTML = selectedDoc?.content || '';
    setDirty(false);
    setCharCount(stripHtml(selectedDoc?.content || '').length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDoc?.id]);

  const commitTitle = () => {
    if (!selectedDocId || !titleRef.current) return;
    const next = (titleRef.current.innerText || '').replace(/\s+/g, ' ').trim() || '无标题';
    titleRef.current.innerText = next;
    if (next === (selectedDoc?.title || '')) return;
    updateKBEntry(selectedDocId, { title: next });
    reload();
    flashSaved();
  };

  const commitContent = () => {
    if (!selectedDocId || !contentRef.current) return;
    const html = contentRef.current.innerHTML;
    const next = stripHtml(html) ? html : ''; // 空内容归一为空串，避免存入空标签
    if (next === '') contentRef.current.innerHTML = '';
    setCharCount(stripHtml(next).length);
    if (next === (selectedDoc?.content || '')) { setDirty(false); return; }
    updateKBEntry(selectedDocId, { content: next });
    setDirty(false);
    reload();
    flashSaved();
  };

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

  const commitNewBook = (name) => {
    const book = addKBBook({ name });
    setNewBook(false);
    reload();
    setActiveKbId(book.id);
  };

  /* ---------------- 文档 ---------------- */
  const openNewDoc = (group = '') => {
    setEditingDoc(null);
    setFormGroup(group);
    setFormOpen(true);
  };
  const closeForm = () => {
    setFormOpen(false);
    setEditingDoc(null);
    reload();
  };

  /* ---------------- 拖拽排序 ---------------- */
  const handleDrop = (payload) => {
    if (!dragId) return;
    reorderKBDoc(activeKbId, dragId, payload);
    setDragId(null);
    setDropHint(null);
    reload();
  };

  return (
    <div className="flex-1 min-w-0 w-full flex flex-col gap-3">
      {/* 主体：左书架卡 + 右（目录 + 正文）卡，中间可拖拽调宽 */}
      <div {...bindRoot} className="flex-1 min-h-0 flex items-stretch">
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
                onClick={() => { setNewBook(true); }}
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
                if (renamingBookId === b.id) {
                  return (
                    <div key={b.id} className="px-1 py-0.5">
                      <InlineInput
                        defaultValue={b.name}
                        placeholder="知识库名称"
                        onCommit={(name) => { updateKBBook(b.id, { name }); setRenamingBookId(null); reload(); }}
                        onCancel={() => setRenamingBookId(null)}
                      />
                    </div>
                  );
                }
                return (
                  <div
                    key={b.id}
                    onClick={() => selectBook(b.id)}
                    className={`group flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${active ? '' : 'hover:bg-ink-50'}`}
                    style={active ? { background: 'rgba(var(--s-rgb),0.08)' } : undefined}
                  >
                    <span className={`w-[22px] h-[22px] rounded-md flex items-center justify-center flex-shrink-0 ${active ? '' : 'text-ink-400'}`}
                      style={active ? { background: 'rgba(var(--s-rgb),0.12)', color: 'var(--s-main)' } : { background: 'rgba(var(--s-rgb),0.05)' }}>
                      <IconBook size={13} />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className={`block text-[13px] leading-tight truncate ${active ? 'font-semibold' : 'font-medium'}`}
                        style={active ? { color: 'var(--s-main)' } : { color: '#0f1f1c' }}>
                        {b.name}
                      </span>
                      <span className="block text-[10.5px] text-ink-400 tabular-nums mt-0.5">
                        {stat.count} 篇{stat.updatedAt ? ` · ${fmtDate(stat.updatedAt)}` : ''}
                      </span>
                    </span>
                    <span className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => { e.stopPropagation(); setRenamingBookId(b.id); }}
                        className="w-[22px] h-[22px] rounded-md flex items-center justify-center text-ink-400 hover:text-ink-700 hover:bg-black/[0.05] transition-colors"
                        title="重命名"
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

              {newBook && (
                <div className="px-1 py-0.5">
                  <InlineInput
                    placeholder="知识库名称"
                    onCommit={commitNewBook}
                    onCancel={() => setNewBook(false)}
                  />
                </div>
              )}
            </div>

            </div>

          <SplitDivider bindDivider={bindDivider} />

          {/* ---- 右：目录 + 正文（同一张卡）---- */}
          <div className="glass-card rounded-2xl min-w-0 min-h-0 flex items-stretch" style={rightStyle}>
            {/* 目录列：柔和高级灰（极低饱和 + 顶浅底深的微渐变，营造哑光层次），与正文靠底色 + 通高细线区分 */}
            <div className="w-[232px] flex-shrink-0 flex flex-col min-h-0 p-3 rounded-l-2xl" style={{ background: 'linear-gradient(180deg, #F7F8F8 0%, #F1F3F2 100%)' }}>
              {/* 页头：知识库图标 + 名称 + ＋新建（新建文档 / 新建分组） */}
              <div className="relative flex items-center gap-2 px-1 pt-0.5 pb-2.5 flex-shrink-0">
                <span
                  className="w-[20px] h-[20px] rounded-[7px] flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(var(--s-rgb),0.1)', color: 'var(--s-main)' }}
                >
                  <IconBook size={12} strokeWidth={2} />
                </span>
                <span className="text-[13.5px] font-semibold text-ink-900 truncate flex-1 min-w-0">{activeBook?.name || '目录'}</span>
                <button
                  onClick={() => setNewMenuOpen(v => !v)}
                  disabled={!activeKbId}
                  className="flex items-center gap-0.5 h-[24px] pl-2 pr-2 rounded-full text-[11.5px] font-semibold flex-shrink-0 transition-colors focus:outline-none disabled:opacity-40"
                  style={{ background: 'rgba(var(--s-rgb),0.1)', color: 'var(--s-main)' }}
                  title="新建文档 / 新建分组"
                >
                  <IconPlus size={11} strokeWidth={2.6} />新建
                </button>

                {newMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setNewMenuOpen(false)} />
                    <div
                      className="absolute right-1 top-[calc(100%-2px)] z-40 w-[152px] rounded-xl bg-white border border-ink-100 py-1"
                      style={{ boxShadow: '0 12px 32px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.06)' }}
                    >
                      <button
                        onClick={() => { setNewMenuOpen(false); openNewDoc(selectedDoc?.group || ''); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-[12.5px] text-ink-700 hover:bg-ink-50 transition-colors text-left"
                      ><IconFile size={13} className="text-ink-400 flex-shrink-0" />新建文档</button>
                      <button
                        onClick={() => { setNewMenuOpen(false); setNewGroup(true); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-[12.5px] text-ink-700 hover:bg-ink-50 transition-colors text-left"
                      ><IconFolder size={13} className="text-ink-400 flex-shrink-0" />新建分组</button>
                    </div>
                  </>
                )}
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-0.5">
                {tree.length === 0 && (
                  <div className="px-2 py-3 text-[12px] text-ink-300 leading-relaxed">
                    还没有文档，点右上角「＋新建」
                  </div>
                )}

                {tree.map(({ group, docs }) => {
                  const isRenamingGroup = renamingGroup !== null && renamingGroup === group;
                  const hideHeader = flatDocs !== null; // 无自建分组：平铺，不出现「未分组」标题
                  return (
                    <div key={group || '__none__'} className="flex flex-col">
                      {!hideHeader && (
                      <div
                        onDragOver={(e) => { if (dragId) { e.preventDefault(); setDropHint({ type: 'group', key: group }); } }}
                        onDrop={(e) => { e.preventDefault(); handleDrop({ group }); }}
                        className={`group flex items-center gap-1.5 pl-4 pr-2 pt-2 pb-1 rounded-md ${dropHint?.type === 'group' && dropHint?.key === group ? 'bg-[rgba(var(--s-rgb),0.06)]' : ''}`}
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
                            <span className="flex-1 min-w-0 text-[13px] font-medium text-ink-400 truncate">
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
                        return (
                          <div
                            key={doc.id}
                            draggable
                            onDragStart={() => setDragId(doc.id)}
                            onDragEnd={() => { setDragId(null); setDropHint(null); }}
                            onDragOver={(e) => { if (dragId && dragId !== doc.id) { e.preventDefault(); setDropHint({ type: 'doc', key: doc.id }); } }}
                            onDrop={(e) => { e.preventDefault(); handleDrop({ targetId: doc.id }); }}
                            onClick={() => setSelectedDocId(doc.id)}
                            className={`group flex items-center gap-2 pl-4 pr-2 py-1.5 rounded-lg cursor-pointer border transition-colors ${active ? 'bg-white border-ink-100' : 'border-transparent hover:bg-ink-50'} ${isDropTarget ? 'ring-1 ring-[rgba(var(--s-rgb),0.4)]' : ''}`}
                            style={active ? { boxShadow: '0 1px 2px rgba(15,31,28,0.05)' } : undefined}
                          >
                            <IconFile size={12} className="flex-shrink-0" style={{ color: active ? 'var(--s-main)' : '#C2C9C6' }} />
                            <span className={`flex-1 min-w-0 text-[12.5px] truncate ${active ? 'font-semibold text-ink-900' : 'text-ink-700'}`}>
                              {doc.title || '无标题'}
                            </span>
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
                  <div className="text-[13.5px] font-semibold text-ink-900">选择左侧一篇文档</div>
                  <div className="text-[12px] text-ink-400">在这里阅读或编辑内容</div>
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
                      onBlur={commitTitle}
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

                  {/* 正文编辑区：圆角卡片 + 格式工具栏 + 保存 */}
                  <div className="flex-1 min-h-0 flex flex-col rounded-2xl border border-ink-100 bg-white overflow-hidden mt-4">
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
                      data-placeholder="点这里开始记录你的思考、摘录或笔记…"
                      onInput={() => {
                        setDirty(true);
                        setCharCount(stripHtml(contentRef.current?.innerHTML || '').length);
                      }}
                      onBlur={commitContent}
                      onKeyDown={(e) => {
                        if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) { e.preventDefault(); commitContent(); }
                      }}
                      className="kb-inline kb-prose flex-1 min-h-0 overflow-y-auto px-3.5 py-3"
                    />

                    {/* 底栏：字数 + 保存 */}
                    <div className="flex items-center gap-2 px-2.5 py-1.5 border-t border-ink-100 flex-shrink-0">
                      <span className="text-[11px] text-ink-300 tabular-nums">{charCount} 字</span>
                      <span className="flex-1" />
                      {savedFlash
                        ? <span className="text-[11.5px] font-medium" style={{ color: 'var(--s-main)' }}>{savedFlash}</span>
                        : dirty && <span className="text-[11.5px] text-ink-300">未保存</span>}
                      <button
                        onClick={commitContent}
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

      {/* 新建 / 编辑文档 */}
      <KnowledgeForm
        open={formOpen}
        onClose={closeForm}
        entry={editingDoc}
        kbId={activeKbId}
        group={formGroup}
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
        .kb-prose { font-size: 13.5px; line-height: 1.75; color: #0f1f1c; }
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