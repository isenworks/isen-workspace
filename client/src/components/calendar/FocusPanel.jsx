import { useState, useMemo } from 'react';
import { MODULES, keyToModule, paceStatus } from '../../utils/categoryMapping.js';

/* —— 年度规划同源 CategoryIcon（不用 emoji，直接复用 Lucide 线形白图标印章）—— */
function CategoryIcon({ catKey, className }) {
  const cls = className || 'w-4 h-4';
  return (
    <svg className={cls} fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      {catKey === 'energy'    && (<><path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7Z"/><path d="M3.2 12H9l1.5-3 2.5 5.5L15 12h5.2"/></>)}
      {catKey === 'cognition' && (<><path d="M2.06 12.35a1 1 0 0 1 0-.7 11.5 11.5 0 0 1 19.88 0 1 1 0 0 1 0 .7 11.5 11.5 0 0 1-19.88 0"/><circle cx="12" cy="12" r="3"/></>)}
      {catKey === 'ability'   && (<><path d="M12 2 15.1 8.3 22 9.3l-5 4.9 1.2 6.9L12 17.8l-6.2 3.3L7 14.2 2 9.3l6.9-1z"/></>)}
      {catKey === 'work'      && (<><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/></>)}
      {catKey === 'life'      && (<><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.9 4.9 1.4 1.4"/><path d="m17.7 17.7 1.4 1.4"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.3 17.7-1.4 1.4"/><path d="m19.1 4.9-1.4 1.4"/></>)}
    </svg>
  );
}

/* 模块 key → 英文标签（与年度规划同源，便于全站识别） */
const MOD_EN = {
  energy:    'ENERGY',
  cognition: 'COGNITION',
  ability:   'ABILITY',
  work:      'WORK',
  life:      'LIFE',
};

/* 纯白背景 + 最优"壳边缘"配方（iOS Cards 标准）
   · 背景：完全 #fff —— 干净，不引入任何灰度，印章/胶囊/进度条的彩色
     就能用最高对比度承担"区分模块"的唯一职能（之前的灰底一直在稀释彩色信号）
   · 描边：1.5px × 10%（中性850 纯黑 10%，软但明确；1px会糊、2px会重）
   · 阴影双层（Apple 近年卡片统一配方）：
     1) 0 1px 2px × 5%   —— 近距"贴边地平面"阴影，解决边缘落在哪里
     2) 0 4px 14px × 4%  —— 远距柔光浮起，表达层级（这层最让卡片像真的"站"在背景上）
   · 顶缘 1px 白高光保留，但从 80% 降到 60%，因为现在是纯白底，高光再强就会
     与背景融为一体 → 改为 60%+0.02的近白（比纯白略冷半度），形成极细边缘光泽
   · hover：描边 14% + 阴影加厚远距层到 0 6px 20px × 6%，不引入彩色 */
const GROUP_SURFACE = {
  background:   '#ffffff',
  border:       '1.5px solid rgba(15,23,42,0.10)',
  boxShadow:    [
    'inset 0 1px 0 rgba(255,255,255,0.60)',
    '0 1px 2px rgba(15,23,42,0.05)',
    '0 4px 14px rgba(15,23,42,0.04)',
  ].join(', '),
  hoverBorder:  '1.5px solid rgba(15,23,42,0.14)',
  hoverShadow:  [
    'inset 0 1px 0 rgba(255,255,255,0.70)',
    '0 1px 2px rgba(15,23,42,0.06)',
    '0 6px 20px rgba(15,23,42,0.06)',
  ].join(', '),
};

/**
 * 主线任务面板（本月/本周共用）
 * · 方案 A：去掉左侧色条
 *   - 容器：略微加深中性底色 + 中性软描边（不引入模块色硬边缘）
 *   - 分组头：ICON 印章 22×22 + 中英双字标签胶囊
 *   - 计数：done/total 放进模块色胶囊（无 ✓）
 *   - 每个模块可收起
 */
export default function FocusPanel({
  type = 'month',
  accentColor = '#007AFF',
  title,
  tasks = [],
  progressPct = 0,
  timePct = 0,
  onToggle,
  onAdd,
  headerExtra,
}) {
  // 按模块分组
  const grouped = useMemo(
    () => MODULES.filter(m => m.key !== 'others').map(mod => ({
      ...mod,
      items: tasks.filter(t => t.moduleKey === mod.key),
    })).filter(g => g.items.length > 0),
    [tasks]
  );

  const totalDone = useMemo(() => tasks.filter(t => t.done).length, [tasks]);
  const pace = paceStatus(progressPct, timePct);

  /* 折叠状态：以面板 title 为作用域，避免月/周面板相互影响 */
  const [collapsed, setCollapsed] = useState({});
  const isCollapsed = (key) => !!collapsed[key];
  const toggleGroup = (key) => setCollapsed(s => ({ ...s, [key]: !s[key] }));

  return (
    <div className="card p-4" style={{
      background: '#fff',
      borderRadius: '18px',
      boxShadow: '0 0 0 1px rgba(0,0,0,0.04), 0 8px 32px rgba(0,0,0,0.05)',
    }}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-[5px] h-[18px] rounded-[3px] flex-shrink-0" style={{ background: accentColor }} />
        <div className="flex-1 min-w-0 text-[15px] font-extrabold text-[#1C1C1E] tracking-tight">
          {title}
        </div>
        <div className="flex items-center gap-2">
          <span
            className="px-2.5 py-0.5 rounded-full text-[12px] font-bold tabular-nums"
            style={{ color: pace.color, background: pace.bg }}
          >
            {pace.label}
          </span>
          <button
            onClick={onAdd}
            className="w-6 h-6 rounded-lg flex items-center justify-center text-[#8E8E93] hover:bg-[rgba(120,120,128,0.10)] hover:text-[#007AFF] transition"
            aria-label="新增主线任务"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>
      </div>

      {/* 额外头部内容 */}
      {headerExtra && <div className="mt-2">{headerExtra}</div>}

      {/* 分隔线 */}
      <div className="h-px my-3" style={{ background: `linear-gradient(90deg, transparent, ${accentColor}14, transparent)` }} />

      {/* 分组列表：方案 A · 无左色条 */}
      <div className="flex flex-col gap-[8px]">
        {grouped.map(grp => {
          const doneN = grp.items.filter(i => i.done).length;
          const totalN = grp.items.length;
          const off = isCollapsed(grp.key);
          return (
            <div
              key={grp.key}
              className="rounded-2xl transition-[background-color,border-color,box-shadow]"
              style={{
                background: GROUP_SURFACE.background,
                border: GROUP_SURFACE.border,
                boxShadow: GROUP_SURFACE.boxShadow,
                padding: '8px 10px',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.border = GROUP_SURFACE.hoverBorder;
                e.currentTarget.style.boxShadow = GROUP_SURFACE.hoverShadow;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.border = GROUP_SURFACE.border;
                e.currentTarget.style.boxShadow = GROUP_SURFACE.boxShadow;
              }}
            >
              {/* 分组头（整行点击切换折叠）
                  · 印章 22×22 深填充 + 白色线条 CategoryIcon（与年度规划 CardHead 同源）
                  · 中英双字标签胶囊（软填充 = 8% × 模块色）
                  · 计数：done/total 进模块色胶囊（删除 ✓）
                  · 折叠箭头 */}
              <div
                className="flex items-center gap-2 select-none cursor-pointer"
                onClick={() => toggleGroup(grp.key)}
                role="button"
                aria-expanded={!off}
              >
                {/* 1. ICON 印章 */}
                <span
                  className="flex-shrink-0 rounded-[7px] grid place-items-center"
                  style={{
                    width: 22, height: 22, color: '#fff', background: grp.color,
                    boxShadow: `0 2px 5px ${grp.color}3A`,
                  }}
                >
                  <CategoryIcon catKey={grp.key} className="w-[13px] h-[13px]" />
                </span>

                {/* 2. 中 + EN 双字胶囊 */}
                <span
                  className="inline-flex items-center gap-1.5 px-2 py-[3px] rounded-full"
                  style={{ background: `${grp.color}14` }}
                >
                  <span className="text-[12px] font-extrabold leading-none" style={{ color: grp.color }}>{grp.label}</span>
                  <span className="text-[9.5px] font-extrabold tracking-widest leading-none" style={{ color: `${grp.color}B0` }}>{MOD_EN[grp.key]}</span>
                </span>

                {/* 3. 计数 1/3 胶囊（无 ✓） */}
                <span
                  className="ml-auto inline-flex items-center px-2 py-[3px] rounded-full text-[11px] font-extrabold tabular-nums gap-[2px]"
                  style={{ background: `${grp.color}18`, color: grp.color }}
                >
                  <span>{doneN}</span>
                  <span style={{ opacity: 0.35 }}>/</span>
                  <span style={{ opacity: 0.80 }}>{totalN}</span>
                </span>

                {/* 4. 折叠箭头 */}
                <svg
                  className={`w-[15px] h-[15px] flex-shrink-0 transition-transform duration-200 ${off ? '' : 'rotate-180'}`}
                  style={{ color: `${grp.color}C0` }}
                  fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"
                >
                  <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>

              {/* 折叠内容体 */}
              {!off && (
                <div className="flex flex-col gap-[2px] mt-[6px]">
                  {grp.items.map(task => {
                    const mod = keyToModule(task.moduleKey);
                    const pct = Math.round((task.progress || 0) * 100);
                    return (
                      <div
                        key={task.id}
                        className="flex items-center gap-3 px-2 py-1.5 rounded-[12px] transition cursor-pointer"
                        onClick={() => onToggle?.(task.id)}
                        onMouseEnter={(e) => { e.currentTarget.style.background = `${grp.color}12`; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                      >
                        {/* 圆复选框 */}
                        <div
                          className="w-[18px] h-[18px] rounded-full flex-shrink-0 border-[1.5px] flex items-center justify-center transition"
                          style={{
                            borderColor: task.done ? mod.color : `${mod.color}55`,
                            background: task.done ? mod.color : '#fff',
                            boxShadow: task.done ? `0 2px 6px ${mod.color}40` : 'none',
                          }}
                        >
                          {task.done && (
                            <svg width="8" height="10" viewBox="0 0 8 10" fill="none">
                              <path
                                d="M1 4.5L3.5 7L7 1.5"
                                stroke="#fff"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          )}
                        </div>

                        {/* 左侧标题区 */}
                        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                          <span
                            className={`text-[13px] font-semibold leading-tight truncate ${
                              task.done ? 'text-[#8E8E93] line-through' : 'text-[#1C1C1E]'
                            }`}
                          >
                            {task.title}
                          </span>
                          <div className="flex items-center gap-2 text-[11px] font-medium text-[#8E8E93]">
                            {task.srcTag && (
                              <span
                                className="px-1.5 py-0.5 rounded text-[10px] font-bold"
                                style={{
                                  background: task.srcTagColor || mod.soft,
                                  color: task.srcTagTextColor || mod.color,
                                }}
                              >
                                {task.srcTag}
                              </span>
                            )}
                            {task.dueDate && <span>{task.dueDate}</span>}
                            {task.note && <span>{task.note}</span>}
                          </div>
                        </div>

                        {/* 右侧进度 */}
                        <div className="flex-shrink-0 flex flex-col items-end gap-1 min-w-[80px]">
                          <span className="text-[12px] font-extrabold tabular-nums" style={{ color: task.done ? mod.color : '#1C1C1E' }}>
                            {pct}%
                          </span>
                          <div className="w-[72px] h-[6px] rounded-full overflow-hidden" style={{ background: `${mod.color}18` }}>
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${pct}%`, background: mod.color, boxShadow: pct > 0 ? `0 1px 3px ${mod.color}40` : 'none' }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 空状态 */}
      {grouped.length === 0 && (
        <div className="py-8 text-center">
          <div className="text-[12px] text-[#8E8E93]">
            {type === 'month' ? '本月还没有主线任务' : '本周还没有主线任务'}
          </div>
          <div className="text-[12px] text-[#8E8E93] mt-1">
            从年度规划一键同步 或 点右上角 + 新建
          </div>
        </div>
      )}

      {/* 底部统计 */}
      {grouped.length > 0 && (
        <div className="mt-3 pt-3 text-[12px] font-medium flex items-center justify-between" style={{ borderTop: '1px solid rgba(60,60,67,0.06)', color: '#636366' }}>
          <span>共 {tasks.length} 项 · 已完成 <span style={{ color: accentColor, fontWeight: 700 }}>{totalDone}</span></span>
          <span className="tabular-nums font-bold" style={{ color: accentColor }}>{progressPct}%</span>
        </div>
      )}
    </div>
  );
}
