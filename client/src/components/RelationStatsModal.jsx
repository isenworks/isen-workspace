import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Modal from './Modal.jsx';
import { API } from '../api/client.js';
import { today as getToday, addDaysISO } from '../utils/date.js';
import {
  BLANK_COLOR, PHASES, phaseOf, cycleInfo, lastDays, resolveTags, tagOf, MOODS, MOOD_MAP,
} from '../utils/relation.js';

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
const fmtMd = s => `${Number(s.slice(5, 7))}.${s.slice(8, 10)}`;
const weekdayOf = s => WEEK[new Date(`${s}T00:00:00`).getDay()];

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
          {/* ---- 时间带：上下两块 = 相处 / 心情，同一日期列对齐，下方短横 = 经期 ---- */}
          <div className="rounded-xl p-3" style={{ background: 'var(--surface-muted)' }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] text-ink-400">近 21 天</span>
              <span className="text-[10.5px] text-ink-300">下划线 = 经期</span>
            </div>
            <div className="flex gap-1">
              <div className="w-[20px] shrink-0 flex flex-col gap-[2px]">
                <span className="h-5 leading-5 text-[9.5px] text-ink-400">相处</span>
                <span className="h-5 leading-5 text-[9.5px] text-ink-400">心情</span>
              </div>
              {band.map(d => {
                const lg = logMap.get(d);
                const tagColor = lg?.tag ? tagOf(tagMap, lg.tag).color : BLANK_COLOR;
                const moodColor = lg?.mood && MOOD_MAP[lg.mood] ? MOOD_MAP[lg.mood].color : BLANK_COLOR;
                const isPeriod = phaseOf(d, periods) === 'period';
                const title = [
                  `${fmtMd(d)} 周${weekdayOf(d)}`,
                  `相处：${lg?.tag ? tagOf(tagMap, lg.tag).label : '未记录'}`,
                  `心情：${lg?.mood && MOOD_MAP[lg.mood] ? MOOD_MAP[lg.mood].label : '未记录'}`,
                  lg?.note ? `相处备注：${lg.note}` : '',
                  lg?.mood_note ? `心情备注：${lg.mood_note}` : '',
                ].filter(Boolean).join(' · ');
                return (
                  <div key={d} className="flex-1 flex flex-col items-center gap-[2px]" title={title}>
                    <span className="w-full h-5 rounded-[4px]" style={{ background: tagColor }} />
                    <span className="w-full h-5 rounded-[4px]" style={{ background: moodColor }} />
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

          {/* ---- 图例：两条记录轴各一行，与上方两行色块一一对应 ---- */}
          <div className="flex flex-col gap-1.5 mt-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-ink-400">
              <span className="w-[20px] shrink-0 text-[9.5px]">相处</span>
              {tagList.map(t => (
                <span key={t.key} className="flex items-center gap-1.5">
                  <i className="w-2 h-2 rounded-sm block" style={{ background: t.color }} />
                  {t.label}
                </span>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-ink-400">
              <span className="w-[20px] shrink-0 text-[9.5px]">心情</span>
              {MOODS.map(m => (
                <span key={m.key} className="flex items-center gap-1.5">
                  <i className="w-2 h-2 rounded-sm block" style={{ background: m.color }} />
                  {m.label}
                </span>
              ))}
              <span className="flex items-center gap-1.5">
                <i className="w-2 h-2 rounded-sm block" style={{ background: BLANK_COLOR }} />
                未记录
              </span>
            </div>
          </div>

          {/* ---- 相位统计：摩擦次数 ---- */}
          <div className="mt-4">
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-[11px] text-ink-400">摩擦按周期阶段</span>
              <span className="text-[10.5px] text-ink-300">次数</span>
            </div>
            <div className="flex flex-col gap-2">
              {phaseRows.map(r => (
                <div key={r.key} className="grid items-center gap-2" style={{ gridTemplateColumns: '76px 1fr 24px' }}>
                  <span className={`text-[11px] ${r.n === top.n && r.n > 0 ? 'font-semibold text-ink-800' : 'text-ink-400'}`}>{r.label}</span>
                  <span className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-muted)' }}>
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${r.pct}%`,
                        background: r.n === top.n && r.n > 0 ? 'var(--m-life)' : 'rgba(120,120,128,0.28)',
                      }}
                    />
                  </span>
                  <span className="text-[11px] font-semibold tabular-nums text-right text-ink-800">{r.n}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ---- 心情分布：天数，条形取各自心情色，最多次数加粗 ---- */}
          <div className="mt-4">
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-[11px] text-ink-400">心情分布</span>
              <span className="text-[10.5px] text-ink-300">天数</span>
            </div>
            <div className="flex flex-col gap-2">
              {moodRows.map(r => (
                <div key={r.key} className="grid items-center gap-2" style={{ gridTemplateColumns: '76px 1fr 24px' }}>
                  <span className={`text-[11px] ${r.n > 0 && r.n === moodMax ? 'font-semibold text-ink-800' : 'text-ink-400'}`}>{r.label}</span>
                  <span className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-muted)' }}>
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${r.pct}%`,
                        background: r.n > 0 ? r.color : 'transparent',
                        opacity: r.n > 0 && r.n === moodMax ? 1 : 0.55,
                      }}
                    />
                  </span>
                  <span className="text-[11px] font-semibold tabular-nums text-right text-ink-800">{r.n}</span>
                </div>
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
