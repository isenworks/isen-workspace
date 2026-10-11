import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  getKBBooks, getKBEntries, getKBTree, getKBDocs,
  addKBBook, updateKBBook, removeKBBook, ensureKBBooks,
  removeKBEntry, renameKBGroup, removeKBGroup, addKBGroup, reorderKBDoc,
  syncKBFromCloud,
} from '../utils/aiKnowledgeBase.js';
import KnowledgeForm from '../components/KnowledgeForm.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import {
  IconSearch, IconPlus, IconPen, IconLink, IconImport, IconBook,
  IconFolder, IconFile, IconTrash, IconX,
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

export default function KnowledgeBasePage() {
  const [books, setBooks] = useState([]);
  const [entries, setEntries] = useState([]);
  const [activeKbId, setActiveKbId] = useState(null);
  const [searchText, setSearchText] = useState('');
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

  // 拖拽排序
  const [dragId, setDragId] = useState(null);
  const [dropHint, setDropHint] = useState(null); // { type:'doc'|'group', key }

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
    () => (activeKbId ? getKBTree(activeKbId, searchText) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeKbId, searchText, tick],
  );

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
  const activeDomainCount = activeKbId ? getKBDocs(activeKbId).length : 0;
  const selectedDoc = useMemo(() => entries.find(e => e.id === selectedDocId) || null, [entries, selectedDocId]);

  /* ---------------- 知识库（书架） ---------------- */
  const selectBook = (id) => {
    if (id === activeKbId) return;
    setActiveKbId(id);
    setSearchText('');
    setNewGroup(false);
    setRenamingGroup(null);
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
  const openEditDoc = (doc) => {
    setEditingDoc(doc);
    setFormGroup(doc.group || '');
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
            {/* 页头：色条 + 标题 + 计数 + 新建 */}
            <div className="flex items-center gap-2.5 px-1 pt-0.5 pb-2.5 flex-shrink-0">
              <span className="w-[5px] h-[20px] rounded-full flex-shrink-0 self-center" style={{ background: 'var(--s-grad-bg)' }} />
              <span className="text-[15.5px] font-bold text-ink-900 leading-none flex-shrink-0">知识库</span>
              <span className="text-[11px] text-ink-300 tabular-nums flex-shrink-0">{books.length}</span>
              <div className="flex-1" />
              <button
                onClick={() => { setNewBook(true); }}
                className="w-[24px] h-[24px] rounded-lg flex items-center justify-center flex-shrink-0 text-white transition-all hover:scale-105 active:scale-95"
                style={{ background: 'var(--s-grad-bg)', boxShadow: '0 2px 6px rgba(var(--s-rgb),0.25)' }}
                title="新建知识库"
              >
                <IconPlus size={13} />
              </button>
            </div>

            {/* 搜索 */}
            <div className="relative mb-2 flex-shrink-0">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-300">
                <IconSearch size={13} />
              </span>
              <input
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="搜索文档标题 / 正文 / 标签"
                className="w-full pl-8 pr-3 py-1.5 rounded-lg text-[12.5px] bg-white border border-ink-200 focus:border-[var(--s-main)] focus:outline-none transition-colors"
              />
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
            {/* 目录 */}
            <div className="w-[232px] flex-shrink-0 flex flex-col min-h-0 p-3">
              <div className="flex items-center gap-1.5 px-1 pt-0.5 pb-2 flex-shrink-0">
                <span className="text-[13px] font-semibold text-ink-900 truncate flex-1 min-w-0">{activeBook?.name || '目录'}</span>
                <span className="text-[11px] text-ink-300 tabular-nums flex-shrink-0">{activeDomainCount}</span>
                <button
                  onClick={() => setNewGroup(true)}
                  className="w-[22px] h-[22px] rounded-md flex items-center justify-center text-ink-400 hover:text-[var(--s-main)] hover:bg-ink-50 transition-colors flex-shrink-0"
                  title="新建分组"
                ><IconFolder size={13} /></button>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-0.5">
                {tree.length === 0 && (
                  <div className="px-2 py-3 text-[12px] text-ink-300 leading-relaxed">
                    {searchText ? '没有匹配的文档' : '还没有文档，点下方新建'}
                  </div>
                )}

                {tree.map(({ group, docs }) => {
                  const isRenamingGroup = renamingGroup !== null && renamingGroup === group;
                  return (
                    <div key={group || '__none__'} className="flex flex-col">
                      <div
                        onDragOver={(e) => { if (dragId) { e.preventDefault(); setDropHint({ type: 'group', key: group }); } }}
                        onDrop={(e) => { e.preventDefault(); handleDrop({ group }); }}
                        className={`group flex items-center gap-1.5 px-2 pt-1.5 pb-1 rounded-md ${dropHint?.type === 'group' && dropHint?.key === group ? 'bg-[rgba(var(--s-rgb),0.06)]' : ''}`}
                      >
                        <IconFolder size={12} className="flex-shrink-0 text-ink-300" />
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
                            <span className="flex-1 min-w-0 text-[11px] font-semibold text-ink-400 tracking-wide truncate">
                              {group || '未分组'}
                            </span>
                            <span className="text-[10.5px] text-ink-300 tabular-nums flex-shrink-0">{docs.length}</span>
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
                            className={`group flex items-center gap-2 pl-4 pr-2 py-1.5 rounded-lg cursor-pointer transition-colors ${active ? '' : 'hover:bg-ink-50'} ${isDropTarget ? 'ring-1 ring-[rgba(var(--s-rgb),0.4)]' : ''}`}
                            style={active ? { background: 'rgba(var(--s-rgb),0.08)', boxShadow: 'inset 2px 0 0 var(--s-main)' } : undefined}
                          >
                            <IconFile size={12} className="flex-shrink-0 text-ink-300" />
                            <span className={`flex-1 min-w-0 text-[12.5px] truncate ${active ? 'font-semibold' : ''}`}
                              style={active ? { color: 'var(--s-main)' } : { color: '#0f1f1c' }}>
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

              <button
                onClick={() => openNewDoc('')}
                className="mt-2 flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[12px] font-medium text-[var(--s-main)] border border-dashed border-ink-200 hover:bg-ink-50 transition-colors flex-shrink-0"
              >
                <IconPlus size={12} />
                新建文档
              </button>
            </div>

            {/* 内部短分割线 */}
            <div className="w-4 flex-shrink-0 flex items-center justify-center">
              <span className="w-px h-16 rounded-full bg-ink-200/70" />
            </div>

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
                  <div className="flex items-start gap-3 flex-shrink-0">
                    <div className="flex-1 min-w-0">
                      <div className="text-[17px] font-bold text-ink-900 leading-snug break-words">{selectedDoc.title}</div>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap text-[11.5px] text-ink-400">
                        <span className="truncate max-w-[180px]">{activeBook?.name || ''}{selectedDoc.group ? ` / ${selectedDoc.group}` : ''}</span>
                        <span className="text-ink-300">·</span>
                        <span>更新于 {fmtDate(selectedDoc.updatedAt)}</span>
                        <span className="text-ink-300">·</span>
                        <span>来源：{SOURCE_META[selectedDoc.source]?.label || '手动'}</span>
                        {selectedDoc.tags?.map(t => (
                          <span key={t} className="px-1.5 py-px rounded-md text-[10.5px] bg-ink-50 text-ink-500 border border-ink-100">{t}</span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => openEditDoc(selectedDoc)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] font-medium text-ink-600 bg-ink-50 hover:bg-ink-100 transition-colors"
                      ><IconPen size={12} />编辑</button>
                      <button
                        onClick={() => setConfirmRemoveDoc(selectedDoc)}
                        className="w-[28px] h-[28px] rounded-lg flex items-center justify-center text-ink-300 hover:text-[#FF3B30] hover:bg-[#FF3B300F] transition-colors"
                        title="删除文档"
                      ><IconTrash size={13} /></button>
                    </div>
                  </div>

                  <div className="my-3 h-px bg-ink-100 flex-shrink-0" />

                  <div className="flex-1 min-h-0 overflow-y-auto">
                    {stripHtml(selectedDoc.content)
                      ? <div className="kb-prose" dangerouslySetInnerHTML={{ __html: selectedDoc.content }} />
                      : <div className="text-[12.5px] text-ink-300">这篇文档还没有内容，点「编辑」补充吧。</div>}
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
        .kb-prose h1, .kb-prose h2, .kb-prose h3 { font-size: 14.5px; font-weight: 600; margin: 16px 0 8px; }
        .kb-prose ul { list-style: disc; padding-left: 20px; margin: 0 0 10px; }
        .kb-prose ol { list-style: decimal; padding-left: 20px; margin: 0 0 10px; }
        .kb-prose a { color: var(--s-main); text-decoration: underline; }
        .kb-prose b, .kb-prose strong { font-weight: 600; }
        .kb-prose img { max-width: 100%; border-radius: 8px; }
      `}</style>
    </div>
  );
}