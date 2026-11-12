import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Modal from './Modal.jsx';
import { API } from '../api/client.js';
import { today as getToday, addDays, startOfWeek, toISODate } from '../utils/date.js';

// 配色与应用内打卡色一致；原因按出现频次依次取色
const DONE_COLOR = '#34C759';
const BLANK_COLOR = '#AEAEB2'; // 未打卡：实心灰（配合白字，比浅灰略深一档）
const UNKNOWN_COLOR = '#A2845E'; // 未注明原因：暖褐，避免与未打卡的灰混淆
const REASON_COLORS = ['#FF9500', '#5AC8FA', '#AF52DE', '#FFCC00', '#FF2D55', '#00C7BE', '#5856D6'];
const BAR_H = 116;
const ARROW_BTN = 'w-[26px] h-[26px] rounded-lg grid place-items-center text-[var(--text-2)] hover:bg-black/5 disabled:opacity-25';

// 段内数字：未打卡固定白字；其余按底色亮度自动取反色，9px 也读得清
function textOn(hex, forceWhite) {
  if (forceWhite) return '#fff';
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) > 186 ? 'rgba(0,0,0,0.66)' : '#fff';
}

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
  const blankTotal = habits.reduce((s, h) => s + (h.blank || 0), 0);
  const reasonTotals = data?.reasonTotals || [];
  // 并列最高：次数相同的都算「最多」，避免只挑一个造成误读
  const topCount = reasonTotals[0]?.count || 0;
  const topReasons = reasonTotals.filter(r => r.count === topCount);
  const topLabel = topReasons.length > 3
    ? `${topReasons.slice(0, 3).map(r => r.name).join('、')} 等 ${topReasons.length} 种`
    : topReasons.map(r => r.name).join('、');
  // 完成率最低的习惯（habits 已按完成率升序，取第一个）
  const lowest = habits[0];
  const lowestName = lowest ? String(lowest.label || lowest.name || '').replace(/\s+/g, '') : '';

  const numCls = 'font-semibold tabular-nums text-[var(--text-1)]';
  const nameCls = 'font-semibold text-[var(--text-1)]';

  return createPortal(
    <Modal
      open={open}
      onClose={onClose}
      title={title || '习惯 · 打卡数据'}
      maxWidth={620}
      headerExtra={(
        <button
          type="button"
          onClick={() => setOffset(0)}
          disabled={offset === 0}
          title={offset === 0 ? undefined : '回到本周'}
          className="text-[11px] text-ink-400 tabular-nums whitespace-nowrap rounded-md px-1.5 py-0.5 enabled:hover:bg-black/5"
        >
          {range.label} · {fmtMd(range.from)}–{fmtMd(range.to)}
        </button>
      )}
      headerRight={(
        <>
          <button type="button" onClick={() => setOffset(o => Math.min(26, o + 1))} disabled={offset >= 26} title="更早一周" className={ARROW_BTN}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <button type="button" onClick={() => setOffset(o => Math.max(0, o - 1))} disabled={offset === 0} title="更近一周" className={ARROW_BTN}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
          </button>
        </>
      )}
    >
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
        <div className="flex items-end justify-center gap-[18px] py-3" style={{ height: BAR_H + 34 }}>
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="flex flex-col items-center gap-2">
              <div className="w-7 rounded animate-pulse" style={{ height: BAR_H - i * 18, background: 'rgba(120,120,128,0.10)' }} />
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
          {/* 一句话结论 */}
          <div
            className="rounded-lg px-3 py-2 mb-3.5 text-[12px] leading-snug"
            style={{ background: 'rgba(255,149,0,0.07)', color: 'var(--text-2)' }}
          >
            {missedTotal > 0 && lowest ? (
              <>
                {range.label} <b className={nameCls}>{lowestName}</b> 打卡率最低
                <b className={numCls}> {lowest.done}/{lowest.total}</b>
                {topReasons.length > 1 ? (
                  <>，原因里 <b className={nameCls}>{topLabel}</b> 各 <b className={numCls}>{topCount}</b> 次，并列最多</>
                ) : topReasons.length === 1 ? (
                  <>，原因里 <b className={nameCls}>{topLabel}</b> <b className={numCls}>{topCount}</b> 次最多</>
                ) : (
                  <>，未填写原因</>
                )}
              </>
            ) : (
              <>{range.label}还没有未完成记录，右键打卡格可标记原因。</>
            )}
          </div>

          {/* 堆叠柱：一根 = 区间天数 */}
          <div
            className={`flex items-start gap-[18px] overflow-x-auto pb-1 ${habits.length <= 6 ? 'justify-center' : 'justify-start'}`}
          >
            {habits.map(h => {
              const total = h.total || 1;
              const segs = [
                { k: 'done', n: h.done, c: DONE_COLOR, label: '已完成' },
                ...(h.reasons || []).map(r => ({ k: `r-${r.name}`, n: r.count, c: colorOf.get(r.name) || UNKNOWN_COLOR, label: r.name })),
                { k: 'blank', n: h.blank, c: BLANK_COLOR, label: '未打卡' },
              ].filter(s => s.n > 0);
              const name = String(h.label || h.name || '习惯').replace(/\s+/g, '');
              return (
                <div key={h.id} className="flex flex-col items-center gap-1.5 flex-shrink-0" style={{ width: 46 }}>
                  <div
                    className="flex flex-col-reverse overflow-hidden"
                    style={{ width: 28, height: BAR_H, borderRadius: '5px 5px 2px 2px' }}
                  >
                    {segs.map((s, i) => {
                      const hPx = (s.n / total) * BAR_H;
                      const isTop = i === segs.length - 1;
                      return (
                        <div
                          key={s.k}
                          title={`${s.label} ${s.n} 天`}
                          className="flex items-center justify-center"
                          style={{
                            height: `${(s.n / total) * 100}%`,
                            background: s.c,
                            // 只画段与段之间的分隔线；最顶部留空，否则白色分隔线会削平圆角
                            boxShadow: i === 0 || isTop ? 'none' : 'inset 0 1px 0 rgba(255,255,255,0.9)',
                          }}
                        >
                          {hPx >= 13 && (
                            <span
                              className="text-[9px] font-semibold leading-none tabular-nums"
                              style={{ color: textOn(s.c, s.k === 'blank') }}
                            >{s.n}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <span className="text-[11px] text-[var(--text-2)] max-w-[46px] truncate" title={name}>{name}</span>
                  <span className="text-[9.5px] text-ink-400 tabular-nums">{h.done}/{h.total}</span>
                </div>
              );
            })}
          </div>

          {/* 纯色键：数字已放进柱内，这里只负责认颜色 */}
          <div className="flex flex-wrap items-center justify-center gap-x-3.5 gap-y-1.5 mt-3 text-[10.5px] text-ink-400">
            <span className="flex items-center gap-1.5">
              <i className="w-2 h-2 rounded-sm block" style={{ background: DONE_COLOR }} />
              已完成
            </span>
            {reasonTotals.map(r => (
              <span key={r.name} className="flex items-center gap-1.5">
                <i className="w-2 h-2 rounded-sm block" style={{ background: colorOf.get(r.name) || UNKNOWN_COLOR }} />
                {r.name}
              </span>
            ))}
            {blankTotal > 0 && (
              <span className="flex items-center gap-1.5">
                <i className="w-2 h-2 rounded-sm block" style={{ background: BLANK_COLOR }} />
                未打卡
              </span>
            )}
          </div>
        </>
      )}
    </Modal>,
    document.body
  );
}
