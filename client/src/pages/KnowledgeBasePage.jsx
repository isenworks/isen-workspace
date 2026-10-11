import { useState, useEffect, useRef, useCallback } from 'react';
import {
  getKBEntries, getKBTags, searchKB, removeKBEntry, syncKBFromCloud,
} from '../utils/aiKnowledgeBase.js';
import KnowledgeForm from '../components/KnowledgeForm.jsx';

/* 知识库页面：个人第二大脑
   · 顶栏：搜索 + 飞书导入 + 粘贴 + 新建
   · 左侧标签筛选（160px）
   · 右侧条目卡片流
   条目来源：手动 / 飞书 / 网页 */
export default function KnowledgeBasePage() {
  const [entries, setEntries] = useState([]);
  const [tags, setTags] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTag, setActiveTag] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [defaultSource, setDefaultSource] = useState('manual');
  const searchTimer = useRef(null);

  // 刷新列表
  const refresh = useCallback(() => {
    setEntries(getKBEntries());
    setTags(getKBTags());
  }, []);

  // 加载 + 云端同步
  useEffect(() => {
    refresh();
    syncKBFromCloud().then(() => refresh());
  }, [refresh]);

  // 搜索防抖（300ms）
  const handleSearch = (val) => {
    setSearchQuery(val);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      const result = searchKB(val.trim(), activeTag);
      setEntries(result);
    }, 300);
  };

  // 标签筛选
  const handleTagClick = (tag) => {
    setActiveTag(tag);
    const result = searchKB(searchQuery.trim(), tag);
    setEntries(result);
  };

  // 新建
  const handleNew = (source = 'manual') => {
    setEditingEntry(null);
    setDefaultSource(source);
    setFormOpen(true);
  };

  // 编辑
  const handleEdit = (entry) => {
    setEditingEntry(entry);
    setFormOpen(true);
  };

  // 删除
  const handleDelete = (e, id) => {
    e.stopPropagation();
    if (!confirm('确定删除这条知识？')) return;
    removeKBEntry(id);
    refresh();
  };

  // 表单保存后刷新
  const handleFormClose = () => {
    setFormOpen(false);
    setEditingEntry(null);
    refresh();
  };

  // 条目来源图标
  const sourceIcon = { manual: '💭', feishu: '📥', web: '🔗' };
  const sourceLabel = { manual: '手动', feishu: '飞书', web: '网页' };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 顶栏 */}
      <div style={{
        display: 'flex', gap: '8px', alignItems: 'center',
        padding: '0 0 12px',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: '16px', fontWeight: '600', color: 'var(--s-text, #1c1c1e)', marginRight: '4px' }}>
          📚 知识库
        </span>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="搜索标题、正文、标签..."
          style={{
            flex: 1, minWidth: 0,
            padding: '8px 14px', borderRadius: '999px',
            border: '1px solid rgba(60,60,67,0.18)',
            fontSize: '13px', outline: 'none',
            background: 'rgba(255,255,255,0.6)', color: '#1c1c1e',
          }}
        />
        <button
          onClick={() => handleNew('feishu')}
          style={btnStyle(false)}
        >📥 飞书导入</button>
        <button
          onClick={() => handleNew('web')}
          style={btnStyle(false)}
        >📋 粘贴</button>
        <button
          onClick={() => handleNew('manual')}
          style={btnStyle(true)}
        >+ 新建</button>
      </div>

      {/* 主体 */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: '12px' }}>
        {/* 左侧标签栏 */}
        <div style={{
          width: '160px', flexShrink: 0,
          display: 'flex', flexDirection: 'column', gap: '3px',
          overflowY: 'auto',
        }}>
          <div style={{
            fontSize: '11px', fontWeight: '600',
            color: '#8e8e93', textTransform: 'uppercase',
            letterSpacing: '0.05em', margin: '4px 6px 8px',
          }}>筛选</div>
          <TagItem
            label="全部"
            count={entries.length}
            active={activeTag === null}
            onClick={() => handleTagClick(null)}
          />
          {tags.map(t => (
            <TagItem
              key={t.name}
              label={t.name}
              count={t.count}
              active={activeTag === t.name}
              onClick={() => handleTagClick(t.name)}
            />
          ))}
          <div
            onClick={() => handleNew('manual')}
            style={{
              padding: '6px 10px', borderRadius: '8px',
              fontSize: '12px', color: '#8e8e93', cursor: 'pointer',
              marginTop: '4px',
            }}
          >+ 新建标签</div>
        </div>

        {/* 右侧条目列表 */}
        <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', paddingRight: '4px' }}>
          {entries.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '60px 20px',
              color: '#8e8e93',
            }}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>📚</div>
              <div style={{ fontSize: '14px', marginBottom: '4px' }}>
                {searchQuery || activeTag ? '没有匹配的知识条目' : '知识库还是空的'}
              </div>
              <div style={{ fontSize: '12px' }}>
                {!searchQuery && !activeTag && '点击「新建」开始沉淀你的思考和阅读'}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {entries.map(entry => {
                const plainText = stripHtml(entry.content).slice(0, 100);
                return (
                  <div
                    key={entry.id}
                    onClick={() => handleEdit(entry)}
                    style={{
                      padding: '12px 14px', borderRadius: '12px',
                      background: 'rgba(255,255,255,0.7)',
                      border: '1px solid rgba(60,60,67,0.12)',
                      cursor: 'pointer', transition: 'border-color .15s',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.borderColor = 'rgba(var(--s-rgb),0.3)'}
                    onMouseLeave={(e) => e.currentTarget.style.borderColor = 'rgba(60,60,67,0.12)'}
                  >
                    {/* 第一行：图标 + 标题 + 来源 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                      <span style={{ fontSize: '14px' }}>{sourceIcon[entry.source] || '📝'}</span>
                      <span style={{
                        flex: 1, minWidth: 0,
                        fontSize: '14px', fontWeight: '500', color: '#1c1c1e',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>{entry.title}</span>
                      <span style={{
                        fontSize: '10px', color: '#8e8e93',
                        background: 'rgba(120,120,128,0.08)',
                        padding: '2px 6px', borderRadius: '999px',
                        flexShrink: 0,
                      }}>{sourceLabel[entry.source] || entry.source}</span>
                      <button
                        onClick={(e) => handleDelete(e, entry.id)}
                        style={{
                          border: 'none', background: 'transparent',
                          color: '#c7c7cc', cursor: 'pointer',
                          fontSize: '14px', padding: '2px 4px', flexShrink: 0,
                        }}
                        title="删除"
                      >✕</button>
                    </div>
                    {/* 摘要 */}
                    {plainText && (
                      <div style={{
                        fontSize: '12px', color: '#8e8e93', lineHeight: 1.5,
                        marginBottom: '8px',
                        display: '-webkit-box', WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical', overflow: 'hidden',
                      }}>{plainText}</div>
                    )}
                    {/* 标签 chips */}
                    {entry.tags && entry.tags.length > 0 && (
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {entry.tags.map(t => (
                          <span key={t} style={{
                            fontSize: '11px', color: 'var(--s-main)',
                            background: 'rgba(var(--s-rgb),0.06)',
                            padding: '2px 8px', borderRadius: '999px',
                          }}>{t}</span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 编辑/新建弹窗 */}
      <KnowledgeForm
        open={formOpen}
        onClose={handleFormClose}
        entry={editingEntry}
        defaultSource={defaultSource}
      />
    </div>
  );
}

// HTML → 纯文本（摘要用）
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

// 标签项
function TagItem({ label, count, active, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '6px 10px', borderRadius: '8px', cursor: 'pointer',
        background: active ? 'rgba(var(--s-rgb),0.08)' : 'transparent',
        fontSize: '13px', color: active ? 'var(--s-main)' : '#1c1c1e',
        fontWeight: active ? '500' : '400',
        transition: 'background .15s',
      }}
    >
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ fontSize: '11px', color: '#8e8e93', flexShrink: 0, marginLeft: '6px' }}>{count}</span>
    </div>
  );
}

// 按钮样式
function btnStyle(primary) {
  return {
    padding: '7px 12px', borderRadius: '8px',
    background: primary ? 'var(--s-grad-bg)' : 'rgba(255,255,255,0.7)',
    color: primary ? '#fff' : '#1c1c1e',
    border: primary ? 'none' : '1px solid rgba(60,60,67,0.18)',
    fontWeight: '500', fontSize: '12px', cursor: 'pointer',
    whiteSpace: 'nowrap',
  };
}
