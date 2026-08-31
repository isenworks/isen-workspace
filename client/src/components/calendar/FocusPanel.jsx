import { MODULES, keyToModule, paceStatus } from '../../utils/categoryMapping.js';

/**
 * 主线任务面板（本月/本周共用）
 * - 按精力→知力→能力→工作→生活五块分组
 * - 每行：圆复选框 + L2 13px semibold #48484A 标题 + 来源标签 + 进度条
 * - 节奏胶囊：超前绿/落后红/持平蓝
 *
 * @param {Object} props
 * @param {'month'|'week'} props.type - 面板类型
 * @param {string} props.accentColor - 顶部色条颜色
 * @param {string} props.title - 面板标题
 * @param {Array} props.tasks - 主线任务列表 [{id, title, moduleKey, done, progress, srcTag, srcTagColor, dueDate, children?}]
 * @param {number} props.progressPct - 整体完成率
 * @param {number} props.timePct - 时间进度（用于节奏胶囊）
 * @param {Function} props.onToggle - 勾选回调 (taskId)
 * @param {Function} props.onAdd - 新增按钮回调
 * @param {React.ReactNode} props.headerExtra - 额外头部内容（如周时间胶囊）
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
  const grouped = MODULES.filter(m => m.key !== 'others').map(mod => ({
    ...mod,
    items: tasks.filter(t => t.moduleKey === mod.key),
  }));

  const totalDone = tasks.filter(t => t.done).length;
  const pace = paceStatus(progressPct, timePct);

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
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>
      </div>

      {/* 额外头部内容 */}
      {headerExtra && (
        <div className="mt-2">
          {headerExtra}
        </div>
      )}

      {/* 分隔线 —— 用淡色渐变代替灰色描边，减少灰度 */}
      <div className="h-px my-3" style={{ background: `linear-gradient(90deg, transparent, ${accentColor}14, transparent)` }} />

      {/* 分组列表 */}
      {grouped.map(grp =>
        grp.items.length > 0 ? (
          <div key={grp.key} className="mt-4 first:mt-3">
            {/* 分组标签 */}
            <div className="flex items-center gap-2 mb-2 px-0.5">
              <div className="w-3.5 h-3.5 rounded" style={{ background: grp.color }} />
              <span
                className="text-[11px] font-bold uppercase tracking-wider"
                style={{ color: grp.color }}
              >
                {grp.label}
              </span>
              <span className="flex-1 text-right text-[12px] font-medium tabular-nums text-[#8E8E93]">
                {grp.items.filter(i => i.done).length} / {grp.items.length} ✓
              </span>
            </div>

            {/* 任务行 */}
            {grp.items.map(task => {
              const mod = keyToModule(task.moduleKey);
              const pct = Math.round((task.progress || 0) * 100);
              return (
                <div
                  key={task.id}
                  className="flex items-center gap-3 px-2 py-1.5 rounded-xl hover:bg-[rgba(0,0,0,0.02)] transition cursor-pointer"
                  onClick={() => onToggle?.(task.id)}
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
                        task.done ? 'text-[#8E8E93] line-through' : 'text-[#48484A]'
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
                    <span className="text-[12px] font-bold tabular-nums" style={{ color: task.done ? mod.color : '#48484A' }}>
                      {pct}%
                    </span>
                    <div className="w-[72px] h-[5px] rounded-full overflow-hidden" style={{ background: `${mod.color}14` }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, background: mod.color }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null
      )}

      {/* 空状态 */}
      {tasks.length === 0 && (
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
      {tasks.length > 0 && (
        <div className="mt-3 pt-3 text-[12px] font-medium flex items-center justify-between" style={{ borderTop: '1px solid rgba(60,60,67,0.06)', color: '#636366' }}>
          <span>共 {tasks.length} 项 · 已完成 <span style={{ color: accentColor, fontWeight: 700 }}>{totalDone}</span></span>
          <span className="tabular-nums font-bold" style={{ color: accentColor }}>{progressPct}%</span>
        </div>
      )}
    </div>
  );
}
