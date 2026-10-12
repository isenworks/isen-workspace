import { useState, useEffect } from 'react';
import Modal from './Modal.jsx';
import { IconBook } from './aiIcons.jsx';

/* KnowledgeBookForm · 知识库（书架）新建 / 编辑弹窗
   风格对齐工作台 Modal；字段：名称（必填）+ 简介 + 可选图标 / 主题色
   Props:
     - open
     - onClose
     - book   编辑目标（null = 新建）
     - onSave(data)  data = { name, desc, icon, color }
*/

// 可选图标（emoji，留空 = 默认书本图标）
const ICONS = ['', '📕', '📗', '📘', '📙', '📚', '🗂️', '💡', '⭐'];
// 可选主题色（留空 = 跟随全局主题色）
const COLORS = ['', '#007AFF', '#FF9500', '#AF52DE', '#FF375F'];

const NAME_MAX = 50;
const DESC_MAX = 150;

export default function KnowledgeBookForm({ open, onClose, book = null, onSave }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [icon, setIcon] = useState('');
  const [color, setColor] = useState('');

  const isEdit = !!book;

  useEffect(() => {
    if (!open) return;
    setName(book?.name || '');
    setDesc(book?.desc || '');
    setIcon(book?.icon || '');
    setColor(book?.color || '');
  }, [open, book]);

  const submit = () => {
    if (!name.trim()) return;
    onSave?.({ name: name.trim(), desc: desc.trim(), icon, color });
    onClose?.();
  };

  const labelCls = 'block text-[12.5px] font-semibold text-ink-700 mb-1.5';
  const fieldCls = 'w-full px-3 py-1.5 rounded-lg text-[13px] bg-white border border-ink-200 focus:border-[var(--s-main)] focus:outline-none transition-colors';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? '编辑知识库' : '新建知识库'}
      maxWidth={480}
      footer={
        <>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-[13px] font-medium text-ink-600 bg-ink-100 hover:bg-ink-200/70 transition-colors"
          >取消</button>
          <button
            onClick={submit}
            disabled={!name.trim()}
            className="px-4 py-1.5 rounded-lg text-[13px] font-semibold text-white transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'var(--s-grad-bg)', boxShadow: '0 2px 6px rgba(var(--s-rgb),0.25)' }}
          >{isEdit ? '保存' : '创建'}</button>
        </>
      }
    >
      {/* 名称 */}
      <div className="mb-3">
        <label className={labelCls}>名称 <span className="text-[#FF3B30]">*</span></label>
        <div className="relative">
          <input
            type="text"
            value={name}
            maxLength={NAME_MAX}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            placeholder="输入知识库名称，例如：写作灵感库"
            className={`${fieldCls} pr-16`}
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-ink-400 tabular-nums">
            {name.length} / {NAME_MAX}
          </span>
        </div>
      </div>

      {/* 简介 */}
      <div className="mb-3">
        <label className={labelCls}>简介 <span className="font-normal text-ink-400">（可选）</span></label>
        <div className="relative">
          <textarea
            value={desc}
            maxLength={DESC_MAX}
            onChange={(e) => setDesc(e.target.value)}
            rows={3}
            placeholder="描述下你的知识库，例如：收集日常观察、有趣的对话、突发奇想"
            className={`${fieldCls} resize-none pb-6`}
          />
          <span className="absolute right-3 bottom-2 text-[11px] text-ink-400 tabular-nums">
            {desc.length} / {DESC_MAX}
          </span>
        </div>
      </div>

      {/* 图标 */}
      <div className="mb-3">
        <label className={labelCls}>图标 <span className="font-normal text-ink-400">（可选）</span></label>
        <div className="flex items-center gap-1.5 flex-wrap">
          {ICONS.map((ic) => {
            const active = icon === ic;
            return (
              <button
                key={ic || 'default'}
                type="button"
                onClick={() => setIcon(ic)}
                className={`w-8 h-8 rounded-lg flex items-center justify-center text-[15px] transition-colors ${
                  active ? 'bg-[rgba(var(--s-rgb),0.1)]' : 'bg-ink-50 hover:bg-ink-100'
                }`}
                style={active ? { boxShadow: 'inset 0 0 0 1px rgba(var(--s-rgb),0.4)' } : {}}
                title={ic ? ic : '默认图标'}
              >
                {ic || <span className="flex text-ink-400"><IconBook size={14} /></span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* 主题色 */}
      <div className="mb-1">
        <label className={labelCls}>主题色 <span className="font-normal text-ink-400">（可选）</span></label>
        <div className="flex items-center gap-2">
          {COLORS.map((c) => {
            const active = color === c;
            const fill = c || 'var(--s-main)';
            return (
              <button
                key={c || 'default'}
                type="button"
                onClick={() => setColor(c)}
                className={`w-7 h-7 rounded-full transition-transform ${active ? 'scale-110' : 'hover:scale-105'}`}
                style={{
                  background: fill,
                  boxShadow: active ? `0 0 0 2px #fff, 0 0 0 4px ${fill}` : 'none',
                }}
                title={c || '跟随主题色'}
              />
            );
          })}
        </div>
      </div>
    </Modal>
  );
}