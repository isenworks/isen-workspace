import { useEffect, useMemo, useState } from 'react';
import { API } from '../api/client.js';
import { today as getToday, addDaysISO } from '../utils/date.js';
import { PHASES, phaseOf } from '../utils/relation.js';
import RelationStatsModal from './RelationStatsModal.jsx';

/**
 * 生活模块里的「关系 · 长期」入口：
 *   只放三个能指导行动的指标（记录率 / 摩擦次数 / 最集中阶段），点开是完整时间带
 */
export default function RelationLifeCard() {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const todayStr = getToday();
  const from = addDaysISO(todayStr, -89);

  useEffect(() => {
    let cancelled = false;
    API.relation.list(from, todayStr)
      .then(r => { if (!cancelled) setData(r); })
      .catch(() => { if (!cancelled) setData({ logs: [], periods: [] }); });
    return () => { cancelled = true; };
  }, [from, todayStr]);

  const stats = useMemo(() => {
    const logs = data?.logs || [];
    const periods = data?.periods || [];
    const counts = Object.fromEntries(PHASES.map(p => [p.key, 0]));
    logs.forEach(l => {
      if (l.tag === 'friction') counts[phaseOf(l.date, periods)] += 1;
    });
    const friction = logs.filter(l => l.tag === 'friction').length;
    const top = PHASES.map(p => ({ ...p, n: counts[p.key] })).sort((a, b) => b.n - a.n)[0];
    return { recorded: logs.length, friction, top: friction > 0 ? top : null };
  }, [data]);

  return (
    <>
      <div className="glass-card p-3.5">
        <div className="flex items-center gap-2 mb-2.5">
          <span className="w-[5px] h-[18px] rounded-full flex-shrink-0" style={{ background: 'var(--m-life)' }} />
          <span className="text-[15px] font-bold text-ink-900">关系</span>
          <span className="text-[11px] text-ink-400">近 90 天</span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="hp-more w-[26px] h-[26px] rounded-lg grid place-items-center flex-shrink-0 transition active:scale-95"
            style={{ color: 'var(--m-life)', background: 'rgba(var(--m-life-rgb),0.08)', '--hc': 'var(--m-life)' }}
            title="查看关系数据"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17L17 7" /><path d="M8 7h9v9" /></svg>
          </button>
        </div>

        {!data ? (
          <div className="h-9 rounded-lg" style={{ background: 'rgba(120,120,128,0.06)' }} />
        ) : (
          <div className="grid grid-cols-3 gap-2">
            <div>
              <div className="text-[15px] font-bold text-ink-900 tabular-nums leading-tight">{stats.recorded}<span className="text-[10px] font-medium text-ink-400">/90 天</span></div>
              <div className="text-[10.5px] text-ink-400 mt-0.5">已记录</div>
            </div>
            <div>
              <div className="text-[15px] font-bold text-ink-900 tabular-nums leading-tight">{stats.friction}<span className="text-[10px] font-medium text-ink-400"> 次</span></div>
              <div className="text-[10.5px] text-ink-400 mt-0.5">有摩擦</div>
            </div>
            <div className="min-w-0">
              <div className="text-[13px] font-bold leading-tight truncate" style={{ color: stats.top ? 'var(--m-life)' : 'var(--ink-400, #999)' }}>
                {stats.top ? stats.top.label : '—'}
              </div>
              <div className="text-[10.5px] text-ink-400 mt-0.5">{stats.top ? `最集中 ${stats.top.n} 次` : '暂无明显集中'}</div>
            </div>
          </div>
        )}
      </div>

      <RelationStatsModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
