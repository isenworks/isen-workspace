import { useState, useEffect, useRef, useCallback } from 'react';
import {
  getKBEntries, getKBTags, searchKB, removeKBEntry, syncKBFromCloud,
} from '../utils/aiKnowledgeBase.js';
import KnowledgeForm from '../components/KnowledgeForm.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import {
  IconSearch, IconPlus, IconImport, IconClipboard, IconPen, IconLink, IconX, IconTag,
} from '../components/aiIcons.jsx';

/* 知识库页面：个人第二大脑（风格对齐 InboxPage）
   · 标题行：竖条 + 标题 + 工具按钮（搜索 / 飞书导入 / 粘贴 / 新建）
   · 左侧标签筛选（glass-card 行式，InboxPage 同款交互）
   · 右侧条目行式列表（glass-card + divide 分隔，高密度）
   条目来源：manual / feishu / web */

// 来源元数据（图标 + 名称）
const SOURCE_META = {
  manual: { icon: IconPen, label: '手动' },
  feishu: { icon: IconImport, label: '飞书' },
  web:    { icon: IconLink, label: '网页' },
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

export default function KnowledgeBasePage() {
  const [entries, setEntries] = useState(null); // null=加载中
  const [tags, setTags] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [activeTag, setActiveTag] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [defaultSource, setDefaultSource] = useState('manual');
  const [confirmRemove, setConfirmRemove] = useState(null); // 待删除条目
  const searchTimer = useRef(null);

  const refresh = useCallback(() => {
    setEntries(searchKB(searchText.trim(), activeTag));
    setTags(getKBTags());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText, activeTag]);

  // 加载 + 云端同步
  useEffect(() => {
    setEntries(searchKB('', null));
    syncKBFromCloud().then(() => setEntries(searchKB('', null)));
  }, []);

  // 搜索 / 标签筛选（防抖 300ms）
  useEffect(() => {
    const t = setTimeout(() => {
      setEntries(searchKB(searchText.trim(), activeTag));
    }, searchText ? 300 : 0);
    return () => clearTimeout(t);
  }, [searchText, activeTag]);

  const handleNew = (source = 'manual') => {
    setEditingEntry(null);
    setDefaultSource(source);
    setFormOpen(true);
  };

  const handleEdit = (entry) => {
    setEditingEntry(entry);
    setFormOpen(true);
  };

  const handleFormClose = () => {
    setFormOpen(false);
    setEditingEntry(null);
    setEntries(searchKB(searchText.trim(), activeTag));
    setTags(getKBTags());
  };

  // 渲染标签行（InboxPage 筛选标签同款交互）
  const renderTagRow = (label, count, active, onClick) => (
    <button
      key={label}
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-[12.5px] rounded-lg transition-colors ${
        active ? 'text-ink-900 font-semibold bg-ink-50' : 'text-ink-600 hover:bg-ink-50'
      }`}
    >
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${active ? 'bg-[var(--s-main)]' : 'bg-ink-300'}`} />
      <span className="flex-1 text-left truncate">{label}</span>
      <span className="text-[11px] text-ink-300 tabular-nums">{count}</span>
    </button>
  );

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      {/* ===== 标题行 ===== */}
      <div className="flex items-center gap-3 mb-4 flex-shrink-0">
        <span className="w-[5px] h-[20px] rounded-full flex-shrink-0" style={{ background: 'var(--s-grad-bg)' }} />
        <span className="text-[15.5px] font-bold text-ink-900 leading-none">知识库</span>

        {/* 搜索框 */}
        <div className="relative ml-2 flex-1 max-w-[260px]">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-300">
            <IconSearch size={13} />
          </span>
          <input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="搜索标题、正文、标签"
            className="w-full pl-8 pr-3 py-1.5 rounded-lg text-[12.5px] bg-white border border-ink-200 focus:border-[var(--s-main)] focus:outline-none transition-colors"
          />
        </div>

        <div className="flex-1" />

        {/* 飞书导入 */}
        <button
          onClick={() => handleNew('feishu')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12.5px] text-ink-700 bg-white border border-ink-200 hover:bg-ink-50 transition-colors flex-shrink-0"
        >
          <IconImport size={13} />
          飞书导入
        </button>
        {/* 网页粘贴 */}
        <button
          onClick={() => handleNew('web')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12.5px] text-ink-700 bg-white border border-ink-200 hover:bg-ink-50 transition-colors flex-shrink-0"
        >
          <IconClipboard size={13} />
          网页粘贴
        </button>
        {/* 新建（主按钮） */}
        <button
          onClick={() => handleNew('manual')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12.5px] font-semibold text-white transition-all hover:scale-105 active:scale-95 flex-shrink-0"
          style={{ background: 'var(--s-grad-bg)', boxShadow: '0 2px 6px rgba(var(--s-rgb),0.25)' }}
        >
          <IconPlus size={13} />
          新建条目
        </button>
      </div>

      {/* ===== 主体：左标签 + 右列表 ===== */}
      <div className="flex-1 min-h-0 flex gap-4 items-stretch">
        {/* 左侧标签栏 */}
        <div className="w-[180px] flex-shrink-0 flex flex-col min-h-0">
          <div className="glass-card rounded-2xl p-2 flex flex-col min-h-0 overflow-y-auto">
            <div className="px-3 pt-1 pb-1.5 text-[11px] font-semibold text-ink-400 tracking-wide flex items-center gap-1.5">
              <IconTag size={11} />
              标签筛选
            </div>
            {renderTagRow('全部', entries?.length ?? 0, activeTag === null, () => setActiveTag(null))}
            <div className="my-1 border-t border-ink-100/80" />
            {tags.map(t => renderTagRow(t.name, t.count, activeTag === t.name, () => setActiveTag(activeTag === t.name ? null : t.name)))}
            {tags.length === 0 && (
              <div className="px-3 py-2 text-[12px] text-ink-300">暂无标签，条目打标签后自动生成</div>
            )}
          </div>
        </div>

        {/* 右侧条目列表 */}
        <div className="flex-1 min-w-0 flex flex-col min-h-0">
          {entries === null ? (
            <div className="glass-card rounded-2xl p-10 flex items-center justify-center text-[13px] text-ink-400">加载中…</div>
          ) : entries.length === 0 ? (
            <div className="glass-card rounded-2xl p-14 flex flex-col items-center justify-center text-center gap-2 flex-1">
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#C7C7CC" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
              </svg>
              <div className="text-[14px] font-semibold text-ink-900">
                {searchText || activeTag ? '没有匹配的条目' : '知识库还是空的'}
              </div>
              <div className="text-[12px] text-ink-400">
                {searchText || activeTag ? '换个关键词或标签试试' : '把你的思考和在网上看到的好内容沉淀在这里'}
              </div>
            </div>
          ) : (
            <div className="glass-card rounded-2xl p-2 flex flex-col flex-1 min-h-0 overflow-y-auto">
              {entries.map((entry, i) => {
                const meta = SOURCE_META[entry.source] || SOURCE_META.manual;
                const SrcIcon = meta.icon;
                const plain = stripHtml(entry.content);
                return (
                  <div key={entry.id} className={i > 0 ? 'border-t border-ink-100/70' : ''}>
                    <div
                      onClick={() => handleEdit(entry)}
                      className="group flex items-start gap-3 px-3 py-2.5 rounded-xl hover:bg-ink-50 transition-colors cursor-pointer"
                    >
                      {/* 来源图标 */}
                      <span className="w-[28px] h-[28px] rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 text-ink-400"
                        style={{ background: 'rgba(var(--s-rgb),0.06)', color: 'var(--s-main)' }}>
                        <SrcIcon size={14} />
                      </span>

                      {/* 中间：标题 + 摘要 + 标签 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[13.5px] leading-snug font-medium text-ink-900 truncate">
                            {entry.title}
                          </span>
                          <span className="text-[10.5px] text-ink-400 flex-shrink-0">{meta.label}</span>
                          <span className="text-[10.5px] text-ink-300 flex-shrink-0 ml-auto pl-2">{fmtDate(entry.createdAt)}</span>
                        </div>
                        {plain && (
                          <div className="text-[12px] text-ink-400 leading-relaxed truncate mt-0.5">{plain}</div>
                        )}
                        {entry.tags?.length > 0 && (
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            {entry.tags.map(t => (
                              <span key={t} className="px-1.5 py-px rounded-md text-[10.5px] bg-ink-50 text-ink-500 border border-ink-100">
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* 删除（hover 显示） */}
                      <button
                        onClick={(e) => { e.stopPropagation(); setConfirmRemove(entry); }}
                        className="w-[24px] h-[24px] rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 text-ink-300 hover:text-[#FF3B30] hover:bg-[#FF3B300F] transition-all opacity-0 group-hover:opacity-100"
                        title="删除"
                      >
                        <IconX size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 编辑 / 新建弹窗 */}
      <KnowledgeForm
        open={formOpen}
        onClose={handleFormClose}
        entry={editingEntry}
        defaultSource={defaultSource}
      />

      {/* 删除确认（工作台 ConfirmDialog 同款） */}
      <ConfirmDialog
        open={!!confirmRemove}
        title="删除条目"
        message={`确定删除「${confirmRemove?.title || ''}」？删除后不可恢复。`}
        confirmText="删除"
        danger
        onConfirm={() => {
          if (confirmRemove) removeKBEntry(confirmRemove.id);
          setConfirmRemove(null);
          setEntries(searchKB(searchText.trim(), activeTag));
          setTags(getKBTags());
        }}
        onCancel={() => setConfirmRemove(null)}
      />
    </div>
  );
}
