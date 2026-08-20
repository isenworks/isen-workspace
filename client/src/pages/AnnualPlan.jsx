import { useState, useMemo, useEffect, useCallback } from 'react';
import { API } from '../api/client.js';
import { inferGrowthType } from '../utils/uiConstants.js';
import Modal from '../components/Modal.jsx';
import HabitForm from '../components/forms/HabitForm.jsx';
import BookForm from '../components/forms/BookForm.jsx';
import MilestoneForm from '../components/forms/MilestoneForm.jsx';
import KrForm from '../components/forms/KrForm.jsx';
import EntryForm from '../components/forms/EntryForm.jsx';

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
  { key: 'ability',   label: '能力', type: '里程碑型',  weight: 0.25, color: '#f59e0b' }, /* accent-amber */
  { key: 'work',      label: '工作', type: 'OKR 量化型',weight: 0.25, color: '#ef4444' }, /* accent-red   */
  { key: 'life',      label: '生活', type: '体验记录',  weight: 0.15, color: '#f9a8a8' }, /* accent-pink  */
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
  { key:'relation', lb:'关系', color:'#ef4444', entries:[ /* accent-red */
    { t:'给妈妈打电话 30min', n:'聊天很开心，她分享了广场舞比赛', d:'7.28' },
    { t:'朋友老王生日送礼物', n:'送了喜欢的露营装备', d:'7.15' },
    { t:'和老婆周末野餐', n:'准备了她爱吃的草莓和可颂', d:'7.09' },
  ]},
  { key:'food', lb:'美食', color:'#f59e0b', entries:[ /* accent-amber */
    { t:'学会番茄牛腩', n:'第一次做，老妈说味道可以', d:'7.22' },
    { t:'尝试手冲咖啡', n:'买了一套 Hario V60', d:'7.10' },
  ]},
  { key:'travel', lb:'旅游', color:'#22c55e', entries:[ /* accent-green */
    { t:'苏州两日游', n:'去了拙政园和留园', d:'6.22-6.23' },
    { t:'崇明岛露营', n:'和朋友们搭帐篷烧烤', d:'5.18' },
  ]},
  { key:'movie', lb:'电影', color:'#4b63f0', entries:[ /* accent-blue */
    { t:'奥本海默', n:'3小时但不闷，诺兰神了', d:'7.01' },
    { t:'蜘蛛侠：纵横宇宙', n:'画风惊艳', d:'6.05' },
  ]},
  { key:'shop', lb:'购物', color:'#f9a8a8', entries:[ /* accent-pink */
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

function ProgressBar({ value, color, height }) {
  // P1-4: 全局统一 4px 高度，状态颜色语义化
  const h = height || 'h-1';
  return (
    <div className={`${h} rounded-full bg-ink-100 overflow-hidden`}>
      <div className="h-full rounded-full transition-all" style={{ width: `${value}%`, background: color || '#4b63f0' }} />
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
function NavBar() {
  const year = new Date().getFullYear();
  return (
    <div className="flex items-center justify-between mb-5">
      <a href="#/" className="inline-flex items-center gap-2 text-sm font-medium text-ink-500 hover:text-accent-blue transition">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round"/></svg>
        返回工作台
      </a>
      <div className="inline-flex items-center gap-2 text-xs font-semibold text-ink-500">
        <span className="px-2 py-0.5 rounded-full bg-ink-100 text-ink-700">{year}</span>
        <span>年度规划</span>
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
    <aside className="w-[260px] flex-shrink-0 flex flex-col gap-3 sticky top-6 max-h-[calc(100vh-48px)] overflow-y-auto overflow-x-hidden pr-1">
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

/* ---------- 6. 视图 · Overview ---------- */
function OverviewView({ onNav, stats, realHabits, books, abilities, workGoals, lifeData }) {
  const year = new Date().getFullYear();

  // 动态计算 Hero 统计数据
  const habits = realHabits || HABITS;
  const totalCheckins = habits.reduce((s, h) => s + h.val, 0);
  const dynBooks = books || BOOKS;
  const booksDone = dynBooks.filter(b => b.st === 'done').length;
  const dynAbilities = abilities || ABILITY;
  const abilityDoneMs = dynAbilities.reduce((s, a) => s + a.mstones.filter(m => m.st === 'done').length, 0);
  const dynWork = workGoals || WORK;
  const workDoneKrs = dynWork.reduce((s, o) => s + o.krs.filter(k => k.st === 'done').length, 0);
  const doneGoals = booksDone + abilityDoneMs + workDoneKrs;

  // 今年剩余天数
  const now = new Date();
  const endOfYear = new Date(year, 11, 31);
  const daysLeft = Math.max(0, Math.ceil((endOfYear - now) / 86400000));

  // 最优/最弱类目
  const perCat = stats.perCat;
  let bestIdx = 0, worstIdx = 0;
  perCat.forEach((v, i) => { if (v > perCat[bestIdx]) bestIdx = i; if (v < perCat[worstIdx]) worstIdx = i; });

  return (
    <div className="flex flex-col gap-5">
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
          <h2 className="text-base font-bold text-ink-900 tracking-tight mb-2">{year} 年度规划总览</h2>
          {/* 最优/最弱结构化pill */}
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
            已完成 <span className="font-semibold text-ink-900">{stats.weighted}%</span> 的年度计划
          </p>
          {/* 3 Stat 去卡片 → 纯文字块 */}
          <div className="grid grid-cols-3 gap-0 max-w-xl">
            {[
              { label: '完成目标', v: doneGoals, u: '个', color: '#4b63f0' },
              { label: '累计打卡', v: totalCheckins, u: '次', color: '#22c55e' },
              { label: '今年剩余', v: daysLeft, u: '天', color: '#f59e0b' },
            ].map(s => (
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
      <section className="grid grid-cols-5 gap-4 annual-cat-grid">
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
function EnergyView({ realHabits, loading, onAction }) {
  const months = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
  const [half, setHalf] = useState('H1'); // H1: 1-6月, H2: 7-12月
  const habits = realHabits || HABITS;

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

  const monthIndices = half === 'H1' ? [1,2,3,4,5,6] : [7,8,9,10,11,12];
  const monthLabels = monthIndices.map(i => months[i-1]);
  const monthMaxDays = [31,28,31,30,31,30,31,31,30,31,30,31];

  // 计算精力模块完成率
  const energyPct = habits.length > 0
    ? Math.round(habits.reduce((s, h) => s + pct(h.val, h.target), 0) / habits.length)
    : 0;

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
        <div className="px-4 py-3 border-b border-ink-100 flex flex-wrap items-center gap-3 justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {habits.map(h => (
              <span key={h.key} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold"
                style={{ background: h.val >= h.target ? 'rgba(34,197,94,0.12)' : 'rgba(75,99,240,0.10)', color: h.val >= h.target ? '#22c55e' : '#4b63f0' }}>
                {h.label.replace(/^\S+\s?/, '')} {h.val}/{h.target}
                <span className="opacity-70">{h.unit}</span>
              </span>
            ))}
          </div>
          <div className="inline-flex p-0.5 rounded-lg bg-ink-100">
            {[
              { k: 'H1', lb: '上半年 1-6 月' },
              { k: 'H2', lb: '下半年 7-12 月' },
            ].map(t => (
              <button key={t.k} onClick={() => setHalf(t.k)}
                className={[
                  'px-3 py-1 rounded-md text-xs font-bold transition-all',
                  half === t.k ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-700'
                ].join(' ')}>
                {t.lb}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[760px]">
            {/* T2: 列排版 习惯名 → 目标 → 累计 → 月份 → 完成率 */}
            <div className="grid habit-table px-4 py-2.5 bg-surface-soft border-b border-ink-100 text-xs font-semibold text-ink-500">
              <div>习惯名称</div>
              <div>目标</div>
              <div>累计</div>
              {monthLabels.map(m => <div key={m} className="text-center">{m}</div>)}
              <div className="text-right">完成率</div>
              <div className="w-6"></div>
            </div>
            {habits.map(h => {
              const p = pct(h.val, h.target);
              const done = p >= 100;
              const barColor = done ? '#22c55e' : p >= 50 ? '#4b63f0' : '#f59e0b';
              return (
                <div key={h.key} className="grid habit-table px-4 py-3 border-b border-ink-100 last:border-b-0 items-center hover:bg-surface-soft transition-colors group">
                  <div className="flex items-center gap-2.5 min-w-0 cursor-pointer" onClick={() => onAction?.('editHabit', h)}>
                    <span className="text-sm font-semibold text-ink-900 truncate">{h.label}</span>
                  </div>
                  <div className="tabular-nums text-ink-500 font-medium">{h.target}<span className="text-[10px] text-ink-400 ml-0.5">{h.unit}</span></div>
                  <div className="font-bold tabular-nums text-ink-900">{h.val}</div>
                  {monthIndices.map((monthIdx, arrayIdx) => {
                    const n = h.month?.[monthIdx] || 0;
                    const maxT = monthMaxDays[monthIdx - 1];
                    const ratio = n / maxT;
                    const passed = ratio >= 0.8;
                    return (
                      <div key={monthIdx} className="flex justify-center">
                        <span className={[
                          'text-xs font-bold tabular-nums px-2 py-1 rounded-md min-w-[36px] text-center transition-colors',
                          passed ? 'bg-accent-green text-white' : 'bg-ink-100 text-ink-500'
                        ].join(' ')}>{n}</span>
                      </div>
                    );
                  })}
                  {/* 完成率：进度条+% 合并，颜色根据完成度渐变 */}
                  <div className="flex items-center justify-end gap-2 cursor-pointer" onClick={() => onAction?.('editHabit', h)}>
                    <div className="w-20"><ProgressBar value={p} color={barColor} /></div>
                    <span className="text-xs font-bold tabular-nums w-9 text-right" style={{color: barColor}}>{p}%</span>
                  </div>
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
      <div className="grid grid-cols-3 gap-4">
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
                        <div className="text-xs text-ink-500 mt-0.5 truncate">{b.author}</div>
                      </div>
                      <div className="text-xs font-bold tabular-nums flex-shrink-0" style={{color: g.col}}>{b.pct}%</div>
                    </div>
                    <div className="flex items-center gap-3 mt-2">
                      <div className="flex items-center gap-1.5 flex-1">
                        <span className="text-xs font-semibold text-ink-600">{b.cat}</span>
                        <span className="text-xs text-ink-300">·</span>
                        <span className="text-xs font-medium text-ink-500">{b.src}</span>
                      </div>
                      <div className="flex-1 min-w-[80px] max-w-[110px]"><ProgressBar value={b.pct} color={g.col} /></div>
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
function AbilityView({ abilities, onMsAdd, onMsEdit }) {
  const dynAb = abilities || ABILITY;
  const scoreColor = (s) => {
    if (s >= 9) return '#22c55e';
    if (s >= 6) return '#f59e0b';
    return '#ef4444';
  };
  // 计算能力模块完成率
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
      <div className="grid grid-cols-3 gap-4 annual-ability-grid">
        {dynAb.map((a, ai) => {
          const mDone = a.mstones.filter(m => m.st === 'done').length;
          const mTotal = a.mstones.length;
          const mPct = Math.round(a.mstones.reduce((s, m) => s + m.pct, 0) / mTotal);
          const sc = scoreColor(a.score);
          return (
            <div key={a.title} className="glass-card p-5 flex flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-bold text-ink-900 leading-tight mb-1">{a.title}</h3>
                  {/* 每日任务 - 纯文字排版 */}
                  <div className="text-xs text-ink-500 leading-snug">
                    <span className="font-semibold text-ink-700">每日：</span>{a.daily}
                  </div>
                </div>
                {/* 自评 - 梯度染色 */}
                <div className="flex flex-col items-end flex-shrink-0">
                  <div className="flex items-baseline gap-0.5">
                    <span className="text-xl font-bold tabular-nums leading-none" style={{color: sc}}>{a.score}</span>
                    <span className="text-xs" style={{color: sc, opacity:.7}}>/10</span>
                  </div>
                  <span className="text-xs font-semibold mt-0.5" style={{color: sc, opacity:.9}}>
                    {a.score >= 9 ? '优秀' : a.score >= 6 ? '进行中' : '待启动'}
                  </span>
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
              <div className="flex flex-col gap-2">
                <div className="text-xs font-bold uppercase tracking-wide text-ink-500 px-0.5">里程碑</div>
                {a.mstones.map((m, i) => {
                  const sm = statusMeta(m.st);
                  const msCol = m.st === 'done' ? '#22c55e' : m.st === 'doing' ? '#f59e0b' : '#8e8e93';
                  return (
                    <div key={i} onClick={() => onMsEdit?.(ai, i, m)} className="p-3 rounded-xl border border-ink-100 flex items-center gap-3 hover:bg-surface-soft transition cursor-pointer">
                      <div className="w-7 h-7 rounded-lg grid place-items-center text-xs font-bold tabular-nums flex-shrink-0 text-ink-700">{i + 1}</div>
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-semibold leading-tight ${m.st === 'done' ? 'text-ink-500 line-through' : 'text-ink-900'}`}>{m.lb}</div>
                        <div className="mt-1.5"><ProgressBar value={m.pct} color={msCol} /></div>
                      </div>
                      <span className="text-xs font-bold tabular-nums flex-shrink-0" style={{color: msCol}}>{sm.lb} · {m.pct}%</span>
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
  const calcPct = (o) => Math.round(o.krs.reduce((s, k) => s + pct(k.v, k.tgt), 0) / o.krs.length);

  // P1-2: 截止按剩余天数判定
  const daysLeft = (deadlineStr) => {
    try {
      const today = new Date();
      today.setHours(0,0,0,0);
      const year = today.getFullYear();
      const [mm, dd] = deadlineStr.replace(/月|日/g, '.').split('.').filter(Boolean).map(Number);
      const target = new Date(year, mm - 1, dd);
      if (target < today) target.setFullYear(year + 1);
      return Math.ceil((target - today) / 86400000);
    } catch { return 999; }
  };

  const totalPct = useMemo(() => {
    if (!main) return 0;
    const allKrs = [...(main?.krs || []), ...(side?.krs || [])];
    return allKrs.length ? Math.round(allKrs.reduce((s, k) => s + pct(k.v, k.tgt), 0) / allKrs.length) : 0;
  }, [main, side]);

  const panelHtml = (o, label, color) => {
    const p = calcPct(o);
    const dl = daysLeft(o.deadline);
    const urgent = dl <= 30;
    const overdue = dl < 0;
    return (
      <div key={label} className="glass-card flex flex-col p-5 gap-4">
        {/* 头部 */}
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
        {/* KR 列表 - P1-2: KR编号裸数字+状态仅颜色，padding对齐 */}
        <div className="flex flex-col gap-1.5">
          {o.krs.map((kr, i) => {
            const st = kr.st === 'done' ? 'done' : kr.st === 'doing' ? 'doing' : 'tg';
            const sm = statusMeta(st);
            const p2 = pct(kr.v, kr.tgt);
            // 状态仅用颜色点区分
            const statusDot = st === 'done' ? '#22c55e' : st === 'doing' ? '#4b63f0' : '#c7c7cc';
            return (
              <div key={i} onClick={() => onKrEdit?.(o._workIdx, i, kr)} className="grid grid-cols-[28px_1fr_auto] items-center gap-3 py-2.5 px-1 rounded-xl hover:bg-surface-soft transition-colors cursor-pointer">
                {/* KR编号 - 裸数字，无背景 */}
                <div className="text-xs font-bold tabular-nums text-ink-500 text-center flex-shrink-0">
                  {i + 1}
                </div>
                <div className="min-w-0">
                  <div className={`text-sm font-semibold leading-tight ${st === 'done' ? 'text-ink-500 line-through' : 'text-ink-900'}`}>
                    {kr.t}
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <div className="flex-1 min-w-0"><ProgressBar value={p2} color={statusDot} /></div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs font-bold tabular-nums text-ink-700 whitespace-nowrap">
                    {kr.v}<span className="text-[11px] font-semibold text-ink-500">/{kr.tgt}</span>
                  </span>
                  {/* 状态仅用颜色点 */}
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{background: statusDot}} />
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
      <div className="grid grid-cols-5 gap-4 annual-life-grid">
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
                <div className="text-xs text-ink-400 text-center py-6 italic">暂无记录</div>
              )}
              {c.entries.map((e, i) => (
                <div key={i} onClick={() => onEntryEdit?.(ci, i, e)} className="p-2.5 rounded-xl border border-ink-100 hover:border-surface hover:bg-surface-soft transition cursor-pointer">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-xs font-semibold text-ink-900 leading-snug flex-1 min-w-0">{e.t}</div>
                    <div className="text-[10px] font-semibold text-ink-400 tabular-nums flex-shrink-0">{e.d}</div>
                  </div>
                  {e.n && <div className="text-xs text-ink-500 leading-relaxed mt-1">{e.n}</div>}
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
  const { realHabits, loading: energyLoading, refresh: refreshEnergy } = useEnergyHabits();

  // 可变数据（localStorage 持久化）
  const [books, setBooks] = usePersistentState('annual_books', () => BOOKS.map(b => ({ ...b, id: crypto.randomUUID() })));
  const [abilities, setAbilities] = usePersistentState('annual_abilities', () => ABILITY.map(a => ({ ...a, id: crypto.randomUUID(), mstones: a.mstones.map(m => ({ ...m, id: crypto.randomUUID() })) })));
  const [workGoals, setWorkGoals] = usePersistentState('annual_work', () => WORK.map(o => ({ ...o, krs: o.krs.map(k => ({ ...k, id: crypto.randomUUID(), st: k.st === 'tg' ? 'pending' : k.st })) })));
  const [lifeData, setLifeData] = usePersistentState('annual_life', () => LIFE.map(c => ({ ...c, entries: c.entries.map(e => ({ ...e, id: crypto.randomUUID() })) })));

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }, []);

  // ---- CRUD 操作 ----
  // 认知·书籍
  const bookOps = {
    add: (data) => { setBooks(prev => [...prev, { ...data, id: crypto.randomUUID() }]); showToast('书籍已添加'); },
    update: (data) => { setBooks(prev => prev.map(b => b.id === data.id ? { ...b, ...data } : b)); showToast('书籍已更新'); },
    remove: (id) => { setBooks(prev => prev.filter(b => b.id !== id)); showToast('书籍已删除'); },
  };
  // 能力·里程碑
  const msOps = {
    add: (data) => {
      setAbilities(prev => prev.map((a, i) => i === data.abilityIdx ? { ...a, mstones: [...a.mstones, { ...data, id: crypto.randomUUID() }] } : a));
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
      setWorkGoals(prev => prev.map((o, i) => i === data.workIdx ? { ...o, krs: [...o.krs, { ...data, id: crypto.randomUUID() }] } : o));
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
      setLifeData(prev => prev.map((c, i) => i === data.lifeKey ? { ...c, entries: [...c.entries, { ...data, id: crypto.randomUUID() }] } : c));
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
      // 删除习惯：先二次确认（Toast 交互式确认）
      const ok = window.confirm(`确定删除习惯「${habit.name}」吗？\n年度统计会一并删除，此操作不可撤销。`);
      if (!ok) return;
      try {
        await API.habits.remove(habit.id);
        showToast(`已删除习惯「${habit.name}」`);
        refreshEnergy();
      } catch (e) {
        showToast('删除失败：' + e.message);
      }
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

  const stats = useOverviewStats(realHabits, books, abilities, workGoals, lifeData);

  // 主内容
  const mainContent = (
    <main key={view} className="flex-1 min-w-0 animate-fade-in">
      {view === 'overview'  && <OverviewView  onNav={setView} stats={stats} realHabits={realHabits} books={books} abilities={abilities} workGoals={workGoals} lifeData={lifeData} />}
      {view === 'energy'    && <EnergyView   realHabits={realHabits} loading={energyLoading} onAction={handleEnergyAction} />}
      {view === 'cognition' && <CognitionView books={books} onBookAdd={onBookAdd} onBookEdit={onBookEdit} />}
      {view === 'ability'   && <AbilityView  abilities={abilities} onMsAdd={onMsAdd} onMsEdit={onMsEdit} />}
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

  const styles = (
    <style>{`
      /* ---- 精力表格 grid 模板：[习惯名 目标 累计 (月份×7) 完成率 删除] ---- */
      .habit-table {
        grid-template-columns: minmax(200px, 1.3fr) 70px 70px repeat(7, minmax(56px, 1fr)) 140px 30px;
        gap: 0 8px;
        align-items: center;
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
      </div>
    );
  }

  // 独立模式（沙盒 #annual 预览）：完整外壳 + 内部 Sidebar + 返回工作台
  return (
    <div className="min-h-screen bg-surface-base px-6 py-6">
      <div className="max-w-[1400px] mx-auto">
        <NavBar />
        <div className="flex gap-5 items-start">
          <Sidebar active={view} onChange={setView} stats={stats} />
          {mainContent}
        </div>
      </div>
      {styles}
      {toastEl}
      {modalEl}
    </div>
  );
}
