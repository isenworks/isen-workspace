import { useState, useRef, useEffect } from 'react';
import Modal from './Modal.jsx';
import { addKBEntry, updateKBEntry } from '../utils/aiKnowledgeBase.js';

/* KnowledgeForm · 知识条目编辑弹窗（富文本编辑器）
   Props:
     - open
     - onClose
     - entry  编辑目标（null=新建）
     - defaultSource  新建时的默认来源（manual/feishu/web）
*/
export default function KnowledgeForm({ open, onClose, entry = null, defaultSource = 'manual' }) {
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [source, setSource] = useState('manual');
  const contentRef = useRef(null);

  const isEdit = !!entry;

  // 打开时填充
  useEffect(() => {
    if (!open) return;
    if (entry) {
      setTitle(entry.title || '');
      setTags((entry.tags || []).join(', '));
      setSourceUrl(entry.sourceUrl || '');
      setSource(entry.source || 'manual');
      // contentEditable 延迟填充（等 DOM 挂载）
      setTimeout(() => {
        if (contentRef.current) contentRef.current.innerHTML = entry.content || '';
      }, 0);
    } else {
      setTitle('');
      setTags('');
      setSourceUrl('');
      setSource(defaultSource);
      setTimeout(() => {
        if (contentRef.current) contentRef.current.innerHTML = '';
      }, 0);
    }
  }, [open, entry, defaultSource]);

  // 富文本工具栏命令
  const execCmd = (cmd, val = null) => {
    document.execCommand(cmd, false, val);
    contentRef.current?.focus();
  };

  // 保存
  const handleSave = () => {
    const content = contentRef.current?.innerHTML || '';
    if (!title.trim()) {
      // 用正文前 20 字当标题兜底
      const plain = content.replace(/<[^>]+>/g, '').trim();
      if (!plain) return;
    }
    const tagArr = tags.split(',').map(t => t.trim()).filter(Boolean);
    const data = {
      title: title.trim() || content.replace(/<[^>]+>/g, '').trim().slice(0, 30) || '无标题',
      content,
      source,
      sourceUrl: sourceUrl.trim(),
      tags: tagArr,
    };
    if (isEdit) {
      updateKBEntry(entry.id, data);
    } else {
      addKBEntry(data);
    }
    onClose?.();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? '编辑知识条目' : source === 'feishu' ? '📥 飞书导入' : '新建知识条目'}
      maxWidth={560}
      footer={
        <>
          <button
            onClick={onClose}
            style={{
              padding: '9px 16px', borderRadius: '10px',
              background: 'rgba(120,120,128,0.12)', color: '#1c1c1e',
              border: 'none', fontWeight: '600', fontSize: '14px', cursor: 'pointer', marginRight: '8px',
            }}
          >取消</button>
          <button
            onClick={handleSave}
            style={{
              padding: '9px 20px', borderRadius: '10px',
              background: 'var(--s-grad-bg)', color: '#fff',
              border: 'none', fontWeight: '600', fontSize: '14px', cursor: 'pointer',
            }}
          >保存</button>
        </>
      }
    >
      {/* 飞书导入提示 */}
      {source === 'feishu' && !isEdit && (
        <div style={{
          padding: '10px 12px', marginBottom: '16px', borderRadius: '8px',
          background: 'rgba(var(--s-rgb),0.06)', fontSize: '12px', color: 'var(--s-main)',
        }}>
          📥 请从飞书文档中复制内容，然后粘贴到下方编辑器。标题请手动填写。
        </div>
      )}

      {/* 标题 */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#1c1c1e', marginBottom: '6px' }}>
          标题
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="给这条知识起个标题"
          style={{
            width: '100%', padding: '10px 12px', borderRadius: '10px',
            border: '1px solid rgba(60,60,67,0.18)', fontSize: '14px',
            outline: 'none', background: '#fff', color: '#1c1c1e',
          }}
        />
      </div>

      {/* 富文本编辑器 */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#1c1c1e', marginBottom: '6px' }}>
          内容
        </label>
        {/* 工具栏 */}
        <div style={{
          display: 'flex', gap: '4px', padding: '4px',
          borderBottom: '1px solid rgba(60,60,67,0.18)',
          background: 'rgba(120,120,128,0.04)', borderTopLeftRadius: '10px', borderTopRightRadius: '10px',
        }}>
          <ToolbarBtn onClick={() => execCmd('bold')} label="B" style={{ fontWeight: 700 }} />
          <ToolbarBtn onClick={() => execCmd('italic')} label="I" style={{ fontStyle: 'italic' }} />
          <ToolbarBtn onClick={() => execCmd('insertUnorderedList')} label="• 列表" />
          <ToolbarBtn onClick={() => execCmd('insertOrderedList')} label="1. 列表" />
          <ToolbarBtn onClick={() => execCmd('formatBlock', '<h3>')} label="标题" />
          <ToolbarBtn onClick={() => execCmd('removeFormat')} label="清除格式" />
        </div>
        <div
          ref={contentRef}
          contentEditable
          suppressContentEditableWarning
          data-placeholder="记录你的思考、摘录或笔记...（支持粘贴富文本）"
          style={{
            minHeight: '180px', maxHeight: '320px', overflowY: 'auto',
            padding: '12px', fontSize: '14px', lineHeight: 1.6, color: '#1c1c1e',
            background: '#fff', outline: 'none',
            border: '1px solid rgba(60,60,67,0.18)', borderTop: 'none',
            borderBottomLeftRadius: '10px', borderBottomRightRadius: '10px',
          }}
        />
      </div>

      {/* 标签 */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#1c1c1e', marginBottom: '6px' }}>
          标签 <span style={{ fontSize: '11px', fontWeight: '400', color: '#8e8e93' }}>（逗号分隔）</span>
        </label>
        <input
          type="text"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="如：思考, 阅读摘录, 产品案例"
          style={{
            width: '100%', padding: '10px 12px', borderRadius: '10px',
            border: '1px solid rgba(60,60,67,0.18)', fontSize: '13px',
            outline: 'none', background: '#fff', color: '#1c1c1e',
          }}
        />
      </div>

      {/* 来源链接 */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#1c1c1e', marginBottom: '6px' }}>
          来源链接 <span style={{ fontSize: '11px', fontWeight: '400', color: '#8e8e93' }}>（可选，飞书/网页原链接）</span>
        </label>
        <input
          type="text"
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
          placeholder="https://..."
          style={{
            width: '100%', padding: '10px 12px', borderRadius: '10px',
            border: '1px solid rgba(60,60,67,0.18)', fontSize: '13px',
            outline: 'none', background: '#fff', color: '#1c1c1e',
          }}
        />
      </div>

      {/* 来源标记（新建时可改） */}
      {!isEdit && (
        <div style={{ display: 'flex', gap: '6px' }}>
          {[
            { key: 'manual', label: '💭 手动', },
            { key: 'feishu', label: '📥 飞书' },
            { key: 'web', label: '🔗 网页' },
          ].map(s => (
            <button
              key={s.key}
              onClick={() => setSource(s.key)}
              style={{
                padding: '6px 12px', borderRadius: '8px',
                background: source === s.key ? 'rgba(var(--s-rgb),0.08)' : 'rgba(120,120,128,0.06)',
                color: source === s.key ? 'var(--s-main)' : '#8e8e93',
                border: source === s.key ? '1px solid rgba(var(--s-rgb),0.3)' : '1px solid transparent',
                fontSize: '12px', fontWeight: '500', cursor: 'pointer',
              }}
            >{s.label}</button>
          ))}
        </div>
      )}

      {/* contentEditable placeholder 样式 */}
      <style>{`
        [contentEditable][data-placeholder]:empty::before {
          content: attr(data-placeholder);
          color: #8e8e93;
          pointer-events: none;
        }
      `}</style>
    </Modal>
  );
}

// 工具栏按钮
function ToolbarBtn({ onClick, label, style: extraStyle = {} }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      style={{
        padding: '4px 8px', borderRadius: '4px',
        background: 'transparent', border: 'none',
        fontSize: '12px', color: '#1c1c1e', cursor: 'pointer',
        ...extraStyle,
      }}
    >{label}</button>
  );
}
