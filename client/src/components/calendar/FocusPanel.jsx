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

/* 纯白背景 + 弱化阴影 + 顶 3px 模块色渐变条
   · 阴影：移除之前的远距厚层（0 4px 14px），只保留单层近距 0 1px 2px × 3%，
     再额外叠一层 0 0 0 1px × 3% 的外描边柔影 —— "似有似无"的存在感，
     不再"浮起来"，而是"稳稳地平铺在面板上的一张小卡片"
   · 顶条 3px：用 overflow-hidden 的容器 + padding-top 预留位置，
     再放一条 linear-gradient 模块色渐变横条，完全在内部，不碰 rounded-2xl 圆角
   · hover：只微微加深描边（10→13%），阴影不变厚，保持整体轻量 */
const GROUP_SURFACE = {
  background:   '#ffffff',
  border:       '1.5px solid rgba(15,23,42,0.10)',
  boxShadow:    [
    '0 0 0 1px rgba(15,23,42,0.03)',
    '0 1px 2px rgba(15,23,42,0.03)',
  ].join(', '),
  hoverBorder:  '1.5px solid rgba(15,23,42,0.13)',
  hoverShadow:  [
    '0 0 0 1px rgba(15,23,42,0.04)',
    '0 1px 2px rgba(15,23,42,0.03)',
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
          {/* 卡片右上：持平/超前/落后标签 → 统一改为完成/总数 胶囊（2/9 规格，与分组头同构但用面板 accentColor） */}
          <span
            className="inline-flex items-center px-2 py-[3px] rounded-full text-[11px] font-extrabold tabular-nums gap-[2px]"
            style={{ background: `${accentColor}18`, color: accentColor }}
          >
            <span>{totalDone}</span>
            <span style={{ opacity: 0.35 }}>/</span>
            <span style={{ opacity: 0.80 }}>{tasks.length}</span>
          </span>
          {/* +号印章：圆角方填充（与能力页 AnnualPlan.jsx L5095 加号设计同构：rounded-lg + 色软填充 1a + stroke=主题色 + w3.5 h3.5） */}
          <button
            onClick={onAdd}
            className="w-[26px] h-[26px] rounded-lg grid place-items-center transition hover:brightness-105 active:scale-[0.97] flex-shrink-0"
            style={{ background: `${accentColor}1a` }}
            aria-label="新增主线任务"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke={accentColor} strokeWidth="2.5" viewBox="0 0 24 24" strokeLinecap="round">
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
              className="rounded-2xl overflow-hidden transition-[background-color,border-color,box-shadow]"
              style={{
                background: GROUP_SURFACE.background,
                border: GROUP_SURFACE.border,
                boxShadow: GROUP_SURFACE.boxShadow,
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
      {/* 顶 3px 模块色「纯色」条（去掉渐变，视觉更干净） */}
              <div
                aria-hidden="true"
                style={{
                  height: 3,
                  width: '100%',
                  background: grp.color,
                }}
              />
              {/* 内容主体 padding */}
              <div style={{ padding: '8px 10px 10px' }}>
              {/* 分组头（整行点击切换折叠）
                  · 整个「ICON印章 + 中英文标签」统一装进 1 个模块色胶囊里
                  · 计数：done/total 独立模块色胶囊（无 ✓）
                  · 折叠箭头使用模块色 */}
              <div
                className="flex items-center gap-2 select-none cursor-pointer"
                onClick={() => toggleGroup(grp.key)}
                role="button"
                aria-expanded={!off}
              >
                {/* 1. 单胶囊：印章 + 中文 + EN 全部装进去
                     印章内部继续保持深填充白线形 = 模块色印章在软填充胶囊内自带层次 */}
                <span
                  className="inline-flex items-center gap-1.5 rounded-full"
                  style={{ background: `${grp.color}14`, padding: '3px 10px 3px 3px' }}
                >
                  <span
                    className="flex-shrink-0 rounded-full grid place-items-center"
                    style={{
                      width: 22, height: 22, color: '#fff', background: grp.color,
                      boxShadow: `0 2px 5px ${grp.color}3A`,
                    }}
                  >
                    <CategoryIcon catKey={grp.key} className="w-[13px] h-[13px]" />
                  </span>
                  <span className="text-[12px] font-extrabold leading-none" style={{ color: grp.color }}>{grp.label}</span>
                  <span className="text-[9.5px] font-extrabold tracking-widest leading-none" style={{ color: `${grp.color}B0` }}>{MOD_EN[grp.key]}</span>
                </span>

                {/* 2. 计数 1/3 胶囊（无 ✓） */}
                <span
                  className="ml-auto inline-flex items-center px-2 py-[3px] rounded-full text-[11px] font-extrabold tabular-nums gap-[2px]"
                  style={{ background: `${grp.color}18`, color: grp.color }}
                >
                  <span>{doneN}</span>
                  <span style={{ opacity: 0.35 }}>/</span>
                  <span style={{ opacity: 0.80 }}>{totalN}</span>
                </span>

                {/* 3. 折叠箭头 */}
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
                    /* Completed Band：已完成任务永久铺一层模块色淡填充，
                       做到一眼扫出每个模块哪些是"已经打勾的"，减少大脑扫描成本 */
                    const completedBg = task.done ? `${grp.color}0E` : 'transparent';
                    return (
                      <div
                        key={task.id}
                        className="flex items-center gap-3 px-2 py-1.5 rounded-[12px] transition cursor-pointer"
                        style={{ background: completedBg }}
                        onClick={() => onToggle?.(task.id)}
                        onMouseEnter={(e) => { e.currentTarget.style.background = task.done ? `${grp.color}18` : `${grp.color}12`; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = completedBg; }}
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

                        {/* 右侧进度：确保 6px 高度 + 有填充时加模块色投影（之前写了6px保留，补充投影强度） */}
                        <div className="flex-shrink-0 flex flex-col items-end gap-1 min-w-[80px]">
                          <span className="text-[12px] font-extrabold tabular-nums" style={{ color: task.done ? mod.color : '#1C1C1E' }}>
                            {pct}%
                          </span>
                          <div className="w-[72px] h-[6px] rounded-full overflow-hidden" style={{ background: `${mod.color}18` }}>
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${pct}%`,
                                background: mod.color,
                                boxShadow: pct > 0 ? `0 1px 4px ${mod.color}55` : 'none',
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              </div>{/* end padding */}
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

      {/* 底部统计条：根据用户 2026-08-31 需求删除（原来显示「共 X 项·已完成 Y  ZZ%」） */}
    </div>
  );
}
