import { useLayoutEffect, useRef, useState, useEffect } from 'react';

/* 双标记进度条：实际完成率 vs 计划完成率（时间锚点）
 * 设计要点（与终版定稿一致）：
 * 1. 所有标记（气泡/数字/标签/隔断）都是 .track 的子元素 —— 同一参照系，保证垂直对齐
 * 2. 白色隔断 6×12px 直角，纯白无透明；标签锚定隔断线中心，跟随移动
 * 3. 实际 = 主题色气泡（内嵌无缝三角）；计划 = 纯数字
 * 4. 三段轨道：已完成(实心) / 差距(45°斜纹，超前=绿色实心) / 剩余(浅底)
 * 5. 边界钳制 + 近距合并（"16.7% / 66.7%" 单气泡）+ 触屏 tap tooltip
 */

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const fmt = (x) => {
  const n = Number(x) || 0;
  return Math.round(n * 10) % 10 === 0 ? String(Math.round(n)) : String(Math.round(n * 10) / 10);
};

function hexToRgba(hex, a) {
  let h = String(hex || '#007AFF').replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) return `rgba(0,122,255,${a})`;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

export default function DualMarkerBar({
  actual = 0,
  plan = 0,
  color = '#007AFF',
  green = '#34C759',
  red = '#FF3B30',
  caption = '', // 可选：独立标题行，不传或空字符串则不渲染该行
  actualTip = '真实完成的进度，基于实际完成事项/所有计划事项',
  planTip = '按预设周期时间，理论上应当达成的进度',
  actualDetail = '',
  planDetail = '',
  deltaContext = '',
  mergeDist = 80,
  showBadge = true,
}) {
  const trackRef = useRef(null);
  const bubRef = useRef(null);
  const pnRef = useRef(null);
  const lARef = useRef(null);
  const lPRef = useRef(null);
  const lMRef = useRef(null);
  const [W, setW] = useState(0);
  const [geo, setGeo] = useState(null);
  const [tip, setTip] = useState(null); // 'a' | 'p' | 'm' | null

  // 轨道宽度监听：容器伸缩时重算钳制位置
  useLayoutEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const update = () => setW(el.clientWidth);
    update();
    let ro = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(update);
      ro.observe(el);
    }
    return () => { if (ro) ro.disconnect(); };
  }, []);

  // side gutter：轨道主体左右各缩 14px 留视觉呼吸边（Apple Fitness / Linear 惯例）
  const GUTTER = 14;

  // 布局计算（专业语义分层）：
  //   ① 数据锚点（分隔点 dA/cA, dP/cP）= 忠实映射百分比，100% = TW 端点，0% = 左端点
  //   ② 浮动装饰（气泡 bubL）= 物理宽度受限单独 clamp，尾尖水平修正 tailOffset 指回分隔点
  //   ③ 标签（lAL/lPL）= 分隔点的名字，跟随分隔点，不跟随气泡身体
  useLayoutEffect(() => {
    if (!W) { setGeo(null); return; }
    const TW = Math.max(W - GUTTER * 2, 40); // 轨道可视主体宽度
    const a = clamp(Number(actual) || 0, 0, 100);
    const p = clamp(Number(plan) || 0, 0, 100);
    const ax = (a / 100) * TW;           // 实际端点（TW 系，忠实映射，0..TW 两端可达）
    const px = (p / 100) * TW;           // 计划端点（TW 系，忠实映射）
    const cA = clamp(ax, 3, TW - 3); // 分隔点中心（端点留 3px 安全距离，保证胶囊圆角始终可见 1px，不被切平）
    const cP = clamp(px, 3, TW - 3);
    const merged = Math.abs(cA - cP) < mergeDist;
    const mid = (cA + cP) / 2;
    const bw = (bubRef.current && bubRef.current.offsetWidth) || 40;
    const nw = (pnRef.current && pnRef.current.offsetWidth) || 34;
    const law = (lARef.current && lARef.current.offsetWidth) || 26;
    const lpw = (lPRef.current && lPRef.current.offsetWidth) || 26;
    const lmw = (lMRef.current && lMRef.current.offsetWidth) || 62;

    // 分隔点 → 外层坐标（加 GUTTER）
    const cAOuter = cA + GUTTER;
    const cPUOuter = cP + GUTTER;
    const midOuter = mid + GUTTER;

    // 气泡：允许完全进入 GUTTER 区贴边（外层系 clamp bw/2..W-bw/2）
    const effCA = merged
      ? clamp(midOuter, bw / 2, W - bw / 2)
      : clamp(cAOuter, bw / 2, W - bw / 2);
    const effCP = clamp(cPUOuter, nw / 2, W - nw / 2);

    // 尾尖水平修正量：气泡身体被 clamp 偏移后，尾尖三角向左/右移动指回真实分隔点
    const tailOffsetA = (merged ? midOuter : cAOuter) - effCA;
    const planLabelOffset = cPUOuter - effCP;
    const planNumOuter = merged ? 0 : effCP;

    // dA/dP：内层容器 left（TW 系），忠实百分比
    const dA0 = cA - 2.5;
    const dP0 = cP - 2.5;

    setGeo({
      a, p, merged,
      segW: Math.min(a, p),
      gapW: Math.abs(a - p),
      ahead: a >= p,
      dA: dA0,
      dP: dP0,
      hideP: Math.abs(ax - px) < 8,
      bubL: effCA,
      pnL: planNumOuter,
      // 尾尖三角的 X 修正（像素，可正可负）
      tailOffsetA,
      tailOffsetP: planLabelOffset,
      // 标签跟随真实分隔点（外层系），必要时标签自身宽度钳制
      lAL: clamp(cAOuter, GUTTER + law / 2, GUTTER + TW - law / 2),
      lPL: clamp(cPUOuter, GUTTER + lpw / 2, GUTTER + TW - lpw / 2),
      lML: clamp(midOuter, GUTTER + lmw / 2, GUTTER + TW - lmw / 2),
      thin: (Math.abs(a - p) / 100) * TW < 4,
    });
  }, [W, actual, plan, mergeDist, GUTTER]);

  // 触屏：点外部关闭 tooltip
  useEffect(() => {
    if (!tip) return;
    const close = () => setTip(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [tip]);

  const a = clamp(Number(actual) || 0, 0, 100);
  const p = clamp(Number(plan) || 0, 0, 100);
  const diff = Math.round(Math.abs(a - p));
  const ahead = a >= p;
  const merged = !!geo && geo.merged;

  // 节奏徽章：落后红 / 超前绿 / 匹配主题色
  let badge = null;
  if (showBadge) {
    if (diff === 0) badge = { t: '节奏匹配', bg: hexToRgba(color, 0.1), fg: color };
    else if (ahead) badge = { t: `超前 ${diff}%${deltaContext ? ' · ' + deltaContext : ''}`, bg: hexToRgba(green, 0.1), fg: green };
    else badge = { t: `落后 ${diff}%${deltaContext ? ' · ' + deltaContext : ''}`, bg: hexToRgba(red, 0.1), fg: red };
  }

  const track = { position: 'relative', height: 10 };
  const segBase = { position: 'absolute', top: 0, bottom: 0, transition: 'left .35s ease, width .35s ease' };
  const dividerBase = { position: 'absolute', top: 0, bottom: 0, width: 5, background: '#fff', zIndex: 3, transition: 'left .35s ease', borderRadius: 999 };
  const labelBase = {
    position: 'absolute', bottom: -15, transform: 'translateX(-50%)',
    fontSize: 10, fontWeight: 600, lineHeight: 1, cursor: 'pointer', zIndex: 6,
    transition: 'left .35s ease', WebkitTapHighlightColor: 'transparent',
    whiteSpace: 'nowrap',
  };
  const tipStyle = {
    position: 'absolute', bottom: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)',
    background: '#fff', color: '#1c1c1e',
    padding: '9px 12px', borderRadius: 12,
    fontSize: 11.5, fontWeight: 500, lineHeight: 1.55,
    minWidth: 188, textAlign: 'left',
    border: '1px solid rgba(0,0,0,0.06)',
    boxShadow: '0 8px 24px rgba(0,0,0,0.10), 0 1px 0 rgba(255,255,255,1) inset',
    transition: 'opacity .15s, transform .15s',
    zIndex: 20, pointerEvents: 'none', whiteSpace: 'normal',
    fontFamily: '-apple-system, "SF Pro Text", "PingFang SC", sans-serif',
  };
  // 双层三角：外层灰色描边（z-index -1，比气泡低1px）+ 内层白
  const tipArrowOuter = {
    position: 'absolute', top: 'calc(100% + 1px)', left: '50%', transform: 'translateX(-50%)',
    width: 0, height: 0,
    borderLeft: '6px solid transparent', borderRight: '6px solid transparent',
    borderTop: '6px solid rgba(0,0,0,0.06)',
    zIndex: -1,
  };
  const tipArrow = {
    position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
    width: 0, height: 0,
    borderLeft: '5px solid transparent', borderRight: '5px solid transparent',
    borderTop: '5px solid #fff',
  };
  const qMark = { fontSize: 8, opacity: 0.55, verticalAlign: 'super', marginLeft: 1, fontWeight: 800 };
  // eslint-disable-next-line no-unused-vars
  const _q = qMark; // 问号已移除，保留定义作备份

  const tipVisible = (k) => (tip === k
    ? { opacity: 1, visibility: 'visible', transform: 'translateX(-50%) translateY(0)' }
    : { opacity: 0, visibility: 'hidden', transform: 'translateX(-50%) translateY(3px)' });

  return (
    <div style={{ userSelect: 'none' }} role="img"
      aria-label={`实际完成率 ${fmt(a)}%，计划完成率 ${fmt(p)}%`}>
      {/* 顶部行：仅当显式传入 caption 时渲染（节奏徽章挪到卡片 O 行右侧） */}
      {caption && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#8a9491' }}>{caption}</span>
        </div>
      )}

      {/* 进度条主体：整体缩 17% — 轨上28px（气泡18px高+尾4px，净空2.9px 悬浮不扎轨）
           side gutter 14px ×2：轨道视觉主体不贴容器边缘，Apple Fitness / Linear 规范 */}
      <div style={{ position: 'relative', paddingTop: 28, paddingBottom: 21 }}>
        <div ref={trackRef} style={track}>
          {/* 轨道内层：margin 14 ×2 左右留呼吸边，position:relative 作为子元素 absolute 参考
               浅红底色只画在内层 → GUTTER 14px 区域透明，不再两端露浅红边噪点 */}
          <div style={{ position: 'relative', marginLeft: GUTTER, marginRight: GUTTER, height: '100%', borderRadius: 999, overflow: 'hidden', background: hexToRgba(color, 0.1) }}>
            {/* ① 已完成段（0 → min(实际,计划)） */}
            <div style={{ ...segBase, left: 0, width: `${geo ? geo.segW : Math.min(a, p)}%`, background: color, borderRadius: '999px 0 0 999px' }} />

            {/* ② 差距段：落后=斜条纹（极窄退化透明）；超前=绿色实心 */}
            {geo && geo.gapW > 0 && (
              <div style={{
                ...segBase,
                left: `${geo.segW}%`, width: `${geo.gapW}%`,
                background: geo.ahead
                  ? green
                  : (geo.thin ? 'transparent' : `repeating-linear-gradient(45deg, ${hexToRgba(color, 0.28)} 0, ${hexToRgba(color, 0.28)} 2px, transparent 2px, transparent 8px)`),
              }} />
            )}

            {/* 白色隔断 ×2：实际 / 计划（近重合时隐藏计划隔断避免双线）
                 dA/dP 是内层坐标系（0..TW-5），直接用无需加 GUTTER */}
            <div style={{ ...dividerBase, left: geo ? geo.dA : undefined }} />
            <div style={{ ...dividerBase, left: geo ? geo.dP : undefined, opacity: geo ? (geo.hideP ? 0 : 1) : 1, transition: 'left .35s ease, opacity .2s' }} />
          </div>

          {/* 实际气泡：主题色胶囊 + 内嵌无缝三角（尾尖离轨2.9px 悬浮不扎轨） */}
          <span ref={bubRef} style={{
            position: 'absolute', top: -25, transform: 'translateX(-50%)',
            left: geo ? geo.bubL : undefined,
            background: color, color: '#fff', fontSize: 11, fontWeight: 700,
            padding: '2px 8px 4px', borderRadius: 999, lineHeight: 1.1,
            boxShadow: `0 2px 6px ${hexToRgba(color, 0.3)}`,
            whiteSpace: 'nowrap', zIndex: 4, fontVariantNumeric: 'tabular-nums',
            transition: 'left .35s ease', visibility: geo ? 'visible' : 'hidden',
          }}>
            {merged ? `${fmt(a)}% / ${fmt(p)}%` : `${fmt(a)}%`}
            <i style={{
              position: 'absolute', left: '50%',
              transform: `translateX(calc(-50% + ${geo ? geo.tailOffsetA : 0}px))`,
              bottom: -4,
              width: 0, height: 0,
              borderLeft: '4px solid transparent', borderRight: '4px solid transparent',
              borderTop: `4px solid ${color}`,
              transition: 'transform .35s ease',
            }} />
          </span>

          {/* 计划数字：与蓝气泡垂直居中对齐（同水平线，颜色+形制区分） */}
          <span ref={pnRef} style={{
            position: 'absolute', top: -22, transform: 'translateX(-50%)',
            left: geo && !merged ? geo.pnL : undefined,
            fontSize: 12, fontWeight: 800, color: '#1c1c1e', lineHeight: 1,
            zIndex: 4, fontVariantNumeric: 'tabular-nums',
            transition: 'left .35s ease', visibility: geo && !merged ? 'visible' : 'hidden',
          }}>
            {fmt(p)}%
          </span>

          {/* 标签「实际」：隔断线正下方，跟随移动；hover/tap 弹含义 */}
          <div
            ref={lARef}
            style={{ ...labelBase, left: geo && !merged ? geo.lAL : undefined, color, visibility: geo && !merged ? 'visible' : 'hidden' }}
            onMouseEnter={() => setTip('a')}
            onMouseLeave={() => setTip(null)}
            onClick={(e) => { e.stopPropagation(); setTip((t) => (t === 'a' ? null : 'a')); }}
          >
            实际
            <span style={{ ...tipStyle, ...tipVisible('a') }}>
              {actualTip}{actualDetail ? <><br /><br />{actualDetail}</> : null}
              <i style={tipArrowOuter} />
              <i style={tipArrow} />
            </span>
          </div>

          {/* 标签「计划」 */}
          <div
            ref={lPRef}
            style={{ ...labelBase, left: geo && !merged ? geo.lPL : undefined, color: '#55565a', visibility: geo && !merged ? 'visible' : 'hidden' }}
            onMouseEnter={() => setTip('p')}
            onMouseLeave={() => setTip(null)}
            onClick={(e) => { e.stopPropagation(); setTip((t) => (t === 'p' ? null : 'p')); }}
          >
            计划
            <span style={{ ...tipStyle, ...tipVisible('p') }}>
              {planTip}{planDetail ? <><br /><br />{planDetail}</> : null}
              <i style={tipArrowOuter} />
              <i style={tipArrow} />
            </span>
          </div>

          {/* 合并态标签：两标记重合时 */}
          <div
            ref={lMRef}
            style={{ ...labelBase, left: merged ? geo.lML : undefined, color, visibility: merged ? 'visible' : 'hidden' }}
            onMouseEnter={() => setTip('m')}
            onMouseLeave={() => setTip(null)}
            onClick={(e) => { e.stopPropagation(); setTip((t) => (t === 'm' ? null : 'm')); }}
          >
            实际 / 计划
            <span style={{ ...tipStyle, ...tipVisible('m') }}>
              两标记当前重合：气泡内上值=实际，下值=计划
              <i style={tipArrowOuter} />
              <i style={tipArrow} />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
