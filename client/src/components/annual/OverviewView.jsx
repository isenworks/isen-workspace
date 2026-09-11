import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { ABILITY, BOOKS, CATEGORIES, COG_KRS, HABITS, LIFE, WORK } from './data.js';
import { pct } from './utils.js';
import { CategoryIcon, EditableTitle, InlineEdit } from './ui.jsx';
import { usePersistentState } from './hooks.js';
import { createPortal } from 'react-dom'
import DualMarkerBar from '../DualMarkerBar.jsx'

export const Sparkline = ({ data, labels, color = '#34C759', width = 260, height = 60,
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
export function OverviewView({ onNav, stats, realHabits, books, abilities, workGoals, lifeData, finData }) {
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

  /* 财务：攒钱目标 + 资产负债（来自 finData.bootstrap，与财务页共享同一份数据） */
  const finGoals = (finData?.goals) || [];
  const finNw = finData?.netWorth || { assets: 0, liabilities: 0, netWorth: 0 };
  /* 金额紧凑缩写：<1万 原样(去零)，≥1万 转「x.x万」，保证 SubRow 56px 数值列不溢出 */
  const finShort = (v) => {
    const n = Number(v) || 0;
    if (n >= 10000) {
      const w = n / 10000;
      return `${w % 1 === 0 ? w.toFixed(0) : w.toFixed(1)}万`;
    }
    return n.toLocaleString('zh-CN', { maximumFractionDigits: 0 });
  };
  /* 资产/负债总额：从账户余额正负拆分（与财务页资产负债卡口径一致） */
  const finAccs = (finData?.accounts) || [];
  const finAssetTotal = finAccs.reduce((s, a) => s + Math.max(0, Number(a.balance) || 0), 0);
  const finLiabTotal = finAccs.reduce((s, a) => s + Math.max(0, -Number(a.balance) || 0), 0);

  /* 折叠状态 */
  const [collapsed, setCollapsed] = useState({ energy: false, cognition: false, ability: false, work: false, finance: false, life: false });
  const toggle = (k) => setCollapsed(s => ({ ...s, [k]: !s[k] }));

  /* 年度概览标题：右键可改（InlineEdit contextmenu + usePersistentState 持久化，清空回落默认） */
  const [ovTitle, setOvTitle] = usePersistentState('annual_overview_title', () => '');

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
          <EditableTitle value={ovTitle} onChange={setOvTitle} fallback={`${year}年 · 模块概览`}
            className="text-[16px] font-bold text-ink-900 leading-none" inputClassName="text-[16px] font-bold text-ink-900" />
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

          {/* 财务：攒钱目标为主体（目标量/已存量/截止日），底部脚注给资产负债锚点 */}
          <div className={CARD_PAD}>
            <CardHead c={CATEGORIES[4]} pctVal={perCat[4]} />
            <CardBody show={!collapsed.finance}>
              {finGoals.length === 0 ? (
                <div className="text-[12.5px] text-[#8E8E93] py-4 text-center">还没有攒钱目标，去财务页创建</div>
              ) : finGoals.map(g => {
                const target = Number(g.target_amount) || 0;
                const current = Number(g.current_amount) || 0;
                const gp = target > 0 ? Math.min(100, (current / target) * 100) : 0;
                const isDone = g.status === 'done' || (target > 0 && current >= target);
                const dl = String(g.deadline || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
                const dlShort = dl ? `${Number(dl[2])}.${Number(dl[3])}止` : '';
                return (
                  <SubRow key={g.id}
                    name={dlShort ? `${g.name}  ${dlShort}` : g.name}
                    pct={gp}
                    val={`${finShort(current)}/${finShort(target)}`}
                    color="var(--m-finance)"
                    done={isDone ? true : undefined} />
                );
              })}
              {/* 资产负债脚注：与知力卡「已读 X/Y · 待读 Z」同位，给资产/负债各一个锚点值 */}
              <div className="text-[10.5px] text-[#8E8E93] leading-none py-1 truncate">
                资产 <b style={{ color: '#48484A' }}>¥{finShort(finAssetTotal)}</b> · 负债 <b style={{ color: '#48484A' }}>¥{finShort(finLiabTotal)}</b>
              </div>
            </CardBody>
          </div>

          {/* 生活 */}
          <div className={CARD_PAD}>
            <CardHead c={CATEGORIES[5]} pctVal={perCat[5]} />
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
