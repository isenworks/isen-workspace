import { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { IconSearch, IconX } from './aiIcons.jsx';

/* 搜索弹窗（锚定式浮层）：
   收起时是 26px 胶囊按钮；点击在按钮下方弹出浮层（输入框 + 实时结果列表）；
   浮层左缘与按钮左端对齐（浮层直接落在按钮正下方，鼠标下移即可进入输入框）；
   支持关键词高亮、↑↓ 选择、Enter 打开、Esc / 点击外部关闭。
   Props:
     - results      [{ id, title, meta }]  待检索数据源（由父组件提供）
     - onPick(id)   选中某条结果的回调
     - placeholder  输入提示
     - emptyText    无结果文案
*/
export default function SearchPopover({ results = [], onPick, placeholder = '搜索', emptyText = '没有匹配结果' }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const [shiftX, setShiftX] = useState(0); // 视口内防溢出位移
  const inputRef = useRef(null);
  const rootRef = useRef(null);
  const PANEL_W = 292;

  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  // 浮层左缘对齐按钮左端；若右侧将超出视口，则整体左移仅够贴边（不越界）
  useLayoutEffect(() => {
    if (!open) { setShiftX(0); return; }
    const el = rootRef.current;
    if (!el) return;
    const left = el.getBoundingClientRect().left;
    const margin = 8;
    const overflow = left + PANEL_W - (window.innerWidth - margin);
    setShiftX(overflow > 0 ? -overflow : 0);
  }, [open]);

  const close = () => { setOpen(false); setQ(''); setSel(0); };

  // 关键词过滤：优先用 item.hay（含正文/标签）匹配，否则退回标题；空查询展示前 8 条
  const list = useMemo(() => {
    const kw = q.trim().toLowerCase();
    if (!kw) return results.slice(0, 8);
    return results.filter(r => String(r.hay || r.title || '').toLowerCase().includes(kw)).slice(0, 20);
  }, [results, q]);

  useEffect(() => { setSel(0); }, [q]);

  const pick = (item) => { if (!item) return; onPick?.(item.id); close(); };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(s + 1, list.length - 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(s - 1, 0)); return; }
    if (e.key === 'Enter') { e.preventDefault(); pick(list[sel]); }
  };

  return (
    <div ref={rootRef} className="relative flex-shrink-0">
      <button
        onClick={() => (open ? close() : setOpen(true))}
        className="w-[26px] h-[26px] rounded-full flex items-center justify-center text-ink-400 hover:bg-ink-50 hover:text-ink-600 transition-colors"
        title="搜索"
      >
        <IconSearch size={13} strokeWidth={2.2} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={close} />
          <div
            className="absolute top-[calc(100%+6px)] left-0 z-40 w-[292px] max-w-[calc(100vw-16px)] rounded-xl bg-white border border-ink-100 overflow-hidden"
            style={{ transform: `translateX(${shiftX}px)`, boxShadow: '0 12px 36px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.06)' }}
          >
            {/* 搜索输入 */}
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-ink-100/80">
              <span className="flex-shrink-0 text-ink-300"><IconSearch size={13} strokeWidth={2.2} /></span>
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={placeholder}
                className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[13px] text-ink-900 placeholder:text-ink-300"
              />
              {q && (
                <button
                  onClick={() => { setQ(''); inputRef.current?.focus(); }}
                  className="w-[18px] h-[18px] rounded-full flex items-center justify-center flex-shrink-0 text-ink-300 hover:text-ink-600 hover:bg-ink-100 transition-colors"
                  title="清除"
                >
                  <IconX size={11} />
                </button>
              )}
            </div>

            {/* 结果列表 */}
            <div className="max-h-[292px] overflow-y-auto nice-scroll py-1">
              {list.length === 0 ? (
                <div className="px-3 py-6 text-center text-[12px] text-ink-300">{q.trim() ? emptyText : '暂无可搜索内容'}</div>
              ) : (
                list.map((item, i) => (
                  <button
                    key={item.id}
                    onMouseEnter={() => setSel(i)}
                    onClick={() => pick(item)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${i === sel ? 'bg-ink-50' : ''}`}
                  >
                    <span className="flex-1 min-w-0 text-[12.5px] text-ink-900 truncate">
                      {hilite(item.title, q)}
                    </span>
                    {item.meta && (
                      <span className="flex-shrink-0 text-[10.5px] text-ink-300 tabular-nums">{item.meta}</span>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// 关键词高亮：大小写不敏感，返回片段数组
function hilite(text, q) {
  const s = String(text || '');
  const kw = String(q || '').trim();
  if (!kw) return s;
  const idx = s.toLowerCase().indexOf(kw.toLowerCase());
  if (idx === -1) return s;
  return (
    <>
      {s.slice(0, idx)}
      <span style={{ color: 'var(--s-main)', fontWeight: 600 }}>{s.slice(idx, idx + kw.length)}</span>
      {s.slice(idx + kw.length)}
    </>
  );
}