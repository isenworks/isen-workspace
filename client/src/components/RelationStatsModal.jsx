import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Modal from './Modal.jsx';
import { API } from '../api/client.js';
import { today as getToday, addDaysISO } from '../utils/date.js';
import {
  REL_TAGS, TAG_MAP, BLANK_COLOR, PHASES, phaseOf, cycleInfo, lastDays,
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

  const conclusion = frictionTotal === 0
    ? '这段时间还没有记录「有摩擦」，继续记下去才能看出规律。'
    : `有摩擦 ${frictionTotal} 次，其中「${top.label}」${top.n} 次最集中。`;

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
          记录 {recorded} 天 · 摩擦 {frictionTotal} 次
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
          {/* ---- 时间带：颜色 = 当天状态，下方短横 = 经期 ---- */}
          <div className="rounded-xl p-3" style={{ background: 'var(--surface-muted)' }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] text-ink-400">近 21 天</span>
              <span className="text-[10.5px] text-ink-300">下划线 = 经期</span>
            </div>
            <div className="flex gap-1">
              {band.map(d => {
                const lg = logMap.get(d);
                const isPeriod = phaseOf(d, periods) === 'period';
                const color = lg?.tag ? (TAG_MAP[lg.tag]?.color || BLANK_COLOR) : BLANK_COLOR;
                return (
                  <div key={d} className="flex-1 flex flex-col items-center gap-1" title={`${fmtMd(d)} 周${weekdayOf(d)}${lg?.note ? ` · ${lg.note}` : ''}`}>
                    <span
                      className="w-full h-7 rounded-md"
                      style={{
                        background: color,
                        boxShadow: d === todayStr ? '0 0 0 2px var(--surface-card), 0 0 0 3px var(--m-life)' : 'none',
                      }}
                    />
                    <span className="w-full h-[3px] rounded-full" style={{ background: isPeriod ? 'var(--m-life)' : 'transparent' }} />
                    <span className="text-[9.5px] text-ink-300 tabular-nums">{Number(d.slice(8))}</span>
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
          <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 mt-3 text-[10.5px] text-ink-400">
            {REL_TAGS.map(t => (
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

          {/* ---- 结论 ---- */}
          <div className="mt-4 rounded-lg px-3 py-2 text-[12px] leading-5" style={{ background: 'rgba(var(--m-life-rgb),0.08)', color: 'var(--text-1)' }}>
            {frictionTotal === 0 ? conclusion : `近 90 天，${conclusion}`}
          </div>
        </>
      )}
    </Modal>,
    document.body
  );
}
