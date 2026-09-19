import React from 'react';
import Modal from './Modal.jsx';

/* 键盘快捷键说明弹窗
 * - 分组：全局单键 / 组合键
 * - 每行：左描述 + 右 kbd 键位
 * - 风格对齐系统偏好设置：浅灰底键位、细边框、tabular-nums
 */

// 快捷键数据（与 Workspace.jsx / Sidebar.jsx 实际实现保持同步）
const GLOBAL_SHORTCUTS = [
  { keys: ['N'], desc: '快速记录' },
  { keys: ['Shift', 'N'], desc: '打开收集箱' },
  { keys: ['S'], desc: '新建事项' },
  { keys: ['G'], desc: '新建目标' },
  { keys: ['D'], desc: '今日总结' },
];

const COMBO_SHORTCUTS = [
  { keys: ['Ctrl', 'S'], desc: '保存 / 同步', macKeys: ['⌘', 'S'] },
  { keys: ['Ctrl', 'B'], desc: '折叠 / 展开侧边栏', macKeys: ['⌘', 'B'] },
];

// 检测是否 macOS，决定显示 ⌘ 还是 Ctrl
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

function KeyCap({ children }) {
  return (
    <kbd
      className="inline-flex items-center justify-center h-[22px] px-[6px] text-[11px] font-semibold tabular-nums rounded-md"
      style={{
        minWidth: '22px',
        background: 'linear-gradient(180deg, #fafafa 0%, #f0f0f0 100%)',
        border: '1px solid rgba(0,0,0,0.1)',
        boxShadow: '0 1px 0 rgba(0,0,0,0.06), 0 1px 1px rgba(0,0,0,0.04)',
        color: '#1c1c1e',
        lineHeight: 1,
      }}
    >
      {children}
    </kbd>
  );
}

function ShortcutRow({ keys, desc, macKeys }) {
  const displayKeys = (isMac && macKeys) ? macKeys : keys;

  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-[13px] text-ink-700">{desc}</span>
      <div className="flex items-center gap-1">
        {displayKeys.map((k, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span className="text-[10px] text-ink-300 mx-0.5">+</span>}
            <KeyCap>{k}</KeyCap>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function Section({ title, items }) {
  return (
    <div className="mb-4 last:mb-0">
      <div
        className="text-[11px] font-semibold text-ink-400 uppercase tracking-wider mb-1.5 px-1"
      >
        {title}
      </div>
      <div
        className="rounded-xl overflow-hidden"
        style={{
          background: 'rgba(255,255,255,0.6)',
          border: '1px solid rgba(0,0,0,0.06)',
        }}
      >
        {items.map((item, i) => (
          <div
            key={i}
            className="px-3"
            style={{
              borderTop: i > 0 ? '1px solid rgba(0,0,0,0.05)' : 'none',
            }}
          >
            <ShortcutRow {...item} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ShortcutsModal({ open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title="键盘快捷键" maxWidth={380}>
      <div className="flex flex-col">
        <Section title="全局" items={GLOBAL_SHORTCUTS} />
        <Section title="组合键" items={COMBO_SHORTCUTS} />
        <div className="text-[11px] text-ink-300 text-center pt-1 flex items-center justify-center gap-1 flex-wrap">
          按 <KeyCap>Esc</KeyCap> 关闭 · 按 <KeyCap>?</KeyCap> 随时打开
        </div>
      </div>
    </Modal>
  );
}
