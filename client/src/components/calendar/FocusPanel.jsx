import { useState, useMemo } from 'react';
import { MODULES, keyToModule, paceStatus } from '../../utils/categoryMapping.js';

/* 习惯顺序权重：作息 > 运动 > 喝水（需求 3：精力卡习惯排序约定）*/
export const HABIT_ORDER_WEIGHT = { sleep: 1, sport: 2, water: 3 };
const HABIT_KEYS = Object.keys(HABIT_ORDER_WEIGHT);

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

/* 纯白背景 + 恰到好处的描边阴影 + 顶 3px 模块色条（需求 1：阴影再增强一点点）
   · 描边：0.060 → 0.072（维持"隐形描边"气质，但存在感再 +20%）
   · 投影：0.022 → 0.028（近距淡影，刚好让卡片与背景拉开层次又不浮起）
   · hover：描边 0.095 → 0.105，投影 0.028 → 0.034 */
const GROUP_SURFACE = {
  background:   '#ffffff',
  border:       '1px solid rgba(15,23,42,0.072)',
  boxShadow:    '0 1px 2px rgba(15,23,42,0.028)',
  hoverBorder:  '1px solid rgba(15,23,42,0.105)',
  hoverShadow:  '0 1px 2px rgba(15,23,42,0.034)',
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
  onToggle,           // (taskId) => void  — 仅复选框点击触发
  onAdd,              // () => void         — 右上角 + 新增
  onEditTask,         // (task) => void     — 标题/非复选框区域点击触发：打开对应编辑面板
  onDeleteTask,       // (task) => void     — 任务行删除（右键删除 / 回收站还原等场景）
  onRestoreTask,      // (task) => void     — 回收站：还原任务
  onTagClick,         // (task) => void     — 点击"习惯同步·作息/书架同步·个人成长"等关联/同步标签 → 跳对应模块页
  deletedTasks,       // 回收站任务数组（若传则底部出现回收站卡）
  showDeleteButton,   // 详情弹层场景：在底部 footer 左侧放"删除该事项"按钮（需求 2 体检标题点面板左下删除）
  headerExtra,
}) {
  // 按模块分组
  //   · 精力模块：自定义排序 —— ① 新建非习惯事项（如体检）排最前；② 习惯按 HABIT_ORDER_WEIGHT（作息→运动→喝水）
  //   · 其他模块：保持传入顺序
  const grouped = useMemo(
    () => MODULES.filter(m => m.key !== 'others').map(mod => {
      const raw = tasks.filter(t => t.moduleKey === mod.key);
      if (mod.key === 'energy') {
        const habits = raw.filter(t => t.isHabit).sort((a, b) =>
          (HABIT_ORDER_WEIGHT[a.habitKey] || 99) - (HABIT_ORDER_WEIGHT[b.habitKey] || 99)
        );
        const nonHabits = raw.filter(t => !t.isHabit);
        return { ...mod, items: [...nonHabits, ...habits] };
      }
      return { ...mod, items: raw };
    }).filter(g => g.items.length > 0),
    [tasks]
  );

  const totalDone = useMemo(() => tasks.filter(t => t.done).length, [tasks]);
  const pace = paceStatus(progressPct, timePct);

  /* 折叠状态：以面板 title 为作用域，避免月/周面板相互影响 */
  const [collapsed, setCollapsed] = useState({});
  const isCollapsed = (key) => !!collapsed[key];
  const toggleGroup = (key) => setCollapsed(s => ({ ...s, [key]: !s[key] }));

  /* ===== iOS 风格删除确认弹窗（复用 AnnualPlan confirmDialog 视觉：需求 2 截图样式）
       · 标题粗黑 / 正文两行灰字（whitespace-pre-line 支持 \n）/ 底部分割线 / 左取消 右删除(红)
       · 使用 confirmDialog state 取代原生 confirm()，避免 alert 弹窗打断体验 */
  const [confirmDialog, setConfirmDialog] = useState(null);
  const openDeleteConfirm = (task, sourceLabel) => {
    setConfirmDialog({
      title: sourceLabel === '回收站' ? '永久删除' : '删除事项',
      message: `确定删除「${task.title}」吗？\n删除后不可恢复。`,
      danger: true,
      confirmText: '删除',
      onConfirm: () => { setConfirmDialog(null); onDeleteTask?.(task); },
      onCancel:  () => { setConfirmDialog(null); },
    });
  };

  return (
    <>
    <div className="card p-4" style={{
      background: '#fff',
      borderRadius: '18px',
      boxShadow: '0 0 0 1px rgba(0,0,0,0.025), 0 4px 20px rgba(0,0,0,0.035)',
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
                    const handleEdit = () => onEditTask?.(task);
                    const handleToggle = (e) => {
                      // 仅复选框勾选：阻止冒泡避免进入编辑面板
                      e.stopPropagation();
                      e.preventDefault();
                      onToggle?.(task.id);
                    };
                    const handleContextMenu = (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      // 抓取的习惯（isFromFetch = true 的习惯项）不支持直接删；其他非抓取正常走删除弹窗
                      if (task.isFromFetch) return;
                      if (!onDeleteTask) return;
                      openDeleteConfirm(task, '任务行');
                    };
                    return (
                      <div
                        key={task.id}
                        className="flex items-center gap-3 px-2 py-1.5 rounded-[12px] transition cursor-pointer"
                        style={{
                          background: completedBg,
                          paddingLeft: task.indent ? `${12 + task.indent * 20}px` : undefined,
                        }}
                        onClick={handleEdit}
                        onContextMenu={handleContextMenu}
                        title={
                          task.isHabit ? '长期习惯 · 实心圆标记' :
                          task.isLongTerm ? '跨月事项 · 实心圆标记' :
                          task.isFromFetch ? '已关联 · 抓取的事项不支持右键删除' :
                          '点击编辑 · 右键删除'
                        }
                        onMouseEnter={(e) => { e.currentTarget.style.background = task.done ? `${grp.color}18` : `${grp.color}12`; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = completedBg; }}
                      >
                        {/* 需求 7：isHabit || isLongTerm → 实心圆不可点击（长期习惯/跨月事项）
                             普通事项 → 圆复选框，独立 onClick + stopPropagation */}
                        {(task.isHabit || task.isLongTerm) ? (
                          /* 实心圆：纯视觉标记，不可点击（长期习惯不是单次任务）*/
                          <div
                            className="w-[18px] h-[18px] rounded-full flex-shrink-0 flex items-center justify-center transition select-none"
                            style={{
                              background: task.done ? mod.color : `${mod.color}28`,
                              boxShadow: task.done ? `0 2px 5px ${mod.color}48` : 'none',
                            }}
                            aria-hidden="true"
                          />
                        ) : (
                          /* 普通事项：圆复选框 — 独立 onClick + stopPropagation，只点这里才勾选 */
                          <div
                            onClick={handleToggle}
                            className="w-[18px] h-[18px] rounded-full flex-shrink-0 border-[1.5px] flex items-center justify-center transition select-none"
                            style={{
                              borderColor: task.done ? mod.color : `${mod.color}55`,
                              background: task.done ? mod.color : '#fff',
                              boxShadow: task.done ? `0 2px 6px ${mod.color}40` : 'none',
                            }}
                            role="checkbox"
                            aria-checked={task.done}
                            tabIndex={0}
                            onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') handleToggle(e); }}
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
                        )}

                        {/* 左侧标题区（点击进入编辑面板，因为父 div onClick=handleEdit）*/}
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
                                className="px-1.5 py-0.5 rounded text-[10px] font-bold select-none"
                                style={{
                                  background: task.srcTagColor || mod.soft,
                                  color: task.srcTagTextColor || mod.color,
                                  cursor: onTagClick ? 'pointer' : 'default',
                                  transition: 'opacity 0.15s ease, transform 0.15s ease',
                                }}
                                onClick={(e) => {
                                  if (!onTagClick) return;
                                  e.stopPropagation();
                                  e.preventDefault();
                                  onTagClick(task);
                                }}
                                onMouseDown={(e) => { if (onTagClick) e.stopPropagation(); }}
                                title={onTagClick ? `点击跳转到「${mod.label}」模块` : ''}
                              >
                                {task.srcTag}
                              </span>
                            )}
                            {task.dueDate && <span>{task.dueDate}</span>}
                            {task.note && <span>{task.note}</span>}
                          </div>
                        </div>

                        {/* 右侧进度（点击也进入编辑面板，避免进度条空点无反馈） */}
                        <div className="flex-shrink-0 flex flex-col items-end gap-1 min-w-[80px]" onClick={handleEdit}>
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
      {grouped.length === 0 && !deletedTasks?.length && (
        <div className="py-8 text-center">
          <div className="text-[12px] text-[#8E8E93]">
            {type === 'month' ? '本月还没有主线任务' : '本周还没有主线任务'}
          </div>
          <div className="text-[12px] text-[#8E8E93] mt-1">
            从年度规划一键同步 或 点右上角 + 新建
          </div>
        </div>
      )}

      {/* 回收站卡片（复用当前卡片设计）：
         · 同构：顶 3px 灰色条 + 白卡片 + 弱化描边阴影
         · 行：strikethrough + 灰字；复选框替换成 ↺ 还原按钮
         · 无内容自动隐藏 */}
      {deletedTasks?.length > 0 && (
        <div className="mt-3">
          <div
            className="rounded-2xl overflow-hidden"
            style={{
              background: '#ffffff',
              border: '1px solid rgba(142,142,147,0.07)',
              boxShadow: '0 1px 2px rgba(142,142,147,0.018)',
            }}
          >
            <div aria-hidden="true" style={{ height: 3, width: '100%', background: 'linear-gradient(90deg, #8e8e93, #aeaeb2)' }} />
            <div style={{ padding: '8px 10px 10px' }}>
              <div className="flex items-center gap-2 select-none">
                <span
                  className="inline-flex items-center gap-1.5 rounded-full"
                  style={{ background: 'rgba(142,142,147,0.10)', padding: '3px 10px 3px 3px' }}
                >
                  <span
                    className="flex-shrink-0 rounded-full grid place-items-center"
                    style={{ width: 22, height: 22, color: '#fff', background: '#8E8E93' }}
                    aria-hidden="true"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                  </span>
                  <span className="text-[12px] font-extrabold leading-none" style={{ color: '#636366' }}>回收站</span>
                  <span className="text-[9.5px] font-extrabold tracking-widest leading-none" style={{ color: '#8e8e93' }}>TRASH</span>
                </span>
                <span
                  className="ml-auto inline-flex items-center px-2 py-[3px] rounded-full text-[11px] font-extrabold tabular-nums"
                  style={{ background: 'rgba(142,142,147,0.12)', color: '#636366' }}
                >
                  {deletedTasks.length}
                </span>
              </div>

              <div className="flex flex-col gap-[2px] mt-[6px]">
                {deletedTasks.map(task => {
                  const mod = keyToModule(task.moduleKey);
                  const handleRestore = (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    onRestoreTask?.(task);
                  };
                  return (
                    <div
                      key={task.id}
                      className="flex items-center gap-3 px-2 py-1.5 rounded-[12px] transition"
                      style={{ background: 'transparent', cursor: 'default' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(142,142,147,0.06)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      {/* ↺ 还原按钮（视觉规格与复选框同构，但用回退图标） */}
                      <button
                        type="button"
                        onClick={handleRestore}
                        title="还原该事项"
                        className="w-[18px] h-[18px] rounded-full flex-shrink-0 border-[1.5px] flex items-center justify-center transition"
                        style={{
                          borderColor: 'rgba(142,142,147,0.45)',
                          background: '#fff',
                          color: '#8e8e93',
                        }}
                        aria-label="还原事项"
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>
                      </button>

                      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                        <span className="text-[13px] font-semibold leading-tight truncate text-[#8E8E93] line-through">
                          {task.title}
                        </span>
                        <div className="flex items-center gap-2 text-[11px] font-medium text-[#aeaeb2]">
                          {task.dueDate && <span>{task.dueDate}</span>}
                          {task.note && <span>{task.note}</span>}
                          {!task.dueDate && !task.note && <span style={{ color: mod.color }}>{mod.label}模块</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 详情场景：左下"删除该事项"按钮（需求 2 体检点标题弹面板左下）
         · 仅当 showDeleteButton=true 并且传入了 onDeleteTask 时出现
         · 点击 → 打开 iOS 风格双按钮确认弹窗 */}
      {showDeleteButton && onDeleteTask && tasks.length > 0 && (
        <div className="mt-3 pt-2 flex gap-2" style={{ borderTop: '1px solid rgba(60,60,67,0.08)' }}>
          <button
            type="button"
            onClick={() => {
              const t = tasks[0];
              if (!t) return;
              openDeleteConfirm(t, '详情');
            }}
            style={{
              padding: '6px 14px',
              borderRadius: '9px',
              fontSize: '13px',
              fontWeight: '600',
              background: 'rgba(255,59,48,0.09)',
              color: '#FF3B30',
              border: 'none',
              cursor: 'pointer',
              transition: 'all .15s',
            }}
          >删除该事项</button>
          <div className="flex-1" />
        </div>
      )}

      {/* 底部统计条：根据用户 2026-08-31 需求删除（原来显示「共 X 项·已完成 Y  ZZ%」） */}
    </div>

    {/* ===== iOS 风格确认弹窗（与 AnnualPlan confirmEl 同构）
         · 遮罩：40% 黑 + backdrop-blur-sm · 卡 360px · 圆角 16
         · 左右双按钮横排（取消 / 删除红色） ，顶部大标题粗体 · 正文小字体换行 */}
    {confirmDialog && (
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center"
        style={{ background: 'rgba(28,28,30,0.40)', backdropFilter: 'blur(4px) saturate(180%)' }}
        onClick={confirmDialog.onCancel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="focuspanel-confirm-title"
      >
        <div
          className="overflow-hidden"
          style={{
            width: 360, background: '#ffffff', borderRadius: '16px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.22), 0 4px 14px rgba(0,0,0,0.10)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ padding: '20px 20px 18px', textAlign: 'center' }}>
            <h3
              id="focuspanel-confirm-title"
              style={{ fontSize: '17px', fontWeight: 700, color: '#1C1C1E', letterSpacing: '-0.01em' }}
            >{confirmDialog.title}</h3>
            <p
              className="whitespace-pre-line"
              style={{
                marginTop: '6px', fontSize: '13px', lineHeight: 1.55,
                color: '#8E8E93',
              }}
            >{confirmDialog.message}</p>
          </div>
          <div style={{ display: 'flex', borderTop: '0.5px solid rgba(60,60,67,0.18)' }}>
            <button
              onClick={confirmDialog.onCancel}
              style={{
                flex: 1, padding: '14px 0', fontSize: '15px', fontWeight: 600,
                color: '#007AFF', background: 'transparent',
                border: 'none', borderRight: '0.5px solid rgba(60,60,67,0.18)',
                cursor: 'pointer', transition: 'background .15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.035)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >取消</button>
            <button
              onClick={confirmDialog.onConfirm}
              style={{
                flex: 1, padding: '14px 0', fontSize: '15px',
                fontWeight: confirmDialog.danger ? 700 : 600,
                color: confirmDialog.danger ? '#FF3B30' : '#007AFF',
                background: 'transparent', border: 'none', cursor: 'pointer',
                transition: 'background .15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = confirmDialog.danger
                  ? 'rgba(255,59,48,0.06)' : 'rgba(0,122,255,0.06)';
              }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >{confirmDialog.confirmText || '确认'}</button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
