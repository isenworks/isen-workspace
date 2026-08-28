import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { API } from '../api/client.js';
import { inferGrowthType } from '../utils/uiConstants.js';
import Modal from '../components/Modal.jsx';
import HabitForm from '../components/forms/HabitForm.jsx';
import BookForm from '../components/forms/BookForm.jsx';
import MilestoneForm from '../components/forms/MilestoneForm.jsx';
import AbilityForm from '../components/forms/AbilityForm.jsx';
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
  // 精力基建真实数据（方案A·严格按实际录入飞书记录：2026年1月/5月/6月/7月）
  // 来源：飞书多维表格「🟩精力基建(习惯打卡)」tblJOJ5X77aMIzQG
  // 语义：1=打卡 . = 未打卡 / 未记录，2月/3月/4月/8月暂未录入不显示
  { key: 'sleep', label: '睡觉 23:00 前', unit: '天', target: 230, val: 33,
    month: {1: 19, 5: 1, 6: 1, 7: 12},
    monthDates: {
      ...__mockMonthDates('11111111...111.11.1111......1.1', 1),
      ...__mockMonthDates('..........................1....', 5),
      ...__mockMonthDates('......1.......................', 6),
      ...__mockMonthDates('1.....111.......1111.1..1...1.1', 7),
    } },
  { key: 'water', label: '喝水 ≥ 2L',    unit: '杯', target: 230, val: 40,
    month: {1: 19, 5: 1, 6: 1, 7: 19},
    monthDates: {
      ...__mockMonthDates('11111111...111.11.1111......1.1', 1),
      ...__mockMonthDates('..........................1....', 5),
      ...__mockMonthDates('......1.......................', 6),
      ...__mockMonthDates('1.....111......111111111111111.', 7),
    } },
  { key: 'sport', label: '运动 ≥ 30 分', unit: '次', target: 120, val: 36,
    month: {1: 19, 5: 1, 6: 1, 7: 15},
    monthDates: {
      ...__mockMonthDates('11111111...111.11.1111......1.1', 1),
      ...__mockMonthDates('..........................1....', 5),
      ...__mockMonthDates('......1.......................', 6),
      ...__mockMonthDates('1.....111......11111.1.1..11.11', 7),
    } },
];

/* 认知 · 书籍 */
const BOOKS = [
  { t: '纳瓦尔宝典',   author: 'Eric Jorgenson', cat: '认知成长', st: 'reading', pct: 60, src: '电子书',
    bookId: 'e1e32b00729fc94fe1e824d',
    ebookUrl: 'https://weread.qq.com/web/reader/e1e32b00729fc94fe1e824d',
    insights: [
      { id: 'n1', text: '财富=专长*杠杆*长期投入', resonance: 9, scene: '用在个人专长识别与自媒体长期内容产出节奏规划' },
    ],
    hasInsights: true,
    hasAction: true,
    actions: [
      { id: 'na1', text: '确定自己的专长（视觉化），利用自媒体杠杆，坚持长期投入形成复利', done: false },
    ],
    action: '确定自己的专长（视觉化），利用自媒体杠杆，坚持长期投入形成复利',
  },
  { t: '思考，快与慢', author: '丹尼尔·卡尼曼', cat: '认知成长', st: 'pending', pct: 0, src: '电子书',
    bookId: '97132350813ab9e65g0129cb',
    ebookUrl: 'https://weread.qq.com/web/reader/97132350813ab9e65g0129cb',
    insights: [],
    hasInsights: false,
    hasAction: false,
    actions: [],
  },
  { t: '认知觉醒',     author: '周岭', cat: '认知成长', st: 'done',    pct: 100, src: '电子书',
    bookId: '6a732ce07201202c6a7b30a',
    ebookUrl: 'https://weread.qq.com/web/reader/6a732ce07201202c6a7b30a',
    insights: [
      { id: 'c1', text: '大脑分为本能脑、情绪脑和理智脑，情绪脑更强大，不要用所谓的意志力跟它对抗', resonance: 9, scene: '遇到情绪干扰时先安抚情绪脑再处理理性目标' },
      { id: 'c2', text: '看书学习时关注改变量而输入量', resonance: 8, scene: '读书计划不追求读完数量，追求实际落地行动条数' },
    ],
    hasInsights: true,
    hasAction: true,
    actions: [
      { id: 'ca1', text: '建立自己的认知成长体系，每日反思输出', done: false },
    ],
    action: '建立自己的认知成长体系，每日反思输出',
  },
  { t: '非暴力沟通',   author: '马歇尔·卢森堡', cat: '人际沟通', st: 'pending', pct: 0, src: '电子书',
    bookId: 'b7d32470813ab7e0eg015e3f',
    ebookUrl: 'https://weread.qq.com/web/reader/b7d32470813ab7e0eg015e3f',
    insights: [], hasInsights: false, hasAction: false, actions: [],
  },
  { t: '超级沟通者',   author: 'Lisa B. Marshall', cat: '人际沟通', st: 'pending', pct: 0, src: '电子书',
    bookId: '65632ab0813ab9992g0180d2',
    ebookUrl: 'https://weread.qq.com/web/reader/65632ab0813ab9992g0180d2',
    insights: [], hasInsights: false, hasAction: false, actions: [],
  },
  { t: '影响力',       author: '罗伯特·西奥迪尼', cat: '人际沟通', st: 'pending', pct: 0, src: '电子书',
    bookId: '9ad32d40727950039add092',
    ebookUrl: 'https://weread.qq.com/web/reader/9ad32d40727950039add092',
    insights: [], hasInsights: false, hasAction: false, actions: [],
  },
  { t: '即兴表达',     author: '王达峰', cat: '人际沟通', st: 'pending', pct: 0, src: '电子书',
    bookId: '947321c0813abb7e7g01945c',
    ebookUrl: 'https://weread.qq.com/web/reader/947321c0813abb7e7g01945c',
    insights: [], hasInsights: false, hasAction: false, actions: [],
  },
  { t: '高效能人士的七个习惯', author: '史蒂芬·柯维', cat: '商业职场', st: 'pending', pct: 0, src: '电子书',
    bookId: '56d325907203e8a856def7f',
    ebookUrl: 'https://weread.qq.com/web/reader/56d325907203e8a856def7f',
    insights: [], hasInsights: false, hasAction: false, actions: [],
  },
  { t: '创始人：新管理者如何度过第一个90天', author: 'Michael Lopp', cat: '商业职场', st: 'pending', pct: 0, src: '电子书',
    bookId: '226324d071b126082268c98',
    ebookUrl: 'https://weread.qq.com/web/reader/226324d071b126082268c98',
    insights: [], hasInsights: false, hasAction: false, actions: [],
  },
  { t: '增长黑客',     author: 'Sean Ellis', cat: '商业职场', st: 'pending', pct: 0, src: '电子书',
    bookId: '0c8326e05e12740c876a134',
    ebookUrl: 'https://weread.qq.com/web/reader/0c8326e05e12740c876a134',
    insights: [], hasInsights: false, hasAction: false, actions: [],
  },
  { t: '上瘾',         author: 'Nir Eyal', cat: '商业职场', st: 'pending', pct: 0, src: '电子书',
    bookId: '78232c00813ab9f6fg014655',
    ebookUrl: 'https://weread.qq.com/web/reader/78232c00813ab9f6fg014655',
    insights: [], hasInsights: false, hasAction: false, actions: [],
  },
  { t: '金字塔原理',   author: '芭芭拉·明托', cat: '商业职场', st: 'pending', pct: 0, src: '电子书',
    bookId: 'ff4323b0813ab6e84g018832',
    ebookUrl: 'https://weread.qq.com/web/reader/ff4323b0813ab6e84g018832',
    insights: [], hasInsights: false, hasAction: false, actions: [],
  },
  { t: '曾国藩传',     author: '张宏杰', cat: '人文叙事', st: 'done',    pct: 100, src: '电子书',
    bookId: '66032040716ac50b660b6c7',
    ebookUrl: 'https://weread.qq.com/web/reader/66032040716ac50b660b6c7',
    insights: [], hasInsights: false, hasAction: false, actions: [],
  },
];
/* 知力 · OKR — 理念：目标量→输入量→思考量→行动量→改变量 */
const COG_O = { text: '通过阅读获得启发，并确定实际行动目标以获得改变', year: new Date().getFullYear() };
const COG_KRS = [
  { id: 'kr0', lb: '目标量', tgt: 12, val: 12, u: '本', sub: '年度目标' },
  { id: 'kr1', lb: '输入量', tgt: 12, val: 0, u: '本', sub: '已读完' },
  { id: 'kr2', lb: '思考量', tgt: 24, val: 0, u: '组', sub: '思考组数' },
  { id: 'kr3', lb: '行动量', tgt: 12, val: 0, u: '项', sub: '行动勾选' },
  { id: 'kr4', lb: '改变量', tgt: 6, val: 0, u: '个', sub: '改变记录' },
];

/* -------- 封面组件：直接渲染<img> + 错误兜底 -------- */
function CoverImg({ src, bookId, coverSource, onPersist, catCol, fallbackChar }) {
  const [err, setErr] = React.useState(false);
  if (!src || err) {
    return (
      <span style={{ color: catCol, fontSize: '22px', fontWeight: 900, textShadow: `0 1px 2px ${catCol}22`, lineHeight: 1 }}>
        {fallbackChar}
      </span>
    );
  }
  return React.createElement('img', {
    src,
    alt: '',
    draggable: false,
    onError: () => setErr(true),
    style: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  });
}

/* 能力
 * mode: 'milestone'（默认，里程碑门）| 'kpi' | 'balance'
 * createdAt / deadline / completedAt：时间追踪四件套
 * 里程碑条目级 dueBy：可选（微截止）
 */
const ABILITY = [
  {
    title: '英语口语',
    score: '4',
    daily: '每日30min Shadowing + Anki背20词',
    mode: 'milestone',
    createdAt: '2026-01-15',
    deadline: '2026-12-31',
    completedAt: null,
    mstones: [
      { lb: '每日跟读 15 分钟（影子跟读法）', st: 'done', pct: 100, dueBy: '2026-03-31' },
      { lb: '背诵常用 500 口语句型', st: 'done', pct: 100, dueBy: '2026-05-31' },
      { lb: '完成 10 次即兴独白录音', st: 'done', pct: 100, dueBy: '2026-07-31' },
      { lb: '加入 1 次英语角交流', st: 'pending', pct: 0, dueBy: '2026-10-15' },
      { lb: '月末自评 ≥7/10 分', st: 'pending', pct: 0, dueBy: '2026-12-31' },
    ],
  },
  {
    title: '即兴表达',
    score: '5',
    daily: '每周1次演讲练习 + 即兴30秒训练',
    mode: 'milestone',
    createdAt: '2026-01-20',
    deadline: '2026-12-31',
    completedAt: null,
    mstones: [
      { lb: '学完金字塔原理输出方法', st: 'done', pct: 100, dueBy: '2026-04-30' },
      { lb: '完成 3 次 5 分钟主题演讲', st: 'doing', pct: 33, dueBy: '2026-09-30' },
      { lb: '即兴表达 30 秒不中断练习', st: 'pending', pct: 0, dueBy: '2026-12-15' },
    ],
  },
  {
    title: '数据分析',
    score: '3',
    daily: '每日 2h SQL 刷题 + 课程学习',
    mode: 'milestone',
    createdAt: '2026-08-01',
    deadline: '2026-09-14',
    completedAt: null,
    mstones: [
      { lb: '阶段一：单表查询基础（Day1-Day5｜课程 15-22 集）', st: 'doing', pct: 40, dueBy: '2026-08-05' },
      { lb: '阶段二：多表查询进阶（Day6-Day10｜课程 37-49 集）', st: 'pending', pct: 0, dueBy: '2026-08-10' },
      { lb: '阶段三：实战与面试冲刺（Day11-Day14｜选学 27-30 函数集数）', st: 'pending', pct: 0, dueBy: '2026-08-14' },
    ],
  },
];

/* 工作
 * mode: 'funnel'（求职默认，漏斗）| 'dashboard'（仪表盘·原名KPI仪表盘）
 *       | 'milestone'（里程碑门）| 'balance'（平衡雷达·辅助）
 * createdAt / deadline / completedAt：时间追踪四件套
 * kr 条目级 dueBy：可选（微截止）
 */
const WORK = [
  {
    core: true, label: '主业', title: '用户运营offer，薪资≥20k',
    mode: 'funnel',
    createdAt: '2026-07-15',
    deadline: '2026-09-30',
    completedAt: null,
    krs: [
      { t: '简历投递 50(份)', v: 20, tgt: 50, st: 'doing', dueBy: '2026-08-31' },
      { t: '面试通过 10(个)', v: 5,  tgt: 10, st: 'doing', dueBy: '2026-09-15' },
      { t: '改变总结 3(个)', v: 0,  tgt: 3,  st: 'tg',    dueBy: '2026-09-20' },
      { t: '拿意向 Offer 1(个)', v: 0, tgt: 1, st: 'tg', dueBy: '2026-09-25' },
      { t: '薪资达标 1(项)', v: 1, tgt: 1, st: 'done', dueBy: '2026-09-30' },
    ],
  },
  {
    core: false, label: '副业', title: '小红书「小憨熊」涨粉+变现',
    mode: 'dashboard', // KPI 仪表盘：3 个独立指标
    createdAt: '2026-06-01',
    deadline: '2026-12-31',
    completedAt: null,
    krs: [
      { t: '周更内容 50(条)', v: 12,  tgt: 50,  st: 'doing', dueBy: '2026-12-31' },
      { t: '粉丝增长 5000(粉)', v: 800, tgt: 5000, st: 'doing', dueBy: '2026-12-31' },
      { t: '商业合作 1(个)', v: 0,    tgt: 1,    st: 'tg',    dueBy: '2026-11-30' },
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
  switch (st) {
    case 'done':    return { lb: '已完成',  tagCls: 'bg-accent-green/10 text-accent-green',  numBg: 'bg-accent-green/10 text-accent-green',  bar: '#22c55e'  };
    case 'doing':   return { lb: '进行中',  tagCls: 'bg-accent-blue/10 text-accent-blue',    numBg: 'bg-accent-blue/10 text-accent-blue',    bar: '#4b63f0'   };
    case 'reading': return { lb: '阅读中',  tagCls: 'bg-accent-blue/10 text-accent-blue',    numBg: 'bg-accent-blue/10 text-accent-blue',    bar: '#4b63f0'   };
    case 'tg':      return { lb: '待启动',  tagCls: 'bg-ink-100 text-ink-500',               numBg: 'bg-ink-100 text-ink-500',               bar: '#c7c7cc'       };
    case 'pending': return { lb: '未开始',  tagCls: 'bg-ink-100 text-ink-500',               numBg: 'bg-ink-100 text-ink-500',               bar: '#c7c7cc'       };
    default:        return { lb: '',        tagCls: '', numBg: '', bar: '' };
  }
};
const catMeta = (key) => CATEGORIES.find(c => c.key === key) || CATEGORIES[0];

/* 时间解析：同时支持 '2026-09-30' (ISO) 和 '9月30日' (中文化) 以及 '09/30' 简写 */
const parseDate = (s) => {
  if (!s) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  const year = today.getFullYear();
  // ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    const t = new Date(y, m - 1, d); t.setHours(0,0,0,0); return t;
  }
  // 中文 9月30日 / 9月30
  const m = String(s).match(/(\d{1,2})\s*月\s*(\d{1,2})/);
  if (m) {
    const mm = Number(m[1]) - 1, dd = Number(m[2]);
    let t = new Date(year, mm, dd); t.setHours(0,0,0,0);
    if (t < today - 86400000 * 180) t = new Date(year + 1, mm, dd);
    return t;
  }
  // MM/DD 或 MM.DD
  const m2 = String(s).match(/^(\d{1,2})[\/\.\-](\d{1,2})$/);
  if (m2) {
    const mm = Number(m2[1]) - 1, dd = Number(m2[2]);
    let t = new Date(year, mm, dd); t.setHours(0,0,0,0);
    if (t < today - 86400000 * 180) t = new Date(year + 1, mm, dd);
    return t;
  }
  return null;
};

/* 给定 createdAt/startedAt + deadline，返回剩余天数、时间进度百分比
 * 两者都不传或解析失败 → { days: null, timePct: null }（不显示时间锚点）
 */
const calcTimeAnchor = (deadlineStr, createdStr) => {
  const today = new Date(); today.setHours(0,0,0,0);
  const target = parseDate(deadlineStr);
  const start = parseDate(createdStr) || (target ? new Date(target.getFullYear(), 0, 1) : null);
  if (!target || !start) return { days: null, timePct: null };
  const total = Math.max(1, target - start);
  const elapsed = Math.max(0, Math.min(total, today - start));
  const days = Math.ceil((target - today) / 86400000);
  return { days, timePct: Math.round((elapsed / total) * 100) };
};

/* 风险计算：actualPct (实际%) vs timePct (预期按时间推进%)
 *   已完成/满 = done 绿
 *   actual - time <= -20 → risk 严重落后红
 *   actual - time <= -5  → warn 略落后橙
 *   actual - time >= 20  → ahead 超前绿
 *   其余 normal 正常
 *   没有 timePct（无deadline/createdAt）→ 只基于 actual 区间判断
 */
const calcRisk = (actualPct, timePct, isDone) => {
  if (isDone || actualPct >= 100) return { q: 'done', label: '已完成', color: '#22c55e' };
  if (timePct !== null && timePct !== undefined) {
    const diff = actualPct - timePct;
    if (diff <= -20) return { q: 'risk', label: '严重落后', color: '#ef4444' };
    if (diff <= -5)  return { q: 'warn', label: '略落后',   color: '#f59e0b' };
    if (diff >= 20)  return { q: 'ahead',label: '超前',     color: '#10b981' };
    return { q: 'normal', label: '正常', color: '#3b82f6' };
  }
  // 无时间锚点：退化到按 actual 粗判
  if (actualPct <= 20) return { q: 'risk', label: '严重落后', color: '#ef4444' };
  if (actualPct <= 50) return { q: 'warn', label: '推进中',   color: '#f59e0b' };
  if (actualPct >= 90) return { q: 'ahead',label: '超前',     color: '#10b981' };
  return { q: 'normal', label: '正常', color: '#3b82f6' };
};

/* 剩余天数展示：剩X天 / 过期X天 / 长期（当 null） */
const daysLabel = (days) => {
  if (days === null || days === undefined) return { text: '长期', cls: 'text-ink-400', urgent: false, overdue: false };
  if (days < 0)  return { text: `过期${Math.abs(days)}天`, cls: 'text-rose-500', urgent: false, overdue: true };
  if (days === 0) return { text: '今日截止', cls: 'text-rose-500', urgent: true, overdue: false };
  if (days <= 30) return { text: `剩${days}天`, cls: 'text-amber-500', urgent: true, overdue: false };
  return { text: `剩${days}天`, cls: 'text-ink-500', urgent: false, overdue: false };
};

/* 目标模式兜底：当 mode 缺失时基于关键字 & 内容自动推断
 * 工作默认 funnel（求职场景）；能力默认 milestone
 */
const inferMode = (obj, type) => {
  if (obj?.mode) return obj.mode;
  if (type === 'ability') return 'milestone';
  // work
  const title = obj?.title || '';
  const krText = (obj?.krs || []).map(k => k.t).join(' ');
  const hay = `${title} ${krText}`;
  if (/试用|转正|入职|季度|绩效|KPI|业务指标/.test(title)) return 'dashboard';
  if (/第.?阶段|阶段.?门|专题|项目|里程碑|晋升|冲刺/.test(hay)) return 'milestone';
  if (/投递|面试|offer|简历|招聘|简历|销售|投放|漏斗/.test(hay)) return 'funnel';
  return 'funnel';
};

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

function AddButton({ label, onClick, compact }) {
  if (compact) {
    return (
      <button onClick={onClick || (() => {})} className="mt-auto p-1.5 rounded-lg border border-ink-100 text-ink-500 text-[11px] font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-ink-50 hover:border-ink-200 hover:text-ink-700 transition cursor-pointer w-full">
        <span className="w-4 h-4 rounded-full bg-ink-100 grid place-items-center text-ink-600 flex-shrink-0">
          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" strokeLinecap="round"/></svg>
        </span>
        <span>{label}</span>
      </button>
    );
  }
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
  onEditClick, // 可选：右键"编辑"时的自定义回调（用于弹窗编辑而非行内编辑）
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
        {value ? (
          <span>{value}</span>
        ) : placeholder ? (
          <span>{placeholder}</span>
        ) : null}
      </span>

      {/* ---- 右键浮层菜单：编辑 / 删除（通过 portal 输出到 body，避免被容器裁剪）---- */}
      {isCtxMode && menu && typeof document !== 'undefined' && document.body && createPortal(
        <div
          onMouseDown={(e) => e.stopPropagation()}
          style={{ position: 'fixed', left: menu.x, top: menu.y, zIndex: 999999, width: menuWidth, backgroundColor: '#ffffff' }}
          className="rounded-xl shadow-2xl border border-ink-100 py-1 overflow-hidden">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMenu(null);
              if (onEditClick) { onEditClick(); } else { setEditing(true); }
            }}
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
        </div>,
        document.body,
      )}
    </>
  );
}

/* ---------- P2-2: 知力 OKR 漏斗 (输入量 → 思考量 → 行动量 → 改变量) ---------- */
function ReadingFunnel({
  total, done, notes, changes, reviews, color = '#4b63f0', embedded,
  headerTitle = '阅读转化漏斗',
  headerSub = '输入→思考→行动→改变→改变',
  onHeaderChange,
  stageLabels,
  onStageLabelsChange,
}) {
  // 五层漏斗（严格真子集递减）：目标量 → 输入量 → 思考量 → 行动量 → 改变量
  // 对应 ReadingFunnel 字段 total → done → notes → changes → reviews
  // 统一蓝色：全部使用计划总结页主色 #4b63f0
  const STAGE_COLORS = [color, color, color, color, color];
  const DEFAULT_STAGES = [
    { key: 'total',   label: '目标量', sub: '年度目标',   convLabel: '' },
    { key: 'done',    label: '输入量', sub: '已读完',   convLabel: '' },
    { key: 'notes',   label: '思考量', sub: '洞察组数',   convLabel: '' },
    { key: 'changes', label: '行动量', sub: '行动勾选',   convLabel: '' },
    { key: 'reviews', label: '改变量', sub: '改变记录',   convLabel: '' },
  ];
  const countsByKey = { total, done, notes, changes, reviews };
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

  // CTA 文案：根据各层数据动态生成"下一步建议"（目标量→输入量→思考量→行动量→改变量）
  const ctas = [
    // ① 目标量 → 输入量：未读完 → 提示阅读
    { idx: 0, show: done < total && total > 0, text: done === 0 ? '书架还没已读完的书，去完成第一本' : `还差 ${total - done} 本，继续阅读` },
    // ② 输入量 → 思考量：没写洞察 → 提示提取
    { idx: 1, show: notes < done && done > 0, text: notes === 0 ? '已读完的书还没写洞察，点击书籍添加思考' : `还差 ${Math.max(0, done * 2 - notes)} 组洞察，继续输出思考` },
    // ③ 思考量 → 行动量：没勾选 → 提示行动
    { idx: 2, show: changes < notes && notes > 0, text: changes === 0 ? '有洞察但没行动，生成你的第一条行动承诺' : `还差 ${Math.max(0, notes - changes)} 项行动，勾选更多行动项` },
    // ④ 行动量 → 改变量：没生成 → 提示记录
    { idx: 3, show: reviews < changes && changes > 0, text: reviews === 0 ? '有承诺但没记录改变，创建你的第一条改变' : `还差 ${Math.max(0, changes - reviews)} 条改变，记录你的改变` },
    // ⑤ （改变量预留，目前 reviews 字段存的是改变量）
    { idx: 4, show: false, text: '' },
  ];

  const Inner = (
    <div className="flex flex-col">
      {stages.map((s, i) => {
        const next = stages[i + 1];
        const conv = next && s.count > 0 ? Math.round((next.count / s.count) * 100) : null;
        const pctOfMax = Math.max(28, Math.round((s.count / maxW) * 100));
        const stageColor = STAGE_COLORS[i] || color;
        return (
          <div key={s.key}>
            <div className="relative flex items-center pr-1">
              <div
                className="flex items-center h-[34px] px-3.5 rounded-xl text-white font-semibold text-[13px] transition-all"
                style={{
                  width: `${pctOfMax}%`,
                  minWidth: '150px',
                  background: stageColor,  // 统一纯色，不再渐变（用户要求"统一一个颜色"）
                  boxShadow: `0 2px 6px ${stageColor}25`,
                }}>
                {/* 左：count — 大号数字（左端对齐） */}
                <span className="tabular-nums text-[16px] font-extrabold leading-none flex-shrink-0 mr-2">
                  {s.count}
                </span>
                {/* 右：label + sub */}
                <span className="flex items-center gap-2 flex-1 min-w-0 whitespace-nowrap overflow-hidden text-ellipsis">
                  <InlineEdit
                    value={s.label}
                    onChange={(v) => updateStageLabel(s.key, { label: v })}
                    onDelete={() => deleteStageLabel(s.key, 'label')}
                    mode="contextmenu"
                    className="font-bold flex-shrink-0"
                    inputClassName="text-ink-900 text-[13px] w-20"
                    title="右键编辑阶段名"
                    placeholder=""
                  />
                  <span className="text-[10px] opacity-75 whitespace-nowrap flex-shrink-0">
                    <InlineEdit
                      value={s.sub}
                      onChange={(v) => updateStageLabel(s.key, { sub: v })}
                      onDelete={() => deleteStageLabel(s.key, 'sub')}
                      mode="contextmenu"
                      className="text-[10px] opacity-95"
                      inputClassName="text-ink-900 text-[11px] w-14"
                      title="右键编辑备注"
                      placeholder=""
                    />
                  </span>
                </span>
              </div>
            </div>
            {/* 连接线 + 转化率 */}
            {next && (
              <div className="flex items-center py-1 pl-6 gap-1.5 text-[11px] whitespace-nowrap">
                <div className="flex flex-col items-center">
                  <div className="w-[2px] h-1.5 rounded-full" style={{ background: `${STAGE_COLORS[i]}88` }} />
                </div>
                <svg className="w-3 h-3 flex-shrink-0" style={{ color: STAGE_COLORS[i] }} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M12 5v14M5 12l7 7 7-7" strokeLinecap="round" strokeLinejoin="round"/></svg>
                <span className="font-bold tabular-nums px-2 py-px rounded-md flex-shrink-0"
                  style={{
                    color: STAGE_COLORS[Math.min(i + 1, 4)],
                    background: `${STAGE_COLORS[Math.min(i + 1, 4)]}12`,
                  }}>
                  {conv ?? 0}%
                </span>
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
              // 习惯标题不附带 emoji — 统一用 KR 风格的有序号展示，避免 emoji 字形/色值不一致
              label: h.name || '未命名习惯',
              name: h.name,
              emoji: h.emoji || '',
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
    // 精力：各习惯 val/target 完成率平均 → 与精力页 Hero 胶囊一致
    const energyVal = habits.length > 0
      ? habits.reduce((s, h) => s + pct(h.val, h.target), 0) / habits.length
      : 0;
    const books = (!dynamicBooks || dynamicBooks.length === 0) ? BOOKS : dynamicBooks;
    const booksDone = books.filter(b => b.st === 'done').length;
    // 知力：已读完 / 年度目标 12 本 → 与知力页 KR1 数量口径一致
    const cogVal = pct(booksDone, 12);
    const abilities = dynamicAbilities || ABILITY;
    // 能力：每个能力下里程碑pct平均值 → 与能力页 Hero 胶囊 abPct 一致
    const abilityVal = abilities.length > 0
      ? abilities.reduce((s, a) => {
          const ms = a.mstones.length > 0 ? a.mstones.reduce((t, m) => t + m.pct, 0) / a.mstones.length : 0;
          return s + ms;
        }, 0) / abilities.length
      : 0;
    const work = dynamicWork || WORK;
    // 工作：主+副所有KR的v/tgt完成率平均 → 与 WorkView Hero 胶囊 totalPct 一致
    const allKrs = work.flatMap(o => o.krs || []);
    const wkVal = allKrs.length > 0 ? allKrs.reduce((s, k) => s + pct(k.v, k.tgt), 0) / allKrs.length : 0;
    const life = dynamicLife || LIFE;
    // 生活：有记录的类目数/总类目数*100 → 与 LifeView Hero 胶囊 lifePct 一致
    const lifeVal = life.length > 0 ? (life.filter(c => c.entries.length > 0).length / life.length) * 100 : 0;
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
    <aside className="w-full lg:w-[260px] flex-shrink-0 flex lg:flex-col gap-2.5 lg:sticky lg:top-6 lg:max-h-[calc(100vh-48px)] overflow-y-auto overflow-x-hidden annual-sidebar">
      {/* Logo + 总进度环 · 宽屏完整 / 窄屏压缩为一行 */}
      <div className="glass-card p-4 lg:w-full">
        <div className="flex items-center gap-3 lg:w-full lg:mb-3">
          <div className="w-10 h-10 rounded-xl bg-brand-500 flex items-center justify-center text-white font-bold text-sm shadow-sm flex-shrink-0">
            {yy}
          </div>
          <div className="flex flex-col flex-1 min-w-0">
            <span className="text-sm font-bold text-ink-900 leading-tight whitespace-nowrap">{year} 年度规划</span>
            <span className="text-[11px] text-ink-500 mt-0.5 whitespace-nowrap">个人成长计划 · {ring}%</span>
          </div>
          {/* 窄屏：总进度环小圆徽章；宽屏：显示下方完整卡 */}
          <div className="lg:hidden relative w-10 h-10 flex-shrink-0">
            <svg viewBox="0 0 36 36" className="w-10 h-10 -rotate-90">
              <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" className="text-ink-100" strokeWidth="3"/>
              <circle cx="18" cy="18" r="15" fill="none" stroke="#4b63f0" strokeWidth="3"
                strokeDasharray={`${(ring / 100) * 94.2} 94.2`} strokeLinecap="round"/>
            </svg>
            <div className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-ink-900 tabular-nums">{ring}</div>
          </div>
        </div>
        <div className="hidden lg:flex items-center gap-3 p-3 rounded-xl bg-surface-soft border border-ink-100">
          <div className="relative w-14 h-14 flex-shrink-0">
            <svg viewBox="0 0 36 36" className="w-14 h-14 -rotate-90">
              <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" className="text-ink-100" strokeWidth="3"/>
              <circle cx="18" cy="18" r="15" fill="none" stroke="#4b63f0" strokeWidth="3"
                strokeDasharray={`${(ring / 100) * 94.2} 94.2`} strokeLinecap="round"/>
            </svg>
            <div className="absolute inset-0 flex items-center justify-center text-sm font-bold text-ink-900 tabular-nums">{ring}</div>
          </div>
          <div className="flex flex-col gap-1 min-w-0">
            <span className="text-xs text-ink-500">年度总进度</span>
            <span className="text-[13px] font-semibold text-ink-900 truncate">已完成 {ring}%</span>
          </div>
        </div>
      </div>

      {/* 导航 · 窄屏：横向Tab条可横滑；宽屏：竖向列 */}
      <div className="glass-card p-2 lg:flex-1 lg:flex lg:flex-col w-full overflow-x-auto lg:overflow-visible">
        <div className="hidden lg:block px-2.5 pt-1 pb-2 text-[10px] font-semibold uppercase tracking-wider text-ink-500">年度导航</div>
        <nav className="flex lg:flex-col gap-1 lg:gap-0.5 lg:px-1 lg:pb-1 min-w-max lg:min-w-0 annual-sidebar-nav">
          {SIDEBAR_ITEMS.map(item => {
            const on = active === item.key;
            const pctVal = item.cat ? Math.round(stats.perCat[CATEGORIES.findIndex(c => c.key === item.cat)]) : null;
            return (
              <button key={item.key} onClick={() => onChange(item.key)}
                className={[
                  'lg:w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-[13px] transition-all whitespace-nowrap flex-shrink-0 lg:flex-shrink',
                  on ? 'bg-brand-500 text-white font-semibold shadow-sm'
                     : 'text-ink-700 font-medium hover:bg-ink-100'
                ].join(' ')}>
                <span className={['w-6 h-6 rounded-md grid place-items-center flex-shrink-0',
                  on ? 'bg-white/15 text-white' : item.cat ? '' : 'bg-ink-100 text-ink-500'
                ].join(' ')}
                  style={item.cat && !on ? { background: `${item.catColor}10`, color: item.catColor } : undefined}>
                  {item.icon}
                </span>
                <span className="hidden lg:block flex-1 text-left truncate">{item.label}</span>
                {pctVal !== null && (
                  <span className={['hidden lg:inline-block text-[11px] font-bold tabular-nums',
                    on ? 'text-white/90' : 'text-ink-500'
                  ].join(' ')}>{pctVal}%</span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* 底部说明（仅宽屏） */}
      <div className="hidden lg:block px-2 text-[11px] text-ink-400 leading-relaxed">
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
  const LABEL_H = 16;     // 底部月份标签高度（从14→16，多出2px底部降阶通道防止字体baseline超出）
  // PAD 上下边距：严格控制折线顶部安全距离
  const PAD_T = 6;       // 顶部安全边距：保证折线顶点至少离 SVG 顶 6px，不撞上上方 KPI 数字
  const PAD_B = 4;       // 图表区底边距
  const EXTRA_BOTTOM = 2; // 额外底部空高（emoji/中文数字都有 1-2px descent，防止 SVG 裁剪）
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
    <div className="relative w-full" style={{ width, height: height + LABEL_H + EXTRA_BOTTOM, overflow: 'visible' }}>
      <svg
        ref={svgRef}
        width={width}
        height={height + LABEL_H + EXTRA_BOTTOM}
        style={{ cursor: 'pointer', overflow: 'visible', display: 'block' }}
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
        {/* 底部月份标签：1~当前月所有月份统一 fontWeight=700 bold；未来月保持 400 弱化
             🔝 修复：之前只有最后一个月加粗，1-7月视觉上被"降级"为次要信息，现在全部历史月份加粗，视觉权重完全一致 */}
        {labels && labels.length === data.length && pts.map((p, i) =>
          showIdx.has(i) && (() => {
            // i是0-based，对应月=i+1；只要是已发生的月份（非未来）就统一bold
            const isPastOrCur = (i + 1) <= (data.length); // 折线的 data 只包含 1月→当前月 真实数据
            const isLast = i === data.length - 1;
            const isHover = hoverIdx === i;
            return (
              <text key={'l'+i} x={p.x} y={labelY} textAnchor="middle"
                fontSize="11"
                fontWeight={isPastOrCur ? '700' : '400'}
                fill={isLast || isHover ? color : '#9ca3af'}
                style={{ fontFamily: 'ui-sans-serif, system-ui', fontVariantNumeric: 'tabular-nums' }}>
                {labels[i]}
              </text>
            );
          })()
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
  const dynBooks = (!books || books.length === 0) ? BOOKS : books;
  const dynAbilities = abilities || ABILITY;
  const dynWork = workGoals || WORK;
  const dynLife = lifeData || LIFE;
  const now = new Date();
  const curMonth = now.getMonth() + 1;
  const curDay = now.getDate();

  // 计算各模块的详细数据
  const energyStats = (() => {
    const totalVal = habits.reduce((s, h) => s + h.val, 0);
    const totalTarget = habits.reduce((s, h) => s + h.target, 0);
    const completedHabitDays = habits.reduce((s, h) => s + (h.month?.[curMonth] || 0), 0);
    return {
      totalVal,  // 累计打卡天数
      totalTarget,  // 年度目标天数
      completedHabitDays,  // 本月已打卡次数
      habitCount: habits.length,  // 习惯数量
    };
  })();

  const cognitionStats = (() => {
    const done = dynBooks.filter(b => b.st === 'done').length;
    const reading = dynBooks.filter(b => b.st === 'reading').length;
    const target = (COG_KRS[0]?.tgt) || 12; // 从 KR0 目标量获取年度目标值
    return { done, reading, target };
  })();

  const abilityStats = (() => {
    const totalMs = dynAbilities.reduce((s, a) => s + a.mstones.length, 0);
    const doneMs = dynAbilities.reduce((s, a) => s + a.mstones.filter(m => m.st === 'done').length, 0);
    return { totalMs, doneMs, abilityCount: dynAbilities.length };
  })();

  const workStats = (() => {
    const allKrs = dynWork.flatMap(o => o.krs || []);
    const doneKrs = allKrs.filter(k => k.st === 'done').length;
    const main = dynWork[0], side = dynWork[1];
    const mainPct = main && main.krs.length > 0 ? Math.round(main.krs.reduce((s,k)=>s+pct(k.v,k.tgt),0)/main.krs.length) : 0;
    const sidePct = side && side.krs.length > 0 ? Math.round(side.krs.reduce((s,k)=>s+pct(k.v,k.tgt),0)/side.krs.length) : 0;
    return { totalKrs: allKrs.length, doneKrs, mainPct, sidePct };
  })();

  const lifeStats = (() => {
    const total = dynLife.reduce((s, c) => s + c.entries.length, 0);
    const categoriesWithEntries = dynLife.filter(c => c.entries.length > 0).length;
    return { total, categoryCount: dynLife.length, categoriesWithEntries };
  })();

  // 年度总体数据
  const totalCheckins = energyStats.totalVal;
  const allGoalsDone = cognitionStats.done + abilityStats.doneMs + workStats.doneKrs;
  const endOfYear = new Date(year, 11, 31);
  const daysLeft = Math.max(0, Math.ceil((endOfYear - now) / 86400000));

  // 时间周期数据
  const getPeriodData = () => {
    const monthDaysInYear = [31,28,31,30,31,30,31,31,30,31,30,31];
    
    if (timeScale === 'week') {
      const dayOfWeek = now.getDay() || 7;
      const weekStart = curDay - dayOfWeek + 1;
      const weekEnd = Math.min(weekStart + 6, monthDaysInYear[curMonth - 1]);
      const weekCheckins = energyStats.completedHabitDays;
      const weekDaysLeft = Math.max(0, 7 - (curDay - weekStart + 1));
      return {
        periodLabel: `${curMonth}月${weekStart}-${weekEnd}日`,
        stat1: { label: '本周打卡', sub: '习惯完成', v: weekCheckins, u: '次', color: '#22c55e' },
        stat2: { label: '完成目标', sub: '书籍/里程碑/KR', v: allGoalsDone, u: '个', color: '#4b63f0' },
        stat3: { label: '剩余天数', sub: '本周', v: weekDaysLeft, u: '天', color: '#f59e0b' },
      };
    }
    if (timeScale === 'month') {
      const monthDaysLeft = Math.max(0, monthDaysInYear[curMonth - 1] - curDay);
      return {
        periodLabel: `${curMonth}月`,
        stat1: { label: '本月打卡', sub: '习惯完成', v: energyStats.completedHabitDays, u: '次', color: '#22c55e' },
        stat2: { label: '累计打卡', sub: '今年累计', v: totalCheckins, u: '天', color: '#4b63f0' },
        stat3: { label: '剩余天数', sub: '本月', v: monthDaysLeft, u: '天', color: '#f59e0b' },
      };
    }
    return {
      periodLabel: `${year}年度`,
      stat1: { label: '累计打卡', sub: '习惯完成天数', v: totalCheckins, u: '天', color: '#22c55e' },
      stat2: { label: '完成目标', sub: '书籍+里程碑+KR', v: allGoalsDone, u: '个', color: '#4b63f0' },
      stat3: { label: '今年剩余', sub: '距离年底', v: daysLeft, u: '天', color: '#f59e0b' },
    };
  };

  const tsData = getPeriodData();
  const perCat = stats.perCat;

  // 模块进度详细数据
  const getModuleProgress = (catKey) => {
    switch (catKey) {
      case 'energy': {
        const pct = Math.round(perCat[0]);
        const val = energyStats.totalVal;
        const target = energyStats.totalTarget;
        return { 
          pct, 
          completed: val, 
          target, 
          detail: `打卡 ${val}/${target}天`,
          status: pct >= 80 ? '达标' : pct >= 50 ? '推进中' : '需加速'
        };
      }
      case 'cognition': {
        const pct = Math.round(perCat[1]);
        return { 
          pct, 
          completed: cognitionStats.done, 
          target: cognitionStats.target, 
          detail: `读完 ${cognitionStats.done}/${cognitionStats.target}本，在读 ${cognitionStats.reading}本`,
          status: pct >= 80 ? '达标' : pct >= 50 ? '推进中' : '需加速'
        };
      }
      case 'ability': {
        const pct = Math.round(perCat[2]);
        return { 
          pct, 
          completed: abilityStats.doneMs, 
          target: abilityStats.totalMs, 
          detail: `完成里程碑 ${abilityStats.doneMs}/${abilityStats.totalMs}`,
          status: pct >= 80 ? '达标' : pct >= 50 ? '推进中' : '需加速'
        };
      }
      case 'work': {
        const pct = Math.round(perCat[3]);
        return { 
          pct, 
          completed: workStats.doneKrs, 
          target: workStats.totalKrs, 
          detail: `主业 ${workStats.mainPct}%，副业 ${workStats.sidePct}%`,
          status: pct >= 80 ? '达标' : pct >= 50 ? '推进中' : '需加速'
        };
      }
      case 'life': {
        const pct = Math.round(perCat[4]);
        return { 
          pct, 
          completed: lifeStats.categoriesWithEntries, 
          target: lifeStats.categoryCount, 
          detail: `记录 ${lifeStats.total} 条，覆盖 ${lifeStats.categoriesWithEntries}/${lifeStats.categoryCount} 类目`,
          status: pct >= 80 ? '达标' : pct >= 50 ? '推进中' : '需加速'
        };
      }
      default: return { pct: 0, completed: 0, target: 0, detail: '', status: '未知' };
    }
  };

  const scaleTabs = [
    { k: 'week', lb: '本周' },
    { k: 'month', lb: '本月' },
    { k: 'year', lb: '全年' },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* L1 玻璃卡片：年度进度总览 */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3.5">
            <span className="w-[5px] h-[18px] rounded-full flex-shrink-0" style={{ background: '#8b5cf6' }}></span>
            <span className="text-[16px] font-bold text-ink-900 leading-none">{year}年 · 年度规划总览</span>
            <div className="inline-flex p-0.5 rounded-lg bg-surface-soft border border-ink-100 ml-2">
              {scaleTabs.map(t => (
                <button key={t.k} onClick={() => onTimeScaleChange(t.k)}
                  className={[
                    'relative px-2.5 py-1 rounded-md text-[11px] font-bold transition',
                    timeScale === t.k
                      ? 'bg-white text-ink-900 shadow-sm'
                      : 'text-ink-400 hover:text-ink-600'
                  ].join(' ')}>
                  {t.lb}
                </button>
              ))}
            </div>
          </div>
          <span className="text-[12px] text-ink-500">{tsData.periodLabel}</span>
        </div>

        <div className="flex items-center gap-5">
          {/* 进度环 */}
          <div className="flex-shrink-0">
            <div className="relative w-[88px] h-[88px]">
              <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                <circle cx="18" cy="18" r="15" fill="none" stroke="#e5e5ea" strokeWidth="2.5"/>
                <circle cx="18" cy="18" r="15" fill="none" stroke="#8b5cf6" strokeWidth="2.5"
                  strokeDasharray={`${(stats.weighted / 100) * 94.2} 94.2`} strokeLinecap="round"/>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-bold text-ink-900 tabular-nums leading-none">{stats.weighted}%</span>
                <span className="text-[9px] text-ink-500 mt-0.5">整体完成率</span>
              </div>
            </div>
          </div>

          {/* 3关键指标 — 升级为带色条 + 图标的紧凑卡片 */}
          <div className="flex-1 grid grid-cols-3 gap-2">
            {[tsData.stat1, tsData.stat2, tsData.stat3].map(s => (
              <div key={s.label}
                className="relative flex flex-col gap-1 px-3 py-2 rounded-lg border border-ink-100 bg-white/60 overflow-hidden"
                style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
                {/* 左侧色条 */}
                <span className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: s.color }}></span>
                {/* 标签行：图标 + 标签 */}
                <div className="flex items-center gap-1.5 pl-1">
                  <span className="w-4 h-4 rounded grid place-items-center flex-shrink-0"
                    style={{ color: s.color, background: `${s.color}15` }}>
                    {s.color === '#22c55e' && (
                      <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    )}
                    {s.color === '#4b63f0' && (
                      <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    )}
                    {s.color === '#f59e0b' && (
                      <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2" strokeLinecap="round"/></svg>
                    )}
                  </span>
                  <span className="text-[10.5px] font-semibold text-ink-500 leading-none">{s.label}</span>
                </div>
                {/* 数值行 */}
                <div className="flex items-baseline gap-1 pl-1">
                  <span className="text-[22px] font-extrabold text-ink-900 tabular-nums leading-none">{s.v}</span>
                  <span className="text-[11px] font-medium text-ink-400 leading-none">{s.u}</span>
                </div>
                {/* 说明行 */}
                <div className="pl-1">
                  <span className="text-[10px] text-ink-400 leading-none">{s.sub}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* L2 玻璃卡片：模块进度 */}
      <div className="glass-card p-5">
        <div className="flex items-center gap-3.5 mb-4">
          <span className="w-[5px] h-[18px] rounded-full flex-shrink-0" style={{ background: '#8b5cf6' }}></span>
          <span className="text-[16px] font-bold text-ink-900 leading-none">模块进度</span>
          <span className="text-[11px] text-ink-400 ml-2">点击进入详情</span>
        </div>

        <div className="flex flex-col gap-2">
          {CATEGORIES.map((c, i) => {
            const progress = getModuleProgress(c.key);
            return (
              <button
                key={c.key}
                onClick={() => onNav(c.key)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-soft transition-colors text-left group border border-transparent hover:border-ink-100"
              >
                {/* 模块标识 */}
                <div className="flex items-center gap-2 w-[100px] flex-shrink-0">
                  <div className="w-5 h-5 rounded-md grid place-items-center flex-shrink-0"
                    style={{ color: c.color, background: `${c.color}15` }}>
                    <CategoryIcon catKey={c.key} className="w-3 h-3" />
                  </div>
                  <span className="text-[14px] font-semibold text-ink-900 truncate">{c.label}</span>
                </div>

                {/* 进度条 */}
                <div className="flex-1 min-w-0">
                  <div className="relative h-2 bg-ink-100 rounded-full overflow-hidden">
                    <div 
                      className="absolute inset-y-0 left-0 rounded-full transition-all"
                      style={{ 
                        width: `${Math.min(100, progress.pct)}%`,
                        backgroundColor: c.color 
                      }}
                    />
                  </div>
                </div>

                {/* 完成率 */}
                <div className="flex items-center gap-2 w-[140px] flex-shrink-0">
                  <span className="text-[14px] font-bold tabular-nums" style={{ color: c.color }}>{progress.pct}%</span>
                  <span className="text-[10px] text-ink-400 w-[50px] text-left">{progress.status}</span>
                </div>

                {/* 详情描述 */}
                <div className="text-[11px] text-ink-500 truncate flex-1 min-w-0">
                  {progress.detail}
                </div>

                {/* 箭头 */}
                <svg className="w-4 h-4 text-ink-300 group-hover:text-ink-500 transition flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            );
          })}
        </div>
      </div>
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
      const dynBooks = (!books || books.length === 0) ? BOOKS : books;
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
      {/* ========== Card 1 / 3：年度数据概览 ========== */}
      <div className="glass-card p-5 overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <span className="w-[5px] h-[18px] rounded-full bg-accent-green flex-shrink-0"></span>
            <span className="text-[16px] font-bold text-ink-900">{year}年 · 年度数据</span>
          </div>
          <button onClick={() => onAction?.('addHabit')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-accent-green/10 text-accent-green text-xs font-bold hover:bg-accent-green/15 transition">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" strokeLinecap="round"/></svg>
            添加
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {habits.map((h, hIdx) => {
            const yearlyPct = pct(h.val, h.target);
            const GREEN = '#22c55e';
            const GREEN_TEXT = '#22c55e';
            const padNum = String(hIdx + 1).padStart(2, '0');
            const EMOJI_STRIP_RE = new RegExp(String.raw`^\s*[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{1F000}-\u{1F02F}✅\u{2700}-\u{27BF}✅]\s*`, 'gu');
            const cleanLabel = (h.label || '').replace(EMOJI_STRIP_RE, '').trim() || h.label || '';

            const yearCounts = [];
            const yearMonthLabels = [];
            for (let m = 1; m <= curMonth; m++) {
              yearCounts.push(h.month?.[m] || 0);
              yearMonthLabels.push(`${m}`);
            }

            return (
              <div key={h.key}
                className="grid p-3 pb-1.5 rounded-2xl bg-white border border-ink-100 shadow-[0_1px_2px_rgba(17,24,39,0.03)] hover:shadow-[0_2px_6px_rgba(17,24,39,0.05)] transition-shadow h-[168px]"
                style={{ gridTemplateRows: 'auto 1fr' }}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <span
                      className="text-[12px] font-bold tabular-nums w-[24px] text-right flex-shrink-0 select-none leading-none"
                      style={{ color: GREEN }}>
                      {padNum}
                    </span>
                    <span className="text-[14px] font-semibold leading-none truncate flex-1 min-w-0 text-ink-700">
                      {cleanLabel}
                    </span>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0 min-w-[38%]">
                    <div className="flex items-baseline leading-none">
                      <span className="text-[16px] font-bold tabular-nums leading-none" style={{color: GREEN_TEXT}}>{yearlyPct}</span>
                      <span className="text-[12px] font-bold tabular-nums leading-none align-baseline ml-0.5" style={{color: GREEN_TEXT}}>%</span>
                    </div>
                    <div className="flex items-baseline leading-none">
                      <span className="text-[13px] font-semibold tabular-nums text-ink-700">{h.val}</span>
                      <span className="text-[13px] font-medium tabular-nums text-ink-400 mx-[4px]">/</span>
                      <span className="text-[13px] font-medium tabular-nums text-ink-500">{h.target}</span>
                      <span className="text-[13px] font-medium tabular-nums text-ink-400 ml-0.5 align-baseline">{h.unit}</span>
                    </div>
                  </div>
                </div>
                <div className="self-end mt-3 -mx-1 pb-0">
                  <Sparkline data={yearCounts} labels={yearMonthLabels} color={GREEN} width={260} height={60} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ========== Card 2 / 3：各月数据趋势 ========== */}
      <div className="glass-card p-5 overflow-hidden">
        <div className="grid habit-table px-0 py-2 bg-transparent text-[14px] font-semibold text-ink-700 mb-2">
          <div className="grp-start whitespace-nowrap overflow-hidden text-ellipsis flex items-center gap-2 mb-2">
            <span className="w-[5px] h-[18px] rounded-full bg-accent-green flex-shrink-0"></span>
            <span className="text-[16px] font-bold text-ink-900">{year}年 · 各月数据</span>
          </div>
          <div className="text-center whitespace-nowrap rate-gap">完成率</div>
          <div className="text-center whitespace-nowrap cum-gap">累计</div>
          <div className="text-center whitespace-nowrap grp-end">目标</div>
          {monthLabels.map((m, idx) => {
            const monthNum = idx + 1;
            const isCur = isCurrentMonth(monthNum);
            const isSelected = selectedMonth === monthNum;
            const isFuture = monthNum > curMonth;
            const boldClass = isFuture ? '' : 'font-bold';
            return (
              <button
                key={m}
                onClick={() => !isFuture && setSelectedMonth(monthNum)}
                disabled={isFuture}
                className={[
                  'text-center whitespace-nowrap tabular-nums transition-colors rounded px-1 py-0.5',
                  boldClass,
                  isSelected
                    ? 'text-accent-green bg-accent-green/10 cursor-pointer'
                    : isFuture
                      ? 'text-ink-300 cursor-not-allowed'
                      : 'text-ink-600 hover:text-accent-green hover:bg-accent-green/5 cursor-pointer'
                ].join(' ')}
              >
                {m}
              </button>
            );
          })}
        </div>
        <div className="space-y-0.5">
        {habits.map((h, hIdx) => {
          const p = pct(h.val, h.target);
          const GREEN = '#22c55e';
          const hkey = h.id || h.key;
          const isEditing = editingTargetKey === hkey;
          const padNum = String(hIdx + 1).padStart(2, '0');
          const EMOJI_STRIP_RE = new RegExp(String.raw`^\s*[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{1F000}-\u{1F02F}✅\u{2700}-\u{27BF}✅]\s*`, 'gu');
          const cleanLabel = (h.label || '').replace(EMOJI_STRIP_RE, '').trim() || h.label || '';
          return (
            <div key={hkey} className="grid habit-table px-0 py-1.5 items-center transition-colors group rounded-xl hover:bg-ink-50/60">
              <div className="flex items-center gap-1.5 min-w-0 cursor-pointer grp-start whitespace-nowrap overflow-hidden text-ellipsis pl-0" onClick={() => onAction?.('editHabit', h)}>
                <span
                  className="text-[12px] font-bold tabular-nums w-[24px] text-right flex-shrink-0 select-none leading-none"
                  style={{ color: GREEN }}>
                  {padNum}
                </span>
                <span className="text-[14px] font-semibold truncate leading-none text-ink-700">{cleanLabel}</span>
              </div>
              <div className="flex justify-center items-center cursor-pointer rate-gap" onClick={() => onAction?.('editHabit', h)}>
                {h.target > 0 ? (
                  <span
                    className="relative flex-shrink-0 rounded-[6px] grid place-items-center select-none h-[28px]"
                    style={{
                      width: '56px',
                      background: GREEN,
                      color: '#fff',
                      boxShadow: '0 1px 2px rgba(34,197,94,0.25)',
                    }}>
                    <span className="flex items-baseline leading-none">
                      <span className="text-[12px] font-bold tabular-nums">{p}</span>
                      <span className="text-[9px] font-semibold opacity-85 ml-[1px]">%</span>
                    </span>
                  </span>
                ) : (
                  <span className="text-[11px] text-ink-300 font-medium leading-none">未设置</span>
                )}
              </div>
              <div className="text-center font-semibold tabular-nums text-ink-700 text-[14px] cum-gap">{h.val}</div>
              <div className="text-center tabular-nums font-medium grp-end" onClick={(e) => e.stopPropagation()}>
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
                    className="w-16 mx-auto px-2 py-1 text-[14px] font-bold text-center border border-accent-green rounded-md outline-none focus:ring-2 focus:ring-accent-green/30 tabular-nums text-ink-900 bg-white"
                  />
                ) : (
                  <div onClick={() => startEditTarget(h)} className="inline-flex items-center justify-center gap-0 hover:bg-accent-green/8 rounded-md transition cursor-pointer px-2">
                    <span className="text-[14px] font-medium text-ink-500 tabular-nums text-center">{h.target}</span>
                    <span className="text-[12px] text-ink-500 ml-1">{h.unit}</span>
                  </div>
                )}
              </div>
              {monthIndices.map((monthIdx) => {
                const n = h.month?.[monthIdx] || 0;
                const isFuture = monthIdx > curMonth;
                const isCur = isCurrentMonth(monthIdx);
                let cellBg = '';
                let cellText = '';
                let cellBorder = '';
                let cellRing = '';
                if (n > 0) {
                  cellBg = 'bg-accent-green/15';
                  cellText = 'text-accent-green font-bold';
                } else if (isFuture) {
                  cellBg = 'bg-ink-50';
                  cellText = 'text-ink-300 font-semibold';
                  cellBorder = 'border border-ink-100';
                } else {
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
      </div>

      {/* ========== Card 3 / 3：当月打卡日历 ========== */}
      <div className="glass-card p-5 overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <span className="flex items-center gap-2">
            <span className="w-[5px] h-[18px] rounded-full bg-accent-green flex-shrink-0"></span>
            <span className="text-[16px] font-bold text-ink-900">{year}年 · {selectedMonth}月数据</span>
          </span>
          <div className="flex items-center gap-3 text-[12px] text-ink-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-[17px] h-[17px] rounded-md bg-accent-green/15 text-accent-green grid place-items-center" style={{border: '1px solid rgba(34,197,94,0.25)'}}>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </span>已打卡
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-[17px] h-[17px] rounded-md bg-ink-100 shadow-[0_0_0_1px_rgba(17,24,39,0.04)]"></span>未打卡
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-[17px] h-[17px] rounded-md bg-ink-50 border border-ink-200"></span>未开始
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-3.5">
          {habits.map((h, hidx) => {
            const daysTotal = monthMaxDays[selectedMonth - 1];
            const realDates = h.monthDates?.[selectedMonth];
            const completedDays = realDates
              ? realDates
              : new Set(Array.from({ length: h.month?.[selectedMonth] || 0 }, (_, i) => i + 1));
            const GREEN = '#22c55e';
            const padNum = String(hidx + 1).padStart(2, '0');
            const EMOJI_STRIP_RE = new RegExp(String.raw`^\s*[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{1F000}-\u{1F02F}✅\u{2700}-\u{27BF}✅]\s*`, 'gu');
            const cleanLabel = (h.label || '').replace(EMOJI_STRIP_RE, '').trim() || h.label || '';

            const YEAR_DAYS = 365;
            const monthWeight = daysTotal / YEAR_DAYS;
            const monthlyTarget = Math.max(1, Math.ceil((h.target || 0) * monthWeight));

            const doneCount = completedDays.size;
            const monthRate = monthlyTarget > 0 ? Math.min(100, Math.round((doneCount / monthlyTarget) * 100)) : 0;
            return (
              <div key={h.key}
                className="grid items-stretch"
                style={{ gridTemplateColumns: '145px 130px minmax(0, 1fr)', columnGap: '14px' }}>
                {/* 列①：标签列（145px 固定宽度） */}
                <div className="flex items-center gap-1.5 w-full">
                  <span
                    className="text-[12px] font-bold tabular-nums w-[24px] text-right flex-shrink-0 select-none leading-none"
                    style={{ color: GREEN }}>
                    {padNum}
                  </span>
                  <span className="text-[14px] font-semibold truncate leading-none text-ink-700 min-w-0 flex-1">
                    {cleanLabel}
                  </span>
                </div>
                {/* 列②：KPI列（%胶囊 + 累计数字 左端对齐） */}
                <div className="flex items-center justify-start gap-[10px] w-full h-full">
                  {monthlyTarget > 0 ? (
                    <>
                      <span
                        className="relative flex-shrink-0 rounded-[6px] grid place-items-center select-none h-full"
                        style={{
                          width: '56px',
                          background: GREEN,
                          color: '#fff',
                          boxShadow: '0 1px 2px rgba(34,197,94,0.25)',
                        }}>
                        <span className="flex items-baseline leading-none">
                          <span className="text-[12px] font-bold tabular-nums">{monthRate}</span>
                          <span className="text-[9px] font-semibold opacity-85 ml-[1px]">%</span>
                        </span>
                      </span>
                      <div className="flex items-baseline leading-none flex-shrink-0">
                        <span className="text-[12.5px] font-semibold tabular-nums text-ink-700">{doneCount}</span>
                        <span className="text-[12.5px] font-medium tabular-nums text-ink-400 mx-[3px]">/</span>
                        <span className="text-[12.5px] font-medium tabular-nums text-ink-500">{monthlyTarget}</span>
                        <span className="text-[12.5px] font-medium tabular-nums text-ink-400 ml-[2px]">{h.unit || '天'}</span>
                      </div>
                    </>
                  ) : (
                    <span className="text-[11px] text-ink-300 font-medium leading-none pl-1 self-center">未设置</span>
                  )}
                </div>
                {/* 列③：日历 */}
                <div className="flex-1 grid" style={{gridTemplateColumns: `repeat(${daysTotal}, minmax(0, 1fr))`, gap: '3px'}}>
                  {Array.from({ length: daysTotal }, (_, d) => {
                    const day = d + 1;
                    const isPast = selectedMonth < curMonth ? true : selectedMonth === curMonth ? day <= daysElapsedInCurMonth : false;
                    const isToday = selectedMonth === curMonth && day === daysElapsedInCurMonth;
                    const checked = completedDays.has(day);
                    let cellBg = '';
                    let cellText = '';
                    let cellRing = '';
                    let cellBorder = '';
                    if (checked) {
                      cellBg = 'bg-accent-green/15 text-accent-green';
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
  );
}

/* ---------- 7.4 表单 · KR（BookForm 风格共享组件：Section 分组 + 白底输入框） ---------- */
function KrFormFields({ lb, tgt, u, sub, onChange }) {
  const BLUE_DARK = '#0056b8';
  const inputCls = "w-full px-2.5 py-1.5 text-[12.5px] rounded-[10px] focus:outline-none transition";
  const inputStyle = { background: '#fff', border: '1px solid rgba(15,23,42,0.08)' };
  const SectionCard = ({ title, children }) => (
    <div style={{ padding: '10px 12px', background: 'rgba(240,244,248,0.5)', border: '1px solid rgba(15,23,42,0.08)', borderRadius: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', fontSize: '11px', fontWeight: 700, color: BLUE_DARK, letterSpacing: '0.06em' }}>
        <div style={{ width: '3px', height: '11px', borderRadius: '2px', background: BLUE_DARK }} />
        {title}
      </div>
      {children}
    </div>
  );
  return (
    <div className="flex flex-col gap-2.5">
      <SectionCard title="KR 设置">
        <div className="flex flex-col gap-1.5">
          <span className="text-[10.5px] font-semibold" style={{ color: '#1c1c1e', opacity: 0.55 }}>KR 描述</span>
          <input value={lb} onChange={(e) => onChange({ lb: e.target.value })}
            placeholder="如：读完12本书" className={inputCls} style={inputStyle} />
        </div>
        <div className="grid grid-cols-2 gap-2 mt-2.5">
          <div className="flex flex-col gap-1">
            <span className="text-[10.5px] font-semibold" style={{ color: '#1c1c1e', opacity: 0.55 }}>目标值</span>
            <input type="number" value={tgt} onChange={(e) => onChange({ tgt: Number(e.target.value) })}
              placeholder="12" className={inputCls + " tabular-nums"} style={inputStyle} />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10.5px] font-semibold" style={{ color: '#1c1c1e', opacity: 0.55 }}>单位</span>
            <input value={u} onChange={(e) => onChange({ u: e.target.value })}
              placeholder="本" className={inputCls} style={inputStyle} />
          </div>
        </div>
      </SectionCard>
      <SectionCard title="备注（可选）">
        <input value={sub} onChange={(e) => onChange({ sub: e.target.value })}
          placeholder="如：书架系统追踪" className={inputCls} style={inputStyle} />
      </SectionCard>
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
  const BTN_P = { padding: '8px 16px', borderRadius: 9, border: 'none', background: '#007aff', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
  const BTN_G = { padding: '8px 16px', borderRadius: 9, border: '1px solid rgba(15,23,42,0.1)', background: 'transparent', color: '#8e8e93', fontSize: 13, fontWeight: 500, cursor: 'pointer' };
  const BTN_D = { padding: '8px 16px', borderRadius: 9, border: 'none', background: '#ef4444', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* 来源观点选择 */}
      <div>
        <label style={LABEL}>来源观点（强共鸣 ≥7 分优先）</label>
        {allInsights.length === 0 ? (
          <div style={{ padding: 10, textAlign: 'center', fontSize: 12, color: '#8a9491', background: 'rgba(248,250,252,0.6)', borderRadius: 8, border: '1px dashed rgba(148,163,184,0.3)' }}>
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

/* ---------- 7.6 表单 · 改变（结果区）---------- */
function ReviewForm({ initial, books, onSave, onCancel, onDelete }) {
  // 旧标签迁移：一次性决策 → 认知更新，已固化SOP → 已内化
  const migrateTag = (t) => (t === 'decision' ? 'cognition' : t === 'sop' ? 'internalized' : (t || 'cognition'));
  const [form, setForm] = useState({
    text: initial?.text || '',
    bookTitle: initial?.bookTitle || '',
    beforeState: initial?.beforeState || '',
    afterState: initial?.afterState || '',
    nextStep: initial?.nextStep || '',
    practiceEffect: initial?.practiceEffect || '',
    tag: migrateTag(initial?.tag),
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // 关联书籍搜索下拉
  const [bookFocused, setBookFocused] = useState(false);
  const bookQuery = form.bookTitle.trim().toLowerCase();
  const bookSuggestions = bookFocused
    ? (books || [])
        .filter(b => bookQuery ? (b.t || '').toLowerCase().includes(bookQuery) : true)
        .slice(0, 5)
    : [];

  const LABEL = { fontSize: 12, fontWeight: 600, color: '#1c1c1e', display: 'block', marginBottom: 3 };
  const INPUT = { width: '100%', padding: '6px 9px', borderRadius: 9, border: '1px solid rgba(15,23,42,0.08)', fontSize: 12.5, outline: 'none', background: '#fff', lineHeight: 1.5 };
  const INPUT_TITLE = { ...INPUT, fontSize: 14, fontWeight: 600, color: '#1c1c1e', padding: '9px 12px', border: '1.5px solid rgba(0,122,255,0.35)', boxShadow: '0 0 0 3px rgba(0,122,255,0.06)' };
  const INPUT_OPT = { ...INPUT, border: '1px dashed rgba(148,163,184,0.5)', background: 'rgba(248,250,252,0.6)' };
  const BTN_P = { padding: '8px 16px', borderRadius: 9, border: 'none', background: '#007aff', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
  const BTN_G = { padding: '8px 16px', borderRadius: 9, border: '1px solid rgba(15,23,42,0.1)', background: 'transparent', color: '#8e8e93', fontSize: 13, fontWeight: 500, cursor: 'pointer' };
  const BTN_D = { padding: '8px 16px', borderRadius: 9, border: '1px solid rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.08)', color: '#ef4444', fontSize: 13, fontWeight: 600, cursor: 'pointer' };

  const TAGS = [
    { v: 'cognition', lb: '认知更新' },
    { v: 'habit', lb: '长期习惯' },
    { v: 'internalized', lb: '已内化' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      {/* 主字段：改变名称 */}
      <div>
        <label style={LABEL}>改变名称</label>
        <input style={INPUT_TITLE} value={form.text} autoFocus
          onChange={e => set('text', e.target.value)}
          placeholder="例：建立每日 5 分钟复盘习惯｜接纳情绪不内耗" />
      </div>
      {/* 关联书籍 / 观点 */}
      <div>
        <label style={LABEL}>关联书籍 / 观点（可选）</label>
        <div style={{ position: 'relative' }}>
          <input style={INPUT} value={form.bookTitle}
            onChange={e => set('bookTitle', e.target.value)}
            onFocus={() => setBookFocused(true)}
            onBlur={() => setBookFocused(false)}
            placeholder="填写书名 / 书中原文观点，可留空" />
          {bookSuggestions.length > 0 && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, marginTop: 4,
              background: '#fff', borderRadius: 10, border: '1px solid rgba(15,23,42,0.08)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.10)', overflow: 'hidden',
            }}>
              {bookSuggestions.map(b => (
                <button key={b.id} type="button"
                  onMouseDown={e => { e.preventDefault(); set('bookTitle', b.t); setBookFocused(false); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                    padding: '8px 10px', background: 'transparent', border: 'none',
                    cursor: 'pointer', textAlign: 'left',
                  }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: '#1c1c1e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.t}</span>
                  {b.author && <span style={{ flexShrink: 0, fontSize: 11, color: '#8e8e93' }}>{b.author}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {/* 改变前 / 改变后 · 对仗并排 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <label style={LABEL}>改变前（旧状态）</label>
          <textarea style={{ ...INPUT, minHeight: 56, resize: 'none' }} value={form.beforeState}
            onChange={e => set('beforeState', e.target.value)}
            placeholder="读书之前，我是什么状态，存在什么困扰？" />
        </div>
        <div>
          <label style={LABEL}>改变后（认知 / 行为变化）</label>
          <textarea style={{ ...INPUT, minHeight: 56, resize: 'none' }} value={form.afterState}
            onChange={e => set('afterState', e.target.value)}
            placeholder="读完书实践之后，我的认知、行为发生了哪些变化？" />
        </div>
      </div>
      {/* 落地巩固 / 实践效果 · 可选补充并排 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <label style={LABEL}>落地巩固</label>
          <textarea style={{ ...INPUT_OPT, minHeight: 44, resize: 'none' }} value={form.nextStep}
            onChange={e => set('nextStep', e.target.value)}
            placeholder="如何持续实践？打算做哪些具体行动？" />
        </div>
        <div>
          <label style={LABEL}>实践效果（可选）</label>
          <textarea style={{ ...INPUT_OPT, minHeight: 44, resize: 'none' }} value={form.practiceEffect}
            onChange={e => set('practiceEffect', e.target.value)}
            placeholder="实际执行后的真实感受，哪些有用、哪些行不通。" />
        </div>
      </div>
      <div>
        <label style={LABEL}>标签</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {TAGS.map(t => (
            <button key={t.v} type="button" onClick={() => set('tag', t.v)}
              style={{
                flex: 1, padding: '7px 0', borderRadius: 9, fontSize: 12, fontWeight: 600,
                background: form.tag === t.v ? `rgba(0,122,255,0.10)` : 'rgba(120,120,128,0.08)',
                color: form.tag === t.v ? "#007aff" : '#8e8e93',
                border: form.tag === t.v ? `1px solid rgba(0,122,255,0.25)` : '1px solid transparent',
                cursor: 'pointer',
              }}>{t.lb}</button>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, paddingTop: 4 }}>
        <div>{onDelete && <button onClick={() => onDelete?.(initial.id)} style={BTN_D}>删除</button>}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onCancel} style={BTN_G}>取消</button>
          <button onClick={() => {
            if (!form.text.trim()) return alert('请填写改变名称');
            onSave?.({ ...form, text: form.text.trim(), id: initial.id });
          }} style={BTN_P}>保存</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- 7.6.1 选书面板 · 为读后思考/思后行动选目标书籍 ---------- */
function BookPickerModal({ mode, books, onPick, onAddNew, onClose }) {
  const [q, setQ] = useState('');
  const isInsights = mode === 'insights';
  const list = (books || []).filter(b => !q.trim() || (b.t || '').toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <Modal open onClose={onClose} title={isInsights ? '添加读后思考' : '添加行动计划'}
      footer={
        <button onClick={onAddNew}
          className="px-4 py-1.5 text-[13px] rounded-[10px] transition"
          style={{ background: 'rgba(0,122,255,0.10)', border: '1px solid rgba(0,122,255,0.25)', color: '#007aff' }}>
          + 新增书籍
        </button>
      }>
      <div className="flex flex-col gap-3">
        <div className="text-[12px] text-ink-500 leading-relaxed px-0.5">
          思考与行动都挂在书籍上，选择一本书继续：
        </div>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="搜索书名…"
          className="px-3 py-2 text-[13px] rounded-[10px] focus:outline-none transition"
          style={{ background: '#fff', border: '1px solid rgba(15,23,42,0.08)' }} />
        {list.length === 0 ? (
          <div className="py-8 text-center text-[12px] text-ink-400"
            style={{ background: 'rgba(15,23,42,0.032)', borderRadius: 12, border: '1px dashed rgba(148,163,184,0.35)' }}>
            {q.trim() ? '没有匹配的书籍' : '书架还没有书籍'}<br/>点击下方「+ 新增书籍」开始
          </div>
        ) : (
          <div className="flex flex-col gap-1 max-h-[40vh] overflow-y-auto pr-0.5">
            {list.map(b => {
              const cnt = isInsights
                ? (b.insights || []).filter(i => i.text?.trim() && i.scene?.trim()).length
                : (b.actions || []).filter(a => a.text?.trim()).length;
              return (
                <button key={b.id} onClick={() => onPick(b)}
                  className="flex items-center gap-2.5 px-2.5 py-2 rounded-[10px] transition text-left hover:bg-[rgba(0,122,255,0.05)]"
                  style={{ background: '#fff', border: '1px solid rgba(15,23,42,0.08)' }}>
                  <svg className="w-[15px] h-[15px] flex-shrink-0" fill="none" stroke="#007aff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z"/>
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                  </svg>
                  <span className="text-[13px] font-semibold text-ink-900 truncate flex-1 min-w-0">{b.t}</span>
                  {b.author && <span className="text-[11px] text-ink-400 flex-shrink-0 truncate max-w-[90px]">{b.author}</span>}
                  <span className="text-[10px] font-semibold px-1.5 rounded-md flex-shrink-0"
                    style={{ background: 'rgba(0,122,255,0.10)', color: '#007aff' }}>
                    {isInsights ? `${cnt}组` : `${cnt}条`}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ---------- 7.7 表单 · 能力月度自评（批量）---------- */
function AbilityAssessmentForm({ abilities, scoreHistory, onSave, onCancel }) {
  const curYM = new Date().toISOString().slice(0, 7);
  const curMonth = Number(curYM.slice(5, 7));
  const curYear = Number(curYM.slice(0, 4));
  const dynAb = abilities || [];

  const [scores, setScores] = useState(() => {
    const s = {};
    dynAb.forEach((a, i) => {
      const abId = a.id || a.title;
      const hist = scoreHistory?.[abId] || {};
      s[i] = hist[curYM] !== undefined ? Number(hist[curYM]) : (Number(a.score) || 5);
    });
    return s;
  });
  const [notes, setNotes] = useState(() => {
    const n = {};
    dynAb.forEach((_, i) => { n[i] = ''; });
    return n;
  });

  const scoreColor = (n) => {
    n = Number(n) || 0;
    if (n >= 9) return '#22c55e';
    if (n >= 6) return '#f59e0b';
    return '#ef4444';
  };
  const scoreLabel = (n) => {
    n = Number(n) || 0;
    if (n >= 9) return '优秀';
    if (n >= 7.5) return '良好';
    if (n >= 6) return '进行中';
    if (n >= 4) return '待提升';
    return '待启动';
  };

  const avg = Math.round((Object.values(scores).reduce((s, v) => s + Number(v), 0) / Math.max(1, Object.values(scores).length)) * 10) / 10;

  // 计算相比上月的变化
  const prevDelta = (idx) => {
    const a = dynAb[idx]; if (!a) return null;
    const abId = a.id || a.title;
    const hist = scoreHistory?.[abId] || {};
    const prevM = curMonth === 1 ? 12 : curMonth - 1;
    const prevY = curMonth === 1 ? curYear - 1 : curYear;
    const prevYM = `${prevY}-${String(prevM).padStart(2, '0')}`;
    const prev = hist[prevYM];
    if (prev === undefined || prev === null) return null;
    return Number(scores[idx]) - Number(prev);
  };

  const LABEL = { fontSize: 13, fontWeight: 600, color: '#1c1c1e', display: 'block', marginBottom: 4 };
  const BTN_P = { padding: '8px 16px', borderRadius: 9, border: 'none', background: '#f59e0b', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
  const BTN_G = { padding: '8px 16px', borderRadius: 9, border: '1px solid rgba(15,23,42,0.1)', background: 'transparent', color: '#8e8e93', fontSize: 13, fontWeight: 500, cursor: 'pointer' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 顶部说明 */}
      <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.18)', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <svg style={{ width: 18, height: 18, color: '#f59e0b', flexShrink: 0, marginTop: 1 }} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <div style={{ fontSize: 12, lineHeight: 1.55, color: '#78350f' }}>
          <b>{curYear}年{curMonth}月 · 能力自评</b>：客观评估本月自己在每项能力上的实际水平（0-10分），<br />对比上月看趋势，作为下月的行动锚点。
        </div>
      </div>

      {/* 能力列表 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {dynAb.map((a, i) => {
          const sc = Number(scores[i]) || 0;
          const c = scoreColor(sc);
          const delta = prevDelta(i);
          return (
            <div key={i} style={{ padding: '12px 12px 14px', borderRadius: 12, border: '1px solid rgba(15,23,42,0.08)', background: '#fff' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#1c1c1e', marginBottom: 3 }}>{a.title}</div>
                  <div style={{ fontSize: 11.5, color: '#6b7280', lineHeight: 1.45 }}>每日：{a.daily}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
                    <span style={{ fontSize: 22, fontWeight: 800, color: c, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{sc}</span>
                    <span style={{ fontSize: 12, color: c, opacity: .7 }}>/10</span>
                  </div>
                  <div style={{ marginTop: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: c }}>{scoreLabel(sc)}</span>
                    {delta !== null && (
                      <span style={{
                        fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                        color: delta > 0 ? '#22c55e' : delta < 0 ? '#ef4444' : '#8e8e93',
                      }}>
                        {delta > 0 ? '▲' : delta < 0 ? '▼' : '—'}{Math.abs(delta) > 0 ? Math.abs(delta) : ''}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {/* 滑块 */}
              <input
                type="range" min="0" max="10" step="0.5" value={sc}
                onChange={e => setScores(prev => ({ ...prev, [i]: Number(e.target.value) }))}
                style={{ width: '100%', accentColor: c }}
              />
              {/* 刻度标记 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3, fontSize: 10, color: '#9ca3af', fontWeight: 600, padding: '0 1px' }}>
                <span>0</span><span>2</span><span>4</span><span>6</span><span>8</span><span>10</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* 汇总 + 按钮 */}
      <div style={{ padding: '12px', borderRadius: 12, background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#92400e', marginBottom: 2 }}>综合自评</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
            <span style={{ fontSize: 24, fontWeight: 800, color: '#f59e0b', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{avg}</span>
            <span style={{ fontSize: 13, color: '#92400e', opacity: .8 }}>/10</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onCancel} style={BTN_G}>取消</button>
          <button onClick={() => onSave?.(scores, notes)} style={BTN_P}>确认 · 保存本月自评</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- 7.8 表单 · 工作风险KR→微动作拆解器 ---------- */
function RiskBreakdownForm({ kr, goal, riskInfo, existingActions, onSave, onCancel, onKrProgressAdd }) {
  // kr: {t, v, tgt, ...}  goal: {title, deadline, start}  riskInfo: {q, label, color, diff, kPct, timePct, daysLeft}
  const curToday = new Date(); curToday.setHours(0,0,0,0);
  const formatDate = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
  const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };

  const gap = Math.max(0, Number(kr.tgt) - Number(kr.v));
  const urgencyDays = Math.max(1, Number(riskInfo.daysLeft) >= 0 ? Number(riskInfo.daysLeft) : 7);
  // 每日最低完成量（向上取整到保留1位）
  const perDayRaw = gap / urgencyDays;
  const perDay = perDayRaw >= 10 ? Math.ceil(perDayRaw) : perDayRaw >= 1 ? Math.ceil(perDayRaw * 10) / 10 : perDayRaw;

  // 自动生成微动作模板
  const genTemplates = () => {
    const tpls = [];
    const unit = (kr.t.match(/\(([^)]+)\)/) || [, ''])[1] || '次';
    // 接下来3天突击
    tpls.push({
      text: `未来3天每天完成 ${Math.max(1, Math.round(perDay * 1.5))}${unit}，追赶落后进度`,
      deadline: formatDate(addDays(curToday, 2)),
      ddlOffset: 2,
    });
    // 固定节律动作
    tpls.push({
      text: `之后每天稳定完成至少 ${perDay}${unit}，不低于时间进度（${riskInfo.timePct}%→${Math.min(100, riskInfo.timePct + 15)}%）`,
      deadline: formatDate(addDays(curToday, urgencyDays - 1)),
      ddlOffset: urgencyDays - 1,
    });
    // 周末加码
    const weekend = [0, 6].includes(curToday.getDay());
    tpls.push({
      text: `${weekend ? '本周末' : '下个周末'}额外冲刺 ${Math.max(1, Math.round(perDay * 4))}${unit}（补缺口）`,
      deadline: formatDate(addDays(curToday, (6 - curToday.getDay() + 7) % 7 || 7)),
      ddlOffset: (6 - curToday.getDay() + 7) % 7 || 7,
    });
    // 问责机制
    tpls.push({
      text: '设置每日晚10点闹钟改变当日进度，若未达标说明障碍并调整次日',
      deadline: formatDate(addDays(curToday, urgencyDays - 1)),
      ddlOffset: urgencyDays - 1,
    });
    return tpls;
  };

  const [actions, setActions] = useState(() => {
    if (existingActions && existingActions.length > 0) {
      return existingActions.map(a => ({ ...a }));
    }
    return genTemplates().map(t => ({ id: uid(), text: t.text, deadline: t.deadline, ddlOffset: t.ddlOffset, done: false, createdAt: Date.now() }));
  });

  const [newAct, setNewAct] = useState('');

  const doneCount = actions.filter(a => a.done).length;
  const donePct = actions.length > 0 ? Math.round((doneCount / actions.length) * 100) : 0;

  // 根据gap与urgency推算一条可以立即推进的建议增量（用于onKrProgressAdd快速推进v值）
  const quickBoost = Math.min(gap, Math.max(1, Math.round(perDay)));

  const LABEL = { fontSize: 13, fontWeight: 600, color: '#1c1c1e', display: 'block', marginBottom: 4 };
  const BTN_P = { padding: '8px 16px', borderRadius: 9, border: 'none', background: '#ef4444', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
  const BTN_G = { padding: '8px 16px', borderRadius: 9, border: '1px solid rgba(15,23,42,0.1)', background: 'transparent', color: '#8e8e93', fontSize: 13, fontWeight: 500, cursor: 'pointer' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* 风险诊断头 */}
      <div style={{ padding: '12px', borderRadius: 12, background: `${riskInfo.color}0d`, border: `1px solid ${riskInfo.color}26`, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10, background: `${riskInfo.color}1a`, color: riskInfo.color,
          display: 'grid', placeItems: 'center', flexShrink: 0,
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 9v4m0 4h.01M10.3 3.86 1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 11.5, fontWeight: 800, letterSpacing: .3,
              padding: '3px 8px', borderRadius: 7, background: `${riskInfo.color}1a`, color: riskInfo.color,
            }}>{riskInfo.label} · 完成{riskInfo.kPct}% vs 时间{riskInfo.timePct}%</span>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: '#78350f' }}>
              差距 <b style={{ color: riskInfo.color }}>—{Math.abs(riskInfo.diff)}%</b>，剩余 <b>{riskInfo.daysLeft}</b> 天
            </span>
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1c1c1e', lineHeight: 1.4 }}>{kr.t}</div>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4, lineHeight: 1.45 }}>
            当前 <b style={{ color: '#1c1c1e' }}>{kr.v}</b> / 目标 <b style={{ color: '#1c1c1e' }}>{kr.tgt}</b>，
            还差 <b style={{ color: riskInfo.color }}>{gap}</b>，日均需至少 <b style={{ color: riskInfo.color }}>{perDay}</b>（建议 <b>×1.5</b> 留出缓冲）。
          </div>
        </div>
      </div>

      {/* 微动作清单 */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <label style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#1c1c1e' }}>微动作拆解 · 已完成 {doneCount}/{actions.length}（{donePct}%）</label>
          <button
            type="button"
            onClick={() => onKrProgressAdd?.(quickBoost)}
            style={{
              padding: '5px 10px', borderRadius: 8, border: `1px solid ${riskInfo.color}33`,
              background: `${riskInfo.color}0d`, color: riskInfo.color, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
            }}>
            +{quickBoost} 快速推进进度
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {actions.map((a, i) => (
            <div key={a.id} style={{
              padding: '9px 10px', borderRadius: 10,
              border: a.done ? '1px solid rgba(34,197,94,0.2)' : '1px solid rgba(15,23,42,0.08)',
              background: a.done ? 'rgba(34,197,94,0.04)' : '#fff',
              display: 'flex', alignItems: 'flex-start', gap: 9,
            }}>
              <input
                type="checkbox" checked={!!a.done}
                onChange={() => setActions(prev => prev.map(x => x.id === a.id ? { ...x, done: !x.done } : x))}
                style={{ width: 16, height: 16, marginTop: 1, accentColor: '#ef4444', flexShrink: 0 }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 12.5, fontWeight: 600, lineHeight: 1.45,
                  color: a.done ? '#86efac' : '#1c1c1e',
                  textDecoration: a.done ? 'line-through' : 'none',
                }}>{a.text}</div>
                <div style={{ marginTop: 3, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 10.5, fontWeight: 600, color: '#8e8e93' }}>截止 {a.deadline}</span>
                </div>
              </div>
              <button
                type="button" title="删除"
                onClick={() => setActions(prev => prev.filter(x => x.id !== a.id))}
                style={{ background: 'transparent', border: 'none', color: '#cbd5e1', cursor: 'pointer', padding: 2, fontSize: 16, lineHeight: 1 }}
              >×</button>
            </div>
          ))}
        </div>
        {/* 新增一条 */}
        <div style={{ marginTop: 9, display: 'flex', gap: 8 }}>
          <input
            type="text" placeholder="或手动添加一个微动作..." value={newAct}
            onChange={e => setNewAct(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && newAct.trim()) {
                setActions(prev => [...prev, { id: uid(), text: newAct.trim(), deadline: formatDate(addDays(curToday, 3)), ddlOffset: 3, done: false, createdAt: Date.now() }]);
                setNewAct('');
              }
            }}
            style={{
              flex: 1, padding: '7px 10px', borderRadius: 9, border: '1px solid rgba(15,23,42,0.08)',
              fontSize: 12.5, outline: 'none', background: '#fff',
            }}
          />
          <button
            type="button"
            onClick={() => {
              if (!newAct.trim()) return;
              setActions(prev => [...prev, { id: uid(), text: newAct.trim(), deadline: formatDate(addDays(curToday, 3)), ddlOffset: 3, done: false, createdAt: Date.now() }]);
              setNewAct('');
            }}
            style={{ padding: '7px 12px', borderRadius: 9, border: 'none', background: 'rgba(15,23,42,0.06)', color: '#374151', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >添加</button>
        </div>
      </div>

      {/* 按钮 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, paddingTop: 2 }}>
        <div>
          {existingActions && existingActions.length > 0 && (
            <button
              type="button"
              onClick={() => setActions(genTemplates().map(t => ({ id: uid(), text: t.text, deadline: t.deadline, ddlOffset: t.ddlOffset, done: false, createdAt: Date.now() })))}
              style={{ padding: '8px 14px', borderRadius: 9, border: 'none', background: 'transparent', color: '#8e8e93', fontSize: 12, fontWeight: 500, cursor: 'pointer', textDecoration: 'underline' }}
            >重置为模板建议</button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onCancel} style={BTN_G}>取消</button>
          <button onClick={() => onSave?.(actions)} style={BTN_P}>保存拆解方案</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- 7.9 表单 · 生活年度精选 + 记忆卡预览 ---------- */
function LifeHighlightsForm({ lifeData, highlightedIds, onToggleHighlight, onSave, onCancel }) {
  const year = new Date().getFullYear();
  const dynLife = lifeData || LIFE;
  const allEntries = useMemo(() => {
    const arr = [];
    dynLife.forEach((c, ci) => {
      (c.entries || []).forEach((e, ei) => {
        arr.push({ ...e, catKey: c.key, catLb: c.lb, catColor: c.color, ci, ei, catIdx: ci });
      });
    });
    // 默认排序：按日期字符串倒序（近的在前）
    return arr.sort((a, b) => String(b.d || '').localeCompare(String(a.d || '')));
  }, [dynLife]);

  const isHl = (id) => Array.isArray(highlightedIds) && highlightedIds.includes(id);
  const currentHl = allEntries.filter(e => isHl(e.id));
  const topAuto = allEntries.slice(0, 6); // 自动推荐前6条（按日期）

  const autoSelectRecommended = () => {
    const set = new Set(highlightedIds || []);
    topAuto.forEach(e => e.id && set.add(e.id));
    onSave?.(Array.from(set));
  };

  const BTN_P = { padding: '8px 16px', borderRadius: 9, border: 'none', background: 'linear-gradient(135deg,#8b5cf6,#ec4899)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', boxShadow: '0 1px 3px rgba(139,92,246,0.25)' };
  const BTN_G = { padding: '8px 16px', borderRadius: 9, border: '1px solid rgba(15,23,42,0.1)', background: 'transparent', color: '#8e8e93', fontSize: 13, fontWeight: 500, cursor: 'pointer' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* 顶部说明 */}
      <div style={{ padding: '12px', borderRadius: 12, background: 'linear-gradient(135deg, rgba(139,92,246,0.08) 0%, rgba(236,72,153,0.08) 100%)', border: '1px solid rgba(139,92,246,0.18)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: 'linear-gradient(135deg,#8b5cf6,#ec4899)', color: '#fff',
          display: 'grid', placeItems: 'center', flexShrink: 0, boxShadow: '0 2px 6px rgba(139,92,246,0.3)',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1c1c1e', marginBottom: 4 }}>{year} 年度精选 · 记忆卡生成</div>
          <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.5 }}>
            选择 <b style={{ color: '#8b5cf6' }}>3–9 条</b> 最珍贵的生活片段，下面会实时生成一张今年的专属记忆卡预览。
            已选 <b>{currentHl.length}</b> / 共 <b>{allEntries.length}</b> 条可挑选。
          </div>
        </div>
      </div>

      {/* 记忆卡预览 */}
      <div>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: '#1c1c1e', marginBottom: 8 }}>🪄 记忆卡预览</div>
        <div style={{
          borderRadius: 16, padding: 20, position: 'relative', overflow: 'hidden',
          background: 'linear-gradient(160deg, #f5f3ff 0%, #fdf4ff 45%, #fff1f2 100%)',
          border: '1px solid rgba(139,92,246,0.15)',
          boxShadow: '0 4px 16px rgba(139,92,246,0.1)',
        }}>
          {/* 装饰光斑 */}
          <div style={{ position: 'absolute', top: -40, right: -30, width: 180, height: 180, borderRadius: 999, background: 'radial-gradient(circle, rgba(236,72,153,0.22), transparent 60%)' }} />
          <div style={{ position: 'absolute', bottom: -50, left: -30, width: 180, height: 180, borderRadius: 999, background: 'radial-gradient(circle, rgba(139,92,246,0.22), transparent 60%)' }} />

          <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="#8b5cf6"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
              <span style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: 1.5, color: '#8b5cf6' }}>{year} · 我的珍藏年卡</span>
            </div>
            {currentHl.length === 0 ? (
              <div style={{
                padding: '22px 14px', textAlign: 'center', borderRadius: 12,
                border: '1px dashed rgba(139,92,246,0.35)', color: '#7c3aed', fontSize: 12, fontWeight: 600,
              }}>
                还没有选中条目 · 点击下方卡片右下角的星号，或一键推荐。
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {currentHl.slice(0, 9).map(e => (
                  <div key={e.id} style={{
                    padding: '9px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.7)',
                    border: '1px solid rgba(255,255,255,0.9)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'flex-start', gap: 9,
                  }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: 7, background: `${e.catColor}18`, color: e.catColor,
                      display: 'grid', placeItems: 'center', flexShrink: 0, fontSize: 10.5, fontWeight: 800,
                    }}>
                      {e.catLb.slice(0, 1)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#1c1c1e', lineHeight: 1.45 }}>{e.t}</div>
                      {e.n && <div style={{ fontSize: 10.5, color: '#6b7280', marginTop: 2, lineHeight: 1.4 }}>{e.n}</div>}
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: '#8b5cf6', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{e.d}</div>
                  </div>
                ))}
              </div>
            )}
            {/* 底部签名 */}
            <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px dashed rgba(139,92,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 10.5, fontWeight: 600, color: '#7c3aed', letterSpacing: .8 }}>PERSONAL · ANNUAL · CARD</span>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: '#ec4899' }}>{currentHl.length} memories</span>
            </div>
          </div>
        </div>
      </div>

      {/* 快速操作 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: '#1c1c1e' }}>📋 挑选条目（{currentHl.length}）</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={autoSelectRecommended}
            style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid rgba(139,92,246,0.25)', background: 'rgba(139,92,246,0.06)', color: '#7c3aed', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
            ★ 一键挑选前{topAuto.length}条
          </button>
          {currentHl.length > 0 && (
            <button type="button" onClick={() => onSave?.([])}
              style={{ padding: '5px 10px', borderRadius: 8, border: 'none', background: 'transparent', color: '#8e8e93', fontSize: 11.5, fontWeight: 500, cursor: 'pointer', textDecoration: 'underline' }}>
              清空精选
            </button>
          )}
        </div>
      </div>

      {/* 条目列表 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 260, overflowY: 'auto', paddingRight: 2 }}>
        {allEntries.length === 0 && (
          <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: '#8a9491' }}>还没有生活记录，先去添加吧～</div>
        )}
        {allEntries.map(e => {
          const sel = isHl(e.id);
          return (
            <div key={e.id} style={{
              padding: '9px 10px', borderRadius: 10,
              border: sel ? `1px solid ${e.catColor}55` : '1px solid rgba(15,23,42,0.08)',
              background: sel ? `${e.catColor}0a` : '#fff',
              display: 'flex', alignItems: 'flex-start', gap: 10,
            }}>
              <div style={{
                width: 22, height: 22, borderRadius: 7, background: `${e.catColor}16`, color: e.catColor,
                display: 'grid', placeItems: 'center', flexShrink: 0, fontSize: 10.5, fontWeight: 800,
              }}>{e.catLb.slice(0, 1)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#1c1c1e', lineHeight: 1.4 }}>{e.t}</div>
                {e.n && <div style={{ fontSize: 10.5, color: '#6b7280', marginTop: 2, lineHeight: 1.4 }}>{e.n}</div>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5, flexShrink: 0 }}>
                <div style={{ fontSize: 10.5, fontWeight: 600, color: '#8e8e93', fontVariantNumeric: 'tabular-nums' }}>{e.d}</div>
                <button
                  type="button"
                  onClick={() => onToggleHighlight?.(e.id)}
                  title={sel ? '取消精选' : '加入精选'}
                  style={{
                    width: 24, height: 24, borderRadius: 8, border: 'none', cursor: 'pointer',
                    display: 'grid', placeItems: 'center', transition: 'transform 0.12s',
                    background: sel ? 'linear-gradient(135deg,#8b5cf6,#ec4899)' : 'rgba(15,23,42,0.05)',
                    color: sel ? '#fff' : '#cbd5e1',
                    boxShadow: sel ? '0 1px 3px rgba(139,92,246,0.3)' : 'none',
                  }}>
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* 按钮 */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 2 }}>
        <button onClick={onCancel} style={BTN_G}>关闭</button>
        <button onClick={() => onSave?.(highlightedIds)} style={BTN_P}>确定 · 保存记忆卡</button>
      </div>
    </div>
  );
}

/* ---------- 8. 视图 · 知力 (OKR + 书架系统) ---------- */
function CognitionView({
  books, onBookAdd, onBookEdit, onBookMove, onBookUpdate, onBooksReplace,
  objective, onObjectiveChange,
  krs, onKrAdd, onKrEdit, onKrRemove,
  funnelHeader, setFunnelHeader,
  funnelStageLabels, setFunnelStageLabels,
  bookshelfTitle, setBookshelfTitle,
  changes, onChangeAdd, onChangeUpdate, onChangeToggleComplete, onChangeComplete, onChangeRemove,
  reviews, onReviewUpdate, onReviewRemove,
  showToast,
}) {
  const [editingObj, setEditingObj] = useState(false);
  const [objDraft, setObjDraft] = useState('');
  const [addingKr, setAddingKr] = useState(false);
  const [newKr, setNewKr] = useState({ lb: '', tgt: 12, val: 0, u: '本', sub: '' });
  const [editingKrModal, setEditingKrModal] = useState(null);
  // 书架拖拽 + Tab筛选
  const [dragBookId, setDragBookId] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);
  const [shelfTab, setShelfTab] = useState('reading'); // 默认显示"阅读中"
  // 承诺本 · 行动改变
  const [showChangeForm, setShowChangeForm] = useState(false);
  const [editingChange, setEditingChange] = useState(null);
  // 结果区 · 改变
  const [editingReview, setEditingReview] = useState(null);
  // 读后思考/思后行动 · 选书面板（'insights' | 'actions'）
  const [bookPicker, setBookPicker] = useState(null);
  // 微信读书设置弹窗 + 同步状态
  const [showWereadSettings, setShowWereadSettings] = useState(false);
  const [wereadKey, setWereadKey] = useState('');
  const [wereadCfgOk, setWereadCfgOk] = useState(null); // null=未查,true/false=已配置
  const [wereadSyncing, setWereadSyncing] = useState(false);
  const [coverSearchingIds, setCoverSearchingIds] = useState(new Set());
  // 一次性查 weread key 是否已配置
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/userSettings/get');
        const j = await r.json().catch(() => ({}));
        const cfg = j?.data?.weread_api_key || {};
        setWereadCfgOk(!!cfg.configured);
        if (cfg.value) setWereadKey(cfg.value);
      } catch { setWereadCfgOk(false); }
    })();
  }, []);

  // 自动为无封面书籍搜索封面
  useEffect(() => {
    if (!books || !Array.isArray(books)) return;
    const needCover = books.filter(b =>
      b && b.t && !b.coverUrl && !coverSearchingIds.has(b.id)
    );
    if (needCover.length === 0) return;
    needCover.forEach(b => {
      setCoverSearchingIds(prev => new Set(prev).add(b.id));
      (async () => {
        try {
          const q = encodeURIComponent(b.t || '');
          const a = encodeURIComponent(b.author || '');
          const r = await fetch(`/api/cover/search?q=${q}&author=${a}`);
          const j = await r.json().catch(() => ({}));
          if (j?.ok && j.coverUrl && typeof onBookUpdate === 'function') {
            onBookUpdate(b.id, { coverUrl: j.coverUrl, coverSource: 'auto-search' });
          }
        } catch {}
        setCoverSearchingIds(prev => {
          const n = new Set(prev); n.delete(b.id); return n;
        });
      })();
    });
  }, [books?.length]);

  const doWereadSave = async () => {
    const k = wereadKey.trim();
    if (!k.startsWith('wrk-')) return alert('API Key 需要以 wrk- 开头（登录 weread.qq.com/r/weread-skills 申请）');
    try {
      const r = await fetch('/api/userSettings/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ k: 'weread_api_key', v: k }),
      });
      const j = await r.json().catch(() => ({}));
      if (!j?.ok) throw new Error(j?.error || '保存失败');
      setWereadCfgOk(true);
      setShowWereadSettings(false);
      showToast?.('微信读书 Key 已保存');
    } catch (e) {
      alert('保存失败：' + (e.message || e));
    }
  };

  // 注意：同步按钮 SHIFT + 点击 = 调试模式（在 Console 打印 weread 返回的首本书真实结构，便于排查字段名）
  const doWereadSync = async (event) => {
    const debug = !!(event && event.shiftKey);
    if (!wereadCfgOk) { setShowWereadSettings(true); return; }
    setWereadSyncing(true);
    try {
      const r = await fetch('/api/weread/sync' + (debug ? '?debug=1' : ''));
      const j = await r.json().catch(() => ({}));
      if (debug) {
        // eslint-disable-next-line no-console
        console.group('[DEBUG] 微信读书返回结构');
        console.log('HTTP 响应 j=', j);
        // eslint-disable-next-line no-console
        if (Array.isArray(j.books) && j.books.length > 0) console.log('wereadBooks[0] =', JSON.stringify(j.books[0], null, 2));
        // eslint-disable-next-line no-console
        console.groupEnd();
      }
      if (!j?.ok) throw new Error(j?.error || '同步失败');
      const wereadBooks = j.books || [];
      if (wereadBooks.length === 0) { showToast?.('微信读书书架为空'); return; }
      // 提取封面字段：weread 不同接口字段名不一致(cover/coverImg/coverUrl/pic/img/bookCover)，做兼容
      const pickCover = (wb) => {
        const candidate = wb.cover || wb.coverImg || wb.coverUrl || wb.pic || wb.img || wb.bookCover
          || wb.book_cover || wb.bookInfo?.cover || wb.book_info?.cover
          || wb.bookInfo?.coverImg || wb.book_info?.cover_img;
        // 可能是对象 {url,https} 等，把里层取出来
        if (typeof candidate === 'string') return candidate;
        if (candidate && typeof candidate === 'object') {
          return candidate.url || candidate.https || candidate.src || candidate.href || '';
        }
        return '';
      };
      const pickField = (wb, keys, fb = '') => {
        for (const k of keys) {
          const parts = k.split('.');
          let cur = wb, miss = false;
          for (const p of parts) {
            if (cur == null || typeof cur !== 'object') { miss = true; break; }
            cur = cur[p];
          }
          if (!miss && cur != null && cur !== '') return cur;
        }
        return fb;
      };
      // 统一字段（重命名为 wereadMapped 避免遮蔽外部 books state）
      const wereadMapped = wereadBooks.map(wbRaw => {
        const wb = Object.assign({}, wbRaw);
        wb.title = pickField(wb, ['title','bookTitle','name','bookName','book_title'],'未知书名');
        wb.author = pickField(wb, ['author','authors','bookAuthor','book_author'],'');
        wb.status = Number(pickField(wb, ['status','readingStatus','readStatus','reading_status'], 0));
        wb.progress = Number(pickField(wb, ['progress','readingProgress','readProgress','pct','percent'], 0));
        wb.bookId = pickField(wb, ['bookId','book_id','id','bid'],'');
        wb.cover = pickCover(wb);
        wb.startDate = pickField(wb, ['startDate','start_date','readingStart','reading_start'],'');
        wb.endDate = pickField(wb, ['endDate','finishDate','finish_date','readingEnd','reading_end'],'');
        return wb;
      });
      // 合并策略：匹配优先级（从高到低）
      //   1) 书名+作者 完全匹配（去空格/大小写/标点 + 作者别名中英文对照）
      //   2) 书名 匹配（忽略副标题）+ （没有作者信息时也能匹配）
      //   3) 书名 模糊匹配（主书名互相包含子串）
      //   4) 都不匹配 → 作为"新书"，st 默认 abandoned（放入「已归档」栏）
      const norm = (s) => String(s || '').replace(/[\s\-—·:：、，,。.!！?？（）()（）《》""'']+/g, '').toLowerCase();
      const normTitleOnly = (s) => {
        const t = String(s || '').replace(/[\s]+/g, '').toLowerCase();
        return t.split(/[:：·\-—]/)[0] || t;
      };
      // 作者别名表：解决 Eric Jorgenson = 埃里克·约根森 / Michael Lopp = ...  这类中英文不一致问题
      const AUTHOR_ALIASES = {
        // KEY = 本地预设作者（标准化小写去标点）
        'ericjorgenson': ['ericjorgenson','埃里克里克约根森','埃里克约根森','约根森','jorgenson'],
        'danielkahneman': ['danielkahneman','丹尼尔卡尼曼','卡尼曼','kahneman'],
        'zhouling': ['zhouling','周岭'],
        'marshallrosenberg': ['marshallrosenberg','马歇尔卢森堡','卢森堡','rosenberg'],
        'lisabmarshall': ['lisabmarshall','lisamarshall','马歇尔','marshall'],
        'robertbcialdini': ['robertbcialdini','robertcialdini','罗伯特西奥迪尼','西奥迪尼','cialdini'],
        'stephenrcovey': ['stephenrcovey','stephencovey','史蒂芬柯维','柯维','covey','斯蒂芬柯维','史蒂芬R柯维','斯蒂芬R柯维'],
        'michaellopp': ['michaellopp','迈克尔洛普','洛普','lopp'],
        'seanellis': ['seanellis','肖恩埃利斯','埃利斯','ellis'],
        'nireyal': ['nireyal','尼尔埃亚尔','埃亚尔','eyal','nir eyal'],
        'barbaraminto': ['barbaraminto','芭芭拉明托','明托','minto'],
        'zhanghongjie': ['zhanghongjie','张宏杰'],
      };
      // 书名别名表：解决 weread 返回书名带"全新升级版/典藏版"、或者本地名称比官方短的情况
      // KEY = 本地预设标准化主书名  →  VALUE = 所有等价别名（含子串）
      const TITLE_ALIASES = {
        'gaoxiaonengrenshideqigexiguan': [ // 高效能人士的七个习惯
          '高效能人士的七个习惯', '高效能人士的七个习惯全新升级版', '高效能人士的七个习惯典藏版',
          '高效能人士的七个习惯25周年纪念版', '高效能人士的七个习惯精华版', '高效能人士七个习惯',
          'gaoxiaonengrenshideqigexiguan',
        ],
        'zengguofanzhuan': ['曾国藩传', '曾国藩传张宏杰', '曾国藩的正面与侧面'],
        'renzhengxingwei': ['非暴力沟通', '非暴力沟通全新修订版'],
        'naerwabaodian': ['纳瓦尔宝典', '纳瓦尔宝典财富与幸福指南'],
        'sikao kuaiyuman': ['思考快与慢', '思考快与慢诺贝尔经济学奖', '思考快与慢丹尼尔卡尼曼'],
        'renzhijuexing': ['认知觉醒', '认知觉醒开启自我改变的原动力', '认知觉醒周岭'],
        'chaojigoutongzhe': ['超级沟通者', '超级沟通者如何打破沟通壁垒'],
        'yingxiangli': ['影响力', '影响力全新升级版', '影响力经典版'],
        'chuangshiren': ['创始人', '创始人新管理者如何完成角色转变', 'thefirsttimemanager'],
        'zengzhangheike': ['增长黑客', '增长黑客如何低成本实现爆发式成长', '增长黑客樊登推荐'],
        'shangyin': ['上瘾', '上瘾让用户养成使用习惯的四大产品逻辑'],
        'jinzayuanli': ['金字塔原理', '金字塔原理思考表达和解决问题的逻辑', '金字塔原理大全集'],
      };
      const titleMatches = (localTitle, wereadTitle) => {
        if (!localTitle || !wereadTitle) return false;
        const nA = normTitleOnly(localTitle), nB = normTitleOnly(wereadTitle);
        if (nA === nB) return true;
        if (nA.length >= 2 && nB.length >= 2 && (nA.includes(nB) || nB.includes(nA))) return true;
        // 查字典别名
        const aliases = TITLE_ALIASES[nA] || [];
        for (const al of aliases) {
          const normal = normTitleOnly(al);
          if (normal === nB) return true;
          if (nB.includes(normal) || normal.includes(nB)) return true;
        }
        return false;
      };
      const authorMatches = (a, b) => {
        const na = norm(a), nb = norm(b);
        if (!na || !nb) return true; // 任何一方没作者就跳过比较（视为匹配成功）
        if (na === nb) return true;
        // 别名表检索：把 na 当 key 查，再把 nb 当 key 查，都看对方是否在别名里
        const aliasA = AUTHOR_ALIASES[na] || [];
        const aliasB = AUTHOR_ALIASES[nb] || [];
        const bagA = new Set([na, ...aliasA]);
        const bagB = new Set([nb, ...aliasB]);
        // 交集
        for (const x of bagA) if (bagB.has(x)) return true;
        // 子串：a 包含 b 或 b 包含 a（如"柯维"包含在"史蒂芬·柯维"里）
        for (const x of bagA) if (x && nb.includes(x)) return true;
        for (const x of bagB) if (x && na.includes(x)) return true;
        return false;
      };
      const isValidBookId = (v) => typeof v === 'string' && /^[a-z0-9]{20,}$/i.test(v.replace(/-/g, ''));
      // ---- 同步合并 weread 数据到本地 ----
      const mergedResult = (() => {
        const curr = Array.isArray(books) ? [...books] : [];
        const updatedIdxs = new Set();
        const needsCoverFallback = [];
        for (const wb of wereadMapped) {
          const wMainTitle = normTitleOnly(wb.title);
          let idx = -1;
          idx = curr.findIndex(b =>
            titleMatches(b.t, wb.title) &&
            authorMatches(b.author, wb.author)
          );
          if (idx < 0) idx = curr.findIndex(b => titleMatches(b.t, wb.title));
          if (idx < 0) {
            idx = curr.findIndex(b => {
              const localMain = normTitleOnly(b.t);
              if (!localMain || localMain.length < 2 || !wMainTitle || wMainTitle.length < 2) return false;
              const aSet = new Set(localMain);
              let same = 0;
              for (const ch of wMainTitle) if (aSet.has(ch)) same++;
              return same / Math.min(localMain.length, wMainTitle.length) >= 0.6;
            });
          }
          if (idx < 0 || updatedIdxs.has(idx)) continue;
          updatedIdxs.add(idx);
          const old = curr[idx];
          const newBookId = wb.bookId && isValidBookId(wb.bookId) ? wb.bookId : '';
          const merged = { ...old };
          if (newBookId) {
            merged.bookId = newBookId;
            merged.ebookUrl = `https://weread.qq.com/web/reader/${newBookId}`;
            merged.src = '电子书';
          } else {
            merged.src = old.src || '电子书';
          }
          const coverRaw = wb.cover;
          if (coverRaw) {
            merged.coverUrl = '/api/cover/proxy?url=' + encodeURIComponent(String(coverRaw));
            merged.coverSource = 'weread';
          } else {
            needsCoverFallback.push({ idx, title: old.t, author: old.author });
          }
          const mappedSt = wb.status === 4 ? 'done' : wb.status === 3 ? 'reading' : 'pending';
          if (old.st === 'done') { merged.pct = 100; merged.st = 'done'; }
          else {
            merged.st = old.st;
            const wpct = Math.min(100, Math.max(0, Number(wb.progress) || (mappedSt === 'done' ? 100 : 0)));
            merged.pct = Math.max(Number(old.pct) || 0, wpct);
          }
          if (wb.startDate && !old.startDate) merged.startDate = wb.startDate;
          if (wb.endDate && !old.endDate) merged.endDate = wb.endDate;
          curr[idx] = merged;
        }
        return { curr, updatedIdxs, needsCoverFallback };
      })();
      let { curr, updatedIdxs, needsCoverFallback } = mergedResult;

      // ---- 同步·立刻搜索 bookId（同步，不等setTimeout）----
      const needBookId = curr
        .map((b, idx) => ({ b, idx }))
        .filter(({ b }) => !b.bookId && b.t)
        .map(({ b, idx }) => ({ idx, title: b.t, author: b.author }));
      if (needBookId.length > 0) {
        showToast?.(`正在为 ${needBookId.length} 本书搜索微信读书链接…`);
        const BATCH = 3;
        for (let i = 0; i < needBookId.length; i += BATCH) {
          const slice = needBookId.slice(i, i + BATCH);
          const results = await Promise.all(slice.map(async ({ idx, title, author }) => {
            try {
              const r = await fetch(`/api/weread/search?q=${encodeURIComponent(title)}`);
              const j = await r.json().catch(() => ({}));
              if (j?.ok && Array.isArray(j.results) && j.results.length > 0) {
                let match = null;
                if (author) {
                  match = j.results.find(x =>
                    String(x.title || '').includes(title.slice(0, 2)) &&
                    String(x.author || '').includes(String(author).slice(0, 2))
                  );
                }
                if (!match) match = j.results.find(x => String(x.title || '').includes(title.slice(0, 2)));
                if (!match) match = j.results[0];
                const bid = match?.bookId;
                if (bid && isValidBookId(bid)) {
                  return { idx, bookId: bid, ebookUrl: `https://weread.qq.com/web/reader/${bid}` };
                }
              }
            } catch (_) {}
            return null;
          }));
          for (const r of results) {
            if (r && curr[r.idx]) {
              curr[r.idx] = { ...curr[r.idx], bookId: r.bookId, ebookUrl: r.ebookUrl, src: '电子书' };
              updatedIdxs.add(r.idx);
            }
          }
        }
      }
      // 【异步·封面兜底】为还没真实封面的本地书搜封面
      const EMPTY_COVER = (b) => {
        const u = String(b.coverUrl || '').trim();
        return !u
          || b.coverSource === 'placeholder'
          || /^(占位|首字)/.test(b.coverSource || '')
          || (!/^https?:\/\//i.test(u) && !u.startsWith('/') && !/^data:image\//i.test(u));
      };
      const missingCurr = [];
      curr.forEach((b, idx) => { if (EMPTY_COVER(b) && b.t) missingCurr.push({ idx, title: b.t, author: b.author, bid: b.id }); });
      for (const x of needsCoverFallback) {
        if (!missingCurr.some(m => m.idx === x.idx)) missingCurr.push(x);
      }
      if (missingCurr.length > 0 && typeof onBooksReplace === 'function') {
        setTimeout(async () => {
          try {
            const patches = new Map();
            const BATCH = 3;
            for (let i = 0; i < missingCurr.length; i += BATCH) {
              const slice = missingCurr.slice(i, i + BATCH);
              await Promise.all(slice.map(async ({ idx, title, author }) => {
                try {
                  const q = new URLSearchParams({ q: String(title || '').trim() });
                  if (String(author || '').trim()) q.set('author', String(author).trim());
                  const r = await fetch(`/api/cover/search?${q.toString()}`);
                  const j = await r.json().catch(() => ({}));
                  if (j?.coverUrl) {
                    const proxied = '/api/cover/proxy?url=' + encodeURIComponent(String(j.coverUrl));
                    patches.set(idx, { coverUrl: proxied, coverSource: j.source || 'douban' });
                  }
                } catch (_) {}
              }));
            }
            if (patches.size > 0) {
              onBooksReplace(prev => {
                const next = (Array.isArray(prev) ? prev : []).slice();
                for (const [idx, p] of patches) {
                  if (next[idx]) next[idx] = { ...next[idx], ...p };
                }
                return next;
              });
              showToast?.(`已补 ${patches.size} 本封面`);
            }
          } catch (_) {}
        }, 150);
      }
      // ---- 保存结果 ----
      if (typeof onBooksReplace === 'function') {
        onBooksReplace(() => curr);
      }
      const noBookIdFinal = curr.filter(b => !b.bookId && b.t).length;
      showToast?.(`微信读书同步完成 · 已匹配更新 ${updatedIdxs.size} 本` +
        (noBookIdFinal ? ` · ${noBookIdFinal} 本待手动设置链接` : '') +
        (missingCurr.length ? ` · 正在补封面…` : ''));
    } catch (e) {
      alert('同步失败：' + (e.message || e));
    } finally {
      setWereadSyncing(false);
    }
  };

  const BLUE = '#007aff';       // 计划总结页"今日按钮"填充蓝（Apple system blue）
  const BLUE_DARK = '#0062cc';  // 深蓝
  const BLUE_LIGHT = 'rgba(0,122,255,0.08)'; // 对应今日页浅色背景 rgba(0,122,255,0.08)
  const BLUE_BG = 'rgba(0,122,255,0.12)';
  // 分类色标：4 大类固定颜色（身份识别）
  const CAT_COLORS = {
    '认知成长': '#007aff', // 蓝（知力主色）
    '人际沟通': '#a855f7', // 紫（人际/感性）
    '商业职场': '#f59e0b', // 橙（商业/行动力）
    '人文叙事': '#10b981', // 绿（叙事/成长感）
  };
  const catColorOf = (c) => CAT_COLORS[c] || BLUE;
  const year = new Date().getFullYear();

  const groups = useMemo(() => {
    const dynBooks = (!books || books.length === 0) ? BOOKS : books;
    return {
      reading:   dynBooks.filter(b => b.st === 'reading'),
      pending:   dynBooks.filter(b => b.st === 'pending'),
      done:      dynBooks.filter(b => b.st === 'done'),
      abandoned: dynBooks.filter(b => b.st === 'abandoned'),
    };
  }, [books]);

  // 所有有思考的书籍（用于"读后思考"卡片）— 要求 text & scene 都填写（至少1组），不限阅读状态
  const booksWithInsights = useMemo(() => {
    const dynBooks = (!books || books.length === 0) ? BOOKS : books;
    return dynBooks.filter(b => {
      const ins = b.insights || [];
      return ins.some(i => i.text?.trim() && i.scene?.trim());
    });
  }, [books]);

  // 读后思考卡片头部统计：所有有效思考条目总数
  const totalInsightCount = useMemo(() => {
    const dynBooks = (!books || books.length === 0) ? BOOKS : books;
    return dynBooks.reduce((sum, b) => {
      const valid = (b.insights || []).filter(i => i.text?.trim() && i.scene?.trim());
      return sum + valid.length;
    }, 0);
  }, [books]);

  // 所有书籍中聚合出来的「思后行动」条目（替代旧的独立changes）— 格式保持兼容旧 cogChanges 渲染
  const bookActionsList = useMemo(() => {
    const dynBooks = (!books || books.length === 0) ? BOOKS : books;
    const out = [];
    dynBooks.forEach(b => {
      const acts = b.actions || [];
      acts.forEach((a, idx) => {
        if (!a.text?.trim()) return;
        out.push({
          id: `${b.id || 'bk'}_act_${a.id || idx}`,
          bookId: b.id,
          bookTitle: b.t,
          text: a.text.trim(),
          done: !!a.done,
          startDate: b.startDate || '',
          targetDays: 30,
          checkIns: [],
          status: a.done ? 'completed' : 'active',
          __fromBook: true,
        });
      });
    });
    return out;
  }, [books]);

  // 漏斗五层数据（严格真子集递减 + 条目级统计，与 KR 完全统一数据源）
  // ReadingFunnel 字段顺序 total → done → notes → changes → reviews
  // → 对应语义： 目标量 → 输入量 → 思考量 → 行动量 → 改变量
  const funnelData = useMemo(() => {
    const dynBooks = (!books || books.length === 0) ? BOOKS : books;
    const dynKrs = krs || COG_KRS;
    const doneBooks = dynBooks.filter(b => b.st === 'done');
    // 思考量：统计所有书籍中完整填写的思考条目数（每条 = 核心触动 + 应用场景）
    const insightEntryCount = dynBooks.reduce((sum, b) => {
      const validInsights = (b.insights || []).filter(i => i.text?.trim() && i.scene?.trim());
      return sum + validInsights.length;
    }, 0);
    // 行动量：统计所有书籍中已勾选(done)的思后行动条目数
    const checkedActionCount = dynBooks.reduce((sum, b) => {
      return sum + (b.actions || []).filter(a => a.done && a.text?.trim()).length;
    }, 0);
    // 改变量：cogReviews 实际记录数（真正落地的"改变"，不是行动数）
    const dynReviews = (reviews || []).length;
    // 目标量 = KR0 的目标值（漏斗最顶层，始终最大）
    const kr0Target = (dynKrs && dynKrs[0])?.tgt ?? COG_KRS[0]?.tgt ?? 12;
    return {
      total: kr0Target,          // ① 目标量：KR0 目标值（12本，漏斗最顶层）
      done: doneBooks.length,    // ② 输入量：已读完书籍数（< 目标量）
      notes: insightEntryCount,  // ③ 思考量：思考条目总数（< 输入量）
      changes: checkedActionCount, // ④ 行动量：条目级已勾选行动计划总数（< 思考量）
      reviews: dynReviews,       // ⑤ 改变量：cogReviews 实际改变记录数（< 行动量）
      doneBooksCount: doneBooks.length,
      reviewCount: dynReviews,
    };
  }, [books, krs, changes, reviews]);

  const finalKrs = (() => {
    // 强制排序：按 COG_KRS 默认顺序（目标量→输入量→思考量→行动量→改变量），
    // 之后才是用户自定义 KR。修复旧数据 kr0/kr4 append 到尾部导致顺序错乱的问题。
    const defaultOrder = COG_KRS.map(k => k.id);
    const arr = [...(krs || COG_KRS)];
    arr.sort((a, b) => {
      const ai = defaultOrder.indexOf(a.id);
      const bi = defaultOrder.indexOf(b.id);
      if (ai >= 0 && bi >= 0) return ai - bi; // 两个都在默认集合里 → 按 COG_KRS 顺序
      if (ai >= 0) return -1; // 只 a 在 → a 在前
      if (bi >= 0) return 1;  // 只 b 在 → b 在前
      return 0;               // 都不在 → 保持相对顺序
    });
    return arr.map(kr => {
      // KR0（目标量）= 固定值，始终 100%（阅读目标设定值）
      if (kr.id === 'kr0') {
        return { ...kr, val: kr.tgt };
      }
      // KR1（输入量）= 已读完书籍实际数量
      if (kr.id === 'kr1') {
        return { ...kr, val: funnelData.doneBooksCount };
      }
      // KR2（思考量）= 思考条目总数（洞察条目）
      if (kr.id === 'kr2') {
        return { ...kr, val: funnelData.notes };
      }
      // KR3（行动量）= 已勾选行动计划条目总数
      if (kr.id === 'kr3') {
        return { ...kr, val: funnelData.changes };
      }
      // KR4（改变量）= 改变记录总数
      if (kr.id === 'kr4') {
        return { ...kr, val: funnelData.reviews };
      }
      return kr;
    });
  })();

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

  // 编辑 KR（弹窗模式）
  const commitEditKr = () => {
    if (!editingKrModal) return;
    const { kr, draft } = editingKrModal;
    if (!draft.lb.trim()) return;
    onKrEdit?.({
      ...kr,
      lb: draft.lb.trim(),
      tgt: Number(draft.tgt) || 0,
      val: Number(draft.val) || 0,
      u: draft.u || '',
      sub: draft.sub || '',
    });
    setEditingKrModal(null);
  };
  const openEditKrModal = (kr) => {
    setEditingKrModal({ kr, draft: { lb: kr.lb, tgt: kr.tgt, val: kr.val, u: kr.u, sub: kr.sub } });
  };

  return (
    <div className="flex flex-col gap-3">

      {/* ===== Row 1: 左 OKR(6) + 右 书架(6) 一体化布局 — 6:6 等分, 书架2列卡片恢复原始尺寸 ===== */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-3">

      {/* ===== 左侧·一体化 KR × 漏斗 卡片（6/12 列） ===== */}
      <div className="xl:col-span-6 bg-white rounded-2xl border border-ink-100 p-3.5 flex flex-col min-h-0">
        {/* ===== Header: O目标 + 时间进度 + 新增KR（mb-3 给 O 行和下面内容呼吸感）===== */}
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
              <span className="w-[5px] h-[18px] rounded-full flex-shrink-0" style={{ background: BLUE }}></span>
              <InlineEdit
                value={objective?.text || COG_O.text}
                onChange={(v) => {
                  const t = String(v || '').trim();
                  if (!t) return;
                  onObjectiveChange?.({ ...(objective || COG_O), text: t });
                }}
                onDelete={() => onObjectiveChange?.({ ...(objective || COG_O), text: COG_O.text })}
                mode="contextmenu"
                className="flex-1 min-w-0 text-[15px] font-bold text-ink-900 leading-tight truncate"
                inputClassName="text-[15px] font-bold text-ink-900 w-full"
                title="右键编辑O目标"
                placeholder="填写O目标"
              />
              {/* 时间进度：按当前月份显示 */}
              {(() => {
                const now = new Date();
                const timePct = Math.round(((now.getMonth() + 1) / 12) * 100);
                return (
                  <div className="flex-shrink-0 px-2 py-[5px] rounded-lg whitespace-nowrap flex items-center gap-1"
                    style={{ background: `${BLUE}10`, border: `1px solid ${BLUE}25` }}>
                    <span className="text-[10px] text-ink-500">时间进度</span>
                    <span className="text-[12px] font-extrabold tabular-nums leading-none" style={{ color: BLUE }}>
                      {timePct}<span className="text-[9px] font-bold">%</span>
                    </span>
                  </div>
                );
              })()}
              <button
                onClick={() => { setAddingKr(true); setNewKr({ lb: '', tgt: 12, val: 0, u: '本', sub: '' }); }}
                className="inline-flex items-center justify-center w-[26px] h-[26px] rounded-lg transition flex-shrink-0"
                style={{ color: BLUE, background: `${BLUE}10`, border: `1px solid ${BLUE}25` }}
                title="新增KR">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" strokeLinecap="round"/></svg>
              </button>
            </div>
          )}
        </div>

        {/* ===== 一体化漏斗：3 列同构 —— 删表头（列语义视觉自解释），O 行 mb-3 已提供呼吸 ===== */}
        <div className="flex flex-col flex-1 min-h-0">
          {finalKrs.map((kr, idx) => {
            const p = pct(kr.val, kr.tgt);
            const nextKr = finalKrs[idx + 1];
            const conv = nextKr && kr.val > 0 ? Math.round((nextKr.val / kr.val) * 100) : null;
            const isDone = p >= 100;
            const now = new Date();
            const month = now.getMonth() + 1;
            const timePct = (month / 12) * 100;
            const isBehind = p < timePct && !isDone;
            const remaining = Math.max(0, (kr.tgt || 0) - (kr.val || 0));
            const pctWidth = Math.max(6, Math.min(100, p));
            const krTypeMap = { goal: '目标量', thinking: '思考量', action: '行动量', change: '改变量' };
            const krType = kr.type ? (krTypeMap[kr.type] || kr.type) : '';
            const padNum = String(idx + 1).padStart(2, '0');
            // lb 精简：剥离所有类型词后的冗余后缀
            const DEFAULT_TYPES = ['目标量', '输入量', '思考量', '行动量', '改变量'];
            const rawLb = kr.lb || '';
            let cleanLb = rawLb;
            const m = rawLb.match(/^(\S+)\s*[·.]\s*.+$/);
            if (m && DEFAULT_TYPES.includes(m[1])) {
              cleanLb = m[1];
            } else if (DEFAULT_TYPES.includes(rawLb)) {
              cleanLb = rawLb;
            }

            return (
              <div key={kr.id || idx}>
                {/* KR 行：3 列 —— 修复间距：py-2(8px) + px-0(对齐贯通) */}
                <div className="flex items-center gap-2.5 py-2 rounded-lg hover:bg-surface-soft transition-colors">
                  {/* 左区：w-[128px] = w22# + gap10 + flex-1(目标+数字)，箭头在此区 justify-center 对准目标文字中心 */}
                  <div className="w-[128px] flex items-center gap-2.5 flex-shrink-0 -mt-[1px]">
                    <span className="text-[11px] font-bold tabular-nums w-[22px] text-right leading-none flex-shrink-0"
                      style={{ color: BLUE }}>{padNum}</span>
                    <div className="flex-1 min-w-0 truncate flex items-baseline gap-1">
                      <div onClick={() => openEditKrModal(kr)} className="cursor-pointer group flex items-baseline gap-1.5 min-w-0">
                        <span className="text-[13px] font-semibold text-ink-700 truncate leading-none group-hover:text-ink-900">{cleanLb}</span>
                        <span className="text-[11px] font-extrabold text-ink-900 tabular-nums leading-none flex-shrink-0">
                          {kr.tgt}{kr.u}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 中部：漏斗进度条（flex-1） */}
                  <div className="flex-1 flex items-center min-w-0">
                    <div className="flex-1 h-[22px] rounded-lg overflow-hidden bg-ink-50 relative" style={{ minWidth: '40px' }}>
                      <div className="relative w-full h-full flex items-center">
                        <div
                          className="h-full rounded-lg transition-all duration-500 flex items-center justify-start pl-2"
                          style={{
                            width: `${pctWidth}%`,
                            background: isDone
                              ? '#22c55e'
                              : `${BLUE}`,
                            boxShadow: isDone ? '0 1px 3px rgba(34,197,94,0.25)' : `0 1px 3px ${BLUE}25`,
                          }}>
                          {p >= 15 && (
                            <span className="text-[10px] font-bold text-white/90 tabular-nums">
                              {kr.val}{kr.u}
                            </span>
                          )}
                        </div>
                        {p < 15 && (
                          <span className="text-[10px] font-bold tabular-nums ml-1.5 flex-shrink-0" style={{ color: '#8a9491' }}>
                            {kr.val}{kr.u}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 右侧：完成率（删除当前/目标列，节省 64px 让漏斗条更宽） */}
                  <span className="text-[14px] font-extrabold tabular-nums leading-none w-[48px] text-right flex-shrink-0"
                    style={{ color: isDone ? '#111827' : (isBehind ? '#dc2626' : BLUE) }}>
                    {p}<span className="text-[11px] font-bold">%</span>
                  </span>
                </div>

                {/* 连接线：同样 3 列结构 —— 修复间距 py-1.5(6px) 让箭头独立呼吸 */}
                {nextKr && (() => {
                  const lowConv = conv !== null && conv < 50;
                  return (
                    <div className="flex items-center gap-2.5 py-1.5 text-[11px]">
                      {/* 左区 w-[128px] —— 箭头 justify-center 对齐目标文字视觉中心 */}
                      <div className="w-[128px] flex-shrink-0 flex items-center justify-center">
                        <svg className="w-3 h-3" style={{ color: '#8a9491' }} fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 5v14M5 12l7 7 7-7" />
                        </svg>
                      </div>
                      {/* 转化率在 flex-1 居中 — 对齐表头「漏斗进度」文字 */}
                      <div className="flex-1 flex items-center justify-center min-w-0">
                        <span
                          className="font-bold tabular-nums"
                          style={{ color: lowConv ? '#dc2626' : '#8a9491' }}>
                          {conv ?? 0}%
                        </span>
                      </div>
                      <div className="w-[48px] flex-shrink-0 invisible" aria-hidden="true"></div>
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>

        {/* ===== 关键瓶颈提示：自动分析最低转化率环节 ===== */}
        {(() => {
          // 计算每一层到下一层的转化率
          const stageNames = ['目标量', '输入量', '思考量', '行动量', '改变量'];
          const conversions = [];
          for (let i = 0; i < finalKrs.length - 1; i++) {
            const curr = finalKrs[i], next = finalKrs[i + 1];
            if (!curr || !next || !curr.val || curr.val <= 0) continue;
            const rate = Math.round((next.val / curr.val) * 100);
            conversions.push({ from: stageNames[i], to: stageNames[i + 1], rate, fromVal: curr.val, toVal: next.val });
          }
          if (conversions.length === 0) return null;
          // 找到最低转化率
          const minConv = conversions.reduce((a, b) => a.rate < b.rate ? a : b);
          // 构建提示文案
          const tips = [];
          if (minConv.rate < 50) {
            tips.push(`从「${minConv.from}」到「${minConv.to}」转化率仅 ${minConv.rate}%，是当前最大瓶颈`);
          }
          // 给出具体建议
          const suggestions = [];
          if (minConv.to === '输入量') suggestions.push('读完更多书籍，补充已读完的库存量');
          else if (minConv.to === '思考量') suggestions.push('对已读完的书补充核心触动与应用场景');
          else if (minConv.to === '行动量') suggestions.push('将思考转化为可执行的行动计划');
          else if (minConv.to === '改变量') suggestions.push('将行动计划落地，记录真实改变');

          return (
            <div className="flex items-center gap-2 mt-2 pt-2.5 pb-1 px-3 rounded-lg"
              style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.18)' }}>
              <svg className="w-[14px] h-[14px] flex-shrink-0" fill="#f59e0b" viewBox="0 0 24 24">
                <path d="M12 2.5c-.6 0-1.1.3-1.4.8L1.5 19.3c-.3.5-.1 1.1.3 1.4.2.2.5.3.8.3h18.8c.3 0 .6-.1.8-.3.5-.3.6-.9.3-1.4L13.4 3.3c-.3-.5-.8-.8-1.4-.8z"/><path d="M12 9v4.5M12 17.5v.01" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>
              </svg>
              <span className="text-[11px] font-bold text-ink-700 flex-shrink-0">关键瓶颈：</span>
              <span className="text-[11px] text-ink-600">
                从「<span style={{ color: BLUE, fontWeight: 700 }}>{minConv.from}</span>」
                到「<span style={{ color: BLUE, fontWeight: 700 }}>{minConv.to}</span>」
                转化率
                <span style={{ color: '#dc2626', fontWeight: 800 }}> {minConv.rate}% </span>
                — {suggestions[0]}
              </span>
            </div>
          );
        })()}

      </div>
      {/* ===== 一体化 KR × 漏斗 卡片 END ===== */}

      {/* ===== 右侧·书架看板（6/12 列，2列网格恢复原始卡片尺寸） ===== */}
      <div className="xl:col-span-6 flex flex-col min-h-0">
      {/* ===== 书架看板 ===== */}
      <div className="bg-white rounded-2xl border border-ink-100 p-3.5 flex flex-col flex-1 min-h-0">
        {/* Header 两行式：第一行(色条+标题+共N本+操作按钮) · 第二行(Tabs左对齐) */}
        <div className="mb-2">
          {/* Row 1：色条 + 标题 + 共N本 + 操作按钮 */}
          <div className="flex items-center gap-3">
            {/* 左：色条 + 标题 + 共 N 本 */}
            <div className="flex items-center gap-2.5 flex-shrink-0">
              <span className="w-[5px] h-[18px] rounded-full flex-shrink-0" style={{ background: BLUE }}></span>
              <InlineEdit
                value={bookshelfTitle}
                onChange={(v) => setBookshelfTitle?.(String(v || '').trim())}
                onDelete={() => setBookshelfTitle?.('')}
                mode="contextmenu"
                placeholder={`${objective?.year || COG_O.year}年 · 书架`}
                className="text-[15.5px] font-bold text-ink-900 leading-none"
                inputClassName="text-[15.5px] font-bold text-ink-900 w-32"
                title="右键编辑书架标题"
              />
              <span className="text-[11px] text-ink-400 tabular-nums leading-none whitespace-nowrap">
                共 {groups.reading.length + groups.pending.length + groups.done.length} 本
              </span>
            </div>

            {/* 右：操作按钮组（右对齐，统一蓝色，只保留图标）*/}
            <div className="flex items-center gap-1 ml-auto flex-shrink-0">
              <button onClick={doWereadSync} disabled={wereadSyncing}
                className="inline-flex items-center justify-center w-[26px] h-[26px] rounded-lg transition flex-shrink-0 disabled:opacity-50"
                style={{ color: BLUE, background: `${BLUE}10`, border: `1px solid ${BLUE}25` }}
                title={wereadCfgOk ? '从微信读书同步书架' : '先设置微信读书 API Key'}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M4 4v5h5M20 20v-5h-5M20 9A8 8 0 0 0 6.34 5.34L4 9M4 15a8 8 0 0 0 13.66 3.66L20 15" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              <button onClick={async () => {
                  setShowWereadSettings(true);
                  try {
                    const r = await fetch('/api/userSettings/get');
                    const j = await r.json().catch(() => ({}));
                    const cfg = j?.data?.weread_api_key || {};
                    if (cfg.value) setWereadKey(cfg.value);
                  } catch {}
                }}
                className="inline-flex items-center justify-center w-[26px] h-[26px] rounded-lg transition flex-shrink-0"
                style={{ color: BLUE, background: `${BLUE}10`, border: `1px solid ${BLUE}25` }}
                title="设置微信读书 API Key">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              <button onClick={() => onBookAdd?.()}
                className="inline-flex items-center justify-center w-[26px] h-[26px] rounded-lg transition flex-shrink-0"
                style={{ color: BLUE, background: `${BLUE}10`, border: `1px solid ${BLUE}25` }}
                title="添加书籍">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" strokeLinecap="round"/></svg>
              </button>
            </div>
          </div>

          {/* Row 2：Tab 筛选按钮组（左对齐，跟标题左对齐）*/}
          {(() => {
            const TABS = [
              { key: 'reading',   lb: '阅读中',   col: BLUE,     books: groups.reading },
              { key: 'pending',   lb: '未开始',   col: BLUE,     books: groups.pending },
              { key: 'done',      lb: '已读完',   col: BLUE,     books: groups.done },
              { key: 'abandoned', lb: '已归档',   col: BLUE,     books: groups.abandoned },
            ];
            return (
              <div className="flex items-center gap-1 mt-2">
                {TABS.map(t => {
                  const active = shelfTab === t.key;
                  return (
                    <button
                      key={t.key}
                      onClick={() => setShelfTab(t.key)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-[10px] transition-all duration-150`}
                      style={{
                        background: active ? BLUE : 'transparent',
                        color: active ? '#ffffff' : '#64748b',
                        fontWeight: active ? 700 : 500,
                        fontSize: '11.5px',
                        boxShadow: active ? 'none' : 'inset 0 0 0 1px rgba(15,23,42,0.05)',
                      }}>
                      <span className="relative w-[11px] h-[11px] rounded-full flex-shrink-0 flex items-center justify-center"
                        style={{ background: active ? 'rgba(255,255,255,0.25)' : 'rgba(148,163,184,0.22)' }}>
                        <span className="w-[5.5px] h-[5.5px] rounded-full" style={{ background: active ? '#ffffff' : '#8a9491' }}></span>
                      </span>
                      <span>{t.lb}</span>
                      <span className="inline-flex items-center justify-center min-w-[17px] h-[15px] px-1 rounded-full text-[10px] font-bold tabular-nums leading-none"
                        style={{
                          background: active ? 'rgba(255,255,255,0.28)' : 'rgba(15,23,42,0.05)',
                          color: active ? '#ffffff' : '#64748b',
                        }}>
                        {t.books.length}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })()}
        </div>
        {/* 单列主内容：只渲染当前选中 shelfTab 这一栏 */}
        {(() => {
          const META = {
            reading:   { lb: '阅读中',   col: BLUE },
            pending:   { lb: '未开始',   col: '#64748b' },
            done:      { lb: '已读完',   col: '#22c55e' },
            abandoned: { lb: '已归档', col: '#64748b' },
          };
          const g = { key: shelfTab, ...META[shelfTab], books: groups[shelfTab] || [] };
          const isDragOver = dragOverCol === g.key && dragBookId && (() => {
            const cur = (books.length === 0 ? BOOKS : books).find(x => x.id === dragBookId);
            return cur && cur.st !== g.key;
          })();
          return (
            <div
              className="flex-1 min-h-0 flex flex-col overflow-y-auto pr-1"
              style={{
                background: 'rgba(15,23,42,0.032)',
                border: isDragOver
                  ? `2px dashed ${g.col}`
                  : '1px solid rgba(15,23,42,0.05)',
                boxShadow: isDragOver ? `0 0 0 4px ${g.col}12` : undefined,
                padding: isDragOver ? '10px 8px' : '10px 9px',
                borderRadius: '14px',
                transition: 'all 200ms ease',
              }}
              onDragOver={(e) => {
                e.preventDefault();
                const cur = (books.length === 0 ? BOOKS : books).find(x => x.id === dragBookId);
                if (cur && cur.st !== g.key) setDragOverCol(g.key);
              }}
              onDragLeave={() => { if (dragOverCol === g.key) setDragOverCol(null); }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragBookId) {
                  const cur = (books.length === 0 ? BOOKS : books).find(x => x.id === dragBookId);
                  if (cur && cur.st !== g.key) onBookMove?.(dragBookId, g.key);
                }
                setDragBookId(null);
                setDragOverCol(null);
              }}
            >
              <div className="grid grid-cols-2 gap-2.5">
                {g.books.length === 0 ? (
                  <div className="col-span-full flex items-center justify-center py-6 text-[12px] rounded-lg transition-all"
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
                    const isDone = g.key === 'done';
                    const catCol = catColorOf(b.cat);
                    const pct = Math.min(100, Math.max(0, Number(b.pct) || 0));
                    let statusDot;
                    switch (b.st) {
                      case 'reading':
                        statusDot = { col: BLUE, solid: true, pulse: true, lb: '阅读中' };
                        break;
                      case 'done':
                        statusDot = { col: '#22c55e', solid: true, pulse: false, lb: '已读完' };
                        break;
                      case 'abandoned':
                        statusDot = { col: '#64748b', solid: false, pulse: false, strike: false, lb: '已归档' };
                        break;
                      default:
                        statusDot = { col: '#cbd5e1', solid: false, pulse: false, lb: '未开始' };
                    }
                    const ebookInfo = (() => {
                      const validId = (v) => typeof v === 'string' && /^[a-z0-9]{20,}$/i.test(v.replace(/-/g, ''));
                      if (b.ebookUrl && b.ebookUrl.startsWith('http')) {
                        const m = b.ebookUrl.match(/\/reader\/([^/?#]+)/);
                        if (m && validId(m[1])) return { url: b.ebookUrl, hasLink: true };
                      }
                      if (b.bookId && validId(b.bookId)) return { url: `https://weread.qq.com/web/reader/${b.bookId}`, hasLink: true };
                      return { url: null, hasLink: false };
                    })();
                    const hasEbookLink = ebookInfo.hasLink;
                    const isEbookLink = ebookInfo.url;
                    const insights = b.insights || [];
                    const validIns = insights.filter(i => i.text?.trim() && i.scene?.trim());
                    const acts = b.actions || [];
                    const validActs = acts.filter(a => a.text?.trim());
                    const hasIns = validIns.length > 0;
                    const hasAct = validActs.length > 0;
                    const realCover = String(b.coverUrl || '').trim();
                    const coverInitBg = (() => {
                      switch (b.cat) {
                        case '认知成长': return 'linear-gradient(135deg,#eff6ff,#dbeafe)';
                        case '人际沟通': return 'linear-gradient(135deg,#faf5ff,#ede9fe)';
                        case '商业职场': return 'linear-gradient(135deg,#fff7ed,#ffedd5)';
                        case '人文叙事': return 'linear-gradient(135deg,#f0fdf4,#bbf7d0)';
                        default: return `linear-gradient(135deg, ${catCol}1A, ${catCol}33)`;
                      }
                    })();
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
                        onClick={() => onBookEdit?.(b)}
                        onContextMenu={(e) => { e.preventDefault(); onBookContextMenu?.(e, b); }}
                        className={`rounded-2xl bg-white transition-all select-none overflow-hidden ${isDragging ? 'opacity-40 scale-[0.98]' : 'hover:shadow-[0_5px_16px_rgba(15,23,42,0.08)] hover:-translate-y-[1px]'}`}
                        style={{
                          cursor: isDragging ? 'grabbing' : 'pointer',
                          boxShadow: '0 2px 8px rgba(15,23,42,0.06)',
                          border: '1px solid rgba(15,23,42,0.10)',
                        }}>
                        <div className="w-full min-w-0 flex flex-col gap-[7px]" style={{ padding: '12px 13px' }}>
                          {/* 主行：封面48×64左 + 右侧4行信息流 */}
                          <div className="flex items-start gap-[11px] min-w-0">
                            {/* 封面 48×64 */}
                            <div style={{
                              width:'48px', height:'64px', borderRadius:'7px', overflow:'hidden', flex:'0 0 48px',
                              border: `1px solid ${catCol}33`,
                              background: realCover ? '#fff' : coverInitBg,
                              boxShadow: '0 2px 6px rgba(15,23,42,0.07)',
                              display: 'flex', alignItems:'center', justifyContent:'center',
                            }}>
                              {realCover ? (
                                <CoverImg
                                  src={realCover}
                                  bookId={b.id}
                                  coverSource={b.coverSource}
                                  onPersist={(dataUrl) => {
                                    if (typeof onBookUpdate !== 'function') return;
                                    try { onBookUpdate(b.id, { coverUrl: dataUrl, coverSource: 'local-base64' }); }
                                    catch (_) {}
                                  }}
                                  catCol={catCol}
                                  fallbackChar={(b.t||'书').charAt(0)}
                                />
                              ) : (
                                <span style={{ color: catCol, fontSize: '22px', fontWeight: 900, textShadow: `0 1px 2px ${catCol}22`, lineHeight: 1 }}>
                                  {(b.t||'书').charAt(0)}
                                </span>
                              )}
                            </div>
                            {/* 右侧：书名+↗ / 作者+Pill / %+bar / 日期 */}
                            <div className="flex-1 min-w-0 flex flex-col gap-[4px]" style={{ paddingBottom: '2px' }}>
                              {/* 行1：书名 左 + 跳转↗ 右 */}
                              <div className="flex items-start justify-between gap-2 min-w-0">
                                <div className="min-w-0 flex-1">
                                  <div className={`min-w-0 truncate text-[15px] font-bold leading-[1.3] ${statusDot.strike ? 'line-through' : ''}`}
                                    style={{ color: isDone ? '#64748b' : '#0f172a', letterSpacing: '0.1px' }}>
                                    {b.t}
                                  </div>
                                </div>
                                {true && (
                                  <div className="flex items-center flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                                    <button
                                      disabled={!hasEbookLink}
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        if (!hasEbookLink) return;
                                        try { window.open(isEbookLink, '_blank', 'noopener,noreferrer'); }
                                        catch { onBookEdit?.(b); }
                                      }}
                                      title={hasEbookLink ? '打开电子书' : '微信读书暂未收录，点击【同步微信读书】按钮自动搜索'}
                                      className="group inline-flex items-center justify-center transition-colors duration-150 disabled:cursor-not-allowed"
                                      style={{
                                        width: '20px', height: '20px', borderRadius:'5px',
                                        background: 'transparent',
                                        color: hasEbookLink ? '#60a5fa' : '#cbd5e1',
                                      }}
                                      onMouseEnter={(e) => {
                                        if (!hasEbookLink) return;
                                        e.currentTarget.style.background = BLUE;
                                        e.currentTarget.style.color = '#fff';
                                      }}
                                      onMouseLeave={(e) => {
                                        e.currentTarget.style.background = 'transparent';
                                        e.currentTarget.style.color = hasEbookLink ? '#60a5fa' : '#cbd5e1';
                                      }}>
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        {hasEbookLink ? (
                                          <path d="M7 17 17 7M7 7h10v10"/>
                                        ) : (
                                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" opacity="0.5"/>
                                        )}
                                      </svg>
                                    </button>
                                  </div>
                                )}
                              </div>
                              {/* 行2：作者 左 + 分类Pill 右 */}
                              <div className="flex items-center justify-between gap-2 min-w-0">
                                <div className="text-[11.5px] text-ink-400 font-medium leading-none truncate flex-1">
                                  {b.author || '佚名作者'}
                                </div>
                                <span className="inline-flex flex-shrink-0 items-center px-[7px] h-[17px] rounded-full text-[10px] font-bold leading-none"
                                  style={{
                                    background: (() => {
                                      switch (b.cat) {
                                        case '认知成长': return BLUE_LIGHT;
                                        case '人际沟通': return '#ede9fe';
                                        case '商业职场': return '#fef3c7';
                                        case '人文叙事': return '#dcfce7';
                                        default: return '#f1f5f9';
                                      }
                                    })(),
                                    color: catCol,
                                  }}>
                                  {b.cat || '未分类'}
                                </span>
                              </div>
                              {/* 进度：% + bar */}
                              <div className="flex items-center gap-[8px] min-w-0">
                                <span className="text-[12px] font-bold tabular-nums leading-none flex-shrink-0"
                                  style={{ color: b.st==='done' ? '#16a34a' : statusDot.col }}>{pct}%</span>
                                <div style={{ width: '100%', height:'5px', borderRadius:'999px', background:'#e2e8f0', overflow:'hidden', flex: '1 1 auto' }}>
                                  <div style={{
                                    width: `${Math.max(0, pct)}%`, height: '100%', borderRadius:'999px',
                                    background: b.st === 'done' ? '#22c55e' : b.st === 'abandoned' ? '#8a9491' : pct <= 0 ? 'transparent' : statusDot.col,
                                    transition: 'width 300ms ease-out',
                                  }}/>
                                </div>
                              </div>
                              {/* 日期+已读天数 */}
                              <div className="flex items-center gap-[4px] min-w-0">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#8a9491" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                                  <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
                                </svg>
                                {(() => {
                                  const fmtShort = (d) => {
                                    if (!d) return '';
                                    const s = String(d);
                                    const m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
                                    if (m) return `${m[1].slice(2)}/${String(+m[2]).padStart(2,'0')}/${String(+m[3]).padStart(2,'0')}`;
                                    const m2 = s.replace(/\//g, '-').match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
                                    if (m2) return `${m2[1].slice(2)}/${String(+m2[2]).padStart(2,'0')}/${String(+m2[3]).padStart(2,'0')}`;
                                    return s;
                                  };
                                  const dayDiff = (a, b) => {
                                    try {
                                      const da = new Date(String(a).replace(/-/g,'/'));
                                      const db = new Date(String(b).replace(/-/g,'/'));
                                      if (isNaN(+da) || isNaN(+db)) return 0;
                                      return Math.max(0, Math.round((db - da) / 86400000));
                                    } catch { return 0; }
                                  };
                                  const today = new Date().toISOString().slice(0, 10);
                                  let dateLabel = '';
                                  if (b.st === 'reading') {
                                    if (b.startDate) {
                                      const d = dayDiff(b.startDate, today);
                                      dateLabel = `${fmtShort(b.startDate)} → 今天 · 已读 ${d + 1} 天`;
                                    } else {
                                      dateLabel = '未设置开始日期 · 点卡片设置';
                                    }
                                  } else if (b.st === 'done') {
                                    if (b.startDate && b.endDate) {
                                      const d = dayDiff(b.startDate, b.endDate);
                                      dateLabel = `${fmtShort(b.startDate)} → ${fmtShort(b.endDate)} · 共读 ${d + 1} 天`;
                                    } else if (b.endDate) {
                                      dateLabel = `${fmtShort(b.endDate)} 读完`;
                                    } else {
                                      dateLabel = '已读完';
                                    }
                                  } else if (b.st === 'abandoned') {
                                    dateLabel = b.endDate ? `${fmtShort(b.endDate)} 归档` : '已归档';
                                  } else {
                                    if (b.startDate) dateLabel = `计划 ${fmtShort(b.startDate)} 开启`;
                                    else dateLabel = '待开启 · 点卡片设置日期';
                                  }
                                  return (
                                    <span className="text-[10.5px] font-medium text-ink-400 leading-none truncate">
                                      {dateLabel}
                                    </span>
                                  );
                                })()}
                              </div>
                            </div>
                          </div>

                          {/* 分割线 — 更浅 */}
                          <div style={{ height: 1, background: '#f8fafc', margin: '2px 0' }}></div>

                          {/* 底部：✔思考 / ✔行动 / ✔改变（统一绿色，0数量隐藏）*/}
                          <div className="flex items-center gap-4 min-w-0">
                            {hasIns && (
                              <div className="flex items-center gap-[5px]">
                                <div className={`flex items-center justify-center w-[14px] h-[14px] rounded-[3.5px]`}
                                  style={{ background: '#22c55e' }}>
                                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7"/></svg>
                                </div>
                                <span className="text-[11px] font-semibold text-ink-600 leading-none">思考 {validIns.length} 组</span>
                              </div>
                            )}
                            {hasAct && (
                              <div className="flex items-center gap-[5px]">
                                <div className={`flex items-center justify-center w-[14px] h-[14px] rounded-[3.5px]`}
                                  style={{ background: '#22c55e' }}>
                                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7"/></svg>
                                </div>
                                <span className="text-[11px] font-semibold text-ink-600 leading-none">行动 {validActs.length} 条</span>
                              </div>
                            )}
                            {(() => {
                              const changeCount = (changes || []).filter(c => c.bookId === b.id).length;
                              if (changeCount === 0) return null;
                              return (
                                <div className="flex items-center gap-[5px]">
                                  <div className={`flex items-center justify-center w-[14px] h-[14px] rounded-[3.5px]`}
                                    style={{ background: '#22c55e' }}>
                                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7"/></svg>
                                  </div>
                                  <span className="text-[11px] font-semibold text-ink-600 leading-none">改变 {changeCount} 个</span>
                                </div>
                              );
                            })()}
                            {!hasIns && !hasAct && (() => {
                              const changeCount = (changes || []).filter(c => c.bookId === b.id).length;
                              return changeCount === 0 ? (
                                <span className="text-[10.5px] text-ink-300 leading-none italic">暂无思考与行动</span>
                              ) : null;
                            })()}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })()}
      </div>
      </div>
      {/* ===== 书架看板 END ===== */}

      </div>
      {/* ===== Row 1 (OKR+书架双栏) END ===== */}

      {/* 添加 KR 弹窗（BookForm 风格：20px 圆角 + Section 分组 + 胶囊按钮） */}
      {addingKr && (
        <Modal open onClose={() => setAddingKr(false)} title="新增 KR"
          footer={
            <>
              <button onClick={() => setAddingKr(false)}
                className="px-4 py-1.5 text-[13px] rounded-[10px] transition"
                style={{ background: 'rgba(15,23,42,0.04)', color: '#64748b' }}>取消</button>
              <button onClick={commitAddKr}
                className="px-5 py-1.5 text-[13px] text-white rounded-[10px] transition"
                style={{ background: BLUE, boxShadow: `0 2px 8px ${BLUE}35` }}>添加</button>
            </>
          }>
          <KrFormFields
            lb={newKr.lb} tgt={newKr.tgt} u={newKr.u} sub={newKr.sub}
            onChange={(patch) => setNewKr(prev => ({ ...prev, ...patch }))} />
        </Modal>
      )}

      {/* 编辑 KR 弹窗（BookForm 风格） */}
      {editingKrModal && (
        <Modal open onClose={() => setEditingKrModal(null)} title="编辑 KR"
          footer={
            <>
              <button onClick={() => { if (editingKrModal.kr && confirm('确定删除此 KR？')) { onKrRemove?.(editingKrModal.kr.id); setEditingKrModal(null); } }}
                className="px-4 py-1.5 text-[13px] rounded-[10px] transition"
                style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444' }}>删除</button>
              <div className="flex-1"></div>
              <button onClick={() => setEditingKrModal(null)}
                className="px-4 py-1.5 text-[13px] rounded-[10px] transition"
                style={{ background: 'rgba(15,23,42,0.04)', color: '#64748b' }}>取消</button>
              <button onClick={commitEditKr}
                className="px-5 py-1.5 text-[13px] text-white rounded-[10px] transition"
                style={{ background: BLUE, boxShadow: `0 2px 8px ${BLUE}35` }}>保存</button>
            </>
          }>
          <KrFormFields
            lb={editingKrModal.draft.lb} tgt={editingKrModal.draft.tgt} u={editingKrModal.draft.u} sub={editingKrModal.draft.sub}
            onChange={(patch) => setEditingKrModal(prev => ({ ...prev, draft: { ...prev.draft, ...patch } }))} />
        </Modal>
      )}

      {/* ===== 读后思考 · 思后行动 · 行后改变（三栏横向布局）===== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 pt-2">

        {/* ========== 卡片一：读后思考 ========== */}
        <div className="bg-white rounded-2xl border border-ink-100 p-4 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <span className="w-[5px] h-[18px] rounded-full flex-shrink-0" style={{ background: BLUE }}></span>
              <span className="text-[16px] font-bold text-ink-900 leading-tight">{year}年 · 读后思考</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold px-2 rounded-lg inline-flex items-center h-[26px]" style={{ background: `${BLUE}10`, border: `1px solid ${BLUE}25`, color: BLUE }}>
                {totalInsightCount}组
              </span>
              <button onClick={() => setBookPicker('insights')}
                className="inline-flex items-center justify-center w-[26px] h-[26px] rounded-lg transition flex-shrink-0"
                style={{ background: `${BLUE}10`, border: `1px solid ${BLUE}25`, color: BLUE }}
                title="添加读后思考">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" strokeLinecap="round"/></svg>
              </button>
            </div>
          </div>
          <div className="flex-1 flex flex-col gap-1.5">
            {booksWithInsights.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-6 text-[12px] text-ink-400" style={{ background: 'rgba(15,23,42,0.032)', borderRadius: 12 }}>
                还没写读后思考<br/>点击右上角 + 选择书籍
              </div>
            ) : (
              booksWithInsights.slice(0, 5).map(b => {
                const ins = b.insights || [];
                const validIns = ins.filter(i => i.text?.trim());
                return (
                  <div key={b.id}
                    className="rounded-xl p-2.5 transition-all hover:shadow-md cursor-pointer"
                    style={{ background: '#fff', border: '1px solid rgba(15,23,42,0.08)' }}
                    onClick={() => onBookEdit?.(b, 'insights')}>
                    {/* 分组标题行：实心灯泡 ③ + 书名 · X组 */}
                    <div className="flex items-center gap-1.5 pb-1 mb-1 border-b border-dashed" style={{ borderColor: 'rgba(15,23,42,0.1)' }}>
                      <svg className="w-[14px] h-[14px] flex-shrink-0" fill="none" stroke={BLUE} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                        <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z"/>
                        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                        <path d="M8 7h3M13 7h3"/>
                      </svg>
                      <span className="text-[12px] font-semibold truncate flex-1" style={{ color: BLUE }}>{b.t}</span>
                      <span className="text-[10px] font-medium flex-shrink-0" style={{ color: BLUE }}>{validIns.length}组</span>
                    </div>
                    {/* 所有 insight 条目，每行一条 */}
                    {validIns.slice(0, 3).map((it, idx) => (
                      <div key={it.id || idx} className="text-[11px] text-ink-600 leading-snug line-clamp-1 pl-[22px]">
                        "{it.text}"
                      </div>
                    ))}
                    {validIns.length > 3 && (
                      <div className="text-[10px] text-ink-400 pl-[22px] mt-0.5">+{validIns.length - 3} 条</div>
                    )}
                  </div>
                );
              })
            )}
            {booksWithInsights.length > 5 && (
              <div className="text-center text-[11px] text-ink-400 mt-1">还有 {booksWithInsights.length - 5} 本 · 点击书籍编辑</div>
            )}
          </div>
        </div>

        {/* ========== 卡片二：思后行动（合并书籍中思后行动 + 旧独立changes）========== */}
        <div className="bg-white rounded-2xl border border-ink-100 p-4 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <span className="w-[5px] h-[18px] rounded-full flex-shrink-0" style={{ background: BLUE }}></span>
              <span className="text-[16px] font-bold text-ink-900 leading-tight">{year}年 · 思后行动</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold px-2 rounded-lg inline-flex items-center h-[26px]" style={{ background: `${BLUE}10`, border: `1px solid ${BLUE}25`, color: BLUE }}>
                {[...(bookActionsList || []), ...(changes || [])].length}条
              </span>
              <button onClick={() => setBookPicker('actions')}
                className="inline-flex items-center justify-center w-[26px] h-[26px] rounded-lg transition flex-shrink-0"
                style={{ background: `${BLUE}10`, border: `1px solid ${BLUE}25`, color: BLUE }}
                title="添加行动计划">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" strokeLinecap="round"/></svg>
              </button>
            </div>
          </div>
          {(() => {
            const mergedActions = [...(bookActionsList || []), ...(changes || [])];
            return (
              <div className="flex-1 flex flex-col gap-1.5">
                {mergedActions.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center py-6 text-[12px] text-ink-400" style={{ background: 'rgba(15,23,42,0.032)', borderRadius: 12 }}>
                    还没有行动计划<br/>点击右上角 + 选择书籍
                  </div>
                ) : (
                  // 按 bookTitle 分组渲染（跟读后思考分组逻辑对齐）
                  Object.entries(
                    mergedActions.slice(0, 6).reduce((acc, c) => {
                      const key = c.bookTitle || '__独立__';
                      if (!acc[key]) acc[key] = [];
                      acc[key].push(c);
                      return acc;
                    }, {})
                  ).map(([bookKey, actions]) => (
                    <div key={bookKey}
                      className="rounded-xl p-2.5 transition-all hover:shadow-md"
                      style={{ background: '#fff', border: '1px solid rgba(15,23,42,0.08)' }}>
                      {/* 分组标题：实心灯泡 + 书名（独立行动则不显示书名） */}
                      {bookKey !== '__独立__' && (
                        <div className="flex items-center gap-1.5 pb-1 mb-1 border-b border-dashed" style={{ borderColor: 'rgba(15,23,42,0.1)' }}>
                          <svg className="w-[14px] h-[14px] flex-shrink-0" fill="none" stroke={BLUE} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                            <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z"/>
                            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                            <path d="M8 7h3M13 7h3"/>
                          </svg>
                          <span className="text-[12px] font-semibold truncate flex-1" style={{ color: BLUE }}>{bookKey}</span>
                          <span className="text-[10px] font-medium flex-shrink-0" style={{ color: BLUE }}>{actions.length}条</span>
                        </div>
                      )}
                      {/* 每条行动 */}
                      {actions.map(c => {
                        const fromBook = !!c.__fromBook;
                        const isCompleted = c.done || c.status === 'completed' || c.status === 'reviewed';
                        return (
                          <div key={c.id} className="flex items-start gap-2 py-1">
                            {/* 圆形复选框：未勾选=白底+蓝边，已勾选=蓝色填充白勾 */}
                            <button
                              onClick={(e) => { e.stopPropagation(); onChangeToggleComplete?.(c.id); }}
                              className="flex-shrink-0 mt-[1px] w-[16px] h-[16px] rounded-full flex items-center justify-center transition"
                              style={{
                                background: isCompleted ? BLUE : '#fff',
                                border: `1.5px solid ${BLUE}`,
                              }}
                              title={isCompleted ? '点击取消完成' : '点击标记完成'}>
                              {isCompleted && (
                                <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M20 6L9 17l-5-5" />
                                </svg>
                              )}
                            </button>
                            <span
                              className={`flex-1 text-[12px] leading-snug cursor-pointer truncate ${isCompleted ? 'text-ink-500 line-through' : 'text-ink-900'}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (fromBook) {
                                  const targetBook = (books.length === 0 ? BOOKS : books).find(b => b.id === c.bookId);
                                  if (targetBook) onBookEdit?.(targetBook, 'actions');
                                } else {
                                  setEditingChange(c); setShowChangeForm(true);
                                }
                              }}>
                              {c.text}
                            </span>
                            {!fromBook && (
                              <button onClick={(e) => { e.stopPropagation(); if (confirm('确定删除这条行动？')) onChangeRemove?.(c.id); }}
                                className="text-ink-300 hover:text-red-500 transition flex-shrink-0"
                                title="删除">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round"/>
                                </svg>
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))
                )}
                {mergedActions.length > 6 && (
                  <div className="text-center text-[11px] text-ink-400 mt-1">还有 {mergedActions.length - 6} 条 · 点击书籍/条目编辑管理</div>
                )}
              </div>
            );
          })()}
        </div>

        {/* ========== 卡片三：行后改变 ========== */}
        <div className="bg-white rounded-2xl border border-ink-100 p-4 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <span className="w-[5px] h-[18px] rounded-full flex-shrink-0" style={{ background: BLUE }}></span>
              <span className="text-[16px] font-bold text-ink-900 leading-tight">{year}年 · 行后改变</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold px-2 rounded-lg inline-flex items-center h-[26px]" style={{ background: `${BLUE}10`, border: `1px solid ${BLUE}25`, color: BLUE }}>
                {(reviews || []).length}个
              </span>
              <button onClick={() => {
                // 新增改变：生成新ID，打开编辑弹窗
                const newId = 'rv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
                setEditingReview({
                  id: newId,
                  text: '',
                  bookTitle: '',
                  beforeState: '',
                  afterState: '',
                  nextStep: '',
                  practiceEffect: '',
                  tag: 'cognition',
                  __isNew: true,
                });
              }}
                className="inline-flex items-center justify-center w-[26px] h-[26px] rounded-lg transition flex-shrink-0"
                style={{ background: `${BLUE}10`, border: `1px solid ${BLUE}25`, color: BLUE }}
                title="新增改变">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" strokeLinecap="round"/></svg>
              </button>
            </div>
          </div>
          <div className="flex-1 flex flex-col gap-1.5">
            {(reviews || []).length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-6 text-[12px] text-ink-400" style={{ background: 'rgba(15,23,42,0.032)', borderRadius: 12 }}>
                还没有改变记录<br/>点击右上角 + 手动添加
              </div>
            ) : (
              (reviews || []).slice(0, 5).map(r => {
                // 标签：蓝色明度分层（10% / 28% / 实心），旧数据自动迁移
                const tagMeta = {
                  cognition:    { lb: '认知更新', color: BLUE, bg: `${BLUE}0f`, bd: `${BLUE}25` },
                  habit:        { lb: '长期习惯', color: BLUE, bg: `${BLUE}28`, bd: `${BLUE}45` },
                  internalized: { lb: '已内化', color: '#fff', bg: BLUE, bd: BLUE, solid: true },
                  decision:     { lb: '认知更新', color: BLUE, bg: `${BLUE}0f`, bd: `${BLUE}25` },
                  sop:          { lb: '已内化', color: '#fff', bg: BLUE, bd: BLUE, solid: true },
                };
                const tm = tagMeta[r.tag] || tagMeta.cognition;
                return (
                  <div key={r.id}
                    className="rounded-xl p-2.5 hover:shadow-md transition-all cursor-pointer"
                    style={{ background: '#fff', border: '1px solid rgba(15,23,42,0.08)' }}
                    onClick={() => setEditingReview(r)}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[12px] font-semibold text-ink-900 leading-snug line-clamp-2 flex-1 min-w-0">{r.text || '未命名改变'}</div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded" style={{
                          background: tm.bg, border: `1px solid ${tm.bd}`,
                          color: tm.solid ? '#fff' : tm.color,
                        }}>
                          {tm.lb}
                        </span>
                        <button onClick={(e) => { e.stopPropagation(); if (confirm('确定删除这条改变？')) onReviewRemove?.(r.id); }}
                          className="text-ink-300 hover:text-red-500 transition"
                          title="删除">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                    {r.bookTitle && (
                      <div className="flex items-center gap-1 mt-1 overflow-hidden">
                        <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke={BLUE} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                          <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z"/>
                          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                        </svg>
                        <span className="text-[10px] truncate" style={{ color: BLUE }}>{r.bookTitle}</span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
            {(reviews || []).length > 5 && (
              <div className="text-center text-[11px] text-ink-400 mt-1">还有 {(reviews || []).length - 5} 个 · 点击编辑查看</div>
            )}
          </div>
        </div>
      </div>

      {showChangeForm && (
        <Modal open onClose={() => { setShowChangeForm(false); setEditingChange(null); }} title={editingChange ? '编辑行动改变' : '新增行动改变'}>
          <ChangeForm
            initial={editingChange}
            books={books.length === 0 ? BOOKS : books}
            onSave={(data) => {
              if (editingChange && !editingChange.__isNew) onChangeUpdate?.(data);
              else onChangeAdd?.(data);
              setShowChangeForm(false);
              setEditingChange(null);
            }}
            onCancel={() => { setShowChangeForm(false); setEditingChange(null); }}
            onDelete={editingChange && !editingChange.__isNew ? () => { onChangeRemove?.(editingChange.id); setShowChangeForm(false); setEditingChange(null); } : undefined}
          />
        </Modal>
      )}

      {/* 改变编辑弹窗 */}
      {editingReview && (
        <Modal open onClose={() => setEditingReview(null)} title={editingReview.__isNew ? '新增改变' : '编辑改变'}>
          <ReviewForm
            initial={editingReview}
            books={books.length === 0 ? BOOKS : books}
            onSave={(data) => {
              // 新增改变没有 changeId，补一个 text/daysCompleted 兜底
              const final = { ...data };
              if (!final.text) final.text = '未命名改变';
              if (!final.daysCompleted) final.daysCompleted = 30;
              onReviewUpdate?.(final);
              setEditingReview(null);
            }}
            onCancel={() => setEditingReview(null)}
            onDelete={!editingReview.__isNew ? () => { onReviewRemove?.(editingReview.id); setEditingReview(null); } : undefined}
          />
        </Modal>
      )}

      {/* 读后思考 / 思后行动 · 选书面板 */}
      {bookPicker && (
        <BookPickerModal
          mode={bookPicker}
          books={books.length === 0 ? BOOKS : books}
          onPick={(b) => { const tab = bookPicker; setBookPicker(null); onBookEdit?.(b, tab); }}
          onAddNew={() => { setBookPicker(null); onBookAdd?.(); }}
          onClose={() => setBookPicker(null)}
        />
      )}

      {/* 微信读书 Key 设置弹窗（BookForm 风格） */}
      {showWereadSettings && (
        <Modal open onClose={() => setShowWereadSettings(false)} title="微信读书 · Key 设置"
          footer={
            <>
              <button onClick={() => setShowWereadSettings(false)}
                className="px-4 py-1.5 text-[13px] rounded-[10px] transition"
                style={{ background: 'rgba(15,23,42,0.04)', color: '#64748b' }}>取消</button>
              <button onClick={doWereadSave}
                className="px-5 py-1.5 text-[13px] text-white rounded-[10px] transition"
                style={{ background: BLUE, boxShadow: `0 2px 8px ${BLUE}35` }}>保存</button>
            </>
          }>
          <div className="flex flex-col gap-3">
            <div className="text-[12px] text-ink-500 leading-relaxed px-1">
              前往 <a href="https://weread.qq.com/r/weread-skills" target="_blank" rel="noreferrer" style={{ color: BLUE }} className="underline">weread.qq.com/r/weread-skills</a> 申请 API Key（以 <span className="font-mono text-ink-700">wrk-</span> 开头），用于同步书架书籍及封面图。
            </div>
            <input
              value={wereadKey}
              onChange={(e) => setWereadKey(e.target.value)}
              placeholder="粘贴 API Key，如：wrk_xxxxxxxxxxxxxxxx"
              className="px-3 py-2 text-[13px] rounded-[10px] focus:outline-none font-mono transition"
              style={{ background: '#fff', border: '1px solid rgba(15,23,42,0.08)' }}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ---------- 9. 视图 · 能力 ---------- */
function AbilityView({ abilities, onMsAdd, onMsEdit, onMsToggleDone, onAbilityAdd, scoreHistory, onStartAssessment }) {
  const dynAb = abilities || ABILITY;
  const year = new Date().getFullYear();
  const AB_COLOR = '#f59e0b';
  const AB_DARK = '#b45309';

  /* ===== 能力级派生统计 ===== */
  const abilityStats = useMemo(() => {
    return dynAb.map((a, idx) => {
      const mstones = a.mstones || [];
      const mDone = mstones.filter(m => m.st === 'done').length;
      const mTotal = mstones.length;
      const avgPct = mTotal ? Math.round(mDone / mTotal * 100) : 0;
      const { days, timePct } = calcTimeAnchor(a.deadline, a.createdAt);
      const rm = calcRisk(avgPct, timePct, mTotal && mstones.every(m => m.st === 'done'));
      return { idx, avgPct, rm, days, timePct, mDone, mTotal, dl: daysLabel(days) };
    });
  }, [dynAb]);

  /* ===== Hero 全局风险锚点 ===== */
  const heroStats = useMemo(() => {
    let risk = 0, warn = 0, overdue = 0;
    let earliest = null;
    abilityStats.forEach(as => {
      if (as.rm.q === 'risk') risk++;
      if (as.rm.q === 'warn') warn++;
      if (as.dl.overdue) overdue++;
      if (as.days !== null && as.days >= 0) {
        if (earliest === null || as.days < earliest) earliest = as.days;
      }
    });
    return { risk, warn, overdue, earliest };
  }, [abilityStats]);

  /* ===== 能力卡片（色条+标题+胶囊+加号 / 进度条 / 复选框列表） ===== */
  const renderCard = (a, as) => {
    const AB = AB_COLOR;
    const lagBehind = as.timePct !== null && as.avgPct < as.timePct;
    const mstones = a.mstones || [];

    return (
      <div key={a.id || a.title} className="bg-white rounded-2xl border border-ink-100 hover:shadow-md transition-shadow p-3.5 flex flex-col">
        {/* 标题行：色条 + 16px 标题 | 已勾选/总数胶囊 + 26×26 加号 */}
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-[5px] h-[18px] rounded-full flex-shrink-0" style={{ background: AB }}></span>
            <span className="text-[16px] font-bold leading-tight text-ink-900 truncate">{a.title}</span>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span
              className="inline-flex items-center px-2 h-[26px] rounded-lg text-[11px] font-semibold tabular-nums leading-none"
              style={{ background: `${AB}1a`, border: `1px solid ${AB}40`, color: AB_DARK }}
            >
              <span className="font-extrabold">{as.mDone}</span>
              <span className="mx-0.5 opacity-50">/</span>
              <span className="opacity-70">{as.mTotal}</span>
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); onMsAdd?.(as.idx); }}
              title="添加 KR"
              className="w-[26px] h-[26px] rounded-lg grid place-items-center transition hover:brightness-105 active:scale-95 flex-shrink-0"
              style={{ background: `${AB}1a`, border: `1px solid ${AB}40` }}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke={AB} strokeWidth="2.5" viewBox="0 0 24 24" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
            </button>
          </div>
        </div>

        {/* 进度条：已勾选/总数 = 完成度 */}
        <div className="mb-2.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-semibold text-ink-500 leading-none">总体完成度</span>
            <span className="text-[11px] font-extrabold tabular-nums leading-none" style={{ color: AB_DARK }}>{as.avgPct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-ink-100 overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${as.avgPct}%`, background: AB }}></div>
          </div>
        </div>

        {/* KR 列表：复选框 + 主文字 13px + 子说明 11px；max-h 限高对齐三卡 */}
        {mstones.length === 0 ? (
          <div className="py-4 text-center rounded-xl" style={{ background: 'rgba(15,23,42,0.03)' }}>
            <div className="text-[12px] font-semibold text-ink-400">还没有 KR</div>
            <div className="text-[11px] text-ink-400 mt-1 opacity-80">点击右上角 + 添加</div>
          </div>
        ) : (
          <div className="flex flex-col max-h-[240px] overflow-y-auto">
            {mstones.map((m, i) => {
              const isDone = m.st === 'done';
              return (
                <div
                  key={m.id || i}
                  className="flex items-center gap-2 px-1 py-2 rounded-lg hover:bg-ink-50/50 transition-colors group"
                >
                  {/* 复选框：未勾白底橙边，已勾橙底白勾 —— 与主文字 items-center 居中对齐 */}
                  <button
                    onClick={(e) => { e.stopPropagation(); onMsToggleDone?.({ abilityIdx: as.idx, msIdx: i }); }}
                    className="w-4 h-4 rounded-md grid place-items-center flex-shrink-0 transition-all"
                    style={{
                      background: isDone ? AB : '#fff',
                      border: `1.5px solid ${AB}`,
                    }}
                  >
                    {isDone && (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7"/></svg>
                    )}
                  </button>
                  {/* 文字区：主文字 13px semibold ink-700 —— 对齐知力页 OKR KR 规格；长标题 2 行截断 */}
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={(e) => { e.stopPropagation(); onMsEdit?.(as.idx, i, m); }}>
                    <div className={`text-[13px] font-semibold leading-snug line-clamp-2 ${isDone ? 'text-ink-400 line-through' : 'text-ink-700'}`}>
                      {m.lb}
                    </div>
                    {m.dueBy && (
                      <div className="text-[11px] text-ink-500 mt-0.5 leading-tight">
                        {m.dueBy}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {/* ===== Hero ===== */}
      <div className="glass-card p-5">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="w-[5px] h-[18px] rounded-full flex-shrink-0" style={{ background: '#f59e0b' }}></span>
          <span className="text-[16px] font-bold leading-none text-ink-900">{year}年 · 能力成长</span>
          <div className="flex items-center gap-2 flex-wrap ml-1">
            {heroStats.earliest !== null && (
              <div className="inline-flex items-center gap-1 px-2 py-1 rounded-lg" style={{ background: 'rgba(15,23,42,0.03)', border: '1px solid rgba(15,23,42,0.10)' }}>
                <span className="text-[10px] font-semibold text-ink-400">最近截止</span>
                <span className={`text-[11px] font-extrabold tabular-nums ${daysLabel(heroStats.earliest).cls}`}>
                  {daysLabel(heroStats.earliest).text}
                </span>
              </div>
            )}
            {(heroStats.risk + heroStats.overdue) > 0 && (
              <div className="inline-flex items-center gap-1 px-2 py-1 rounded-lg" style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.25)' }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2"><path d="M12 8v4M12 16h.01"/><circle cx="12" cy="12" r="9"/></svg>
                <span className="text-[10px] font-bold text-rose-500">落后风险</span>
                <span className="text-[11px] font-extrabold tabular-nums leading-none text-rose-600">{heroStats.risk + heroStats.overdue}</span>
              </div>
            )}
            {heroStats.warn > 0 && (
              <div className="inline-flex items-center gap-1 px-2 py-1 rounded-lg" style={{ background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.25)' }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#f59e0b' }}></span>
                <span className="text-[10px] font-bold text-amber-500">略落后</span>
                <span className="text-[11px] font-extrabold tabular-nums leading-none text-amber-600">{heroStats.warn}</span>
              </div>
            )}
            {heroStats.risk === 0 && heroStats.warn === 0 && heroStats.overdue === 0 && (
              <div className="inline-flex items-center gap-1 px-2 py-1 rounded-lg" style={{ background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.25)' }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#15803d" strokeWidth="2.5"><path d="M5 13l4 4L19 7"/></svg>
                <span className="text-[10px] font-bold text-emerald-600">节奏正常</span>
              </div>
            )}
          </div>
          <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
            <button
              onClick={() => onAbilityAdd?.()}
              className="inline-flex items-center gap-1 rounded-xl text-[11px] font-bold px-3 py-1.5 transition hover:brightness-105 active:scale-[0.98]"
              style={{ background: 'rgba(245,158,11,0.15)', color: AB_DARK }}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
              添加能力
            </button>
            <button
              onClick={() => onStartAssessment?.()}
              className="inline-flex items-center rounded-xl text-[11px] font-bold px-3 py-1.5 transition hover:bg-ink-100 active:scale-[0.98]"
              style={{ background: 'rgba(15,23,42,0.03)', border: '1px solid rgba(15,23,42,0.10)', color: '#64748b' }}>
              本月自评
            </button>
          </div>
        </div>
      </div>

      {/* ===== 能力卡片列表：≥xl 屏横向 3 列并排 ===== */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
        {dynAb.map((a, i) => renderCard(a, abilityStats[i]))}
        {dynAb.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed border-ink-200 flex flex-col items-center justify-center gap-2 py-12" style={{ background: 'rgba(15,23,42,0.02)' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#c7c7cc" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="5"/><path d="M15.5 13a6 6 0 1 0-7 0M12 13v6M8 22h8"/></svg>
            <div className="text-[12px] text-ink-400 font-medium">还没有能力目标</div>
            <button
              onClick={() => onAbilityAdd?.()}
              className="inline-flex items-center gap-1 rounded-xl text-[11px] font-bold px-3 py-1.5 transition hover:brightness-105 active:scale-[0.98]"
              style={{ background: 'rgba(245,158,11,0.15)', color: AB_DARK }}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
              添加第一个能力
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- 10. 视图 · 工作 (OKR) ---------- */
function WorkView({ workGoals, onKrAdd, onKrEdit, onRiskTagClick, microActions }) {
  const dynWk = workGoals || WORK;
  const year = new Date().getFullYear();
  const RED = '#ef4444';

  /* —— 对每个目标进行字段兜底 + 派生统计 —— */
  const goalStats = useMemo(() => {
    return dynWk.map((o, idx) => {
      const mode = inferMode(o, 'work');
      const krs = o.krs || [];
      const krPcts = krs.map(k => pct(k.v, k.tgt));
      const avgPct = krs.length ? Math.round(krPcts.reduce((s,p)=>s+p,0) / krs.length) : 0;
      const { days, timePct } = calcTimeAnchor(o.deadline, o.createdAt);
      const rm = calcRisk(avgPct, timePct, krs.length && krs.every(k => k.st === 'done'));

      const risks = { risk: 0, warn: 0, ahead: 0, normal: 0, done: 0 };
      krs.forEach((k, i) => {
        const kPct = krPcts[i];
        // KR 级也可以有 dueBy（微截止），优先 dueBy 算风险，否则用目标级
        const microTA = k.dueBy ? calcTimeAnchor(k.dueBy, o.createdAt || k.dueBy) : { timePct };
        const krm = calcRisk(kPct, microTA.timePct, k.st === 'done');
        risks[krm.q] = (risks[krm.q] || 0) + 1;
      });

      return {
        mode, idx,
        avgPct, rm, days, timePct, risks,
        dl: daysLabel(days),
        label: o.label || (o.core ? '主业' : '副业'),
        color: o.core ? '#ef4444' : '#F97316',
      };
    });
  }, [dynWk]);

  /* —— 全局 Hero 统计：跨所有目标汇总 —— */
  const heroStats = useMemo(() => {
    let risk = 0, warn = 0, overdue = 0, urgent = 0, total = 0;
    goalStats.forEach(gs => {
      risk += gs.risks.risk || 0;
      warn += gs.risks.warn || 0;
      if (gs.dl.overdue) overdue++;
      if (gs.dl.urgent) urgent++;
      total += (gs.risks.risk || 0) + (gs.risks.warn || 0);
    });
    // 最近截止时间（选最早到期且未过期的）
    let earliest = null;
    goalStats.forEach(gs => {
      if (gs.days === null || gs.days < 0) return;
      if (earliest === null || gs.days < earliest) earliest = gs.days;
    });
    return { risk, warn, overdue, urgent, total, earliest };
  }, [goalStats]);

  /* ============================================================
   * Objective 统领层组件（2 行结构 · 适配横向窄卡）
   * R1：色条 + [分类标签 + 范式徽章(显眼)] + O徽标 + O标题（右侧：📅截止）
   * R2：双条进度（时间/实际）+ 里程碑/KR计数 + 风险徽标
   * ============================================================ */
  const renderObjective = (o, gs) => {
    const color = gs.color;
    const lagBehind = gs.timePct !== null && gs.avgPct < gs.timePct;
    const krTotal = (o.krs || []).length;
    const krDone = (o.krs || []).filter(k => k.st === 'done').length;
    const modeMeta = {
      funnel:    { lb: '漏斗',       icon: (<path d="M4 4h16l-6 8v8l-4 0v-8z"/>) },
      dashboard: { lb: '仪表盘',     icon: (<><circle cx="12" cy="13" r="6"/><path d="M12 7v6l4 2M9 3h6"/></>) },
      milestone: { lb: '里程碑门',   icon: (<><path d="M4 20V8l8-4 8 4v12"/><path d="M4 12h16M12 4v16"/></>) },
      balance:   { lb: '平衡雷达',   icon: (<><polygon points="12,3 20,9 17,19 7,19 4,9"/><circle cx="12" cy="12" r="2"/></>) },
    };
    const m = modeMeta[gs.mode] || modeMeta.funnel;
    const topRisk = (gs.risks.risk || 0) > 0 ? { n: gs.risks.risk, c: '#ef4444', l: '落后' }
      : (gs.risks.warn || 0) > 0 ? { n: gs.risks.warn, c: '#f59e0b', l: '预警' }
      : (gs.risks.done === krTotal && krTotal > 0) ? { n: null, c: '#22c55e', l: '已达成' }
      : null;
    return (
      <div className="flex flex-col gap-2 px-1 py-2.5 border-b border-ink-100">
        {/* R1：色条 + 分类标签 + 范式徽章 + O + 标题 | 截止 */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-[5px] h-[18px] rounded-full flex-shrink-0" style={{ background: '#ef4444' }}></span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg flex-shrink-0 text-[10.5px] font-bold"
            style={{ background: `${color}15`, color }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }}></span>
            {gs.label}
          </span>
          {/* 范式徽章：11px + 图标 + 边框高亮，统一 RED */}
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md flex-shrink-0 text-[10.5px] font-bold border"
            style={{ borderColor: '#ef444440', background: '#ef44440D', color: '#ef4444' }}>
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinejoin="round">{m.icon}</svg>
            {m.lb}
          </span>
          <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-[1px] rounded bg-ink-100 text-ink-500 flex-shrink-0">O</span>
          <span className="text-[14px] font-semibold text-ink-800 leading-none truncate min-w-0 flex-1">{o.title}</span>
          <span className={`text-[10.5px] font-semibold flex-shrink-0 ${gs.dl.cls}`}>📅{gs.dl.text}</span>
        </div>
        {/* R2：双条 + KR 计数 + 风险 */}
        <div className="flex items-center gap-2.5 min-w-0">
          {/* 时间条 */}
          <div className="flex flex-col gap-0.5 flex-1 min-w-0">
            <div className="flex items-center justify-between text-[9px] font-bold leading-none">
              <span className="text-ink-400">时间 {gs.timePct ?? '—'}%</span>
              <span style={{ color }}>进度 {gs.avgPct}%</span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-ink-100 overflow-hidden relative">
              <div className="h-full rounded-full bg-ink-300 absolute left-0 top-0" style={{ width: `${gs.timePct ?? 0}%` }}></div>
              <div className="h-full rounded-full absolute left-0 top-0 opacity-80"
                style={{ width: `${gs.avgPct}%`, background: lagBehind && gs.rm.q !== 'done' ? gs.rm.color : color, mixBlendMode: 'multiply' }}></div>
            </div>
          </div>
          <span className="text-[10.5px] font-bold text-ink-500 tabular-nums flex-shrink-0 px-1.5 py-0.5 rounded bg-ink-50">KR {krDone}/{krTotal}</span>
          {topRisk && topRisk.n !== null && (
            <span className="text-[10.5px] font-bold px-1.5 py-0.5 rounded tabular-nums flex-shrink-0 whitespace-nowrap"
              style={{ background: `${topRisk.c}15`, color: topRisk.c }}>
              {topRisk.l}{topRisk.n}
            </span>
          )}
          {topRisk && topRisk.n === null && (
            <span className="tag tag-g flex-shrink-0" style={{ fontSize: '10px' }}>{topRisk.l}</span>
          )}
          {!topRisk && (
            <span className="tag tag-b flex-shrink-0" style={{ fontSize: '10px' }}>节奏正常</span>
          )}
        </div>
      </div>
    );
  };

  /* ============================================================
   * 子渲染器 #1：Funnel 漏斗（窄卡适配版 · 压缩列宽+紧凑排版）
   * ============================================================ */
  const renderFunnelRows = (o, gs, goalIdx) => {
    const krs = o.krs || [];
    const COLOR = gs.color;
    return (
      <div className="flex flex-col pt-1.5">
        {/* 表头（压缩列宽：# 20 / KR 88 / 进度 flex-1 / % 34 / 数 44） */}
        <div className="flex items-center gap-2 px-1 py-1 rounded-t-lg bg-ink-50/50 text-[10px] font-bold text-ink-500">
          <div className="w-[22px] text-right">#</div>
          <div className="w-[88px] pl-0.5">KR</div>
          <div className="flex-1 min-w-0 flex items-center justify-center">漏斗</div>
          <div className="w-[34px] text-right pr-0.5">%</div>
          <div className="w-[44px] text-right pr-0.5">v/tgt</div>
        </div>

        {/* KR 内容行（窄卡压缩版） */}
        {krs.map((kr, i) => {
          const nextKr = krs[i + 1];
          const krPct = pct(kr.v, kr.tgt);
          const done = kr.st === 'done';
          const microTA = kr.dueBy ? calcTimeAnchor(kr.dueBy, o.createdAt || kr.dueBy) : { timePct: gs.timePct };
          const rm = calcRisk(krPct, microTA.timePct, done);
          const statusDot = done ? '#22c55e' : kr.st === 'doing' ? RED : '#c7c7cc';
          const krId = kr.id || `${goalIdx}-${i}`;
          const ma = microActions?.[krId] || [];
          const maDone = ma.filter(x => x.done).length;
          const canBreakdown = rm.q === 'risk' || rm.q === 'warn';
          const prevKr = krs[i - 1];
          let conv = null;
          if (prevKr) {
            const base = prevKr.v > 0 ? prevKr.v : (prevKr.tgt || 0);
            if (base > 0) conv = Math.min(100, Math.round((kr.v / base) * 100));
            else if (kr.tgt > 0 && prevKr.tgt > 0) conv = Math.round((kr.tgt / prevKr.tgt) * 100);
          }
          const lowConv = conv !== null && conv < 50;

          if (done) {
            return (
              <div key={i} className="flex flex-col">
                <div className="flex items-center gap-2 px-1 py-1.5 rounded-xl hover:bg-ink-50/60 cursor-pointer transition-colors"
                  onClick={() => onKrEdit?.(goalIdx, i, kr)}>
                  <div className="w-[22px] text-right">
                    <span className="inline-grid place-items-center w-4 h-4 rounded-full" style={{ background: 'rgba(34,197,94,0.15)' }}>
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3"><path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </span>
                  </div>
                  <div className="w-[88px] pl-0.5 min-w-0">
                    <div className="text-[10.5px] text-ink-400 line-through truncate font-semibold">{kr.t}</div>
                  </div>
                  <div className="flex-1 min-w-0 h-[18px] rounded overflow-hidden relative opacity-40 bg-ink-100">
                    <div className="h-full w-full" style={{ background: '#22c55e' }}></div>
                    <div className="absolute inset-0 flex items-center justify-end pr-1.5">
                      <span className="text-[9.5px] font-extrabold text-white drop-shadow tabular-nums">{kr.tgt}</span>
                    </div>
                  </div>
                  <div className="w-[34px] text-right pr-0.5">
                    <span className="text-[10.5px] font-extrabold tabular-nums text-accent-green">100%</span>
                  </div>
                  <div className="w-[44px] text-right pr-0.5">
                    <span className="text-[10.5px] font-bold tabular-nums text-ink-700">{kr.v}</span>
                    <span className="text-[9px] font-medium text-ink-400">/</span>
                    <span className="text-[9.5px] font-medium tabular-nums text-ink-500">{kr.tgt}</span>
                  </div>
                </div>
              </div>
            );
          }

          return (
            <div key={i} className="flex flex-col">
              <div className="flex items-center gap-2 px-1 py-1 rounded-xl hover:bg-ink-50/60 cursor-pointer transition-colors"
                onClick={() => onKrEdit?.(goalIdx, i, kr)}>
                <div className="w-[22px] text-right tabular-nums leading-none">
                  <span className="text-[11px] font-bold tabular-nums leading-none" style={{ color: '#ef4444' }}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                </div>
                <div className="w-[88px] pl-0.5 min-w-0 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: statusDot }}></span>
                  <span className="text-[11.5px] font-semibold text-ink-800 truncate leading-tight">{kr.t}</span>
                </div>
                <div className="flex-1 min-w-0 h-[20px] rounded overflow-hidden relative" style={{ background: `${COLOR}10` }}>
                  <div className="h-full" style={{ width: `${krPct}%`, background: statusDot }}></div>
                  <div className="absolute inset-0 flex items-center justify-end pr-1.5">
                    <span className="text-[10px] font-extrabold tabular-nums text-white drop-shadow">{kr.v}</span>
                  </div>
                </div>
                <div className="w-[34px] text-right pr-0.5">
                  <span className="text-[10.5px] font-extrabold tabular-nums"
                    style={{
                      color: krPct < (gs.timePct !== null ? Math.max(gs.timePct - 5, 0) : 50)
                        ? '#dc2626' : rm.color
                    }}>
                    {krPct}%
                  </span>
                </div>
                <div className="w-[44px] text-right pr-0.5 flex items-center justify-end gap-0.5">
                  <span className="text-[10.5px] font-bold tabular-nums text-ink-700">{kr.v}</span>
                  <span className="text-[9px] font-medium text-ink-400">/</span>
                  <span className="text-[9.5px] font-medium tabular-nums text-ink-500">{kr.tgt}</span>
                  {canBreakdown && (
                    <button
                      className="text-[9px] font-bold px-0.5 py-[1px] rounded transition -mr-0.5"
                      style={{ background: rm.color + '22', color: rm.color }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onRiskTagClick?.(goalIdx, i, kr, { title: o.title, deadline: o.deadline, createdAt: o.createdAt }, rm);
                      }}
                    >
                      {ma.length ? `${maDone}/${ma.length}` : '+'}
                    </button>
                  )}
                </div>
              </div>

              {nextKr && nextKr.st !== 'done' && (
                <div className="flex items-center gap-2 px-1 py-0.5 text-[10px]">
                  <div className="w-[22px]"></div>
                  <div className="w-[88px] pl-[24px] flex items-center">
                    <svg className="w-2.5 h-2.5" style={{ color: '#8a9491' }} fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 5v14M5 12l7 7 7-7" />
                    </svg>
                  </div>
                  <div className="flex-1 flex items-center justify-center">
                    <span className="font-bold tabular-nums" style={{ color: lowConv ? '#dc2626' : '#8a9491' }}>
                      {conv ?? 0}%
                    </span>
                  </div>
                  <div className="w-[34px] invisible pr-0.5 text-right"><span>99%</span></div>
                  <div className="w-[44px] invisible pr-0.5 text-right"><span>99/99</span></div>
                </div>
              )}
            </div>
          );
        })}

        {/* 添加 KR */}
        <div className="mt-1.5 pt-0.5 pl-[110px]">
          <AddButton compact label="添加 KR" onClick={() => onKrAdd?.(goalIdx)} />
        </div>
      </div>
    );
  };

  /* ============================================================
   * 子渲染器 #2：Dashboard 仪表盘（原名KPI仪表盘）
   * 强调：先 O 统领（已在上层 renderObjective 渲染），下方为 KPI 条目并排网格
   * 无漏斗转化率；风险色直接编码 KR 进度与时间锚点的落差
   * ============================================================ */
  const renderDashboardRows = (o, gs, goalIdx) => {
    const krs = o.krs || [];
    const items = krs.map((kr, i) => {
      const krPct = pct(kr.v, kr.tgt);
      const microTA = kr.dueBy ? calcTimeAnchor(kr.dueBy, o.createdAt || kr.dueBy) : { timePct: gs.timePct };
      const rm = calcRisk(krPct, microTA.timePct, kr.st === 'done');
      return { kr, i, krPct, rm, microTA };
    });
    // 严重/略落后排在前，进行中次之，已完成折叠到最后
    const sorted = [...items].sort((a, b) => {
      const order = { risk: 0, warn: 1, normal: 2, ahead: 3, done: 4 };
      return (order[a.rm.q] ?? 0) - (order[b.rm.q] ?? 0);
    });
    // 拆成未完成组（显示完整）和已完成组（折叠成一行）
    const active = sorted.filter(x => x.rm.q !== 'done');
    const done = sorted.filter(x => x.rm.q === 'done');

    return (
      <div className="flex flex-col pt-2">
        {/* 网格布局：每个 KR = 独立 KPI 小卡；2~3列，紧凑信息密度
         * 头部：KPI名 + 风险徽标
         * 中部：大数字当前/目标 + 大进度条
         * 底部：%数值 + 微截止dueBy（当有）
         */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {active.map(({ kr, i, krPct, rm, microTA }) => {
            const krId = kr.id || `${goalIdx}-${i}`;
            const ma = microActions?.[krId] || [];
            const maDone = ma.filter(x => x.done).length;
            const canBreakdown = rm.q === 'risk' || rm.q === 'warn';
            const dueLbl = kr.dueBy ? daysLabel(calcTimeAnchor(kr.dueBy, o.createdAt || kr.dueBy).days) : null;
            return (
              <div
                key={i}
                className="bg-white rounded-2xl border border-ink-100 px-3 py-3 hover:shadow-[0_2px_6px_rgba(17,24,39,0.05)] transition-shadow cursor-pointer"
                onClick={() => onKrEdit?.(goalIdx, i, kr)}
                style={{
                  borderLeft: `3px solid ${rm.color}`,
                }}
              >
                {/* 头部：KPI名 + 风险徽标 */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: rm.color }}></span>
                    <span className="text-[11.5px] font-semibold text-ink-800 truncate leading-tight">{kr.t}</span>
                  </div>
                  <button
                    className="text-[9.5px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap transition flex-shrink-0"
                    style={{ background: rm.color + '1A', color: rm.color }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (canBreakdown) onRiskTagClick?.(goalIdx, i, kr, { title: o.title, deadline: o.deadline, createdAt: o.createdAt }, rm);
                    }}
                  >
                    {rm.label}{canBreakdown && ma.length ? ` ${maDone}/${ma.length}` : ''}
                  </button>
                </div>

                {/* 中部：当前/目标大数字 + 进度条 */}
                <div className="flex items-baseline gap-1 mb-1.5">
                  <span className="text-[18px] font-extrabold tabular-nums text-ink-900 leading-none">{kr.v}</span>
                  <span className="text-[11px] font-medium text-ink-400">/</span>
                  <span className="text-[11px] font-medium text-ink-500 tabular-nums">{kr.tgt}</span>
                  <span className="ml-auto text-[12px] font-extrabold tabular-nums leading-none" style={{ color: rm.color }}>
                    {krPct}%
                  </span>
                </div>
                <div className="w-full">
                  <ProgressBar value={krPct} color={rm.color} />
                </div>

                {/* 底部：时间进度 vs KR 落差微提示 + dueBy */}
                <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-dashed border-ink-100">
                  {microTA.timePct !== null ? (
                    <span className="text-[9.5px] font-semibold" style={{ color: krPct < microTA.timePct - 5 ? '#ef4444' : '#8a9491' }}>
                      时间 {microTA.timePct}% {krPct < microTA.timePct - 5 ? `↓${microTA.timePct - krPct}%` : krPct > microTA.timePct + 5 ? `↑${krPct - microTA.timePct}%` : '节奏匹配'}
                    </span>
                  ) : <span className="text-[9.5px] text-ink-400">长期KPI</span>}
                  {dueLbl && (
                    <span className={`text-[9.5px] font-semibold ${dueLbl.cls}`}>📅 {dueLbl.text}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* 已完成折叠单行组（所有已完成 KPI 合并一行） */}
        {done.length > 0 && (
          <div className="mt-3 px-3 py-2 rounded-lg bg-accent-green/[0.04] border border-accent-green/15 flex items-center gap-2 flex-wrap">
            <span className="text-[10.5px] font-bold text-accent-green">✓ 已达成 KPI {done.length} 项：</span>
            {done.map(({ kr, i }) => (
              <span key={i} className="inline-flex items-center gap-1 text-[10.5px] text-ink-500 line-through font-medium px-1.5 py-0.5 rounded bg-ink-50">
                {kr.t}
                <span className="text-accent-green tabular-nums no-underline font-bold">{kr.v}/{kr.tgt}</span>
              </span>
            ))}
          </div>
        )}

        <div className="mt-3">
          <AddButton compact label="添加 KPI 条目" onClick={() => onKrAdd?.(goalIdx)} />
        </div>
      </div>
    );
  };

  /* ============================================================
   * 子渲染器 #3：Milestone 里程碑门
   * 结构：阶段门编号 ● 标题 + 产出物 + 验收通过勾选
   * 每个里程碑显示：startedAt / 产出物描述 / 验收状态
   * ============================================================ */
  const renderMilestoneRows = (o, gs, goalIdx) => {
    const krs = o.krs || [];
    // 用 st==done 表示已通过门；doing=进行中；tg/pending=未开始
    return (
      <div className="flex flex-col pt-2">
        {/* 表头 */}
        <div className="flex items-center gap-3 px-1 py-1.5 rounded-t-lg bg-ink-50/50 text-[11px] font-bold text-ink-500">
          <div className="w-[22px] text-center">门</div>
          <div className="flex-1 min-w-0 pl-1">里程碑</div>
          <div className="w-[60px] text-center">阶段进度</div>
          <div className="w-[42px] text-right pr-1">验收</div>
          <div className="w-[56px] text-right pr-1">截止</div>
        </div>

        {krs.map((kr, i) => {
          const krPct = pct(kr.v, kr.tgt);
          const microTA = kr.dueBy ? calcTimeAnchor(kr.dueBy, o.createdAt || kr.dueBy) : { timePct: gs.timePct, days: null };
          const rm = calcRisk(krPct, microTA.timePct, kr.st === 'done');
          const isDone = kr.st === 'done';
          const dueLbl = microTA.days !== undefined ? daysLabel(microTA.days) : daysLabel(gs.days);
          return (
            <div
              key={i}
              className="flex items-center gap-3 px-1 py-2 rounded-xl hover:bg-ink-50/60 cursor-pointer border-b border-ink-100 last:border-b-0 transition-colors"
              onClick={() => onKrEdit?.(goalIdx, i, kr)}
            >
              {/* 门编号 + 连接线：未通过 空心→半实；通过 实心绿 */}
              <div className="w-[22px] flex justify-center">
                <div
                  className="w-6 h-6 rounded-full grid place-items-center font-extrabold text-[10px] flex-shrink-0"
                  style={{
                    background: isDone ? '#22c55e20' : rm.color + '15',
                    color: isDone ? '#15803d' : rm.color,
                    border: `1.5px solid ${isDone ? '#22c55e' : rm.color}`,
                  }}
                >
                  {isDone ? (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 13l4 4L19 7"/></svg>
                  ) : String(i + 1)}
                </div>
              </div>
              {/* 里程碑标题（O 的阶段子项） */}
              <div className="flex-1 min-w-0 pl-1">
                <div className={`text-[11.5px] font-semibold truncate leading-tight ${isDone ? 'text-ink-400 line-through' : 'text-ink-800'}`}>
                  {kr.t}
                </div>
                {!isDone && kr.v !== undefined && kr.tgt && (
                  <div className="text-[9.5px] font-medium text-ink-400 mt-0.5 truncate">
                    当前进展 {kr.v}/{kr.tgt} · {rm.label}
                  </div>
                )}
              </div>
              {/* 阶段进度条（简单，因为门控是布尔通过/不通过，进度为中间值） */}
              <div className="w-[60px] grid place-items-center">
                <div className="w-[52px] h-1.5 rounded-full bg-ink-100 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${krPct}%`, background: isDone ? '#22c55e' : rm.color }}></div>
                </div>
              </div>
              {/* 验收门结果 */}
              <div className="w-[42px] text-right pr-1">
                {isDone ? (
                  <span className="tag tag-g" style={{ fontSize: '9.5px' }}>已通过</span>
                ) : krPct >= 100 ? (
                  <span className="tag tag-y" style={{ fontSize: '9.5px' }}>待验收</span>
                ) : kr.st === 'tg' || kr.st === 'pending' ? (
                  <span className="tag tag-n" style={{ fontSize: '9.5px' }}>未开启</span>
                ) : (
                  <span className="tag tag-b" style={{ fontSize: '9.5px' }}>推进中</span>
                )}
              </div>
              {/* 截止 */}
              <div className={`w-[56px] text-right pr-1 text-[10.5px] font-medium tabular-nums ${dueLbl.cls}`}>
                {dueLbl.text}
              </div>
            </div>
          );
        })}

        <div className="mt-3">
          <AddButton compact label="添加阶段里程碑" onClick={() => onKrAdd?.(goalIdx)} />
        </div>
      </div>
    );
  };

  /* ============================================================
   * 统一分派器：根据 mode 选渲染器（balance 雷达暂未实现，fallback dashboard）
   * ============================================================ */
  const renderByMode = (o, gs, goalIdx) => {
    switch (gs.mode) {
      case 'funnel':    return renderFunnelRows(o, gs, goalIdx);
      case 'milestone': return renderMilestoneRows(o, gs, goalIdx);
      case 'dashboard': // KPI 仪表盘（已改名）
      case 'balance':   // 平衡雷达暂不做，先退化成仪表盘网格
      default:          return renderDashboardRows(o, gs, goalIdx);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* ===== Hero：风险锚点 + 添加目标入口 ===== */}
      <div className="glass-card p-5">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="w-[5px] h-[18px] rounded-full flex-shrink-0" style={{ background: '#ef4444' }}></span>
          <span className="text-[16px] font-bold leading-none text-ink-900">{year}年 · 工作 OKR</span>
          <div className="flex items-center gap-2 flex-wrap ml-1">
            {heroStats.earliest !== null && (
              <div className="inline-flex items-center gap-1 px-2 py-1 rounded-lg" style={{ background: 'rgba(148,163,184,0.10)', border: '1px solid rgba(148,163,184,0.25)' }}>
                <span className="text-[10px] font-bold text-ink-400">最近截止</span>
                <span className={`text-[11.5px] font-extrabold tabular-nums ${daysLabel(heroStats.earliest).cls}`}>
                  {daysLabel(heroStats.earliest).text}
                </span>
              </div>
            )}
            {heroStats.risk > 0 && (
              <div className="inline-flex items-center gap-1 px-2 py-1 rounded-lg" style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.25)' }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#ef4444' }}></span>
                <span className="text-[10px] font-bold text-rose-500">落后</span>
                <span className="text-[11.5px] font-extrabold tabular-nums leading-none text-rose-600">{heroStats.risk}</span>
              </div>
            )}
            {heroStats.warn > 0 && (
              <div className="inline-flex items-center gap-1 px-2 py-1 rounded-lg" style={{ background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.25)' }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#f59e0b' }}></span>
                <span className="text-[10px] font-bold text-amber-500">预警</span>
                <span className="text-[11.5px] font-extrabold tabular-nums leading-none text-amber-600">{heroStats.warn}</span>
              </div>
            )}
            {heroStats.overdue > 0 && (
              <div className="inline-flex items-center gap-1 px-2 py-1 rounded-lg" style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.25)' }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2"><path d="M12 8v4M12 16h.01"/><circle cx="12" cy="12" r="9"/></svg>
                <span className="text-[10px] font-bold text-rose-500">过期</span>
                <span className="text-[11.5px] font-extrabold tabular-nums leading-none text-rose-600">{heroStats.overdue}</span>
              </div>
            )}
            {heroStats.total === 0 && (
              <div className="inline-flex items-center gap-1 px-2 py-1 rounded-lg" style={{ background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.25)' }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#15803d" strokeWidth="2.5"><path d="M5 13l4 4L19 7"/></svg>
                <span className="text-[10px] font-bold text-emerald-600">节奏正常</span>
              </div>
            )}
          </div>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('annual-open-work-goal'))}
            className="ml-auto inline-flex items-center gap-1 rounded-xl text-[11px] font-bold px-3 py-1.5 transition hover:brightness-105 active:scale-[0.98]"
            style={{ background: 'rgba(239,68,68,0.10)', color: '#ef4444' }}>
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
            添加目标
          </button>
        </div>
      </div>

      {/* ===== 卡片横向一排：≥lg 屏 2 列并排 ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {dynWk.map((o, i) => {
          const gs = goalStats[i];
          return (
            <div key={o.id || o.title + i} className="bg-white rounded-2xl border border-ink-100 shadow-[0_1px_2px_rgba(17,24,39,0.03)] hover:shadow-[0_2px_6px_rgba(17,24,39,0.05)] transition-shadow p-3.5 flex flex-col">
              {renderObjective(o, gs)}
              {renderByMode(o, gs, i)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- 11. 视图 · 生活 ---------- */
function LifeView({ lifeData, onEntryAdd, onEntryEdit, onStartHighlights, highlightedIds }) {
  const dynLife = lifeData || LIFE;
  const totalEntries = dynLife.reduce((s, c) => s + c.entries.length, 0);
  // 生活模块完成率：有记录的类目数 / 总类目数 * 100（体验型鼓励每个类目都有内容）
  const lifePct = Math.round((dynLife.filter(c => c.entries.length > 0).length / dynLife.length) * 100);
  const hlCount = Array.isArray(highlightedIds) ? highlightedIds.length : 0;
  return (
    <div className="flex flex-col gap-4">
      {/* Step1-4 L1区块：紫条 + 16px标题 + 紫胶囊%，与其他4模块一致 */}
      <div className="bg-white rounded-2xl border border-ink-100 p-5 flex flex-col gap-3">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="w-[5px] h-[18px] rounded-full flex-shrink-0" style={{ background: '#8b5cf6' }}></span>
          <span className="text-[16px] font-bold text-ink-900 leading-none">{new Date().getFullYear()}年 · 生活珍藏</span>
          <div className="flex items-baseline gap-0.5 px-2.5 py-1 rounded-lg whitespace-nowrap"
            style={{ background: 'rgba(139,92,246,0.12)' }}>
            <span className="text-[15px] font-extrabold tabular-nums leading-none" style={{ color: '#8b5cf6' }}>{lifePct}</span>
            <span className="text-[10.5px] font-bold leading-none" style={{ color: 'rgba(139,92,246,0.85)' }}>%</span>
          </div>
          {/* 年度精选 CTA（Step2-3 牵引入口） */}
          <button
            onClick={() => onStartHighlights?.()}
            disabled={totalEntries === 0}
            className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold rounded-md transition hover:brightness-105 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)', color: '#fff', boxShadow: '0 1px 3px rgba(139,92,246,0.25)' }}>
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" strokeLinejoin="round" strokeLinecap="round"/>
            </svg>
            年度精选{hlCount > 0 && <span className="opacity-95">· {hlCount}</span>}
          </button>
        </div>
        {/* P2-2: 生活统计条 - 已按要求删除 */}
        <div className="grid grid-cols-5 gap-3 annual-life-grid">
          {dynLife.map((c, ci) => (
            <div key={c.key} className="bg-white border border-ink-100 rounded-2xl p-4 flex flex-col hover:border-ink-200 hover:shadow-[0_2px_8px_rgba(17,24,39,0.04)] transition-all">
              {/* 卡片头部：紫色图标 + 标题 + 数量 + 右上角添加按钮 */}
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg grid place-items-center flex-shrink-0"
                  style={{ background: 'rgba(139,92,246,0.12)', color: '#8b5cf6' }}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    {c.key === 'relation' && (<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>)}
                    {c.key === 'food' && (<><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/></>)}
                    {c.key === 'travel' && (<><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></>)}
                    {c.key === 'movie' && (<><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></>)}
                    {c.key === 'shop' && (<><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></>)}
                  </svg>
                </div>
                <span className="text-[15px] font-semibold text-ink-900 leading-none">{c.lb}</span>
                <span className="text-[12px] font-semibold tabular-nums text-ink-500">· {c.entries.length}</span>
                {/* 右上角添加按钮 */}
                <button onClick={() => onEntryAdd?.(ci, c.lb)} className="ml-auto w-7 h-7 rounded-lg grid place-items-center text-ink-400 hover:text-[#8b5cf6] hover:bg-[rgba(139,92,246,0.08)] transition cursor-pointer">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" strokeLinecap="round"/></svg>
                </button>
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
              {c.entries.map((e, i) => {
                const hl = Array.isArray(highlightedIds) && highlightedIds.includes(e.id);
                return (
                  <div key={i} onClick={() => onEntryEdit?.(ci, i, e)} className="p-2.5 rounded-xl border border-ink-100 hover:border-surface hover:bg-surface-soft transition cursor-pointer relative">
                    {hl && (
                      <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full grid place-items-center"
                        style={{ background: 'linear-gradient(135deg,#8b5cf6,#ec4899)', color: '#fff', boxShadow: '0 1px 3px rgba(139,92,246,0.35)' }}
                        title="年度精选">
                        <svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                      </div>
                    )}
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-xs font-semibold text-ink-900 leading-snug flex-1 min-w-0">{e.t}</div>
                      <div className="text-[11px] font-semibold text-ink-400 tabular-nums flex-shrink-0">{e.d}</div>
                    </div>
                    {e.n && <div className="text-[11px] text-ink-500 leading-relaxed mt-1">{e.n}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
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
          <span className="text-[11px] font-bold tabular-nums" style={{color: c.color}}>{progress}%</span>
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
  const [books, setBooks] = usePersistentState('annual_books_v12', () => BOOKS.map(b => ({ ...b, id: uid() })));
  // 安全网：防止 books 被意外清空
  useEffect(() => {
    if (Array.isArray(books) && books.length === 0) {
      setBooks(BOOKS.map(b => ({ ...b, id: uid() })));
    }
  }, [books?.length]);
  const [abilities, setAbilities] = usePersistentState('annual_abilities_v2', () => ABILITY.map(a => ({ ...a, id: uid(), mstones: a.mstones.map(m => ({ ...m, id: uid() })) })));
  const [workGoals, setWorkGoals] = usePersistentState('annual_work', () => WORK.map(o => ({ ...o, krs: o.krs.map(k => ({ ...k, id: uid(), st: k.st === 'tg' ? 'pending' : k.st })) })));
  const [lifeData, setLifeData] = usePersistentState('annual_life', () => LIFE.map(c => ({ ...c, entries: c.entries.map(e => ({ ...e, id: uid() })) })));
  // 精力习惯 - 用户自定义年度目标（覆盖默认推断值 120/230）
  const [habitTargets, setHabitTargets] = usePersistentState('annual_habit_targets', () => ({}));
  // 能力自评历史 - 每月记录一次分数，key: ability.id, value: {[YYYY-MM]: score}
  const [abilityScoreHistory, setAbilityScoreHistory] = usePersistentState('annual_ability_score_history', () => ({}));
  // 工作 KR 微动作拆解 - key: kr.id, value: [{id, text, deadline, done, createdAt}]
  const [workKrMicroActions, setWorkKrMicroActions] = usePersistentState('annual_work_kr_microactions', () => ({}));
  // 生活·年度精选 - 收藏的条目ID列表
  const [lifeHighlightedIds, setLifeHighlightedIds] = usePersistentState('annual_life_highlights', () => []);
  // 知力 OKR - O 与 KR 列表均支持编辑增删
  const [cogObjective, setCogObjective] = usePersistentState('annual_cog_o', () => COG_O);
  const [cogKrs, setCogKrs] = usePersistentState('annual_cog_krs', () => COG_KRS.map(k => ({ ...k, id: k.id || uid() })));
  // KR 数据迁移：确保默认 5 个 KR（kr0-kr4）全部存在，旧用户可能只有 kr1-kr3
  React.useEffect(() => {
    const defaultIds = COG_KRS.map(k => k.id);
    const existingIds = (cogKrs || []).map(k => k.id);
    const missing = defaultIds.filter(id => !existingIds.includes(id));
    if (missing.length > 0) {
      const toAdd = COG_KRS.filter(k => missing.includes(k.id)).map(k => ({ ...k, id: k.id || uid() }));
      setCogKrs([...(cogKrs || []), ...toAdd]);
    }
  }, [cogKrs]);
  // 知力 · 漏斗顶部标题与备注（主标题"转化漏斗"+右侧说明"阅读→笔记→践行"），支持点击编辑
  const [funnelHeader, setFunnelHeader] = usePersistentState('annual_cog_funnel_header', () => ({ title: '转化漏斗', sub: '输入→思考→行动→改变' }));
  // 知力 · 漏斗四层阶段的自定义文字（label/sub/convLabel），刷新不丢
  // — 结构：{ total: {label, sub, convLabel}, done: {...}, notes: {...}, changes: {...} }
  // — 仅存文字，count 从书架/KR数据联动，不保存在这里
  const [funnelStageLabels, setFunnelStageLabels] = usePersistentState('annual_cog_funnel_stages_labels', () => ({}));
  // 知力 · 书架标题（如"2026年 · 书架"），支持自定义
  const [bookshelfTitle, setBookshelfTitle] = usePersistentState('annual_cog_bookshelf_title', () => `${new Date().getFullYear()}年 · 书架`);
  // 知力 · 行动改变（承诺本）— {id, bookId, bookTitle, insightId, insightText, resonance, text, startDate, targetDays, checkIns[], status}
  const [cogChanges, setCogChanges] = usePersistentState('annual_cog_changes', () => []);
  // 知力 · 改变证明（结果区·改变）— {id, changeId, text, bookTitle, insightText, daysCompleted, beforeState, afterState, nextStep, tag, createdAt}
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
      // 核心4模块
      books, abilities, workGoals, lifeData,
      // 精力·习惯目标
      habitTargets,
      // Step2新增：能力/工作/生活3份牵引态数据
      abilityScoreHistory, workKrMicroActions, lifeHighlightedIds,
      // 知力·完整状态（目标/KR/漏斗文字/承诺本/改变）
      cogObjective, cogKrs, funnelHeader, funnelStageLabels, bookshelfTitle,
      cogChanges, cogReviews,
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
  }, [books, abilities, workGoals, lifeData, habitTargets, abilityScoreHistory, workKrMicroActions, lifeHighlightedIds, cogObjective, cogKrs, funnelHeader, funnelStageLabels, bookshelfTitle, cogChanges, cogReviews, showToast]);

  const handleImport = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setConfirmDialog({
      title: '确认导入数据？',
      message: '将覆盖当前所有年度规划数据（书籍/能力/工作/生活/习惯目标/自评历史/知力目标&承诺&改变/风险拆解/生活精选），此操作无法撤销。',
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
          // Step2新增：能力自评、工作拆解、生活精选
          if (data.abilityScoreHistory !== undefined) setAbilityScoreHistory(data.abilityScoreHistory);
          if (data.workKrMicroActions !== undefined) setWorkKrMicroActions(data.workKrMicroActions);
          if (data.lifeHighlightedIds !== undefined) setLifeHighlightedIds(data.lifeHighlightedIds);
          // 知力全量
          if (data.cogObjective !== undefined) setCogObjective(data.cogObjective);
          if (data.cogKrs !== undefined) setCogKrs(data.cogKrs);
          if (data.funnelHeader !== undefined) setFunnelHeader(data.funnelHeader);
          if (data.funnelStageLabels !== undefined) setFunnelStageLabels(data.funnelStageLabels);
          if (data.bookshelfTitle !== undefined) setBookshelfTitle(data.bookshelfTitle);
          if (data.cogChanges !== undefined) setCogChanges(data.cogChanges);
          if (data.cogReviews !== undefined) setCogReviews(data.cogReviews);
          showToast('✅ 年度数据已导入');
        } catch (err) {
          console.error(err);
          showToast('❌ 导入失败：文件格式不正确');
        }
        setConfirmDialog(null);
      },
      onCancel: () => setConfirmDialog(null),
    });
  }, [setBooks, setAbilities, setWorkGoals, setLifeData, setHabitTargets, setAbilityScoreHistory, setWorkKrMicroActions, setLifeHighlightedIds, setCogObjective, setCogKrs, setFunnelHeader, setFunnelStageLabels, setBookshelfTitle, setCogChanges, setCogReviews, showToast]);

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
    } else if (out.st === 'abandoned') {
      // 显式弃读：保留原值，不自动跳状态
      out.pct = pctNum;
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
      const labelMap = { done: '已读完', reading: '阅读中', pending: '未开始', abandoned: '已归档' };
      showToast(`已移至「${labelMap[targetSt] || targetSt}」`);
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
      if (data.bookId) {
        setBooks(prev => prev.map(b => b.id === data.bookId ? { ...b, hasAction: true } : b));
      }
      showToast('行动改变已添加');
    },
    update: (data) => {
      if (!data?.id) return;
      setCogChanges(prev => prev.map(c => c.id === data.id ? { ...c, ...data } : c));
      showToast('行动改变已更新');
    },
    // 复选框 toggle：点击切换完成/未完成状态（不是打卡次数）
    // 支持两条路径：独立行动（cogChanges）和书籍内嵌行动（books[].actions）
    toggleComplete: (id) => {
      // 从书籍内嵌 action 的 id 里解析：格式 {bookId}_act_{actionIdOrIdx}
      const m = id.match(/^(.+)_act_(.+)$/);
      if (m) {
        // 书籍内嵌路径 → 改 books
        const bookId = m[1];
        const actionKey = m[2];
        const book = books.find(b => b.id === bookId);
        const acts = book?.actions || [];
        // 找到对应的 action（优先按 id 匹配，其次按 idx）
        let wasDone = false;
        acts.forEach((a, i) => {
          const match = String(a.id ?? i) === actionKey;
          if (match) {
            wasDone = !!a.done;
          }
        });
        setBooks(prev => prev.map(b => {
          if (b.id !== bookId) return b;
          return {
            ...b,
            actions: (b.actions || []).map((a, i) => {
              const match = String(a.id ?? i) === actionKey;
              if (!match) return a;
              const done = !!a.done;
              return done ? { ...a, done: false, status: 'active' } : { ...a, done: true, status: 'completed' };
            }),
          };
        }));
        showToast(wasDone ? '已取消完成' : '行动已完成');
      } else {
        // 独立行动路径 → 改 cogChanges
        let wasDone = false;
        const item = cogChanges.find(c => c.id === id);
        if (item) wasDone = !!(item.done || item.status === 'completed' || item.status === 'reviewed');
        setCogChanges(prev => prev.map(c => {
          if (c.id !== id) return c;
          const done = c.done || c.status === 'completed' || c.status === 'reviewed';
          return done
            ? { ...c, done: false, status: 'active' }
            : { ...c, done: true, status: 'completed' };
        }));
        showToast(wasDone ? '已取消完成' : '行动已完成');
      }
    },
    // 30天完成 → 生成改变（保留但不复用）
    completeAndReview: (id) => {
      const change = cogChanges.find(c => c.id === id);
      if (!change) return;
      // 标记改变已完成
      setCogChanges(prev => prev.map(c => c.id === id ? { ...c, status: 'reviewed' } : c));
      // 创建改变（草稿）
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
      showToast('改变已生成，请填写改变前后的对比');
    },
    remove: (id) => { setCogChanges(prev => prev.filter(c => c.id !== id)); showToast('行动改变已删除'); },
  };
  // 知力 · 改变（结果区）CRUD
  const reviewOps = {
    update: (data) => {
      if (!data?.id) return;
      setCogReviews(prev => {
        const exists = prev.find(r => r.id === data.id);
        if (exists) return prev.map(r => r.id === data.id ? { ...r, ...data } : r);
        return [...prev, data];
      });
      showToast('改变已更新');
    },
    remove: (id) => { setCogReviews(prev => prev.filter(r => r.id !== id)); showToast('改变已删除'); },
  };
  // 能力·里程碑
  const msOps = {
    add: (data) => {
      setAbilities(prev => prev.map((a, i) => i === data.abilityIdx ? { ...a, mstones: [...a.mstones, { ...data, id: uid() }] } : a));
      showToast('里程碑已添加');
    },
    update: (data) => {
      setAbilities(prev => prev.map((a, i) => i === data.abilityIdx ? { ...a, mstones: a.mstones.map((m, j) => j === data.msIdx ? { ...m, lb: data.lb, dueBy: data.dueBy, st: data.st, pct: data.pct } : m) } : a));
      showToast('里程碑已更新');
    },
    remove: ({ abilityIdx, msIdx }) => {
      setAbilities(prev => prev.map((a, i) => i === abilityIdx ? { ...a, mstones: a.mstones.filter((_, j) => j !== msIdx) } : a));
      showToast('里程碑已删除');
    },
    toggleDone: ({ abilityIdx, msIdx }) => {
      let becameDone = false;
      setAbilities(prev => prev.map((a, i) => {
        if (i !== abilityIdx) return a;
        return {
          ...a,
          mstones: a.mstones.map((m, j) => {
            if (j !== msIdx) return m;
            const isDone = m.st === 'done';
            becameDone = !isDone;
            // 勾选→done(pct=100)；取消→pending 但保留原中间进度（不销毁）
            return { ...m, st: isDone ? 'pending' : 'done', pct: isDone ? Math.min(m.pct || 0, 99) : 100 };
          }),
        };
      }));
      showToast(becameDone ? '已完成 1 条 KR' : '已取消完成');
    },
  };
  // 能力·增删改
  const abilityOps = {
    add: (data) => {
      setAbilities(prev => [...prev, {
        ...data, id: uid(),
        score: String(Number(data.score) || 5),
        mode: 'milestone',
        mstones: [],
      }]);
      showToast('能力已添加，点击右上角 + 添加 KR');
    },
    update: (data) => {
      setAbilities(prev => prev.map(a => a.id === data.id ? { ...a, ...data } : a));
      showToast('能力已更新');
    },
    remove: (id) => {
      setAbilities(prev => prev.filter(a => a.id !== id));
      showToast('能力已删除');
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
  const onBookEdit = (book, tab) => setModal({ type: 'book', initial: book, tab: tab || 'basic' });
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
      case 'book': {
        const isBookEdit = !!(modal.initial && modal.initial.id);
        return (
          <Modal open onClose={closeModal} title={isBookEdit ? '编辑书籍' : '添加书籍'} maxWidth={560}>
            <BookForm
              initial={modal.initial}
              initialTab={modal.tab}
              onCancel={closeModal}
              onSaved={(data) => {
                if (isBookEdit) bookOps.update(data); else bookOps.add(data);
                closeModal();
                showToast(isBookEdit ? '书籍已更新' : '书籍已添加');
              }}
              onDelete={isBookEdit ? (id) => { bookOps.remove(id); closeModal(); showToast('书籍已删除'); } : undefined}
            />
          </Modal>
        );
      }
      case 'ability':
        return (
          <Modal open onClose={closeModal} title={modal.initial?.id ? '编辑能力' : '新增能力'}>
            <AbilityForm
              initial={modal.initial}
              onCancel={closeModal}
              onSaved={(data) => {
                modal.initial?.id ? abilityOps.update(data) : abilityOps.add(data);
                closeModal();
              }}
              onDelete={modal.initial?.id ? (id) => { abilityOps.remove(id); closeModal(); } : undefined}
            />
          </Modal>
        );
      case 'milestone':
        return (
          <Modal open onClose={closeModal} title={modal.initial?.id ? '编辑里程碑' : '添加里程碑'}>
            <MilestoneForm
              initial={modal.initial}
              onCancel={closeModal}
              onSaved={(data) => {
                modal.initial?.id ? msOps.update(data) : msOps.add(data);
                closeModal();
              }}
              onDelete={modal.initial?.id ? (idx) => { msOps.remove(idx); closeModal(); } : undefined}
            />
          </Modal>
        );
      case 'kr':
        return (
          <Modal open onClose={closeModal} title={modal.initial?.id ? '编辑 KR' : '添加 KR'}>
            <KrForm
              initial={modal.initial}
              onCancel={closeModal}
              onSaved={(data) => {
                modal.initial?.id ? krOps.update(data) : krOps.add(data);
                closeModal();
              }}
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
              onCancel={closeModal}
              onSaved={(data) => {
                modal.initial?.id ? entryOps.update(data) : entryOps.add(data);
                closeModal();
              }}
              onDelete={modal.initial?.id ? (idx) => { entryOps.remove(idx); closeModal(); } : undefined}
            />
          </Modal>
        );
      case 'ability_assess':
        return (
          <Modal open onClose={closeModal} title={`${new Date().getFullYear()}年${new Date().getMonth() + 1}月 · 能力自评`} maxWidth={460}>
            <AbilityAssessmentForm
              abilities={abilities}
              scoreHistory={abilityScoreHistory}
              onCancel={closeModal}
              onSave={(scoresMap) => {
                const ym = new Date().toISOString().slice(0, 7);
                setAbilityScoreHistory(prev => {
                  const next = { ...prev };
                  abilities.forEach((a, i) => {
                    const abId = a.id || a.title;
                    const sc = scoresMap[i];
                    if (sc !== undefined) {
                      next[abId] = { ...(next[abId] || {}), [ym]: Number(sc) };
                    }
                  });
                  return next;
                });
                setAbilities(prev => prev.map((a, i) => scoresMap[i] !== undefined ? { ...a, score: String(Number(scoresMap[i])) } : a));
                showToast(`${new Date().getMonth() + 1}月自评已保存`);
                closeModal();
              }}
            />
          </Modal>
        );
      case 'risk_breakdown': {
        const { workIdx, krIdx, kr, goal, risk } = modal.initial || {};
        const krId = kr?.id || `${workIdx}-${krIdx}`;
        const exist = workKrMicroActions?.[krId] || [];
        return (
          <Modal open onClose={closeModal} title="风险KR · 微动作拆解" maxWidth={480}>
            <RiskBreakdownForm
              kr={kr} goal={goal} riskInfo={risk} existingActions={exist}
              onCancel={closeModal}
              onKrProgressAdd={(inc) => {
                if (!kr) return;
                const curV = Number(kr.v) || 0;
                const tgt = Number(kr.tgt) || 0;
                const newV = Math.min(tgt, curV + Number(inc));
                krOps.update({ workIdx, krIdx, id: kr.id, t: kr.t, v: newV, tgt: kr.tgt, u: kr.u, st: newV >= tgt ? 'done' : (kr.st || 'doing') });
                showToast(`进度已推进 +${inc}`);
              }}
              onSave={(actions) => {
                setWorkKrMicroActions(prev => ({ ...prev, [krId]: actions }));
                const doneCount = actions.filter(a => a.done).length;
                if (actions.length > 0) showToast(`拆解方案已保存（${doneCount}/${actions.length}已完成）`);
                else showToast('拆解方案已清空');
                closeModal();
              }}
            />
          </Modal>
        );
      }
      case 'life_highlights':
        return (
          <Modal open onClose={closeModal} title={`${new Date().getFullYear()}年 · 年度精选 & 记忆卡`} maxWidth={520}>
            <LifeHighlightsForm
              lifeData={lifeData}
              highlightedIds={lifeHighlightedIds}
              onCancel={closeModal}
              onToggleHighlight={(id) => {
                setLifeHighlightedIds(prev => {
                  const set = new Set(prev || []);
                  if (set.has(id)) set.delete(id); else set.add(id);
                  return Array.from(set);
                });
              }}
              onSave={(ids) => {
                setLifeHighlightedIds(Array.isArray(ids) ? ids : []);
                if (ids.length > 0) showToast(`已收藏 ${ids.length} 条精选记忆`);
                else showToast('精选已清空');
                closeModal();
              }}
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
        onBookUpdate={(id, patch) => { setBooks(prev => prev.map(b => b.id === id ? { ...b, ...patch } : b)); showToast('书籍已更新'); }}
        onBooksReplace={(updater) => { setBooks(prev => (typeof updater === 'function' ? updater(prev) : updater)); }}
        onBookContextMenu={(e, b) => {
          const opts = [
            { k: 'edit',     label: '✏️ 编辑书籍' },
            { k: 'reading',  label: '🔵 移到 阅读中' },
            { k: 'pending',  label: '⚪ 移到 未开始' },
            { k: 'done',     label: '🟢 移到 已读完' },
            { k: 'delete',   label: '🗑 删除这本书' },
          ];
          const txt = opts.map((o, i) => `${i+1}. ${o.label}`).join('\n');
          const raw = prompt(`${b.t}\n\n请输入操作序号（回车取消）：\n\n${txt}`, '1');
          const idx = Number(raw);
          if (!idx || idx < 1 || idx > opts.length) return;
          const pick = opts[idx - 1];
          if (pick.k === 'edit') onBookEdit(b);
          else if (pick.k === 'delete') {
            if (confirm(`确定删除《${b.t}》？`)) bookOps.remove(b.id);
          } else bookOps.move(b.id, pick.k);
        }}
        objective={cogObjective} onObjectiveChange={setCogObjective}
        krs={cogKrs} onKrAdd={(kr) => { setCogKrs(prev => [...prev, { ...kr, id: uid() }]); showToast('KR 已添加'); }}
        onKrEdit={(kr) => { setCogKrs(prev => prev.map(k => k.id === kr.id ? { ...k, ...kr } : k)); showToast('KR 已更新'); }}
        onKrRemove={(id) => { setCogKrs(prev => prev.filter(k => k.id !== id)); showToast('KR 已删除'); }}
        funnelHeader={funnelHeader} setFunnelHeader={setFunnelHeader}
        funnelStageLabels={funnelStageLabels} setFunnelStageLabels={setFunnelStageLabels}
        bookshelfTitle={bookshelfTitle} setBookshelfTitle={setBookshelfTitle}
        changes={cogChanges}
        onChangeAdd={changeOps.add} onChangeUpdate={changeOps.update} onChangeToggleComplete={changeOps.toggleComplete} onChangeComplete={changeOps.completeAndReview} onChangeRemove={changeOps.remove}
        reviews={cogReviews} onReviewUpdate={reviewOps.update} onReviewRemove={reviewOps.remove}
        showToast={showToast}
      />}
      {view === 'ability'   && <AbilityView  abilities={abilities} onMsAdd={onMsAdd} onMsEdit={onMsEdit}
        onMsToggleDone={({ abilityIdx, msIdx }) => msOps.toggleDone({ abilityIdx, msIdx })}
        onAbilityAdd={() => setModal({ type: 'ability' })}
        scoreHistory={abilityScoreHistory} onSetScore={(abilityIdx, newScore) => {
          const ab = abilities[abilityIdx]; if (!ab) return;
          const ym = new Date().toISOString().slice(0,7);
          const abId = ab.id || ab.title;
          setAbilityScoreHistory(prev => ({ ...prev, [abId]: { ...(prev[abId] || {}), [ym]: newScore } }));
          setAbilities(prev => prev.map((a, i) => i === abilityIdx ? { ...a, score: String(newScore) } : a));
          showToast('自评已更新');
        }} onStartAssessment={() => setModal({ type: 'ability_assess' })} />}
      {view === 'work'      && <WorkView     workGoals={workGoals} onKrAdd={onKrAdd} onKrEdit={onKrEdit}
        microActions={workKrMicroActions}
        onRiskTagClick={(workIdx, krIdx, kr, goal, risk) => setModal({ type: 'risk_breakdown', initial: { workIdx, krIdx, kr, goal, risk } })} />}
      {view === 'life'      && <LifeView     lifeData={lifeData} onEntryAdd={onEntryAdd} onEntryEdit={onEntryEdit}
        highlightedIds={lifeHighlightedIds}
        onStartHighlights={() => setModal({ type: 'life_highlights' })} />}
    </main>
  );

  const toastEl = toast && (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2"
      style={{ background: '#fff', border: '1px solid rgba(15,23,42,0.08)', boxShadow: '0 8px 24px rgba(15,23,42,0.12)' }}>
      <svg className="w-4 h-4" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>
      <span className="text-ink-800">{toast}</span>
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
      /* ---- 精力表格 grid 模板：[习惯名] [完成率 累计 目标] [月份×12] ---- 
         设计原则：完成率绿胶囊（56px）作为第一视觉焦点，与L3日历KPI设计一致
      */
      .habit-table {
        grid-template-columns: minmax(110px, 1.5fr) 68px 52px 64px repeat(12, minmax(32px, 0.28fr));
        gap: 0 0;
        align-items: center;
      }
      /* 分组间距：习惯名与统计区分组 */
      .habit-table > .grp-start {
        margin-right: 4px;
      }
      /* 分组间距：统计区与月份区分组（目标列是最后一个统计列） */
      .habit-table > .grp-end {
        padding-right: 12px;
      }
      /* 统计区内：完成率与累计之间间距 */
      .habit-table > .rate-gap {
        margin-right: 10px;
      }
      /* 统计区内：累计与目标之间间距 */
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
    <div className="min-h-screen bg-surface-base px-3 md:px-6 py-4 md:py-6">
      <div className="max-w-[1400px] mx-auto">
        <NavBar onExport={handleExport} onImport={handleImport} onReset={handleReset} />
        <div className="flex flex-col lg:flex-row gap-4 lg:gap-5 items-start annual-root-layout">
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
