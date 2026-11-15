// 卡片头：模块色竖条 + 标题 + 右侧自定义动作位 + 查看入口（右上箭头）
// 首页各卡片与「关系」卡共用，保证色条宽度 / 字号 / 动作按钮完全一致
const modColor = (k) => `var(--m-${k})`;
const modRgba = (k, a) => `rgba(var(--m-${k}-rgb),${a})`;

export default function CardHead({ moduleKey, title, sub, onClick, action, extra }) {
  const color = moduleKey ? modColor(moduleKey) : 'var(--s-main)';
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="w-[5px] h-[18px] rounded-full flex-shrink-0" style={{ background: color }} />
        <span className="text-[15px] font-bold text-ink-900 truncate">{title}</span>
        {sub ? <span className="text-[11px] text-ink-400 flex-shrink-0">{sub}</span> : null}
        {extra}
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {action}
        {onClick ? (
          <button
            onClick={onClick}
            className="hp-more w-[26px] h-[26px] rounded-lg grid place-items-center flex-shrink-0 transition active:scale-95"
            style={{ color, background: moduleKey ? modRgba(moduleKey, 0.08) : 'rgba(var(--s-rgb),0.06)', '--hc': color }}
            title="查看"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17L17 7"/><path d="M8 7h9v9"/></svg>
          </button>
        ) : null}
      </div>
    </div>
  );
}
