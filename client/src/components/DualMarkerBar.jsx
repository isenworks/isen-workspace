import { useLayoutEffect, useRef, useState, useEffect } from 'react';

/* 双标记进度条：实际完成率 vs 计划完成率（时间锚点）
 * compact=true：紧凑版，省 34px（-45% 高度）
 *   - 无独立标题行；徽章贴轨道右上；删除"实际/计划"标签行，改底部数字图例（颜色锚定语义）
 *   - 气泡/数字尺寸略小：11.5/12px
 *   - 底部图例：左(实际%) 中(标题) 右(计划%)，三列对齐
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
  caption = '', // 紧凑版：底部图例中显示
  actualTip = '真实完成的进度，基于实际完成事项/所有计划事项',
  planTip = '按预设周期时间，理论上应当达成的进度',
  actualDetail = '',
  planDetail = '',
  deltaContext = '',
  mergeDist = 72,
  showBadge = true,
  compact = false,
}) {
  const trackRef = useRef(null);
  const bubRef = useRef(null);
  const pnRef = useRef(null);
  const bdgRef = useRef(null);
  const lMRef = useRef(null);
  const lARef = useRef(null);
  const lPRef = useRef(null);
  const [W, setW] = useState(0);
  const [geo, setGeo] = useState(null);
  const [tip, setTip] = useState(null); // 'a' | 'p' | 'm' | 'b' | null

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

  useLayoutEffect(() => {
    if (!W) { setGeo(null); return; }
    const a = clamp(Number(actual) || 0, 0, 100);
    const p = clamp(Number(plan) || 0, 0, 100);
    const ax = (a / 100) * W;
    const px = (p / 100) * W;
    const dA = clamp(ax - 3, W * 0.012, W - 6 - W * 0.012);
    const dP = clamp(px - 3, W * 0.012, W - 6 - W * 0.012);
    const cA = dA + 3;
    const cP = dP + 3;
    const merged = Math.abs(cA - cP) < mergeDist;
    const mid = (cA + cP) / 2;
    const bw = (bubRef.current && bubRef.current.offsetWidth) || 38;
    const nw = (pnRef.current && pnRef.current.offsetWidth) || 32;
    const law = (lARef.current && lARef.current.offsetWidth) || 34;
    const lpw = (lPRef.current && lPRef.current.offsetWidth) || 34;
    const lmw = (lMRef.current && lMRef.current.offsetWidth) || 62;
    setGeo({
      a, p, merged,
      segW: Math.min(a, p),
      gapW: Math.abs(a - p),
      ahead: a >= p,
      dA, dP,
      hideP: Math.abs(ax - px) < 8,
      bubL: merged ? clamp(mid, bw / 2, W - bw / 2) : clamp(cA, bw / 2, W - bw / 2),
      pnL: clamp(cP, nw / 2, W - nw / 2),
      lAL: clamp(cA, law / 2, W - law / 2),
      lPL: clamp(cP, lpw / 2, W - lpw / 2),
      lML: clamp(mid, lmw / 2, W - lmw / 2),
      thin: (Math.abs(a - p) / 100) * W < 4,
    });
  }, [W, actual, plan, mergeDist]);

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

  // iOS 风 tooltip 样式（白底 + 轻投影 + 1px 描边）
  const tipBox = {
    position: 'absolute', left: '50%', transform: 'translateX(-50%)',
    bottom: 'calc(100% + 8px)',
    background: '#fff', color: '#1c1c1e',
    padding: '9px 12px', borderRadius: 12,
    fontSize: 11.5, fontWeight: 500, lineHeight: 1.55,
    minWidth: 188, textAlign: 'left',
    border: '1px solid rgba(0,0,0,0.06)',
    boxShadow: '0 8px 24px rgba(0,0,0,0.10), 0 1px 0 rgba(255,255,255,1) inset',
    transition: 'opacity .15s, transform .15s',
    zIndex: 30, pointerEvents: 'none', whiteSpace: 'normal',
    fontFamily: '-apple-system, "SF Pro Text", "PingFang SC", sans-serif',
  };
  const tipArrow = {
    position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
    width: 0, height: 0,
    borderLeft: '5px solid transparent', borderRight: '5px solid transparent',
    borderTop: '5px solid #fff',
  };
  const tipArrowBorder = {
    position: 'absolute', top: 'calc(100% + 1px)', left: '50%', transform: 'translateX(-50%)',
    width: 0, height: 0,
    borderLeft: '6px solid transparent', borderRight: '6px solid transparent',
    borderTop: '6px solid rgba(0,0,0,0.06)',
    zIndex: -1,
  };
  const tipVisible = (k) => (tip === k
    ? { opacity: 1, visibility: 'visible', transform: 'translateX(-50%) translateY(0)' }
    : { opacity: 0, visibility: 'hidden', transform: 'translateX(-50%) translateY(3px)' });

  let badge = null;
  if (showBadge) {
    if (diff === 0) badge = { t: '节奏匹配', bg: hexToRgba(color, 0.1), fg: color };
    else if (ahead) badge = { t: `超前 ${diff}%${deltaContext ? ' · ' + deltaContext : ''}`, bg: hexToRgba(green, 0.1), fg: green };
    else badge = { t: `落后 ${diff}%${deltaContext ? ' · ' + deltaContext : ''}`, bg: hexToRgba(red, 0.1), fg: red };
  }

  // 轨道 & 分隔共用样式
  const track = { position: 'relative', height: 12, borderRadius: 999, background: hexToRgba(color, 0.1) };
  const segBase = { position: 'absolute', top: 0, bottom: 0, transition: 'left .35s ease, width .35s ease' };
  const dividerBase = { position: 'absolute', top: 0, bottom: 0, width: 6, background: '#fff', zIndex: 3, transition: 'left .35s ease' };

  return (
    <div style={{ userSelect: 'none' }} role="img"
      aria-label={`实际完成率 ${fmt(a)}%，计划完成率 ${fmt(p)}%`}>

      {/* ========== 宽松版（旧）：标题行独立 + 下方标签行 ========== */}
      {!compact && (
        <>
          {(caption || badge) && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
              {caption ? <span style={{ fontSize: 11, fontWeight: 600, color: '#8a9491' }}>{caption}</span> : <span />}
              {badge && (
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: badge.bg, color: badge.fg, whiteSpace: 'nowrap' }}>
                  {badge.t}
                </span>
              )}
            </div>
          )}
          <div style={{ position: 'relative', paddingTop: 26, paddingBottom: 24 }}>
            <div ref={trackRef} style={track}>
              {renderTrackInternals({
                geo, W, a, p, merged,
                color, segBase, dividerBase,
                bubRef, pnRef, lARef, lPRef, lMRef, bdgRef,
                badge, showBadge,
                tip, setTip,
                tipBox, tipArrow, tipArrowBorder, tipVisible,
                actualTip, actualDetail, planTip, planDetail,
                compactMode: false,
              })}
            </div>
          </div>
        </>
      )}

      {/* ========== 紧凑版（推荐）：无标题行；徽章贴轨道右上；底部图例三列 ========== */}
      {compact && (
        <div style={{ position: 'relative', paddingTop: 16, paddingBottom: 2 }}>
          {/* 徽章：绝对定位在轨道右上，和气泡同层浮动节省 18px 标题行 */}
          {badge && (
            <span ref={bdgRef} style={{
              position: 'absolute', right: 0, top: -2,
              fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
              background: badge.bg, color: badge.fg, whiteSpace: 'nowrap', zIndex: 5,
            }}>
              {badge.t}
            </span>
          )}
          <div ref={trackRef} style={track}>
            {renderTrackInternals({
              geo, W, a, p, merged,
              color, segBase, dividerBase,
              bubRef, pnRef, lARef, lPRef, lMRef, bdgRef,
              badge: null, showBadge: false,
              tip, setTip,
              tipBox, tipArrow, tipArrowBorder, tipVisible,
              actualTip, actualDetail, planTip, planDetail,
              compactMode: true,
            })}
          </div>
          {/* 底部图例三列：左=实际 中=标题 右=计划（颜色锚定 + 数字直接表达，省 18px 标签行） */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 5, fontSize: 10, fontWeight: 600 }}>
            <span
              ref={lARef}
              style={{
                cursor: merged ? 'default' : 'pointer', color,
                visibility: merged ? 'hidden' : 'visible',
                WebkitTapHighlightColor: 'transparent',
              }}
              onMouseEnter={() => !merged && setTip('a')}
              onMouseLeave={() => !merged && setTip(null)}
              onClick={(e) => { if (merged) return; e.stopPropagation(); setTip((t) => (t === 'a' ? null : 'a')); }}
            >
              实际 {fmt(a)}%
            </span>
            <span style={{ color: '#8a9491' }}>{caption || '节奏'}</span>
            <span
              ref={lPRef}
              style={{
                cursor: merged ? 'default' : 'pointer', color: '#55565a',
                visibility: merged ? 'hidden' : 'visible',
                WebkitTapHighlightColor: 'transparent',
              }}
              onMouseEnter={() => !merged && setTip('p')}
              onMouseLeave={() => !merged && setTip(null)}
              onClick={(e) => { if (merged) return; e.stopPropagation(); setTip((t) => (t === 'p' ? null : 'p')); }}
            >
              计划 {fmt(p)}%
            </span>
            {/* 合并态：显示「实际/计划」在中间（和图例标题位置相同，保证垂直对齐） */}
            {merged && (
              <span
                ref={lMRef}
                style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', cursor: 'pointer', color, fontWeight: 700, fontSize: 10 }}
                onMouseEnter={() => setTip('m')}
                onMouseLeave={() => setTip(null)}
                onClick={(e) => { e.stopPropagation(); setTip((t) => (t === 'm' ? null : 'm')); }}
              >
                实际/计划（重合）
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* 轨道内部公共渲染：色段 / 隔断 / 气泡 / 计划数字 / 标签 / tooltip
 * compactMode=false：底部用独立 label div（"实际"/"计划"文字）
 * compactMode=true：底部由组件外层画图例（带数字），此处只渲染 tooltip 锚点（不可见 div）
 */
function renderTrackInternals(o) {
  const t = o.tip;
  function TipAnchor({ kind, posRef, style, content }) {
    // 一个隐藏/可见的触发容器，在其上方弹出 iOS tooltip
    return (
      <div
        ref={posRef}
        style={{
          position: 'absolute', bottom: -18, transform: 'translateX(-50%)',
          ...style,
          lineHeight: 1,
          WebkitTapHighlightColor: 'transparent',
          ...(kind === 'merged'
            ? { ...style, cursor: 'pointer', zIndex: 6, bottom: -18 }
            : { cursor: 'pointer', zIndex: 6 }),
        }}
        onMouseEnter={() => o.setTip(kind)}
        onMouseLeave={() => o.setTip(null)}
        onClick={(e) => { e.stopPropagation(); o.setTip((prev) => (prev === kind ? null : kind)); }}
      >
        {content}
        <span style={{ ...o.tipBox, ...o.tipVisible(kind) }}>
          {kind === 'm'
            ? '两标记当前重合：气泡内上值=实际，下值=计划'
            : (kind === 'a'
              ? (<>{o.actualTip}{o.actualDetail ? <><br /><br />{o.actualDetail}</> : null}</>)
              : (<>{o.planTip}{o.planDetail ? <><br /><br />{o.planDetail}</> : null}</>))}
          <i style={o.tipArrowBorder} />
          <i style={o.tipArrow} />
        </span>
      </div>
    );
  }

  return (
    <>
      <div style={{ ...o.segBase, left: 0, width: `${o.geo ? o.geo.segW : Math.min(o.a, o.p)}%`, background: o.color, borderRadius: '999px 0 0 999px' }} />
      {o.geo && o.geo.gapW > 0 && (
        <div style={{
          ...o.segBase,
          left: `${o.geo.segW}%`, width: `${o.geo.gapW}%`,
          background: o.geo.ahead
            ? '#34C759'
            : (o.geo.thin ? 'transparent' : `repeating-linear-gradient(45deg, ${hexToRgba(o.color, 0.28)} 0, ${hexToRgba(o.color, 0.28)} 2px, transparent 2px, transparent 8px)`),
        }} />
      )}
      <div style={{ ...o.dividerBase, left: o.geo ? o.geo.dA : undefined }} />
      <div style={{ ...o.dividerBase, left: o.geo ? o.geo.dP : undefined, opacity: o.geo ? (o.geo.hideP ? 0 : 1) : 1, transition: 'left .35s ease, opacity .2s' }} />

      {/* 实际气泡（贴轨） */}
      <span ref={o.bubRef} style={{
        position: 'absolute', top: o.compactMode ? -18 : -22, transform: 'translateX(-50%)',
        left: o.geo ? o.geo.bubL : undefined,
        background: o.color, color: '#fff',
        fontSize: o.compactMode ? 11.5 : 12, fontWeight: 700,
        padding: o.compactMode ? '2px 7px 5px' : '2px 8px 6px',
        borderRadius: 999, lineHeight: 1.1,
        boxShadow: `0 1.5px 4px ${hexToRgba(o.color, 0.3)}`,
        whiteSpace: 'nowrap', zIndex: 4, fontVariantNumeric: 'tabular-nums',
        transition: 'left .35s ease', visibility: o.geo ? 'visible' : 'hidden',
      }}>
        {o.merged ? `${fmt(o.a)}% / ${fmt(o.p)}%` : `${fmt(o.a)}%`}
        <i style={{
          position: 'absolute', left: '50%', transform: 'translateX(-50%)',
          bottom: o.compactMode ? -3 : -4,
          width: 0, height: 0,
          borderLeft: `${o.compactMode ? 3 : 4}px solid transparent`,
          borderRight: `${o.compactMode ? 3 : 4}px solid transparent`,
          borderTop: `${o.compactMode ? 4 : 5}px solid ${o.color}`,
        }} />
      </span>

      {/* 计划数字（非合并态显示） */}
      <span ref={o.pnRef} style={{
        position: 'absolute', top: o.compactMode ? -15 : -16, transform: 'translateX(-50%)',
        left: o.geo && !o.merged ? o.geo.pnL : undefined,
        fontSize: o.compactMode ? 12 : 13.5, fontWeight: 800, color: '#1c1c1e', lineHeight: 1,
        zIndex: 4, fontVariantNumeric: 'tabular-nums',
        transition: 'left .35s ease', visibility: o.geo && !o.merged ? 'visible' : 'hidden',
      }}>
        {fmt(o.p)}%
      </span>

      {/* 徽章：宽松版画在轨道内部（紧凑版画在组件外层） */}
      {!o.compactMode && o.badge && o.showBadge !== false && (
        <span ref={o.bdgRef} style={{
          position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%) translate(0, -26px)',
          fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999,
          background: o.badge.bg, color: o.badge.fg, whiteSpace: 'nowrap', zIndex: 5,
          marginLeft: 'auto',
        }}>
          {o.badge.t}
        </span>
      )}

      {/* 宽松版：标签行（"实际"/"计划" 文字 + 问号已删）；提示文字移到父容器 tooltip 触发 */}
      {!o.compactMode && (
        <>
          <TipAnchor
            kind="a"
            posRef={o.lARef}
            style={{
              left: o.geo && !o.merged ? o.geo.lAL : undefined,
              color: o.color,
              visibility: o.geo && !o.merged ? 'visible' : 'hidden',
              fontSize: 11, fontWeight: 600,
            }}
            content={<span style={{ pointerEvents: 'none' }}>实际</span>}
          />
          <TipAnchor
            kind="p"
            posRef={o.lPRef}
            style={{
              left: o.geo && !o.merged ? o.geo.lPL : undefined,
              color: '#55565a',
              visibility: o.geo && !o.merged ? 'visible' : 'hidden',
              fontSize: 11, fontWeight: 600,
            }}
            content={<span style={{ pointerEvents: 'none' }}>计划</span>}
          />
          <TipAnchor
            kind="merged"
            posRef={o.lMRef}
            style={{
              left: o.merged ? o.geo.lML : undefined,
              color: o.color,
              visibility: o.geo && o.merged ? 'visible' : 'hidden',
              fontSize: 11, fontWeight: 600,
            }}
            content={<span style={{ pointerEvents: 'none' }}>实际 / 计划</span>}
          />
        </>
      )}
    </>
  );
}
