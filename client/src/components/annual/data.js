import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { pct } from './utils.js';

export const CATEGORIES = [
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
  finance:   { type: 'finance_tx' },
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
export const COG_O = { text: '通过阅读获得启发，并确定实际行动目标以获得改变', year: new Date().getFullYear() };
export const COG_KRS = [
  { id: 'kr0', lb: '目标量', tgt: 12, val: 12, u: '本', sub: '年度目标' },
  { id: 'kr1', lb: '输入量', tgt: 12, val: 0, u: '本', sub: '已读完' },
  { id: 'kr2', lb: '思考量', tgt: 24, val: 0, u: '组', sub: '思考组数' },
  { id: 'kr3', lb: '行动量', tgt: 12, val: 0, u: '项', sub: '行动勾选' },
  { id: 'kr4', lb: '改变量', tgt: 6, val: 0, u: '个', sub: '改变记录' },
];

/* -------- 封面组件：直接渲染<img> + 错误兜底 -------- */
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
