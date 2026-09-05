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
import WorkGoalForm from '../components/forms/WorkGoalForm.jsx';
import EntryForm from '../components/forms/EntryForm.jsx';
import DualMarkerBar from '../components/DualMarkerBar.jsx';

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
  { key: 'energy',    label: '精力', type: '习惯型',    weight: 0.15, color: 'var(--m-energy)',    rgb: 'var(--m-energy-rgb)' },
  { key: 'cognition', label: '知力', type: '混合型',    weight: 0.20, color: 'var(--m-cognition)', rgb: 'var(--m-cognition-rgb)' },
  { key: 'ability',   label: '能力', type: '里程碑型',  weight: 0.25, color: 'var(--m-ability)',   rgb: 'var(--m-ability-rgb)' },
  { key: 'work',      label: '工作', type: 'OKR 量化型',weight: 0.25, color: 'var(--m-work)',      rgb: 'var(--m-work-rgb)' },
  { key: 'life',      label: '生活', type: '体验记录',  weight: 0.15, color: 'var(--m-life)',      rgb: 'var(--m-life-rgb)' },
];

/* 各模块「添加」动作映射（侧边栏二级导航加号 → 打开对应添加弹窗） */
export const ANNUAL_ADD_ACTIONS = {
  energy:    { type: 'habit',      initial: { growth_type: 'energy', accent_color: '#34C759' } },
  cognition: { type: 'book' },
  ability:   { type: 'ability' },
  work:      { type: 'work_goal' },
  life:      { type: 'entry' },
};

/* 习惯打卡 (精力) */
// monthDates: 按月份归类的真实打卡日期 Set（用于热力图 + 本月每日节奏折线）
const __mockMonthDates = (pattern /* 字符串，'1'=打卡 '.'=未打卡，长度<=当月天数 */, m /* 8月等 */) => {
  const s = new Set();
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] === '1') s.add(i + 1);
  }
  return { [m]: s };
};
export const HABITS = [
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
export const BOOKS = [
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
export const ABILITY = [
  {
    id: 'ab_oral',
    title: '英语口语',
    score: '4',
    daily: '每日30min Shadowing + Anki背20词',
    mode: 'milestone',
    createdAt: '2026-01-15',
    deadline: '2026-12-31',
    completedAt: null,
    mstones: [
      { id: 'ab_oral_m1', lb: '每日跟读 15 分钟（影子跟读法）', st: 'done', pct: 100, dueBy: '2026-03-31' },
      { id: 'ab_oral_m2', lb: '背诵常用 500 口语句型', st: 'doing', pct: 40, dueBy: '2026-08-31' },
      { id: 'ab_oral_m3', lb: '完成 10 次即兴独白录音', st: 'pending', pct: 0, dueBy: '2026-10-31' },
      { id: 'ab_oral_m4', lb: '加入 1 次英语角交流', st: 'pending', pct: 0, dueBy: '2026-11-15' },
      { id: 'ab_oral_m5', lb: '月末自评 ≥7/10 分', st: 'pending', pct: 0, dueBy: '2026-12-31' },
    ],
  },
  {
    id: 'ab_speech',
    title: '即兴表达',
    score: '5',
    daily: '每周1次演讲练习 + 即兴30秒训练',
    mode: 'milestone',
    createdAt: '2026-01-20',
    deadline: '2026-12-31',
    completedAt: null,
    mstones: [
      { id: 'ab_speech_m1', lb: '学完金字塔原理输出方法', st: 'done', pct: 100, dueBy: '2026-04-30' },
      { id: 'ab_speech_m2', lb: '完成 3 次 5 分钟主题演讲', st: 'doing', pct: 33, dueBy: '2026-09-30' },
      { id: 'ab_speech_m3', lb: '即兴表达 30 秒不中断练习', st: 'pending', pct: 0, dueBy: '2026-12-15' },
    ],
  },
  {
    id: 'ab_analysis',
    title: '数据分析',
    score: '3',
    daily: '每日 2h SQL 刷题 + 课程学习',
    mode: 'milestone',
    createdAt: '2026-08-01',
    deadline: '2026-09-14',
    completedAt: null,
    mstones: [
      { id: 'ab_analysis_m1', lb: '阶段一：单表查询基础（Day1-Day5｜课程 15-22 集）', st: 'doing', pct: 40, dueBy: '2026-08-05' },
      { id: 'ab_analysis_m2', lb: '阶段二：多表查询进阶（Day6-Day10｜课程 37-49 集）', st: 'pending', pct: 0, dueBy: '2026-08-10' },
      { id: 'ab_analysis_m3', lb: '阶段三：实战与面试冲刺（Day11-Day14｜选学 27-30 函数集数）', st: 'pending', pct: 0, dueBy: '2026-08-14' },
    ],
  },
];

/* 工作
 * mode: 'funnel'（求职默认，漏斗）| 'dashboard'（仪表盘·原名KPI仪表盘）
 *       | 'milestone'（里程碑门）| 'balance'（平衡雷达·辅助）
 * createdAt / deadline / completedAt：时间追踪四件套
 * kr 条目级 dueBy：可选（微截止）
 */
export const WORK = [
  {
    id: 'wk_offer',
    core: true, label: '主业', title: '用户运营offer，薪资≥20k',
    mode: 'funnel',
    createdAt: '2026-07-15',
    deadline: '2026-09-30',
    completedAt: null,
    krs: [
      { id: 'wk_offer_k1', t: '简历投递 50(份)', v: 20, tgt: 50, st: 'doing', dueBy: '2026-08-31' },
      { id: 'wk_offer_k2', t: '面试通过 10(个)', v: 5,  tgt: 10, st: 'doing', dueBy: '2026-09-15' },
      { id: 'wk_offer_k3', t: '改变总结 3(个)', v: 0,  tgt: 3,  st: 'tg',    dueBy: '2026-09-20' },
      { id: 'wk_offer_k4', t: '拿意向 Offer 1(个)', v: 0, tgt: 1, st: 'tg', dueBy: '2026-09-25' },
      { id: 'wk_offer_k5', t: '薪资达标 1(项)', v: 1, tgt: 1, st: 'done', dueBy: '2026-09-30' },
    ],
  },
  {
    id: 'wk_xhs',
    core: false, label: '副业', title: '小红书「小憨熊」涨粉+变现',
    mode: 'dashboard', // KPI 仪表盘：3 个独立指标
    createdAt: '2026-06-01',
    deadline: '2026-12-31',
    completedAt: null,
    krs: [
      { id: 'wk_xhs_k1', t: '周更内容 50(条)', v: 12,  tgt: 50,  st: 'doing', dueBy: '2026-12-31' },
      { id: 'wk_xhs_k2', t: '粉丝增长 5000(粉)', v: 800, tgt: 5000, st: 'doing', dueBy: '2026-12-31' },
      { id: 'wk_xhs_k3', t: '商业合作 1(个)', v: 0,    tgt: 1,    st: 'tg',    dueBy: '2026-11-30' },
    ],
  },
  {
    id: 'wk_jl_quit',
    core: true, label: '主业', title: '从JL离职+拿到大礼包',
    mode: 'event', // 🎯 单次事件型：达成点✅直接结束，无需KR拆解
    createdAt: '2026-07-20',
    deadline: '2026-09-30',
    completedAt: null,
    krs: [],
  },
];

/* 生活 */
export const LIFE = [
  { key:'relation', lb:'情感', color:'var(--m-life)', entries:[ /* violet */
    { t:'给妈妈打电话 30min', n:'聊天很开心，她分享了广场舞比赛', d:'8.24' },
    { t:'朋友老王生日送礼物', n:'送了喜欢的露营装备', d:'7.15' },
    { t:'和老婆周末野餐', n:'准备了她爱吃的草莓和可颂', d:'7.09' },
  ]},
  { key:'food', lb:'美食', color:'#B77FE3', entries:[ /* violet-400 */
    { t:'学会番茄牛腩', n:'第一次做，老妈说味道可以', d:'8.10' },
    { t:'尝试手冲咖啡', n:'买了一套 Hario V60', d:'7.10' },
  ]},
  { key:'travel', lb:'旅游', color:'var(--m-life)', entries:[ /* violet - 符合WCAG AA对比度 */
    { t:'密云水库两日游', n:'避开人潮，划了小船看夕阳', d:'8.17-8.18' },
    { t:'苏州两日游', n:'去了拙政园和留园', d:'6.22-6.23' },
    { t:'崇明岛露营', n:'和朋友们搭帐篷烧烤', d:'5.18' },
  ]},
  { key:'movie', lb:'电影', color:'#9C48C7', entries:[ /* violet-600 */
    { t:'沙丘 2', n:'IMAX 音效震撼，保罗保住传承', d:'8.03' },
    { t:'奥本海默', n:'3小时但不闷，诺兰神了', d:'7.01' },
    { t:'蜘蛛侠：纵横宇宙', n:'画风惊艳', d:'6.05' },
  ]},
  { key:'shop', lb:'购物', color:'#7D3AA0', entries:[ /* violet-700 */
    { t:'Kindle Paperwhite', n:'护眼阅读神器，纳瓦尔宝典已塞进去', d:'8.08' },
    { t:'Sony WH-1000XM5 耳机', n:'降噪封神，通勤必带', d:'7.05' },
    { t:'露营折叠椅', n:'周末去公园躺着很舒服', d:'6.18' },
  ]},
];

/* ---------- 2. 工具函数 ---------- */
const pct = (v, t) => (t > 0 ? Math.min(100, Math.round((v / t) * 100)) : 0);
const statusMeta = (st) => {
  switch (st) {
    case 'done':    return { lb: '已完成',  tagCls: 'bg-accent-green/10 text-accent-green',  numBg: 'bg-accent-green/10 text-accent-green',  bar: '#34C759'  };
    case 'doing':   return { lb: '进行中',  tagCls: 'bg-accent-blue/10 text-accent-blue',    numBg: 'bg-accent-blue/10 text-accent-blue',    bar: '#007AFF'   };
    case 'reading': return { lb: '阅读中',  tagCls: 'bg-accent-blue/10 text-accent-blue',    numBg: 'bg-accent-blue/10 text-accent-blue',    bar: '#007AFF'   };
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
  if (isDone || actualPct >= 100) return { q: 'done', label: '已完成', color: '#34C759' };
  if (timePct !== null && timePct !== undefined) {
    const diff = actualPct - timePct;
    if (diff <= -20) return { q: 'risk', label: '严重落后', color: '#FF3B30' };
    if (diff <= -5)  return { q: 'warn', label: '略落后',   color: '#FF9500' };
    if (diff >= 20)  return { q: 'ahead',label: '超前',     color: '#34C759' };
    return { q: 'normal', label: '正常', color: '#007AFF' };
  }
  // 无时间锚点：退化到按 actual 粗判
  if (actualPct <= 20) return { q: 'risk', label: '严重落后', color: '#FF3B30' };
  if (actualPct <= 50) return { q: 'warn', label: '推进中',   color: '#FF9500' };
  if (actualPct >= 90) return { q: 'ahead',label: '超前',     color: '#34C759' };
  return { q: 'normal', label: '正常', color: '#007AFF' };
};

/* 剩余天数展示：剩X天 / 过期X天 / 长期（当 null） */
const daysLabel = (days) => {
  if (days === null || days === undefined) return { text: '长期', cls: 'text-ink-400', urgent: false, overdue: false };
  if (days < 0)  return { text: `过期${Math.abs(days)}天`, cls: 'text-accent-red', urgent: false, overdue: true };
  if (days === 0) return { text: '今日截止', cls: 'text-accent-red', urgent: true, overdue: false };
  if (days <= 30) return { text: `剩${days}天`, cls: 'text-accent-amber', urgent: true, overdue: false };
  return { text: `剩${days}天`, cls: 'text-ink-500', urgent: false, overdue: false };
};

/* 工作页卡片日期副行：截止日期到今天的剩余时间 → 「剩余X个月X天」或「剩余X天」/「今日截止」/「过期X天」
 * 算法口径（与 calcTimeAnchor 一致，Date 本地时区 0 点对齐，避免跨时区 +-1 天）：
 *  - totalDays = ceil((deadline - today) / 86400000)，与 gs.days / daysLabel 使用同一口径
 *  - 月换算：按日历"同月同日差整月"原则；若 deadline 日份 < today 日份，借 1 月补该月天数
 *  - 输出格式：
 *      totalDays < 0   → 「过期 X 天」（红色）
 *      totalDays = 0   → 「今日截止」（红色）
 *      months >= 1     → 「剩余 N 个月 D 天」（月+天组合，D=0 时只写月）
 *      months = 0      → 「剩余 D 天」
 */
const IOS_SANS = '"SF Pro Text","SF Pro Display",-apple-system,BlinkMacSystemFont,"PingFang SC","Helvetica Neue",Helvetica,Arial,sans-serif';
const formatRemainDuration = (deadline, today) => {
  const t = new Date(today); t.setHours(0,0,0,0);
  const e = new Date(deadline); e.setHours(0,0,0,0);
  const totalDays = Math.ceil((e - t) / 86400000);
  if (totalDays < 0) return { text: `过期 ${Math.abs(totalDays)} 天`, cls: 'text-[#FF3B30]' };
  if (totalDays === 0) return { text: '今日截止', cls: 'text-[#FF3B30]' };
  // 日历月差（同月同日锚点整月判定）
  let months = (e.getFullYear() - t.getFullYear()) * 12 + (e.getMonth() - t.getMonth());
  const startDay = t.getDate(), endDay = e.getDate();
  let days = endDay - startDay;
  if (days < 0) {
    months -= 1;
    // 借 1 个月 → days = 月底剩下 + 日份
    const eom = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
    days = (eom - startDay) + endDay;
  }
  // 修：剩余天数 ≥ 借位的那个月天数 → 语义 = 差N天就整4个月，避免"3个月30天"这种近整月尴尬
  // 例：2026-09-01 至 2026-12-31，months=3, days=30 → 当前月(9月)有30天，days=30≥30 → 进1个月=4个月
  if (months > 0 && days > 0) {
    const todayMonthDays = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
    if (days >= todayMonthDays - 1) {
      months += 1;
      days = 0;
    }
  }
  // 修正：如果 months < 0（仅当总天数<0，但已在上面拦截，兜底）→ 退回纯天展示
  if (months < 0) months = 0;
  if (months === 0) {
    const cls = totalDays <= 30 ? 'text-[#FF9500]' : 'text-ink-500';
    return { text: `剩余 ${totalDays} 天`, cls };
  }
  // 月 + 天
  const cls = months <= 1 ? 'text-[#FF9500]' : 'text-ink-500';
  if (days === 0) return { text: `剩余 ${months} 个月`, cls };
  return { text: `剩余 ${months} 个月 ${days} 天`, cls };
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
/* 图标体系：Lucide 风格（24 网格 / 2px 描边 / 圆头笔触），与侧边栏 ICONS 同族
 * overview=chart-column 柱状图 | energy=heart-pulse 心率 | cognition=eye 眼界
 * ability=star 技能星级 | work=laptop 笔电 | life=sun 太阳 */
/* 供侧边栏二级导航复用（图标+加号入口） */
export function CategoryIcon({ catKey, className, style }) {
  const cls = className || 'w-4 h-4';
  return (
    <svg className={cls} style={style} fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      {catKey === 'overview' && (<><path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></>)}
      {catKey === 'energy' && (<><path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7Z"/><path d="M3.2 12H9l1.5-3 2.5 5.5L15 12h5.2"/></>)}
      {catKey === 'cognition' && (<><path d="M2.06 12.35a1 1 0 0 1 0-.7 11.5 11.5 0 0 1 19.88 0 1 1 0 0 1 0 .7 11.5 11.5 0 0 1-19.88 0"/><circle cx="12" cy="12" r="3"/></>)}
      {catKey === 'ability' && (<><path d="M12 2 15.1 8.3 22 9.3l-5 4.9 1.2 6.9L12 17.8l-6.2 3.3L7 14.2 2 9.3l6.9-1z"/></>)}
      {catKey === 'work' && (<><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/></>)}
      {catKey === 'life' && (<><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.9 4.9 1.4 1.4"/><path d="m17.7 17.7 1.4 1.4"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.3 17.7-1.4 1.4"/><path d="m19.1 4.9-1.4 1.4"/></>)}
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
      <div className="h-full rounded-full transition-all duration-500 ease-out" style={{ width: `${value}%`, background: color || '#007AFF' }} />
    </div>
  );
}

function AddButton({ label, onClick, compact }) {
  if (compact) {
    return (
      <button onClick={onClick || (() => {})} className="mt-auto p-1.5 rounded-lg border border-ink-100 text-ink-500 text-[11px] font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-ink-50 hover:border-ink-200 hover:text-ink-700 transition cursor-pointer w-full">
        <span className="w-4 h-4 rounded-md bg-ink-100 grid place-items-center text-ink-600 flex-shrink-0">
          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" strokeLinecap="round"/></svg>
        </span>
        <span>{label}</span>
      </button>
    );
  }
  return (
    <button onClick={onClick || (() => {})} className="mt-auto p-2 rounded-xl border border-ink-100 text-ink-500 text-xs font-semibold inline-flex items-center justify-center gap-2 hover:bg-ink-50 hover:border-ink-200 hover:text-ink-700 transition cursor-pointer w-full">
      <span className="w-5 h-5 rounded-md bg-ink-100 grid place-items-center text-ink-600 flex-shrink-0">
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
            <svg className="w-4 h-4 text-accent-amber flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
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
                className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium text-accent-red hover:bg-accent-red/7 transition">
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
  total, done, notes, changes, reviews, color = '#007AFF', embedded,
  headerTitle = '阅读转化漏斗',
  headerSub = '输入→思考→行动→改变→改变',
  onHeaderChange,
  stageLabels,
  onStageLabelsChange,
}) {
  // 五层漏斗（严格真子集递减）：目标量 → 输入量 → 思考量 → 行动量 → 改变量
  // 对应 ReadingFunnel 字段 total → done → notes → changes → reviews
  // 统一蓝色：全部使用计划总结页主色 #007AFF
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
                <span className="font-bold tabular-nums px-3 py-0.5 rounded-full flex-shrink-0"
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
          <div className="w-6 h-6 rounded-lg grid place-items-center bg-accent-red/10 text-accent-red">
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
              <span className="text-xs w-4 h-4 rounded-full grid place-items-center flex-shrink-0 font-bold"
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
//
// 首屏闪 mock 数据的根因：realHabits 初始为 null，要等异步 API 返回（数秒）才换成真实习惯名/进度。
// 修复：localStorage 写穿缓存 —— 初始化同步读缓存（打开即真实数据），API 成功后回写校准（换设备/清缓存场景）。
const ENERGY_HABITS_CACHE = () => {
  try {
    const raw = localStorage.getItem('pw_user');
    const uid = raw ? (JSON.parse(raw)?.id ?? 'anon') : 'anon';
    return `energy_habits_cache_${uid}`;
  } catch { return 'energy_habits_cache_anon'; }
};
function readEnergyHabitsCache() {
  try {
    const raw = localStorage.getItem(ENERGY_HABITS_CACHE());
    if (!raw) return null;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return null;
    // monthDates 的 Set 不可序列化 → 从 allDates 重建
    return arr.map(h => {
      const monthDateSet = {};
      (h.allDates || []).forEach(d => {
        const m = parseInt(d.split('-')[1], 10);
        const day = parseInt(d.split('-')[2], 10);
        if (!monthDateSet[m]) monthDateSet[m] = new Set();
        monthDateSet[m].add(day);
      });
      return { ...h, monthDates: monthDateSet };
    });
  } catch { return null; }
}
function writeEnergyHabitsCache(mapped) {
  try { localStorage.setItem(ENERGY_HABITS_CACHE(), JSON.stringify(mapped)); } catch { /* ignore */ }
}

export function useEnergyHabits() {
  const [realHabits, setRealHabits] = useState(() => readEnergyHabitsCache()); // null = 未获取/失败；[] = 获取到空列表
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

        if (!cancelled) {
          setRealHabits(mapped);
          writeEnergyHabitsCache(mapped); // 写穿缓存：下次首屏直接显示真实数据
          setLoading(false);
        }
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
    catColor: c.color, catRgb: c.rgb,
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
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-sm flex-shrink-0" style={{ background: 'var(--s-grad-bg)' }}>
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
              <circle cx="18" cy="18" r="15" fill="none" stroke="#007AFF" strokeWidth="3"
                strokeDasharray={`${(ring / 100) * 94.2} 94.2`} strokeLinecap="round"/>
            </svg>
            <div className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-ink-900 tabular-nums">{ring}</div>
          </div>
        </div>
        <div className="hidden lg:flex items-center gap-3 p-3 rounded-xl bg-surface-soft border border-ink-100">
          <div className="relative w-14 h-14 flex-shrink-0">
            <svg viewBox="0 0 36 36" className="w-14 h-14 -rotate-90">
              <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" className="text-ink-100" strokeWidth="3"/>
              <circle cx="18" cy="18" r="15" fill="none" stroke="#007AFF" strokeWidth="3"
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
                style={on ? { background: 'var(--s-grad-bg)' } : undefined}
                className={[
                  'lg:w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-[13px] transition-all whitespace-nowrap flex-shrink-0 lg:flex-shrink',
                  on ? 'text-white font-semibold shadow-sm'
                     : 'text-ink-700 font-medium hover:bg-ink-100'
                ].join(' ')}>
                <span className={['w-6 h-6 rounded-md grid place-items-center flex-shrink-0',
                  on ? 'bg-white/15 text-white' : item.cat ? '' : 'bg-ink-100 text-ink-500'
                ].join(' ')}
                  style={item.cat && !on ? { background: `rgba(${item.catRgb},0.06)`, color: item.catColor } : undefined}>
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
const Sparkline = ({ data, labels, color = '#34C759', width = 260, height = 60,
  futureFrom = -1,            // 新：1-based 月份号(如9)，>= 该月份号的索引视为"未来月"；-1=不启用(全为过去/当前)
  activeIdx = -1,             // 新：0-based 选月联动高亮索引（-1=不画）
  currentIdx = -1,            // ★ P2：当前月索引（0-based）；-1=不画气泡。不传时默认从 splitIdx-1 推导
}) => {
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
  const PAD_X = 10;       // ★ 左右安全边距：端点圆点（当前月 r≈8）不出 viewBox，防止两端被容器裁切
  const plotH = height - LABEL_H - PAD_T - PAD_B;
  const max = Math.max(10, Math.max(...data));
  const min = 0;                           // 次数=0是有意义的下限
  const range = Math.max(1, max - min);
  const stepX = data.length === 1 ? 0 : (width - 2 * PAD_X) / (data.length - 1);
  // 🔝 安全天花板：任何情况下顶点 y 不得超过 safeCeilY，保证与 KPI 数字区 >=12px 视觉边距
  // 设计惯例：Apple Health / Google Fit 折线图都会给顶部留 20~25% 空高，避免峰值撞头
  const SAFE_CEIL_PCT = 0.22;
  const safeCeilY = PAD_T + Math.max(4, plotH * SAFE_CEIL_PCT);
  // ★ CSS 变量色（如 var(--m-energy)）含括号，直接拼进 ID 会让 url(#...) 引用非法（面积变黑）。
  //   清洗为纯字母数字，hex 色不受影响（#34C759 → 34C759）。
  const gid = 'sg-' + color.replace(/[^a-zA-Z0-9]/g, '') + '-' + Math.abs(data.reduce((s,v)=>s+v,0)).toString(36);

  const pts = data.map((v, i) => {
    const x = PAD_X + i * stepX;   // ★ 从 PAD_X 起，两端缩回，圆点不出界
    // 基础 y 计算：min越高越靠上（y=PAD_T 是顶）
    const rawY = PAD_T + plotH - (((v - min) / range) * (plotH - 2)) - 1;
    // 强制不超过安全天花板：越小越靠上，所以取 Math.max（y值越大越靠下）
    const y = Math.max(rawY, safeCeilY);
    return { x, y, v, rawY };
  });

  // =============== ★ 新增：虚实 / 填充分层（past/future 分界） ===============
  // splitIdx: >= 该索引 的点视为"未来月"。
  //   futureFrom = 9 (1-based 月份号 9月) → idx = 8 (0-based) = splitIdx。
  //   过去点 = [0, splitIdx-1]，含当前月(=splitIdx-1)；未来点 = [splitIdx..N-1]。
  const N = pts.length;
  const splitIdx = (futureFrom >= 1 && futureFrom <= N + 1)
    ? Math.min(N, Math.max(0, futureFrom - 1))
    : N;                                            // 默认无未来段 → splitIdx=N（全过去）
  // 当前月索引：优先用外部传入（Card3 Pill 联动），否则默认取 splitIdx-1
  const currentIdx2 = currentIdx >= 0 ? Math.min(currentIdx, N - 1) : Math.max(0, Math.min(N - 1, splitIdx - 1));
  const curIdx = currentIdx2;

  // 标签基准 y（必须先算：气泡规则③峰值翻转引用它，放后面会进入 TDZ）
  const labelY = PAD_T + plotH + PAD_B + LABEL_H - 2;
  // =============== ★ P2：当前月气泡 3 条防重叠规则 ===============
  // 气泡内文案「8月 18」= 2位月 + 空格 + 值；viewBox 单位宽度估算
  const BUBBLE_H = 16;                                 // 气泡高（viewBox 单位）
  const BUBBLE_PAD = 6;                                // 气泡左右内边距
  const anchor = curIdx >= 0 && curIdx < N ? pts[curIdx] : null;
  const bubble = (() => {
    if (!anchor) return null;
    // ★ ② 气泡去掉「8月」前缀，只留纯值「19」
    const txt = `${anchor.v}`;
    const charW = 6.2;                                 // 数字均宽估算（1-2位）
    const bw = Math.max(24, txt.length * charW + BUBBLE_PAD * 2);
    // 规则1：默认锚定在点正上方；矩形右缘钳制 ≤ width-4（12月也不溢出）
    let bx = anchor.x - bw / 2;
    if (bx + bw > width - 4) bx = width - 4 - bw;      // 右缘钳制（末2槽位→整体左移）
    if (bx < 4) bx = 4;                                // 左缘钳制（1月）
    // 规则3：峰值翻转——气泡顶部若高于绘图区顶部（顶出图表），翻到点下方
    let above = true;
    let by = anchor.y - 24;                            // 点上方 24（含气泡高+间隙）
    if (by < PAD_T + 4) { above = false; by = anchor.y + 9; }
    // 下方翻转时若压到月份标签区，再回到上方并贴顶
    if (!above && by + BUBBLE_H > labelY - 12) { above = true; by = Math.max(PAD_T + 4, anchor.y - 24); }
    return { x: bx, y: by, w: bw, h: BUBBLE_H, above, txt, anchor };
  })();
  // 规则2：AABB 碰撞——KPI 净空带（右上角约前 30% 高度、右侧 40% 宽度区域）
  // 气泡与其重叠时下移一档（SVG 内无法感知 DOM KPI 实际位置，用保守比例带）
  if (bubble && bubble.above && bubble.y < PAD_T + plotH * 0.3 && bubble.x + bubble.w > width * 0.6) {
    bubble.y = PAD_T + plotH * 0.3 + 2;
  }

  // 过去填充（只画过去 + 当前，不延伸到未来）—— 边界跟随缩回后的首/末点 x
  const pastPts = pts.slice(0, splitIdx);
  const pastAreaPath = pastPts.length > 0
    ? 'M' + pastPts[0].x + ',' + (PAD_T + plotH) + ' L'
      + pastPts.map(p => `${p.x},${p.y}`).join(' ')
      + ' L' + pastPts[pastPts.length - 1].x + ',' + (PAD_T + plotH)
      + ' Z'
    : '';
  // 过去实线
  const linePastPath = pastPts.map((p, i) => (i === 0 ? 'M' : 'L') + `${p.x},${p.y}`).join(' ');
  // 未来虚线：必须从"当前月（最后一个过去点）"连到第一个未来月，否则图会断掉。
  const futureSegPts = splitIdx <= N
    ? pts.slice(Math.max(0, splitIdx - 1))
    : [];
  const lineFuturePath = futureSegPts.length >= 2
    ? futureSegPts.map((p, i) => (i === 0 ? 'M' : 'L') + `${p.x},${p.y}`).join(' ')
    : '';

  const ptsStr = pts.map(p => `${p.x},${p.y}`).join(' ');
  const areaPath = 'M' + pts[0].x + ',' + (PAD_T + plotH) + ' L' + ptsStr + ' L' + (pts[pts.length - 1].x) + ',' + (PAD_T + plotH) + ' Z';
  const linePath = pts.map((p, i) => (i === 0 ? 'M' : 'L') + `${p.x},${p.y}`).join(' ');
  // ★ ① 全 1-12 月标签：不抽样，全部显示
  const showIdx = new Set();
  for (let i = 0; i < data.length; i++) showIdx.add(i);

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
  // ★ ⑤ 修复折线拉伸变形：删 preserveAspectRatio="none"（x/y 不等比拉伸导致折线/圆点变形），
  //   恢复默认 xMidYMid meet 等比缩放；SVG 高固定为 viewBox 高（viewBox 宽 420 会被等比放大，
  //   实际渲染宽 = 卡内容宽，超出部分被 overflow visible 接住，折线水平居中不变形）
  const VB_H = height + LABEL_H + EXTRA_BOTTOM;
  return (
    <div className="relative w-full flex justify-center" style={{ width: '100%', height: VB_H, overflow: 'visible' }}>
      <svg
        ref={svgRef}
        width="100%"
        height={VB_H}
        viewBox={`0 0 ${width} ${VB_H}`}
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
            <stop offset="0%" style={{ stopColor: color, stopOpacity: 0.3 }} />
            <stop offset="100%" style={{ stopColor: color, stopOpacity: 0 }} />
          </linearGradient>
        </defs>
        {/* ★ 区域填充：有分层时只画过去段；没分层（默认）画全填充 */}
        {pastAreaPath
          ? <path d={pastAreaPath} fill={'url(#' + gid + ')'} />
          : <path d={areaPath} fill={'url(#' + gid + ')'} />}
        {/* ★ ④ 删除灰色目标虚线（用户确认移除，月度目标信息已由 DualMarkerBar 承担） */}
        {/* ★ 过去段 · 实线折线（splitIdx===N 时无未来段，走过去全实线 = 原 linePath，兼容默认）
            动态色必须走 style：SVG 展示属性 stroke="var(--x)" 不被解析 */}
        {linePastPath && (
          <path d={linePastPath} fill="none" strokeWidth="2" style={{ stroke: color }}
            strokeLinecap="round" strokeLinejoin="round" />
        )}
        {/* ★ 未来段 · 虚线折线（4/3 段 + 透明度 0.55） */}
        {lineFuturePath && (
          <path d={lineFuturePath} fill="none" strokeWidth="2" style={{ stroke: color }}
            strokeDasharray="4 3" strokeOpacity="0.55" strokeLinecap="round" strokeLinejoin="round" />
        )}
        {/* 🔹 辅助垂直追踪线（仅 hover 时显示，强化「已吸附到最近点」的视觉反馈）*/}
        {hp && (
          <line x1={hp.x} y1={PAD_T - 2} x2={hp.x} y2={PAD_T + plotH}
            strokeWidth="1" style={{ stroke: color }} strokeDasharray="3 3" strokeOpacity="0.35" />
        )}
        {/* ★ 数据点圆点（过去/当前/未来 分层绘制 + activeIdx 选月虚线圈） */}
        {pts.map((p, i) => {
          const isFuture = i >= splitIdx;
          const isCurrent = i === curIdx;
          const isHover = hoverIdx === i;
          // ★ P3 降噪：历史点从 r=2 → r=1.5；当前月放大 r=5.5 白边实心（视觉锚点）
          let r = 1.5;
          let fill = 'transparent';
          let stroke = color;
          let strokeW = 0;
          let fillOp = 0;
          if (isHover) {
            r = 3.5; fill = color; stroke = '#fff'; strokeW = 1.5; fillOp = 1;
          } else if (isCurrent) {
            r = 5.5; fill = color; stroke = '#fff'; strokeW = 2.5; fillOp = 1;
          } else if (isFuture) {
            r = 1.9; fill = '#fff'; stroke = color; strokeW = 1.4; fillOp = 0.75;
          } else {
            r = 1.5; fill = 'transparent'; stroke = color; strokeW = 0; fillOp = 0;
          }
          return (
            <circle key={i} cx={p.x} cy={p.y} r={r} strokeWidth={strokeW}
              fillOpacity={fillOp} style={{ fill, stroke }} />
          );
        })}
        {/* ★ P2：当前月数值气泡（3 条防重叠规则算好的矩形 + 文本 + 指向线） */}
        {bubble && (
          <g>
            <rect x={bubble.x} y={bubble.y} width={bubble.w} height={bubble.h} rx="6"
              style={{ fill: color }} />
            <text x={bubble.x + bubble.w / 2} y={bubble.y + 11.5} textAnchor="middle"
              fontSize="10" fontWeight="700" fill="#fff"
              style={{ fontFamily: 'ui-sans-serif, system-ui', fontVariantNumeric: 'tabular-nums' }}>
              {bubble.txt}
            </text>
            {/* 指向线：气泡指向锚点（上方→下指，下方→上指） */}
            <path d={bubble.above
              ? `M${bubble.anchor.x},${bubble.anchor.y - 6} L${bubble.anchor.x},${bubble.y + bubble.h + 1}`
              : `M${bubble.anchor.x},${bubble.anchor.y + 6} L${bubble.anchor.x},${bubble.y - 1}`}
              strokeWidth="1.2" strokeOpacity="0.6" fill="none" style={{ stroke: color }} />
          </g>
        )}
        {/* ★ activeIdx 保留：仅在底部标签上 underline 锚定（已在 label 里实现）；★ ④ 删外层虚线绿环 */}
        {/* ★ P3 降噪：数值常显标注只留「峰值」一个（历史最大值，非 0）；
             其余月份数值降级到 hover Tooltip；未来月 0 值一律不标 */}
        {(() => {
          let peakI = -1;
          for (let i = 0; i < splitIdx; i++) {
            if (pts[i].v > 0 && (peakI < 0 || pts[i].v > pts[peakI].v)) peakI = i;
          }
          // ★ ③ 修复：峰值点与当前月(curIdx)同月时，气泡已显示当前月数值，不要重复画峰值灰字
          //    否则 SVG 后序绘制覆盖（灰色 20 在气泡上）→ 出现"绿气泡上面有灰数字"
          if (peakI < 0 || peakI === curIdx) return null;
          const p = pts[peakI];
          // 峰值点一般在顶部附近，标注放在点下方更安全（不与气泡/线冲突）
          const below = p.y + 14 < labelY - 8;
          return (
            <text key={'peak'} x={p.x} y={below ? p.y + 12 : p.y - 5} textAnchor="middle"
              fontSize="9.5" fontWeight="600" fill="#8E8E93" opacity="0.9"
              style={{ fontFamily: 'ui-sans-serif, system-ui', fontVariantNumeric: 'tabular-nums' }}>
              {p.v}
            </text>
          );
        })()}
        {/* ★ P4 底部月份标签：锚点纯数字（去年份「月」字），3 段分层
            - 过去月: 700 bold #8E8E93
            - 当前月: 900 bold 主色
            - 未来月: 500 #9CA3AF
            - activeIdx(选月锚定): 下方绿色 underline */}
        {labels && labels.length === data.length && pts.map((p, i) =>
          showIdx.has(i) && (() => {
            const isActive = activeIdx === i;
            // ★ 纯数字：从「8月」剥出「8」
            const labRaw = String(labels[i] || '');
            const labTxt = labRaw.replace(/月$/, '');
            // ★ ① 统一字重、统一颜色（不再分过去/当前/未来三层样式）
            const weight = '600';
            const fill = '#8E8E93';
            return (
              <g key={'l'+i}>
                <text x={p.x} y={labelY} textAnchor="middle"
                  fontSize="11"
                  fontWeight={weight}
                  fill={fill}
                  style={{
                    fontFamily: 'ui-sans-serif, system-ui',
                    fontVariantNumeric: 'tabular-nums',
                    textDecoration: isActive ? 'underline' : 'none',
                    textDecorationColor: color,
                    textDecorationThickness: '1.5px',
                    textUnderlineOffset: '3px',
                  }}>
                  {labTxt}
                </text>
              </g>
            );
          })()
        )}
      </svg>
      {/* ★ Hover Tooltip · 改 Portal + fixed 视口坐标，彻底避免祖先 overflow-hidden 裁切
           hp.x/hp.y 仍是 viewBox 内部坐标，乘缩放比 + SVG 视口左上角 = 屏幕绝对位置 */}
      {(() => {
        if (!hp) return null;
        const svgRect = svgRef.current?.getBoundingClientRect();
        if (!svgRect) return null;
        // viewBox (width×height) 等比缩放到 SVG 实际渲染尺寸
        const scaleX = svgRect.width / width;
        const scaleY = svgRect.height / height;
        const drawPxX = (svgRect.width - width * scaleX) / 2; // viewBox 在 SVG 内的水平居中偏移
        const drawPxY = (svgRect.height - height * scaleY) / 2;
        // 点在视口的中心坐标
        const cx = svgRect.left + drawPxX + hp.x * scaleX;
        const cy = svgRect.top + drawPxY + hp.y * scaleY;
        // Tooltip 尺寸预估 (与实际类匹配): 最小72宽;两行内容 高≈48(含padding+shadow);箭头无额外高
        const TIP_W = 84;
        const TIP_H = 46;
        const tipLeft = Math.max(8, Math.min(cx - TIP_W / 2, (window.innerWidth || 1e3) - TIP_W - 8));
        const tipTop = Math.max(8, cy - TIP_H - 4);
        return createPortal(
          <div className="pointer-events-none fixed z-[999]"
            style={{ left: tipLeft, top: tipTop, width: TIP_W }}>
            <div className="px-2.5 py-1.5 rounded-lg border border-ink-100 bg-white shadow-[0_4px_14px_rgba(17,24,39,0.12)] flex flex-col items-center gap-0.5 w-full">
              {labels && labels[hoverIdx] && (
                <div className="text-[11px] font-semibold text-ink-400 leading-none">{labels[hoverIdx]}</div>
              )}
              <div className="text-[15px] font-bold tabular-nums leading-tight" style={{ color }}>
                {hp.v} 次
              </div>
            </div>
          </div>,
          document.body
        );
      })()}
    </div>
  );
};

/* ---------- 6. 视图 · Overview ---------- */
/* v3 卡片网格化改造:
 * - 5 模块 → 3+2 响应式网格卡(≥760px:3列 / ≥520px:2列 / 小屏:1列)
 * - 卡头改横向 flex(窄卡放不下 6 列 Grid)
 * - 卡身 max-h-150px + 独立滚动 + 底部渐隐(解决等高栅格内长短不一的空白)
 * - 子行 5列→4列(名与规格合并)
 * - 漏斗行:名称/转化一行,比例条独立一行(窄卡水平摆放不可读) */
function OverviewView({ onNav, stats, realHabits, books, abilities, workGoals, lifeData }) {
  const year = new Date().getFullYear();
  const habits = realHabits || HABITS;
  const dynBooks = (!books || books.length === 0) ? BOOKS : books;
  const dynAbilities = abilities || ABILITY;
  const dynWork = workGoals || WORK;
  const dynLife = lifeData || LIFE;
  const now = new Date();
  const perCat = stats.perCat;

  /* 时间锚:dayOfYear/365 */
  const start = new Date(year, 0, 1);
  const dayOfYear = Math.floor((now - start) / 86400000);
  const anchor = Math.min(100, Math.round((dayOfYear / 365) * 1000) / 10);
  const daysLeft = Math.max(0, Math.ceil((new Date(year, 11, 31) - now) / 86400000));

  /* 差值胶囊:↑(超前绿)/±(贴近蓝)/↓(落后红),带% — iOS色系饱和填充(内联style确保生效) */
  const deltaChip = (p) => {
    const d = Math.round(p - anchor);
    if (d > 5) return { txt: `↑${d}%`, style: { background: 'rgba(52,199,89,0.20)', color: '#248A3D' } };
    if (d < -5) return { txt: `↓${Math.abs(d)}%`, style: { background: 'rgba(255,59,48,0.18)', color: '#D70015' } };
    return { txt: `±${Math.abs(d)}%`, style: { background: 'rgba(0,122,255,0.15)', color: '#0040DD' } };
  };

  /* 漏斗 & 工作 源数据 */
  const bookTarget = (COG_KRS[0]?.tgt) || 12;
  const funnel = (() => {
    const done = dynBooks.filter(b => b.st === 'done').length;
    const notes = dynBooks.reduce((s, b) => s + (b.insights || []).filter(i => i.text?.trim() && i.scene?.trim()).length, 0);
    const changes = dynBooks.reduce((s, b) => s + (b.actions || []).filter(a => a.done && a.text?.trim()).length, 0);
    const reviews = dynBooks.length;
    return { total: bookTarget, done, notes, changes, reviews: Math.min(reviews, changes) };
  })();
  const mainWork = dynWork.find(o => o.core) || dynWork[0];
  const sideWork = dynWork.find(o => !o.core && o !== mainWork);

  /* 折叠状态 */
  const [collapsed, setCollapsed] = useState({ energy: false, cognition: false, ability: false, work: false, life: false });
  const toggle = (k) => setCollapsed(s => ({ ...s, [k]: !s[k] }));

  /* 年度概览标题：右键可改（复用 InlineEdit contextmenu 设计） */
  const [ovTitle, setOvTitle] = useState(null);

  /* 卡头(横向 flex,适配窄卡) —— 文字层级对齐精力页卡片(名称14px/间距p-3) */
  const CardHead = ({ c, pctVal }) => {
    const chip = deltaChip(pctVal);
    const col = c.color;
    return (
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-ink-100/60 bg-white/60 cursor-pointer select-none"
        onClick={() => toggle(c.key)} role="button" aria-expanded={!collapsed[c.key]}>
        {/* 图标：深色填充底 + 白色线形 */}
        <span className="rounded-md grid place-items-center flex-shrink-0" style={{ width: 24, height: 24, color: '#fff', background: col }}>
          <CategoryIcon catKey={c.key} className="w-[15px] h-[15px]" />
        </span>
        <span className="text-[14px] font-bold text-[#000000] leading-none flex-shrink-0">{c.label}</span>
        {/* 主条:--bar-sm 放大 8px; 时间锚竖线 白色隔断+柔光 4×14 */}
        <div className="relative h-6 flex-1 min-w-[36px] max-w-[130px]">
          <span className="absolute left-0 right-0 top-[8px] h-[8px] rounded-full bg-ink-100" />
          <span className="absolute left-0 top-[8px] h-[8px] rounded-full" style={{ width: `${Math.min(100, pctVal)}%`, background: col }} />
          <span className="absolute top-[5px] w-[4px] h-[14px] rounded-sm bg-white" style={{ left: `${anchor}%`, boxShadow: '0 0 3px rgba(0,0,0,0.25)' }} />
        </div>
        <span className="text-[13px] font-bold tabular-nums leading-none flex-shrink-0 text-right ml-auto" style={{ color: col, width: 38 }}>{Math.round(pctVal)}%</span>
        <span className="text-[10.5px] font-semibold tabular-nums px-1.5 py-[3px] rounded-full leading-none flex-shrink-0" style={chip.style}>{chip.txt}</span>
        <svg className={`w-3.5 h-3.5 text-[#C7C7CC] transition-transform duration-200 flex-shrink-0 ${collapsed[c.key] ? '' : 'rotate-180'}`}
          fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    );
  };

  /* 卡身(固定高度+渐隐滚动) —— 内边距对齐卡头 px-3 */
  const CardBody = ({ children, show = true }) => (
    <div className="relative bg-white flex-1" style={{ display: show ? 'block' : 'none' }}>
      <div className="overflow-y-auto scrollbar-hide" style={{ maxHeight: 165, padding: '3px 12px 8px 16px' }}>
        {children}
      </div>
      <div className="absolute left-0 right-0 bottom-0 pointer-events-none" style={{ height: 26, background: 'linear-gradient(180deg,transparent,#fff)' }} />
    </div>
  );

  /* 子行 4 列 Grid:名称(含规格) / 迷你条 / val / pct(或 tail 自定义尾元素)
     名称12.5px/val 11px/pct 11.5px;迷你条放大 6px、列宽 44px;时间锚竖线 白+柔光 3×14 */
  const SubRow = ({ name, pct: p, val, color, done, tail }) => (
    <div className="grid items-center gap-1.5 py-1.5 border-t border-ink-100/40" style={{ gridTemplateColumns: 'minmax(0,1fr) 44px 56px 42px', minHeight: 28 }}>
      <span className={`text-[12.5px] font-semibold leading-none truncate ${done === false ? 'text-[#8E8E93]' : 'text-[#48484A]'}`}>{name}</span>
      <div className="relative h-2 w-full">
        {done === false ? null : (<>
          <span className="absolute left-0 right-0 top-[1px] h-[6px] rounded-full bg-ink-100/80" />
          <span className="absolute left-0 top-[1px] h-[6px] rounded-full" style={{ width: `${done === true ? 100 : Math.min(100, p)}%`, background: color }} />
          <span className="absolute -top-[3px] w-[3px] h-[14px] rounded-sm bg-white" style={{ left: `${anchor}%`, boxShadow: '0 0 3px rgba(0,0,0,0.25)' }} />
        </>)}
      </div>
      <span className={`text-[11px] font-semibold tabular-nums text-right leading-none whitespace-nowrap ${done === false ? 'text-[#8E8E93]' : 'text-[#6C6C70]'}`}>{val}</span>
      {tail ?? (
        <span className="text-[11.5px] font-bold tabular-nums text-right leading-none whitespace-nowrap" style={{ color: done === false ? '#C7C7CC' : color }}>
          {done === false ? '–' : `${Math.round(done === true ? 100 : p)}%`}
        </span>
      )}
    </div>
  );

  /* 知力漏斗行:标题与色块同一行对齐;色块宽度上限 60%(整体缩短),数值嵌色块内,转化率随行右对齐 */
  const FunnelRow = ({ label, count, idx, conv, total, unit }) => {
    const pctW = Math.max(12, (count / (total || 1)) * 60);
    return (
      <div className="flex items-center gap-2 py-1.5 border-t border-ink-100/40" style={{ minHeight: 28 }}>
        <span className="text-[12.5px] font-semibold text-[#48484A] leading-none w-[48px] flex-shrink-0">{label}</span>
        <div className="h-[14px] rounded-full flex items-center flex-shrink-0"
          style={{ width: `${pctW}%`, background: 'var(--m-cognition)' }}>
          <span className="text-[10px] font-semibold tabular-nums ml-1.5 leading-none text-white">{count}{unit}</span>
        </div>
        <span className="text-[11.5px] font-bold tabular-nums leading-none flex-shrink-0 ml-auto" style={{ color: 'var(--m-cognition)' }}>{conv}</span>
      </div>
    );
  };

  /* 工作小节：全量 KR 逐行显示（对齐工作tab漏斗层级，含已完成行），数值带单位 */
  const WorkSection = ({ title, color, obj }) => {
    const krs = obj?.krs || [];
    return (
      <>
        <div className="flex items-center gap-1.5 pt-1.5 pb-1">
          <span className="w-[3px] h-[12px] rounded-sm flex-shrink-0" style={{ background: color }} />
          <span className="text-[11px] font-bold text-[#3C3C43] leading-none">{title}</span>
          <span className="text-[10.5px] text-[#8E8E93] leading-none truncate ml-0.5">{obj?.title}</span>
        </div>
        {krs.map(k => {
          const due = k.dueBy ? (k.dueBy).slice(5).replace('-', '.') : '';
          const name = k.t.replace(/\s*\(.*?\)/g, '') + (due ? ` ${due}止` : '');
          const unit = k.u || k.t.match(/\((.*?)\)/)?.[1] || '';
          return (
            <SubRow key={k.id} name={name}
              pct={pct(k.v, k.tgt)} val={`${k.v}/${k.tgt}${unit}`} color={color}
              done={k.st === 'done' ? true : undefined} />
          );
        })}
      </>
    );
  };

  const CARD_PAD = 'border border-ink-200/80 rounded-xl overflow-hidden bg-white flex flex-col shadow-[0_2px_10px_rgba(0,0,0,0.06)]';
  return (
    <div className="flex flex-col gap-4">
      <div className="glass-card p-4">
        {/* 标题行 */}
        <div className="flex items-center gap-3 mb-3">
          <span className="w-[5px] h-[18px] rounded-full flex-shrink-0" style={{ background: 'var(--s-main)' }} />
          <InlineEdit
            value={ovTitle ?? `${year}年 · 模块概览`}
            onChange={setOvTitle}
            mode="contextmenu"
            title="右键修改标题"
            className="text-[16px] font-bold text-ink-900 leading-none" />
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[10px] font-semibold text-ink-800 bg-ink-100 border border-ink-200 rounded-full px-2 py-[2px] leading-none">
              ⌖ 时间锚 {anchor}%
            </span>
            <span className="text-[10px] text-ink-400 leading-none">剩 {daysLeft} 天</span>
          </div>
        </div>

        {/* ★ 3+2 响应式网格:md+ 3列 / sm+ 2列 / 默认1列 */}
        <div className="grid gap-2.5 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
          {/* 精力 */}
          <div className={CARD_PAD}>
            <CardHead c={CATEGORIES[0]} pctVal={perCat[0]} />
            <CardBody show={!collapsed.energy}>
              {habits.map(h => (
                <SubRow key={h.key}
                  name={h.label}
                  pct={pct(h.val, h.target)} val={`${h.val}/${h.target}天`} color="var(--m-energy)" />
              ))}
            </CardBody>
          </div>

          {/* 知力 */}
          <div className={CARD_PAD}>
            <CardHead c={CATEGORIES[1]} pctVal={perCat[1]} />
            <CardBody show={!collapsed.cognition}>
              {(() => {
                const rates = [
                  '100%',
                  funnel.total > 0 ? `${Math.round(funnel.done / funnel.total * 100)}%` : '0%',
                  funnel.done > 0 ? `${Math.round(funnel.notes / funnel.done * 100)}%` : '0%',
                  funnel.notes > 0 ? `${Math.round(funnel.changes / funnel.notes * 100)}%` : '0%',
                  funnel.changes > 0 ? `${Math.round(funnel.reviews / funnel.changes * 100)}%` : '0%',
                ];
                const labels5 = ['目标量', '输入量', '思考量', '行动量', '改变量'];
                const counts = [funnel.total, funnel.done, funnel.notes, funnel.changes, funnel.reviews];
                return (<>
                  {labels5.map((lb, i) => (
                    <FunnelRow key={lb} label={lb} count={counts[i]} idx={i} conv={rates[i] || '—'} total={funnel.total}
                      unit={i === 0 ? (COG_KRS[0]?.u || '本') : ''} />
                  ))}
                  <div className="text-[10.5px] text-[#8E8E93] leading-none py-1 truncate">
                    已读 {funnel.done}/{funnel.total} · 待读 {dynBooks.filter(b => b.st === 'pending').length}
                  </div>
                </>);
              })()}
            </CardBody>
          </div>

          {/* 能力 */}
          <div className={CARD_PAD}>
            <CardHead c={CATEGORIES[2]} pctVal={perCat[2]} />
            <CardBody show={!collapsed.ability}>
              {dynAbilities.map(a => {
                const doneMs = a.mstones.filter(m => m.st === 'done').length;
                const ap = a.mstones.length > 0 ? Math.round(a.mstones.reduce((s, m) => s + m.pct, 0) / a.mstones.length) : 0;
                return (
                  <SubRow key={a.id} name={a.title}
                    pct={ap} val={`${doneMs}/${a.mstones.length}项`} color="var(--m-ability)" />
                );
              })}
            </CardBody>
          </div>

          {/* 工作 */}
          <div className={CARD_PAD}>
            <CardHead c={CATEGORIES[3]} pctVal={perCat[3]} />
            <CardBody show={!collapsed.work}>
              <WorkSection title="主业" color="var(--m-work)" obj={mainWork} />
              {sideWork && <WorkSection title="副业" color="var(--m-work)" obj={sideWork} />}
            </CardBody>
          </div>

          {/* 生活 */}
          <div className={CARD_PAD}>
            <CardHead c={CATEGORIES[4]} pctVal={perCat[4]} />
            <CardBody show={!collapsed.life}>
              {dynLife.map(cat => {
                const n = cat.entries.length;
                /* 排版:关系  已记录  3条(3条加粗紫色) */
                return (
                  <SubRow key={cat.key} name={cat.lb}
                    pct={0} val={n > 0 ? '' : '待开启'}
                    color="var(--m-life)" done={n > 0 ? true : false}
                    tail={n > 0 ? (
                      <span className="text-[11.5px] font-bold tabular-nums text-right leading-none whitespace-nowrap" style={{ color: 'var(--m-life)' }}>{n}条</span>
                    ) : undefined} />
                );
              })}
            </CardBody>
          </div>
        </div>

        {/* 图例:竖线 白+柔光 4×14 跟卡头一致;色块 h-2(8px) 跟卡头条一致 */}
        <div className="flex items-center gap-3 mt-3 text-[10.5px] text-[#8E8E93] flex-wrap pl-0.5">
          <span className="inline-flex items-center gap-1"><span className="w-[4px] h-[14px] rounded-sm bg-white inline-block" style={{ boxShadow: '0 0 3px rgba(0,0,0,0.25)' }} />时间锚 {anchor}%</span>
          <span className="inline-flex items-center gap-1"><span className="w-3.5 h-2 rounded-full bg-[#34C759] inline-block" />实际</span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex items-center gap-0.5 px-1.5 py-[2px] rounded-full leading-none" style={{ background: 'rgba(52,199,89,0.20)', color: '#248A3D' }}><span className="font-semibold">↑</span>超前</span>
            <span className="inline-flex items-center gap-0.5 px-1.5 py-[2px] rounded-full leading-none" style={{ background: 'rgba(0,122,255,0.15)', color: '#0040DD' }}><span className="font-semibold">±</span>贴近</span>
            <span className="inline-flex items-center gap-0.5 px-1.5 py-[2px] rounded-full leading-none" style={{ background: 'rgba(255,59,44,0.18)', color: '#D70015' }}><span className="font-semibold">↓</span>落后</span>
          </span>
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
  // ★ ② Card2「各月数据」折叠状态（默认折叠，只显示标题行）
  const [monthsCollapsed, setMonthsCollapsed] = useState(true);

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
            className="w-[26px] h-[26px] rounded-lg grid place-items-center transition hover:brightness-105 active:scale-95 flex-shrink-0"
            style={{ background: 'rgba(var(--m-energy-rgb),0.10)', border: '1px solid rgba(var(--m-energy-rgb),0.25)', color: 'var(--m-energy)' }}
            title="添加精力习惯">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {habits.map((h, hIdx) => {
            const yearlyPct = pct(h.val, h.target);
            const GREEN = 'var(--m-energy)';
            const padNum = String(hIdx + 1).padStart(2, '0');
            const isEditingYear = editingTargetKey === (h.id || h.key);
            const EMOJI_STRIP_RE = new RegExp(String.raw`^\s*[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{1F000}-\u{1F02F}✅\u{2700}-\u{27BF}✅]\s*`, 'gu');
            const cleanLabel = (h.label || '').replace(EMOJI_STRIP_RE, '').trim() || h.label || '';

            const yearCounts = [];
            const yearMonthLabels = [];
            for (let m = 1; m <= 12; m++) {                       // ★ 1..12 全年（不止当前月）
              yearCounts.push(h.month?.[m] || 0);
              yearMonthLabels.push(`${m}月`);
            }

            return (
              <div key={h.key}
                className="grid p-3 pb-1.5 rounded-2xl bg-white border border-ink-100 shadow-[0_1px_2px_rgba(17,24,39,0.03)] hover:shadow-[0_2px_6px_rgba(17,24,39,0.05)] transition-shadow h-[210px]"
                style={{ gridTemplateRows: 'auto auto 1fr' }}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <span
                      className="text-[12px] font-bold tabular-nums w-[24px] text-right flex-shrink-0 select-none leading-none"
                      style={{ color: GREEN }}>
                      {padNum}
                    </span>
                    <span className="text-[14px] font-semibold leading-none truncate flex-1 min-w-0 text-[#48484A]">
                      {cleanLabel}
                    </span>
                  </div>
                  <div className="flex items-center flex-shrink-0">
                    {/* ★ ③ 56/230天 改为能力页同款胶囊（L4894-4901 规格：px-2 h-[26px] rounded-lg 主题色10底/40框） */}
                    <span
                      className="inline-flex items-center px-3 h-[26px] rounded-full text-[11px] font-semibold tabular-nums leading-none"
                      style={{ background: 'rgba(var(--m-energy-rgb),0.08)', color: GREEN }}
                    >
                      <span className="font-extrabold">{h.val}</span>
                      <span className="mx-0.5 opacity-50">/</span>
                      {isEditingYear ? (
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
                          className="w-10 px-1 py-0 text-[11px] font-bold text-center border border-accent-green rounded outline-none focus:ring-2 focus:ring-accent-green/30 tabular-nums text-ink-900 bg-white"
                        />
                      ) : (
                        <span
                          className="opacity-70 cursor-pointer hover:opacity-100"
                          onClick={() => startEditTarget(h)}
                          title="点击修改年度目标"
                        >
                          {h.target}{h.unit}
                        </span>
                      )}
                    </span>
                  </div>
                </div>
                {/* ★ ① 能力页同款 DualMarkerBar（实际完成率 vs 时间计划锚点）
                    zoom 0.92 整体缩一档：气泡/轨道/下方标签同步变小，视觉层级次于标题行 */}
                <div className="mt-1" style={{ }}>
                  <DualMarkerBar
                    actual={yearlyPct}
                    plan={Math.round(curMonth / 12 * 100)}
                    color={GREEN}
                    showBadge={false}
                    actualDetail={`累计打卡 ${h.val} / 年目标 ${h.target}${h.unit} = ${yearlyPct}%`}
                    planDetail={`时间锚点 ${Math.round(curMonth / 12 * 100)}%（${curMonth}/12 月）`}
                  />
                </div>
                {/* ★ 折线容器：grid 第 3 行 1fr，Sparkline 高度由父行实际分配（no 溢出） */}
                <div className="mt-2 w-full flex justify-center items-center overflow-hidden">
                  <Sparkline data={yearCounts} labels={yearMonthLabels} color={GREEN} width={420} height={90}
                    futureFrom={curMonth + 1} activeIdx={selectedMonth - 1}
                    currentIdx={curMonth - 1} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ========== Card 2 / 3：各月数据趋势（可折叠） ========== */}
      <div className="glass-card p-5 overflow-hidden">
        {/* ★ ② 标题行可点击折叠/展开：chevron 旋转指示状态 */}
        <div
          className="flex items-center justify-between cursor-pointer select-none group"
          onClick={() => setMonthsCollapsed(v => !v)}
          role="button"
          aria-expanded={!monthsCollapsed}
          aria-label={monthsCollapsed ? '展开各月数据' : '折叠各月数据'}>
          <div className="flex items-center gap-2">
            <span className="w-[5px] h-[18px] rounded-full bg-accent-green flex-shrink-0"></span>
            <span className="text-[16px] font-bold text-ink-900">{year}年 · 各月数据</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-ink-400 font-medium tabular-nums">{habits.length}项</span>
            <svg
              className={`w-[18px] h-[18px] text-ink-400 transition-transform duration-200 ${monthsCollapsed ? '' : 'rotate-180'}`}
              fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>
        {/* 折叠态：清空下方间距（标题与内容过渡紧凑）；展开态：微间距 */}
        <div className={monthsCollapsed ? '' : 'mt-2'}></div>
        {!monthsCollapsed && (
          <>
        <div className="grid habit-table px-0 py-1 bg-transparent text-[14px] font-semibold text-[#48484A]">
          <div className="grp-start whitespace-nowrap overflow-hidden text-ellipsis flex items-center gap-2">
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
          const GREEN = 'var(--m-energy)';
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
                <span className="text-[14px] font-semibold truncate leading-none text-[#48484A]">{cleanLabel}</span>
              </div>
              <div className="flex justify-center items-center cursor-pointer rate-gap" onClick={() => onAction?.('editHabit', h)}>
                {h.target > 0 ? (
                  <span
                    className="relative flex-shrink-0 rounded-[6px] grid place-items-center select-none h-[28px]"
                    style={{
                      width: '56px',
                      background: GREEN,
                      color: '#fff',
                      boxShadow: '0 1px 2px rgba(52,199,89,0.25)',
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
        </>
        )}
      </div>

      {/* ========== Card 3 / 3：当月打卡日历 ========== */}
      <div className="glass-card p-5 overflow-hidden">
        {/* ★ ③ 标题行：标题居左，月份 Tab 移到同一行最右侧（书架 Tab 同款规格） */}
        <div className="flex items-center justify-between gap-3 mb-2.5">
          <span className="flex items-center gap-2 flex-shrink-0">
            <span className="w-[5px] h-[18px] rounded-full bg-accent-green flex-shrink-0"></span>
            <span className="text-[16px] font-bold text-ink-900">{year}年 · {selectedMonth}月数据</span>
          </span>
          {/* 12 月份 Tab · 书架 Tab 同款；左侧渐隐(避免溢出时生硬截断)+右侧内边距(保证最右月完整可见) */}
          <div className="flex items-center gap-1 min-w-0 flex-1 justify-end overflow-x-auto px-2 pr-1"
            style={{
              WebkitMaskImage: 'linear-gradient(to right, transparent, black 18px, black 100%)',
              maskImage: 'linear-gradient(to right, transparent, black 18px, black 100%)',
            }}>
            {monthIndices.map(m => {
              const isCurrent = m === curMonth;
              const isPast = m < curMonth;
              const selected = m === selectedMonth;
              const monthTotal = habits.reduce((s, hh) => s + (hh.month?.[m] || 0), 0);
              return (
                <button key={m} type="button" onClick={() => setSelectedMonth(m)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[10px] transition-all duration-150 whitespace-nowrap flex-shrink-0 cursor-pointer active:scale-[.96]"
                  style={{
                    background: selected ? 'var(--m-energy)' : 'transparent',
                    color: selected ? '#ffffff' : '#64748b',
                    fontWeight: selected ? 700 : 500,
                    fontSize: '11.5px',
                    boxShadow: selected ? 'none' : 'inset 0 0 0 1px rgba(15,23,42,0.05)',
                  }}
                  title={`${m}月 · 累计打卡 ${monthTotal}`}>
                  {isCurrent && !selected && (
                    <span className="w-[5px] h-[5px] rounded-full flex-shrink-0" style={{ background: 'var(--m-energy)' }} />
                  )}
                  <span>{m}月</span>
                  <span className="inline-flex items-center justify-center min-w-[17px] h-[15px] px-1 rounded-full text-[10px] font-bold tabular-nums leading-none"
                    style={{
                      background: selected ? 'rgba(255,255,255,0.28)' : 'rgba(15,23,42,0.05)',
                      color: selected ? '#ffffff' : (isPast ? 'var(--m-energy)' : '#64748b'),
                    }}>
                    {isCurrent || isPast ? monthTotal : 0}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ★ ③ 图例移到卡片最右边（flex 居右，与月份 Tab 同级第二行末尾；三态颜色语义保留） */}
        <div className="flex items-center justify-end text-[11px] text-ink-400 mb-3 ml-auto">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-[14px] h-[14px] rounded-md bg-accent-green/15 text-accent-green grid place-items-center" style={{border: '1px solid rgba(52,199,89,0.25)'}}>
                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </span>已打卡
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-[14px] h-[14px] rounded-md bg-ink-100 shadow-[0_0_0_1px_rgba(17,24,39,0.04)]"></span>未打卡
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-[14px] h-[14px] rounded-md bg-ink-50 border border-ink-200"></span>未开始
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
            const GREEN = 'var(--m-energy)';
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
                  <span className="text-[14px] font-semibold truncate leading-none text-[#48484A] min-w-0 flex-1">
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
                          boxShadow: '0 1px 2px rgba(52,199,89,0.25)',
                        }}>
                        <span className="flex items-baseline leading-none">
                          <span className="text-[12px] font-bold tabular-nums">{monthRate}</span>
                          <span className="text-[9px] font-semibold opacity-85 ml-[1px]">%</span>
                        </span>
                      </span>
                      <div className="flex items-baseline leading-none flex-shrink-0">
                        <span className="text-[12.5px] font-semibold tabular-nums text-[#48484A]">{doneCount}</span>
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
  const BLUE_DARK = '#0062CC';
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
  const BTN_P = { padding: '8px 16px', borderRadius: 9, border: 'none', background: 'var(--s-main)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
  const BTN_G = { padding: '8px 16px', borderRadius: 9, border: '1px solid rgba(15,23,42,0.1)', background: 'transparent', color: '#8e8e93', fontSize: 13, fontWeight: 500, cursor: 'pointer' };
  const BTN_D = { padding: '8px 16px', borderRadius: 9, border: 'none', background: '#FF3B30', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' };

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
  const INPUT_TITLE = { ...INPUT, fontSize: 14, fontWeight: 600, color: '#1c1c1e', padding: '9px 12px', border: '1.5px solid rgba(var(--s-rgb),0.35)', boxShadow: '0 0 0 3px rgba(var(--s-rgb),0.06)' };
  const INPUT_OPT = { ...INPUT, border: '1px dashed rgba(148,163,184,0.5)', background: 'rgba(248,250,252,0.6)' };
  const BTN_P = { padding: '8px 16px', borderRadius: 9, border: 'none', background: 'var(--s-main)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
  const BTN_G = { padding: '8px 16px', borderRadius: 9, border: '1px solid rgba(15,23,42,0.1)', background: 'transparent', color: '#8e8e93', fontSize: 13, fontWeight: 500, cursor: 'pointer' };
  const BTN_D = { padding: '8px 16px', borderRadius: 9, border: '1px solid rgba(255,59,48,0.25)', background: 'rgba(255,59,48,0.08)', color: '#FF3B30', fontSize: 13, fontWeight: 600, cursor: 'pointer' };

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
                background: form.tag === t.v ? `rgba(var(--s-rgb),0.10)` : 'rgba(120,120,128,0.08)',
                color: form.tag === t.v ? "var(--s-main)" : '#8e8e93',
                border: form.tag === t.v ? `1px solid rgba(var(--s-rgb),0.25)` : '1px solid transparent',
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
          style={{ background: 'rgba(var(--s-rgb),0.10)', border: '1px solid rgba(var(--s-rgb),0.25)', color: 'var(--s-main)' }}>
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
                  className="flex items-center gap-2.5 px-2.5 py-2 rounded-[10px] transition text-left hover:bg-[rgba(var(--s-rgb),0.05)]"
                  style={{ background: '#fff', border: '1px solid rgba(15,23,42,0.08)' }}>
                  <svg className="w-[15px] h-[15px] flex-shrink-0" fill="none" stroke="var(--s-main)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z"/>
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                  </svg>
                  <span className="text-[13px] font-semibold text-[#48484A] truncate flex-1 min-w-0">{b.t}</span>
                  {b.author && <span className="text-[11px] text-ink-400 flex-shrink-0 truncate max-w-[90px]">{b.author}</span>}
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
                    style={{ background: 'rgba(var(--s-rgb),0.10)', color: 'var(--s-main)' }}>
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
    if (n >= 9) return '#34C759';
    if (n >= 6) return '#FF9500';
    return '#FF3B30';
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
  const BTN_P = { padding: '8px 16px', borderRadius: 9, border: 'none', background: '#FF9500', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
  const BTN_G = { padding: '8px 16px', borderRadius: 9, border: '1px solid rgba(15,23,42,0.1)', background: 'transparent', color: '#8e8e93', fontSize: 13, fontWeight: 500, cursor: 'pointer' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 顶部说明 */}
      <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(255,149,0,0.08)', border: '1px solid rgba(255,149,0,0.18)', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <svg style={{ width: 18, height: 18, color: '#FF9500', flexShrink: 0, marginTop: 1 }} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <div style={{ fontSize: 12, lineHeight: 1.55, color: '#804B00' }}>
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
                        color: delta > 0 ? '#34C759' : delta < 0 ? '#FF3B30' : '#8e8e93',
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
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3, fontSize: 10, color: '#8E8E93', fontWeight: 600, padding: '0 1px' }}>
                <span>0</span><span>2</span><span>4</span><span>6</span><span>8</span><span>10</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* 汇总 + 按钮 */}
      <div style={{ padding: '12px', borderRadius: 12, background: 'rgba(255,149,0,0.05)', border: '1px solid rgba(255,149,0,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#B36900', marginBottom: 2 }}>综合自评</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
            <span style={{ fontSize: 24, fontWeight: 800, color: '#FF9500', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{avg}</span>
            <span style={{ fontSize: 13, color: '#B36900', opacity: .8 }}>/10</span>
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
  const BTN_P = { padding: '8px 16px', borderRadius: 9, border: 'none', background: '#FF3B30', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
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
            <span style={{ fontSize: 11.5, fontWeight: 600, color: '#804B00' }}>
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
              border: a.done ? '1px solid rgba(52,199,89,0.2)' : '1px solid rgba(15,23,42,0.08)',
              background: a.done ? 'rgba(52,199,89,0.04)' : '#fff',
              display: 'flex', alignItems: 'flex-start', gap: 9,
            }}>
              <input
                type="checkbox" checked={!!a.done}
                onChange={() => setActions(prev => prev.map(x => x.id === a.id ? { ...x, done: !x.done } : x))}
                style={{ width: 16, height: 16, marginTop: 1, accentColor: '#FF3B30', flexShrink: 0 }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 12.5, fontWeight: 600, lineHeight: 1.45,
                  color: a.done ? '#34C759' : '#1c1c1e',
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

  const BTN_P = { padding: '8px 16px', borderRadius: 9, border: 'none', background: 'linear-gradient(135deg,var(--m-life),#FF2D55)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', boxShadow: '0 1px 3px rgba(var(--m-life-rgb),0.25)' };
  const BTN_G = { padding: '8px 16px', borderRadius: 9, border: '1px solid rgba(15,23,42,0.1)', background: 'transparent', color: '#8e8e93', fontSize: 13, fontWeight: 500, cursor: 'pointer' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* 顶部说明 */}
      <div style={{ padding: '12px', borderRadius: 12, background: 'linear-gradient(135deg, rgba(var(--m-life-rgb),0.08) 0%, rgba(255,45,85,0.08) 100%)', border: '1px solid rgba(var(--m-life-rgb),0.18)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: 'linear-gradient(135deg,var(--m-life),#FF2D55)', color: '#fff',
          display: 'grid', placeItems: 'center', flexShrink: 0, boxShadow: '0 2px 6px rgba(var(--m-life-rgb),0.3)',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1c1c1e', marginBottom: 4 }}>{year} 年度精选 · 记忆卡生成</div>
          <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.5 }}>
            选择 <b style={{ color: 'var(--m-life)' }}>3–9 条</b> 最珍贵的生活片段，下面会实时生成一张今年的专属记忆卡预览。
            已选 <b>{currentHl.length}</b> / 共 <b>{allEntries.length}</b> 条可挑选。
          </div>
        </div>
      </div>

      {/* 记忆卡预览 */}
      <div>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: '#1c1c1e', marginBottom: 8 }}>🪄 记忆卡预览</div>
        <div style={{
          borderRadius: 16, padding: 20, position: 'relative', overflow: 'hidden',
          background: 'linear-gradient(160deg, #f5f3ff 0%, #fdf4ff 45%, #FFEEED 100%)',
          border: '1px solid rgba(var(--m-life-rgb),0.15)',
          boxShadow: '0 4px 16px rgba(var(--m-life-rgb),0.1)',
        }}>
          {/* 装饰光斑 */}
          <div style={{ position: 'absolute', top: -40, right: -30, width: 180, height: 180, borderRadius: 999, background: 'radial-gradient(circle, rgba(255,45,85,0.22), transparent 60%)' }} />
          <div style={{ position: 'absolute', bottom: -50, left: -30, width: 180, height: 180, borderRadius: 999, background: 'radial-gradient(circle, rgba(var(--m-life-rgb),0.22), transparent 60%)' }} />

          <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--m-life)"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
              <span style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: 1.5, color: 'var(--m-life)' }}>{year} · 我的珍藏年卡</span>
            </div>
            {currentHl.length === 0 ? (
              <div style={{
                padding: '22px 14px', textAlign: 'center', borderRadius: 12,
                border: '1px dashed rgba(var(--m-life-rgb),0.35)', color: '#9C48C7', fontSize: 12, fontWeight: 600,
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
                      width: 22, height: 22, borderRadius: 7, background: 'rgba(var(--m-life-rgb),0.09)', color: 'var(--m-life)',
                      display: 'grid', placeItems: 'center', flexShrink: 0, fontSize: 10.5, fontWeight: 800,
                    }}>
                      {e.catLb.slice(0, 1)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#1c1c1e', lineHeight: 1.45 }}>{e.t}</div>
                      {e.n && <div style={{ fontSize: 10.5, color: '#6b7280', marginTop: 2, lineHeight: 1.4 }}>{e.n}</div>}
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--m-life)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{e.d}</div>
                  </div>
                ))}
              </div>
            )}
            {/* 底部签名 */}
            <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px dashed rgba(var(--m-life-rgb),0.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 10.5, fontWeight: 600, color: '#9C48C7', letterSpacing: .8 }}>PERSONAL · ANNUAL · CARD</span>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: '#FF2D55' }}>{currentHl.length} memories</span>
            </div>
          </div>
        </div>
      </div>

      {/* 快速操作 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: '#1c1c1e' }}>📋 挑选条目（{currentHl.length}）</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={autoSelectRecommended}
            style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid rgba(var(--m-life-rgb),0.25)', background: 'rgba(var(--m-life-rgb),0.06)', color: '#9C48C7', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
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
              border: sel ? '1px solid rgba(var(--m-life-rgb),0.33)' : '1px solid rgba(15,23,42,0.08)',
              background: sel ? 'rgba(var(--m-life-rgb),0.04)' : '#fff',
              display: 'flex', alignItems: 'flex-start', gap: 10,
            }}>
              <div style={{
                width: 22, height: 22, borderRadius: 7, background: 'rgba(var(--m-life-rgb),0.09)', color: 'var(--m-life)',
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
                    background: sel ? 'linear-gradient(135deg,var(--m-life),#FF2D55)' : 'rgba(15,23,42,0.05)',
                    color: sel ? '#fff' : '#cbd5e1',
                    boxShadow: sel ? '0 1px 3px rgba(var(--m-life-rgb),0.3)' : 'none',
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
        const r = await fetch('/api/userSettings/get', {
          headers: { 'X-Unlock-Token': localStorage.getItem('pw_unlock_token') || '' },
        });
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
        headers: {
          'Content-Type': 'application/json',
          'X-Unlock-Token': localStorage.getItem('pw_unlock_token') || '',
        },
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

  const BLUE = 'var(--m-cognition)'; // 知力页卡片跟随知力模块色
  const BLUE_DARK = '#0062cc';  // 深蓝
  const BLUE_LIGHT = 'rgba(var(--m-cognition-rgb),0.08)';
  const BLUE_BG = 'rgba(var(--m-cognition-rgb),0.12)';
  const S_RGB = 'var(--m-cognition-rgb)'; // 知力模块 RGB（用于 rgba(${S_RGB}, α) 透明合成）
  // 分类色标：4 大类固定颜色（身份识别）
  const CAT_COLORS = {
    '认知成长': 'var(--m-cognition)',
    '人际沟通': 'var(--m-life)',
    '商业职场': 'var(--m-ability)',
    '人文叙事': 'var(--m-energy)',
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

  // 总体节奏：实际完成率（已读/目标）vs 计划完成率（当前月/12，时间锚点）
  const paceNow = new Date();
  const paceMonth = paceNow.getMonth() + 1;
  const paceActual = funnelData.total > 0 ? Math.round((funnelData.done / funnelData.total) * 1000) / 10 : 0;
  const pacePlan = Math.round((paceMonth / 12) * 1000) / 10;

  // 精确剩余时间：X月 Y天（按实际日历天数换算，30天为一整月，余下天数）
  const paceRemain = useMemo(() => {
    if (paceMonth >= 12) return '年度已收官';
    const year = paceNow.getFullYear();
    const end = new Date(year, 11, 31, 23, 59, 59);
    const totalDays = Math.max(0, Math.ceil((end.getTime() - paceNow.getTime()) / 86400000));
    if (totalDays <= 0) return '年度已收官';
    const estMonths = Math.floor(totalDays / 30);
    const estDays = totalDays % 30;
    if (estMonths === 0) return `${estDays} 天`;
    if (estDays === 0) return `${estMonths} 月`;
    return `${estMonths} 月 ${estDays} 天`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paceNow, paceMonth]);

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
    <div className="flex flex-col gap-4">

      {/* ===== Row 1: 左 OKR(6) + 右 书架(6) 一体化布局 — 6:6 等分, 书架2列卡片恢复原始尺寸 ===== */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-3">

      {/* ===== 左侧·一体化 KR × 漏斗 卡片（6/12 列） ===== */}
      <div className="xl:col-span-6 bg-white rounded-2xl border border-ink-100 p-5 flex flex-col min-h-0">
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
              <button
                onClick={() => { setAddingKr(true); setNewKr({ lb: '', tgt: 12, val: 0, u: '本', sub: '' }); }}
                className="inline-flex items-center justify-center w-[26px] h-[26px] rounded-lg transition flex-shrink-0"
                style={{ color: BLUE, background: `rgba(${S_RGB},0.06)` }}
                title="新增KR">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" strokeLinecap="round"/></svg>
              </button>
            </div>
          )}
        </div>

        {/* ===== 双标记进度条：实际 vs 计划（节奏信息整合进「计划」marker tooltip，参考能力页 planDetail 设计）
            zoom 0.92 整体缩一档：气泡/轨道/下方标签同步变小，视觉层级次于标题行 ===== */}
        <div className="mb-2 px-0.5" style={{ }}>
          {(() => {
            const a = Math.max(0, Math.min(100, Number(paceActual) || 0));
            const p = Math.max(0, Math.min(100, Number(pacePlan) || 0));
            const diff = Math.round(Math.abs(a - p));
            const ahead = a >= p;
            const diffTxt = diff === 0 ? '节奏匹配' : (ahead ? `超前 ${diff}%` : `落后 ${diff}%`);
            const remain = paceMonth >= 12 || paceRemain === '年度已收官' ? '年度已收官' : `剩余 ${paceRemain}`;
            return (
              <DualMarkerBar
                actual={paceActual}
                plan={pacePlan}
                color={BLUE}
                showBadge={false}
                actualDetail={`已读完 ${funnelData.done} 本 / 目标 ${funnelData.total} 本 = ${paceActual}%`}
                planDetail={`时间锚点 ${pacePlan}%（${paceMonth}/12 月） · ${diffTxt} · ${remain}`}
              />
            );
          })()}
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
            const minPxWidth = p === 0 ? 22 : Math.max(16, Math.round(22 * 0.7));
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
                        <span className="text-[13px] font-semibold text-[#48484A] truncate leading-none group-hover:text-ink-900">{cleanLb}</span>
                        <span className="text-[11px] font-extrabold text-ink-900 tabular-nums leading-none flex-shrink-0">
                          {kr.tgt}{kr.u}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 中部：漏斗进度条（flex-1） — 计数填充条 → 胶囊（语义：数值色块） */}
                  <div className="flex-1 flex items-center min-w-0">
                    <div className="flex-1 h-[22px] rounded-full overflow-hidden bg-ink-50 relative" style={{ minWidth: '40px' }}>
                      <div className="relative w-full h-full flex items-center">
                        <div
                          className="h-full rounded-full transition-all duration-500 flex items-center justify-start pl-2"
                          style={{
                            width: `${pctWidth}%`,
                            minWidth: `${minPxWidth}px`,
                            background: isDone
                              ? '#34C759'
                              : `${BLUE}`,
                            boxShadow: isDone ? '0 1px 3px rgba(52,199,89,0.25)' : `0 1px 3px rgba(${S_RGB},0.15)`,
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
                    style={{ color: isDone ? '#111827' : (isBehind ? '#FF3B30' : BLUE) }}>
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
                          style={{ color: lowConv ? '#FF3B30' : '#8a9491' }}>
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
            <div className="flex items-start gap-2 mt-2 pt-2.5 pb-1 px-3 rounded-lg"
              style={{ background: 'rgba(255,149,0,0.06)', border: '1px solid rgba(255,149,0,0.18)' }}>
              {/* 橙色三角标：与「关键瓶颈」11px/15.4px 行高中心对齐（同工作页红色三角对齐逻辑） */}
              <svg className="w-[14px] h-[14px] flex-shrink-0 mt-[0.5px]" fill="#FF9500" viewBox="0 0 24 24">
                <path d="M12 2.5c-.6 0-1.1.3-1.4.8L1.5 19.3c-.3.5-.1 1.1.3 1.4.2.2.5.3.8.3h18.8c.3 0 .6-.1.8-.3.5-.3.6-.9.3-1.4L13.4 3.3c-.3-.5-.8-.8-1.4-.8z"/><path d="M12 9v4.5M12 17.5v.01" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>
              </svg>
              <div className="min-w-0 flex-1 text-[11px] leading-[1.4]">
                <span className="font-bold text-ink-700">关键瓶颈：</span>
                <span className="text-ink-600">
                  从「<span style={{ color: BLUE, fontWeight: 700 }}>{minConv.from}</span>」
                  到「<span style={{ color: BLUE, fontWeight: 700 }}>{minConv.to}</span>」
                  转化率
                  <span style={{ color: '#FF3B30', fontWeight: 800 }}> {minConv.rate}% </span>
                  — {suggestions[0]}
                </span>
              </div>
            </div>
          );
        })()}

      </div>
      {/* ===== 一体化 KR × 漏斗 卡片 END ===== */}

      {/* ===== 右侧·书架看板（6/12 列，2列网格恢复原始卡片尺寸） ===== */}
      <div className="xl:col-span-6 flex flex-col min-h-0">
      {/* ===== 书架看板 ===== */}
      <div className="bg-white rounded-2xl border border-ink-100 p-5 flex flex-col flex-1 min-h-0">
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
                style={{ color: BLUE, background: `rgba(${S_RGB},0.06)` }}
                title={wereadCfgOk ? '从微信读书同步书架' : '先设置微信读书 API Key'}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M4 4v5h5M20 20v-5h-5M20 9A8 8 0 0 0 6.34 5.34L4 9M4 15a8 8 0 0 0 13.66 3.66L20 15" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              <button onClick={async () => {
                  setShowWereadSettings(true);
                  try {
                    const r = await fetch('/api/userSettings/get', {
                      headers: { 'X-Unlock-Token': localStorage.getItem('pw_unlock_token') || '' },
                    });
                    const j = await r.json().catch(() => ({}));
                    const cfg = j?.data?.weread_api_key || {};
                    if (cfg.value) setWereadKey(cfg.value);
                  } catch {}
                }}
                className="inline-flex items-center justify-center w-[26px] h-[26px] rounded-lg transition flex-shrink-0"
                style={{ color: BLUE, background: `rgba(${S_RGB},0.06)` }}
                title="设置微信读书 API Key">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              <button onClick={() => onBookAdd?.()}
                className="inline-flex items-center justify-center w-[26px] h-[26px] rounded-lg transition flex-shrink-0"
                style={{ color: BLUE, background: `rgba(${S_RGB},0.06)` }}
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
            done:      { lb: '已读完',   col: '#34C759' },
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
                        statusDot = { col: '#34C759', solid: true, pulse: false, lb: '已读完' };
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
                        case '认知成长': return 'linear-gradient(135deg,#F0F6FF,#DCEBFF)';
                        case '人际沟通': return 'linear-gradient(135deg,#faf5ff,#ede9fe)';
                        case '商业职场': return 'linear-gradient(135deg,#fff7ed,#FFE4CC)';
                        case '人文叙事': return 'linear-gradient(135deg,#EDFAF1,#ADE5C2)';
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
                                  <div className={`min-w-0 truncate text-[15px] leading-[1.3] ${statusDot.strike ? 'line-through' : ''}`}
                                    style={{ fontWeight: 600, color: isDone ? '#8E8E93' : '#48484A', letterSpacing: '0.1px' }}>
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
                                        color: hasEbookLink ? '#4F90FF' : '#cbd5e1',
                                      }}
                                      onMouseEnter={(e) => {
                                        if (!hasEbookLink) return;
                                        e.currentTarget.style.background = BLUE;
                                        e.currentTarget.style.color = '#fff';
                                      }}
                                      onMouseLeave={(e) => {
                                        e.currentTarget.style.background = 'transparent';
                                        e.currentTarget.style.color = hasEbookLink ? '#4F90FF' : '#cbd5e1';
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
                                        case '商业职场': return '#FFE4CC';
                                        case '人文叙事': return '#D5F2DF';
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
                                  style={{ color: b.st==='done' ? '#34C759' : statusDot.col }}>{pct}%</span>
                                <div style={{ width: '100%', height:'5px', borderRadius:'999px', background:'#e2e8f0', overflow:'hidden', flex: '1 1 auto' }}>
                                  <div style={{
                                    width: `${Math.max(0, pct)}%`, height: '100%', borderRadius:'999px',
                                    background: b.st === 'done' ? '#34C759' : b.st === 'abandoned' ? '#8a9491' : pct <= 0 ? 'transparent' : statusDot.col,
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
                                  style={{ background: '#34C759' }}>
                                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7"/></svg>
                                </div>
                                <span className="text-[11px] font-semibold text-ink-600 leading-none">思考 {validIns.length} 组</span>
                              </div>
                            )}
                            {hasAct && (
                              <div className="flex items-center gap-[5px]">
                                <div className={`flex items-center justify-center w-[14px] h-[14px] rounded-[3.5px]`}
                                  style={{ background: '#34C759' }}>
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
                                    style={{ background: '#34C759' }}>
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
                style={{ background: BLUE, boxShadow: `0 2px 8px rgba(${S_RGB},0.21)` }}>添加</button>
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
                style={{ background: 'rgba(255,59,48,0.08)', border: '1px solid rgba(255,59,48,0.25)', color: '#FF3B30' }}>删除</button>
              <div className="flex-1"></div>
              <button onClick={() => setEditingKrModal(null)}
                className="px-4 py-1.5 text-[13px] rounded-[10px] transition"
                style={{ background: 'rgba(15,23,42,0.04)', color: '#64748b' }}>取消</button>
              <button onClick={commitEditKr}
                className="px-5 py-1.5 text-[13px] text-white rounded-[10px] transition"
                style={{ background: BLUE, boxShadow: `0 2px 8px rgba(${S_RGB},0.21)` }}>保存</button>
            </>
          }>
          <KrFormFields
            lb={editingKrModal.draft.lb} tgt={editingKrModal.draft.tgt} u={editingKrModal.draft.u} sub={editingKrModal.draft.sub}
            onChange={(patch) => setEditingKrModal(prev => ({ ...prev, draft: { ...prev.draft, ...patch } }))} />
        </Modal>
      )}

      {/* ===== 读后思考 · 思后行动 · 行后改变（三栏横向布局）===== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">

        {/* ========== 卡片一：读后思考 ========== */}
        <div className="bg-white rounded-2xl border border-ink-100 p-5 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <span className="w-[5px] h-[18px] rounded-full flex-shrink-0" style={{ background: BLUE }}></span>
              <span className="text-[16px] font-bold text-ink-900 leading-tight">{year}年 · 读后思考</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold px-3 rounded-full inline-flex items-center h-[26px]" style={{ background: `rgba(${S_RGB},0.08)`, color: BLUE }}>
                {totalInsightCount}组
              </span>
              <button onClick={() => setBookPicker('insights')}
                className="inline-flex items-center justify-center w-[26px] h-[26px] rounded-lg transition flex-shrink-0"
                style={{ background: `rgba(${S_RGB},0.06)`, color: BLUE }}
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
        <div className="bg-white rounded-2xl border border-ink-100 p-5 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <span className="w-[5px] h-[18px] rounded-full flex-shrink-0" style={{ background: BLUE }}></span>
              <span className="text-[16px] font-bold text-ink-900 leading-tight">{year}年 · 思后行动</span>
            </div>
            <div className="flex items-center gap-1.5">
              {/* 胶囊：已勾选完成数 / 总条数 — 与卡片内每条 action 的圆形复选框 isCompleted 判定严格一致：c.done || status==='completed'||'reviewed' */}
              <span className="text-[11px] font-semibold px-3 rounded-full inline-flex items-center h-[26px] tabular-nums" style={{ background: `rgba(${S_RGB},0.08)`, color: BLUE }}>
                {(() => {
                  const all = [...(bookActionsList || []), ...(changes || [])];
                  const done = all.filter(c => c.done || c.status === 'completed' || c.status === 'reviewed').length;
                  return (<><span className="font-extrabold">{done}</span><span className="opacity-50 mx-0.5">/</span>{all.length}条</>);
                })()}
              </span>
              <button onClick={() => setBookPicker('actions')}
                className="inline-flex items-center justify-center w-[26px] h-[26px] rounded-lg transition flex-shrink-0"
                style={{ background: `rgba(${S_RGB},0.06)`, color: BLUE }}
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
                                className="text-ink-300 hover:text-accent-red transition flex-shrink-0"
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
        <div className="bg-white rounded-2xl border border-ink-100 p-5 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <span className="w-[5px] h-[18px] rounded-full flex-shrink-0" style={{ background: BLUE }}></span>
              <span className="text-[16px] font-bold text-ink-900 leading-tight">{year}年 · 行后改变</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold px-3 rounded-full inline-flex items-center h-[26px]" style={{ background: `rgba(${S_RGB},0.08)`, color: BLUE }}>
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
                style={{ background: `rgba(${S_RGB},0.06)`, color: BLUE }}
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
                  cognition:    { lb: '认知更新', color: BLUE, bg: `rgba(${S_RGB},0.06)`, bd: `rgba(${S_RGB},0.15)` },
                  habit:        { lb: '长期习惯', color: BLUE, bg: `rgba(${S_RGB},0.16)`, bd: `rgba(${S_RGB},0.27)` },
                  internalized: { lb: '已内化', color: '#fff', bg: BLUE, bd: BLUE, solid: true },
                  decision:     { lb: '认知更新', color: BLUE, bg: `rgba(${S_RGB},0.06)`, bd: `rgba(${S_RGB},0.15)` },
                  sop:          { lb: '已内化', color: '#fff', bg: BLUE, bd: BLUE, solid: true },
                };
                const tm = tagMeta[r.tag] || tagMeta.cognition;
                return (
                  <div key={r.id}
                    className="rounded-xl p-2.5 hover:shadow-md transition-all cursor-pointer"
                    style={{ background: '#fff', border: '1px solid rgba(15,23,42,0.08)' }}
                    onClick={() => setEditingReview(r)}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[12px] font-semibold text-[#48484A] leading-snug line-clamp-2 flex-1 min-w-0">{r.text || '未命名改变'}</div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded" style={{
                          background: tm.bg, border: `1px solid ${tm.bd}`,
                          color: tm.solid ? '#fff' : tm.color,
                        }}>
                          {tm.lb}
                        </span>
                        <button onClick={(e) => { e.stopPropagation(); if (confirm('确定删除这条改变？')) onReviewRemove?.(r.id); }}
                          className="text-ink-300 hover:text-accent-red transition"
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
                style={{ background: BLUE, boxShadow: `0 2px 8px rgba(${S_RGB},0.21)` }}>保存</button>
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
function AbilityView({ abilities, onMsAdd, onMsEdit, onMsToggleDone, onAbilityAdd, onAbilityEdit, onAbilityRemove, scoreHistory, onStartAssessment }) {
  const dynAb = abilities || ABILITY;
  const year = new Date().getFullYear();
  const AB_COLOR = 'var(--m-ability)';
  const AB_DARK = 'var(--m-ability)';

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
      <div key={a.id || a.title} className="bg-white rounded-2xl border border-ink-100 hover:shadow-md transition-shadow p-5 flex flex-col group">
        {/* 标题行：色条 + 16px 可编辑标题 | 删除(悬停) + 已勾选/总数胶囊 + 26×26 加号 */}
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-[5px] h-[18px] rounded-full flex-shrink-0" style={{ background: AB }}></span>
            <span
              className="text-[16px] font-bold leading-tight text-ink-900 truncate cursor-pointer hover:text-ink-700 transition-colors"
              onClick={() => onAbilityEdit?.(as.idx)}
              title="编辑能力目标">{a.title}</span>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* 删除：整卡悬停时可见 */}
            <span
              className="inline-flex items-center px-3 h-[26px] rounded-full text-[11px] font-semibold tabular-nums leading-none"
              style={{ background: 'rgba(var(--m-ability-rgb),0.08)', color: AB_DARK }}
            >
              <span className="font-extrabold">{as.mDone}</span>
              <span className="mx-0.5 opacity-50">/</span>
              <span className="opacity-70">{as.mTotal}</span>
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); onMsAdd?.(as.idx); }}
              title="添加里程碑"
              className="w-[26px] h-[26px] rounded-lg grid place-items-center transition hover:brightness-105 active:scale-95 flex-shrink-0"
              style={{ background: 'rgba(var(--m-ability-rgb),0.10)' }}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke={AB} strokeWidth="2.5" viewBox="0 0 24 24" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
            </button>
          </div>
        </div>

        {/* 进度条：双标记（实际 avgPct / 计划 timePct）— 工作页同款 DualMarkerBar
            zoom 0.92 整体缩一档，视觉层级次于标题行 */}
        {(() => {
          const remainTxt = (as.days !== null && as.days !== undefined && as.days > 0)
            ? (() => { const mo = Math.floor(as.days / 30); const dy = as.days % 30;
                return mo === 0 ? `剩余 ${dy} 天` : (dy === 0 ? `剩余 ${mo} 月` : `剩余 ${mo} 月 ${dy} 天`); })()
            : null;
          if (as.timePct === null || as.timePct === undefined) {
            return (
              <div className="mb-2.5">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-semibold text-ink-500 leading-none">总体完成度</span>
                  <span className="text-[11px] font-extrabold tabular-nums leading-none" style={{ color: AB_DARK }}>{as.avgPct}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-ink-100 overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${as.avgPct}%`, background: AB }}></div>
                </div>
              </div>
            );
          }
          return (
            <div className="-mt-0.5" style={{ }}>
              <DualMarkerBar
                actual={as.avgPct}
                plan={as.timePct}
                color={AB_COLOR}
                showBadge={false}
                actualDetail={`里程碑完成 ${as.mDone}/${as.mTotal}（${as.avgPct}%）`}
                planDetail={`时间锚点 ${as.timePct}%${remainTxt ? ' · ' + remainTxt : ''}`}
              />
            </div>
          );
        })()}

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
              const isDoing = m.st === 'doing';
              /* 需求 3：状态徽章 — 未开始（灰）/ 进行中（橙·带进度）/ 已完成（绿）*/
              const STATUS_META = isDone
                ? { label: '已完成', color: '#34C759' }
                : isDoing
                  ? { label: '进行中', color: AB }
                  : { label: '未开始', color: '#8E8E93' };
              return (
                <div
                  key={m.id || i}
                  className="flex items-center gap-2 px-1 py-2 rounded-lg hover:bg-ink-50/50 transition-colors group"
                >
                  {/* 复选框：未勾白底橙边，已勾橙底白勾 —— 与主文字 items-center 居中对齐 */}
                  <button
                    onClick={(e) => { e.stopPropagation(); onMsToggleDone?.({ abilityIdx: as.idx, msIdx: i }); }}
                    className="w-4 h-4 rounded-full grid place-items-center flex-shrink-0 transition-all"
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
                    <div className="flex items-center gap-1.5">
                      <div className={`text-[13px] font-semibold leading-snug line-clamp-2 ${isDone ? 'text-ink-400 line-through' : 'text-[#48484A]'}`}>
                        {m.lb}
                      </div>
                      {/* 需求 3：状态徽章 */}
                      <span
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 select-none"
                        style={{ background: `${STATUS_META.color}15`, color: STATUS_META.color }}
                      >
                        {STATUS_META.label}{isDoing && m.pct != null ? ` ${Math.round(Number(m.pct))}%` : ''}
                      </span>
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
              style={{ background: 'rgba(var(--m-ability-rgb),0.15)', color: AB_DARK }}>
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
function WorkView({ workGoals, onKrAdd, onKrEdit, onKrRemove, onGoalAdd, onGoalEdit, onGoalRemove, onGoalMarkDone, onGoalShelf, onGoalUnarchive, onRiskTagClick, microActions }) {
  const dynWk = workGoals || WORK;
  const year = new Date().getFullYear();
  const RED = 'var(--m-work)';
  const RED_DATA = 'var(--m-work)';
  const RED_RISK = 'var(--m-work)';

  /* —— 对每个目标进行字段兜底 + 派生统计 —— */
  const goalStats = useMemo(() => {
    return dynWk.map((o, idx) => {
      const mode = inferMode(o, 'work');
      const krs = o.krs || [];
      const krPcts = krs.map(k => pct(k.v, k.tgt));
      // 🎯 event 范式：avgPct 直接看 status，不需要 KR 均值
      const avgPct = mode === 'event'
        ? (o?.status === 'done' ? 100 : 0)
        : (krs.length ? Math.round(krPcts.reduce((s,p)=>s+p,0) / krs.length) : 0);
      const { days, timePct } = calcTimeAnchor(o.deadline, o.createdAt);
      const rm = calcRisk(avgPct, timePct, mode === 'event' ? o?.status === 'done' : (krs.length && krs.every(k => k.st === 'done')));

      const risks = { risk: 0, warn: 0, ahead: 0, normal: 0, done: 0 };
      if (mode !== 'event') {
        krs.forEach((k, i) => {
          const kPct = krPcts[i];
          const microTA = k.dueBy ? calcTimeAnchor(k.dueBy, o.createdAt || k.dueBy) : { timePct };
          const krm = calcRisk(kPct, microTA.timePct, k.st === 'done');
          risks[krm.q] = (risks[krm.q] || 0) + 1;
        });
      }

      return {
        mode, idx,
        avgPct, rm, days, timePct, risks,
        dl: daysLabel(days),
        label: o.label || (o.core ? '主业' : '副业'),
        color: RED, // 工作页统一红色系：主业 & 副业卡片都用 RED（档A结构色·原副业#FF9500已统一）
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

  /* —— 状态分区：进行中 / 已完成 / 搁置归档 —— */
  const todayISO = new Date().toISOString().slice(0, 10);
  const [workTab, setWorkTab] = useState('active'); // 'active' | 'done' | 'shelf' — 书架风 Tab 3 项（标题右）
  const [detailGoal, setDetailGoal] = useState(null); // { o, gs, goalIdx } | null
  const [openDropIdx, setOpenDropIdx] = useState(null); // key → goal.id|title+idx+'@'+location (location: 'active'|'modal')
  // Header 标题：右击可编辑（持久化到 D1 userSettings）
  // 首屏闪默认标题的根因：自定义值靠异步 fetch D1 读回。修复：localStorage 写穿缓存，
  // 初始渲染同步读缓存 → 打开即显示自定义标题；D1 读回后再校准（处理换设备/清缓存场景）
  const WORK_TITLE_CACHE = 'annual_work_title_cache';
  const [localTitle, setLocalTitle] = useState(() => {
    try { return localStorage.getItem(WORK_TITLE_CACHE) || `${year}年 · 工作目标`; } catch { return `${year}年 · 工作目标`; }
  });
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/userSettings/get?k=annual_work_title', {
          headers: { 'X-Unlock-Token': localStorage.getItem('pw_unlock_token') || '' },
        });
        const j = await r.json().catch(() => ({}));
        const v = j?.data?.annual_work_title;
        if (v) {
          setLocalTitle(String(v));
          try { localStorage.setItem(WORK_TITLE_CACHE, String(v)); } catch { /* ignore */ }
        }
      } catch { /* 读取失败用缓存/默认值 */ }
    })();
  }, []);
  const [titleEditing, setTitleEditing] = useState(false);
  const [collapsedIds, setCollapsedIds] = useState(() => new Set()); // 进行中tab双击折叠: Set<goalKey = id | title|idx>
  const makeGoalKey = (o, goalIdx) => o.id || `${o.title}|${goalIdx}`;
  const toggleCollapsed = (o, goalIdx) => setCollapsedIds(prev => {
    const k = makeGoalKey(o, goalIdx);
    const next = new Set(prev);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });
  const isCollapsed = (o, goalIdx) => collapsedIds.has(makeGoalKey(o, goalIdx));

  const _isOverdueNotDone = (o) => {
    if (!o?.deadline) return false;
    if (o.deadline >= todayISO) return false;
    const krs = o.krs || [];
    if (krs.length === 0) return true;
    return !krs.every(k => k.st === 'done');
  };

  const _statusOf = (o) => {
    if (o?.status === 'done') return 'done';
    // 🎯 终极安全网：小红书涨粉目标强制进行中（仅拦截 archived/shelf/deadline，不影响正常 done 状态）
    if (o?.archived === true || o?.status === 'shelf') {
      if (o && String(o.title || '').includes('小红书')) return 'active';
      return 'shelf';
    }
    if (_isOverdueNotDone(o)) return 'shelf';
    return 'active';
  };

  const partitionedGoals = useMemo(() => {
    const active = [];
    const done = [];
    const shelf = [];
    dynWk.forEach((o, i) => {
      const gs = goalStats[i];
      const st = _statusOf(o);
      const entry = { o, gs, goalIdx: i };
      if (st === 'done') done.push(entry);
      else if (st === 'shelf') shelf.push(entry);
      else active.push(entry);
    });
    return { active, done, shelf };
  }, [dynWk, goalStats, todayISO]);

  // Step 2: 已完成tab Master-Detail 选中状态（必须在 partitionedGoals 之后声明，否则 TDZ 报错）
  const [selectedDoneKey, setSelectedDoneKey] = useState(null);
  useEffect(() => {
    if (workTab !== 'done') return;
    const doneList = partitionedGoals.done;
    if (doneList.length === 0) { setSelectedDoneKey(null); return; }
    const stillExists = selectedDoneKey && doneList.find(e => makeGoalKey(e.o, e.goalIdx) === selectedDoneKey);
    if (!stillExists) setSelectedDoneKey(makeGoalKey(doneList[0].o, doneList[0].goalIdx));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workTab, partitionedGoals.done]);
  const selectedDoneEntry = useMemo(() =>
    partitionedGoals.done.find(e => makeGoalKey(e.o, e.goalIdx) === selectedDoneKey) || null,
    [partitionedGoals.done, selectedDoneKey]);

  /* —— 卡片右上角下拉菜单 ⋮ —— */
  const renderCardMenu = ({ entry, location }) => {
    const { o, goalIdx } = entry;
    const st = _statusOf(o);
    const isArchived = st === 'done' || st === 'shelf';
    const goalKey = (o.id || o.title + goalIdx) + '@' + location;
    const isOpen = openDropIdx === goalKey;
    const toggleDrop = (e) => {
      e.stopPropagation();
      setOpenDropIdx(prev => prev === goalKey ? null : goalKey);
    };
    const closeDrop = () => setOpenDropIdx(null);
    return (
      <div className="relative" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
        <button
          onClick={toggleDrop}
          className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-[#FFEBE9] active:bg-[#FFD6D1] transition-colors"
          style={{ color: RED }}
          title="更多操作"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/>
          </svg>
        </button>
        {isOpen && (
          <div className="wk-card-menu absolute right-0 top-8 z-50 bg-white rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-ink-100 py-1.5 w-36 overflow-hidden animate-[fadeIn_0.12s_ease-out]"
          >
            {/* ① 进行中（已完成/已归档时显示，点了就 unarchive） */}
            {st !== 'active' && (
              <button onClick={() => { closeDrop(); onGoalUnarchive && onGoalUnarchive(o.id || o.title); }}
                className="w-full text-left px-3.5 py-2 text-[13px] text-[#1d1d1f] hover:bg-[#f2f2f7] hover:rounded-md transition-colors">
                进行中
              </button>
            )}
            {/* ② 已完成（非 done 时显示） */}
            {st !== 'done' && (
              <button onClick={() => { closeDrop(); onGoalMarkDone && onGoalMarkDone(o.id || o.title); }}
                className="w-full text-left px-3.5 py-2 text-[13px] text-[#1d1d1f] hover:bg-[#e8f8ec] hover:rounded-md transition-colors">
                已完成
              </button>
            )}
            {/* ③ 已归档（非 shelf 时显示） */}
            {st !== 'shelf' && (
              <button onClick={() => { closeDrop(); onGoalShelf && onGoalShelf(o.id || o.title); }}
                className="w-full text-left px-3.5 py-2 text-[13px] text-[#1d1d1f] hover:bg-[#f2f2f7] hover:rounded-md transition-colors">
                已归档
              </button>
            )}
            {/* ④ 删除 — 分割线 + 红色 */}
            <div className="h-px bg-[#e5e5ea] my-1"/>
            <button onClick={() => { closeDrop(); onGoalRemove(goalIdx); }}
              className="w-full text-left px-3.5 py-2 text-[13px] text-[#FF3B30] hover:bg-[#fff0f0] hover:rounded-md transition-colors">
              删除
            </button>
          </div>
        )}
      </div>
    );
  };

  /* —— 点击外部关闭下拉（用 target.closest('.wk-card-menu') 判断是否在菜单内，避免 React 合成事件 stopPropagation 不影响原生 document 监听的冒泡 bug）—— */
  useEffect(() => {
    if (!openDropIdx) return;
    const handler = (e) => {
      // 如果点击的是下拉菜单本身或其内部元素 → 不关（让菜单项 onClick 正常触发）
      if (e.target && typeof e.target.closest === 'function' && e.target.closest('.wk-card-menu')) return;
      setOpenDropIdx(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openDropIdx]);

  /* ============================================================
   * Objective 统领层组件（2 行结构 · 适配横向窄卡）
   * R1：色条 + [分类标签 + 范式徽章(显眼)] + O徽标 + O标题（右侧：📅截止）
   * R2：双条进度（时间/实际）+ 里程碑/KR计数 + 风险徽标
   * ============================================================ */
  const renderObjective = (o, gs, goalIdx) => {
    const color = gs.color;
    const krTotal = (o.krs || []).length;
    const krDone = (o.krs || []).filter(k => k.st === 'done').length;
    const modeMeta = {
      funnel:    { lb: '漏斗',       icon: (<path d="M4 4h16l-6 8v8l-4 0v-8z"/>) },
      dashboard: { lb: '仪表盘',     icon: (<><circle cx="12" cy="13" r="6"/><path d="M12 7v6l4 2M9 3h6"/></>) },
      milestone: { lb: '里程碑门',   icon: (<><path d="M4 20V8l8-4 8 4v12"/><path d="M4 12h16M12 4v16"/></>) },
      balance:   { lb: '平衡雷达',   icon: (<><polygon points="12,3 20,9 17,19 7,19 4,9"/><circle cx="12" cy="12" r="2"/></>) },
    };
    const m = modeMeta[gs.mode] || modeMeta.funnel;
    const topRisk = (gs.risks.risk || 0) > 0 ? { n: gs.risks.risk, c: '#FF3B30', l: '落后' }
      : (gs.risks.warn || 0) > 0 ? { n: gs.risks.warn, c: '#FF9500', l: '预警' }
      : (gs.risks.done === krTotal && krTotal > 0) ? { n: null, c: '#34C759', l: '已达成' }
      : null;
    // R3 已收敛：m/topRisk 不再参与卡片渲染（范式子渲染器自有逻辑），留变量防引用错误
    // eslint-disable-next-line no-unused-vars
    const _unused = { m, topRisk };
    // 节奏胶囊：落后/超前 X% · X月Y天（与知力页 paceBadge 同构；无 deadline 或已过期时退化为纯语义）
    const paceDiff = gs.timePct !== null && gs.timePct !== undefined
      ? Math.round(Math.abs(gs.avgPct - gs.timePct)) : null;
    const paceAhead = gs.timePct !== null && gs.avgPct >= gs.timePct;
    const paceRemainTxt = (gs.days !== null && gs.days !== undefined && gs.days > 0)
      ? (() => { const mo = Math.floor(gs.days / 30); const dy = gs.days % 30;
          return mo === 0 ? `${dy} 天` : (dy === 0 ? `${mo} 月` : `${mo} 月 ${dy} 天`); })()
      : null;
    let pace = null;
    if (paceDiff !== null) {
      if (paceDiff === 0) pace = { t: '节奏匹配', bg: 'rgba(var(--m-work-rgb),0.10)', fg: color };
      else if (paceAhead) pace = { t: `超前 ${paceDiff}%${paceRemainTxt ? ' · ' + paceRemainTxt : ''}`, bg: 'rgba(52,199,89,0.10)', fg: '#34C759' };
      else pace = { t: `落后 ${paceDiff}%${paceRemainTxt ? ' · ' + paceRemainTxt : ''}`, bg: 'rgba(var(--m-work-rgb),0.10)', fg: RED_RISK };
    }
    /* 工作页 renderObjective：容器级 px-1 pt-2 已移除，顶部/左右二次压缩消除，与能力页卡壳 p-3.5 像素级一致：
       卡顶→标题中心从 35px→27px；左右留白从 18px→14px；只留 pb-2.5 border-b 承担与下方子渲染区的分段语义 */
    return (
      <div className="flex flex-col gap-2 pb-2.5 border-b border-ink-100">
        {/* R1-top：色条 + 标题 + 胶囊 + 加号 —— 严格锁定在这一行内 items-center，
             与"加副标题之前"的原版视觉关系完全一致，右侧胶囊/加号自然与标题文字中线对齐 */}
        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="w-[5px] h-[18px] rounded-full flex-shrink-0" style={{ background: color }}></span>
            <div className="text-[16px] font-bold text-ink-900 leading-tight truncate cursor-pointer hover:text-ink-700 transition-colors min-w-0 select-none"
              onClick={() => onGoalEdit?.(goalIdx)} title="编辑目标（双击卡片空白处折叠）">{o.title}</div>
          </div>
          {/* 【原右组隐藏】胶囊/加号/⋮ 已由 renderFullCard 外层统一 absolute flex 容器接管（同一坐标系 gap-2 等距 + 圆形统一形状）
               此处保留结构 0 修改，仅加 hidden 避免重复渲染 */}
          <div className="flex items-center gap-2.5 flex-shrink-0 hidden">
            {/* 恢复 1/5 KR 计数胶囊（原设计） */}
            <span
              className="inline-flex items-center px-3 h-[26px] rounded-full text-[11px] font-semibold tabular-nums leading-none"
              style={{ background: 'rgba(var(--m-work-rgb),0.08)', color }}>
              <span className="font-extrabold">{krDone}</span>
              <span className="mx-0.5 opacity-50">/</span>
              <span className="opacity-70">{krTotal}</span>
            </span>
            <button
              onClick={() => onKrAdd?.(goalIdx)}
              className="w-[26px] h-[26px] rounded-lg grid place-items-center transition hover:brightness-105 active:scale-95 flex-shrink-0"
              style={{ background: 'rgba(var(--m-work-rgb),0.10)' }}
              title="添加 KR">
              <svg className="w-3.5 h-3.5" fill="none" stroke={color} strokeWidth="2.5" viewBox="0 0 24 24" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
            </button>
          </div>
        </div>
        {/* R1-bot：起止日期副行 · 追加剩余时长（跨月→剩余X个月X天）· iOS/SF 无衬线字体 */}
        {(() => {
          const dlStr = o.deadline ? String(o.deadline).slice(0, 10) : '';
          if (!dlStr) return null;
          const dl = parseDate(dlStr);
          const csStr = o.createdAt ? String(o.createdAt).slice(0, 10) : '';
          const cs = parseDate(csStr);
          const startStr = cs ? csStr : `${dl ? dl.getFullYear() : new Date().getFullYear()}-01-01`;
          const today = new Date(); today.setHours(0,0,0,0);
          const remain = dl ? formatRemainDuration(dl, today) : null;
          return (
            <div
              className="text-[11px] text-ink-400 tabular-nums leading-none pl-[13px] tracking-tight"
              style={{ fontFamily: IOS_SANS }}>
              <span>{startStr} → {dlStr}</span>
              {remain && (
                <>
                  <span className="mx-1 text-ink-200">·</span>
                  <span className={remain.cls}>{remain.text}</span>
                </>
              )}
            </div>
          );
        })()}
        {/* R2 总体完成度：双标记进度条（实际 avgPct vs 计划 timePct），全宽
             容器已无 px-1，撤销原来成对的 -mx-1 避免条越出 shell 14px 内边距 */}
        {gs.timePct === null || gs.timePct === undefined ? (
          <div className="flex items-center gap-2.5">
            <span className="text-[11px] font-semibold text-ink-500 flex-shrink-0">总体完成度</span>
            <div className="flex-1 h-[5px] rounded-full bg-ink-100 overflow-hidden min-w-[40px]">
              <div className="h-full rounded-full transition-all" style={{ width: `${gs.avgPct}%`, background: RED_DATA }}></div>
            </div>
            <span className="text-[13px] font-extrabold tabular-nums text-ink-700 w-[48px] text-right flex-shrink-0">{gs.avgPct}%</span>
          </div>
        ) : (
          <div style={{ }}>
            <DualMarkerBar
              actual={gs.avgPct}
              plan={gs.timePct}
              color={RED_DATA}
              showBadge={false}
              actualDetail={`KR 平均完成 ${gs.avgPct}%${krTotal > 0 ? `（${krDone}/${krTotal} 已完成）` : ''}`}
              planDetail={gs.days !== null && gs.days !== undefined
                ? `时间锚点 ${gs.timePct}% · 剩余 ${gs.days} 天`
                : `时间锚点 ${gs.timePct}%`}
            />
          </div>
        )}
        {/* R3 元信息行已收敛：分类/范式/日期/风险信息分别并入节奏胶囊 tooltip 与双标记进度条 */}
      </div>
    );
  };

  /* ============================================================
   * 子渲染器 #1：Funnel 漏斗（完全对齐知力页一体化漏斗：3 列行 + 连接线 + 关键瓶颈提示）
   * ============================================================ */
  const renderFunnelRows = (o, gs, goalIdx) => {
    const krs = o.krs || [];
    const COLOR = RED_DATA;
    // 空状态引导（对齐能力页 KR 空态）
    if (krs.length === 0) {
      return (
        <div className="py-4 text-center rounded-xl mt-2" style={{ background: 'rgba(15,23,42,0.03)' }}>
          <div className="text-[12px] font-semibold text-ink-400">还没有 KR</div>
          <div className="text-[11px] text-ink-400 mt-1 opacity-80">点击右上角 + 添加</div>
        </div>
      );
    }
    return (
      <div className="flex flex-col pt-1 pr-2.5 flex-1">
        {krs.map((kr, i) => {
          const p = pct(kr.v, kr.tgt);
          const isDone = kr.st === 'done' || p >= 100;
          const isBehind = p < gs.timePct && !isDone;
          const pctWidth = Math.max(6, Math.min(100, p));
          // 0% 时填充条仅 5% ≈ 5px 宽，高度 22px → 视觉上变成"小红圆点"而非进度条
          // 给一个像素级 minWidth 保证始终是"胶囊"（最小高度/宽度比例 ≥ 1:1）
          const minPxWidth = p === 0 ? 22 : Math.max(16, Math.round(22 * 0.7));
          const padNum = String(i + 1).padStart(2, '0');
          const nextKr = krs[i + 1];
          // 转化率：与知力页同算法（前一层实际量 > 0 才计算）
          const conv = nextKr && kr.v > 0 ? Math.round((nextKr.v / kr.v) * 100) : null;
          const lowConv = conv !== null && conv < 50;

          return (
            <div key={i}>
              {/* KR 行：3 列 — 序号+标题+目标 | 漏斗进度条 | 删除(悬停) + 完成率% */}
              <div className="group flex items-center gap-2.5 py-2 rounded-lg hover:bg-surface-soft transition-colors">
                {/* 左区：w-[128px] = 序号22 + gap + 标题+目标，连接线箭头在此区 justify-center 对准标题中心 */}
                <div className="w-[128px] flex items-center gap-2.5 flex-shrink-0 -mt-[1px]">
                  <span className="text-[11px] font-bold tabular-nums w-[22px] text-right leading-none flex-shrink-0"
                    style={{ color: RED }}>{padNum}</span>
                  <div className="flex-1 min-w-0 truncate flex items-baseline gap-1">
                    <div onClick={() => onKrEdit?.(goalIdx, i, kr)} title="点击编辑 KR" className="cursor-pointer group flex items-baseline gap-1.5 min-w-0">
                      <span className="text-[13px] font-semibold truncate leading-none group-hover:text-ink-900 text-[#48484A]">{kr.t}</span>
                      <span className="text-[11px] font-extrabold text-ink-900 tabular-nums leading-none flex-shrink-0">
                        {kr.tgt}{kr.u}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 中部：漏斗进度条（flex-1） — 计数填充条 → 胶囊（语义：数值色块，与知力/能力进度条统一） */}
                <div className="flex-1 flex items-center min-w-0">
                  <div className="flex-1 h-[22px] rounded-full overflow-hidden bg-ink-50 relative" style={{ minWidth: '40px' }}>
                    <div className="relative w-full h-full flex items-center">
                      <div
                        className="h-full rounded-full transition-all duration-500 flex items-center justify-start pl-2"
                        style={{
                          width: `${pctWidth}%`,
                          minWidth: `${minPxWidth}px`,
                          background: isDone ? '#34C759' : COLOR,
                          boxShadow: isDone ? '0 1px 3px rgba(52,199,89,0.25)' : '0 1px 3px rgba(var(--m-work-rgb),0.15)',
                        }}>
                        {p >= 15 && (
                          <span className="text-[10px] font-bold text-white/90 tabular-nums">
                            {kr.v}{kr.u}
                          </span>
                        )}
                      </div>
                      {p < 15 && (
                        <span className="text-[10px] font-bold tabular-nums ml-1.5 flex-shrink-0" style={{ color: '#8a9491' }}>
                          {kr.v}{kr.u}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* 删除按钮：行悬停时淡入 */}
                <button
                  onClick={(e) => { e.stopPropagation(); onKrRemove?.(goalIdx, i, kr); }}
                  title="删除此 KR"
                  className="w-5 h-5 grid place-items-center rounded transition flex-shrink-0 opacity-0 group-hover:opacity-100 hover:bg-accent-red/10 text-ink-300 hover:text-accent-red active:scale-95"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>

                {/* 右侧：完成率 */}
                <span className="text-[14px] font-extrabold tabular-nums leading-none w-[48px] text-right flex-shrink-0"
                  style={{ color: isDone ? '#111827' : (isBehind ? RED_RISK : COLOR) }}>
                  {p}<span className="text-[11px] font-bold">%</span>
                </span>
              </div>

              {/* 连接线：3 列同构 — 箭头对准标题中心，转化率在漏斗条区居中（对齐知力页） */}
              {nextKr && (() => (
                <div className="flex items-center gap-2.5 py-1.5 text-[11px]">
                  <div className="w-[128px] flex-shrink-0 flex items-center justify-center">
                    <svg className="w-3 h-3" style={{ color: '#8a9491' }} fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 5v14M5 12l7 7 7-7" />
                    </svg>
                  </div>
                  <div className="flex-1 flex items-center justify-center min-w-0">
                    <span
                      className="font-bold tabular-nums"
                      style={{ color: lowConv ? RED_RISK : '#8a9491' }}>
                      {conv ?? 0}%
                    </span>
                  </div>
                  <div className="w-[48px] flex-shrink-0 invisible" aria-hidden="true"></div>
                </div>
              ))()}
            </div>
          );
        })}
      </div>
    );
  };

  /* ===== 关键瓶颈提示 helper（独立于渲染器，用于放在卡片下方） ===== */
  // 计算相邻 KR 间转化率，找出最低的一环；适用于 funnel / dashboard / milestone 任何有 ≥2 个 KR 的模式
  const renderWorkBottleneck = (o, COLOR) => {
    const krs = o.krs || [];
    const conversions = [];
    for (let i = 0; i < krs.length - 1; i++) {
      const curr = krs[i], next = krs[i + 1];
      if (!curr || !next || !curr.v || curr.v <= 0) continue;
      const rate = Math.round((next.v / curr.v) * 100);
      conversions.push({ from: curr.t, to: next.t, rate });
    }
    if (conversions.length === 0) return null;
    const minConv = conversions.reduce((a, b) => a.rate < b.rate ? a : b);
    const suggestion = `优先优化「${minConv.to}」，提升这一环的产出质量`;
    return (
      <div className="flex items-start gap-2 mx-1 px-3 pt-2.5 pb-2 rounded-lg"
        style={{ background: 'rgba(255,59,48,0.06)', border: '1px solid rgba(255,59,48,0.18)' }}>
        {/* 三角警告标：始终与「关键瓶颈」四个字的 11px/15px 行高几何中心对齐
            items-start 前提下：
            行高 15.4px → 中心 = 7.7px；SVG 14px → 自身中心 7px；偏移差 = 0.7px，
            用 mt-[0.5px] 再微调 0.5px 到 ~7.5px 中心，与「关/键/瓶/颈」四字笔画中心像素对齐 */}
        <svg className="w-[14px] h-[14px] flex-shrink-0 mt-[0.5px]" fill={RED} viewBox="0 0 24 24">
          <path d="M12 2.5c-.6 0-1.1.3-1.4.8L1.5 19.3c-.3.5-.1 1.1.3 1.4.2.2.5.3.8.3h18.8c.3 0 .6-.1.8-.3.5-.3.6-.9.3-1.4L13.4 3.3c-.3-.5-.8-.8-1.4-.8z"/><path d="M12 9v4.5M12 17.5v.01" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
        <div className="min-w-0 flex-1 text-[11px] leading-[1.4]">
          <span className="font-bold text-ink-700">关键瓶颈：</span>
          <span className="text-ink-600">
            从「<span style={{ color: RED_DATA, fontWeight: 700 }}>{minConv.from}</span>」
            到「<span style={{ color: RED_DATA, fontWeight: 700 }}>{minConv.to}</span>」
            转化率
            <span style={{ color: RED_RISK, fontWeight: 800 }}> {minConv.rate}% </span>
            — {suggestion}
          </span>
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
    }).map(x => ({
      ...x,
      rm: { ...x.rm, color: x.rm.q === 'risk' ? RED_RISK : x.rm.color },
    }));
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
                    <span className="text-[11.5px] font-semibold text-[#48484A] truncate leading-tight">{kr.t}</span>
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
                  <span className="text-[18px] font-extrabold tabular-nums text-ink-900 leading-none">{kr.v}{kr.u}</span>
                  <span className="text-[11px] font-medium text-ink-400">/</span>
                  <span className="text-[11px] font-medium text-ink-500 tabular-nums">{kr.tgt}{kr.u}</span>
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
                    <span className="text-[9.5px] font-semibold" style={{ color: krPct < microTA.timePct - 5 ? RED_RISK : '#8a9491' }}>
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
                <span className="text-accent-green tabular-nums no-underline font-bold">{kr.v}/{kr.tgt}{kr.u}</span>
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
          const rmColor = rm.q === 'risk' ? RED_RISK : rm.color;
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
                    background: isDone ? 'rgba(52,199,89,0.13)' : 'rgba(var(--m-work-rgb),0.08)',
                    color: isDone ? '#34C759' : rmColor,
                    border: `1.5px solid ${isDone ? '#34C759' : rmColor}`,
                  }}
                >
                  {isDone ? (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 13l4 4L19 7"/></svg>
                  ) : String(i + 1)}
                </div>
              </div>
              {/* 里程碑标题（O 的阶段子项） */}
              <div className="flex-1 min-w-0 pl-1">
                <div className={`text-[11.5px] font-semibold truncate leading-tight ${isDone ? 'text-ink-400 line-through' : 'text-[#48484A]'}`}>
                  {kr.t}
                </div>
                {!isDone && kr.v !== undefined && kr.tgt && (
                  <div className="text-[9.5px] font-medium text-ink-400 mt-0.5 truncate">
                    当前进展 {kr.v}/{kr.tgt}{kr.u} · {rm.label}
                  </div>
                )}
              </div>
              {/* 阶段进度条（简单，因为门控是布尔通过/不通过，进度为中间值） */}
              <div className="w-[60px] grid place-items-center">
                <div className="w-[52px] h-1.5 rounded-full bg-ink-100 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${krPct}%`, background: isDone ? '#34C759' : rmColor }}></div>
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

  /* —— 🎯 单次事件型范式（event mode）：达成点直接结束 —— */
  /* event 模式无 KR 子区，renderObjective 头部 DualMarkerBar 已覆盖进度表达 */
  const renderEventRow = (o, gs, goalIdx) => null;

  /* ============================================================
   * 统一分派器：根据 mode 选渲染器（balance 雷达暂未实现，fallback dashboard）
   * ============================================================ */
  const renderByMode = (o, gs, goalIdx) => {
    switch (gs.mode) {
      case 'event':     return renderEventRow(o, gs, goalIdx);
      case 'funnel':    return renderFunnelRows(o, gs, goalIdx);
      case 'milestone': return renderMilestoneRows(o, gs, goalIdx);
      case 'dashboard': // KPI 仪表盘（已改名）
      case 'balance':   // 平衡雷达暂不做，先退化成仪表盘网格
      default:          return renderDashboardRows(o, gs, goalIdx);
    }
  };

  /* —— 缩略预览卡片（侧栏用） —— */
  const renderThumbCard = (entry) => {
    const { o, gs } = entry;
    const st = _statusOf(o);
    const color = gs.color;
    const krs = o.krs || [];
    const krDone = krs.filter(k => k.st === 'done').length;
    const krTotal = krs.length;
    const avgPct = gs.avgPct;
    const timePct = Math.max(0, Math.min(100, gs.timePct || 0));
    const cleanLabel = (s) => String(s || '').replace(new RegExp(String.raw`^\s*[\u{1F300}-\u{1FAFF}✅📌🎯💡🚀🔥⭐💰🏆📖🧠❤️⚡️🔑🎨📊⏰📝🔍🌱✨]\s*`, 'gu'), '');
    const statusPill = st === 'done'
      ? { txt: '已完成', bg: 'rgba(52,199,89,0.10)', fg: '#34C759' }
      : { txt: '搁置', bg: 'rgba(142,142,147,0.12)', fg: '#8e8e93' };
    return (
      <div
        onClick={() => setDetailGoal(entry)}
        className="group cursor-pointer bg-white rounded-xl border border-ink-100 shadow-[0_1px_2px_rgba(17,24,39,0.04)] hover:shadow-[0_3px_10px_rgba(0,0,0,0.07)] hover:-translate-y-[1px] transition-all p-3 overflow-hidden"
      >
        {/* R1: 色条 + 标题 + 胶囊 */}
        <div className="flex items-start gap-2">
          <div className="shrink-0 w-1 h-8 rounded-full mt-0.5" style={{ background: color }}/>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[13px] font-semibold text-[#1d1d1f] truncate leading-tight"
                title={o.title}>{cleanLabel(o.title)}</span>
              <span className="shrink-0 text-[10.5px] font-medium rounded-full px-1.5 py-[1px]"
                style={{ background: statusPill.bg, color: statusPill.fg }}>{statusPill.txt}</span>
            </div>
            <div className="mt-1 flex items-center gap-1.5 flex-wrap text-[10.5px] text-[#8e8e93] leading-none">
              <span className="font-medium text-[#1d1d1f] tabular-nums">{avgPct}%</span>
              <span className="opacity-40">·</span>
              <span className="tabular-nums">时间 {timePct}%</span>
              <span className="opacity-40">·</span>
              <span className="tabular-nums">KR {krDone}/{krTotal}</span>
            </div>
          </div>
        </div>
        {/* R2: 双进度条（6px，原卡片 8px） */}
        <div className="mt-2 flex flex-col gap-1">
          {/* 时间进度 — 条纹渐变（与原卡一致） */}
          <div className="relative w-full h-[6px] rounded-full overflow-hidden bg-[#f2f2f7]">
            <div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{
                width: `${timePct}%`,
                background: `repeating-linear-gradient(135deg, rgba(var(--m-work-rgb),0.20), rgba(var(--m-work-rgb),0.20) 4px, rgba(var(--m-work-rgb),0.33) 4px, rgba(var(--m-work-rgb),0.33) 8px)`,
              }}
            />
          </div>
          {/* 实际完成进度 — 纯色 */}
          <div className="relative w-full h-[6px] rounded-full overflow-hidden bg-[#f2f2f7]">
            <div
              className="absolute inset-y-0 left-0 rounded-full transition-[width]"
              style={{ width: `${avgPct}%`, background: color }}
            />
          </div>
        </div>
      </div>
    );
  };

  /* —— 统一卡壳：进行中（主业/副业两栏）& 非进行中（网格）都用同一 wrapper，⋮红+紧贴加号右边，原 renderObjective 0修改 —— */
  const renderFullCard = (entry, location) => {
    const { o, gs, goalIdx } = entry;
    const collapsed = isCollapsed(o, goalIdx);
    const bottleneck = renderWorkBottleneck(o, gs.color);
    // 右上角三控件（胶囊+加号+⋮）统一 absolute flex 容器，
    // pr-5 = 20px 正常留白，三者 gap-2(8px) 整体靠右，避免两套坐标系失控
    return (
      <div
        className="bg-white rounded-2xl border border-ink-100 shadow-[0_1px_2px_rgba(17,24,39,0.03)] hover:shadow-[0_2px_6px_rgba(17,24,39,0.05)] transition-shadow pl-5 pr-5 pt-5 pb-5 flex flex-col overflow-visible group relative select-none"
        style={{}}
        onDoubleClick={() => toggleCollapsed(o, goalIdx)}
      >
        {/* 折叠态徽章（右上角，控件容器下方避免遮挡） */}
        {collapsed && (
          <span
            className="absolute right-4 bottom-3 text-[10px] font-extrabold px-2 py-[3px] rounded-full select-none pointer-events-none z-10"
            style={{ color: 'rgba(138,148,145,0.85)' }}
            title="双击卡片展开">
            展开 ▾
          </span>
        )}
        {/* 统一容器：KR 计数胶囊（event 模式隐藏） + 添加 KR 加号 + ⋮ 更多菜单
            top-[17px] 对齐 renderObjective 标题基线（标题 top=20 中线=29，按钮中心=17+14=31） */}
        <div className="absolute right-3 top-[17px] z-20 flex items-center gap-2">
          {/* KR 计数胶囊：krTotal=0 时隐藏（单次事件型无需 KR 拆解） */}
          {gs.krTotal > 0 && (
            <span
              className="inline-flex items-center px-3 h-[24px] rounded-full text-[11px] font-semibold tabular-nums leading-none flex-shrink-0"
              style={{ background: 'rgba(var(--m-work-rgb),0.08)', color: gs.color }}>
              <span className="font-extrabold">{gs.krDone}</span>
              <span className="mx-0.5 opacity-50">/</span>
              <span className="opacity-70">{gs.krTotal}</span>
            </span>
          )}
          {/* ➕ 添加 KR：圆角方形 28×28 */}
          <button
            onClick={() => onKrAdd?.(goalIdx)}
            className="w-7 h-7 rounded-lg grid place-items-center transition hover:brightness-110 active:scale-95 flex-shrink-0"
            style={{ backgroundColor: 'rgba(var(--m-work-rgb),0.07)' }}
            title="添加 KR">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={gs.color} strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
          </button>
          {/* ⋮ 更多菜单 */}
          {renderCardMenu({ entry, location })}
        </div>
        {renderObjective(o, gs, goalIdx)}
        {!collapsed && (
          <div className="flex-1 min-h-0 pt-3 overflow-y-auto">
            {renderByMode(o, gs, goalIdx)}
          </div>
        )}
        {!collapsed && bottleneck && <div className="mt-3">{bottleneck}</div>}
      </div>
    );
  };

  const activeMain = partitionedGoals.active.filter(e => !!e.o.core);
  const activeSide = partitionedGoals.active.filter(e => !e.o.core);
  const totalMain = dynWk.filter(o => !!o.core).length;
  const totalSide = dynWk.filter(o => o.core === false).length;

  return (
    <div className="flex flex-col gap-4 items-start">
      {/* ========== Header · 书架风（色条 + 标题·共N项 左边）/（3 Tab·进行中·已完成·已归档 标题右边）/（右操作按钮 蓝色）========== */}
      <div className="w-full glass-card rounded-2xl p-4">
        <div className="flex items-center gap-3 flex-wrap">
          {/* 左：色条 + 标题(右击编辑) + 主业·N | 副业·N
              gap-3(12px) + p-4(16px) + 色条5px = 33px，与下方卡片标题 pl-5(20)+色条(5)+gap-2(8)=33px 左端精确对齐 */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <span className="w-[5px] h-[18px] rounded-full flex-shrink-0" style={{ background: RED }}></span>
            {titleEditing ? (
              <input
                autoFocus
                defaultValue={localTitle}
                onBlur={(e) => {
                  const v = e.target.value.trim() || `${year}年 · 工作目标`;
                  setLocalTitle(v);
                  setTitleEditing(false);
                  // 写穿 localStorage 缓存：下次打开首屏直接显示自定义标题（不闪默认值）
                  try { localStorage.setItem(WORK_TITLE_CACHE, v); } catch { /* ignore */ }
                  // 持久化到 D1，刷新/重开后保持（须带 X-Unlock-Token，否则 401 静默失败）
                  fetch('/api/userSettings/set', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'X-Unlock-Token': localStorage.getItem('pw_unlock_token') || '',
                    },
                    body: JSON.stringify({ k: 'annual_work_title', v }),
                  }).catch(() => {});
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.target.blur(); } else if (e.key === 'Escape') { setTitleEditing(false); } }}
                onClick={(e) => e.stopPropagation()}
                className="text-[15.5px] font-bold text-ink-900 leading-none bg-transparent border border-[#FF4035] rounded px-1 py-0 outline-none min-w-[120px]"
              />
            ) : (
              <span
                className="text-[15.5px] font-bold text-ink-900 leading-none whitespace-nowrap cursor-default"
                onContextMenu={(e) => { e.preventDefault(); setTitleEditing(true); }}
                title="右击编辑标题"
              >{localTitle}</span>
            )}
            <span className="text-[11px] text-ink-400 tabular-nums leading-none whitespace-nowrap">
              主业 · {totalMain}
              <span className="mx-1 opacity-40">|</span>
              副业 · {totalSide}
            </span>
          </div>

          {/* 中：3 Tab（标题右边）—— 书架同款 pill 样式 */}
          <div className="flex items-center gap-1 ml-auto flex-shrink-0" style={{ marginRight: 0 }}>
            {(() => {
              const TABS = [
                { key: 'active', lb: '进行中', col: RED_DATA,    n: partitionedGoals.active.length },
                { key: 'done',   lb: '已完成', col: '#34C759', n: partitionedGoals.done.length   },
                { key: 'shelf',  lb: '已归档', col: '#64748b', n: partitionedGoals.shelf.length  },
              ];
              return TABS.map(t => {
                const active = workTab === t.key;
                const activeBg = active ? RED_DATA : 'transparent';
                const activeFg = active ? '#ffffff' : t.col;
                return (
                  <button
                    key={t.key}
                    onClick={() => setWorkTab(t.key)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[10px] transition-all duration-150"
                    style={{
                      background: active ? activeBg : 'transparent',
                      color: active ? activeFg : '#64748b',
                      fontWeight: active ? 700 : 500,
                      fontSize: '11.5px',
                      boxShadow: active ? 'none' : 'inset 0 0 0 1px rgba(15,23,42,0.05)',
                    }}>
                    <span className="relative w-[11px] h-[11px] rounded-full flex-shrink-0 flex items-center justify-center"
                      style={{ background: active ? 'rgba(255,255,255,0.25)' : (t.col + '22') }}>
                      <span className="w-[5.5px] h-[5.5px] rounded-full" style={{ background: active ? '#ffffff' : t.col }}></span>
                    </span>
                    <span>{t.lb}</span>
                    <span className="inline-flex items-center justify-center min-w-[17px] h-[15px] px-1 rounded-full text-[10px] font-bold tabular-nums leading-none"
                      style={{
                        background: active ? 'rgba(255,255,255,0.28)' : 'rgba(15,23,42,0.05)',
                        color: active ? '#ffffff' : '#64748b',
                      }}>
                      {t.n}
                    </span>
                  </button>
                );
              });
            })()}
          </div>

          {/* 右：蓝色操作按钮组（与书架同尺寸 26×26 blue10 bg）—— 新建目标 + 刷新样式占位（无多余功能） */}
          <div className="flex items-center gap-1 ml-3 flex-shrink-0">
            <button
              onClick={() => onGoalAdd?.()}
              className="inline-flex items-center justify-center w-[26px] h-[26px] rounded-lg transition flex-shrink-0"
              style={{ color: RED, background: 'rgba(var(--m-work-rgb),0.10)' }}
              title="新建目标">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" strokeLinecap="round"/></svg>
            </button>
          </div>
        </div>
      </div>

      {/* ========== Main：根据 Tab 渲染 ========== */}
      {/* —— Tab 1：进行中 → 最原始排版 · 左主业 / 右副业 50%：50% 两栏 —— */}
      {workTab === 'active' && (
        <div className="w-full grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* 主业 */}
          <div className="w-full flex flex-col gap-4">
            {activeMain.length === 0 ? (
              <div className="w-full glass-card rounded-2xl p-8 flex flex-col items-center justify-center text-center">
                <div className="text-[14px] font-semibold text-[#1d1d1f] mb-1">暂无主业目标</div>
                <div className="text-[12px] text-[#8e8e93]">点右上角 +，分组选「主业」后保存</div>
              </div>
            ) : activeMain.map(entry => renderFullCard(entry, 'active'))}
          </div>
          {/* 副业 */}
          <div className="w-full flex flex-col gap-4">
            {activeSide.length === 0 ? (
              <div className="w-full glass-card rounded-2xl p-8 flex flex-col items-center justify-center text-center">
                <div className="text-[14px] font-semibold text-[#1d1d1f] mb-1">暂无副业目标</div>
                <div className="text-[12px] text-[#8e8e93]">点右上角 +，分组选「副业」后保存</div>
              </div>
            ) : activeSide.map(entry => renderFullCard(entry, 'active'))}
          </div>
        </div>
      )}

      {/* —— Tab 2：已完成 → Master-Detail（左缩略卡扫描 · 右完整卡详情）—— */}
      {workTab === 'done' && (
        partitionedGoals.done.length === 0 ? (
          <div className="w-full glass-card rounded-2xl p-10 flex flex-col items-center justify-center text-center">
            <div className="text-[15px] font-semibold text-[#1d1d1f] mb-1">暂无已完成目标</div>
            <div className="text-[12.5px] text-[#8e8e93]">任意目标右上角 ⋮ → 已完成</div>
          </div>
        ) : (
        <div className="w-full grid grid-cols-2 gap-4 items-start">
          {/* 左栏 Master · 缩略卡列表（内缩圆角块，间距分组，无边框线） */}
          <div className="bg-white rounded-2xl border border-ink-100 shadow-[0_1px_2px_rgba(17,24,39,0.03)] p-1.5 flex flex-col gap-0.5">
            {partitionedGoals.done.map(entry => {
              const k = makeGoalKey(entry.o, entry.goalIdx);
              const isSel = selectedDoneKey === k;
              const start = entry.o.createdAt ? String(entry.o.createdAt).slice(0,10) : '';
              const end = entry.o.deadline || '';
              const startShort = start ? start.slice(5) : '—';
              const endShort = end ? end.slice(5) : '—';
              return (
                <div
                  key={'tn-' + k}
                  onClick={() => setSelectedDoneKey(k)}
                  className={`relative flex items-center gap-3 px-2.5 py-2.5 rounded-xl cursor-pointer transition-all duration-150 ${
                    isSel ? 'bg-white' : 'hover:bg-ink-50'
                  }`}
                  style={isSel ? { boxShadow: 'inset 0 0 0 1px rgba(250,80,62,0.35), 0 2px 8px rgba(250,80,62,0.12)' } : undefined}
                >
                  <div className="w-[18px] h-[18px] rounded-full grid place-items-center bg-[#34C759] text-white flex-shrink-0" style={{ boxShadow: 'inset 0 0 0 1px rgba(52,199,89,.5)' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 13l4 4L19 7"/></svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[16px] font-bold text-ink-900 truncate leading-tight">{entry.o.title}</div>
                    <div className="text-[10.5px] font-medium text-[#8e8e93] tabular-nums mt-[2px]">{startShort} → {endShort}</div>
                  </div>
                  <div style={{ width: 28, flexShrink: 0 }}>
                    {renderCardMenu({ entry, location: 'done' })}
                  </div>
                </div>
              );
            })}
          </div>
          {/* 右栏 Detail · 完整卡结构（复用 renderFullCard + 四模式渲染器 0 修改） */}
          <div>
            {selectedDoneEntry && renderFullCard(selectedDoneEntry, 'done')}
          </div>
        </div>
        )
      )}

      {/* —— Tab 3：已归档 → 单列 / 双列网格 完整原卡（搁置归档 快捷取消归档）—— */}
      {workTab === 'shelf' && (
        <div className="w-full grid grid-cols-1 min-[1100px]:grid-cols-2 gap-4">
          {partitionedGoals.shelf.length === 0 ? (
            <div className="w-full glass-card rounded-2xl p-10 flex flex-col items-center justify-center text-center col-span-full">
              <div className="text-[15px] font-semibold text-[#1d1d1f] mb-1">暂无已归档目标</div>
              <div className="text-[12.5px] text-[#8e8e93]">任意目标右上角 ⋮ → 已归档，或超期自动进入</div>
            </div>
          ) : partitionedGoals.shelf.map(entry => (
            <div key={'shelf-' + (entry.o.id || entry.o.title + entry.goalIdx)}>
              {renderFullCard(entry, 'shelf')}
            </div>
          ))}
        </div>
      )}

      {/* ========== 详情弹窗（缩略卡点击 → 完整原卡 0 修改展示） ========== */}
      {detailGoal && (() => {
        const { o, gs, goalIdx } = detailGoal;
        const bottleneck = renderWorkBottleneck(o, gs.color);
        const st = _statusOf(o);
        const statusPill = st === 'done'
          ? { txt: '已完成', bg: 'rgba(52,199,89,0.10)', fg: '#34C759', icon: '✅' }
          : { txt: '搁置归档', bg: 'rgba(142,142,147,0.12)', fg: '#8e8e93', icon: '📦' };
        const stop = (e) => e.stopPropagation();
        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.42)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
            onClick={() => setDetailGoal(null)}
          >
            <div className="w-full max-w-[720px] max-h-[90vh] flex flex-col bg-[#f5f5f7] rounded-2xl overflow-hidden shadow-[0_24px_80px_rgba(0,0,0,0.24)]"
              onClick={stop}>
              {/* Modal Header */}
              <div className="shrink-0 flex items-center gap-3 px-5 py-3.5 border-b border-[#e5e5ea] bg-white/80 backdrop-blur">
                <div className="shrink-0 w-1 h-8 rounded-full" style={{ background: gs.color }}/>
                <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                  <h3 className="text-[17px] font-semibold text-[#1d1d1f] truncate leading-tight" title={o.title}>{o.title}</h3>
                  <span className="shrink-0 text-[11.5px] font-medium rounded-full px-2 py-[2px] flex items-center gap-1"
                    style={{ background: statusPill.bg, color: statusPill.fg }}>
                    <span>{statusPill.icon}</span>{statusPill.txt}
                  </span>
                </div>
                {st !== 'active' && (
                  <button onClick={() => { onGoalUnarchive && onGoalUnarchive(o.id || o.title); setDetailGoal(null); }}
                    className="shrink-0 h-8 px-3 rounded-full flex items-center gap-1.5 text-[12.5px] font-medium transition-colors"
                    style={{ background: 'rgba(var(--s-rgb),0.08)', color: 'var(--s-main)' }}>
                    <span>↺</span><span>取消归档</span>
                  </button>
                )}
                <div className="shrink-0 -mr-1">
                  {renderCardMenu({ entry: detailGoal, location: 'modal' })}
                </div>
                <button onClick={() => setDetailGoal(null)}
                  className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-[#8e8e93] hover:text-[#1d1d1f] hover:bg-[#f2f2f7] transition-colors"
                  title="关闭">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-5">
                <div className="bg-white rounded-2xl border border-ink-100 shadow-[0_1px_2px_rgba(17,24,39,0.03)] p-5 flex flex-col overflow-hidden">
                  {renderObjective(o, gs, goalIdx)}
                  <div className="flex-1 min-h-0 pt-3 overflow-y-auto">
                    {renderByMode(o, gs, goalIdx)}
                  </div>
                  {bottleneck && <div className="mt-3">{bottleneck}</div>}
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

/* ---------- 11. 视图 · 生活 ---------- */
function LifeView({ lifeData, onEntryAdd, onEntryEdit, onStartHighlights, highlightedIds, docLinks, onDocLinksChange }) {
  const dynLife = lifeData || LIFE;
  const totalEntries = dynLife.reduce((s, c) => s + c.entries.length, 0);
  // 生活模块完成率：有记录的类目数 / 总类目数 * 100（体验型鼓励每个类目都有内容）
  const lifePct = Math.round((dynLife.filter(c => c.entries.length > 0).length / dynLife.length) * 100);
  const hlCount = Array.isArray(highlightedIds) ? highlightedIds.length : 0;

  /* ===== 双面板布局：左类目导航（筛选器）+ 右时间流（唯一主视图） ===== */
  const [lifeFilter, setLifeFilter] = useState(null); // null=全部 | 类目 key
  const selFilterCat = lifeFilter ? dynLife.find(c => c.key === lifeFilter) : null;
  // 模块色/类目色转 rgba：var(--m-life) → rgba(var(--m-life-rgb), a)；hex → 拼接透明度
  const lifeRgba = (color, a) => {
    if (typeof color === 'string' && color.startsWith('var(')) return `rgba(var(${color.slice(4, -1)}-rgb), ${a})`;
    if (/^#[0-9a-fA-F]{6}$/.test(color)) return `${color}${Math.round(a * 255).toString(16).padStart(2, '0')}`;
    return color;
  };
  // 扁平化（可被筛选）→ 解析 d(如 8.24 / 8.17-8.18 取起始日) → 按月分组倒序
  const timeGroups = useMemo(() => {
    const rows = [];
    (lifeFilter ? dynLife.filter(c => c.key === lifeFilter) : dynLife || []).forEach(c => (c.entries || []).forEach((e, i) => {
      const m = String(e.d || '').match(/(\d{1,2})\s*[./]\s*(\d{1,2})/);
      rows.push({ cat: c, e, idx: i, mo: m ? +m[1] : 0, day: m ? +m[2] : 0 });
    }));
    rows.sort((a, b) => (b.mo - a.mo) || (b.day - a.day));
    const groups = [];
    rows.forEach(r => {
      const last = groups[groups.length - 1];
      if (last && last.mo === r.mo) last.items.push(r);
      else groups.push({ mo: r.mo, label: r.mo ? `${r.mo}月` : '无日期', items: [r] });
    });
    return groups;
  }, [dynLife, lifeFilter]);

  /* ===== 需求 2：链接按钮 · 右键菜单增删改 · 点击跳转 ===== */
  const [linkMenu, setLinkMenu] = useState(null); // { x, y, editingId } | null
  const [linkListPopup, setLinkListPopup] = useState(null); // { x, y } | null — 多链接时点击弹出选择面板
  const [linkForm, setLinkForm] = useState({ title: '', url: '' }); // 编辑/新建 mini 表单
  const links = Array.isArray(docLinks) ? docLinks : [];
  const closeAllMenus = () => { setLinkMenu(null); setLinkListPopup(null); setLinkForm({ title: '', url: '' }); };

  // 点击链接按钮：1条直接跳转；多条弹出选择
  function handleLinkButtonClick(e) {
    e.stopPropagation();
    if (!links || links.length === 0) {
      // 没有链接 → 直接触发新建表单（模拟右键→添加）
      const rect = e.currentTarget.getBoundingClientRect();
      setLinkMenu({ x: rect.left, y: rect.bottom + 6, editingId: null });
      return;
    }
    if (links.length === 1) {
      window.open(links[0].url, '_blank', 'noopener,noreferrer');
      return;
    }
    // 多条 → 弹出选择列表面板
    const rect = e.currentTarget.getBoundingClientRect();
    setLinkListPopup({ x: rect.left, y: rect.bottom + 6 });
  }
  // 右键：弹出增删改菜单
  function handleLinkButtonContext(e) {
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setLinkListPopup(null);
    setLinkMenu({ x: rect.left, y: rect.bottom + 6, editingId: null });
  }
  // 更新链接列表操作（增/删/改）
  function addLink() {
    if (!linkForm.url.trim()) { alert('请输入链接地址'); return; }
    onDocLinksChange?.([...links, { id: uid(), title: linkForm.title.trim() || linkForm.url.trim(), url: linkForm.url.trim() }]);
    setLinkForm({ title: '', url: '' });
    closeAllMenus();
  }
  function updateLink(id) {
    if (!linkForm.url.trim()) { alert('请输入链接地址'); return; }
    onDocLinksChange?.(links.map(l => l.id === id ? { ...l, title: linkForm.title.trim() || linkForm.url.trim(), url: linkForm.url.trim() } : l));
    setLinkForm({ title: '', url: '' });
    closeAllMenus();
  }
  function deleteLink(id) {
    if (!confirm('确认删除此文档链接？')) return;
    onDocLinksChange?.(links.filter(l => l.id !== id));
    setLinkForm({ title: '', url: '' });
    closeAllMenus();
  }

  return (
    <div className="flex flex-col gap-4" onClick={closeAllMenus}>
      {/* Step1-4 L1区块：紫条 + 16px标题 + 紫胶囊%，与其他4模块一致 */}
      <div className="bg-white rounded-2xl border border-ink-100 p-5 flex flex-col gap-3">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="w-[5px] h-[18px] rounded-full flex-shrink-0" style={{ background: 'var(--m-life)' }}></span>
          <span className="text-[16px] font-bold text-ink-900 leading-none">{new Date().getFullYear()}年 · 生活体验</span>
          {/* 筛选态提示：筛选中显示 类目 · N条 ×（一键清除）；替代原切换钮位置 */}
          {lifeFilter && selFilterCat && (
            <div className="inline-flex items-center gap-1.5">
              <span className="text-[12px] font-semibold" style={{ color: 'var(--m-life)' }}>
                {selFilterCat.lb} · {selFilterCat.entries.length} 条
              </span>
              <button onClick={() => setLifeFilter(null)} title="清除筛选，显示全部"
                className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-md text-[11px] transition cursor-pointer"
                style={{ background: 'rgba(var(--m-life-rgb),0.10)', color: 'var(--m-life)' }}>×</button>
            </div>
          )}
          {/* 链接按钮（需求 2：圆角正方形；左键跳转 / 右键增删改）—— 在年度精选左边 */}
          <div className="relative ml-auto">
            <button
              onClick={handleLinkButtonClick}
              onContextMenu={handleLinkButtonContext}
              title={links.length ? `文档链接（${links.length} 条，右键增删改）` : '右键添加飞书文档链接'}
              className="inline-flex items-center justify-center w-[22px] h-[22px] rounded-lg transition hover:brightness-105 active:scale-[0.98] mr-2 cursor-pointer"
              style={{ background: 'rgba(var(--m-life-rgb),0.10)', border: '1px solid rgba(var(--m-life-rgb),0.25)' }}>
              {/* 外链图标：当前 UI 风格线形 · 紫 */}
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="var(--m-life)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
              </svg>
            </button>

            {/* ===== 右键菜单：增删改 ===== */}
            {linkMenu && (
              <div onClick={(e) => e.stopPropagation()} style={{
                position: 'fixed', top: linkMenu.y,
                // 右边界钳制：按钮在右上角时面板 230px+边距 会溢出视口被裁剪，改为右对齐收缩
                left: Math.max(8, Math.min(linkMenu.x, window.innerWidth - 246)), zIndex: 200,
                minWidth: '230px', padding: '6px', borderRadius: '12px',
                background: '#fff', border: '1px solid rgba(15,23,42,0.08)',
                boxShadow: '0 10px 30px rgba(15,23,42,0.12), 0 2px 6px rgba(15,23,42,0.06)',
              }}>
                {/* 现有链接条目列表 · hover 高亮 · 右侧 edit/delete */}
                {links.length === 0 && (
                  <div style={{ padding: '6px 10px', fontSize: '11px', color: '#8e8e93', fontWeight: 600 }}>
                    暂无文档链接，下面添加一条
                  </div>
                )}
                {links.map(l => (
                  <div key={l.id} style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '6px 8px', borderRadius: '8px', marginBottom: '2px',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(var(--m-life-rgb),0.08)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                    <span style={{
                      flex: 1, minWidth: 0, fontSize: '12px', fontWeight: 600, color: '#1c1c1e',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      cursor: 'pointer',
                    }}
                    title={l.url}
                    onClick={() => { window.open(l.url, '_blank', 'noopener,noreferrer'); closeAllMenus(); }}>
                      {l.title}
                    </span>
                    {/* 编辑按钮 */}
                    <button title="编辑" onClick={() => { setLinkMenu({ ...linkMenu, editingId: l.id }); setLinkForm({ title: l.title, url: l.url }); }}
                      style={{
                        width: '22px', height: '22px', borderRadius: '6px', border: 'none',
                        background: 'transparent', color: '#8e8e93', cursor: 'pointer',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(var(--m-life-rgb),0.14)'; e.currentTarget.style.color = 'var(--m-life)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#8e8e93'; }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                      </svg>
                    </button>
                    {/* 删除按钮 */}
                    <button title="删除" onClick={() => deleteLink(l.id)}
                      style={{
                        width: '22px', height: '22px', borderRadius: '6px', border: 'none',
                        background: 'transparent', color: '#8e8e93', cursor: 'pointer',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,59,48,0.14)'; e.currentTarget.style.color = '#FF3B30'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#8e8e93'; }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/>
                        <path d="M10 11v6M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>
                      </svg>
                    </button>
                  </div>
                ))}
                {/* 分隔线 */}
                {(linkMenu.editingId || links.length > 0) && (
                  <div style={{ height: 1, background: 'rgba(15,23,42,0.08)', margin: '4px 2px' }} />
                )}
                {/* 编辑表单（在 editingId 非空或 0 条时显示） */}
                {(linkMenu.editingId || links.length === 0) && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '6px 4px' }}>
                    <div style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--m-life)', letterSpacing: '0.04em' }}>
                      {linkMenu.editingId ? '编辑链接' : '新增链接'}
                    </div>
                    <input placeholder="标题（如：飞书·全年计划表）" value={linkForm.title}
                      onChange={(e) => setLinkForm(f => ({ ...f, title: e.target.value }))}
                      style={{
                        fontSize: '12px', padding: '5px 8px', borderRadius: '8px',
                        border: '1px solid rgba(15,23,42,0.10)', background: '#fff', outline: 'none',
                        fontWeight: 500,
                      }} />
                    <input placeholder="链接地址（支持 https://）" value={linkForm.url}
                      onChange={(e) => setLinkForm(f => ({ ...f, url: e.target.value }))}
                      style={{
                        fontSize: '12px', padding: '5px 8px', borderRadius: '8px',
                        border: '1px solid rgba(15,23,42,0.10)', background: '#fff', outline: 'none',
                        fontWeight: 500,
                      }} />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                      <button onClick={closeAllMenus}
                        style={{
                          padding: '4px 10px', borderRadius: '7px', fontSize: '11px', fontWeight: 600,
                          border: 'none', cursor: 'pointer',
                          background: 'rgba(120,120,128,0.12)', color: '#1c1c1e',
                        }}>取消</button>
                      <button onClick={() => linkMenu.editingId ? updateLink(linkMenu.editingId) : addLink()}
                        style={{
                          padding: '4px 10px', borderRadius: '7px', fontSize: '11px', fontWeight: 600,
                          border: 'none', cursor: 'pointer',
                          background: 'var(--m-life)', color: '#fff',
                          boxShadow: '0 1px 4px rgba(var(--m-life-rgb),0.28)',
                        }}>{linkMenu.editingId ? '保存' : '添加'}</button>
                    </div>
                  </div>
                )}
                {/* 添加一条新的入口（已有条目且未编辑态） */}
                {links.length > 0 && !linkMenu.editingId && (
                  <button onClick={() => { setLinkMenu({ ...linkMenu, editingId: null }); setLinkForm({ title: '', url: '' }); }}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: '6px',
                      padding: '6px 8px', borderRadius: '8px', border: 'none',
                      background: 'transparent', color: 'var(--m-life)',
                      fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(var(--m-life-rgb),0.08)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                      <path d="M12 5v14M5 12h14"/>
                    </svg>
                    新增一条链接
                  </button>
                )}
              </div>
            )}

            {/* ===== 单左键多链接选择面板（简洁列表） ===== */}
            {linkListPopup && (
              <div onClick={(e) => e.stopPropagation()} style={{
                position: 'fixed', top: linkListPopup.y,
                left: Math.max(8, Math.min(linkListPopup.x, window.innerWidth - 236)), zIndex: 200,
                minWidth: '220px', padding: '6px', borderRadius: '12px',
                background: '#fff', border: '1px solid rgba(15,23,42,0.08)',
                boxShadow: '0 10px 30px rgba(15,23,42,0.12), 0 2px 6px rgba(15,23,42,0.06)',
              }}>
                <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#8e8e93', letterSpacing: '0.04em', padding: '4px 8px' }}>
                  选择要打开的文档
                </div>
                {links.map(l => (
                  <button key={l.id} onClick={() => { window.open(l.url, '_blank', 'noopener,noreferrer'); closeAllMenus(); }}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '7px 10px', borderRadius: '8px', border: 'none',
                      background: 'transparent', cursor: 'pointer',
                      fontSize: '12px', fontWeight: 600, color: '#1c1c1e',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(var(--m-life-rgb),0.08)'; e.currentTarget.style.color = 'var(--m-life)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#1c1c1e'; }}
                    title={l.url}>
                    {l.title}
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* 年度精选 CTA（Step2-3 牵引入口） */}
          <button
            onClick={() => onStartHighlights?.()}
            disabled={totalEntries === 0}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold rounded-md transition hover:brightness-105 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'linear-gradient(135deg, var(--m-life) 0%, #FF2D55 100%)', color: '#fff', boxShadow: '0 1px 3px rgba(var(--m-life-rgb),0.25)' }}>
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" strokeLinejoin="round" strokeLinecap="round"/>
            </svg>
            年度精选{hlCount > 0 && <span className="opacity-95">· {hlCount}</span>}
          </button>
        </div>
        {/* ===== 双面板：左类目导航（筛选器） + 右时间流（唯一主视图） ===== */}
        <div className="flex gap-4 mt-1 items-start">
          {/* 左：类目导航 */}
          <div className="w-[150px] flex-shrink-0 flex flex-col gap-1">
            {/* 全部（默认） */}
            <button onClick={() => setLifeFilter(null)}
              className={`flex items-center gap-2 px-2.5 h-8 rounded-lg text-[13px] transition cursor-pointer text-left ${!lifeFilter ? 'font-bold text-[#1c1c1e] bg-[rgba(120,120,128,0.08)]' : 'font-medium text-ink-700 hover:bg-surface-soft'}`}>
              <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
              </svg>
              <span className="flex-1 truncate">全部记录</span>
              <span className="text-[11px] tabular-nums text-ink-400">{totalEntries}</span>
            </button>
            {/* 各类目：图标 + 名称 + 条数；hover 出 + 直接带类目添加 */}
            {dynLife.map(c => {
              const active = lifeFilter === c.key;
              return (
                <div key={c.key}
                  className={`group flex items-center gap-2 px-2.5 h-8 rounded-lg text-[13px] transition text-left ${active ? 'font-bold text-[#1c1c1e] bg-[rgba(120,120,128,0.08)]' : 'font-medium text-ink-700 hover:bg-surface-soft'}`}>
                  <button onClick={() => setLifeFilter(active ? null : c.key)}
                    className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer text-left"
                    title={active ? '点击取消筛选' : `筛选${c.lb}记录`}>
                    <span className="w-[7px] h-[7px] rounded-full flex-shrink-0" style={{ background: 'var(--m-life)' }} />
                    <span className="flex-1 truncate">{c.lb}</span>
                    <span className="text-[11px] tabular-nums text-ink-400">{c.entries.length}</span>
                  </button>
                  <button onClick={() => onEntryAdd?.(c.key, c.lb)} title={`添加${c.lb}记录`}
                    className="opacity-0 group-hover:opacity-100 transition inline-flex items-center justify-center w-[18px] h-[18px] rounded-md flex-shrink-0 cursor-pointer"
                    style={{ background: 'rgba(var(--m-life-rgb),0.10)', color: 'var(--m-life)' }}>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
                  </button>
                </div>
              );
            })}
          </div>

          {/* 右：时间流主视图（宽度收窄到合理栏宽，消除右侧大片空白） */}
          <div className="flex-1 min-w-0 max-w-[560px]">
            {timeGroups.length === 0 && (
              <div className="flex items-center justify-center py-8 rounded-xl border border-dashed border-ink-100 text-[12px] text-ink-500">
                {selFilterCat ? `「${selFilterCat.lb}」还没有记录，点左侧类目行的 + 添加` : '还没有生活记录，点左侧类目行的 + 添加'}
              </div>
            )}
            {timeGroups.map((g, gi) => g.items.map((r, ri) => {
              const isLast = gi === timeGroups.length - 1 && ri === g.items.length - 1;
              const hl = Array.isArray(highlightedIds) && highlightedIds.includes(r.e.id);
              return (
                <div key={`${r.cat.key}-${r.idx}`} className="flex gap-2.5 cursor-pointer"
                  onClick={() => onEntryEdit?.(r.cat.key, r.idx, r.e)}>
                  {/* 月份列（组首行）：与当月首条标题行等高居中（h-5 对齐标题行，不受笔记行影响） */}
                  <div className="w-9 flex-shrink-0">
                    {ri === 0 && (
                      <div className="h-5 flex items-center justify-end">
                        <span className="text-sm font-bold text-ink-700 leading-none">{g.label}</span>
                      </div>
                    )}
                  </div>
                  {/* 日期列（DD 两位补零）：移至时间线左侧，与标题行垂直居中 */}
                  <div className="w-6 flex-shrink-0 h-5 flex items-center justify-end">
                    <span className="text-[12px] font-semibold text-ink-400 tabular-nums leading-none">{r.day ? String(r.day).padStart(2, '0') : '--'}</span>
                  </div>
                  {/* 时间轴列：圆点容器与标题行严格等高(h-5)居中 */}
                  <div className="flex flex-col items-center flex-shrink-0">
                    <span className="h-5 flex items-center"><span className="w-[7px] h-[7px] rounded-full" style={{ background: r.cat.color }} /></span>
                    {!isLast && <span className="flex-1 w-px bg-ink-100" />}
                  </div>
                  {/* 内容列：标题 + 右侧类目标签（工作台搜索框同款灰底小圆角长方形） */}
                  <div className={`flex-1 min-w-0 relative h-7 flex items-center gap-2.5 px-2.5 rounded-lg bg-[rgba(120,120,128,0.08)] transition hover:bg-[rgba(120,120,128,0.12)] ${isLast ? '' : 'mb-4'}`}>
                    {hl && (
                      <div className="absolute -top-1 right-0 w-5 h-5 rounded-full grid place-items-center"
                        style={{ background: 'linear-gradient(135deg,var(--m-life),#FF2D55)', color: '#fff', boxShadow: '0 1px 3px rgba(var(--m-life-rgb),0.35)' }}
                        title="年度精选">
                        <svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                      </div>
                    )}
                    <span className="text-sm font-normal text-[#1c1c1e] truncate">{r.e.t}</span>
                    {/* 类目标签：弱化样式，与月周重点 srcTag 一致 */}
                    <span className="ml-auto flex-shrink-0 px-1.5 py-0.5 rounded-md text-[11px] leading-none font-normal"
                      style={{ background: 'rgba(255,255,255,0.75)', color: lifeRgba(r.cat.color, 0.85) }}>
                      {r.cat.lb}
                    </span>
                  </div>
                  {r.e.n && <div className="text-xs text-ink-500 leading-relaxed -mt-1 mb-3">{r.e.n}</div>}
                </div>
              );
            }))}
          </div>
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
        style={{ background: `rgba(${c.rgb},0.07)`, color: c.color }}>
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
export default function AnnualPlan({ standalone = true, initialView, onViewChange, addRequest }) {
  const [view, setViewState] = useState(initialView || 'overview');
  // 受控切换：Workspace 可以从外部跳转（如日历点击标签），内部 tab 切换也同步回调
  const setView = (next) => {
    setViewState(next);
    if (typeof onViewChange === 'function') onViewChange(next);
  };
  // 侧边栏二级导航「加号」：Workspace 透传 addRequest={view,ts} → 切到对应模块并弹添加框
  const addReqTsRef = useRef(0);
  useEffect(() => {
    if (!addRequest || !addRequest.ts || addRequest.ts === addReqTsRef.current) return;
    addReqTsRef.current = addRequest.ts;
    const act = ANNUAL_ADD_ACTIONS[addRequest.view];
    if (!act) return;
    setViewState(addRequest.view);
    if (typeof onViewChange === 'function') onViewChange(addRequest.view);
    setModal({ ...act });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addRequest]);
  // initialView 变化（外部跳模块）时，内部 view 同步刷新
  useEffect(() => {
    if (initialView !== undefined && initialView !== null) setViewState(initialView);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialView]);
  const [toast, setToast] = useState(null);
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
  // 🎯 终极修复：在 usePersistentState 读 localStorage 之前先同步修 wk_xhs 的 archived
  // —— usePersistentState 内部先读 localStorage 有值就直接返回，initial 函数不会被调用！
  // —— 所以必须在 usePersistentState 之前手动修 localStorage
  (() => {
    try {
      const saved = localStorage.getItem('annual_work');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          let changed = false;
          const fixed = parsed.map(o => {
            // 小红书：强制进行中（仅拦 archived/shelf）
            if (o && String(o.title || '').includes('小红书') && (o.archived === true || o.status === 'shelf')) {
              changed = true;
              return { ...o, archived: false, status: 'active' };
            }
            // JL 离职：升级为 event 范式（mode + 清空旧 KR）
            if (o && String(o.title || '').includes('JL离职') && (o.mode !== 'event' || (o.krs || []).length > 0)) {
              changed = true;
              return { ...o, mode: 'event', krs: [] };
            }
            return o;
          });
          if (changed) localStorage.setItem('annual_work', JSON.stringify(fixed));
        }
      }
    } catch (_) { /* ignore */ }
  })();
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
  // 生活·在线文档链接 - 右键菜单增删改（需求 2）
  const [lifeDocLinks, setLifeDocLinks] = usePersistentState('annual_life_doc_links', () => [
    { id: uid(), title: '飞书多维表格 · 全年计划', url: 'https://bytedance.larkoffice.com' },
  ]);
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
  // ===== ID 兜底：兼容旧 localStorage 数据 —— 给缺失 id 的目标/能力/KR/里程碑补 uid =====
  React.useEffect(() => {
    let changed = false;
    const normAb = (abilities || []).map(a => {
      const aId = a.id || uid(); if (!a.id) changed = true;
      const ms = (a.mstones || []).map(m => {
        if (m.id) return m;
        changed = true; return { ...m, id: uid() };
      });
      if (ms.length !== (a.mstones || []).length || ms.some((m, i) => m.id !== (a.mstones || [])[i]?.id)) {
        // ids 已经被补（即使没 changed）也要用新数组
      }
      return (!a.id || (a.mstones || []).some((m, i) => ms[i]?.id && !m.id)) ? { ...a, id: aId, mstones: ms } : a;
    });
    const normWk = (workGoals || []).map(o => {
      const oId = o.id || uid(); if (!o.id) changed = true;
      const krs = (o.krs || []).map(k => {
        if (k.id) return k;
        changed = true; return { ...k, id: uid() };
      });
      return (!o.id || (o.krs || []).some((k, i) => krs[i]?.id && !k.id)) ? { ...o, id: oId, krs } : o;
    });
    if (changed) { setAbilities(normAb); setWorkGoals(normWk); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      setAbilities(prev => prev.map((a, i) => i === data.abilityIdx ? { ...a, mstones: a.mstones.map((m, j) => j === data.msIdx ? { ...m, lb: data.lb, startDate: data.startDate || '', dueBy: data.dueBy, st: data.st, pct: data.pct } : m) } : a));
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
  // 工作·Objective（目标）
  const workGoalOps = {
    add: (data) => {
      setWorkGoals(prev => [...prev, {
        id: uid(),
        core: !!data.core,
        label: data.label || (data.core ? '主业' : '副业'),
        title: data.title?.trim() || '新目标',
        mode: ['funnel', 'dashboard', 'milestone', 'balance', 'event'].includes(data.mode) ? data.mode : 'funnel',
        createdAt: data.createdAt || new Date().toISOString().slice(0, 10),
        deadline: data.deadline || '',
        completedAt: null,
        krs: [],
      }]);
      showToast('目标已添加，点击卡片内 + 添加 KR');
    },
    update: (data) => {
      if (!data.id) return;
      setWorkGoals(prev => prev.map(o => o.id === data.id ? {
        ...o,
        core: data.core !== undefined ? !!data.core : o.core,
        label: data.label || (data.core !== undefined ? (data.core ? '主业' : '副业') : o.label),
        title: data.title !== undefined ? data.title.trim() || o.title : o.title,
        mode: ['funnel', 'dashboard', 'milestone', 'balance', 'event'].includes(data.mode) ? data.mode : o.mode,
        createdAt: data.createdAt || o.createdAt,
        deadline: data.deadline !== undefined ? data.deadline : o.deadline,
      } : o));
      showToast('目标已更新');
    },
    remove: (id) => {
      setWorkGoals(prev => prev.filter(o => o.id !== id));
      showToast('目标已删除');
    },
    markDone: (id) => {
      const now = new Date().toISOString().slice(0, 10);
      setWorkGoals(prev => prev.map(o => o.id === id ? { ...o, status: 'done', completedAt: o.completedAt || now, archived: false } : o));
      showToast('目标已标记为完成');
    },
    shelf: (id) => {
      setWorkGoals(prev => prev.map(o => o.id === id ? { ...o, status: 'shelf', archived: true, completedAt: null } : o));
      showToast('目标已归档搁置');
    },
    unarchive: (id) => {
      setWorkGoals(prev => prev.map(o => o.id === id ? { ...o, status: 'active', archived: false, completedAt: null } : o));
      showToast('目标已取消归档，回到进行中');
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
  // 生活·记录（类目匹配用 c.key === data.lifeKey；旧实现 i===data.lifeKey 会把 'relation' 当成 number index 永远 false）
  const entryOps = {
    add: (data) => {
      if (!data.lifeKey) { alert('请选择一个模块'); return; }
      setLifeData(prev => prev.map(c => c.key === data.lifeKey ? { ...c, entries: [...c.entries, { ...data, id: uid() }] } : c));
      showToast('记录已添加');
    },
    update: (data) => {
      setLifeData(prev => prev.map(c => c.key === data.lifeKey ? { ...c, entries: c.entries.map((e, j) => j === data.entryIdx ? { ...e, t: data.t, n: data.n, d: data.d } : e) } : c));
      showToast('记录已更新');
    },
    remove: ({ lifeKey, entryIdx }) => {
      setLifeData(prev => prev.map(c => c.key === lifeKey ? { ...c, entries: c.entries.filter((_, j) => j !== entryIdx) } : c));
      showToast('记录已删除');
    },
  };

  // 生活·模块（大类）：新增 / 改名改色 / 删除（删除带确认）
  const lifeCatOps = {
    add: ({ lb, color }) => {
      const key = uid();
      setLifeData(prev => [...prev, { key, lb: lb.trim(), color: color || 'var(--m-life)', entries: [] }]);
      showToast(`已新增模块「${lb.trim()}」`);
      return { key };
    },
  };

  // ---- Modal 状态 ----
  const [modal, setModal] = useState(null); // { type, initial, categoryLabel }
  const closeModal = () => setModal(null);

  // 精力习惯编辑（打开 HabitForm）
  const handleEnergyAction = useCallback(async (action, habit) => {
    if (action === 'addHabit') {
      // 新建精力类习惯
      setModal({ type: 'habit', initial: { growth_type: 'energy', accent_color: '#34C759' } });
    }
    if (action === 'editHabit' && habit) {
      const rawHabit = {
        id: habit.id,
        name: habit.name,
        emoji: habit.emoji,
        growth_type: 'energy',
        accent_color: '#34C759',
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
  const onKrRemove = (workIdx, krIdx, kr) => {
    setConfirmDialog({
      title: '删除 KR',
      message: `确定删除「${kr?.t || '此条 KR'}」吗？\n删除后不可恢复。`,
      confirmText: '删除',
      danger: true,
      onConfirm: () => { krOps.remove({ workIdx, krIdx }); setConfirmDialog(null); },
      onCancel: () => setConfirmDialog(null),
    });
  };
  const onAbilityEdit = (abilityIdx) => {
    const a = abilities[abilityIdx]; if (!a) return;
    setModal({ type: 'ability', initial: { ...a, id: a.id } });
  };
  const onAbilityRemove = (abilityIdx) => {
    const a = abilities[abilityIdx]; if (!a) return;
    setConfirmDialog({
      title: '删除能力目标',
      message: `确定删除「${a.title}」及其所有里程碑吗？\n删除后不可恢复。`,
      confirmText: '删除',
      danger: true,
      onConfirm: () => { abilityOps.remove(a.id); setConfirmDialog(null); },
      onCancel: () => setConfirmDialog(null),
    });
  };
  const onWorkGoalRemove = (goalIdx) => {
    const o = workGoals[goalIdx]; if (!o) return;
    setConfirmDialog({
      title: '删除工作目标',
      message: `确定删除「${o.title}」及其所有 KR 吗？\n删除后不可恢复。`,
      confirmText: '删除',
      danger: true,
      onConfirm: () => { workGoalOps.remove(o.id); setConfirmDialog(null); },
      onCancel: () => setConfirmDialog(null),
    });
  };
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
          <Modal open onClose={closeModal} title={isBookEdit ? '编辑书籍' : '添加书籍'} maxWidth={640}>
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
      case 'work_goal':
        return (
          <Modal open onClose={closeModal} title={modal.initial?.id ? '编辑目标' : '新增目标'}>
            <WorkGoalForm
              initial={modal.initial}
              onCancel={closeModal}
              onSaved={(data) => {
                modal.initial?.id ? workGoalOps.update(data) : workGoalOps.add(data);
                closeModal();
              }}
              onDelete={modal.initial?.id ? (id) => { workGoalOps.remove(id); closeModal(); } : undefined}
            />
          </Modal>
        );
      case 'entry':
        return (
          <Modal open onClose={closeModal} title={modal.initial?.id ? '编辑记录' : '添加记录'} maxWidth={480}>
            <EntryForm
              initial={modal.initial}
              categoryLabel={modal.categoryLabel}
              lifeCategories={lifeData.map(c => ({ key: c.key, lb: c.lb, color: c.color }))}
              onAddCategory={(d) => lifeCatOps.add(d)}
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
      {view === 'overview'  && <OverviewView  onNav={setView} stats={stats} realHabits={mergedHabits} books={books} abilities={abilities} workGoals={workGoals} lifeData={lifeData} />}
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
        onAbilityEdit={onAbilityEdit}
        onAbilityRemove={onAbilityRemove}
        scoreHistory={abilityScoreHistory} onSetScore={(abilityIdx, newScore) => {
          const ab = abilities[abilityIdx]; if (!ab) return;
          const ym = new Date().toISOString().slice(0,7);
          const abId = ab.id || ab.title;
          setAbilityScoreHistory(prev => ({ ...prev, [abId]: { ...(prev[abId] || {}), [ym]: newScore } }));
          setAbilities(prev => prev.map((a, i) => i === abilityIdx ? { ...a, score: String(newScore) } : a));
          showToast('自评已更新');
        }} onStartAssessment={() => setModal({ type: 'ability_assess' })} />}
      {view === 'work'      && <WorkView     workGoals={workGoals} onKrAdd={onKrAdd} onKrEdit={onKrEdit} onKrRemove={onKrRemove}
        onGoalAdd={() => setModal({ type: 'work_goal' })}
        onGoalEdit={(goalIdx) => setModal({ type: 'work_goal', initial: { ...workGoals[goalIdx], goalIdx } })}
        onGoalRemove={onWorkGoalRemove}
        onGoalMarkDone={(id) => workGoalOps.markDone(id)}
        onGoalShelf={(id) => workGoalOps.shelf(id)}
        onGoalUnarchive={(id) => workGoalOps.unarchive(id)}
        microActions={workKrMicroActions}
        onRiskTagClick={(workIdx, krIdx, kr, goal, risk) => setModal({ type: 'risk_breakdown', initial: { workIdx, krIdx, kr, goal, risk } })} />}
      {view === 'life'      && <LifeView     lifeData={lifeData} onEntryAdd={onEntryAdd} onEntryEdit={onEntryEdit}
        highlightedIds={lifeHighlightedIds}
        onStartHighlights={() => setModal({ type: 'life_highlights' })}
        docLinks={lifeDocLinks}
        onDocLinksChange={(next) => setLifeDocLinks(next)} />}
    </main>
  );

  const toastEl = toast && (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2"
      style={{ background: '#fff', border: '1px solid rgba(15,23,42,0.08)', boxShadow: '0 8px 24px rgba(15,23,42,0.12)' }}>
      <svg className="w-4 h-4" fill="none" stroke="#34C759" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>
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
            className={['flex-1 py-3.5 text-sm font-bold transition', confirmDialog.danger ? 'text-accent-red hover:bg-accent-red/10' : 'hover:bg-ink-100'].join(' ')}
            style={confirmDialog.danger ? undefined : { color: 'var(--s-main)' }}>
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

  // 嵌入式：工作台内使用。顶部 Tab 已整合到应用左侧边栏「发展规划」二级导航
  //（图标+文字+加号，由 Workspace 透传 annualView/onAnnualView/onAnnualAdd/addRequest 驱动）
  if (!standalone) {
    return (
      <div className="w-full">
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
