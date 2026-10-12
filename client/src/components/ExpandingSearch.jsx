import { useState, useRef, useEffect } from 'react';
import { IconSearch, IconX } from './aiIcons.jsx';

/* 展开式搜索（Notion/Linear 式）：
   收起时是 26px 胶囊按钮，点击原地展开成输入框并聚焦；
   空值失焦 / Esc 自动收起；有搜索词时收起态保持主题色高亮（筛选中提示）。
   Props:
     - value / onChange(text)  受控搜索词
     - placeholder  输入提示
*/
export default function ExpandingSearch({ value = '', onChange, placeholder = '搜索' }) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const close = () => { setOpen(false); onChange(''); };

  const filtering = !open && !!value.trim();

  return (
    <div
      onClick={() => { if (!open) setOpen(true); }}
      className={`flex items-center flex-shrink-0 h-[26px] rounded-full border overflow-hidden transition-all duration-200 ease-out ${
        open ? 'w-[176px] pl-2.5 pr-1 bg-white cursor-text' : 'w-[26px] justify-center'
      } ${open || filtering ? '' : 'border-transparent hover:bg-ink-50 cursor-pointer'}`}
      style={open
        ? { borderColor: 'var(--s-main)', boxShadow: '0 1px 4px rgba(var(--s-rgb),0.12)' }
        : filtering
          ? { borderColor: 'transparent', background: 'rgba(var(--s-rgb),0.1)', color: 'var(--s-main)' }
          : { borderColor: 'transparent', color: '#8a9491' }}
      title={open ? undefined : '搜索'}
    >
      <span className="flex-shrink-0 flex items-center"><IconSearch size={13} strokeWidth={2.2} /></span>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => { if (!value.trim()) setOpen(false); }}
        onKeyDown={(e) => { if (e.key === 'Escape') close(); }}
        placeholder={placeholder}
        className={`min-w-0 bg-transparent border-0 outline-none text-[12px] text-ink-900 placeholder:text-ink-300 transition-all duration-200 ${
          open ? 'flex-1 ml-1.5' : 'w-0 ml-0 p-0'
        }`}
        tabIndex={open ? 0 : -1}
      />
      {open && value && (
        <button
          onClick={(e) => { e.stopPropagation(); close(); }}
          className="w-[18px] h-[18px] rounded-full flex items-center justify-center flex-shrink-0 text-ink-300 hover:text-ink-600 hover:bg-ink-100 transition-colors"
          title="清除并收起"
        >
          <IconX size={11} />
        </button>
      )}
    </div>
  );
}
