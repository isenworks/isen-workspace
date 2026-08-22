import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { API } from '../api/client.js';
import { inferGrowthType } from '../utils/uiConstants.js';
import Modal from '../components/Modal.jsx';
import HabitForm from '../components/forms/HabitForm.jsx';
import BookForm from '../components/forms/BookForm.jsx';
import MilestoneForm from '../components/forms/MilestoneForm.jsx';
import KrForm from '../components/forms/KrForm.jsx';
import EntryForm from '../components/forms/EntryForm.jsx';

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

/* ============================================================
   AnnualPlan · 个人成长年度规划 v1 · 工作台沙盒版
   - 所有间距/圆角/字号对齐工作台已有的 Tailwind tokens (8pt grid)
   - 语义色与品牌色分离 (解决 #4)
   - 去除玻璃/渐变背景，统一为纯白卡 + 细边 + 克制阴影 (解决 #5/#12)
   - 信息层级严格区分 (标题/数值/辅助 2 级差) (解决 #6/#2/#3)
   - 仅可点击容器有 hover 动效 (解决 #8)
   - View 切换 0.25s 淡入 (解决 #13)
   ============================================================ */

/* ---------- 1. 静态 Demo 数据（后续替换为工作台真实 API）---------- */
const CATEGORIES = [
  { key: 'energy',    label: '精力', type: '习惯型',    weight: 0.15, color: '#22c55e' }, /* accent-green */
  { key: 'cognition', label: '知力', type: '混合型',    weight: 0.20, color: '#4b63f0' }, /* accent-blue  */
  { key: 'ability',   label: '能力', type: '里程碑型',  weight: 0.25, color: '#f59e0b' }, /* accent-amber/orange */
  { key: 'work',      label: '工作', type: 'OKR 量化型',weight: 0.25, color: '#ef4444' }, /* accent-red   */
  { key: 'life',      label: '生活', type: '体验记录',  weight: 0.15, color: '#8b5cf6' }, /* accent-violet/purple */
];

/* 习惯打卡 (精力) */
// monthDates: 按月份归类的真实打卡日期 Set（用于热力图 + 本月每日节奏折线）
const __mockMonthDates = (pattern /* 字符串，'1'=打卡 '.'=未打卡，长度<=当月天数 */, m /* 8月等 */) => {
  const s = new Set();
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] === '1') s.add(i + 1);
  }
  return { [m]: s };
};
const HABITS = [
  // 作息：8月节奏 - 前半月稳定，17号左右出差乱了几天，20号之后慢慢恢复
  { key: 'sleep', label: '睡觉 23:00 前', unit: '天', target: 230, val: 142,
    month: { 1: 22, 2: 18, 3: 23, 4: 20, 5: 21, 6: 18, 7: 20 },
    monthDates: __mockMonthDates('111.11111.111.11.1..1.11', 8) },
  // 喝水：8月节奏 - 非常稳定，几乎每天达标（只有3天忘记）
  { key: 'water', label: '喝水 ≥ 2L',    unit: '杯', target: 230, val: 198,
    month: { 1: 28, 2: 22, 3: 29, 4: 25, 5: 30, 6: 28, 7: 31 },
    monthDates: __mockMonthDates('111111111111.1111111.111', 8) },
  // 运动：8月节奏 - 周中隔天练，周末休息（一周3练左右，低频节奏明显）
  { key: 'sport', label: '运动 ≥ 30 分', unit: '次', target: 120, val: 56,
    month: { 1: 8,  2: 6,  3: 9,  4: 7,  5: 12, 6: 8,  7: 6  },
    monthDates: __mockMonthDates('.1.1..1.1..1.1..1..1..', 8) },
];

/* 认知 · 书籍 */
const BOOKS = [
  { t: '穷查理宝典',   author: '查理·芒格', cat: '商业',  st: 'reading', pct: 65, src: '电子书' },
  { t: '人类简史',     author: '尤瓦尔·赫拉利', cat: '认知', st: 'reading', pct: 30, src: '电子书' },
  { t: '硅谷钢铁侠',   author: '阿什利·万斯', cat: '传记', st: 'reading', pct: 15, src: '电子书' },
  { t: '影响力',       author: '罗伯特·西奥迪尼', cat: '商业', st: 'pending', pct: 0,  src: '纸质书' },
  { t: '非暴力沟通',   author: '马歇尔·卢森堡', cat: '认知', st: 'pending', pct: 0,  src: '电子书' },
  { t: '定位',         author: '艾·里斯',       cat: '商业', st: 'pending', pct: 0,  src: '纸质书' },
  { t: '从0到1',       author: '彼得·蒂尔',     cat: '商业', st: 'pending', pct: 0,  src: '电子书' },
  { t: '纳瓦尔宝典',   author: 'Eric Jorgenson', cat: '认知', st: 'done',    pct: 100, src: '电子书',
    insights: [
      { id: 'i1', text: '用专长、杠杆和判断力赚钱，而不是用时间', resonance: 9 },
      { id: 'i2', text: '幸福是一种选择，不是一种结果', resonance: 8 },
      { id: 'i3', text: '阅读你喜欢的，直到你喜欢阅读', resonance: 7 },
      { id: 'i4', text: '建立具体知识，而非追求 generalized knowledge', resonance: 6 },
    ],
  },
  { t: '原则',         author: '瑞·达利欧',     cat: '认知', st: 'done',    pct: 100, src: '纸质书',
    insights: [
      { id: 'i5', text: '痛苦+反思=进步', resonance: 9 },
      { id: 'i6', text: '极度透明+极度真实是高效决策的基础', resonance: 8 },
      { id: 'i7', text: '把决策过程当作机器来优化', resonance: 7 },
    ],
  },
  { t: '思考，快与慢', author: '丹尼尔·卡尼曼', cat: '认知', st: 'done',    pct: 100, src: '电子书',
    insights: [
      { id: 'i8', text: '系统1（直觉）容易出错，重要决策必须激活系统2', resonance: 9 },
      { id: 'i9', text: '损失厌恶：人损失100元的痛苦≈获得200元的快乐', resonance: 8 },
      { id: 'i10', text: '锚定效应：第一印象会扭曲后续判断', resonance: 7 },
      { id: 'i11', text: '峰终定律：体验的记忆由高峰和结尾决定', resonance: 6 },
    ],
  },
  { t: '被讨厌的勇气', author: '岸见一郎',     cat: '认知', st: 'done',    pct: 100, src: '电子书',
    insights: [
      { id: 'i12', text: '课题分离：这是谁的课题？是我的还是他的？', resonance: 9 },
      { id: 'i13', text: '自卑感不是来自事实，而是来自主观解释', resonance: 8 },
    ],
  },
  { t: 'Atomic Habits',author: 'James Clear',  cat: '商业', st: 'done',    pct: 100, src: '纸质书',
    insights: [
      { id: 'i14', text: '习惯的四大定律：提示→渴望→反应→奖赏', resonance: 8 },
      { id: 'i15', text: '1%每天进步，一年后37倍', resonance: 7 },
      { id: 'i16', text: '身份认同驱动行为：先成为，再做', resonance: 9 },
      { id: 'i17', text: '环境设计比意志力更有效', resonance: 8 },
      { id: 'i18', text: '习惯叠加：在已有习惯后接入新习惯', resonance: 6 },
    ],
  },
];
/* 知力 · OKR — 理念：输入量→思考量→行动量→改变量 */
const COG_O = { text: '通过阅读获得启发，并确定实际行动目标以获得改变', year: new Date().getFullYear() };
const COG_KRS = [
  { id: 'kr1', lb: '输入量 · 提取60条核心观点', tgt: 60, val: 0, u: '条', sub: '每本书3-5条观点' },
  { id: 'kr2', lb: '思考量 · 24条强共鸣观点', tgt: 24, val: 0, u: '条', sub: '共鸣≥7分' },
  { id: 'kr3', lb: '行动量 · 12条改变承诺', tgt: 12, val: 0, u: '条', sub: '观点→行动' },
];

/* 能力 */
const ABILITY = [
  {
    title: '英语口语',
    score: '4',
    daily: '每日30min Shadowing + Anki背20词',
    mstones: [
      { lb: '通过 BEC Vantage 考试', st: 'doing', pct: 40 },
      { lb: '独立完成 1 次英文面试', st: 'pending', pct: 0 },
    ],
  },
  {
    title: '结构化表达',
    score: '5',
    daily: '每周1次演讲练习 + 写作300字',
    mstones: [
      { lb: '读完《金字塔原理》', st: 'done', pct: 100 },
      { lb: '上台分享 3 次', st: 'doing', pct: 33 },
    ],
  },
  {
    title: '写作输出',
    score: '3',
    daily: '小红书周更1篇 · 公众号月更2篇',
    mstones: [
      { lb: '完成 12 篇深度长文', st: 'pending', pct: 0 },
      { lb: '累计粉丝破 5000', st: 'pending', pct: 0 },
    ],
  },
];

/* 工作 */
const WORK = [
  {
    core: true, label: '主业', title: '用户运营offer，薪资≥20k',
    deadline: '9月30日',
    krs: [
      { t: '简历投递 50(份)', v: 20, tgt: 50, st: 'doing' },
      { t: '面试通过 10(个)', v: 5,  tgt: 10, st: 'doing' },
      { t: '复盘总结 3(个)', v: 0,  tgt: 3,  st: 'tg' },
      { t: '拿意向 Offer 1(个)', v: 0, tgt: 1, st: 'tg' },
      { t: '薪资达标 1(项)', v: 1, tgt: 1, st: 'done' },
    ],
  },
  {
    core: false, label: '副业', title: '小红书「小憨熊」涨粉+变现',
    deadline: '12月31日',
    krs: [
      { t: '周更内容 50(条)', v: 12,  tgt: 50,  st: 'doing' },
      { t: '粉丝增长 5000(粉)', v: 800, tgt: 5000, st: 'doing' },
      { t: '商业合作 1(个)', v: 0,    tgt: 1,    st: 'tg' },
    ],
  },
];

/* 生活 */
const LIFE = [
  { key:'relation', lb:'关系', color:'#8b5cf6', entries:[ /* violet */
    { t:'给妈妈打电话 30min', n:'聊天很开心，她分享了广场舞比赛', d:'7.28' },
    { t:'朋友老王生日送礼物', n:'送了喜欢的露营装备', d:'7.15' },
    { t:'和老婆周末野餐', n:'准备了她爱吃的草莓和可颂', d:'7.09' },
  ]},
  { key:'food', lb:'美食', color:'#a78bfa', entries:[ /* violet-400 */
    { t:'学会番茄牛腩', n:'第一次做，老妈说味道可以', d:'7.22' },
    { t:'尝试手冲咖啡', n:'买了一套 Hario V60', d:'7.10' },
  ]},
  { key:'travel', lb:'旅游', color:'#8b5cf6', entries:[ /* violet - 符合WCAG AA对比度 */
    { t:'苏州两日游', n:'去了拙政园和留园', d:'6.22-6.23' },
    { t:'崇明岛露营', n:'和朋友们搭帐篷烧烤', d:'5.18' },
  ]},
  { key:'movie', lb:'电影', color:'#7c3aed', entries:[ /* violet-600 */
    { t:'奥本海默', n:'3小时但不闷，诺兰神了', d:'7.01' },
    { t:'蜘蛛侠：纵横宇宙', n:'画风惊艳', d:'6.05' },
  ]},
  { key:'shop', lb:'购物', color:'#6d28d9', entries:[ /* violet-700 */
    { t:'Sony WH-1000XM5 耳机', n:'降噪封神，通勤必带', d:'7.05' },
    { t:'露营折叠椅', n:'周末去公园躺着很舒服', d:'6.18' },
  ]},
];

/* ---------- 2. 工具函数 ---------- */
const pct = (v, t) => (t > 0 ? Math.min(100, Math.round((v / t) * 100)) : 0);
const statusMeta = (st) => {
  // 语义色 (STATUS) 独立于品牌色，避免「绿色=精力/完成」「红色=工作/紧急」双关
  switch (st) {
    case 'done':    return { lb: '已完成',  tagCls: 'bg-accent-green/10 text-accent-green',  numBg: 'bg-accent-green/10 text-accent-green',  bar: 'bg-accent-green'  };
    case 'doing':   return { lb: '进行中',  tagCls: 'bg-accent-blue/10 text-accent-blue',    numBg: 'bg-accent-blue/10 text-accent-blue',    bar: 'bg-accent-blue'   };
    case 'reading': return { lb: '阅读中',  tagCls: 'bg-accent-blue/10 text-accent-blue',    numBg: 'bg-accent-blue/10 text-accent-blue',    bar: 'bg-accent-blue'   };
    case 'tg':      return { lb: '待启动',  tagCls: 'bg-ink-100 text-ink-500',               numBg: 'bg-ink-100 text-ink-500',               bar: 'bg-ink-200'       };
    case 'pending': return { lb: '未开始',  tagCls: 'bg-ink-100 text-ink-500',               numBg: 'bg-ink-100 text-ink-500',               bar: 'bg-ink-200'       };
    default:        return { lb: '',        tagCls: '', numBg: '', bar: '' };
  }
};
const catMeta = (key) => CATEGORIES.find(c => c.key === key) || CATEGORIES[0];

/* ---------- 共享组件 ---------- */
function CategoryIcon({ catKey, className }) {
  const cls = className || 'w-4 h-4';
  return (
    <svg className={cls} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      {catKey === 'overview' && (<><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></>)}
      {catKey === 'energy' && (<><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></>)}
      {catKey === 'cognition' && (<><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></>)}
      {catKey === 'ability' && (<><circle cx="12" cy="8" r="6"/><path d="M15.5 15a6 6 0 1 0-7 0M12 14v6M8 22h8"/></>)}
      {catKey === 'work' && (<><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></>)}
      {catKey === 'life' && (<><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></>)}
    </svg>
  );
}

function ProgressBar({ value, color, variant }) {
  // P1-3 / 4.1 进度条分层规范：
  //  default = 标准 4px (类目卡 / Hero / SectionHeader)
  //  dense   = 细 3px (KR列表 / 书籍明细 - 场景密集，减少视觉噪声)
  const h = variant === 'dense' ? 'h-0.75' : 'h-1';
  return (
    <div className={`${h} rounded-full bg-ink-100 overflow-hidden`}>
      <div className="h-full rounded-full transition-all duration-500 ease-out" style={{ width: `${value}%`, background: color || '#4b63f0' }} />
    </div>
  );
}

function AddButton({ label, onClick }) {
  // P2-1: 圆形白+号+文字，去虚线
  return (
    <button onClick={onClick || (() => {})} className="mt-auto p-2 rounded-xl border border-ink-100 text-ink-500 text-xs font-semibold inline-flex items-center justify-center gap-2 hover:bg-ink-50 hover:border-ink-200 hover:text-ink-700 transition cursor-pointer w-full">
      <span className="w-5 h-5 rounded-full bg-ink-100 grid place-items-center text-ink-600 flex-shrink-0">
        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" strokeLinecap="round"/></svg>
      </span>
      <span>{label}</span>
    </button>
  );
}

/* ---------- 通用：文字编辑组件
   · 默认（mode 不填）：历史遗留，点击即编辑
   · mode="contextmenu"：右击弹出小菜单（编辑/删除），符合用户新设计；
     此时需要额外传 onDelete 以支持"删除/恢复默认"，不传则隐藏删除项
--------------------------------------------------------------------- */
function InlineEdit({
  value, onChange, onDelete,
  className, inputClassName, title, placeholder = '', style,
  mode, // 'contextmenu' | undefined
  menuWidth = 140, // 右键菜单宽度，可按需覆盖
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const ref = React.useRef(null);
  // 右键菜单：{x, y} 打开中；null 关闭
  const [menu, setMenu] = React.useState(null);

  React.useEffect(() => { if (!editing) setDraft(value); }, [value, editing]);
  React.useEffect(() => { if (editing) setTimeout(() => ref.current?.focus(), 0); }, [editing]);

  // 点击外部 / 滚动 → 关闭右键菜单
  React.useEffect(() => {
    if (!menu) return;
    const hide = () => setMenu(null);
    window.addEventListener('mousedown', hide);
    window.addEventListener('touchstart', hide);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      window.removeEventListener('mousedown', hide);
      window.removeEventListener('touchstart', hide);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, [menu]);

  const commit = () => {
    setEditing(false);
    const v = draft == null ? '' : String(draft).trim();
    const origin = value == null ? '' : String(value);
    if (v !== origin) onChange(v);
  };
  const cancel = () => { setEditing(false); setDraft(value ?? ''); };

  const openContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    // 计算位置，超出右边界则左对齐
    const pad = 12;
    const maxX = window.innerWidth - menuWidth - pad;
    const maxY = window.innerHeight - 92 - pad;
    setMenu({
      x: Math.min(e.clientX, maxX),
      y: Math.min(e.clientY, maxY),
    });
  };

  // -------- 编辑态：输入框 --------
  if (editing) {
    return (
      <input
        ref={ref}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') cancel(); }}
        className={`outline-none border border-brand-300 rounded px-1.5 py-0.5 bg-white text-left ${inputClassName || ''}`}
      />
    );
  }

  // -------- 显示态：带 hover / contextmenu --------
  const isCtxMode = mode === 'contextmenu';
  return (
    <>
      <span
        title={title || (isCtxMode ? '右键编辑' : '点击编辑')}
        onClick={(e) => {
          if (isCtxMode) return; // 右键模式下禁用单击编辑
          e.stopPropagation(); setEditing(true);
        }}
        onContextMenu={isCtxMode ? openContextMenu : undefined}
        style={style}
        className={`${isCtxMode ? 'cursor-context-menu' : 'cursor-text'} hover:opacity-80 transition select-none ${className || ''}`}>
        {value || <span className="opacity-40">{placeholder || (isCtxMode ? '右键填写' : '点击填写')}</span>}
      </span>

      {/* ---- 右键浮层菜单：编辑 / 删除 ---- */}
      {isCtxMode && menu && (
        <div
          onMouseDown={(e) => e.stopPropagation()}
          style={{ position: 'fixed', left: menu.x, top: menu.y, zIndex: 9999, width: menuWidth }}
          className="bg-white rounded-xl shadow-xl border border-ink-100 py-1 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
          <button
            onClick={(e) => { e.stopPropagation(); setMenu(null); setEditing(true); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium text-ink-800 hover:bg-ink-50 transition">
            <svg className="w-4 h-4 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M15.232 5.232l3.536 3.536M9 19h4l7.586-7.586a2 2 0 0 0-2.828-2.828L11 16v3z" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span>编辑</span>
          </button>
          {onDelete && (
            <>
              <div className="my-0.5 h-px bg-ink-100 mx-2" />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setMenu(null);
                  onDelete();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium text-accent-red hover:bg-rose-50/70 transition">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span>删除</span>
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}

/* ---------- P2-2: 知力 OKR 漏斗 (输入量 → 思考量 → 行动量 → 改变量) ---------- */
function ReadingFunnel({
  total, done, notes, changes, color = '#4b63f0', embedded,
  headerTitle = '阅读转化漏斗',
  headerSub = '输入→思考→行动→改变',
  onHeaderChange,
  stageLabels,
  onStageLabelsChange,
}) {
  // 四层（严格真子集关系：每一层是前一层的有意义子集）
  // 渐进色彩：蓝(输入) → 橙(思考) → 紫(行动) → 绿(改变)
  const STAGE_COLORS = ['#4b63f0', '#f59e0b', '#a855f7', '#22c55e'];
  const DEFAULT_STAGES = [
    { key: 'total',   label: '输入量', sub: '核心观点',   convLabel: '启发' },
    { key: 'done',    label: '思考量', sub: '强共鸣≥7分', convLabel: '承诺' },
    { key: 'notes',   label: '行动量', sub: '改变承诺',   convLabel: '验证' },
    { key: 'changes', label: '改变量', sub: '30天留存',   convLabel: '闭环' },
  ];
  const countsByKey = { total, done, notes, changes };
  // stages 由【默认结构 + 自定义文字 + 外部count】合成；受控，不再自己 useState 存 label/sub/convLabel
  const stages = DEFAULT_STAGES.map(s => ({
    ...s,
    ...(stageLabels?.[s.key] || {}),
    count: countsByKey[s.key] ?? s.count,
  }));
  const updateStageLabel = (key, patch) => {
    const next = { ...(stageLabels || {}) };
    const prev = next[key] || {};
    next[key] = { ...prev, ...patch };
    // 只保存和默认值不同的文字，避免污染存储空间（可选）
    onStageLabelsChange?.(next);
  };
  const deleteStageLabel = (key, field) => {
    // 删除 = 从自定义中清除该字段，恢复默认值
    const next = { ...(stageLabels || {}) };
    if (!next[key]) return;
    const { [field]: _ignored, ...rest } = next[key];
    if (Object.keys(rest).length === 0) {
      delete next[key]; // 所有字段都清了 → 把 key 也删掉，省空间
    } else {
      next[key] = rest;
    }
    onStageLabelsChange?.(next);
  };

  const widthByCount = stages.map(s => s.count);
  const maxW = Math.max(...widthByCount, 1);
  // 转化率颜色：用目标层和源层的混合色
  const convColors = STAGE_COLORS;

  // CTA 文案：根据各层数据动态生成"下一步建议"
  const ctas = [
    // ① 输入量：有未读完的书 → 提示提取观点
    { idx: 0, show: total < 60, text: total === 0 ? '从书架选一本书，提取3条核心观点' : `还需 ${60 - total} 条观点，去已读书里提取？` },
    // ② 思考量：有观点但强共鸣少 → 提示打分筛选
    { idx: 1, show: done < 24 && total > 0, text: done === 0 ? '给观点打共鸣分，筛出打动你的那批' : `${total - done} 条观点待打分，筛出强共鸣` },
    // ③ 行动量：有强共鸣但行动少 → 提示生成行动
    { idx: 2, show: notes < 12 && done > 0, text: notes === 0 ? '从强共鸣观点生成你的第一条行动改变' : `${done - notes} 条强共鸣待转化为行动` },
    // ④ 改变量：有行动但留存少 → 提示坚持打卡或复盘
    { idx: 3, show: changes < 6 && notes > 0, text: changes === 0 ? '坚持打卡30天，完成第一次复盘' : `${notes - changes} 条改变待完成30天复盘` },
  ];

  const Inner = (
    <div className="flex flex-col">
      {stages.map((s, i) => {
        const next = stages[i + 1];
        const conv = next && s.count > 0 ? Math.round((next.count / s.count) * 100) : null;
        const pctOfMax = Math.max(28, Math.round((s.count / maxW) * 100));
        const stageColor = STAGE_COLORS[i] || color;
        const cta = ctas.find(c => c.idx === i);
        return (
          <div key={s.key}>
            <div className="relative flex items-center pr-1">
              <div
                className="flex items-center h-[30px] px-3 rounded-lg text-white font-semibold text-[12px] transition-all"
                style={{
                  width: `${pctOfMax}%`,
                  minWidth: '150px',
                  background: `linear-gradient(90deg, ${stageColor} 0%, ${stageColor}e0 100%)`,
                  boxShadow: `0 1px 3px ${stageColor}30`,
                }}>
                {/* 左：label + sub — 均复用通用InlineEdit（右键菜单：编辑/删除恢复默认） */}
                <span className="flex items-center gap-1.5 flex-1 min-w-0 whitespace-nowrap overflow-hidden text-ellipsis mr-2">
                  <InlineEdit
                    value={s.label}
                    onChange={(v) => updateStageLabel(s.key, { label: v })}
                    onDelete={() => deleteStageLabel(s.key, 'label')}
                    mode="contextmenu"
                    className="font-bold flex-shrink-0"
                    inputClassName="text-ink-900 text-[12px] w-20"
                    title="右键编辑阶段名"
                  />
                  <span className="text-[10px] font-normal opacity-80 whitespace-nowrap overflow-hidden text-ellipsis inline-flex items-center gap-1">
                    ·
                    <InlineEdit
                      value={s.sub}
                      onChange={(v) => updateStageLabel(s.key, { sub: v })}
                      onDelete={() => deleteStageLabel(s.key, 'sub')}
                      mode="contextmenu"
                      className="text-[10px] opacity-95"
                      inputClassName="text-ink-900 text-[11px] w-16"
                      title="右键编辑备注"
                    />
                  </span>
                </span>
                {/* 右：count — 独立盒子 shrink-0 永远不换行 */}
                <span className="tabular-nums text-[14px] font-extrabold leading-none flex-shrink-0 ml-auto">
                  {s.count}
                </span>
              </div>
            </div>
            {next && (
              <div className="flex items-center py-0.5 pl-5 gap-1.5 text-[10.5px] whitespace-nowrap">
                <div className="w-px h-2 bg-ink-200" />
                <svg className="w-2 h-2 text-ink-300 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M12 5v14M5 12l7 7 7-7" strokeLinecap="round" strokeLinejoin="round"/></svg>
                <InlineEdit
                  value={s.convLabel}
                  onChange={(v) => updateStageLabel(s.key, { convLabel: v })}
                  onDelete={() => deleteStageLabel(s.key, 'convLabel')}
                  mode="contextmenu"
                  className="text-ink-400 font-medium flex-shrink-0"
                  inputClassName="text-ink-900 text-[10.5px] w-12"
                  title="右键编辑转化文案"
                />
                <span className="font-extrabold tabular-nums px-1.5 py-px rounded-full flex-shrink-0"
                  style={{
                    color: convColors[i] || color,
                    background: `${(convColors[i] || color)}15`,
                  }}>
                  {conv ?? 0}%
                </span>
              </div>
            )}
            {/* CTA 引导行：数据驱动下一步动作 */}
            {cta && cta.show && (
              <div className="flex items-center gap-1 pl-5 py-0.5 text-[10px] font-medium" style={{ color: STAGE_COLORS[i] }}>
                <span className="opacity-60">→</span>
                <span>{cta.text}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  if (embedded) return Inner;

  return (
    <div className="bg-white rounded-2xl p-4 border border-ink-100">
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md grid place-items-center" style={{ background: `${color}15`, color }}>
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M3 3v18h18" strokeLinecap="round"/>
              <path d="M7 14l4-4 4 4 5-6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div className="flex items-baseline gap-1.5 min-w-0">
            <InlineEdit
              value={headerTitle}
              onChange={(v) => onHeaderChange?.({ title: v })}
              onDelete={() => onHeaderChange?.({ title: '' })}
              mode="contextmenu"
              className="text-[14px] font-bold text-ink-900 whitespace-nowrap"
              inputClassName="text-[14px] font-bold text-ink-900 w-24"
              title="右键编辑标题"
            />
          </div>
        </div>
        <InlineEdit
          value={headerSub}
          onChange={(v) => onHeaderChange?.({ sub: v })}
          onDelete={() => onHeaderChange?.({ sub: '' })}
          mode="contextmenu"
          className="text-[11px] text-ink-400 whitespace-nowrap"
          inputClassName="text-[11px] font-medium text-ink-500 w-28"
          title="右键编辑说明"
        />
      </div>
      {Inner}
    </div>
  );
}

/* ---------- P2-2: 生活统计条 ---------- */
function LifeStatsBar({ categories }) {
  const total = categories.reduce((s, c) => s + c.count, 0) || 1;
  const max = Math.max(...categories.map(c => c.count), 1);
  return (
    <div className="glass-card p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg grid place-items-center bg-rose-500/10 text-rose-500">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M3 3v18h18M7 14l4-4 4 4 5-5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span className="text-sm font-bold text-ink-900">生活记录分布</span>
        </div>
        <span className="text-[11px] font-semibold text-ink-500">共 <span className="tabular-nums text-ink-700">{total}</span> 条记录</span>
      </div>
      {/* 堆叠百分比条 */}
      <div className="flex h-3 rounded-full overflow-hidden bg-ink-50">
        {categories.map((c, i) => {
          const w = (c.count / total) * 100;
          if (w < 1) return null;
          return <div key={c.key} style={{ width: `${w}%`, background: c.color }} className={i === 0 ? 'rounded-l-full' : i === categories.length - 1 ? 'rounded-r-full' : ''} />;
        })}
      </div>
      {/* 单项进度排行 */}
      <div className="flex flex-col gap-2">
        {[...categories].sort((a, b) => b.count - a.count).map((c, i) => {
          const pct = Math.round((c.count / max) * 100);
          const share = Math.round((c.count / total) * 100);
          return (
            <div key={c.key} className="flex items-center gap-2.5">
              <span className="text-xs w-4 h-4 rounded-md grid place-items-center flex-shrink-0 font-bold"
                style={{ background: `${c.color}15`, color: c.color }}>
                {i + 1}
              </span>
              <span className="text-xs font-semibold text-ink-700 w-10 flex-shrink-0">{c.label}</span>
              <div className="flex-1 h-2 rounded-full bg-ink-50 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: c.color }} />
              </div>
              <span className="text-[11px] font-bold tabular-nums text-ink-700 w-10 text-right flex-shrink-0">
                {c.count} · {share}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- 2.5 真实习惯数据获取 · Energy ---------- */
// 从工作台习惯打卡 API 读取精力类习惯的年度数据
// 未登录/API 失败时回退到 mock HABITS，保证沙盒模式可用
function useEnergyHabits() {
  const [realHabits, setRealHabits] = useState(null); // null = 未获取/失败；[] = 获取到空列表
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0); // 手动刷新触发

  const refresh = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const year = new Date().getFullYear();
        const from = `${year}-01-01`;
        const to   = `${year}-12-31`;
        const today = new Date().toISOString().slice(0, 10);

        // 1. 获取所有习惯（含当天打卡状态）
        const habitsRes = await API.habits.list({ date: today });
        const allHabits = habitsRes.habits || [];

        // 2. 筛选精力类习惯
        const energyHabits = allHabits.filter(h => inferGrowthType(h) === 'energy');
        if (energyHabits.length === 0) {
          if (!cancelled) { setRealHabits([]); setLoading(false); }
          return;
        }

        // 3. 获取年度统计
        const statsRes = await API.habits.stats(from, to);
        const statsMap = {};
        (statsRes.stats || []).forEach(s => { statsMap[s.habit_id] = s; });

        // 4. 映射为年度规划格式
        const mapped = energyHabits.map(h => {
            const st = statsMap[h.id] || { done_days: 0, dates: [] };
            // 按月统计打卡天数
            const monthData = {};
            const dates = st.dates || [];
            dates.forEach(d => {
              const m = parseInt(d.split('-')[1], 10);
              monthData[m] = (monthData[m] || 0) + 1;
            });
            // 按月份归类实际打卡日期集合（用于打卡日历）
            const monthDateSet = {};
            dates.forEach(d => {
              const m = parseInt(d.split('-')[1], 10);
              const day = parseInt(d.split('-')[2], 10);
              if (!monthDateSet[m]) monthDateSet[m] = new Set();
              monthDateSet[m].add(day);
            });
            // 智能推断年度目标：运动类 120 次，其余 230 天
            const name = (h.name || '').toLowerCase();
            const isExercise = /运动|exercise|sport|健身|跑步|run|workout/.test(name);
            const annualTarget = isExercise ? 120 : 230;
            return {
              id: h.id,
              key: h.id,
              label: `${h.emoji || '✅'} ${h.name}`,
              name: h.name,
              emoji: h.emoji || '✅',
              unit: isExercise ? '次' : (h.target_unit || '天'),
              target: annualTarget,
              val: st.done_days || 0,
              month: monthData,
              monthDates: monthDateSet,
              allDates: dates,
            };
          });

        if (!cancelled) { setRealHabits(mapped); setLoading(false); }
      } catch (e) {
        // 未登录或 API 异常 → 回退 mock 数据
        if (!cancelled) { setRealHabits(null); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [refreshKey]);

  return { realHabits, loading, refresh };
}

/* ---------- 3. 视图数据计算 · Overview ---------- */
function useOverviewStats(realHabits, dynamicBooks, dynamicAbilities, dynamicWork, dynamicLife) {
  return useMemo(() => {
    const habits = realHabits || HABITS;
    const energyVal = habits.length > 0
      ? habits.reduce((s, h) => s + pct(h.val, h.target), 0) / habits.length
      : 0;
    const books = dynamicBooks || BOOKS;
    const booksDone = books.filter(b => b.st === 'done').length;
    const cogVal = pct(booksDone, 12);
    const abilities = dynamicAbilities || ABILITY;
    const abilityVal = abilities.length > 0
      ? abilities.reduce((s, a) => {
          const ms = a.mstones.length > 0 ? a.mstones.reduce((t, m) => t + m.pct, 0) / a.mstones.length : 0;
          return s + ms;
        }, 0) / abilities.length
      : 0;
    const work = dynamicWork || WORK;
    const wkMain = work[0];
    const wkVal = wkMain ? wkMain.krs.reduce((s, k) => s + pct(k.v, k.tgt), 0) / wkMain.krs.length : 0;
    const life = dynamicLife || LIFE;
    const lifeVal = life.reduce((s, c) => s + (c.entries.length > 0 ? 50 : 0), 0) / life.length;
    const vals = [energyVal, cogVal, abilityVal, wkVal, lifeVal];
    const weighted = Math.round(
      CATEGORIES.reduce((s, c, i) => s + vals[i] * c.weight, 0)
    );
    return { perCat: vals, weighted };
  }, [realHabits, dynamicBooks, dynamicAbilities, dynamicWork, dynamicLife]);
}

/* ---------- 4. 子组件 · 顶部 Nav 条 ---------- */
function NavBar({ onExport, onImport, onReset }) {
  const year = new Date().getFullYear();
  return (
    <div className="flex items-center justify-between mb-5">
      <a href="#/" className="inline-flex items-center gap-2 text-sm font-medium text-ink-500 hover:text-accent-blue transition">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round"/></svg>
        返回工作台
      </a>
      <div className="flex items-center gap-3">
        <div className="inline-flex items-center rounded-xl border border-ink-100 bg-white p-0.5 gap-0.5">
          <button onClick={onExport} title="导出年度数据为JSON"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-ink-600 hover:bg-ink-50 transition">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" strokeLinecap="round" strokeLinejoin="round"/></svg>
            导出
          </button>
          <label title="从JSON导入年度数据"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-ink-600 hover:bg-ink-50 transition cursor-pointer">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" strokeLinecap="round" strokeLinejoin="round"/></svg>
            导入
            <input type="file" accept="application/json" className="hidden" onChange={onImport}/>
          </label>
        </div>
        <button onClick={onReset} title="重置为初始模板"
          className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-xl text-xs font-semibold text-ink-400 hover:text-accent-red hover:bg-accent-red/5 transition">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <div className="inline-flex items-center gap-2 text-xs font-semibold text-ink-500">
          <span className="px-2 py-0.5 rounded-full bg-ink-100 text-ink-700">{year}</span>
          <span>年度规划</span>
        </div>
      </div>
    </div>
  );
}

/* ---------- 5. 子组件 · Sidebar 导航 ---------- */
const SIDEBAR_ITEMS = [
  { key: 'overview',  label: '年度概览', cat: null, icon: <CategoryIcon catKey="overview" className="w-4 h-4" /> },
  ...CATEGORIES.map(c => ({
    key: c.key, label: c.label, cat: c.key,
    icon: <CategoryIcon catKey={c.key} className="w-4 h-4" />,
    catColor: c.color,
  })),
];

function Sidebar({ active, onChange, stats }) {
  const ring = stats.weighted;
  const year = new Date().getFullYear();
  const yy = String(year).slice(-2);
  return (
    <aside className="w-[260px] flex-shrink-0 flex flex-col gap-2.5 sticky top-6 max-h-[calc(100vh-48px)] overflow-y-auto overflow-x-hidden pr-1">
      {/* Logo + 总进度环 */}
      <div className="glass-card p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-brand-500 flex items-center justify-center text-white font-bold text-sm shadow-sm">
            {yy}
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold text-ink-900 leading-tight">{year} 年度规划</span>
            <span className="text-[11px] text-ink-500 mt-0.5">个人成长计划</span>
          </div>
        </div>
        <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-soft border border-ink-100">
          <div className="relative w-14 h-14 flex-shrink-0">
            <svg viewBox="0 0 36 36" className="w-14 h-14 -rotate-90">
              <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" className="text-ink-100" strokeWidth="3"/>
              <circle cx="18" cy="18" r="15" fill="none" stroke="#4b63f0" strokeWidth="3"
                strokeDasharray={`${(ring / 100) * 94.2} 94.2`} strokeLinecap="round"/>
            </svg>
            <div className="absolute inset-0 flex items-center justify-center text-sm font-bold text-ink-900 tabular-nums">
              {ring}
            </div>
          </div>
          <div className="flex flex-col gap-1 min-w-0">
            <span className="text-xs text-ink-500">年度总进度</span>
            <span className="text-[13px] font-semibold text-ink-900 truncate">已完成 {ring}%</span>
          </div>
        </div>
      </div>

      {/* 导航 */}
      <div className="glass-card p-2 flex-1 flex flex-col">
        <div className="px-2.5 pt-1 pb-2 text-[10px] font-semibold uppercase tracking-wider text-ink-500">
          年度导航
        </div>
        <nav className="flex flex-col gap-0.5 px-1 pb-1">
          {SIDEBAR_ITEMS.map(item => {
            const on = active === item.key;
            const pctVal = item.cat ? Math.round(stats.perCat[CATEGORIES.findIndex(c => c.key === item.cat)]) : null;
            return (
              <button key={item.key} onClick={() => onChange(item.key)}
                className={[
                  'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-all',
                  on
                    ? 'bg-brand-500 text-white font-semibold shadow-sm'
                    : 'text-ink-700 font-medium hover:bg-ink-100'
                ].join(' ')}>
                <span className={['w-7 h-7 rounded-lg grid place-items-center flex-shrink-0',
                  on ? 'bg-white/15 text-white' : item.cat ? '' : 'bg-ink-100 text-ink-500'
                ].join(' ')}
                  style={item.cat && !on ? { background: `${item.catColor}10`, color: item.catColor } : undefined}>
                  {item.icon}
                </span>
                <span className="flex-1 text-left truncate">{item.label}</span>
                {pctVal !== null && (
                  <span className={['text-[11px] font-bold tabular-nums',
                    on ? 'text-white/90' : 'text-ink-500'
                  ].join(' ')}>{pctVal}%</span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* 底部说明 */}
      <div className="px-2 text-[11px] text-ink-400 leading-relaxed">
        五大类目 · 差异化追踪模型<br/>
        工作台年度规划
      </div>
    </aside>
  );
}

/* ---------- 通用 Sparkline 迷你折线图（带月份标注+顶点Hover Tooltip） ---------- */
const Sparkline = ({ data, labels, color = '#22c55e', width = 260, height = 60 }) => {
  const [hoverIdx, setHoverIdx] = useState(null);
  // 🛑 频闪修复：鼠标离开SVG时延迟120ms才隐藏Tooltip，快速移出去又移回来不会抖
  // 🛑 显示端滞后：让最近点锁定后有"吸附感"，不会在两点边界反复横跳
  const HIDE_DELAY_MS = 120;
  const hideTimerRef = useRef(null);
  const svgRef = useRef(null);

  if (!data || data.length === 0) return null;
  const LABEL_H = 14;     // 底部月份标签高度
  // PAD 上下边距：严格控制折线顶部安全距离
  const PAD_T = 6;       // 顶部安全边距：保证折线顶点至少离 SVG 顶 6px，不撞上上方 KPI 数字
  const PAD_B = 4;       // 图表区底边距
  const plotH = height - LABEL_H - PAD_T - PAD_B;
  const max = Math.max(10, Math.max(...data));
  const min = 0;                           // 次数=0是有意义的下限
  const range = Math.max(1, max - min);
  const stepX = data.length === 1 ? 0 : width / (data.length - 1);
  // 🔝 安全天花板：任何情况下顶点 y 不得超过 safeCeilY，保证与 KPI 数字区 >=12px 视觉边距
  // 设计惯例：Apple Health / Google Fit 折线图都会给顶部留 20~25% 空高，避免峰值撞头
  const SAFE_CEIL_PCT = 0.22;
  const safeCeilY = PAD_T + Math.max(4, plotH * SAFE_CEIL_PCT);
  const gid = 'sg-' + color.replace('#','') + '-' + Math.abs(data.reduce((s,v)=>s+v,0)).toString(36);

  const pts = data.map((v, i) => {
    const x = i * stepX;
    // 基础 y 计算：min越高越靠上（y=PAD_T 是顶）
    const rawY = PAD_T + plotH - (((v - min) / range) * (plotH - 2)) - 1;
    // 强制不超过安全天花板：越小越靠上，所以取 Math.max（y值越大越靠下）
    const y = Math.max(rawY, safeCeilY);
    return { x, y, v, rawY };
  });
  const ptsStr = pts.map(p => `${p.x},${p.y}`).join(' ');
  const areaPath = 'M0,' + (PAD_T + plotH) + ' L' + ptsStr + ' L' + (width) + ',' + (PAD_T + plotH) + ' Z';
  const linePath = pts.map((p, i) => (i === 0 ? 'M' : 'L') + `${p.x},${p.y}`).join(' ');
  const labelY = PAD_T + plotH + PAD_B + LABEL_H - 2;
  // 显示标签策略：点数<=8 全部显示；否则首尾+每2个或首尾+中间
  const showIdx = new Set();
  if (data.length <= 8) {
    for (let i = 0; i < data.length; i++) showIdx.add(i);
  } else {
    showIdx.add(0);
    showIdx.add(data.length - 1);
    for (let i = 2; i < data.length - 1; i += 3) showIdx.add(i);
  }

  // 🎯 Voronoi 就近匹配：给定鼠标SVG坐标，找到距离最近的数据点
  // 这是 Recharts/Highcharts/Apple Health 解决频闪的标准工业级方案
  const findNearestIdx = (mx, my) => {
    let bestI = 0;
    let bestDist = Infinity;
    // 先按x坐标快速锁定候选点（减少遍历）
    const approxIdx = Math.max(0, Math.min(pts.length - 1, Math.round(mx / stepX)));
    const searchRadius = 2; // 检查候选点左右各2个，共5个点足够覆盖
    for (let d = -searchRadius; d <= searchRadius; d++) {
      const i = approxIdx + d;
      if (i < 0 || i >= pts.length) continue;
      const p = pts[i];
      // 曼哈顿距离 + y轴权重1.2（y方向误差容忍度略小）
      const dx = p.x - mx;
      const dy = (p.y - my) * 1.2;
      const dist = Math.abs(dx) + Math.abs(dy);
      if (dist < bestDist) { bestDist = dist; bestI = i; }
    }
    // 扩大吸附半径：只要鼠标在 SVG 范围内，就认为是附近（stepX/2内100%吸附，否则降级）
    const snapRadius = Math.max(stepX * 0.7, 20); // 至少20px 吸附半径
    const pBest = pts[bestI];
    if (Math.abs(pBest.x - mx) <= snapRadius) return bestI;
    // x超界太远：认为在全图范围只要不超2倍步长还是给点
    if (Math.abs(pBest.x - mx) <= stepX * 1.8) return bestI;
    return null;
  };

  const hp = hoverIdx !== null ? pts[hoverIdx] : null;
  return (
    <div className="relative w-full" style={{ width, height: height + LABEL_H }}>
      <svg
        ref={svgRef}
        width={width}
        height={height + LABEL_H}
        className="overflow-visible"
        style={{ cursor: 'pointer' }}
        // ✅ 核心修复1：SVG 根级监听 mousemove，全图任意位置都触发找最近点
        //         不再依赖小 rect 命中，鼠标在附近就能锁定
        onMouseMove={(e) => {
          // 先清掉 hide 定时器（鼠标还在图上，不应该消失）
          if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }
          const rect = e.currentTarget.getBoundingClientRect();
          const mx = ((e.clientX - rect.left) / rect.width) * width;
          const my = ((e.clientY - rect.top) / rect.height) * (height + LABEL_H);
          const ni = findNearestIdx(mx, my);
          if (ni !== null) setHoverIdx(ni);
        }}
        // ✅ 核心修复2：leave 不立即清空，给 120ms 宽限期
        //         鼠标在 SVG 边缘 / 快速从点移到 Tooltip 都不会抖
        onMouseLeave={() => {
          if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
          hideTimerRef.current = setTimeout(() => {
            setHoverIdx(null);
            hideTimerRef.current = null;
          }, HIDE_DELAY_MS);
        }}
        onMouseEnter={() => {
          if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }
        }}
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* 区域填充 */}
        <path d={areaPath} fill={'url(#' + gid + ')'} />
        {/* 折线 */}
        <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {/* 🔹 辅助垂直追踪线（仅 hover 时显示，强化「已吸附到最近点」的视觉反馈）*/}
        {hp && (
          <line x1={hp.x} y1={PAD_T - 2} x2={hp.x} y2={PAD_T + plotH}
            stroke={color} strokeWidth="1" strokeDasharray="3 3" strokeOpacity="0.35" />
        )}
        {/* 数据点圆点（hover显示+最后一个常显）*/}
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y}
            r={(hoverIdx === i || i === pts.length - 1) ? (i === pts.length - 1 && hoverIdx !== i ? 2.5 : 3.5) : 2}
            fill={hoverIdx === i ? color : (i === pts.length - 1 ? color : 'transparent')}
            stroke={hoverIdx === i ? '#fff' : (i === pts.length - 1 ? '#fff' : color)}
            strokeWidth={hoverIdx === i ? 1.5 : (i === pts.length - 1 ? 1 : 0)}
            fillOpacity={(hoverIdx === i || i === pts.length - 1) ? 1 : 0}
          />
        ))}
        {/* 底部月份标签 */}
        {labels && labels.length === data.length && pts.map((p, i) =>
          showIdx.has(i) && (
            <text key={'l'+i} x={p.x} y={labelY} textAnchor="middle"
              fontSize="11" fontWeight="600"
              fill={i === data.length - 1 || hoverIdx === i ? color : '#9ca3af'}
              style={{ fontFamily: 'ui-sans-serif, system-ui', fontVariantNumeric: 'tabular-nums' }}>
              {labels[i]}
            </text>
          )
        )}
      </svg>
      {/* Hover Tooltip */}
      {hp && (
        <div className="pointer-events-none absolute z-20"
          style={{
            left: Math.min(Math.max(hp.x - 42, 0), width - 84),
            top: Math.max(hp.y - 34, -2),
          }}>
          <div className="px-2.5 py-1.5 rounded-lg border border-ink-100 bg-white shadow-[0_4px_14px_rgba(17,24,39,0.08)] flex flex-col items-center gap-0.5"
            style={{ minWidth: 72 }}>
            {labels && labels[hoverIdx] && (
              <div className="text-[11px] font-semibold text-ink-400 leading-none">{labels[hoverIdx]}月</div>
            )}
            <div className="text-[15px] font-bold tabular-nums leading-tight" style={{ color }}>
              {hp.v} 次
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* ---------- 6. 视图 · Overview ---------- */
function OverviewView({ onNav, stats, realHabits, books, abilities, workGoals, lifeData, timeScale, onTimeScaleChange }) {
  const year = new Date().getFullYear();
  const habits = realHabits || HABITS;
  const dynBooks = books || BOOKS;
  const dynAbilities = abilities || ABILITY;
  const dynWork = workGoals || WORK;
  const now = new Date();

  // 时间维度数据计算
  const getTimeScaleData = () => {
    const curMonth = now.getMonth() + 1;
    const curDay = now.getDate();
    const dayOfWeek = now.getDay() || 7; // 1-7 (Mon-Sun)
    const weekStart = curDay - dayOfWeek + 1;
    const weekEnd = Math.min(weekStart + 6, [31,28,31,30,31,30,31,31,30,31,30,31][curMonth - 1]);
    const monthDaysInYear = [31,28,31,30,31,30,31,31,30,31,30,31];

    if (timeScale === 'week') {
      const weekCheckins = habits.reduce((s, h) => {
        let count = 0;
        for (let d = weekStart; d <= weekEnd; d++) {
          // 简化：用当月打卡数据估算本周
          if (h.month?.[curMonth] && d <= curDay) count += Math.max(0, Math.round((h.month[curMonth] / curDay)));
        }
        return s + count;
      }, 0);
      const weekDaysLeft = Math.max(0, 7 - (curDay - weekStart + 1));
      return {
        periodLabel: `${curMonth}月${weekStart}-${weekEnd}日`,
        stat1: { label: '本周打卡', v: weekCheckins, u: '次', color: '#22c55e' },
        stat2: { label: '周完成率', v: Math.round(stats.weighted * 0.25), u: '%', color: '#4b63f0' },
        stat3: { label: '剩余天数', v: weekDaysLeft, u: '天', color: '#f59e0b' },
        subtitle: '本周进度',
      };
    }
    if (timeScale === 'month') {
      const monthCheckins = habits.reduce((s, h) => s + (h.month?.[curMonth] || 0), 0);
      const monthDaysLeft = Math.max(0, monthDaysInYear[curMonth - 1] - curDay);
      const monthBooks = dynBooks.filter(b => b.st === 'done').length;
      return {
        periodLabel: `${curMonth}月`,
        stat1: { label: '本月打卡', v: monthCheckins, u: '次', color: '#22c55e' },
        stat2: { label: '月度完成', v: Math.round(stats.weighted * (curDay / monthDaysInYear[curMonth - 1])), u: '%', color: '#4b63f0' },
        stat3: { label: '剩余天数', v: monthDaysLeft, u: '天', color: '#f59e0b' },
        subtitle: '本月进度',
      };
    }
    // year
    const totalCheckins = habits.reduce((s, h) => s + h.val, 0);
    const booksDone = dynBooks.filter(b => b.st === 'done').length;
    const abilityDoneMs = dynAbilities.reduce((s, a) => s + a.mstones.filter(m => m.st === 'done').length, 0);
    const workDoneKrs = dynWork.reduce((s, o) => s + o.krs.filter(k => k.st === 'done').length, 0);
    const endOfYear = new Date(year, 11, 31);
    const daysLeft = Math.max(0, Math.ceil((endOfYear - now) / 86400000));
    return {
      periodLabel: `${year}年度`,
      stat1: { label: '完成目标', v: booksDone + abilityDoneMs + workDoneKrs, u: '个', color: '#4b63f0' },
      stat2: { label: '累计打卡', v: totalCheckins, u: '次', color: '#22c55e' },
      stat3: { label: '今年剩余', v: daysLeft, u: '天', color: '#f59e0b' },
      subtitle: '已完成',
    };
  };

  const tsData = getTimeScaleData();
  const perCat = stats.perCat;
  let bestIdx = 0, worstIdx = 0;
  perCat.forEach((v, i) => { if (v > perCat[bestIdx]) bestIdx = i; if (v < perCat[worstIdx]) worstIdx = i; });

  const scaleTabs = [
    { k: 'week', lb: '本周' },
    { k: 'month', lb: '本月' },
    { k: 'year', lb: '全年' },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Hero */}
      <section className="glass-card p-5 flex items-center gap-6">
        <div className="relative flex-shrink-0">
          <div className="absolute -inset-3 rounded-full bg-brand-500/5" />
          <div className="relative w-[120px] h-[120px]">
            <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
              <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" className="text-ink-100" strokeWidth="2.5"/>
              <circle cx="18" cy="18" r="15" fill="none" stroke="#4b63f0" strokeWidth="2.5"
                strokeDasharray={`${(stats.weighted / 100) * 94.2} 94.2`} strokeLinecap="round"/>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-bold text-ink-900 tabular-nums leading-none">{stats.weighted}</span>
              <span className="text-xs text-ink-500 mt-1">/ 100</span>
            </div>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <h2 className="text-base font-bold text-ink-900 tracking-tight">{year} 年度规划总览</h2>
            {/* P0 / 2.1: 周·月·年视图切换，分段控件风格强化，符合工作台设计系统 */}
            <div className="inline-flex p-0.5 rounded-xl bg-surface-soft border border-ink-100 shadow-[0_1px_2px_rgba(17,24,39,0.04)]">
              {scaleTabs.map(t => (
                <button key={t.k} onClick={() => onTimeScaleChange(t.k)}
                  className={[
                    'relative px-3.5 py-1.5 rounded-lg text-[11px] font-bold transition-all duration-200',
                    timeScale === t.k
                      ? 'bg-white text-ink-900 shadow-[0_1px_3px_rgba(17,24,39,0.08),0_1px_2px_rgba(17,24,39,0.04)] ring-1 ring-ink-100'
                      : 'text-ink-400 hover:text-ink-600 hover:bg-white/40'
                  ].join(' ')}>
                  {t.lb}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold"
              style={{ background: `${CATEGORIES[bestIdx].color}12`, color: CATEGORIES[bestIdx].color }}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M5 15l7-7 7 7" strokeLinecap="round"/></svg>
              最优 · {CATEGORIES[bestIdx].label} {Math.round(stats.perCat[bestIdx])}%
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold"
              style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b' }}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7" strokeLinecap="round"/></svg>
              待提升 · {CATEGORIES[worstIdx].label} {Math.round(stats.perCat[worstIdx])}%
            </span>
          </div>
          <p className="text-sm text-ink-500 leading-relaxed mb-4">
            {tsData.subtitle} <span className="font-semibold text-ink-900">{stats.weighted}%</span> 的{tsData.periodLabel}计划
          </p>
          <div className="grid grid-cols-3 gap-0 max-w-xl">
            {[tsData.stat1, tsData.stat2, tsData.stat3].map(s => (
              <div key={s.label} className="flex flex-col gap-0.5 pr-6">
                <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: s.color }}>{s.label}</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-bold text-ink-900 tabular-nums leading-none">{s.v}</span>
                  <span className="text-xs text-ink-500">{s.u}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5 类目卡片 */}
      <section className="grid grid-cols-5 gap-3 annual-cat-grid">
        {CATEGORIES.map((c, i) => {
          const v = Math.round(stats.perCat[i]);
          return (
            <button key={c.key} onClick={() => onNav(c.key)}
              className="glass-card p-4 text-left flex flex-col gap-3 hover:shadow-cardL transition-all group">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg grid place-items-center bg-ink-100 text-ink-500"
                  style={{ color: c.color, background: `${c.color}10` }}>
                  <CategoryIcon catKey={c.key} className="w-4 h-4" />
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-ink-900 leading-tight">{c.label}</span>
                  <span className="text-xs text-ink-500">{c.type}</span>
                </div>
                <span className="ml-auto text-xs font-bold tabular-nums group-hover:opacity-80 transition"
                  style={{ color: c.color }}>
                  {v}%
                </span>
              </div>
              <ProgressBar value={v} color={c.color} />
              <CatSummary cat={c.key} realHabits={realHabits} books={books} abilities={abilities} workGoals={workGoals} lifeData={lifeData} />
            </button>
          );
        })}
      </section>
    </div>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div className="p-2.5 rounded-xl bg-surface-soft border border-ink-100 flex items-baseline gap-1.5">
      <div className="flex flex-col">
        <span className="text-xs font-semibold text-ink-500 uppercase tracking-wide">{label}</span>
        <div className="flex items-baseline gap-0.5">
          <span className="text-base font-bold text-ink-900 tabular-nums leading-tight">{value}</span>
          <span className="text-xs text-ink-500">{sub}</span>
        </div>
      </div>
    </div>
  );
}

function CatSummary({ cat, realHabits, books, abilities, workGoals, lifeData }) {
  switch (cat) {
    case 'energy': {
      const habits = realHabits || HABITS;
      if (habits.length === 0) return <div className="text-xs text-ink-400 pt-1">暂无精力类习惯</div>;
      return (
        // P1-3: 删border-t
        <div className="flex flex-col gap-1.5 text-xs text-ink-500 pt-1">
          {habits.map(h => (
            <SummaryRow key={h.key} lb={h.name || h.label.replace(/^\S+\s/, '')} v={h.val} t={h.target} />
          ))}
        </div>
      );
    }
    case 'cognition': {
      const dynBooks = books || BOOKS;
      const done = dynBooks.filter(b => b.st === 'done').length;
      const reading = dynBooks.filter(b => b.st === 'reading').length;
      const target = COG_KRS[0]?.tgt || 12;
      const krPct = pct(done, target);
      return (
        <div className="flex flex-col gap-1.5 text-xs text-ink-500 pt-1">
          <div>年度目标 <span className="font-semibold text-ink-900 tabular-nums">{done}</span> / {target} 本</div>
          <div className="text-xs text-ink-500">完成率 {krPct}% · 在读 {reading} 本</div>
        </div>
      );
    }
    case 'ability': {
      const dynAb = abilities || ABILITY;
      return (
        <div className="flex flex-col gap-1.5 text-xs text-ink-500 pt-1">
          {dynAb.map(a => {
            const mDone = a.mstones.filter(m => m.st === 'done').length;
            const mTotal = a.mstones.length;
            return <SummaryRow key={a.title} lb={a.title} v={mDone} t={mTotal} />;
          })}
        </div>
      );
    }
    case 'work': {
      const dynWk = workGoals || WORK;
      const main = dynWk[0], side = dynWk[1];
      const mainP = main ? Math.round(main.krs.reduce((s, k) => s + pct(k.v, k.tgt), 0) / main.krs.length) : 0;
      const sideP = side ? Math.round(side.krs.reduce((s, k) => s + pct(k.v, k.tgt), 0) / side.krs.length) : 0;
      return (
        <div className="flex flex-col gap-1.5 text-xs text-ink-500 pt-1">
          <div className="flex items-center justify-between"><span>主业完成</span><span className="font-semibold text-ink-900 tabular-nums">{mainP}%</span></div>
          <div className="flex items-center justify-between"><span>副业完成</span><span className="font-semibold text-ink-900 tabular-nums">{sideP}%</span></div>
          <div className="text-xs text-ink-500">薪资目标 · 截止 {main?.deadline || ''}</div>
        </div>
      );
    }
    case 'life': {
      const dynLife = lifeData || LIFE;
      // P1-3: 生活改文字标签而非5小格
      const total = dynLife.reduce((s, c) => s + c.entries.length, 0);
      return (
        <div className="flex flex-col gap-1 text-xs text-ink-500 pt-1">
          <div>累计 <span className="font-semibold text-ink-900 tabular-nums">{total}</span> 条生活记录</div>
          <div className="text-[11px] text-ink-500 leading-snug truncate">
            {dynLife.map(i => `${i.lb}${i.entries.length}`).join(' · ')}
          </div>
        </div>
      );
    }
    default: return null;
  }
}

function SummaryRow({ lb, v, t }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span>{lb}</span>
      <span className="tabular-nums font-semibold text-ink-700">{v}/{t}</span>
    </div>
  );
}

/* ---------- 7. 视图 · 精力 (习惯打卡) ---------- */
function EnergyView({ realHabits, loading, onAction, onSetTarget }) {
  const months = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
  const habits = realHabits || HABITS;
  // 正在编辑目标的行 habit key，null = 不编辑
  const [editingTargetKey, setEditingTargetKey] = useState(null);
  const [targetDraft, setTargetDraft] = useState('');
  // 联动状态：L2各月数据点击月份 → L3日历切换到对应月
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);

  if (loading && !realHabits) {
    return (
      <div className="flex flex-col gap-4">
        <div className="glass-card p-16 flex flex-col items-center justify-center gap-4">
          <div className="relative w-10 h-10">
            <div className="absolute inset-0 rounded-full border-2 border-ink-100" />
            <div className="absolute inset-0 rounded-full border-2 border-brand-500 border-t-transparent" style={{ animation: 'spin 0.8s linear infinite' }} />
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="text-sm font-semibold text-ink-700">正在同步习惯数据...</span>
            <span className="text-xs text-ink-500">从工作台自动读取精力类习惯的年度打卡记录</span>
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }
  if (habits.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <div className="glass-card p-16 flex flex-col items-center justify-center gap-3 text-center">
          <div className="w-12 h-12 rounded-2xl bg-accent-green/10 grid place-items-center">
            <svg className="w-6 h-6 text-accent-green" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          </div>
          <div className="flex flex-col items-center gap-1">
            <p className="text-sm font-bold text-ink-900">还没有精力类习惯</p>
            <p className="text-xs text-ink-500 max-w-sm">前往工作台「习惯」面板创建睡眠、喝水、运动等打卡习惯，<br/>这里会自动同步年度打卡数据</p>
          </div>
        </div>
      </div>
    );
  }

  // 直接展示 1-12 月，不分上下半年
  const monthIndices = [1,2,3,4,5,6,7,8,9,10,11,12];
  const monthLabels = months;
  const monthMaxDays = [31,28,31,30,31,30,31,31,30,31,30,31];
  const today = new Date();
  const year = today.getFullYear();
  const curMonth = today.getMonth() + 1;
  const curDay = today.getDate();
  const isCurrentMonth = (m) => m === curMonth;
  const daysElapsedInCurMonth = curDay;

  // 计算习惯的月度分析
  const getMonthAnalysis = (habit) => {
    const curMonthVal = habit.month?.[curMonth] || 0;
    const prevMonthIdx = curMonth === 1 ? 12 : curMonth - 1;
    const prevMonthVal = habit.month?.[prevMonthIdx] || 0;
    const expectedCur = daysElapsedInCurMonth;
    const achievementRate = expectedCur > 0 ? Math.round((curMonthVal / expectedCur) * 100) : 0;
    const delta = prevMonthVal > 0 ? Math.round(((curMonthVal - prevMonthVal) / prevMonthVal) * 100) : null;
    return { curMonthVal, prevMonthVal, achievementRate, delta, expectedCur };
  };

  // 计算精力模块完成率
  const energyPct = habits.length > 0
    ? Math.round(habits.reduce((s, h) => s + pct(h.val, h.target), 0) / habits.length)
    : 0;

  // 开始编辑目标
  const startEditTarget = (h) => {
    setEditingTargetKey(h.id || h.key);
    setTargetDraft(String(h.target));
  };
  // 提交目标修改
  const commitTarget = (h) => {
    const key = h.id || h.key;
    const v = Math.round(Number(targetDraft) || 0);
    if (v > 0 && v !== h.target) {
      onSetTarget?.(key, v);
    }
    setEditingTargetKey(null);
    setTargetDraft('');
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="glass-card overflow-hidden">
        {/* L1 区块：年度数据概览 — 视觉层级最重
             ⭐ 三维度强化 L1 区分度：
               1. 字号 15→16px（最大一级区块标题）
               2. 左侧 2px 绿色竖条（强化锚点，Notion/Lark 同款区块强调方式）
               3. 内部 padding px-4→px-5（内容不贴边，呼吸感更强）
        */}
        <div className="px-4 py-3 bg-surface-soft/50">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2.5">
              {/* 🟢 统一绿色粗条锚点：5px宽 × 18px高 accent-green（三区块完全统一的视觉标识，对齐项目标准5px） */}
              <span className="w-[5px] h-[18px] rounded-full bg-accent-green flex-shrink-0"></span>
              {/* 标题 15→16px 加大一号，Bold ink-800 保持强视觉权重 */}
              <span className="text-[16px] font-bold text-ink-900">{year}年 · 年度数据</span>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => onAction?.('addHabit')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-accent-green/10 text-accent-green text-xs font-bold hover:bg-accent-green/15 transition">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" strokeLinecap="round"/></svg>
                添加
              </button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {habits.map(h => {
              const yearlyPct = pct(h.val, h.target);
              const GREEN = '#22c55e';

              // 年度走势（1月~当前月）— 各月打卡次数绝对值
              const yearCounts = [];
              const yearMonthLabels = [];
              for (let m = 1; m <= curMonth; m++) {
                yearCounts.push(h.month?.[m] || 0);
                yearMonthLabels.push(`${m}`);
              }

              return (
                /* ⭐ KPI 信息簇视觉层级（已删除冗余进度条，%数字+累计/目标 成为核心信息链）
                   统一：字号x字重x颜色 严格分层，消除混乱感
                   左 习惯标题：15px 700 ink-900
                   右 ROW1 主KPI：%数字(16px 700 绿) + %(12px ink-500)
                   右 ROW2 次KPI：累计(14px 600 ink-900) / 分隔(ink-300) / 目标(14px 600 ink-700) 单位(12px ink-400)
                */
                <div key={h.key}
                  className="grid p-3 pb-2 rounded-xl bg-white border border-ink-100 shadow-[0_1px_2px_rgba(17,24,39,0.03)] hover:shadow-[0_2px_6px_rgba(17,24,39,0.05)] transition-shadow h-[168px]"
                  style={{ gridTemplateRows: 'auto 1fr auto' }}>
                  {/* ROW1+ROW2 合并为一行紧凑的 KPI 信息矩阵 — 左侧习惯名 + 右侧双行KPI严格对齐 */}
                  <div className="flex items-start justify-between gap-2">
                    {/* 左列：习惯名 — 统一 14px Semibold ink-700，比区块标题(15px Bold ink-800)弱一档，层级清晰 */}
                    <span className="text-[14px] font-semibold text-ink-700 leading-[1.4] truncate pt-0.5 flex-shrink-1 min-w-0 max-w-[60%]">{h.label}</span>
                    {/* 右列：双行 KPI 矩阵 — 右对齐基线严格对齐 */}
                    <div className="flex flex-col items-end gap-1 flex-shrink-0 min-w-[38%]">
                      {/* 🥇 主 KPI 行：% 数字为绝对核心（唯一视觉焦点） */}
                      <div className="flex items-baseline leading-none">
                        <span className="text-[16px] font-bold tabular-nums leading-none" style={{color: GREEN}}>{yearlyPct}</span>
                        <span className="text-[12px] font-semibold text-ink-500 leading-none align-baseline ml-0.5">%</span>
                      </div>
                      {/* 🥈 次 KPI 行（弱化版）：累计 / 目标 + 单位
                         ⭐ 降1档字重 Semibold→Medium + 降1号字号 14→13px + 颜色改 ink-500 灰色
                         原则：次信息不应与主KPI（%绿色）竞争注意力，降级为"参考信息"
                      */}
                      <div className="flex items-baseline leading-none">
                        <span className="text-[13px] font-medium tabular-nums text-ink-500">{h.val}</span>
                        <span className="text-[13px] font-medium tabular-nums text-ink-400 mx-[4px]">/</span>
                        <span className="text-[13px] font-medium tabular-nums text-ink-500">{h.target}</span>
                        <span className="text-[12px] font-medium tabular-nums text-ink-400 ml-0.5 align-baseline">{h.unit}</span>
                      </div>
                    </div>
                  </div>
                  {/* ROW2: 1fr 弹性吸空区，吃掉多余空白，保证折线图贴底 */}
                  <div className="min-h-0"></div>
                  {/* ROW3: 折线图贴底 — -mb-2px 压到卡片底线附近 */}
                  <div className="-mx-1 -mb-[2px]">
                    <Sparkline data={yearCounts} labels={yearMonthLabels} color={GREEN} width={260} height={58} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {/* L2 区块：各月数据表格
             ⭐ 紧急修复 3 项设计缺陷：
               1. 去掉 bg-surface-soft：玻璃卡已有 bg-surface，再叠加一层灰 → L1/L2/L3 三层灰度完全撞色（=层级感全废）
               2. 去掉表头独有 rounded-t-lg：表格是表头+3行一个整体，应该给最外层容器加 rounded-xl，表头和行都保持直边
               3. 区块间距：L1-L2 之间无分隔 → 加 my-4 + border-t border-ink-100 的 12px 空白通道
        */}
        {/* L2: mt-4(上间距) + border-t border-ink-100(分割线) + pt-4(下间距)
            统一16px对称间距，与L3分割线完全一致 */}
        <div className="mt-4 px-0 pb-0 rounded-xl border-t border-ink-100 bg-transparent pt-4">
            {/* 表头：py-2收紧垂直间距，去掉border-y分割线 */}
            <div className="grid habit-table px-4 py-2 bg-transparent text-[14px] font-semibold text-ink-700">
              <div className="grp-start whitespace-nowrap overflow-hidden text-ellipsis flex items-center gap-2">
                {/* 🟢 统一绿色粗条锚点：5px宽 × 18px高 accent-green（与L1/L3完全统一的视觉标识，对齐项目标准5px） */}
                <span className="w-[5px] h-[18px] rounded-full bg-accent-green flex-shrink-0"></span>
                {/* L2 标题统一 font-bold text-ink-900(已定义)，与L1/L3完全一致 */}
                <span className="text-[16px] font-bold text-ink-900">{year}年 · 各月数据</span>
              </div>
              {/* 🔧 对齐修复：表头统计列使用 pr-2 的右侧边距，与下方 data-cell 的右边缘严格一致 */}
              <div className="text-right pr-2 whitespace-nowrap">目标</div>
              <div className="text-right pr-2 whitespace-nowrap">累计</div>
              <div className="text-right pr-2 whitespace-nowrap grp-end">完成率</div>
              {monthLabels.map((m, idx) => {
                const monthNum = idx + 1;
                const isCur = isCurrentMonth(monthNum);
                const isSelected = selectedMonth === monthNum;
                const isFuture = monthNum > curMonth;
                return (
                  <button
                    key={m}
                    onClick={() => !isFuture && setSelectedMonth(monthNum)}
                    disabled={isFuture}
                    className={[
                      'text-center whitespace-nowrap tabular-nums transition-colors rounded px-1 py-0.5',
                      isSelected
                        ? 'text-accent-green font-bold bg-accent-green/10 cursor-pointer'
                        : isFuture
                          ? 'text-ink-300 cursor-not-allowed'
                          : 'text-ink-600 font-medium hover:text-accent-green hover:bg-accent-green/5 cursor-pointer'
                    ].join(' ')}
                  >
                    {m}
                  </button>
                );
              })}
            </div>
            {habits.map(h => {
              const p = pct(h.val, h.target);
              const GREEN = '#22c55e';
              const hkey = h.id || h.key;
              const isEditing = editingTargetKey === hkey;
              return (
                <div key={hkey} className="grid habit-table px-4 py-1.5 items-center transition-colors group">
                  <div className="flex items-center gap-2 min-w-0 cursor-pointer grp-start whitespace-nowrap overflow-hidden text-ellipsis pl-2" onClick={() => onAction?.('editHabit', h)}>
                    {/* 统一 14px Semibold ink-700：与年度数据卡片/打卡日历习惯标题完全一致 */}
                    <span className="text-[14px] font-semibold text-ink-700 truncate">{h.label}</span>
                  </div>
                  {/* 目标 - inline 编辑 */}
                  <div className="text-right tabular-nums font-medium" onClick={(e) => e.stopPropagation()}>
                    {isEditing ? (
                      <input
                        autoFocus
                        type="number"
                        min="1"
                        value={targetDraft}
                        onChange={(e) => setTargetDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitTarget(h);
                          if (e.key === 'Escape') { setEditingTargetKey(null); setTargetDraft(''); }
                        }}
                        onBlur={() => commitTarget(h)}
                        className="w-16 ml-auto px-2 py-1 text-[14px] font-bold text-right border border-accent-green rounded-md outline-none focus:ring-2 focus:ring-accent-green/30 tabular-nums text-ink-900 bg-white"
                      />
                    ) : (
                      <div onClick={() => startEditTarget(h)} className="inline-flex items-center justify-end gap-0 hover:bg-accent-green/8 rounded-md transition cursor-pointer w-full pr-0">
                        <span className="text-[14px] font-semibold text-ink-700 tabular-nums text-right ml-1">{h.target}</span>
                        <span className="text-[12px] text-ink-500 ml-1">{h.unit}</span>
                      </div>
                    )}
                  </div>
                  <div className="text-right font-semibold tabular-nums text-ink-900 text-[14px] cum-gap">{h.val}</div>
                  {/* 完成率 - 内联样式确保绿色(#22c55e)，与L1卡片百分比颜色完全一致 */}
                  <div className="text-right cursor-pointer grp-end" onClick={() => onAction?.('editHabit', h)}>
                    <span className="text-[14px] font-semibold tabular-nums" style={{color: GREEN}}>{p}%</span>
                  </div>
                  {monthIndices.map((monthIdx) => {
                    const n = h.month?.[monthIdx] || 0;
                    const isFuture = monthIdx > curMonth;
                    const isCur = isCurrentMonth(monthIdx);

                    // ↓↓ 月份汇总格子样式 ↔ 打卡日历小方块 三态严格一一对应：
                    //    🔝 字重规范（数据仪表盘工业惯例）：所有非重点态统一 font-semibold(600) 打底，
                    //        重点态（已打卡/有数据）才升级为 font-bold(700)
                    //        灰色态只通过颜色降级，绝不通过降字重来"假装隐形"
                    let cellBg = '';
                    let cellText = '';
                    let cellBorder = '';
                    let cellRing = '';
                    if (n > 0) {
                      // ✅ 已打卡 → 日历「已打卡」态：实心绿 + 白字 Bold 700（与日历方块完全一致）
                      cellBg = 'bg-accent-green';
                      cellText = 'text-white font-bold';
                    } else if (isFuture) {
                      // 未开始 → 日历「未开始」态：浅灰底+细灰边 + ink-300 Semibold 600
                      cellBg = 'bg-ink-50';
                      cellText = 'text-ink-300 font-semibold';
                      cellBorder = 'border border-ink-100';
                    } else {
                      // ⭕ 未打卡（已过/当前月打卡0）→ 日历「未打卡」态：中灰底 + ink-400 Semibold 600
                      //    🔴 修复之前缺 font-semibold 导致字重掉到父级 normal(400)，与日历方块 600 差 2 档
                      cellBg = 'bg-ink-100';
                      cellText = 'text-ink-400 font-semibold';
                    }
                    if (isCur) {
                      cellRing = n > 0
                        ? 'ring-2 ring-accent-green/40 ring-offset-1'
                        : 'ring-2 ring-ink-300/50 ring-offset-1';
                    }
                    return (
                      <div key={monthIdx} className="flex justify-center">
                        <span className={[
                          // 🔝 月份格子数字与日历方块双向统一：13→12px
                          //     保持字重统一（font-semibold/bold升级）、leading-none 统一
                          //     方块尺寸：30×30 保持不变，数字缩小 1px → 周围多出 1px 呼吸感（刚好与 L3 整体呼吸感方案一致）
                          'text-[12px] tabular-nums text-center leading-none grid place-items-center transition-colors',
                          'aspect-square w-[30px] h-[30px] rounded-md',
                          cellBg, cellText, cellBorder, cellRing
                        ].join(' ')}>{n}</span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
        </div>
        {/* L3 区块：当月打卡日历
             ⭐ 紧急修复 4 项设计缺陷：
               1. ❌ 去掉 mx-2：L1/L2 占满整宽，L3 用 mx-2 反而比上两块窄 8px → 变成"缩进的备注段"不像第三大区块
               2. ❌ 去掉 border + bg-surface-soft/30 + shadow：玻璃卡本身已经 bg-surface + 圆角 + 阴影，
                  在里面再叠一个独立圆角边框卡片 = 「卡片套卡片」视觉混乱 = 3层灰度完全没区分度！
                  设计铁则：如果父级已经是卡片，子区块只能靠"内容密度/留白/分隔线/标题层级"区分，不能再加独立卡片容器
               3. ✅ 替换为：mb-6（底部足够呼吸通道） + mt-5 分隔 + 与 L1/L2 同宽 + 用细线分隔 L2/L3
               4. ✅ 标题两侧锚点改为 ink-200 纯灰（不使用 border 边框条，避免 L3 最"实"，层级反而重）
        */}
        {/* L3: mt-4(上间距) + border-t border-ink-100(分割线) + pt-4(下间距)
            统一16px对称间距，与L2分割线完全一致 */}
        <div className="w-full px-4 mt-4 pt-4 pb-6 border-t border-ink-100 bg-transparent">
          <div className="flex items-center justify-between mb-4">
            {/* L3 标题 15→16px 加大一号，Bold ink-800 保持强视觉权重，与L1一致 */}
            <span className="flex items-center gap-2">
              {/* 🟢 统一绿色粗条锚点：5px宽 × 18px高 accent-green（与L1/L2完全统一的视觉标识，对齐项目标准5px） */}
              <span className="w-[5px] h-[18px] rounded-full bg-accent-green flex-shrink-0"></span>
              <span className="text-[16px] font-bold text-ink-900">{year}年 · {selectedMonth}月数据</span>
            </span>
            <div className="flex items-center gap-3 text-[12px] text-ink-500">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-[17px] h-[17px] rounded-md bg-accent-green shadow-[0_0_0_1px_rgba(34,197,94,0.15)]"></span>已打卡
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-[17px] h-[17px] rounded-md bg-ink-100 shadow-[0_0_0_1px_rgba(17,24,39,0.04)]"></span>未打卡
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-[17px] h-[17px] rounded-md bg-ink-50 border border-ink-200"></span>未开始
              </span>
            </div>
          </div>
          {/* 行间距 gap-3.5：三行习惯行之间 14px 间距（适度收紧，不再过松） */}
          <div className="flex flex-col gap-3.5">
            {habits.map((h, hidx) => {
              const daysTotal = monthMaxDays[selectedMonth - 1];
              const realDates = h.monthDates?.[selectedMonth];
              const completedDays = realDates
                ? realDates
                : new Set(Array.from({ length: h.month?.[selectedMonth] || 0 }, (_, i) => i + 1));
              return (
                // 去掉 py-1 上下padding，方块行不再有额外上下内边距
                <div key={h.key} className="flex items-center gap-3">
                  {/* 统一 14px Semibold ink-700：与年度数据卡片/各月数据表格习惯标题完全一致
                      pl-2: 8px左缩进, 比区块大标题往里缩, 形成子级层级关系 */}
                  <div className="w-[135px] flex-shrink-0 truncate pl-2">
                    <span className="text-[14px] font-semibold text-ink-700 truncate">{h.label}</span>
                  </div>
                  {/* 严格无横滚 + 呼吸感强化：gap从2→3px（格子间多1px空气感），
                      数字 13→12px 精致缩小但依然保持 semibold/bold 字重统一 */}
                  <div className="flex-1 grid" style={{gridTemplateColumns: `repeat(${daysTotal}, minmax(0, 1fr))`, gap: '3px'}}>
                    {Array.from({ length: daysTotal }, (_, d) => {
                      const day = d + 1;
                      // 选中月=当前月时用真实天数判断，否则历史月全部视为"已过"
                      const isPast = selectedMonth < curMonth ? true : selectedMonth === curMonth ? day <= daysElapsedInCurMonth : false;
                      const isToday = selectedMonth === curMonth && day === daysElapsedInCurMonth;
                      const checked = completedDays.has(day);
                      // 三态：已打卡 / 未打卡（已过）/ 未开始（未来）
                      // ⭐ 与表格月份格子严格双向对齐：
                      //   基础字重统一 font-semibold(600) → 已打卡态升级为 font-bold(700)
                      //   line-height 统一 leading-none（消除半间距差异导致的视觉重心不对齐）
                      let cellBg = '';
                      let cellText = '';
                      let cellRing = '';
                      let cellBorder = '';
                      if (checked) {
                        cellBg = 'bg-accent-green text-white';
                        cellText = 'font-bold';
                      } else if (!isPast) {
                        cellBg = 'bg-ink-50 text-ink-300';
                        cellText = 'font-semibold';
                        cellBorder = 'border border-ink-100';
                      } else {
                        cellBg = 'bg-ink-100 text-ink-400';
                        cellText = 'font-semibold';
                      }
                      if (isToday) {
                        cellRing = checked
                          ? 'ring-2 ring-accent-green/40 ring-offset-[1px]'
                          : 'ring-2 ring-ink-300/50 ring-offset-[1px]';
                      }
                      return (
                        <div key={day}
                          title={`${selectedMonth}月${day}日 · ${h.label}${checked ? ' · 已打卡' : !isPast ? ' · 未开始' : ' · 未打卡'}`}
                          className={[
                            'aspect-square rounded-md grid place-items-center',
                            // 🔝 日历数字缩小：13→12px（精致化），但保持字重统一（semibold/bold）、line-height 统一
                            //     与表格月份格子同步缩成 12px，保证整个页面数据数字的统一感
                            'text-[12px] tabular-nums leading-none transition-colors',
                            cellBg, cellText, cellRing, cellBorder
                          ].join(' ')}>
                          {day}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- 7.5 表单 · 行动改变（承诺本）---------- */
function ChangeForm({ initial, books, onSave, onCancel, onDelete }) {
  const isEdit = !!(initial && initial.id);
  const doneBooks = (books || []).filter(b => b.st === 'done' && b.insights?.length);
  const allInsights = doneBooks.flatMap(b => (b.insights || []).map(i => ({ ...i, bookId: b.id, bookTitle: b.t })));
  const strongInsights = allInsights.filter(i => i.resonance >= 7);

  const [form, setForm] = useState({
    text: initial?.text || '',
    bookId: initial?.bookId || '',
    bookTitle: initial?.bookTitle || '',
    insightId: initial?.insightId || '',
    insightText: initial?.insightText || '',
    resonance: initial?.resonance || 5,
    startDate: initial?.startDate || new Date().toISOString().slice(0, 10),
    targetDays: initial?.targetDays || 30,
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // 选观点时自动带出书名和共鸣分
  const onInsightSelect = (insightId) => {
    const found = allInsights.find(i => i.id === insightId);
    if (found) {
      setForm(f => ({ ...f, insightId: found.id, insightText: found.text, bookId: found.bookId, bookTitle: found.bookTitle, resonance: found.resonance }));
    } else {
      setForm(f => ({ ...f, insightId: '', insightText: '', bookId: '', bookTitle: '', resonance: 5 }));
    }
  };

  const LABEL = { fontSize: 13, fontWeight: 600, color: '#1c1c1e', display: 'block', marginBottom: 4 };
  const INPUT = { width: '100%', padding: '7px 10px', borderRadius: 9, border: '1px solid rgba(15,23,42,0.08)', fontSize: 13, outline: 'none', background: '#fff' };
  const BTN_P = { padding: '8px 16px', borderRadius: 9, border: 'none', background: '#a855f7', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
  const BTN_G = { padding: '8px 16px', borderRadius: 9, border: '1px solid rgba(15,23,42,0.1)', background: 'transparent', color: '#8e8e93', fontSize: 13, fontWeight: 500, cursor: 'pointer' };
  const BTN_D = { padding: '8px 16px', borderRadius: 9, border: 'none', background: 'transparent', color: '#ef4444', fontSize: 13, fontWeight: 500, cursor: 'pointer' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* 来源观点选择 */}
      <div>
        <label style={LABEL}>来源观点（强共鸣 ≥7 分优先）</label>
        {allInsights.length === 0 ? (
          <div style={{ padding: 10, textAlign: 'center', fontSize: 12, color: '#94a3b8', background: 'rgba(248,250,252,0.6)', borderRadius: 8, border: '1px dashed rgba(148,163,184,0.3)' }}>
            书架还没有已读完+有观点的书 — 先去提取观点
          </div>
        ) : (
          <select style={INPUT} value={form.insightId} onChange={e => onInsightSelect(e.target.value)}>
            <option value="">— 选择来源观点 —</option>
            {strongInsights.map(i => (
              <option key={i.id} value={i.id}>共鸣{i.resonance} · {i.text.slice(0, 30)}…（《{i.bookTitle}》）</option>
            ))}
            {allInsights.filter(i => i.resonance < 7).map(i => (
              <option key={i.id} value={i.id}>共鸣{i.resonance} · {i.text.slice(0, 30)}…（《{i.bookTitle}》）</option>
            ))}
          </select>
        )}
      </div>
      {/* 改变描述 */}
      <div>
        <label style={LABEL}>做什么改变</label>
        <textarea style={{ ...INPUT, minHeight: 60, resize: 'none' }} value={form.text}
          onChange={e => set('text', e.target.value)}
          placeholder="例如：做决策前，先列'做这件事会失败的5个原因'并逐一检查"
          autoFocus />
      </div>
      {/* 启动日 + 目标天数 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={LABEL}>启动日</label>
          <input type="date" style={INPUT} value={form.startDate} onChange={e => set('startDate', e.target.value)} />
        </div>
        <div>
          <label style={LABEL}>目标天数</label>
          <input type="number" min="7" max="90" style={INPUT} value={form.targetDays}
            onChange={e => set('targetDays', Number(e.target.value) || 30)} />
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, paddingTop: 4 }}>
        <div>{isEdit && <button onClick={() => onDelete?.(initial.id)} style={BTN_D}>删除</button>}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onCancel} style={BTN_G}>取消</button>
          <button onClick={() => { if (!form.text.trim()) return alert('请描述你的改变'); onSave?.({ ...form, text: form.text.trim(), id: initial?.id }); }} style={BTN_P}>{isEdit ? '保存' : '添加'}</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- 7.6 表单 · 复盘卡（结果区）---------- */
function ReviewForm({ initial, onSave, onCancel, onDelete }) {
  const [form, setForm] = useState({
    beforeState: initial?.beforeState || '',
    afterState: initial?.afterState || '',
    nextStep: initial?.nextStep || '',
    tag: initial?.tag || 'habit',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const LABEL = { fontSize: 13, fontWeight: 600, color: '#1c1c1e', display: 'block', marginBottom: 4 };
  const INPUT = { width: '100%', padding: '7px 10px', borderRadius: 9, border: '1px solid rgba(15,23,42,0.08)', fontSize: 13, outline: 'none', background: '#fff', lineHeight: 1.5 };
  const BTN_P = { padding: '8px 16px', borderRadius: 9, border: 'none', background: '#22c55e', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
  const BTN_G = { padding: '8px 16px', borderRadius: 9, border: '1px solid rgba(15,23,42,0.1)', background: 'transparent', color: '#8e8e93', fontSize: 13, fontWeight: 500, cursor: 'pointer' };
  const BTN_D = { padding: '8px 16px', borderRadius: 9, border: 'none', background: 'transparent', color: '#ef4444', fontSize: 13, fontWeight: 500, cursor: 'pointer' };

  const TAGS = [
    { v: 'habit', lb: '长期习惯', color: '#22c55e' },
    { v: 'decision', lb: '一次性决策', color: '#4b63f0' },
    { v: 'sop', lb: '已固化SOP', color: '#a855f7' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {initial?.text && (
        <div style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)', fontSize: 12.5, fontWeight: 600, color: '#1c1c1e' }}>
          {initial.text}
        </div>
      )}
      <div>
        <label style={LABEL}>改变前</label>
        <textarea style={{ ...INPUT, minHeight: 50 }} value={form.beforeState}
          onChange={e => set('beforeState', e.target.value)}
          placeholder="改变前是什么状态？有什么问题？" />
      </div>
      <div>
        <label style={LABEL}>改变后</label>
        <textarea style={{ ...INPUT, minHeight: 50 }} value={form.afterState}
          onChange={e => set('afterState', e.target.value)}
          placeholder="改变后发生了什么？有什么效果？" />
      </div>
      <div>
        <label style={LABEL}>下一步</label>
        <textarea style={{ ...INPUT, minHeight: 40 }} value={form.nextStep}
          onChange={e => set('nextStep', e.target.value)}
          placeholder="如何巩固？要不要升级到团队SOP？" />
      </div>
      <div>
        <label style={LABEL}>标签</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {TAGS.map(t => (
            <button key={t.v} type="button" onClick={() => set('tag', t.v)}
              style={{
                flex: 1, padding: '7px 0', borderRadius: 9, fontSize: 12, fontWeight: 600,
                background: form.tag === t.v ? `${t.color}18` : 'rgba(120,120,128,0.08)',
                color: form.tag === t.v ? t.color : '#8e8e93',
                border: form.tag === t.v ? `1px solid ${t.color}40` : '1px solid transparent',
                cursor: 'pointer',
              }}>{t.lb}</button>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, paddingTop: 4 }}>
        <div><button onClick={() => onDelete?.(initial.id)} style={BTN_D}>删除</button></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onCancel} style={BTN_G}>取消</button>
          <button onClick={() => onSave?.({ ...form, id: initial.id })} style={BTN_P}>保存复盘</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- 8. 视图 · 知力 (OKR + 书架系统) ---------- */
function CognitionView({
  books, onBookAdd, onBookEdit, onBookMove,
  objective, onObjectiveChange,
  krs, onKrAdd, onKrEdit, onKrRemove,
  funnelHeader, setFunnelHeader,
  funnelStageLabels, setFunnelStageLabels,
  bookshelfTitle, setBookshelfTitle,
  changes, onChangeAdd, onChangeUpdate, onChangeCheckIn, onChangeComplete, onChangeRemove,
  reviews, onReviewUpdate, onReviewRemove,
  showToast,
}) {
  const [editingObj, setEditingObj] = useState(false);
  const [objDraft, setObjDraft] = useState('');
  const [editingKrId, setEditingKrId] = useState(null);
  const [krDraft, setKrDraft] = useState(null);
  const [addingKr, setAddingKr] = useState(false);
  const [newKr, setNewKr] = useState({ lb: '', tgt: 12, val: 0, u: '本', sub: '' });
  // 书架拖拽
  const [dragBookId, setDragBookId] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);
  // 承诺本 · 行动改变
  const [showChangeForm, setShowChangeForm] = useState(false);
  const [editingChange, setEditingChange] = useState(null);
  // 结果区 · 复盘卡
  const [editingReview, setEditingReview] = useState(null);

  const BLUE = '#4b63f0';
  const BLUE_LIGHT = '#eaf0ff';

  const groups = useMemo(() => {
    const dynBooks = books || BOOKS;
    return {
      reading: dynBooks.filter(b => b.st === 'reading'),
      pending: dynBooks.filter(b => b.st === 'pending'),
      done:    dynBooks.filter(b => b.st === 'done'),
    };
  }, [books]);

  // 漏斗四层数据：基于书架 insights[] + changes + reviews 计算（真子集关系）
  // ① 输入量 = 所有已读完书的 insights 总数
  // ② 思考量 = insights 中 resonance >= 7 的条数
  // ③ 行动量 = changes 数组中 status !== 'reviewed' 的条数（已启动、未完成复盘）
  // ④ 改变量 = reviews 数组长度（已完成复盘 = 真正改变了）
  const funnelData = useMemo(() => {
    const dynBooks = books || BOOKS;
    const allInsights = dynBooks.flatMap(b => b.insights || []);
    const totalInsights = allInsights.length;
    const strongResonance = allInsights.filter(i => i.resonance >= 7).length;
    const dynChanges = changes || [];
    const activeChanges = dynChanges.filter(c => c.status !== 'reviewed').length;
    const dynReviews = reviews || [];
    return {
      total: totalInsights,        // ① 输入量
      done: strongResonance,      // ② 思考量
      notes: activeChanges,        // ③ 行动量
      changes: dynReviews.length, // ④ 改变量
    };
  }, [books, changes, reviews]);

  const finalKrs = (krs || COG_KRS).map(kr => {
    // KR1（输入量）= 所有已读完书的 insights 总数
    if (kr.id === 'kr1') {
      return { ...kr, val: funnelData.total };
    }
    // KR2（思考量）= insights 中 resonance >= 7 的条数
    if (kr.id === 'kr2') {
      return { ...kr, val: funnelData.done };
    }
    // KR3（行动量）= changes 中已启动的总数
    if (kr.id === 'kr3') {
      return { ...kr, val: (changes || []).length };
    }
    return kr;
  });

  const totalPct = useMemo(() => {
    if (!finalKrs.length) return 0;
    return Math.round(finalKrs.reduce((s, kr) => s + pct(kr.val, kr.tgt), 0) / finalKrs.length);
  }, [finalKrs]);

  // 保存 O
  const commitObj = () => {
    const t = objDraft.trim();
    if (!t) { setEditingObj(false); return; }
    onObjectiveChange?.({ ...(objective || COG_O), text: t });
    setEditingObj(false);
    showToast?.('目标已更新');
  };

  // 保存 KR
  const commitKr = () => {
    if (!krDraft) { setEditingKrId(null); return; }
    onKrEdit?.(krDraft);
    setEditingKrId(null);
  };

  // 添加 KR
  const commitAddKr = () => {
    if (!newKr.lb.trim()) { setAddingKr(false); return; }
    onKrAdd?.({
      lb: newKr.lb.trim(),
      tgt: Number(newKr.tgt) || 0,
      val: Number(newKr.val) || 0,
      u: newKr.u || '',
      sub: newKr.sub || '',
    });
    setAddingKr(false);
    setNewKr({ lb: '', tgt: 12, val: 0, u: '本', sub: '' });
  };

  return (
    <div className="flex flex-col gap-3">

      {/* ===== KR + 漏斗 左右双栏布局（KR 2/3 + 漏斗 1/3），O目标合并进KR header，整体去掉独立O卡 ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">

        {/* ============== LEFT · OKR 目标 + 关键结果 (2/3 宽) ============== */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-ink-100 p-4 flex flex-col">
          {/* ===== Header 单一行化：色条 | O 文案 · KR·3 | 22% 徽章 | +新增KR —— 省掉一整行垂直空间 ===== */}
          <div className="mb-3">
            {editingObj ? (
              <div className="flex items-start gap-2.5">
                <span className="w-[5px] h-[18px] rounded-full flex-shrink-0 mt-[2px]" style={{ background: BLUE }}></span>
                <div className="flex-1 flex flex-col gap-1.5">
                  <input
                    autoFocus
                    value={objDraft}
                    onChange={(e) => setObjDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') commitObj(); if (e.key === 'Escape') setEditingObj(false); }}
                    className="w-full px-2.5 py-1.5 text-[16px] font-bold border border-ink-200 rounded-lg focus:outline-none focus:border-brand-500"
                    placeholder="输入年度目标..."
                  />
                  <div className="flex justify-end gap-1.5">
                    <button onClick={() => setEditingObj(false)} className="px-2 py-0.5 text-[11px] text-ink-500 hover:text-ink-700">取消</button>
                    <button onClick={commitObj} className="px-2 py-0.5 text-[11px] text-white rounded-md" style={{ background: BLUE }}>保存</button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2.5 min-h-[20px]">
                {/* 色条锚点 5×18 */}
                <span className="w-[5px] h-[18px] rounded-full flex-shrink-0" style={{ background: BLUE }}></span>

                {/* O 主文字（右键菜单编辑/删除恢复默认，删除铅笔图标）；
                    直接调 onObjectiveChange — O对象若有year字段保留，不丢年份信息 */}
                <InlineEdit
                  value={objective?.text || COG_O.text}
                  onChange={(v) => {
                    const t = String(v || '').trim();
                    if (!t) return;
                    onObjectiveChange?.({ ...(objective || COG_O), text: t });
                  }}
                  onDelete={() => onObjectiveChange?.({ ...(objective || COG_O), text: COG_O.text })}
                  mode="contextmenu"
                  className="flex-1 min-w-0 text-[16px] font-bold text-ink-900 leading-tight truncate"
                  inputClassName="text-[16px] font-bold text-ink-900 w-full"
                  title="右键编辑O目标"
                  placeholder="填写O目标"
                />

                {/* 完成率徽章 —— 实心蓝底白字，强视觉锚点 */}
                <div className="flex-shrink-0 px-2.5 py-1 rounded-lg whitespace-nowrap flex items-baseline gap-1"
                  style={{ background: BLUE, boxShadow: `0 2px 6px ${BLUE}40` }}>
                  <span className="text-[15px] font-extrabold tabular-nums leading-none text-white">{totalPct}</span>
                  <span className="text-[10.5px] font-bold text-white/85 leading-none">%</span>
                </div>

                {/* + 新增 KR 按钮 */}
                <button
                  onClick={() => { setAddingKr(true); setNewKr({ lb: '', tgt: 12, val: 0, u: '本', sub: '' }); }}
                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-md transition flex-shrink-0 whitespace-nowrap border"
                  style={{ borderColor: `${BLUE}33`, color: BLUE, background: BLUE_LIGHT }}>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" strokeLinecap="round"/></svg>
                  新增
                </button>
              </div>
            )}
          </div>

          {/* KR 卡片：从三列并排→单列三行垂直堆叠，适配左栏2/3全宽；内部横向布局=左（编号·标题·说明）｜右（数据·%胶囊） */}
          <div className="flex flex-col gap-2 flex-1">
            {finalKrs.map((kr, idx) => {
              const p = pct(kr.val, kr.tgt);
              const isEditing = editingKrId === kr.id;
              const padNum = String(idx + 1).padStart(2, '0');
              return (
                <div key={kr.id || idx}
                  className="rounded-xl border relative overflow-hidden transition-all"
                  style={{
                    background: isEditing ? BLUE_LIGHT : '#fff',
                    borderColor: isEditing ? `${BLUE}55` : '#f1f5f9',
                    boxShadow: isEditing ? `0 0 0 3px ${BLUE}10` : 'none',
                  }}>
                  {/* 卡内容：单列横向布局 — 左文右数，信息条形态；删除右上角铅笔（所有文字点击即可编辑） */}
                  <div className="px-2.5 py-2.5">
                    {isEditing ? (
                      <div className="flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
                        <input
                          autoFocus
                          value={krDraft?.lb || ''}
                          onChange={(e) => setKrDraft({ ...krDraft, lb: e.target.value })}
                          onClick={(e) => e.stopPropagation()}
                          className="w-full px-2 py-1 text-[12.5px] font-bold border border-ink-200 rounded-md focus:outline-none focus:border-brand-500 bg-white"
                          placeholder="KR 标题"
                        />
                        <div className="grid grid-cols-3 gap-1.5">
                          <input type="number" value={krDraft?.val || 0} onChange={(e) => setKrDraft({ ...krDraft, val: Number(e.target.value) })}
                            className="px-2 py-1 text-[12px] tabular-nums border border-ink-200 rounded-md focus:outline-none focus:border-brand-500 bg-white" placeholder="当前" />
                          <input type="number" value={krDraft?.tgt || 0} onChange={(e) => setKrDraft({ ...krDraft, tgt: Number(e.target.value) })}
                            className="px-2 py-1 text-[12px] tabular-nums border border-ink-200 rounded-md focus:outline-none focus:border-brand-500 bg-white" placeholder="目标" />
                          <input value={krDraft?.u || ''} onChange={(e) => setKrDraft({ ...krDraft, u: e.target.value })}
                            className="px-2 py-1 text-[12px] border border-ink-200 rounded-md focus:outline-none focus:border-brand-500 bg-white" placeholder="单位" />
                        </div>
                        <input value={krDraft?.sub || ''} onChange={(e) => setKrDraft({ ...krDraft, sub: e.target.value })}
                          className="px-2 py-1 text-[12px] border border-ink-200 rounded-md focus:outline-none focus:border-brand-500 bg-white" placeholder="说明（可选）" />
                        <div className="flex justify-between items-center pt-0.5">
                          <button
                            onClick={() => { if (confirm('确定删除此 KR？')) onKrRemove?.(kr.id); }}
                            className="text-[11px] text-accent-red hover:underline">删除</button>
                          <div className="flex gap-1.5">
                            <button onClick={() => setEditingKrId(null)} className="px-2 py-0.5 text-[11px] text-ink-500 hover:text-ink-700 rounded-md bg-white border border-ink-200">取消</button>
                            <button onClick={commitKr} className="px-2 py-0.5 text-[11px] text-white rounded-md" style={{ background: BLUE }}>保存</button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* 方案C（克制极简）：纯排版分层；铅笔全部删除 → 文字全部 InlineEdit 点击编辑
                         设计准则：只用【字号·字重·颜色·缩进·间距】5个变量做层级，零装饰色块
                         ┌────────────────────────────────────────────────────────────┐
                         │ 01    读完12本书                                  5  / 12 本  42% │
                         │ ↑     ↑书架系统追踪（缩进对齐标题）              ▲           ▲   │
                         │编号  标题+说明（点击即编辑）                 数值/目标/单位  %   │
                         │全部可点编辑，包括val/tgt/u/pct百分比                │
                         └────────────────────────────────────────────────────────────┘ */
                      <div className="flex items-start gap-3 px-0 py-0.5">
                        {/* L1 编号：顶部与标题对齐（items-start 已保证），固定宽 + 右对齐 tabular；
                            编号↔标题间距从 gap-1.5(6px) → gap-3(12px) — 更清爽不拥挤 */}
                        <div className="flex-shrink-0 w-[22px] pt-[1px] text-right select-none">
                          <span className="text-[11.5px] font-bold tabular-nums leading-none text-ink-300">
                            {padNum}
                          </span>
                        </div>

                        {/* L2 文案区（flex-1撑满）：标题黑·说明灰；右键菜单 编辑/删除恢复默认 */}
                        <div className="flex-1 min-w-0 flex flex-col gap-0.5 pr-2">
                          <InlineEdit
                            value={kr.lb}
                            onChange={(v) => onKrEdit?.({ ...kr, lb: v })}
                            onDelete={() => {
                              // 删除=恢复默认COG_KRS对应id的lb
                              const def = COG_KRS.find(k => k.id === kr.id)?.lb || '';
                              onKrEdit?.({ ...kr, lb: def });
                            }}
                            mode="contextmenu"
                            className="text-[13px] font-semibold text-ink-900 leading-[1.3] block truncate"
                            inputClassName="text-[13px] font-semibold text-ink-900 w-full"
                            title="右键编辑KR标题"
                            placeholder="填写KR标题"
                          />
                          {kr.sub ? (
                            <InlineEdit
                              value={kr.sub}
                              onChange={(v) => onKrEdit?.({ ...kr, sub: v })}
                              onDelete={() => {
                                const def = COG_KRS.find(k => k.id === kr.id)?.sub || '';
                                onKrEdit?.({ ...kr, sub: def });
                              }}
                              mode="contextmenu"
                              className="text-[10.5px] text-ink-400 font-medium leading-tight block truncate"
                              inputClassName="text-[11px] text-ink-500 font-medium w-full"
                              title="右键编辑KR说明"
                              placeholder="填写说明（可选）"
                            />
                          ) : (
                            <InlineEdit
                              value=""
                              onChange={(v) => onKrEdit?.({ ...kr, sub: v })}
                              mode="contextmenu"
                              className="text-[10.5px] text-ink-300 font-medium leading-tight block truncate"
                              inputClassName="text-[11px] text-ink-500 font-medium w-full"
                              title="右键添加KR说明"
                              placeholder="+ 添加说明"
                            />
                          )}
                        </div>

                        {/* L3 数据区（右对齐）：val / tgt / u / pct% — 右键菜单 编辑/删除
                           - 当前值/目标/单位/百分比均可改：改数字=更新kr.val/kr.tgt/kr.u，改%无实际意义但交互统一
                           - 保持 items-baseline 数字底线对齐 + gap压缩 */}
                        <div className="flex-shrink-0 flex items-center gap-4 tabular-nums items-baseline">
                          {/* 进度组：当前值 + 参照（/目标单位） */}
                          <div className="flex items-baseline gap-1 whitespace-nowrap">
                            <InlineEdit
                              value={String(kr.val)}
                              onChange={(v) => onKrEdit?.({ ...kr, val: Math.max(0, Number(v) || 0) })}
                              onDelete={() => {
                                // KR1 删除当前值时，直接触发书架联动刷新（设0后finalKrs又会用groups.done.length覆盖）
                                const def = COG_KRS.find(k => k.id === kr.id)?.val ?? 0;
                                onKrEdit?.({ ...kr, val: def });
                              }}
                              mode="contextmenu"
                              className="text-[16px] font-extrabold leading-none"
                              inputClassName="text-[16px] font-extrabold tabular-nums w-12 text-right px-1 py-0"
                              style={{ color: BLUE }}
                              title="右键编辑当前值"
                            />
                            <span className="text-[11px] font-light leading-none text-ink-300 select-none">/</span>
                            <InlineEdit
                              value={String(kr.tgt)}
                              onChange={(v) => onKrEdit?.({ ...kr, tgt: Math.max(1, Number(v) || 1) })}
                              onDelete={() => {
                                const def = COG_KRS.find(k => k.id === kr.id)?.tgt ?? 1;
                                onKrEdit?.({ ...kr, tgt: def });
                              }}
                              mode="contextmenu"
                              className="text-[12px] font-medium leading-none text-ink-500"
                              inputClassName="text-[12px] font-medium tabular-nums w-10 text-right px-1 py-0"
                              title="右键编辑目标值"
                            />
                            <InlineEdit
                              value={kr.u}
                              onChange={(v) => onKrEdit?.({ ...kr, u: v })}
                              onDelete={() => {
                                const def = COG_KRS.find(k => k.id === kr.id)?.u || '';
                                onKrEdit?.({ ...kr, u: def });
                              }}
                              mode="contextmenu"
                              className="text-[10.5px] font-medium leading-none text-ink-400 ml-0.5"
                              inputClassName="text-[10.5px] font-medium w-10 px-1 py-0"
                              title="右键编辑单位"
                              placeholder="本/条/天"
                            />
                          </div>
                          {/* 完成率：蓝色强强调；右键编辑（用户可直接改%数字，自动同步val） */}
                          <InlineEdit
                            value={`${p}%`}
                            onChange={(v) => {
                              const num = String(v).replace(/[^0-9]/g, '');
                              const newPct = Math.max(0, Math.min(100, Number(num) || 0));
                              const newVal = Math.round((newPct / 100) * Number(kr.tgt || 1));
                              onKrEdit?.({ ...kr, val: newVal });
                            }}
                            mode="contextmenu"
                            className="w-[44px] block text-right text-[13px] font-extrabold leading-none"
                            inputClassName="text-[13px] font-extrabold tabular-nums w-[44px] text-right px-1 py-0 border-brand-300"
                            style={{ color: BLUE }}
                            title="右键编辑完成率（自动同步当前值）"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ============== RIGHT · OKR 转化漏斗 (1/3 窄列) ============== */}
        <div className="bg-white rounded-2xl border border-ink-100 p-4 flex flex-col">
          {/* Header 顶部对齐（和左卡片header y一致 — min-h统一20px、色条统一5×18、标题14.5px Bold）
              标题与右侧备注文字：右键菜单 → 编辑/删除恢复默认 */}
          <div className="flex items-center gap-2.5 mb-3 min-h-[20px]">
            <span className="w-[5px] h-[18px] rounded-full flex-shrink-0" style={{ background: BLUE }}></span>
            <div className="flex items-baseline gap-1.5 min-w-0">
              <InlineEdit
                value={funnelHeader.title}
                onChange={(v) => setFunnelHeader(p => ({ ...p, title: v }))}
                onDelete={() => setFunnelHeader(p => ({ ...p, title: '转化漏斗' }))}
                mode="contextmenu"
                className="text-[14.5px] font-bold text-ink-900 leading-none whitespace-nowrap"
                inputClassName="text-[14.5px] font-bold text-ink-900 w-24"
                title="右键编辑标题"
              />
              <InlineEdit
                value={funnelHeader.sub}
                onChange={(v) => setFunnelHeader(p => ({ ...p, sub: v }))}
                onDelete={() => setFunnelHeader(p => ({ ...p, sub: '输入→思考→行动→改变' }))}
                mode="contextmenu"
                className="text-[10px] text-ink-400 whitespace-nowrap"
                inputClassName="text-[10px] font-medium text-ink-500 w-28"
                title="右键编辑说明"
              />
            </div>
          </div>
          <div className="flex-1 flex flex-col justify-center">
            <ReadingFunnel
              total={funnelData.total}
              done={funnelData.done}
              notes={funnelData.notes}
              changes={funnelData.changes}
              color={BLUE}
              embedded
              stageLabels={funnelStageLabels}
              onStageLabelsChange={setFunnelStageLabels}
            />
          </div>
        </div>

      </div>
      {/* ===== 左右双栏布局 END ===== */}

      {/* 添加 KR 弹窗 */}
      {addingKr && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setAddingKr(false)}>
          <div className="bg-white rounded-2xl p-5 w-[420px] max-w-[90vw] shadow-cardL" onClick={(e) => e.stopPropagation()}>
            <div className="text-[15px] font-bold text-ink-900 mb-3">新增 KR</div>
            <div className="flex flex-col gap-2.5">
              <input value={newKr.lb} onChange={(e) => setNewKr({ ...newKr, lb: e.target.value })}
                placeholder="KR 描述，如：读完12本书"
                className="px-3 py-2 text-[13px] border border-ink-200 rounded-lg focus:outline-none focus:border-brand-500" />
              <div className="grid grid-cols-3 gap-2">
                <input type="number" value={newKr.val} onChange={(e) => setNewKr({ ...newKr, val: Number(e.target.value) })}
                  placeholder="当前值" className="px-3 py-2 text-[13px] border border-ink-200 rounded-lg focus:outline-none focus:border-brand-500" />
                <input type="number" value={newKr.tgt} onChange={(e) => setNewKr({ ...newKr, tgt: Number(e.target.value) })}
                  placeholder="目标值" className="px-3 py-2 text-[13px] border border-ink-200 rounded-lg focus:outline-none focus:border-brand-500" />
                <input value={newKr.u} onChange={(e) => setNewKr({ ...newKr, u: e.target.value })}
                  placeholder="单位" className="px-3 py-2 text-[13px] border border-ink-200 rounded-lg focus:outline-none focus:border-brand-500" />
              </div>
              <input value={newKr.sub} onChange={(e) => setNewKr({ ...newKr, sub: e.target.value })}
                placeholder="说明（可选）如：书架系统追踪"
                className="px-3 py-2 text-[13px] border border-ink-200 rounded-lg focus:outline-none focus:border-brand-500" />
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setAddingKr(false)} className="px-4 py-1.5 text-[13px] text-ink-500 hover:text-ink-700">取消</button>
              <button onClick={commitAddKr} className="px-4 py-1.5 text-[13px] text-white rounded-lg" style={{ background: BLUE }}>添加</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== 书架看板 - 3列 ===== */}
      <div className="bg-white rounded-2xl border border-ink-100 p-4">
        <div className="flex items-center justify-between mb-3.5">
          <div className="flex items-center gap-3">
            <span className="w-[5px] h-[18px] rounded-full flex-shrink-0" style={{ background: BLUE }}></span>
            <InlineEdit
              value={bookshelfTitle}
              onChange={(v) => setBookshelfTitle?.(String(v || '').trim())}
              onDelete={() => setBookshelfTitle?.('')}
              mode="contextmenu"
              placeholder={`${objective?.year || COG_O.year}年 · 书架`}
              className="text-[16px] font-bold text-ink-900 leading-tight"
              inputClassName="text-[16px] font-bold text-ink-900 w-40"
              title="右键编辑书架标题"
            />
            <span className="text-[11px] text-ink-400 tabular-nums">共 {groups.reading.length + groups.pending.length + groups.done.length} 本</span>
          </div>
          <button onClick={() => onBookAdd?.()}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] font-semibold rounded-lg transition"
            style={{ background: BLUE_LIGHT, color: BLUE }}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" strokeLinecap="round"/></svg>
            添加书籍
          </button>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { key: 'reading', lb: '阅读中', col: BLUE,      dot: BLUE_LIGHT,      books: groups.reading },
            { key: 'pending', lb: '未开始', col: '#64748b',   dot: '#f8fafc',       books: groups.pending },
            { key: 'done',    lb: '已读完', col: '#22c55e',   dot: '#f0fdf4',       books: groups.done },
          ].map(g => {
            const isDragOver = dragOverCol === g.key && dragBookId && (() => {
              // 拖拽中的书是否不本来就在这栏
              const cur = (books || BOOKS).find(x => x.id === dragBookId);
              return cur && cur.st !== g.key;
            })();
            return (
            <div key={g.key}
              className="rounded-xl p-3 flex flex-col transition-all duration-200"
              style={{
                background: g.dot,
                border: isDragOver
                  ? `2px dashed ${g.col}`
                  : `1px solid ${g.col}18`,
                padding: isDragOver ? 'calc(12px - 1px)' : undefined, // 补偿 border+1 不撑大
                boxShadow: isDragOver ? `0 0 0 4px ${g.col}12` : undefined,
              }}
              onDragOver={(e) => {
                e.preventDefault(); // 允许drop
                const cur = (books || BOOKS).find(x => x.id === dragBookId);
                if (cur && cur.st !== g.key) setDragOverCol(g.key);
              }}
              onDragLeave={() => { if (dragOverCol === g.key) setDragOverCol(null); }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragBookId) {
                  const cur = (books || BOOKS).find(x => x.id === dragBookId);
                  if (cur && cur.st !== g.key) onBookMove?.(dragBookId, g.key);
                }
                setDragBookId(null);
                setDragOverCol(null);
              }}
            >
              <div className="flex items-center justify-between mb-2.5 px-1">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full shadow-sm" style={{ background: g.col, boxShadow: `0 0 0 3px ${g.col}22` }}></span>
                  <span className="text-[13px] font-bold" style={{ color: g.col }}>{g.lb}</span>
                  <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full text-[10px] font-extrabold tabular-nums"
                    style={{ background: '#fff', color: g.col, boxShadow: `0 1px 2px rgba(0,0,0,0.06)` }}>
                    {g.books.length}
                  </span>
                </div>
              </div>
              <div className="flex flex-col gap-1.5 flex-1 min-h-[80px]">
                {g.books.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center py-6 text-[12px] transition-all rounded-lg"
                    style={{
                      color: isDragOver ? g.col : '#a3a3a3',
                      border: isDragOver ? `1.5px dashed ${g.col}90` : '1px dashed rgba(15,23,42,0.10)',
                      background: isDragOver ? `${g.col}10` : 'transparent',
                      fontWeight: isDragOver ? 700 : 500,
                    }}>
                    {isDragOver ? '松手放到这里' : '暂无书籍'}
                  </div>
                ) : (
                  g.books.map((b) => {
                    const isDragging = dragBookId === b.id;
                    return (
                      <div
                        key={b.id}
                        draggable
                        onDragStart={(e) => {
                          try { e.dataTransfer.setData('text/plain', String(b.id)); } catch {}
                          e.dataTransfer.effectAllowed = 'move';
                          setDragBookId(b.id);
                        }}
                        onDragEnd={() => { setDragBookId(null); setDragOverCol(null); }}
                        className={`rounded-lg bg-white transition-all relative select-none ${isDragging ? 'opacity-40 scale-[0.98]' : 'hover:shadow-md'}`}
                        style={{
                          cursor: isDragging ? 'grabbing' : 'grab',
                          boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
                          border: `1px solid ${g.col}20`,
                        }}>
                        {/* 主行：点击 → 打开编辑弹窗 */}
                        <div
                          onClick={() => onBookEdit?.(b)}
                          className="px-2.5 py-2 flex items-center justify-between gap-2"
                          style={{ cursor: 'pointer' }}>
                          <div className="flex items-center gap-2 min-w-0">
                            {/* 拖拽把手：暗示可拖 */}
                            <span className="text-[9px] leading-none text-ink-200 group-hover:text-ink-400 transition flex-shrink-0"
                              title="按住拖到其他栏目"
                              style={{ letterSpacing: '-0.5px', paddingRight: '2px' }}>
                              ⋮⋮
                            </span>
                            <span className="text-[13px] w-5 text-center flex-shrink-0">📖</span>
                            <div className="min-w-0">
                              <div className={`text-[12.5px] font-semibold truncate ${g.key === 'done' ? 'text-ink-500 line-through' : 'text-ink-900'}`}>
                                {b.t}
                              </div>
                              {b.cat && <div className="text-[10.5px] text-ink-500 truncate leading-tight mt-0.5">{b.cat}</div>}
                              {/* 已读完且有观点 → 显示观点/共鸣小标签 */}
                              {b.insights?.length > 0 && (
                                <div className="flex items-center gap-1.5 mt-1">
                                  <span className="text-[9.5px] font-semibold px-1.5 py-px rounded" style={{ background: 'rgba(75,99,240,0.08)', color: '#4b63f0' }}>
                                    {b.insights.length} 观点
                                  </span>
                                  {b.insights.filter(i => i.resonance >= 7).length > 0 && (
                                    <span className="text-[9.5px] font-semibold px-1.5 py-px rounded" style={{ background: 'rgba(245,158,11,0.08)', color: '#f59e0b' }}>
                                      {b.insights.filter(i => i.resonance >= 7).length} 共鸣
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                          <span className="text-[12px] font-extrabold tabular-nums flex-shrink-0" style={{ color: g.col }}>
                            {b.pct}%
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );})}
        </div>
      </div>

      {/* ===== 承诺本 · 行动改变 + 结果区 · 改变证明（左右双栏）===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4 pt-4 border-t border-ink-100">
        {/* ========== 承诺本 · 行动改变 ========== */}
        <div className="flex flex-col">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-[4px] h-[18px] rounded-full" style={{ background: '#a855f7' }} />
            <h3 className="text-[16px] font-bold text-ink-900">承诺本</h3>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(168,85,247,0.08)', color: '#a855f7' }}>
              {(changes || []).filter(c => c.status !== 'reviewed').length} 进行中
            </span>
            <button onClick={() => setShowChangeForm(true)}
              className="ml-auto text-[11px] font-semibold text-white px-2.5 py-1 rounded-md"
              style={{ background: '#a855f7' }}>
              + 新增改变
            </button>
          </div>

          {(changes || []).length === 0 ? (
            <div className="text-center py-8 text-[12px] text-ink-400" style={{ background: 'rgba(168,85,247,0.03)', borderRadius: 12, border: '1px dashed rgba(168,85,247,0.2)' }}>
              还没有行动改变 — 从强共鸣观点生成你的第一条改变
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {(changes || []).map(c => {
                const days = c.checkIns?.length || 0;
                const pctVal = Math.min(100, Math.round((days / (c.targetDays || 30)) * 100));
                const today = new Date().toISOString().slice(0, 10);
                const checkedToday = c.checkIns?.includes(today);
                const isCompleted = c.status === 'completed';
                const isReviewed = c.status === 'reviewed';
                // 进度条颜色：0-7橙红 / 8-21蓝 / 22-30紫 / ≥30绿
                const barColor = days >= 30 ? '#22c55e' : days >= 22 ? '#a855f7' : days >= 8 ? '#4b63f0' : '#f97316';
                return (
                  <div key={c.id}
                    className="rounded-xl p-3 transition-all"
                    style={{
                      background: isReviewed ? 'rgba(34,197,94,0.04)' : 'rgba(168,85,247,0.03)',
                      border: `1px solid ${isReviewed ? 'rgba(34,197,94,0.2)' : 'rgba(168,85,247,0.15)'}`,
                    }}>
                    {/* 来源追溯 */}
                    {c.insightText && (
                      <div className="flex items-center gap-1 text-[10px] text-ink-400 mb-1.5">
                        <span>💫</span>
                        <span className="truncate">"{c.insightText}"</span>
                        {c.bookTitle && <span className="flex-shrink-0">— 《{c.bookTitle}》</span>}
                      </div>
                    )}
                    {/* 改变描述 */}
                    <div className="text-[12.5px] font-semibold text-ink-900 leading-snug mb-2">{c.text}</div>
                    {/* 进度 */}
                    <div className="flex items-center gap-2 mb-2">
                      <div className="flex-1 h-1.5 rounded-full bg-ink-100 overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pctVal}%`, background: barColor }} />
                      </div>
                      <span className="text-[10px] font-bold tabular-nums flex-shrink-0" style={{ color: barColor }}>
                        {days}/{c.targetDays || 30}天
                      </span>
                    </div>
                    {/* 操作按钮 */}
                    {!isReviewed && (
                      <div className="flex items-center gap-2">
                        {isCompleted ? (
                          <button onClick={() => onChangeComplete?.(c.id)}
                            className="text-[10px] font-bold text-white px-3 py-1 rounded-md"
                            style={{ background: '#22c55e' }}>
                            ✓ 完成复盘
                          </button>
                        ) : (
                          <button onClick={() => onChangeCheckIn?.(c.id)}
                            disabled={checkedToday}
                            className="text-[10px] font-bold px-3 py-1 rounded-md transition-all"
                            style={{
                              background: checkedToday ? 'rgba(148,163,184,0.1)' : '#a855f7',
                              color: checkedToday ? '#94a3b8' : '#fff',
                              cursor: checkedToday ? 'default' : 'pointer',
                            }}>
                            {checkedToday ? '今日已打卡' : '今天打卡'}
                          </button>
                        )}
                        <span className="text-[9px] text-ink-400">启动日 {c.startDate}</span>
                        <button onClick={() => setEditingChange(c)}
                          className="ml-auto text-[10px] text-ink-400 hover:text-ink-700">编辑</button>
                        <button onClick={() => onChangeRemove?.(c.id)}
                          className="text-[10px] text-ink-300 hover:text-red-500">删除</button>
                      </div>
                    )}
                    {isReviewed && (
                      <div className="text-[10px] font-semibold flex items-center gap-1" style={{ color: '#22c55e' }}>
                        <span>✓</span> 已完成复盘，移至结果区
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ========== 结果区 · 改变证明 ========== */}
        <div className="flex flex-col">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-[4px] h-[18px] rounded-full" style={{ background: '#22c55e' }} />
            <h3 className="text-[16px] font-bold text-ink-900">结果区 · 改变证明</h3>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(34,197,94,0.08)', color: '#22c55e' }}>
              {(reviews || []).length} 条真实改变
            </span>
          </div>

          {(reviews || []).length === 0 ? (
            <div className="text-center py-8 text-[12px] text-ink-400" style={{ background: 'rgba(34,197,94,0.03)', borderRadius: 12, border: '1px dashed rgba(34,197,94,0.2)' }}>
              坚持打卡30天 → 自动生成复盘卡<br/>年底回看这里，就是你今年的真实改变
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {(reviews || []).map(r => {
                const tagMeta = {
                  habit: { lb: '长期习惯', color: '#22c55e' },
                  decision: { lb: '一次性决策', color: '#4b63f0' },
                  sop: { lb: '已固化SOP', color: '#a855f7' },
                };
                const tm = tagMeta[r.tag] || tagMeta.habit;
                return (
                  <div key={r.id}
                    className="rounded-xl p-3"
                    style={{ background: 'rgba(34,197,94,0.03)', border: '1px solid rgba(34,197,94,0.15)' }}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white" style={{ background: '#22c55e' }}>
                          坚持 {r.daysCompleted} 天
                        </span>
                        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded" style={{ background: `${tm.color}15`, color: tm.color }}>
                          {tm.lb}
                        </span>
                      </div>
                      <button onClick={() => setEditingReview(r)} className="text-[10px] text-ink-400 hover:text-ink-700">编辑</button>
                    </div>
                    {/* 改变描述 */}
                    <div className="text-[12.5px] font-semibold text-ink-900 leading-snug mb-2">{r.text}</div>
                    {/* 来源 */}
                    {r.insightText && (
                      <div className="text-[10px] text-ink-400 mb-2 truncate">来源："{r.insightText}" — 《{r.bookTitle}》</div>
                    )}
                    {/* 前后对比 */}
                    {(r.beforeState || r.afterState) && (
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <div className="p-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.1)' }}>
                          <div className="text-[9px] font-bold text-ink-400 mb-0.5">改变前</div>
                          <div className="text-[11px] text-ink-700 leading-snug">{r.beforeState || '—'}</div>
                        </div>
                        <div className="p-2 rounded-lg" style={{ background: 'rgba(34,197,94,0.04)', border: '1px solid rgba(34,197,94,0.1)' }}>
                          <div className="text-[9px] font-bold mb-0.5" style={{ color: '#22c55e' }}>改变后</div>
                          <div className="text-[11px] text-ink-700 leading-snug">{r.afterState || '—'}</div>
                        </div>
                      </div>
                    )}
                    {/* 下一步 */}
                    {r.nextStep && (
                      <div className="text-[10px] text-ink-500 mt-1">
                        <span className="font-semibold" style={{ color: tm.color }}>下一步：</span>{r.nextStep}
                      </div>
                    )}
                    {/* 空状态引导填写 */}
                    {!r.beforeState && !r.afterState && !r.nextStep && (
                      <button onClick={() => setEditingReview(r)}
                        className="text-[10px] font-semibold mt-1" style={{ color: '#22c55e' }}>
                        → 填写改变前后的对比
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 行动改变新增/编辑弹窗 */}
      {showChangeForm && (
        <Modal open onClose={() => { setShowChangeForm(false); setEditingChange(null); }} title={editingChange ? '编辑行动改变' : '新增行动改变'}>
          <ChangeForm
            initial={editingChange}
            books={books || BOOKS}
            onSave={(data) => {
              if (editingChange) onChangeUpdate?.(data);
              else onChangeAdd?.(data);
              setShowChangeForm(false);
              setEditingChange(null);
            }}
            onCancel={() => { setShowChangeForm(false); setEditingChange(null); }}
            onDelete={editingChange ? () => { onChangeRemove?.(editingChange.id); setShowChangeForm(false); setEditingChange(null); } : undefined}
          />
        </Modal>
      )}

      {/* 复盘卡编辑弹窗 */}
      {editingReview && (
        <Modal open onClose={() => setEditingReview(null)} title="编辑复盘卡">
          <ReviewForm
            initial={editingReview}
            onSave={(data) => { onReviewUpdate?.(data); setEditingReview(null); }}
            onCancel={() => setEditingReview(null)}
            onDelete={() => { onReviewRemove?.(editingReview.id); setEditingReview(null); }}
          />
        </Modal>
      )}
    </div>
  );
}

/* ---------- 9. 视图 · 能力 ---------- */
function AbilityView({ abilities, onMsAdd, onMsEdit, scoreHistory, onSetScore }) {
  const dynAb = abilities || ABILITY;
  const [editingScoreIdx, setEditingScoreIdx] = useState(null);
  const scoreColor = (s) => {
    const n = Number(s) || 0;
    if (n >= 9) return '#22c55e';
    if (n >= 6) return '#f59e0b';
    return '#ef4444';
  };
  // 生成本年 1-12 月的自评历史数据
  const getHistorySeries = (ab) => {
    const abId = ab.id || ab.title;
    const hist = scoreHistory?.[abId] || {};
    const curScore = Number(ab.score) || 0;
    const curYM = new Date().toISOString().slice(0,7);
    const year = new Date().getFullYear();
    const series = [];
    const months = [];
    for (let m = 1; m <= 12; m++) {
      const ym = `${year}-${String(m).padStart(2,'0')}`;
      months.push(ym);
      const v = hist[ym];
      if (v !== undefined && v !== null) series.push(Number(v));
      else if (ym <= curYM) series.push(curScore); // 当前月前用现有分回补
      else break;
    }
    return series;
  };

  const abPct = useMemo(() => {
    const total = dynAb.reduce((s, a) => {
      const msAvg = a.mstones.length > 0 ? a.mstones.reduce((t, m) => t + m.pct, 0) / a.mstones.length : 0;
      return s + msAvg;
    }, 0);
    return Math.round(total / dynAb.length);
  }, [dynAb]);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3 annual-ability-grid">
        {dynAb.map((a, ai) => {
          const mDone = a.mstones.filter(m => m.st === 'done').length;
          const mTotal = a.mstones.length;
          const mPct = Math.round(a.mstones.reduce((s, m) => s + m.pct, 0) / Math.max(1, mTotal));
          const sc = scoreColor(a.score);
          const series = getHistorySeries(a);
          const lastScore = series[series.length - 1];
          const firstScore = series[0];
          const trendDelta = series.length >= 2 && firstScore !== undefined
            ? Math.round(((lastScore - firstScore) / Math.max(1, firstScore)) * 100) : null;
          return (
            <div key={a.title} className="glass-card p-4 flex flex-col gap-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-bold text-ink-900 leading-tight mb-1">{a.title}</h3>
                  <div className="text-xs text-ink-500 leading-snug">
                    <span className="font-semibold text-ink-700">每日：</span>{a.daily}
                  </div>
                </div>
                {/* 自评 - 点击可编辑 */}
                {editingScoreIdx === ai ? (
                  <div className="flex flex-col items-end flex-shrink-0 gap-1">
                    <div className="flex items-center gap-1">
                      <input type="range" min="0" max="10" step="1" defaultValue={a.score}
                        style={{accentColor: sc, width:'72px'}}
                        onDoubleClick={e => e.target.blur()}
                        onChange={e => {
                          const n = Number(e.target.value);
                          if (document.getElementById('ab-score-'+ai)) document.getElementById('ab-score-'+ai).textContent = n;
                        }}
                        onMouseUp={e => {
                          const n = Number(e.target.value);
                          onSetScore?.(ai, n);
                          setEditingScoreIdx(null);
                        }}
                      />
                    </div>
                    <span id={'ab-score-'+ai} className="text-[11px] font-semibold" style={{color:sc}}>拖动·当前 {a.score}</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-end flex-shrink-0 cursor-pointer hover:opacity-80 transition"
                    title="点击调整自评分数" onClick={() => setEditingScoreIdx(ai)}>
                    <div className="flex items-baseline gap-0.5">
                      <span className="text-xl font-bold tabular-nums leading-none" style={{color: sc}}>{a.score}</span>
                      <span className="text-xs" style={{color: sc, opacity:.7}}>/10</span>
                    </div>
                    <span className="text-xs font-semibold mt-0.5" style={{color: sc, opacity:.9}}>
                      {Number(a.score) >= 9 ? '优秀' : Number(a.score) >= 6 ? '进行中' : '待启动'}
                    </span>
                  </div>
                )}
              </div>
              {/* 自评历史 Sparkline */}
              <div className="rounded-xl bg-surface-soft px-3 py-2 flex items-center justify-between gap-3">
                <div className="flex flex-col flex-1 min-w-0">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-ink-400 mb-1">自评趋势</div>
                  {series.length >= 2 && (
                    <div className="flex items-center gap-2">
                      <Sparkline data={series} color={sc} width={140} height={30} />
                      {trendDelta !== null && (
                        <span className={`text-xs font-bold tabular-nums ${trendDelta >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                          {trendDelta >= 0 ? '↑' : '↓'}{Math.abs(trendDelta)}%
                        </span>
                      )}
                    </div>
                  )}
                  {series.length < 2 && (
                    <div className="text-[11px] text-ink-400 italic">数据积累中，每月初更新一次自评</div>
                  )}
                </div>
              </div>
              {/* 总进度条 */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-semibold text-ink-500">整体进度</span>
                  <span className="font-bold tabular-nums" style={{color:'#f59e0b'}}>{mPct}% · {mDone}/{mTotal}</span>
                </div>
                <ProgressBar value={mPct} color="#f59e0b" />
              </div>
              {/* 里程碑列表 */}
              <div className="flex flex-col gap-1.5">
                <div className="text-xs font-bold uppercase tracking-wide text-ink-500 px-0.5">里程碑</div>
                {a.mstones.map((m, i) => {
                  const sm = statusMeta(m.st);
                  const msCol = m.st === 'done' ? '#22c55e' : m.st === 'doing' ? '#f59e0b' : '#8e8e93';
                  return (
                    <div key={i} onClick={() => onMsEdit?.(ai, i, m)} className="p-2.5 rounded-xl border border-ink-100 flex items-center gap-3 hover:bg-surface-soft transition cursor-pointer">
                      <div className="w-6 h-6 rounded-lg grid place-items-center text-[11px] font-bold tabular-nums flex-shrink-0 text-ink-700">{i + 1}</div>
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-semibold leading-tight ${m.st === 'done' ? 'text-ink-500 line-through' : 'text-ink-900'}`}>{m.lb}</div>
                        <div className="mt-1"><ProgressBar value={m.pct} color={msCol} variant="dense" /></div>
                      </div>
                      <span className="text-[11px] font-bold tabular-nums flex-shrink-0" style={{color: msCol}}>{sm.lb} · {m.pct}%</span>
                    </div>
                  );
                })}
                <AddButton label="添加里程碑" onClick={() => onMsAdd?.(ai)} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- 10. 视图 · 工作 (OKR) ---------- */
function WorkView({ workGoals, onKrAdd, onKrEdit }) {
  const dynWk = workGoals || WORK;
  const main = dynWk[0];
  const side = dynWk[1];
  const calcPct = (o) => Math.round(o.krs.reduce((s, k) => s + pct(k.v, k.tgt), 0) / Math.max(1, o.krs.length));

  // 截止日期 → { days, timePct }
  const daysAndTimePct = (deadlineStr, startStr) => {
    try {
      const today = new Date(); today.setHours(0,0,0,0);
      const year = today.getFullYear();
      const parseMD = (s) => {
        const [mm, dd] = s.replace(/月|日/g, '.').split('.').filter(Boolean).map(Number);
        let t = new Date(year, mm - 1, dd);
        if (t < today - 86400000 * 180) t = new Date(year + 1, mm - 1, dd);
        return t;
      };
      const target = parseMD(deadlineStr);
      const start = startStr ? parseMD(startStr) : new Date(year, 0, 1);
      const total = Math.max(1, target - start);
      const elapsed = Math.max(0, Math.min(total, today - start));
      const dl = Math.ceil((target - today) / 86400000);
      return { days: dl, timePct: Math.round((elapsed / total) * 100) };
    } catch { return { days: 999, timePct: 50 }; }
  };
  // KR 4 象限分类
  const risk4Quadrant = (kr, goalDeadline, goalStart) => {
    const { timePct, days } = daysAndTimePct(goalDeadline, goalStart);
    const kPct = pct(kr.v, kr.tgt);
    const diff = kPct - timePct;
    let q, label, color;
    if (kr.st === 'done' || kPct >= 100) { q = 'done'; label = '已完成'; color = '#22c55e'; }
    else if (diff <= -20) { q = 'risk'; label = '严重落后'; color = '#ef4444'; }
    else if (diff <= -5) { q = 'warn'; label = '略落后'; color = '#f59e0b'; }
    else if (diff >= 20) { q = 'ahead'; label = '超额'; color = '#10b981'; }
    else { q = 'normal'; label = '正常'; color = '#3b82f6'; }
    return { q, label, color, diff, kPct, timePct, daysLeft: days };
  };

  const totalPct = useMemo(() => {
    if (!main) return 0;
    const allKrs = [...(main?.krs || []), ...(side?.krs || [])];
    return allKrs.length ? Math.round(allKrs.reduce((s, k) => s + pct(k.v, k.tgt), 0) / allKrs.length) : 0;
  }, [main, side]);

  const Risk4QuadSummary = ({ krs, goalDeadline, goalStart }) => {
    if (!krs || krs.length === 0) return null;
    const stats = { risk: 0, warn: 0, normal: 0, ahead: 0, done: 0 };
    krs.forEach(kr => { stats[risk4Quadrant(kr, goalDeadline, goalStart).q]++; });
    const total = krs.length;
    const items = [
      { k: 'risk',  lb: '高风险', col: '#ef4444', n: stats.risk },
      { k: 'warn',  lb: '需关注', col: '#f59e0b', n: stats.warn },
      { k: 'normal',lb: '正常',   col: '#3b82f6', n: stats.normal },
      { k: 'ahead', lb: '超额',   col: '#10b981', n: stats.ahead },
      { k: 'done',  lb: '已完成', col: '#22c55e', n: stats.done },
    ].filter(i => i.n > 0);
    return (
      <div className="rounded-xl bg-surface-soft p-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          {items.map(it => (
            <div key={it.k} className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/70 border border-ink-100">
              <div className="w-2 h-2 rounded-full" style={{background: it.col}} />
              <span className="text-[11px] font-semibold text-ink-600">{it.lb}</span>
              <span className="text-[11px] font-bold tabular-nums" style={{color: it.col}}>{it.n}/{total}</span>
            </div>
          ))}
        </div>
        <svg width="100" height="60" viewBox="0 0 100 60" className="flex-shrink-0">
          <line x1="5" y1="55" x2="95" y2="5" stroke="#e5e7eb" strokeWidth="1" strokeDasharray="3,2" />
          <polygon points="5,55 95,25 95,55" fill="#fef2f2" opacity="0.7" />
          <polygon points="5,35 95,5 5,5" fill="#f0fdf4" opacity="0.6" />
          {krs.map((kr, i) => {
            const { kPct, timePct, color } = risk4Quadrant(kr, goalDeadline, goalStart);
            const x = 5 + (timePct / 100) * 90;
            const y = 55 - (kPct / 100) * 50;
            return <circle key={i} cx={x} cy={y} r="2.5" fill={color} opacity="0.9" />;
          })}
          <text x="2" y="59" fontSize="8" fill="#9ca3af">时间→</text>
          <text x="0" y="10" fontSize="8" fill="#9ca3af" transform="rotate(-90 6 35)">完成</text>
        </svg>
      </div>
    );
  };

  const panelHtml = (o, label, color) => {
    const p = calcPct(o);
    const { days: dl } = daysAndTimePct(o.deadline, o.start);
    const urgent = dl <= 30;
    const overdue = dl < 0;
    return (
      <div key={label} className="glass-card flex flex-col p-4 gap-3.5">
        <div>
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-[0.08em]" style={{color}}>{label}</span>
            {overdue ? (
              <span className="text-[11px] font-bold text-accent-red">已过期</span>
            ) : urgent ? (
              <span className="text-[11px] font-bold text-accent-red">剩余 {dl} 天</span>
            ) : (
              <span className="text-[11px] font-semibold text-ink-500">剩余 {dl} 天</span>
            )}
            <div className="ml-auto flex items-baseline gap-0.5">
              <span className="text-xl font-bold tabular-nums text-ink-900 leading-none">{p}</span>
              <span className="text-xs font-bold text-ink-500">%</span>
            </div>
          </div>
          <h3 className="text-base font-bold text-ink-900 leading-snug">{o.title}</h3>
        </div>
        <ProgressBar value={p} color={color} />
        <Risk4QuadSummary krs={o.krs} goalDeadline={o.deadline} goalStart={o.start} />
        <div className="flex flex-col gap-1.5">
          {o.krs.map((kr, i) => {
            const st = kr.st === 'done' ? 'done' : kr.st === 'doing' ? 'doing' : 'tg';
            const p2 = pct(kr.v, kr.tgt);
            const statusDot = st === 'done' ? '#22c55e' : st === 'doing' ? '#4b63f0' : '#c7c7cc';
            const risk = risk4Quadrant(kr, o.deadline, o.start);
            return (
              <div key={i} onClick={() => onKrEdit?.(o._workIdx, i, kr)} className="grid grid-cols-[28px_1fr_auto] items-center gap-3 py-2 px-1 rounded-xl hover:bg-surface-soft transition-colors cursor-pointer">
                <div className="text-[11px] font-bold tabular-nums text-ink-500 text-center flex-shrink-0">{i + 1}</div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <div className={`text-sm font-semibold leading-tight min-w-0 flex-1 truncate ${st === 'done' ? 'text-ink-500 line-through' : 'text-ink-900'}`}>
                      {kr.t}
                    </div>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0"
                      style={{background: risk.color + '1a', color: risk.color, whiteSpace: 'nowrap'}}>
                      {risk.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 min-w-0"><ProgressBar value={p2} color={statusDot} variant="dense" /></div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                  <span className="text-xs font-bold tabular-nums text-ink-700 whitespace-nowrap">
                    {kr.v}<span className="text-[11px] font-semibold text-ink-500">/{kr.tgt}</span>
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-semibold tabular-nums text-ink-400">时间{risk.timePct}%</span>
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{background: statusDot}} />
                  </div>
                </div>
              </div>
            );
          })}
          <AddButton label="添加 KR" onClick={() => onKrAdd?.(o._workIdx)} />
        </div>
      </div>
    );
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-[1.2fr_1fr] gap-4 annual-work-grid">
        {panelHtml({ ...main, _workIdx: 0 }, '主业', '#ef4444')}
        {side && panelHtml({ ...side, _workIdx: 1 }, '副业', '#f9a8a8')}
      </div>
    </div>
  );
}

/* ---------- 11. 视图 · 生活 ---------- */
function LifeView({ lifeData, onEntryAdd, onEntryEdit }) {
  const dynLife = lifeData || LIFE;
  // 生活模块完成率：有记录的类目数 / 总类目数 * 100（体验型鼓励每个类目都有内容）
  const lifePct = Math.round((dynLife.filter(c => c.entries.length > 0).length / dynLife.length) * 100);
  return (
    <div className="flex flex-col gap-4">
      {/* P2-2: 生活统计条 */}
      <LifeStatsBar categories={dynLife.map(c => ({ key: c.key, label: c.lb, count: c.entries.length, color: c.color }))} />
      <div className="grid grid-cols-5 gap-3 annual-life-grid">
        {dynLife.map((c, ci) => (
          <div key={c.key} className="glass-card p-4 flex flex-col">
            {/* 头部 - count pill改tabnum裸数字 */}
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-bold text-ink-900">{c.lb}</span>
              <span className="text-xs font-bold tabular-nums ml-auto" style={{color: c.color}}>
                {c.entries.length}
              </span>
            </div>
            {/* 条目列表 - 取消overflow-y-auto，日期移至右侧 */}
            <div className="flex flex-col gap-2 flex-1">
              {c.entries.length === 0 && (
                <div className="flex-1 flex flex-col items-center justify-center py-5 px-2 rounded-xl border border-dashed border-ink-100 text-center gap-1.5">
                  <div className="w-8 h-8 rounded-xl grid place-items-center" style={{background: `${c.color}10`}}>
                    <span className="text-base">
                      {c.key === 'food' && '🍜'}
                      {c.key === 'travel' && '✈️'}
                      {c.key === 'movie' && '🎬'}
                      {c.key === 'gift' && '🎁'}
                      {c.key === 'moment' && '📸'}
                    </span>
                  </div>
                  <div className="text-[11px] font-semibold text-ink-500">还没有{c.lb}记录</div>
                  <div className="text-[10px] text-ink-400 leading-snug">
                    {c.key === 'food' && '记录探店美食，分享舌尖记忆'}
                    {c.key === 'travel' && '把每次出行都变成珍贵回忆'}
                    {c.key === 'movie' && '好片烂片都值得留下观后感'}
                    {c.key === 'gift' && '收礼送礼的心意都值得记下来'}
                    {c.key === 'moment' && '记录平凡日子里的小闪光'}
                  </div>
                </div>
              )}
              {c.entries.map((e, i) => (
                <div key={i} onClick={() => onEntryEdit?.(ci, i, e)} className="p-2.5 rounded-xl border border-ink-100 hover:border-surface hover:bg-surface-soft transition cursor-pointer">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-xs font-semibold text-ink-900 leading-snug flex-1 min-w-0">{e.t}</div>
                    <div className="text-[11px] font-semibold text-ink-400 tabular-nums flex-shrink-0">{e.d}</div>
                  </div>
                  {e.n && <div className="text-[11px] text-ink-500 leading-relaxed mt-1">{e.n}</div>}
                </div>
              ))}
              <AddButton label="添加" onClick={() => onEntryAdd?.(ci, c.lb)} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- 12. 通用 · Section Header ---------- */
function SectionHeader({ cat, title, progress, right }) {
  const c = catMeta(cat);
  return (
    <div className="flex items-center gap-3 pb-3 border-b border-ink-100">
      {/* P1-1: 竖条→32×32图标块 */}
      <div className="w-8 h-8 rounded-xl grid place-items-center flex-shrink-0"
        style={{ background: `${c.color}12`, color: c.color }}>
        <CategoryIcon catKey={c.key} className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <h2 className="text-base font-bold text-ink-900 leading-tight tracking-tight">{title}</h2>
      </div>
      {/* P1-1: 右侧完成率 badge 或自定义内容 */}
      {typeof progress === 'number' && (
        <div className="flex items-center gap-2">
          <div className="w-16"><ProgressBar value={progress} color={c.color} /></div>
          <span className="text-xs font-bold tabular-nums" style={{color: c.color}}>{progress}%</span>
        </div>
      )}
      {right}
    </div>
  );
}

/* ---------- 13. localStorage 持久化 hook ---------- */
function usePersistentState(key, initial) {
  const [state, setState] = useState(() => {
    try {
      const saved = localStorage.getItem(key);
      if (saved) return JSON.parse(saved);
    } catch {}
    return typeof initial === 'function' ? initial() : initial;
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(state)); } catch {}
  }, [key, state]);
  return [state, setState];
}

/* ---------- 14. 入口组件 ---------- */
export default function AnnualPlan({ standalone = true }) {
  const [view, setView] = useState('overview');
  const [toast, setToast] = useState(null);
  const [timeScale, setTimeScale] = useState('year');
  const [confirmDialog, setConfirmDialog] = useState(null);
  const { realHabits, loading: energyLoading, refresh: refreshEnergy } = useEnergyHabits();

  // 可变数据（localStorage 持久化）
  const [books, setBooks] = usePersistentState('annual_books', () => BOOKS.map(b => ({ ...b, id: uid() })));
  const [abilities, setAbilities] = usePersistentState('annual_abilities', () => ABILITY.map(a => ({ ...a, id: uid(), mstones: a.mstones.map(m => ({ ...m, id: uid() })) })));
  const [workGoals, setWorkGoals] = usePersistentState('annual_work', () => WORK.map(o => ({ ...o, krs: o.krs.map(k => ({ ...k, id: uid(), st: k.st === 'tg' ? 'pending' : k.st })) })));
  const [lifeData, setLifeData] = usePersistentState('annual_life', () => LIFE.map(c => ({ ...c, entries: c.entries.map(e => ({ ...e, id: uid() })) })));
  // 精力习惯 - 用户自定义年度目标（覆盖默认推断值 120/230）
  const [habitTargets, setHabitTargets] = usePersistentState('annual_habit_targets', () => ({}));
  // 能力自评历史 - 每月记录一次分数，key: ability.id, value: {[YYYY-MM]: score}
  const [abilityScoreHistory, setAbilityScoreHistory] = usePersistentState('annual_ability_score_history', () => ({}));
  // 知力 OKR - O 与 KR 列表均支持编辑增删
  const [cogObjective, setCogObjective] = usePersistentState('annual_cog_o', () => COG_O);
  const [cogKrs, setCogKrs] = usePersistentState('annual_cog_krs', () => COG_KRS.map(k => ({ ...k, id: k.id || uid() })));
  // 知力 · 漏斗顶部标题与备注（主标题"转化漏斗"+右侧说明"阅读→笔记→践行"），支持点击编辑
  const [funnelHeader, setFunnelHeader] = usePersistentState('annual_cog_funnel_header', () => ({ title: '转化漏斗', sub: '输入→思考→行动→改变' }));
  // 知力 · 漏斗四层阶段的自定义文字（label/sub/convLabel），刷新不丢
  // — 结构：{ total: {label, sub, convLabel}, done: {...}, notes: {...}, changes: {...} }
  // — 仅存文字，count 从书架/KR数据联动，不保存在这里
  const [funnelStageLabels, setFunnelStageLabels] = usePersistentState('annual_cog_funnel_stages_labels', () => ({}));
  // 知力 · 书架标题（如"2026年 · 书架"），支持自定义
  const [bookshelfTitle, setBookshelfTitle] = usePersistentState('annual_cog_bookshelf_title', () => '');
  // 知力 · 行动改变（承诺本）— {id, bookId, bookTitle, insightId, insightText, resonance, text, startDate, targetDays, checkIns[], status}
  const [cogChanges, setCogChanges] = usePersistentState('annual_cog_changes', () => []);
  // 知力 · 改变证明（结果区·复盘卡）— {id, changeId, text, bookTitle, insightText, daysCompleted, beforeState, afterState, nextStep, tag, createdAt}
  const [cogReviews, setCogReviews] = usePersistentState('annual_cog_reviews', () => []);

  // 合并习惯数据：用 habitTargets 覆盖 target（同时兼容真实 API 返回 + Mock 回退）
  const mergedHabits = useMemo(() => {
    const src = realHabits || HABITS;
    return src.map(h => {
      const key = h.id || h.key;
      const custom = habitTargets?.[key];
      return custom ? { ...h, target: custom } : h;
    });
  }, [realHabits, habitTargets]);

  // 修改单个习惯的年度目标
  const setHabitTarget = useCallback((habitKeyOrId, newTarget) => {
    const t = Math.max(1, Math.round(Number(newTarget) || 0));
    setHabitTargets(prev => ({ ...prev, [habitKeyOrId]: t }));
  }, [setHabitTargets]);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }, []);

  // ---- 数据导入 / 导出 / 重置 ----
  const handleExport = useCallback(() => {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      books, abilities, workGoals, lifeData,
      habitTargets, abilityScoreHistory,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const y = new Date().getFullYear();
    a.href = url;
    a.download = `annual-plan-${y}-${new Date().toISOString().slice(5,10).replace('-','')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('✅ 年度数据已导出');
  }, [books, abilities, workGoals, lifeData, habitTargets, abilityScoreHistory, showToast]);

  const handleImport = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setConfirmDialog({
      title: '确认导入数据？',
      message: '将覆盖当前所有年度规划数据（书籍、能力、工作、生活、习惯目标、自评历史），此操作无法撤销。',
      confirmText: '确认导入',
      danger: true,
      onConfirm: async () => {
        try {
          const text = await file.text();
          const data = JSON.parse(text);
          if (data.books !== undefined) setBooks(data.books);
          if (data.abilities !== undefined) setAbilities(data.abilities);
          if (data.workGoals !== undefined) setWorkGoals(data.workGoals);
          if (data.lifeData !== undefined) setLifeData(data.lifeData);
          if (data.habitTargets !== undefined) setHabitTargets(data.habitTargets);
          if (data.abilityScoreHistory !== undefined) setAbilityScoreHistory(data.abilityScoreHistory);
          showToast('✅ 年度数据已导入');
        } catch (err) {
          console.error(err);
          showToast('❌ 导入失败：文件格式不正确');
        }
        setConfirmDialog(null);
      },
      onCancel: () => setConfirmDialog(null),
    });
  }, [setBooks, setAbilities, setWorkGoals, setLifeData, setHabitTargets, setAbilityScoreHistory, showToast]);

  const handleReset = useCallback(() => {
    setConfirmDialog({
      title: '重置为初始模板？',
      message: '将清除当前所有自定义数据，恢复为示例模板。此操作无法撤销。',
      confirmText: '确认重置',
      danger: true,
      onConfirm: () => {
        setBooks(BOOKS.map(b => ({ ...b, id: uid() })));
        setAbilities(ABILITY.map(a => ({ ...a, id: uid(), mstones: a.mstones.map(m => ({ ...m, id: uid() })) })));
        setWorkGoals(WORK.map(o => ({ ...o, krs: o.krs.map(k => ({ ...k, id: uid(), st: k.st === 'tg' ? 'pending' : k.st })) })));
        setLifeData(LIFE.map(c => ({ ...c, entries: c.entries.map(e => ({ ...e, id: uid() })) })));
        setHabitTargets({});
        setAbilityScoreHistory({});
        showToast('✅ 已重置为初始模板');
        setConfirmDialog(null);
      },
      onCancel: () => setConfirmDialog(null),
    });
  }, [setBooks, setAbilities, setWorkGoals, setLifeData, setHabitTargets, setAbilityScoreHistory, showToast]);

  // ---- CRUD 操作 ----
  // 认知·书籍
  // 单一真理源：写入前统一规范化 st ↔ pct（防止编辑只改一个没改另一个，导致分组不变）
  //   · 规则优先级：用户【显式指定的 st】（例如从 done 拖回 reading）> 【st 与 pct 双向同步】
  //     （避免出现"已读完→拖回阅读中，但pct还是100被auto-升回done导致动不了"的问题）
  //   · pct 边界规则：
  //     done    → 强制 pct = 100
  //     pending → 强制 pct = 0
  //     reading → pct 必须在 (0, 100) 开区间：
  //                 · 0 进来默认 1%（表示"开始读了"）
  //                 · ≥ 100 进来压到 99%（尊重用户要放reading的意图）
  //     无 st / 老数据兼容 → 仅按 pct 反推
  const normalizeBook = (b) => {
    const out = { ...b };
    const pctNum = Math.min(100, Math.max(0, Number(out.pct) || 0));
    if (out.st === 'done') {
      out.pct = 100;
    } else if (out.st === 'pending') {
      out.pct = 0;
    } else if (out.st === 'reading') {
      if (pctNum >= 100) out.pct = 99;     // 用户显式要求reading：哪怕100%也压到99，防止被下面逻辑反弹回done
      else if (pctNum <= 0) out.pct = 1;
      else out.pct = pctNum;
    } else {
      out.pct = pctNum;
      if (out.pct >= 100) out.st = 'done';
      else if (out.pct > 0) out.st = 'reading';
      else out.st = 'pending';
    }
    return out;
  };
  const bookOps = {
    add: (data) => {
      const record = normalizeBook({ ...data });
      setBooks(prev => [...prev, { ...record, id: uid() }]);
      showToast('书籍已添加');
    },
    update: (data) => {
      if (!data?.id) return;
      const record = normalizeBook({ ...data });
      setBooks(prev => prev.map(b => b.id === record.id ? { ...b, ...record } : b));
      showToast('书籍已更新');
    },
    // 快速移动（仅改变 st，其他不动；pct 会被 normalizeBook 自动同步）
    move: (id, targetSt) => {
      setBooks(prev => prev.map(b => {
        if (b.id !== id) return b;
        return normalizeBook({ ...b, st: targetSt });
      }));
      const label = targetSt === 'done' ? '已读完' : targetSt === 'reading' ? '阅读中' : '未开始';
      showToast(`已移至「${label}」`);
    },
    remove: (id) => { setBooks(prev => prev.filter(b => b.id !== id)); showToast('书籍已删除'); },
  };
  // 知力 · 行动改变（承诺本）CRUD
  const changeOps = {
    add: (data) => {
      const record = {
        id: uid(),
        bookId: data.bookId || '',
        bookTitle: data.bookTitle || '',
        insightId: data.insightId || '',
        insightText: data.insightText || '',
        resonance: data.resonance || 5,
        text: data.text || '',
        startDate: data.startDate || new Date().toISOString().slice(0, 10),
        targetDays: data.targetDays || 30,
        checkIns: data.checkIns || [],
        status: 'active',
      };
      setCogChanges(prev => [...prev, record]);
      showToast('行动改变已添加');
    },
    update: (data) => {
      if (!data?.id) return;
      setCogChanges(prev => prev.map(c => c.id === data.id ? { ...c, ...data } : c));
      showToast('行动改变已更新');
    },
    // 打卡：添加今天日期到 checkIns
    checkIn: (id) => {
      const today = new Date().toISOString().slice(0, 10);
      setCogChanges(prev => prev.map(c => {
        if (c.id !== id) return c;
        if (c.checkIns.includes(today)) return c; // 今天已打
        const next = [...c.checkIns, today];
        // 达到 targetDays → 自动标完成
        const done = next.length >= c.targetDays;
        return { ...c, checkIns: next, status: done ? 'completed' : 'active' };
      }));
      showToast('✅ 已打卡');
    },
    // 30天完成 → 生成复盘卡
    completeAndReview: (id) => {
      const change = cogChanges.find(c => c.id === id);
      if (!change) return;
      // 标记改变已完成
      setCogChanges(prev => prev.map(c => c.id === id ? { ...c, status: 'reviewed' } : c));
      // 创建复盘卡（草稿）
      const review = {
        id: uid(),
        changeId: id,
        text: change.text,
        bookTitle: change.bookTitle,
        insightText: change.insightText,
        daysCompleted: change.checkIns.length,
        beforeState: '',
        afterState: '',
        nextStep: '',
        tag: 'habit',
        createdAt: new Date().toISOString(),
      };
      setCogReviews(prev => [...prev, review]);
      showToast('复盘卡已生成，请填写改变前后的对比');
    },
    remove: (id) => { setCogChanges(prev => prev.filter(c => c.id !== id)); showToast('行动改变已删除'); },
  };
  // 知力 · 复盘卡（结果区）CRUD
  const reviewOps = {
    update: (data) => {
      if (!data?.id) return;
      setCogReviews(prev => prev.map(r => r.id === data.id ? { ...r, ...data } : r));
      showToast('复盘卡已更新');
    },
    remove: (id) => { setCogReviews(prev => prev.filter(r => r.id !== id)); showToast('复盘卡已删除'); },
  };
  // 能力·里程碑
  const msOps = {
    add: (data) => {
      setAbilities(prev => prev.map((a, i) => i === data.abilityIdx ? { ...a, mstones: [...a.mstones, { ...data, id: uid() }] } : a));
      showToast('里程碑已添加');
    },
    update: (data) => {
      setAbilities(prev => prev.map((a, i) => i === data.abilityIdx ? { ...a, mstones: a.mstones.map((m, j) => j === data.msIdx ? { ...m, lb: data.lb, st: data.st, pct: data.pct } : m) } : a));
      showToast('里程碑已更新');
    },
    remove: ({ abilityIdx, msIdx }) => {
      setAbilities(prev => prev.map((a, i) => i === abilityIdx ? { ...a, mstones: a.mstones.filter((_, j) => j !== msIdx) } : a));
      showToast('里程碑已删除');
    },
  };
  // 工作·KR
  const krOps = {
    add: (data) => {
      setWorkGoals(prev => prev.map((o, i) => i === data.workIdx ? { ...o, krs: [...o.krs, { ...data, id: uid() }] } : o));
      showToast('KR 已添加');
    },
    update: (data) => {
      setWorkGoals(prev => prev.map((o, i) => i === data.workIdx ? { ...o, krs: o.krs.map((k, j) => j === data.krIdx ? { ...k, t: data.t, v: data.v, tgt: data.tgt, u: data.u, st: data.st } : k) } : o));
      showToast('KR 已更新');
    },
    remove: ({ workIdx, krIdx }) => {
      setWorkGoals(prev => prev.map((o, i) => i === workIdx ? { ...o, krs: o.krs.filter((_, j) => j !== krIdx) } : o));
      showToast('KR 已删除');
    },
  };
  // 生活·记录
  const entryOps = {
    add: (data) => {
      setLifeData(prev => prev.map((c, i) => i === data.lifeKey ? { ...c, entries: [...c.entries, { ...data, id: uid() }] } : c));
      showToast('记录已添加');
    },
    update: (data) => {
      setLifeData(prev => prev.map((c, i) => i === data.lifeKey ? { ...c, entries: c.entries.map((e, j) => j === data.entryIdx ? { ...e, t: data.t, n: data.n, d: data.d } : e) } : c));
      showToast('记录已更新');
    },
    remove: ({ lifeKey, entryIdx }) => {
      setLifeData(prev => prev.map((c, i) => i === lifeKey ? { ...c, entries: c.entries.filter((_, j) => j !== entryIdx) } : c));
      showToast('记录已删除');
    },
  };

  // ---- Modal 状态 ----
  const [modal, setModal] = useState(null); // { type, initial, categoryLabel }
  const closeModal = () => setModal(null);

  // 精力习惯编辑（打开 HabitForm）
  const handleEnergyAction = useCallback(async (action, habit) => {
    if (action === 'addHabit') {
      // 新建精力类习惯
      setModal({ type: 'habit', initial: { growth_type: 'energy', accent_color: '#22c55e' } });
    }
    if (action === 'editHabit' && habit) {
      const rawHabit = {
        id: habit.id,
        name: habit.name,
        emoji: habit.emoji,
        growth_type: 'energy',
        accent_color: '#22c55e',
        target_mode: habit.unit === '次' ? 'count' : 'check',
        target_unit: habit.unit === '次' ? '次' : habit.unit,
        target_value: habit.unit === '次' ? '1' : null,
      };
      setModal({ type: 'habit', initial: rawHabit });
    }
    if (action === 'removeHabit' && habit?.id) {
      setConfirmDialog({
        title: '删除习惯',
        message: `确定删除习惯「${habit.name}」吗？\n年度统计会一并删除，此操作不可撤销。`,
        confirmText: '删除',
        danger: true,
        onConfirm: async () => {
          try {
            await API.habits.remove(habit.id);
            showToast(`已删除习惯「${habit.name}」`);
            refreshEnergy();
          } catch (e) {
            showToast('删除失败：' + e.message);
          }
          setConfirmDialog(null);
        },
        onCancel: () => setConfirmDialog(null),
      });
    }
  }, [refreshEnergy, showToast]);

  // ---- CRUD 回调 ----
  const onBookAdd = () => setModal({ type: 'book' });
  const onBookEdit = (book) => setModal({ type: 'book', initial: book });
  const onMsAdd = (abilityIdx) => setModal({ type: 'milestone', initial: { abilityIdx } });
  const onMsEdit = (abilityIdx, msIdx, m) => setModal({ type: 'milestone', initial: { ...m, abilityIdx, msIdx, id: m.id } });
  const onKrAdd = (workIdx) => setModal({ type: 'kr', initial: { workIdx } });
  const onKrEdit = (workIdx, krIdx, k) => setModal({ type: 'kr', initial: { ...k, workIdx, krIdx, id: k.id } });
  const onEntryAdd = (lifeKey, label) => setModal({ type: 'entry', initial: { lifeKey }, categoryLabel: label });
  const onEntryEdit = (lifeKey, entryIdx, e) => setModal({ type: 'entry', initial: { ...e, lifeKey, entryIdx, id: e.id }, categoryLabel: lifeData[lifeKey]?.lb });

  // Modal 渲染
  const modalEl = modal && (() => {
    const props = { onSaved: closeModal, onCancel: closeModal };
    switch (modal.type) {
      case 'habit':
        const isHabitEdit = !!(modal.initial && modal.initial.id);
        return (
          <Modal open onClose={closeModal} title={isHabitEdit ? '编辑精力习惯' : '添加精力习惯'}>
            <HabitForm
              initial={modal.initial}
              onSaved={() => {
                closeModal();
                showToast(isHabitEdit ? '习惯已更新' : '习惯已添加');
                refreshEnergy();
              }}
              onCancel={closeModal}
            />
          </Modal>
        );
      case 'book':
        return (
          <Modal open onClose={closeModal} title={modal.initial?.id ? '编辑书籍' : '添加书籍'}>
            <BookForm
              initial={modal.initial}
              onSaved={(data) => { modal.initial?.id ? bookOps.update(data) : bookOps.add(data); }}
              {...props}
              onDelete={modal.initial?.id ? (id) => { bookOps.remove(id); closeModal(); } : undefined}
            />
          </Modal>
        );
      case 'milestone':
        return (
          <Modal open onClose={closeModal} title={modal.initial?.id ? '编辑里程碑' : '添加里程碑'}>
            <MilestoneForm
              initial={modal.initial}
              onSaved={(data) => { modal.initial?.id ? msOps.update(data) : msOps.add(data); }}
              {...props}
              onDelete={modal.initial?.id ? (idx) => { msOps.remove(idx); closeModal(); } : undefined}
            />
          </Modal>
        );
      case 'kr':
        return (
          <Modal open onClose={closeModal} title={modal.initial?.id ? '编辑 KR' : '添加 KR'}>
            <KrForm
              initial={modal.initial}
              onSaved={(data) => { modal.initial?.id ? krOps.update(data) : krOps.add(data); }}
              {...props}
              onDelete={modal.initial?.id ? (idx) => { krOps.remove(idx); closeModal(); } : undefined}
            />
          </Modal>
        );
      case 'entry':
        return (
          <Modal open onClose={closeModal} title={modal.initial?.id ? '编辑记录' : '添加记录'}>
            <EntryForm
              initial={modal.initial}
              categoryLabel={modal.categoryLabel}
              onSaved={(data) => { modal.initial?.id ? entryOps.update(data) : entryOps.add(data); }}
              {...props}
              onDelete={modal.initial?.id ? (idx) => { entryOps.remove(idx); closeModal(); } : undefined}
            />
          </Modal>
        );
      default: return null;
    }
  })();

  const stats = useOverviewStats(mergedHabits, books, abilities, workGoals, lifeData);

  // 主内容
  const mainContent = (
    <main key={view} className="flex-1 min-w-0 animate-fade-in">
      {view === 'overview'  && <OverviewView  onNav={setView} stats={stats} realHabits={mergedHabits} books={books} abilities={abilities} workGoals={workGoals} lifeData={lifeData} timeScale={timeScale} onTimeScaleChange={setTimeScale} />}
      {view === 'energy'    && <EnergyView   realHabits={mergedHabits} loading={energyLoading} onAction={handleEnergyAction} onSetTarget={setHabitTarget} />}
      {view === 'cognition' && <CognitionView books={books} onBookAdd={onBookAdd} onBookEdit={onBookEdit} onBookMove={(id, st) => bookOps.move(id, st)}
        objective={cogObjective} onObjectiveChange={setCogObjective}
        krs={cogKrs} onKrAdd={(kr) => { setCogKrs(prev => [...prev, { ...kr, id: uid() }]); showToast('KR 已添加'); }}
        onKrEdit={(kr) => { setCogKrs(prev => prev.map(k => k.id === kr.id ? { ...k, ...kr } : k)); showToast('KR 已更新'); }}
        onKrRemove={(id) => { setCogKrs(prev => prev.filter(k => k.id !== id)); showToast('KR 已删除'); }}
        funnelHeader={funnelHeader} setFunnelHeader={setFunnelHeader}
        funnelStageLabels={funnelStageLabels} setFunnelStageLabels={setFunnelStageLabels}
        bookshelfTitle={bookshelfTitle} setBookshelfTitle={setBookshelfTitle}
        changes={cogChanges} onChangeAdd={changeOps.add} onChangeUpdate={changeOps.update} onChangeCheckIn={changeOps.checkIn} onChangeComplete={changeOps.completeAndReview} onChangeRemove={changeOps.remove}
        reviews={cogReviews} onReviewUpdate={reviewOps.update} onReviewRemove={reviewOps.remove}
        showToast={showToast}
      />}
      {view === 'ability'   && <AbilityView  abilities={abilities} onMsAdd={onMsAdd} onMsEdit={onMsEdit}
        scoreHistory={abilityScoreHistory} onSetScore={(abilityIdx, newScore) => {
          const ab = abilities[abilityIdx]; if (!ab) return;
          const ym = new Date().toISOString().slice(0,7);
          const abId = ab.id || ab.title;
          setAbilityScoreHistory(prev => ({ ...prev, [abId]: { ...(prev[abId] || {}), [ym]: newScore } }));
          setAbilities(prev => prev.map((a, i) => i === abilityIdx ? { ...a, score: String(newScore) } : a));
          showToast('自评已更新');
        }} />}
      {view === 'work'      && <WorkView     workGoals={workGoals} onKrAdd={onKrAdd} onKrEdit={onKrEdit} />}
      {view === 'life'      && <LifeView     lifeData={lifeData} onEntryAdd={onEntryAdd} onEntryEdit={onEntryEdit} />}
    </main>
  );

  const toastEl = toast && (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-ink-900 text-white text-sm font-medium shadow-lg flex items-center gap-2">
      <svg className="w-4 h-4 text-brand-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round"/></svg>
      {toast}
    </div>
  );

  const confirmEl = confirmDialog && (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink-900/40 backdrop-blur-sm" onClick={confirmDialog.onCancel}>
      <div className="bg-white rounded-2xl shadow-xl w-[360px] overflow-hidden animate-fade-in" onClick={e => e.stopPropagation()}>
        <div className="p-5 flex flex-col gap-1">
          <h3 className="text-base font-bold text-ink-900">{confirmDialog.title}</h3>
          <p className="text-sm text-ink-500 whitespace-pre-line leading-relaxed mt-1">{confirmDialog.message}</p>
        </div>
        <div className="flex border-t border-ink-100">
          <button onClick={confirmDialog.onCancel} className="flex-1 py-3.5 text-sm font-semibold text-ink-600 hover:bg-ink-100 transition">取消</button>
          <button onClick={confirmDialog.onConfirm}
            className={['flex-1 py-3.5 text-sm font-bold transition', confirmDialog.danger ? 'text-accent-red hover:bg-accent-red/10' : 'text-brand-500 hover:bg-brand-500/10'].join(' ')}>
            {confirmDialog.confirmText || '确认'}
          </button>
        </div>
      </div>
    </div>
  );

  const styles = (
    <style>{`
      /* ---- 精力表格 grid 模板：[习惯名] [目标 累计 完成率] [月份×12] ---- 
         设计原则：删除最右30px删除列后，将释放的空间分配给月份列
         → 月份列 minmax(30px, 0.25fr) → minmax(32px, 0.28fr)
         → 每个月份格子增加2px宽度，数字显示更舒适，整体更紧凑
      */
      .habit-table {
        grid-template-columns: minmax(110px, 1.5fr) 64px 52px 60px repeat(12, minmax(32px, 0.28fr));
        gap: 0 0;
        align-items: center;
      }
      /* 分组间距：习惯名与统计区分组 */
      .habit-table > .grp-start {
        margin-right: 4px;
      }
      /* 分组间距：统计区与月份区分组 */
      .habit-table > .grp-end {
        padding-right: 12px;
      }
      /* 统计区内：累计与完成率之间间距 */
      .habit-table > .cum-gap {
        margin-right: 6px;
      }
      /* ---- P2-13: 视图淡入过渡 ---- */
      @keyframes fade-in-up {
        from { opacity: 0; transform: translateY(6px); }
        to   { opacity: 1; transform: none; }
      }
      .animate-fade-in { animation: fade-in-up 0.25s cubic-bezier(0.2, 0.8, 0.2, 1); }

      /* ---- P1-8: 响应式断点 ---- */
      /* 中等屏幕：5列 → 3列 */
      @media (max-width: 1200px) {
        .annual-cat-grid   { grid-template-columns: repeat(3, 1fr) !important; }
        .annual-life-grid  { grid-template-columns: repeat(3, 1fr) !important; }
        .annual-work-grid  { grid-template-columns: 1fr !important; }
      }
      /* 小屏幕：3列 → 2列 */
      @media (max-width: 900px) {
        .annual-cat-grid   { grid-template-columns: repeat(2, 1fr) !important; }
        .annual-life-grid  { grid-template-columns: repeat(2, 1fr) !important; }
        .annual-energy-grid,
        .annual-ability-grid { grid-template-columns: repeat(2, 1fr) !important; }
      }
      /* 极小屏幕：2列 → 1列 */
      @media (max-width: 640px) {
        .annual-cat-grid,
        .annual-life-grid,
        .annual-energy-grid,
        .annual-ability-grid { grid-template-columns: 1fr !important; }
      }
    `}</style>
  );

  // 嵌入式顶部 Tab 导航（在工作台内使用，不需要内部大 Sidebar）
  const EMBED_NAV = [
    { key: 'overview',  label: '年度概览' },
    ...CATEGORIES.map(c => ({ key: c.key, label: c.label, color: c.color })),
  ];
  const embedTabs = (
    <div className="glass-card p-2 mb-4 flex items-center gap-1 overflow-x-auto">
      {EMBED_NAV.map(item => {
        const on = view === item.key;
        const pctVal = item.key !== 'overview'
          ? Math.round(stats.perCat[CATEGORIES.findIndex(c => c.key === item.key)])
          : null;
        return (
          <button
            key={item.key}
            onClick={() => setView(item.key)}
            className={[
              'flex-shrink-0 flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold transition-all',
              on
                ? 'bg-brand-500 text-white shadow-sm'
                : 'text-ink-600 hover:bg-ink-100'
            ].join(' ')}
          >
            <span className={[
              'w-6 h-6 rounded-md grid place-items-center flex-shrink-0',
              on ? 'text-white' : ''
            ].join(' ')}
              style={!on && item.color ? { color: item.color } : !on ? { color: '#8e8e93' } : undefined}>
              <CategoryIcon catKey={item.key} className="w-3.5 h-3.5" />
            </span>
            <span>{item.label}</span>
            {pctVal !== null && (
              <span className={[
                'text-xs font-bold tabular-nums px-1.5 py-0.5 rounded-md',
                on ? 'bg-white/15 text-white/90' : 'bg-ink-100 text-ink-500'
              ].join(' ')}>{pctVal}%</span>
            )}
          </button>
        );
      })}
    </div>
  );

  // 嵌入式：工作台内使用，顶部简易 Tab 导航 + 主内容，没有外层背景/NavBar/内部大Sidebar
  if (!standalone) {
    return (
      <div className="w-full">
        {embedTabs}
        {mainContent}
        {styles}
        {toastEl}
        {modalEl}
        {confirmEl}
      </div>
    );
  }

  // 独立模式（沙盒 #annual 预览）：完整外壳 + 内部 Sidebar + 返回工作台
  return (
    <div className="min-h-screen bg-surface-base px-6 py-6">
      <div className="max-w-[1400px] mx-auto">
        <NavBar onExport={handleExport} onImport={handleImport} onReset={handleReset} />
        <div className="flex gap-5 items-start">
          <Sidebar active={view} onChange={setView} stats={stats} />
          {mainContent}
        </div>
      </div>
      {styles}
      {toastEl}
      {modalEl}
      {confirmEl}
    </div>
  );
}
