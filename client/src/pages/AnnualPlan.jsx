import { useState, useMemo, useEffect, useCallback } from 'react';
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
  { key: 'cognition', label: '认知', type: '混合型',    weight: 0.20, color: '#4b63f0' }, /* accent-blue  */
  { key: 'ability',   label: '能力', type: '里程碑型',  weight: 0.25, color: '#f59e0b' }, /* accent-amber/orange */
  { key: 'work',      label: '工作', type: 'OKR 量化型',weight: 0.25, color: '#ef4444' }, /* accent-red   */
  { key: 'life',      label: '生活', type: '体验记录',  weight: 0.15, color: '#8b5cf6' }, /* accent-violet/purple */
];

/* 习惯打卡 (精力) */
const HABITS = [
  { key: 'sleep', label: '睡觉 23:00 前', unit: '天', target: 230, val: 142, month: { 1: 22, 2: 18, 3: 23, 4: 20, 5: 21, 6: 18, 7: 20 } },
  { key: 'water', label: '喝水 ≥ 2L',    unit: '杯', target: 230, val: 198, month: { 1: 28, 2: 22, 3: 29, 4: 25, 5: 30, 6: 28, 7: 31 } },
  { key: 'sport', label: '运动 ≥ 30 分', unit: '次', target: 120, val: 56,  month: { 1: 8,  2: 6,  3: 9,  4: 7,  5: 12, 6: 8,  7: 6  } },
];

/* 认知 · 书籍 */
const BOOKS = [
  { t: '穷查理宝典',   author: '查理·芒格', cat: '商业',  st: 'reading', pct: 65, src: '微信读书' },
  { t: '人类简史',     author: '尤瓦尔·赫拉利', cat: '认知', st: 'reading', pct: 30, src: 'PDF' },
  { t: '硅谷钢铁侠',   author: '阿什利·万斯', cat: '传记', st: 'reading', pct: 15, src: '微信读书' },
  { t: '影响力',       author: '罗伯特·西奥迪尼', cat: '商业', st: 'pending', pct: 0,  src: 'PDF' },
  { t: '非暴力沟通',   author: '马歇尔·卢森堡', cat: '认知', st: 'pending', pct: 0,  src: '微信读书' },
  { t: '定位',         author: '艾·里斯',       cat: '商业', st: 'pending', pct: 0,  src: 'PDF' },
  { t: '从0到1',       author: '彼得·蒂尔',     cat: '商业', st: 'pending', pct: 0,  src: '微信读书' },
  { t: '纳瓦尔宝典',   author: 'Eric Jorgenson', cat: '认知', st: 'done',    pct: 100,src: '微信读书' },
  { t: '原则',         author: '瑞·达利欧',     cat: '认知', st: 'done',    pct: 100,src: 'PDF' },
  { t: '思考，快与慢', author: '丹尼尔·卡尼曼', cat: '认知', st: 'done',    pct: 100,src: '微信读书' },
  { t: '被讨厌的勇气', author: '岸见一郎',     cat: '认知', st: 'done',    pct: 100,src: '微信读书' },
  { t: 'Atomic Habits',author: 'James Clear',  cat: '商业', st: 'done',    pct: 100,src: 'PDF' },
];
const COG_KR = [
  { lb: 'KR1 读完12本', val: 5,  tgt: 12, sub: '已读5本' },
  { lb: 'KR2 读书笔记', val: 3,  tgt: 12, sub: '已输出3篇' },
  { lb: 'KR3 改变落地', val: 0,  tgt: 6,  sub: '已落地0条' },
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

/* ---------- P2-2: 认知阅读漏斗图 ---------- */
function ReadingFunnel({ pending, reading, done }) {
  const stages = [
    { key: 'pending', label: '想读', count: pending, color: '#8e8e93', widthPct: 100 },
    { key: 'reading', label: '在读', count: reading, color: '#4b63f0', widthPct: 68 },
    { key: 'done',    label: '读完', count: done,    color: '#22c55e', widthPct: 42 },
  ];
  const total = pending + reading + done || 1;
  const conv1 = pending > 0 ? Math.round((reading / pending) * 100) : 0;
  const conv2 = reading > 0 ? Math.round((done / reading) * 100) : 0;
  const overall = Math.round((done / total) * 100);

  return (
    <div className="glass-card p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg grid place-items-center bg-brand-500/10 text-brand-500">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2z" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span className="text-sm font-bold text-ink-900">阅读漏斗</span>
        </div>
        <div className="flex items-center gap-1 text-[11px] font-bold text-accent-green">
          <span>读完率</span>
          <span className="tabular-nums">{overall}%</span>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {stages.map((s, i) => {
          const next = stages[i + 1];
          const conversion = next && s.count > 0 ? Math.round((next.count / s.count) * 100) : null;
          return (
            <div key={s.key} className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2.5">
                <div className="relative w-full h-9 rounded-lg overflow-hidden bg-ink-50">
                  <div className="h-full rounded-lg transition-all duration-500 flex items-center px-3 justify-between"
                    style={{ width: `${s.widthPct}%`, background: `linear-gradient(90deg, ${s.color} 0%, ${s.color}dd 100%)` }}>
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <span className="opacity-90">{s.label}</span>
                    </span>
                    <span className="text-sm font-bold text-white tabular-nums">{s.count}</span>
                  </div>
                </div>
              </div>
              {conversion !== null && (
                <div className="flex items-center justify-center gap-1 py-0.5">
                  <div className="h-3 w-px bg-ink-200" />
                  <svg className="w-3 h-3 text-ink-300" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 5v14M5 12l7 7 7-7" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  <span className="text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-md"
                    style={{
                      color: conversion >= 60 ? '#22c55e' : conversion >= 35 ? '#f97316' : '#dc2626',
                      background: conversion >= 60 ? '#dcfce7' : conversion >= 35 ? '#fef9c3' : '#fee2e2',
                    }}>
                    转化率 {conversion}%
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
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
          (st.dates || []).forEach(d => {
            const m = parseInt(d.split('-')[1], 10);
            monthData[m] = (monthData[m] || 0) + 1;
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

/* ---------- 通用 Sparkline 迷你折线图 ---------- */
const Sparkline = ({ data, color = '#22c55e', width = 120, height = 28 }) => {
  if (!data || data.length === 0) return null;
  const max = Math.max(10, Math.max(...data));
  const min = Math.min(0, Math.min(...data));
  const range = Math.max(1, max - min);
  const stepX = data.length === 1 ? 0 : width / (data.length - 1);
  const pts = data.map((v, i) => {
    const x = i * stepX;
    const y = height - (((v - min) / range) * (height - 4)) - 2;
    return `${x},${y}`;
  }).join(' ');
  const areaPath = 'M0,' + height + ' L' + pts + ' L' + width + ',' + height + ' Z';
  const linePath = pts.split(' ').map((p, i) => (i === 0 ? 'M' + p : 'L' + p)).join(' ');
  const lastPoint = (data.length - 1) * stepX;
  const lastY = height - (((data[data.length - 1] - min) / range) * (height - 4)) - 2;
  const gid = 'sg-' + color.replace('#','') + '-' + Math.abs(data.reduce((s,v)=>s+v,0)).toString(36);
  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={'url(#' + gid + ')'} />
      <path d={linePath} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastPoint} cy={lastY} r="3" fill={color} />
    </svg>
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
      const cogPct = pct(done, 12);
      return (
        <div className="flex flex-col gap-1.5 text-xs text-ink-500 pt-1">
          <div>年度目标 12 本 · 已读 <span className="font-semibold text-ink-900 tabular-nums">{done}</span> 本</div>
          <div className="text-xs text-ink-500">完成率 {cogPct}% · 正在读 {reading} 本</div>
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

  if (loading && !realHabits) {
    return (
      <div className="flex flex-col gap-4">
        <SectionHeader cat="energy" title="精力 · 习惯打卡" />
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
        <SectionHeader cat="energy" title="精力 · 习惯打卡" />
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
      <SectionHeader
        cat="energy"
        title="精力 · 习惯打卡"
        progress={energyPct}
        right={
          <button onClick={() => onAction?.('addHabit')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-accent-green/10 text-accent-green text-xs font-bold hover:bg-accent-green/15 transition">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" strokeLinecap="round"/></svg>
            添加精力习惯
          </button>
        }
      />
      <div className="glass-card overflow-hidden">
        {/* 月度分析概览 */}
        <div className="px-4 py-3 border-b border-ink-100 bg-surface-soft/50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-ink-700">{curMonth}月 · 本月进度分析</span>
            <span className="text-[11px] text-ink-400">当前已过 {daysElapsedInCurMonth} 天</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {habits.map(h => {
              const ana = getMonthAnalysis(h);
              const achColor = ana.achievementRate >= 80 ? '#16a34a' : ana.achievementRate >= 50 ? '#22c55e' : '#f97316';
              const habitColor = h.val >= h.target ? '#16a34a' : '#22c55e';
              const monthData = Array.from({ length: 12 }, (_, i) => h.month?.[i + 1] || 0);
              return (
                <div key={h.key} className="flex flex-col gap-1.5 p-2.5 rounded-xl bg-white border border-ink-100 shadow-[0_1px_2px_rgba(17,24,39,0.03)] hover:shadow-[0_2px_6px_rgba(17,24,39,0.05)] transition-shadow">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-ink-900 truncate max-w-[90px]">{h.label.replace(/^\S+\s?/, '')}</span>
                    {ana.delta !== null && ana.delta !== 0 && (
                      <span className={[
                        'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold tabular-nums',
                        ana.delta > 0
                          ? 'bg-accent-green/10 text-accent-green'
                          : 'bg-accent-red/10 text-accent-red'
                      ].join(' ')}>
                        {ana.delta > 0 ? '▲' : '▼'}{Math.abs(ana.delta)}%
                      </span>
                    )}
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-lg font-bold tabular-nums leading-none" style={{color: achColor}}>{ana.achievementRate}</span>
                    <span className="text-[11px] font-semibold" style={{color: achColor}}>% 达标率</span>
                  </div>
                  <div className="text-[11px] text-ink-400 tabular-nums leading-tight">
                    {ana.curMonthVal}<span className="text-ink-300">/</span>{ana.expectedCur} <span className="text-ink-400">{h.unit}</span>
                    {ana.prevMonthVal > 0 && <span className="ml-1.5 text-ink-300">· 上月 {ana.prevMonthVal}</span>}
                  </div>
                  <Sparkline data={monthData} color={habitColor} width={120} height={24} />
                </div>
              );
            })}
          </div>
        </div>
        {/* 详情表格 */}
        <div className="px-1">
            {/* 列排版：习惯名 → 目标(可编辑) → 累计 → 完成率 → 月份×12 → 删除 */}
            <div className="grid habit-table px-4 py-3 bg-surface-soft border-b border-ink-100 text-sm font-semibold text-ink-500">
              <div className="grp-start">习惯名称</div>
              <div className="text-right">目标</div>
              <div className="text-right cum-gap">累计</div>
              <div className="text-right grp-end">完成率</div>
              {monthLabels.map((m, idx) => (
                <div key={m} className={['text-center', isCurrentMonth(idx + 1) ? 'text-accent-green font-bold' : ''].join(' ')}>
                  {m}
                </div>
              ))}
              <div className="w-6"></div>
            </div>
            {habits.map(h => {
              const p = pct(h.val, h.target);
              const done = p >= 100;
              const barColor = done ? '#16a34a' : p >= 50 ? '#22c55e' : '#f97316';
              const hkey = h.id || h.key;
              const isEditing = editingTargetKey === hkey;
              return (
                <div key={hkey} className="grid habit-table px-4 py-3 border-b border-ink-100 last:border-b-0 items-center hover:bg-surface-soft transition-colors group">
                  <div className="flex items-center gap-2 min-w-0 cursor-pointer grp-start" onClick={() => onAction?.('editHabit', h)}>
                    <span className="text-sm font-semibold text-ink-900 truncate">{h.label}</span>
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
                        className="w-16 ml-auto px-2 py-1 text-sm font-bold text-right border border-accent-green rounded-md outline-none focus:ring-2 focus:ring-accent-green/30 tabular-nums text-ink-900 bg-white"
                      />
                    ) : (
                      <div onClick={() => startEditTarget(h)} className="inline-flex items-center justify-end gap-0 hover:bg-accent-green/8 rounded-md transition cursor-pointer w-full pr-0">
                        <span className="text-sm font-semibold text-ink-700 tabular-nums text-right ml-1">{h.target}</span>
                        <span className="text-[10px] text-ink-400 ml-1">{h.unit}</span>
                      </div>
                    )}
                  </div>
                  <div className="text-right font-bold tabular-nums text-ink-900 cum-gap">{h.val}</div>
                  {/* 完成率 - 去掉进度条，只显示百分比 */}
                  <div className="text-right cursor-pointer grp-end" onClick={() => onAction?.('editHabit', h)}>
                    <span className="text-sm font-bold tabular-nums" style={{color: barColor}}>{p}%</span>
                  </div>
                  {monthIndices.map((monthIdx) => {
                    const n = h.month?.[monthIdx] || 0;
                    const maxT = monthMaxDays[monthIdx - 1];
                    const ratio = n / maxT;
                    const passed = ratio >= 0.8;
                    const isCur = isCurrentMonth(monthIdx);
                    return (
                      <div key={monthIdx} className="flex justify-center">
                        <span className={[
                          'text-xs font-bold tabular-nums px-0 py-1 rounded-md min-w-[24px] text-center transition-colors',
                          passed ? 'bg-accent-green text-white' : isCur ? 'bg-accent-green/40 text-ink-900' : 'bg-ink-100 text-ink-500'
                        ].join(' ')}>{n}</span>
                      </div>
                    );
                  })}
                  {/* 删除按钮 */}
                  <div className="flex justify-center">
                    <button onClick={(e) => { e.stopPropagation(); onAction?.('removeHabit', h); }}
                      className="w-6 h-6 rounded-lg grid place-items-center text-ink-300 hover:text-accent-red hover:bg-accent-red/10 opacity-0 group-hover:opacity-100 transition-all" title="删除习惯">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </button>
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}

/* ---------- 8. 视图 · 认知 (书架系统) ---------- */
function CognitionView({ books, onBookAdd, onBookEdit }) {
  const groups = useMemo(() => {
    const dynBooks = books || BOOKS;
    return {
      reading: dynBooks.filter(b => b.st === 'reading'),
      pending: dynBooks.filter(b => b.st === 'pending'),
      done:    dynBooks.filter(b => b.st === 'done'),
    };
  }, [books]);
  const groupLabels = [
    { key: 'reading', lb: '阅读中', col: '#4b63f0', count: groups.reading.length, disabled: groups.reading.length === 0 },
    { key: 'pending', lb: '未开始', col: '#8e8e93', count: groups.pending.length, disabled: groups.pending.length === 0 },
    { key: 'done',    lb: '已读完', col: '#22c55e', count: groups.done.length,    disabled: groups.done.length === 0 },
  ];

  const CAT_COLOR = {
    '商业': '#1d4ed8', '心理学': '#7c3aed', '哲学': '#047857',
    '科技': '#0891b2', '传记': '#be185d', '文学': '#475569', '其他': '#64748b',
  };

  // 计算认知完成率（基于KR的加权平均）
  const cogPct = useMemo(() => {
    const total = COG_KR.reduce((s, kr) => s + pct(kr.val, kr.tgt), 0);
    return Math.round(total / COG_KR.length);
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader cat="cognition" title="认知 · 书架系统" progress={cogPct} />
      {/* KR */}
      <div className="grid grid-cols-3 gap-3">
        {COG_KR.map(kr => {
          const p = pct(kr.val, kr.tgt);
          return (
            <div key={kr.lb} className="glass-card p-4 flex flex-col gap-2.5">
              <span className="text-sm font-bold text-ink-900 leading-snug">{kr.lb}</span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-xl font-bold tabular-nums leading-none" style={{color: '#4b63f0'}}>{kr.val}</span>
                <span className="text-xs text-ink-500">/ {kr.tgt} · {kr.sub}</span>
              </div>
              <ProgressBar value={p} color="#4b63f0" />
              <div className="text-xs font-semibold tabular-nums" style={{color:'#4b63f0'}}>完成率 {p}%</div>
            </div>
          );
        })}
      </div>
      {/* P2-2: 阅读漏斗图 */}
      <ReadingFunnel pending={groups.pending.length} reading={groups.reading.length} done={groups.done.length} />
      {/* 书架看板 - 3列: 阅读中 / 未开始 / 已读完 */}
      <div className="grid grid-cols-3 gap-4">
        {groupLabels.map(g => (
          <div key={g.key} className={`flex flex-col gap-2.5 ${g.disabled ? 'opacity-50' : ''}`}>
            <div className="flex items-center gap-2 px-0.5">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2 py-0.5 rounded-full"
                style={{ background: `${g.col}10`, color: g.col }}>{g.lb}</span>
              <span className="text-xs font-bold text-ink-700 tabular-nums">{g.count}</span>
            </div>
            <div className="flex flex-col gap-2 flex-1 min-h-[100px]">
              {(groups[g.key] || []).length === 0 && (
                <div className="flex-1 flex flex-col items-center justify-center py-5 px-3 rounded-xl border border-dashed border-ink-100 text-center gap-1.5">
                  <svg className="w-7 h-7 text-ink-200" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" strokeLinecap="round"/>
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" strokeLinecap="round"/>
                  </svg>
                  <div className="text-xs font-semibold text-ink-500">{g.lb}为空</div>
                  <div className="text-[11px] text-ink-400 leading-snug">
                    {g.key === 'reading' && '开始一本新书，养成每日阅读习惯'}
                    {g.key === 'todo' && '把想读的书先加进来，避免书单荒'}
                    {g.key === 'done' && '读完的书记得归档，积累成就感'}
                  </div>
                </div>
              )}
              {(groups[g.key] || []).map((b, idx) => {
                const sm = statusMeta(b.st);
                const dim = b.st === 'done' ? 'text-ink-500' : 'text-ink-900';
                const coverColor = CAT_COLOR[b.cat] || CAT_COLOR['其他'];
                return (
                  <div key={idx} onClick={() => onBookEdit?.(b)} className="glass-card p-3 hover:shadow-cardL transition cursor-pointer">
                    <div className="flex items-start gap-2.5">
                      <div className="w-9 h-12 rounded-md flex-shrink-0 opacity-85"
                        style={{ background: `linear-gradient(135deg, ${coverColor} 0%, ${coverColor}cc 100%)` }} />
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-semibold leading-snug ${dim}`}>{b.t}</div>
                        <div className="text-[11px] text-ink-400 mt-0.5 truncate">{b.author}</div>
                      </div>
                      <div className="text-xs font-bold tabular-nums flex-shrink-0" style={{color: g.col}}>{b.pct}%</div>
                    </div>
                    <div className="flex items-center gap-3 mt-2">
                      <div className="flex items-center gap-1.5 flex-1">
                        <span className="text-[11px] font-semibold text-ink-600">{b.cat}</span>
                        <span className="text-[11px] text-ink-300">·</span>
                        <span className="text-[11px] font-medium text-ink-400">{b.src}</span>
                      </div>
                      <div className="flex-1 min-w-[80px] max-w-[110px]"><ProgressBar value={b.pct} color={g.col} variant="dense" /></div>
                    </div>
                  </div>
                );
              })}
              <AddButton label="添加书籍" onClick={() => onBookAdd?.()} />
            </div>
          </div>
        ))}
      </div>
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
      <SectionHeader cat="ability" title="能力 · 里程碑系统" progress={abPct} />
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
      <SectionHeader cat="work" title="工作 · OKR 量化追踪" progress={totalPct} />
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
      <SectionHeader cat="life" title="生活 · 体验记录" progress={lifePct} />
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
  const bookOps = {
    add: (data) => { setBooks(prev => [...prev, { ...data, id: uid() }]); showToast('书籍已添加'); },
    update: (data) => { setBooks(prev => prev.map(b => b.id === data.id ? { ...b, ...data } : b)); showToast('书籍已更新'); },
    remove: (id) => { setBooks(prev => prev.filter(b => b.id !== id)); showToast('书籍已删除'); },
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
      {view === 'cognition' && <CognitionView books={books} onBookAdd={onBookAdd} onBookEdit={onBookEdit} />}
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
      /* ---- 精力表格 grid 模板：[习惯名] [目标 累计 完成率] [月份×12 删除] ---- */
      .habit-table {
        grid-template-columns: minmax(120px, 2.2fr) 68px 56px 52px repeat(12, minmax(24px, 1fr)) 28px;
        gap: 0 1px;
        align-items: center;
      }
      /* 分组间距：习惯名与统计区分组 */
      .habit-table > .grp-start {
        margin-right: 8px;
      }
      /* 分组间距：统计区与月份区分组 */
      .habit-table > .grp-end {
        padding-right: 8px;
      }
      /* 统计区内：累计与完成率之间加大间距 */
      .habit-table > .cum-gap {
        margin-right: 10px;
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
