import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Modal from './Modal.jsx';
import { API } from '../api/client.js';
import { today as getToday, addDays, startOfWeek, toISODate } from '../utils/date.js';

// 配色与应用内打卡色一致；原因按出现频次依次取色
const DONE_COLOR = '#34C759';
const UNKNOWN_COLOR = '#C7C7CC';
const REASON_COLORS = ['#FF9500', '#5AC8FA', '#AF52DE', '#FFCC00', '#FF2D55', '#00C7BE', '#5856D6'];
const BAR_H = 132;

const HATCH = { background: 'repeating-linear-gradient(135deg, #E5E5EA 0 4px, #F7F7F9 4px 8px)' };

function weekRange(offset) {
  const start = startOfWeek(addDays(getToday(), -offset * 7));
  const end = toISODate(addDays(start, 6));
  const todayStr = getToday();
  const label = offset === 0 ? '本周' : offset === 1 ? '上周' : `${offset} 周前`;
  return {
    from: toISODate(start),
    to: end > todayStr ? todayStr : end,
    label,
  };
}

const fmtMd = s => (s ? `${Number(s.slice(5, 7))}.${s.slice(8, 10)}` : '');

/**
 * 习惯打卡归因：纵向堆叠柱状
 *   每根柱子 = 该习惯在区间内的天数，分段为 已完成 / 未完成原因 / 未打卡。
 *   入口：首页精力卡右上角、今日计划习惯面板右上角。
 */
export default function HabitStatsModal({ open, onClose, growthType, title }) {
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const range = useMemo(() => weekRange(offset), [offset]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    API.habits.missStats(range.from, range.to, growthType)
      .then(r => { if (!cancelled) setData(r); })
      .catch(e => {
        if (cancelled) return;
        setError(e.message || '加载失败');
        setData(null);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, range.from, range.to, growthType, reloadKey]);

  const colorOf = useMemo(() => {
    const map = new Map();
    (data?.reasonTotals || []).forEach((r, i) => map.set(r.name, REASON_COLORS[i % REASON_COLORS.length]));
    map.set('未注明', UNKNOWN_COLOR);
    return map;
  }, [data]);

  // 完成率低的排前面：问题习惯先被看到
  const habits = useMemo(() => {
    const list = [...(data?.habits || [])];
    list.sort((a, b) => (a.done / (a.total || 1)) - (b.done / (b.total || 1)));
    return list;
  }, [data]);

  const missedTotal = habits.reduce((s, h) => s + (h.missed || 0), 0);
  const topReason = data?.reasonTotals?.[0];
  const reasonChips = (data?.reasonTotals || []).slice(0, 6);

  return createPortal(
    <Modal open={open} onClose={onClose} title={title || '习惯 · 打卡数据'} maxWidth={620}>
      {/* ===== 区间切换 ===== */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="min-w-0">
          <div className="text-[13.5px] font-semibold text-[var(--text-1)] leading-tight">{range.label}</div>
          <div className="text-[11px] text-ink-400 mt-0.5 tabular-nums">
            {fmtMd(range.from)} – {fmtMd(range.to)} · {data?.days || 0} 天
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {offset > 0 && (
            <button
              type="button"
              onClick={() => setOffset(0)}
              className="text-[11px] px-2 h-[26px] rounded-lg text-ink-400 hover:bg-black/5"
            >回到本周</button>
          )}
          <button
            type="button"
            onClick={() => setOffset(o => Math.min(26, o + 1))}
            disabled={offset >= 26}
            title="看更早一周"
            className="w-[26px] h-[26px] rounded-lg grid place-items-center text-[var(--text-2)] hover:bg-black/5 disabled:opacity-30"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <button
            type="button"
            onClick={() => setOffset(o => Math.max(0, o - 1))}
            disabled={offset === 0}
            title="看更近一周"
            className="w-[26px] h-[26px] rounded-lg grid place-items-center text-[var(--text-2)] hover:bg-black/5 disabled:opacity-30"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
          </button>
        </div>
      </div>

      {/* ===== 结论句：先给答案，再给图 ===== */}
      {!loading && !error && habits.length > 0 && (
        <div
          className="rounded-xl px-3 py-2.5 mb-4 text-[12.5px] leading-relaxed"
          style={{ background: 'rgba(255,149,0,0.07)', color: 'var(--text-2)' }}
        >
          {missedTotal > 0 ? (
            <>
              {range.label}共 {missedTotal} 天标记为未完成
              {topReason ? <>，其中「<b className="font-semibold" style={{ color: 'var(--text-1)' }}>{topReason.name}</b>」出现 <b className="font-semibold tabular-nums">{topReason.count}</b> 次</> : null}
              {topReason ? '，是最主要的原因。' : '。'}
            </>
          ) : (
            <>这段时间还没有「未完成」记录。在打卡格上右键（手机长按）即可标记并选原因。</>
          )}
        </div>
      )}

      {/* ===== 图表 ===== */}
      {error ? (
        <div className="py-8 text-center">
          <div className="text-[12.5px] text-ink-400 mb-3">{error}</div>
          <button
            type="button"
            onClick={() => setReloadKey(k => k + 1)}
            className="text-[12px] px-3 py-1.5 rounded-lg font-medium"
            style={{ background: 'rgba(var(--s-rgb),0.08)', color: 'var(--s-main)' }}
          >重试</button>
        </div>
      ) : loading && !habits.length ? (
        <div className="flex items-end gap-5 py-4 h-[190px]">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="flex flex-col items-center gap-2">
              <div className="w-[26px] rounded animate-pulse" style={{ height: BAR_H - i * 22, background: 'rgba(120,120,128,0.10)' }} />
              <div className="w-8 h-2.5 rounded animate-pulse" style={{ background: 'rgba(120,120,128,0.08)' }} />
            </div>
          ))}
        </div>
      ) : habits.length === 0 ? (
        <div className="py-10 text-center text-[12.5px] text-ink-400">
          {growthType === 'energy' ? '还没有精力类习惯' : '还没有习惯'}
        </div>
      ) : (
        <>
          <div className="flex items-start gap-4 overflow-x-auto pb-1" style={{ minHeight: BAR_H + 46 }}>
            {/* 纵轴：只标 7 / 0，说明“一根柱 = N 天” */}
            <div className="flex flex-col justify-between flex-shrink-0 text-[9.5px] text-ink-400 text-right tabular-nums" style={{ height: BAR_H, paddingRight: 2 }}>
              <span>{data?.days || 0}</span>
              <span>0</span>
            </div>

            <div className="flex items-start gap-5 flex-1">
              {habits.map(h => {
                const total = h.total || 1;
                const segs = [
                  { k: 'done', n: h.done, c: DONE_COLOR, label: '已完成' },
                  ...(h.reasons || []).map(r => ({ k: `r-${r.name}`, n: r.count, c: colorOf.get(r.name) || UNKNOWN_COLOR, label: r.name })),
                  { k: 'blank', n: h.blank, c: null, label: '未打卡' },
                ].filter(s => s.n > 0);
                const short = String(h.label || h.name || '习惯').replace(/\s+/g, '').slice(0, 4);
                return (
                  <div key={h.id} className="flex flex-col items-center gap-1.5 flex-shrink-0" style={{ width: 46 }}>
                    <div
                      className="flex flex-col-reverse overflow-hidden"
                      style={{ width: 26, height: BAR_H, borderRadius: '5px 5px 2px 2px' }}
                    >
                      {segs.map(s => (
                        <div
                          key={s.k}
                          title={`${s.label} ${s.n} 天`}
                          style={{
                            height: `${(s.n / total) * 100}%`,
                            background: s.c || undefined,
                            ...(s.c ? {} : HATCH),
                            boxShadow: s.k === 'done' ? 'none' : 'inset 0 1px 0 rgba(255,255,255,0.9)',
                          }}
                        />
                      ))}
                    </div>
                    <span className="text-[11px] text-[var(--text-2)] max-w-[46px] truncate" title={h.label || h.name}>{short}</span>
                    <span className="text-[9.5px] text-ink-400 tabular-nums">{h.done}/{h.total}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ===== 图例 ===== */}
          <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 mt-4 pt-3 text-[10.5px] text-ink-400" style={{ borderTop: '1px solid rgba(60,60,67,0.08)' }}>
            <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm block" style={{ background: DONE_COLOR }} />已完成</span>
            {reasonChips.map(r => (
              <span key={r.name} className="flex items-center gap-1.5">
                <i className="w-2.5 h-2.5 rounded-sm block" style={{ background: colorOf.get(r.name) || UNKNOWN_COLOR }} />
                {r.name}
              </span>
            ))}
            <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm block" style={HATCH} />未打卡</span>
          </div>

          {/* ===== 原因次数（全部勾选，含次因）===== */}
          {reasonChips.length > 0 && (
            <div className="mt-3.5">
              <div className="text-[10.5px] text-ink-400 mb-1.5">{range.label}原因次数</div>
              <div className="flex flex-wrap gap-1.5">
                {reasonChips.map(r => (
                  <span
                    key={r.name}
                    className="inline-flex items-center gap-1.5 rounded-full pl-1.5 pr-2 py-[3px] text-[11.5px] text-[var(--text-2)]"
                    style={{ background: 'rgba(120,120,128,0.07)' }}
                  >
                    <i className="w-2 h-2 rounded-full block flex-shrink-0" style={{ background: colorOf.get(r.name) || UNKNOWN_COLOR }} />
                    {r.name}
                    <b className="font-semibold tabular-nums text-[var(--text-1)]">{r.count}</b>
                  </span>
                ))}
              </div>
            </div>
          )}

          <p className="mt-4 text-[10.5px] text-ink-400 leading-relaxed">
            每根柱子 = 该习惯的 {data?.days || 0} 天。同一天勾选多个原因时，柱子按主因归类，保证分段之和等于天数；下面的原因次数按全部勾选统计。
          </p>
        </>
      )}
    </Modal>,
    document.body
  );
}
