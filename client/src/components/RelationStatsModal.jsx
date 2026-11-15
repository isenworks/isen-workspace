import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Modal from './Modal.jsx';
import { API } from '../api/client.js';
import { today as getToday, addDaysISO } from '../utils/date.js';
import {
  BLANK_COLOR, PHASES, phaseOf, cycleInfo, lastDays, resolveTags, tagOf, MOODS,
} from '../utils/relation.js';

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
const fmtMd = s => `${Number(s.slice(5, 7))}.${s.slice(8, 10)}`;
const weekdayOf = s => WEEK[new Date(`${s}T00:00:00`).getDay()];
// 心情按「好 → 差」排成纵轴档位：开心在最上、烦躁在最下，折线高低即心情走向
const MOOD_LEVEL = Object.fromEntries(MOODS.map((m, i) => [m.key, i]));
const MOOD_STEP = MOODS.length - 1;

/**
 * 关系 · 数据
 *   主视图是「时间带」而不是柱状图：规律来自日期对齐（哪几天摩擦、那几天是不是经前），
 *   相位统计只做下面几行汇总，回答「摩擦最集中在哪个阶段」。
 */
export default function RelationStatsModal({ open, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const todayStr = getToday();
  const from = addDaysISO(todayStr, -89);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    API.relation.list(from, todayStr)
      .then(r => { if (!cancelled) setData(r); })
      .catch(e => {
        if (cancelled) return;
        setError(e.message || '加载失败');
        setData(null);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, from, todayStr, reloadKey]);

  const logs = data?.logs || [];
  const periods = data?.periods || [];
  const tagList = resolveTags(data?.tags);
  const tagMap = useMemo(() => Object.fromEntries(tagList.map(t => [t.key, t])), [tagList]);
  const logMap = useMemo(() => {
    const m = new Map();
    logs.forEach(l => m.set(l.date, l));
    return m;
  }, [logs]);

  // 近 21 天时间带（含今天）
  const band = useMemo(() => lastDays(21, todayStr), [todayStr]);

  // 近 90 天相位统计：摩擦次数（只统计真实区间，不做预测归因）
  const phaseRows = useMemo(() => {
    const counts = Object.fromEntries(PHASES.map(p => [p.key, 0]));
    logs.forEach(l => {
      if (l.tag !== 'friction') return;
      counts[phaseOf(l.date, periods)] += 1;
    });
    const max = Math.max(1, ...PHASES.map(p => counts[p.key]));
    return PHASES.map(p => ({ ...p, n: counts[p.key], pct: (counts[p.key] / max) * 100 }));
  }, [logs, periods]);

  const frictionTotal = phaseRows.reduce((s, r) => s + r.n, 0);
  const top = [...phaseRows].sort((a, b) => b.n - a.n)[0];
  const recorded = logs.length;
  const cycle = cycleInfo(periods, todayStr);

  // 心情是并行的第二条记录轴：与相处标签同日不同维度，各算各的天数
  const moodLogs = useMemo(() => logs.filter(l => l.mood), [logs]);
  const moodRows = useMemo(() => {
    const counts = Object.fromEntries(MOODS.map(m => [m.key, 0]));
    moodLogs.forEach(l => { if (counts[l.mood] != null) counts[l.mood] += 1; });
    const max = Math.max(1, ...MOODS.map(m => counts[m.key]));
    return MOODS.map(m => ({ ...m, n: counts[m.key], pct: (counts[m.key] / max) * 100 }));
  }, [moodLogs]);
  const moodMax = Math.max(0, ...moodRows.map(r => r.n));
  const moodTops = moodRows.filter(r => r.n > 0 && r.n === moodMax);

  // 折线点：只看有心情的日子；空档不插值，间隔超过 3 天就断开，避免虚构走势
  const trendPts = band.map((d, i) => {
    const lg = logMap.get(d);
    const lvl = lg?.mood && MOOD_LEVEL[lg.mood] != null ? MOOD_LEVEL[lg.mood] : -1;
    return lvl < 0 ? null : { i, d, lvl, mood: MOODS[lvl] };
  });
  const trendSegs = [];
  let seg = [];
  for (const p of trendPts) {
    if (!p) continue;
    if (seg.length && p.i - seg[seg.length - 1].i > 3) {
      if (seg.length > 1) trendSegs.push(seg);
      seg = [];
    }
    seg.push(p);
  }
  if (seg.length > 1) trendSegs.push(seg);

  const parts = [];
  if (frictionTotal > 0) parts.push(`有摩擦 ${frictionTotal} 次，其中「${top.label}」${top.n} 次最集中`);
  if (moodTops.length === 1) parts.push(`心情以「${moodTops[0].label}」最多（${moodMax} 天）`);
  else if (moodTops.length > 1) parts.push(`心情「${moodTops.map(m => m.label).join('」「')}」并列最多（各 ${moodMax} 天）`);
  const conclusion = parts.length === 0
    ? '这段时间还没有记录，继续记下去才能看出规律。'
    : `近 90 天，${parts.join('；')}。`;

  return createPortal(
    <Modal
      open={open}
      onClose={onClose}
      title="关系 · 数据"
      maxWidth={520}
      headerExtra={<span className="text-[11px] text-ink-400">{cycle.label}</span>}
    >
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <span className="text-[11px] text-ink-400">近 90 天</span>
        <span className="text-[12px] font-bold text-ink-800 tabular-nums">
          记录 {recorded}/90 天 · 摩擦 {frictionTotal} 次 · 心情 {moodLogs.length} 天
        </span>
      </div>

      {error ? (
        <div className="text-[12.5px] text-[var(--danger)] py-6 text-center">
          {error}
          <button onClick={() => setReloadKey(k => k + 1)} className="ml-2 underline">重试</button>
        </div>
      ) : loading && !data ? (
        <div className="text-[12.5px] text-ink-400 py-6 text-center">加载中…</div>
      ) : (
        <>
          {/* ---- 时间带：颜色 = 当天相处状态，下方短横 = 经期 ---- */}
          <div className="rounded-xl p-3" style={{ background: 'var(--surface-muted)' }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] text-ink-400">相处 · 近 21 天</span>
              <span className="text-[10.5px] text-ink-300">下划线 = 经期</span>
            </div>
            <div className="flex gap-1">
              {band.map(d => {
                const lg = logMap.get(d);
                const tagColor = lg?.tag ? tagOf(tagMap, lg.tag).color : BLANK_COLOR;
                const isPeriod = phaseOf(d, periods) === 'period';
                const title = [
                  `${fmtMd(d)} 周${weekdayOf(d)}`,
                  `相处：${lg?.tag ? tagOf(tagMap, lg.tag).label : '未记录'}`,
                  lg?.note ? `备注：${lg.note}` : '',
                ].filter(Boolean).join(' · ');
                return (
                  <div key={d} className="flex-1 flex flex-col items-center gap-[3px]" title={title}>
                    <span className="w-full h-6 rounded-[4px]" style={{ background: tagColor }} />
                    <span className="w-full h-[3px] rounded-full" style={{ background: isPeriod ? 'var(--m-life)' : 'transparent' }} />
                    <span
                      className={`text-[9.5px] leading-[11px] tabular-nums ${d === todayStr ? 'font-bold text-[var(--m-life)]' : 'text-ink-300'}`}
                    >{Number(d.slice(8))}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-between mt-1 text-[10.5px] text-ink-400">
              <span>{fmtMd(band[0])}</span>
              <span>今天 {fmtMd(band[band.length - 1])}</span>
            </div>
          </div>

          {/* ---- 图例 ---- */}
          <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 mt-2.5 text-[10.5px] text-ink-400">
            {tagList.map(t => (
              <span key={t.key} className="flex items-center gap-1.5">
                <i className="w-2 h-2 rounded-sm block" style={{ background: t.color }} />
                {t.label}
              </span>
            ))}
            <span className="flex items-center gap-1.5">
              <i className="w-2 h-2 rounded-sm block" style={{ background: BLANK_COLOR }} />
              未记录
            </span>
          </div>

          {/* ---- 心情走势：纵轴 4 档（上=开心 下=烦躁），空档不连线，不虚构连续 ---- */}
          <div className="rounded-xl p-3 mt-3" style={{ background: 'var(--surface-muted)' }}>
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-[11px] text-ink-400">心情走势 · 近 21 天</span>
              <span className="text-[10.5px] text-ink-300">{moodLogs.length ? `${moodLogs.length} 天有记录` : '还没有记录'}</span>
            </div>
            <div className="flex gap-1.5">
              <div className="relative w-[26px] shrink-0 h-[78px]">
                {MOODS.map((m, i) => (
                  <span
                    key={m.key}
                    className="absolute left-0 text-[9px] leading-none text-ink-400"
                    style={{ top: `calc(${(i / MOOD_STEP) * 100}% - 4px)` }}
                  >{m.label}</span>
                ))}
              </div>
              <div className="relative flex-1 h-[78px]">
                {MOODS.map((m, i) => (
                  <span
                    key={m.key}
                    className="absolute left-0 right-0 h-px"
                    style={{ top: `${(i / MOOD_STEP) * 100}%`, background: 'rgba(120,120,128,0.1)' }}
                  />
                ))}
                <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                  {trendSegs.map((s, k) => (
                    <polyline
                      key={k}
                      points={s.map(p => `${((p.i + 0.5) / band.length) * 100},${(p.lvl / MOOD_STEP) * 100}`).join(' ')}
                      fill="none"
                      stroke="rgba(175,82,222,0.5)"
                      strokeWidth="1.5"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
                </svg>
                <div className="absolute inset-0 flex">
                  {band.map((d, i) => (
                    <div key={d} className="relative flex-1">
                      {trendPts[i] ? (
                        <span
                          className="absolute w-[7px] h-[7px] rounded-full"
                          style={{
                            left: '50%',
                            top: `${(trendPts[i].lvl / MOOD_STEP) * 100}%`,
                            transform: 'translate(-50%,-50%)',
                            background: trendPts[i].mood.color,
                            boxShadow: '0 0 0 1.5px var(--surface-muted)',
                          }}
                          title={`${fmtMd(d)} · ${trendPts[i].mood.label}`}
                        />
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between mt-1 text-[10px] text-ink-300" style={{ paddingLeft: 32 }}>
              <span>{fmtMd(band[0])}</span>
              <span>今天</span>
            </div>
          </div>

          {/* ---- 摩擦按周期阶段：四根小柱，替代四行文字 ---- */}
          <div className="mt-4">
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-[11px] text-ink-400">摩擦 · 按周期阶段</span>
              <span className="text-[10.5px] text-ink-300">近 90 天 {frictionTotal} 次</span>
            </div>
            <div className="flex items-end gap-2 h-[58px]">
              {phaseRows.map(r => {
                const on = r.n > 0 && r.n === top.n;
                return (
                  <div key={r.key} className="flex-1 h-full flex flex-col items-center justify-end gap-1">
                    <span className={`text-[10px] tabular-nums ${on ? 'font-bold text-ink-800' : 'text-ink-400'}`}>{r.n}</span>
                    <span
                      className="w-full max-w-[38px] rounded-t-[3px]"
                      style={{
                        height: r.n === 0 ? 2 : Math.max(5, (r.n / Math.max(1, top.n)) * 34),
                        background: on ? 'var(--m-life)' : r.n > 0 ? 'rgba(var(--m-life-rgb),0.28)' : 'rgba(120,120,128,0.16)',
                      }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2 mt-1">
              {phaseRows.map(r => (
                <span
                  key={r.key}
                  className={`flex-1 text-center text-[9.5px] ${r.n > 0 && r.n === top.n ? 'text-ink-800 font-semibold' : 'text-ink-400'}`}
                >{r.label}</span>
              ))}
            </div>
          </div>

          {/* ---- 结论 ---- */}
          <div className="mt-4 rounded-lg px-3 py-2 text-[12px] leading-5" style={{ background: 'rgba(var(--m-life-rgb),0.08)', color: 'var(--text-1)' }}>
            {conclusion}
          </div>
        </>
      )}
    </Modal>,
    document.body
  );
}
