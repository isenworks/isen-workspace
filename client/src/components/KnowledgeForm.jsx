import { useState, useRef, useEffect } from 'react';
import Modal from './Modal.jsx';
import { addKBEntry, updateKBEntry } from '../utils/aiKnowledgeBase.js';
import { IconImport, IconPen, IconLink } from './aiIcons.jsx';

/* KnowledgeForm · 知识文档编辑弹窗（富文本编辑器，风格对齐工作台 Modal）
   Props:
     - open
     - onClose
     - entry  编辑目标（null=新建）
     - defaultSource  新建时的默认来源（manual/feishu/web）
     - kbId   新建文档归属的知识库
     - group  新建文档的默认分组（章节名）
*/
export default function KnowledgeForm({ open, onClose, entry = null, defaultSource = 'manual', kbId = null, group = '' }) {
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState('');
  const [groupName, setGroupName] = useState('');
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
      setGroupName(entry.group || '');
      setSourceUrl(entry.sourceUrl || '');
      setSource(entry.source || 'manual');
      setTimeout(() => {
        if (contentRef.current) contentRef.current.innerHTML = entry.content || '';
      }, 0);
    } else {
      setTitle('');
      setTags('');
      setGroupName(group || '');
      setSourceUrl('');
      setSource(defaultSource);
      setTimeout(() => {
        if (contentRef.current) contentRef.current.innerHTML = '';
      }, 0);
    }
  }, [open, entry, defaultSource, group]);

  // 富文本工具栏命令
  const execCmd = (cmd, val = null) => {
    document.execCommand(cmd, false, val);
    contentRef.current?.focus();
  };

  // 保存
  const handleSave = () => {
    const content = contentRef.current?.innerHTML || '';
    const plain = content.replace(/<[^>]+>/g, '').trim();
    if (!title.trim() && !plain) return;
    const tagArr = tags.split(/[,，]/).map(t => t.trim()).filter(Boolean);
    const data = {
      title: title.trim() || plain.slice(0, 30) || '无标题',
      content,
      source,
      sourceUrl: sourceUrl.trim(),
      tags: tagArr,
      group: groupName.trim(),
    };
    if (isEdit) {
      updateKBEntry(entry.id, data);
    } else {
      addKBEntry({ ...data, kbId });
    }
    onClose?.();
  };

  const inputCls = "w-full px-3 py-1.5 rounded-lg text-[13px] bg-white border border-ink-200 focus:border-[var(--s-main)] focus:outline-none transition-colors";
  const labelCls = "block text-[12.5px] font-semibold text-ink-700 mb-1.5";

  // 来源选项元数据
  const SOURCE_OPTIONS = [
    { key: 'manual', label: '手动记录', icon: IconPen },
    { key: 'feishu', label: '飞书', icon: IconImport },
    { key: 'web', label: '网页', icon: IconLink },
  ];
  const SrcIcon = SOURCE_OPTIONS.find(s => s.key === source)?.icon || IconPen;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? '编辑文档' : '新建文档'}
      maxWidth={560}
      footer={
        <>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-[13px] font-medium text-ink-600 bg-ink-100 hover:bg-ink-200/70 transition-colors"
          >取消</button>
          <button
            onClick={handleSave}
            className="px-4 py-1.5 rounded-lg text-[13px] font-semibold text-white transition-all active:scale-[0.98]"
            style={{ background: 'var(--s-grad-bg)', boxShadow: '0 2px 6px rgba(var(--s-rgb),0.25)' }}
          >保存</button>
        </>
      }
    >
      {/* 标题 */}
      <div className="mb-3">
        <label className={labelCls}>标题</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="给这条知识起个标题"
          className={inputCls}
        />
      </div>

      {/* 富文本编辑器 */}
      <div className="mb-3">
        <label className={labelCls}>内容</label>
        {/* 工具栏 */}
        <div className="flex items-center gap-0.5 px-1.5 py-1 rounded-t-lg border border-b-0 border-ink-200 bg-ink-50">
          <ToolbarBtn onClick={() => execCmd('bold')} label="B" style={{ fontWeight: 700 }} title="加粗" />
          <ToolbarBtn onClick={() => execCmd('italic')} label="I" style={{ fontStyle: 'italic', fontFamily: 'Georgia, serif' }} title="斜体" />
          <ToolbarBtn onClick={() => execCmd('insertUnorderedList')} label={
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><circle cx="3.5" cy="6" r="1" fill="currentColor" stroke="none" /><circle cx="3.5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="3.5" cy="18" r="1" fill="currentColor" stroke="none" /></svg>
          } title="无序列表" />
          <ToolbarBtn onClick={() => execCmd('formatBlock', '<h3>')} label="H" title="小标题" />
          <ToolbarBtn onClick={() => execCmd('removeFormat')} label={
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7V4h16v3" /><path d="M5 20h6" /><path d="M13 4 8 20" /></svg>
          } title="清除格式" />
        </div>
        <div
          ref={contentRef}
          contentEditable
          suppressContentEditableWarning
          data-placeholder="开始记录…"
          className="min-h-[180px] max-h-[320px] overflow-y-auto px-3 py-2.5 rounded-b-lg text-[13.5px] leading-relaxed text-ink-900 bg-white border border-ink-200 focus:border-[var(--s-main)] focus:outline-none"
        />
      </div>

      {/* 标签 */}
      <div className="mb-3">
        <label className={labelCls}>标签 <span className="font-normal text-ink-400">（逗号分隔）</span></label>
        <input
          type="text"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="如：思考, 阅读摘录, 产品案例"
          className={inputCls}
        />
      </div>

      {/* 分组（章节） */}
      <div className="mb-3">
        <label className={labelCls}>分组 <span className="font-normal text-ink-400">（章节名，留空则归入「未分组」）</span></label>
        <input
          type="text"
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          placeholder="如：第一章 · 用户研究"
          className={inputCls}
        />
      </div>

      {/* 来源 */}
      <div className="mb-3">
        <label className={labelCls}>来源</label>
        <div className="flex items-center gap-1.5">
          {SOURCE_OPTIONS.map(s => {
            const SIcon = s.icon;
            const active = source === s.key;
            return (
              <button
                key={s.key}
                onClick={() => setSource(s.key)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] transition-colors ${
                  active ? 'text-[var(--s-main)] font-semibold bg-[rgba(var(--s-rgb),0.06)]' : 'text-ink-600 bg-ink-50 hover:bg-ink-100'
                }`}
                style={active ? { boxShadow: 'inset 0 0 0 1px rgba(var(--s-rgb),0.35)' } : {}}
              >
                <SIcon size={12} />
                {s.label}
              </button>
            );
          })}
          {/* 来源链接 */}
          <input
            type="text"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="原文链接（可选）"
            className="flex-1 min-w-0 px-3 py-1.5 rounded-lg text-[12.5px] bg-white border border-ink-200 focus:border-[var(--s-main)] focus:outline-none transition-colors"
          />
        </div>
      </div>

      {/* contentEditable placeholder 样式 */}
      <style>{`
        [contentEditable][data-placeholder]:empty::before {
          content: attr(data-placeholder);
          color: #b3bab8;
          pointer-events: none;
        }
      `}</style>
    </Modal>
  );
}

// 工具栏按钮
function ToolbarBtn({ onClick, label, style: extraStyle = {}, title }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
      className="w-[26px] h-[24px] rounded-md flex items-center justify-center text-ink-600 hover:bg-ink-100 transition-colors text-[12px]"
      style={extraStyle}
    >{label}</button>
  );
}
