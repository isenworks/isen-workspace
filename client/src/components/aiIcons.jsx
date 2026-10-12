/* AI 模块 · 统一 stroke SVG 图标库
   风格对齐 Sidebar：viewBox 24 / fill none / stroke currentColor / 圆角线帽
   用法：<Icon size={14} strokeWidth={2} /> */

const base = (size, sw, children) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    {children}
  </svg>
);

// 星芒（小亦Ai · AI 身份标识，Copilot/Gemini 语言：大四角星 + 实心小星）
// 路径按 24 视窗居中放大，与日历/主页等导航图标视觉重量一致
export function IconSparkle({ size = 14, strokeWidth = 1.8 }) {
  return base(size, strokeWidth, <>
    <path d="M11 2.5c1.15 5.25 3.26 7.36 8.5 8.5-5.25 1.15-7.36 3.26-8.5 8.5-1.15-5.25-3.26-7.36-8.5-8.5 5.25-1.15 7.36-3.26 8.5-8.5z" />
    <path d="M18.8 15.4c.46 2.1 1.3 2.94 3.4 3.4-2.1.46-2.94 1.3-3.4 3.4-.46-2.1-1.3-2.94-3.4-3.4 2.1-.46 2.94-1.3 3.4-3.4z" fill="currentColor" stroke="none" />
  </>);
}

// 地球（通用问答）
export function IconGlobe({ size = 14, strokeWidth = 2 }) {
  return base(size, strokeWidth, <>
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </>);
}

// 打开的书（知识库问答）
export function IconBook({ size = 14, strokeWidth = 2 }) {
  return base(size, strokeWidth, <>
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
  </>);
}

// 齿轮（模型配置）
export function IconGear({ size = 14, strokeWidth = 2 }) {
  return base(size, strokeWidth, <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </>);
}

// 搜索
export function IconSearch({ size = 14, strokeWidth = 2.2 }) {
  return base(size, strokeWidth, <>
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </>);
}

// 上箭头（发送，iOS 风格）
export function IconArrowUp({ size = 14, strokeWidth = 2.4 }) {
  return base(size, strokeWidth, <>
    <line x1="12" y1="19" x2="12" y2="5" />
    <polyline points="5 12 12 5 19 12" />
  </>);
}

// 方形停止（停止生成）
export function IconStop({ size = 14, strokeWidth = 2 }) {
  return base(size, strokeWidth, <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none" />);
}

// 逆时针旋转（清空对话）
export function IconRotate({ size = 14, strokeWidth = 2 }) {
  return base(size, strokeWidth, <>
    <polyline points="1 4 1 10 7 10" />
    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
  </>);
}

// 加号（新建）
export function IconPlus({ size = 14, strokeWidth = 2.2 }) {
  return base(size, strokeWidth, <>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </>);
}

// 更多（⋯ 横向三点）
export function IconDots({ size = 14, strokeWidth = 2 }) {
  return base(size, strokeWidth, <>
    <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
  </>);
}

// 麦克风（语音输入）
export function IconMic({ size = 14, strokeWidth = 2 }) {
  return base(size, strokeWidth, <>
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="23" />
    <line x1="8" y1="23" x2="16" y2="23" />
  </>);
}

// 下箭头（下拉展开）
export function IconChevronDown({ size = 14, strokeWidth = 2 }) {
  return base(size, strokeWidth, <polyline points="6 9 12 15 18 9" />);
}

// 剪贴板（粘贴）
export function IconClipboard({ size = 14, strokeWidth = 2 }) {
  return base(size, strokeWidth, <>
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <rect x="8" y="2" width="8" height="4" rx="1" />
  </>);
}

// 文档下载（飞书导入）
export function IconImport({ size = 14, strokeWidth = 2 }) {
  return base(size, strokeWidth, <>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="12" y1="12" x2="12" y2="18" />
    <polyline points="9 15 12 18 15 15" />
  </>);
}

// 钢笔（手动记录 / 编辑）
export function IconPen({ size = 14, strokeWidth = 2 }) {
  return base(size, strokeWidth, <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />);
}

// 链接（网页来源）
export function IconLink({ size = 14, strokeWidth = 2 }) {
  return base(size, strokeWidth, <>
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </>);
}

// X（删除 / 关闭）
export function IconX({ size = 14, strokeWidth = 2.2 }) {
  return base(size, strokeWidth, <>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </>);
}

// 对勾（成功）
export function IconCheck({ size = 14, strokeWidth = 2.4 }) {
  return base(size, strokeWidth, <polyline points="20 6 9 17 4 12" />);
}

// 时钟（执行中）
export function IconClock({ size = 14, strokeWidth = 2 }) {
  return base(size, strokeWidth, <>
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </>);
}

// 禁止（已取消）
export function IconBan({ size = 14, strokeWidth = 2 }) {
  return base(size, strokeWidth, <>
    <circle cx="12" cy="12" r="10" />
    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
  </>);
}

// 警告三角（错误）
export function IconAlert({ size = 14, strokeWidth = 2 }) {
  return base(size, strokeWidth, <>
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </>);
}

// 标签（标签管理）
export function IconTag({ size = 14, strokeWidth = 2 }) {
  return base(size, strokeWidth, <>
    <path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82Z" />
    <line x1="7" y1="7" x2="7.01" y2="7" />
  </>);
}

// 文档 + 加号（新建条目）
export function IconDocPlus({ size = 14, strokeWidth = 2 }) {
  return base(size, strokeWidth, <>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="12" y1="12" x2="12" y2="18" />
    <line x1="9" y1="15" x2="15" y2="15" />
  </>);
}

// 日历徽标 + 任务勾（今日日程查询）
export function IconCalendarCheck({ size = 14, strokeWidth = 2 }) {
  return base(size, strokeWidth, <>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
    <polyline points="9 15 11 17 15 13" />
  </>);
}

// 列表勾选（待办查询）
export function IconListChecks({ size = 14, strokeWidth = 2 }) {
  return base(size, strokeWidth, <>
    <path d="M10 6h11" />
    <path d="M10 12h11" />
    <path d="M10 18h11" />
    <polyline points="3 5 4 6 6 4" />
    <polyline points="3 11 4 12 6 10" />
    <polyline points="3 17 4 18 6 16" />
  </>);
}

// 重复圆点（习惯打卡）
export function IconRepeat({ size = 14, strokeWidth = 2 }) {
  return base(size, strokeWidth, <>
    <polyline points="17 1 21 5 17 9" />
    <path d="M3 11V9a4 4 0 0 1 4-4h14" />
    <polyline points="7 23 3 19 7 15" />
    <path d="M21 13v2a4 4 0 0 1-4 4H3" />
  </>);
}

// 文件夹（章节分组）
export function IconFolder({ size = 14, strokeWidth = 2 }) {
  return base(size, strokeWidth, <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />);
}

// 文档（正文条目）
export function IconFile({ size = 14, strokeWidth = 2 }) {
  return base(size, strokeWidth, <>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </>);
}

// 垃圾桶（删除）
export function IconTrash({ size = 14, strokeWidth = 2 }) {
  return base(size, strokeWidth, <>
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </>);
}

// 更多（更多操作）
export function IconMore({ size = 14, strokeWidth = 2 }) {
  return base(size, strokeWidth, <>
    <circle cx="12" cy="5" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="12" cy="19" r="1.4" fill="currentColor" stroke="none" />
  </>);
}

// 右折角（展开指示）
export function IconChevronRight({ size = 14, strokeWidth = 2.2 }) {
  return base(size, strokeWidth, <polyline points="9 6 15 12 9 18" />);
}
