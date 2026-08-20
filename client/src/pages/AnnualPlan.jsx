import { useState, useMemo } from 'react';

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
  { key: 'energy',    label: '精力', type: '习惯型',    weight: 0.15, color: '#34c759' },
  { key: 'cognition', label: '认知', type: '混合型',    weight: 0.20, color: '#007aff' },
  { key: 'ability',   label: '能力', type: '里程碑型',  weight: 0.25, color: '#d4a017' },
  { key: 'work',      label: '工作', type: 'OKR 量化型',weight: 0.25, color: '#ef4444' },
  { key: 'life',      label: '生活', type: '体验记录',  weight: 0.15, color: '#af52de' },
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
  { key:'relation', lb:'关系', color:'#ef4444', entries:[
    { t:'给妈妈打电话 30min', n:'聊天很开心，她分享了广场舞比赛', d:'7.28' },
    { t:'朋友老王生日送礼物', n:'送了喜欢的露营装备', d:'7.15' },
    { t:'和老婆周末野餐', n:'准备了她爱吃的草莓和可颂', d:'7.09' },
  ]},
  { key:'food', lb:'美食', color:'#f59e0b', entries:[
    { t:'学会番茄牛腩', n:'第一次做，老妈说味道可以', d:'7.22' },
    { t:'尝试手冲咖啡', n:'买了一套 Hario V60', d:'7.10' },
  ]},
  { key:'travel', lb:'旅游', color:'#22c55e', entries:[
    { t:'苏州两日游', n:'去了拙政园和留园', d:'6.22-6.23' },
    { t:'崇明岛露营', n:'和朋友们搭帐篷烧烤', d:'5.18' },
  ]},
  { key:'movie', lb:'电影', color:'#007aff', entries:[
    { t:'奥本海默', n:'3小时但不闷，诺兰神了', d:'7.01' },
    { t:'蜘蛛侠：纵横宇宙', n:'画风惊艳', d:'6.05' },
  ]},
  { key:'shop', lb:'购物', color:'#af52de', entries:[
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

/* ---------- 3. 视图数据计算 · Overview ---------- */
function useOverviewStats() {
  return useMemo(() => {
    const energyVal = HABITS.reduce((s, h) => s + pct(h.val, h.target), 0) / HABITS.length;
    const booksDone = BOOKS.filter(b => b.st === 'done').length;
    const cogVal = pct(booksDone, 12);
    const abilityVal = ABILITY.reduce((s, a) => {
      const mp = a.mstones.reduce((t, m) => t + m.pct, 0) / a.mstones.length;
      return s + mp;
    }, 0) / ABILITY.length;
    const wkMain = WORK[0];
    const wkVal = wkMain.krs.reduce((s, k) => s + pct(k.v, k.tgt), 0) / wkMain.krs.length;
    const lifeVal = LIFE.reduce((s, c) => s + (c.entries.length > 0 ? 50 : 0), 0) / LIFE.length;
    const vals = [energyVal, cogVal, abilityVal, wkVal, lifeVal];
    const weighted = Math.round(
      CATEGORIES.reduce((s, c, i) => s + vals[i] * c.weight, 0)
    );
    return { perCat: vals, weighted };
  }, []);
}

/* ---------- 4. 子组件 · 顶部 Nav 条 ---------- */
function NavBar() {
  return (
    <div className="flex items-center justify-between mb-5">
      <a href="#/" className="inline-flex items-center gap-2 text-sm font-medium text-ink-500 hover:text-accent-blue transition">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round"/></svg>
        返回工作台
      </a>
      <div className="inline-flex items-center gap-2 text-xs font-semibold text-ink-500">
        <span className="px-2 py-0.5 rounded-full bg-ink-100 text-ink-700">2025</span>
        <span>年度规划 · Draft</span>
      </div>
    </div>
  );
}

/* ---------- 5. 子组件 · Sidebar 导航 ---------- */
const SIDEBAR_ITEMS = [
  { key: 'overview',  label: '年度概览', cat: null,     icon: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>
  )},
  ...CATEGORIES.map(c => ({
    key: c.key, label: c.label, cat: c.key,
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        {c.key==='energy'    && (<><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></>)}
        {c.key==='cognition' && (<><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></>)}
        {c.key==='ability'   && (<><circle cx="12" cy="8" r="6"/><path d="M15.5 15a6 6 0 1 0-7 0M12 14v6M8 22h8"/></>)}
        {c.key==='work'      && (<><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></>)}
        {c.key==='life'      && (<><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></>)}
      </svg>
    ),
    catColor: c.color,
  })),
];

function Sidebar({ active, onChange, stats }) {
  const ring = stats.weighted;
  return (
    <aside className="w-[260px] flex-shrink-0 flex flex-col gap-3 sticky top-6 max-h-[calc(100vh-48px)] overflow-y-auto overflow-x-hidden pr-1">
      {/* Logo + 总进度环 */}
      <div className="bg-surface-card border border-ink-100 rounded-2xl shadow-card p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-brand-500 flex items-center justify-center text-white font-bold text-sm shadow-sm">
            26
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold text-ink-900 leading-tight">2025 年度规划</span>
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
            <span className="text-[11px] text-ink-500">加油，保持节奏 💪</span>
          </div>
        </div>
      </div>

      {/* 导航 */}
      <div className="bg-surface-card border border-ink-100 rounded-2xl shadow-card p-2 flex-1 flex flex-col">
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
        v1 · 工作台沙盒预览版
      </div>
    </aside>
  );
}

/* ---------- 6. 视图 · Overview ---------- */
function OverviewView({ onNav, stats }) {
  return (
    <div className="flex flex-col gap-5">
      {/* Hero */}
      <section className="bg-surface-card border border-ink-100 rounded-2xl shadow-card p-5 flex items-center gap-6">
        <div className="relative w-24 h-24 flex-shrink-0">
          <svg viewBox="0 0 36 36" className="w-24 h-24 -rotate-90">
            <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" className="text-ink-100" strokeWidth="3"/>
            <circle cx="18" cy="18" r="15" fill="none" stroke="#4b63f0" strokeWidth="3"
              strokeDasharray={`${(stats.weighted / 100) * 94.2} 94.2`} strokeLinecap="round"/>
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold text-ink-900 tabular-nums leading-none">{stats.weighted}</span>
            <span className="text-[10px] text-ink-500 mt-1.5">/ 100</span>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-lg font-bold text-ink-900 tracking-tight">你好，今年过得怎么样？</h2>
          </div>
          <p className="text-sm text-ink-500 leading-relaxed mb-3">
            已经完成 <span className="font-semibold text-ink-900">{stats.weighted}%</span> 的年度计划，
            进度尚可。5 大类目中，<span className="text-[#34c759] font-semibold">精力</span> 和 <span className="text-[#007aff] font-semibold">认知</span> 表现最好，
            <span className="text-[#d4a017] font-semibold"> 能力</span> 和 <span className="text-[#ef4444] font-semibold">工作</span> 还有较大提升空间。
          </p>
          <div className="grid grid-cols-3 gap-3 max-w-lg">
            <Stat label="完成目标" value="12" sub="个" />
            <Stat label="累计打卡" value="396" sub="次" />
            <Stat label="今年剩余" value="134" sub="天" />
          </div>
        </div>
      </section>

      {/* 5 类目卡片 */}
      <section className="grid grid-cols-5 gap-4">
        {CATEGORIES.map((c, i) => {
          const v = Math.round(stats.perCat[i]);
          return (
            <button key={c.key} onClick={() => onNav(c.key)}
              className="bg-surface-card border border-ink-100 rounded-2xl shadow-card p-4 text-left flex flex-col gap-3 hover:border-brand-400 hover:shadow-cardL transition-all group"
              style={{ borderTop: `3px solid ${c.color}` }}>
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold"
                  style={{ background: c.color }}>{c.label[0]}</div>
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-ink-900 leading-tight">{c.label}</span>
                  <span className="text-[10px] text-ink-500">{c.type}</span>
                </div>
                <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-ink-500 group-hover:text-ink-700">
                  {v}%
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-ink-100 overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${v}%`, background: c.color }} />
              </div>
              <CatSummary cat={c.key} />
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
        <span className="text-[10px] font-semibold text-ink-500 uppercase tracking-wide">{label}</span>
        <div className="flex items-baseline gap-0.5">
          <span className="text-lg font-bold text-ink-900 tabular-nums leading-tight">{value}</span>
          <span className="text-[11px] text-ink-500">{sub}</span>
        </div>
      </div>
    </div>
  );
}

function CatSummary({ cat }) {
  switch (cat) {
    case 'energy':
      return (
        <div className="flex flex-col gap-1.5 text-[12px] text-ink-500 pt-1 border-t border-ink-100">
          <SummaryRow lb="睡眠" v={142} t={230} />
          <SummaryRow lb="喝水" v={198} t={230} />
          <SummaryRow lb="运动" v={56}  t={120} />
        </div>
      );
    case 'cognition':
      return (
        <div className="flex flex-col gap-1.5 text-[12px] text-ink-500 pt-1 border-t border-ink-100">
          <div>年度目标 12 本 · 已读 <span className="font-semibold text-ink-900 tabular-nums">5</span> 本</div>
          <div className="text-[11px] text-ink-500">完成率 41.7% · 正在读 3 本</div>
        </div>
      );
    case 'ability':
      return (
        <div className="flex flex-col gap-1.5 text-[12px] text-ink-500 pt-1 border-t border-ink-100">
          <SummaryRow lb="英语口语"     v={2} t={5}  />
          <SummaryRow lb="结构化表达"   v={2} t={4}  />
          <SummaryRow lb="写作输出"     v={0} t={6}  />
        </div>
      );
    case 'work':
      return (
        <div className="flex flex-col gap-1.5 text-[12px] text-ink-500 pt-1 border-t border-ink-100">
          <div className="flex items-center justify-between"><span>主业完成</span><span className="font-semibold text-ink-900 tabular-nums">40%</span></div>
          <div className="flex items-center justify-between"><span>副业完成</span><span className="font-semibold text-ink-900 tabular-nums">16%</span></div>
          <div className="text-[11px] text-ink-500">薪资目标 ⏰ 截止 9/30</div>
        </div>
      );
    case 'life':
      return (
        <div className="grid grid-cols-5 gap-0.5 text-[11px] text-ink-500 pt-1 border-t border-ink-100">
          {[
            { lb: '关系', n: 3 }, { lb: '美食', n: 2 }, { lb: '旅游', n: 2 },
            { lb: '电影', n: 2 }, { lb: '购物', n: 2 },
          ].map(i => (
            <div key={i.lb} className="flex flex-col items-center gap-0.5 p-1 rounded-md bg-surface-soft">
              <span className="font-bold text-ink-900 tabular-nums">{i.n}</span>
              <span className="text-[9px] text-ink-500">{i.lb}</span>
            </div>
          ))}
        </div>
      );
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
function EnergyView() {
  const months = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
  return (
    <div className="flex flex-col gap-4">
      <SectionHeader cat="energy" title="精力 · 习惯打卡" sub="习惯型目标 · 用打卡矩阵追踪" />
      <div className="grid grid-cols-3 gap-4 mb-1">
        {HABITS.map(h => {
          const p = pct(h.val, h.target);
          return (
            <div key={h.key} className="bg-surface-card border border-ink-100 rounded-2xl shadow-card p-4 flex flex-col gap-3"
              style={{ borderTop: `3px solid ${catMeta('energy').color}` }}>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-accent-green/10 text-accent-green grid place-items-center text-sm font-bold">
                  {h.label[0]}
                </div>
                <div className="flex flex-col flex-1 min-w-0">
                  <span className="text-sm font-bold text-ink-900 truncate">{h.label}</span>
                  <span className="text-[11px] text-ink-500">目标 {h.target} {h.unit}</span>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-ink-900 tabular-nums leading-none">{p}<span className="text-xs font-semibold text-ink-500">%</span></div>
                </div>
              </div>
              <div className="h-1.5 rounded-full bg-ink-100 overflow-hidden">
                <div className="h-full rounded-full bg-accent-green" style={{ width: `${p}%` }} />
              </div>
              <div className="flex items-center justify-between text-[11px] text-ink-500 pt-1">
                <span>已完成 <b className="text-ink-900 tabular-nums">{h.val}</b> {h.unit}</span>
                <span>剩余 {h.target - h.val}</span>
              </div>
            </div>
          );
        })}
      </div>
      {/* 月度打卡矩阵 */}
      <div className="bg-surface-card border border-ink-100 rounded-2xl shadow-card overflow-hidden">
        <div className="px-4 py-3 border-b border-ink-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-ink-900">2025 累计打卡</h3>
          <span className="text-xs text-ink-500">单位：{HABITS[0].unit}</span>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[760px]">
            {/* 表头 */}
            <div className="grid habit-table px-4 py-2.5 bg-surface-soft border-b border-ink-100 text-[11px] font-semibold text-ink-500">
              <div>习惯名称</div>
              <div>累计</div>
              <div>目标</div>
              {months.slice(0, 7).map(m => <div key={m} className="text-center">{m}</div>)}
              <div className="text-right">完成率</div>
            </div>
            {/* 行 */}
            {HABITS.map(h => {
              const p = pct(h.val, h.target);
              return (
                <div key={h.key} className="grid habit-table px-4 py-3 border-b border-ink-100 last:border-b-0 items-center hover:bg-surface-soft transition-colors">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-accent-green/10 text-accent-green grid place-items-center text-xs font-bold flex-shrink-0">
                      {h.label[0]}
                    </div>
                    <span className="text-sm font-semibold text-ink-900 truncate">{h.label}</span>
                  </div>
                  <div className="font-bold tabular-nums text-ink-900">{h.val}</div>
                  <div className="tabular-nums text-ink-500">{h.target}</div>
                  {months.slice(0, 7).map((m, i) => {
                    const n = h.month?.[i + 1] || 0;
                    const maxT = [31, 28, 31, 30, 31, 30, 31][i];
                    const ratio = n / maxT;
                    const bg = ratio >= 0.9 ? 'bg-accent-green/80 text-white' : ratio >= 0.6 ? 'bg-accent-green/30 text-accent-green' : ratio >= 0.3 ? 'bg-accent-green/15 text-accent-green' : 'bg-ink-100 text-ink-500';
                    return (
                      <div key={m} className="flex justify-center">
                        <span className={`text-[11px] font-bold tabular-nums px-2 py-1 rounded-md min-w-[36px] text-center ${bg}`}>{n}</span>
                      </div>
                    );
                  })}
                  <div className="flex items-center justify-end gap-2">
                    <div className="w-16 h-1.5 rounded-full bg-ink-100 overflow-hidden flex-shrink-0">
                      <div className="h-full rounded-full bg-accent-green" style={{ width: `${p}%` }} />
                    </div>
                    <span className="text-xs font-bold tabular-nums text-ink-900 w-10 text-right">{p}%</span>
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
function CognitionView() {
  const groups = useMemo(() => {
    return {
      reading: BOOKS.filter(b => b.st === 'reading'),
      pending: BOOKS.filter(b => b.st === 'pending'),
      done:    BOOKS.filter(b => b.st === 'done'),
      paused:  BOOKS.filter(b => b.st === 'paused' || false),
    };
  }, []);
  const groupLabels = [
    { key: 'reading', lb: '阅读中', bg: 'bg-accent-blue', count: groups.reading.length, col: groups.reading.length > 0 ? undefined : 'opacity-50' },
    { key: 'pending', lb: '未开始', bg: 'bg-ink-500', count: groups.pending.length, col: groups.pending.length > 0 ? undefined : 'opacity-50' },
    { key: 'done',    lb: '已读完', bg: 'bg-accent-green', count: groups.done.length,    col: groups.done.length > 0 ? undefined : 'opacity-50' },
    { key: 'paused',  lb: '已暂停', bg: 'bg-accent-amber', count: 0, col: 'opacity-40' },
  ];
  return (
    <div className="flex flex-col gap-4">
      <SectionHeader cat="cognition" title="认知 · 书架系统" sub="混合型目标 · 阅读打卡 + OKR 结合" />
      {/* KR */}
      <div className="grid grid-cols-3 gap-4">
        {COG_KR.map(kr => {
          const p = pct(kr.val, kr.tgt);
          return (
            <div key={kr.lb} className="bg-surface-card border border-ink-100 rounded-2xl shadow-card p-4 flex flex-col gap-2.5"
              style={{ borderTop: `3px solid ${catMeta('cognition').color}` }}>
              <span className="text-[11px] font-bold text-accent-blue uppercase tracking-wide">{kr.lb.slice(0, 3)}</span>
              <span className="text-sm font-bold text-ink-900 leading-snug">{kr.lb.slice(4)}</span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-xl font-bold text-ink-900 tabular-nums leading-none">{kr.val}</span>
                <span className="text-[11px] text-ink-500">/ {kr.tgt} · {kr.sub}</span>
              </div>
              <div className="h-1 rounded-full bg-ink-100 overflow-hidden">
                <div className="h-full rounded-full bg-accent-blue" style={{ width: `${p}%` }} />
              </div>
              <div className="text-[11px] font-bold text-ink-500 tabular-nums">完成率 {p}%</div>
            </div>
          );
        })}
      </div>
      {/* 书架看板 */}
      <div className="grid grid-cols-4 gap-4">
        {groupLabels.map(g => (
          <div key={g.key} className={`flex flex-col gap-2.5 ${g.col}`}>
            <div className="flex items-center gap-2 px-0.5">
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full text-white ${g.bg}`}>{g.lb}</span>
              <span className="text-xs font-bold text-ink-700 tabular-nums">{g.count}</span>
              <button className="ml-auto w-7 h-7 rounded-lg grid place-items-center text-ink-400 hover:bg-ink-100 hover:text-ink-700 transition">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>
              </button>
            </div>
            <div className="flex flex-col gap-2 flex-1 min-h-[100px]">
              {(groups[g.key] || []).map((b, idx) => {
                const sm = statusMeta(b.st);
                const dim = b.st === 'done' ? 'text-ink-500' : 'text-ink-900';
                return (
                  <div key={idx} className="bg-surface-card border border-ink-100 rounded-xl p-3 hover:border-accent-blue/40 hover:shadow-card transition cursor-pointer">
                    <div className="flex items-start gap-2.5 mb-1.5">
                      <div className="w-9 h-12 rounded-md flex-shrink-0 grid place-items-center text-[11px] font-bold text-white"
                        style={{ background: sm.bar || '#9ca3af' }}>
                        {b.t[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-semibold leading-snug ${dim}`}>{b.t}</div>
                        <div className="text-[11px] text-ink-500 mt-0.5 truncate">{b.author}</div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-ink-100">
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-surface-soft text-ink-500">{b.cat}</span>
                        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-surface-soft text-ink-500">{b.src}</span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-1 max-w-[90px]">
                        <div className="flex-1 h-1 rounded-full bg-ink-100 overflow-hidden">
                          <div className={`h-full rounded-full ${sm.bar}`} style={{ width: `${b.pct}%` }} />
                        </div>
                        <span className="text-[10px] font-bold tabular-nums text-ink-700 w-7 text-right">{b.pct}%</span>
                      </div>
                    </div>
                  </div>
                );
              })}
              {/* 添加按钮 */}
              <button className="p-2.5 rounded-xl border border-dashed border-ink-200 text-ink-500 text-xs font-semibold inline-flex items-center justify-center gap-1 hover:bg-surface-soft hover:border-accent-blue/40 hover:text-accent-blue transition mt-auto">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" strokeLinecap="round"/></svg>
                添加书籍
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- 9. 视图 · 能力 ---------- */
function AbilityView() {
  return (
    <div className="flex flex-col gap-4">
      <SectionHeader cat="ability" title="能力 · 里程碑系统" sub="里程碑型目标 · 自评 + 阶段里程碑" />
      <div className="grid grid-cols-3 gap-4">
        {ABILITY.map(a => {
          const mDone = a.mstones.filter(m => m.st === 'done').length;
          const mTotal = a.mstones.length;
          const mPct = Math.round(a.mstones.reduce((s, m) => s + m.pct, 0) / mTotal);
          return (
            <div key={a.title} className="bg-surface-card border border-ink-100 rounded-2xl shadow-card p-5 flex flex-col gap-4"
              style={{ borderTop: `3px solid ${catMeta('ability').color}` }}>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-accent-amber/10 text-accent-amber grid place-items-center text-sm font-bold flex-shrink-0">
                  {a.title[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-base font-bold text-ink-900 leading-tight">{a.title}</h3>
                    <div className="flex flex-col items-end flex-shrink-0">
                      <div className="flex items-baseline gap-0.5">
                        <span className="text-xl font-bold tabular-nums text-ink-900 leading-none">{a.score}</span>
                        <span className="text-[10px] text-ink-500">/10</span>
                      </div>
                      <span className="text-[10px] text-ink-500 mt-0.5">当前自评</span>
                    </div>
                  </div>
                </div>
              </div>
              {/* 总进度条 (解决问题10 - 空态视觉重心) */}
              <div>
                <div className="flex items-center justify-between text-[11px] mb-1.5">
                  <span className="font-semibold text-ink-500">整体进度</span>
                  <span className="font-bold tabular-nums text-ink-700">{mPct}% · {mDone}/{mTotal}</span>
                </div>
                <div className="h-1.5 rounded-full bg-ink-100 overflow-hidden">
                  <div className="h-full rounded-full bg-accent-amber" style={{ width: `${mPct}%` }} />
                </div>
              </div>
              {/* 每日任务 */}
              <div className="p-3 rounded-xl bg-surface-soft border border-ink-100 flex items-start gap-2.5">
                <svg className="w-4 h-4 text-accent-amber flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2" strokeLinecap="round"/></svg>
                <div className="text-[12px] text-ink-700 leading-relaxed"><b className="font-semibold text-ink-900">每日任务</b> · {a.daily}</div>
              </div>
              {/* 里程碑列表 */}
              <div className="flex flex-col gap-2">
                <div className="text-[11px] font-bold uppercase tracking-wide text-ink-500 px-0.5">里程碑</div>
                {a.mstones.map((m, i) => {
                  const sm = statusMeta(m.st);
                  return (
                    <div key={i} className="p-3 rounded-xl border border-ink-100 flex items-center gap-3 hover:bg-surface-soft transition">
                      <div className={`w-7 h-7 rounded-lg grid place-items-center text-xs font-bold flex-shrink-0 ${sm.numBg}`}>{i + 1}</div>
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-semibold leading-tight ${m.st === 'done' ? 'text-ink-500 line-through' : 'text-ink-900'}`}>{m.lb}</div>
                        <div className="mt-1.5 h-1 rounded-full bg-ink-100 overflow-hidden">
                          <div className={`h-full rounded-full ${sm.bar}`} style={{ width: `${m.pct}%` }} />
                        </div>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${sm.tagCls} flex-shrink-0`}>{sm.lb} · {m.pct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- 10. 视图 · 工作 (OKR) ---------- */
function WorkView() {
  const main = WORK[0];
  const side = WORK[1];
  const calcPct = (o) => Math.round(o.krs.reduce((s, k) => s + pct(k.v, k.tgt), 0) / o.krs.length);
  const panelHtml = (o, label, color) => {
    const p = calcPct(o);
    const urgent = o.deadline.includes('9');
    return (
      <div key={label} className="bg-surface-card border border-ink-100 rounded-2xl shadow-card flex flex-col"
        style={{ borderTop: `3px solid ${color}` }}>
        {/* 头部 */}
        <div className="px-5 pt-5 pb-3">
          <div className="flex items-baseline gap-2 mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-ink-500">{label}</span>
            {urgent && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-accent-red/10 text-accent-red text-[10px] font-bold">
                ⏰ 截止 {o.deadline}
              </span>
            )}
            {!urgent && (
              <span className="text-[10px] font-semibold text-ink-500">截止 {o.deadline}</span>
            )}
            <div className="ml-auto flex items-baseline gap-0.5">
              <span className="text-[22px] font-bold tabular-nums text-ink-900 leading-none">{p}</span>
              <span className="text-xs font-bold text-ink-500">%</span>
            </div>
          </div>
          <h3 className="text-base font-bold text-ink-900 leading-snug">{o.title}</h3>
        </div>
        <div className="h-1 mx-5 bg-ink-100 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${p}%`, background: color }} />
        </div>
        {/* KR 列表 */}
        <div className="flex flex-col gap-2 p-4 pb-5">
          {o.krs.map((kr, i) => {
            const st = kr.st === 'done' ? 'done' : kr.st === 'doing' ? 'doing' : 'tg';
            const sm = statusMeta(st);
            const p2 = pct(kr.v, kr.tgt);
            return (
              <div key={i} className="grid grid-cols-[36px_1fr_auto_60px] items-center gap-3 p-2.5 rounded-xl hover:bg-surface-soft transition-colors">
                <div className={`w-9 h-9 rounded-xl grid place-items-center text-sm font-bold tabular-nums flex-shrink-0 ${sm.numBg}`}>
                  {i + 1}
                </div>
                <div className="min-w-0">
                  <div className={`text-sm font-semibold leading-tight ${st === 'done' ? 'text-ink-500 line-through' : 'text-ink-900'}`}>
                    {kr.t}
                  </div>
                  <div className="mt-1.5 h-1 rounded-full bg-ink-100 overflow-hidden">
                    <div className={`h-full rounded-full ${sm.bar}`} style={{ width: `${p2}%` }} />
                  </div>
                </div>
                <div className="text-sm font-bold tabular-nums text-ink-700 text-right whitespace-nowrap">
                  {kr.v}<span className="text-[11px] font-semibold text-ink-500">/{kr.tgt}</span>
                </div>
                <span className={`text-[10px] font-bold px-2 py-1 rounded-lg text-center ${sm.tagCls}`}>{sm.lb}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };
  return (
    <div className="flex flex-col gap-4">
      <SectionHeader cat="work" title="工作 · OKR 量化追踪" sub="量化型目标 · 主业/副业双栏看板" />
      <div className="grid grid-cols-[1.2fr_1fr] gap-4">
        {panelHtml(main, '主业', '#ef4444')}
        {panelHtml(side, '副业', '#ef4444')}
      </div>
    </div>
  );
}

/* ---------- 11. 视图 · 生活 ---------- */
function LifeView() {
  return (
    <div className="flex flex-col gap-4">
      <SectionHeader cat="life" title="生活 · 体验记录" sub="体验型目标 · 不追求完成率，追求幸福感" />
      <div className="grid grid-cols-5 gap-4 auto-rows-fr">
        {LIFE.map(c => (
          <div key={c.key} className="bg-surface-card border border-ink-100 rounded-2xl shadow-card p-4 flex flex-col min-h-0">
            {/* 头部 */}
            <div className="flex items-center gap-2 mb-3 pb-3 border-b border-ink-100 flex-shrink-0">
              <div className="w-8 h-8 rounded-lg grid place-items-center text-sm font-bold text-white" style={{ background: c.color }}>
                {c.lb[0]}
              </div>
              <span className="text-sm font-bold text-ink-900 flex-1">{c.lb}</span>
              <span className="inline-flex items-center gap-0.5 text-[11px] font-bold tabular-nums px-2 py-0.5 rounded-full"
                style={{ background: `${c.color}10`, color: c.color }}>
                {c.entries.length}<span className="font-semibold opacity-80">条</span>
              </span>
            </div>
            {/* 条目列表 */}
            <div className="flex flex-col gap-2 flex-1 overflow-y-auto pr-0.5">
              {c.entries.length === 0 && (
                <div className="text-xs text-ink-400 text-center py-6 italic">暂无记录 · 记下今天让你开心的小事吧 ✨</div>
              )}
              {c.entries.map((e, i) => (
                <div key={i} className="p-2.5 rounded-xl border border-ink-100 hover:border-surface hover:bg-surface-soft transition cursor-pointer">
                  <div className="text-xs font-semibold text-ink-900 leading-snug mb-1">{e.t}</div>
                  {e.n && <div className="text-[11px] text-ink-500 leading-relaxed mb-1.5">{e.n}</div>}
                  <div className="text-[10px] font-semibold text-ink-400">{e.d}</div>
                </div>
              ))}
              <button className="mt-auto p-2 rounded-lg border border-dashed border-ink-200 text-ink-400 text-[11px] font-semibold inline-flex items-center justify-center gap-1 hover:bg-surface-soft hover:border-surface hover:text-ink-500 transition flex-shrink-0">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" strokeLinecap="round"/></svg>
                添加
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- 12. 通用 · Section Header ---------- */
function SectionHeader({ cat, title, sub }) {
  const c = catMeta(cat);
  return (
    <div className="flex items-center gap-3 pb-3 border-b border-ink-100">
      <div className="w-1 h-5 rounded-full" style={{ background: c.color }} />
      <div className="flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-lg grid place-items-center text-white text-[11px] font-bold" style={{ background: c.color }}>
          {c.label[0]}
        </div>
        <div>
          <h2 className="text-[17px] font-bold text-ink-900 leading-none tracking-tight">{title}</h2>
          <p className="text-[11px] text-ink-500 mt-1">{sub}</p>
        </div>
      </div>
      <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-soft border border-ink-100 text-[10px] font-bold text-ink-500 uppercase tracking-wide">
        {c.type}
      </span>
    </div>
  );
}

/* ---------- 13. 入口组件 ---------- */
export default function AnnualPlan({ standalone = true }) {
  const [view, setView] = useState('overview');
  const stats = useOverviewStats();

  // 主内容：无论 standalone 与否都渲染
  const mainContent = (
    <main key={view} className="flex-1 min-w-0 animate-fade-in">
      {view === 'overview'  && <OverviewView  onNav={setView} stats={stats} />}
      {view === 'energy'    && <EnergyView   />}
      {view === 'cognition' && <CognitionView/>}
      {view === 'ability'   && <AbilityView  />}
      {view === 'work'      && <WorkView     />}
      {view === 'life'      && <LifeView     />}
    </main>
  );

  const styles = (
    <style>{`
      /* ---- P1-7: 精力表格 grid 抽离（避免 inline style 重复） ---- */
      .habit-table {
        grid-template-columns: minmax(200px, 1.3fr) 70px 70px repeat(7, minmax(56px, 1fr)) 120px;
        gap: 0 8px;
        align-items: center;
      }
      /* ---- P2-13: 视图淡入过渡 ---- */
      @keyframes fade-in-up {
        from { opacity: 0; transform: translateY(6px); }
        to   { opacity: 1; transform: none; }
      }
      .animate-fade-in { animation: fade-in-up 0.25s cubic-bezier(0.2, 0.8, 0.2, 1); }
    `}</style>
  );

  // 嵌入式顶部 Tab 导航（在工作台内使用，不需要内部大 Sidebar）
  const EMBED_NAV = [
    { key: 'overview',  label: '年度概览' },
    ...CATEGORIES.map(c => ({ key: c.key, label: c.label, color: c.color })),
  ];
  const embedTabs = (
    <div className="bg-surface-card border border-ink-100 rounded-2xl shadow-card p-2 mb-4 flex items-center gap-1 overflow-x-auto">
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
              'w-6 h-6 rounded-md grid place-items-center text-[11px] font-bold flex-shrink-0',
              on ? 'bg-white/15 text-white' : ''
            ].join(' ')}
              style={!on && item.color ? { background: `${item.color}12`, color: item.color } : !on ? { background: 'rgba(120,120,128,0.1)', color: '#8e8e93' } : undefined}>
              {item.label[0]}
            </span>
            <span>{item.label}</span>
            {pctVal !== null && (
              <span className={[
                'text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-md',
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
    </div>
  );
}
