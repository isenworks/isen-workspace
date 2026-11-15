import { useCallback, useEffect, useMemo, useState } from 'react';
import { API } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';
import { store } from '../utils/store.js';
import { today as getToday, addDaysISO } from '../utils/date.js';
import { hexToRgba } from '../utils/color.js';
import { REL_TAGS, TAG_MAP, BLANK_COLOR, cycleInfo, lastDays } from '../utils/relation.js';
import RelationStatsModal from './RelationStatsModal.jsx';

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
const weekdayOf = s => WEEK[new Date(`${s}T00:00:00`).getDay()];

/**
 * 首页「关系」卡：每天 20 秒记录相处状态（一键即存），可选备注
 *   · 经期是区间：开始/结束两个动作，不在格子上逐日勾选
 *   · 空白天 = 未记录（不默认融洽），避免把没记的日子当成好日子
 */
export default function RelationCard() {
  const toast = useToast();
  const [logs, setLogs] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [statsOpen, setStatsOpen] = useState(false);

  const todayStr = getToday();
  const from = addDaysISO(todayStr, -60);

  const load = useCallback(async () => {
    try {
      const r = await API.relation.list(from, todayStr);
      setLogs(r.logs || []);
      setPeriods(r.periods || []);
    } catch {
      /* 静默：卡片加载失败不打扰首页，重新进页面会再拉 */
    } finally {
      setLoading(false);
    }
  }, [from, todayStr]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => store.subscribe(msg => {
    if (msg?.type === 'reload') load();
  }), [load]);

  const todayLog = useMemo(() => logs.find(l => l.date === todayStr) || null, [logs, todayStr]);
  const cycle = useMemo(() => cycleInfo(periods, todayStr), [periods, todayStr]);
  const week = useMemo(() => lastDays(7, todayStr), [todayStr]);

  // 当前未结束的经期（用于「结束 / 撤销」）
  const openPeriod = useMemo(() => {
    const list = [...periods].filter(p => !p.end_date).sort((a, b) => (a.start_date < b.start_date ? 1 : -1));
    return list[0] || null;
  }, [periods]);

  async function toggleTag(key) {
    const nextTag = todayLog?.tag === key ? '' : key;
    const note = todayLog?.note || '';
    // 乐观更新：点下去立即变色，失败再回滚重拉
    setLogs(prev => {
      const rest = prev.filter(l => l.date !== todayStr);
      if (!nextTag && !note) return rest;
      return [...rest, { date: todayStr, tag: nextTag, note }];
    });
    if (!nextTag && !note) setNoteOpen(false);
    try {
      await API.relation.log(todayStr, nextTag, note);
    } catch (e) {
      toast.error(e.message || '保存失败');
      load();
    }
  }

  async function saveNote() {
    const note = noteDraft.trim();
    const tag = todayLog?.tag || '';
    if (!tag && !note) {
      setNoteOpen(false);
      return;
    }
    setLogs(prev => {
      const rest = prev.filter(l => l.date !== todayStr);
      return [...rest, { date: todayStr, tag, note }];
    });
    setNoteOpen(false);
    try {
      await API.relation.log(todayStr, tag, note);
    } catch (e) {
      toast.error(e.message || '备注保存失败');
      load();
    }
  }

  function openNote() {
    setNoteDraft(todayLog?.note || '');
    setNoteOpen(true);
  }

  async function markPeriod(action) {
    try {
      await API.relation.period(action, todayStr);
      await load();
      if (action === 'start') toast.info?.('已记录经期开始');
    } catch (e) {
      toast.error(e.message || '操作失败');
    }
  }

  return (
    <div className="glass-card px-4 py-3 flex flex-col gap-2">
      {/* 头部：标题 + 周期位置 + 经期动作 + 数据入口 */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="w-[3px] h-[14px] rounded-full flex-shrink-0" style={{ background: 'var(--m-life)' }} />
        <span className="text-[14px] font-semibold text-ink-800">关系</span>
        <span className="text-[11px] text-ink-400">{loading ? '加载中…' : cycle.label}</span>
        <div className="flex-1" />
        {cycle.key === 'period' ? (
          <>
            <button
              type="button"
              onClick={() => markPeriod('end')}
              className="h-[24px] px-2 rounded-[7px] text-[11px] font-semibold transition active:scale-95"
              style={{ color: 'var(--m-life)', background: 'rgba(var(--m-life-rgb),0.1)' }}
            >经期结束</button>
            {openPeriod?.start_date === todayStr && (
              <button
                type="button"
                onClick={() => markPeriod('clear')}
                className="h-[24px] px-1.5 rounded-[7px] text-[11px] text-ink-400 hover:bg-black/5"
                title="撤销今天开始的经期标记"
              >撤销</button>
            )}
          </>
        ) : (
          <button
            type="button"
            onClick={() => markPeriod('start')}
            className="h-[24px] px-2 rounded-[7px] text-[11px] font-semibold transition active:scale-95"
            style={{ color: 'var(--m-life)', background: 'rgba(var(--m-life-rgb),0.1)' }}
          >经期开始</button>
        )}
        <button
          type="button"
          onClick={() => setStatsOpen(true)}
          className="hp-more w-[26px] h-[26px] rounded-lg grid place-items-center flex-shrink-0 transition active:scale-95"
          style={{ color: 'var(--m-life)', background: 'rgba(var(--m-life-rgb),0.08)', '--hc': 'var(--m-life)' }}
          title="关系数据"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 20V11M12 20V5M19 20v-6" /></svg>
        </button>
      </div>

      {/* 今天的状态：一键即存，再点一次取消 */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          {REL_TAGS.map(t => {
            const on = todayLog?.tag === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => toggleTag(t.key)}
                className="h-[26px] px-2.5 rounded-full text-[12px] font-medium transition active:scale-95"
                style={on
                  ? { color: t.color, background: hexToRgba(t.color, 0.14), border: `1px solid ${hexToRgba(t.color, 0.5)}` }
                  : { color: 'var(--text-2)', background: 'transparent', border: '1px solid rgba(60,60,67,0.16)' }}
              >{t.label}</button>
            );
          })}
          <button
            type="button"
            onClick={openNote}
            className="w-[24px] h-[24px] rounded-full grid place-items-center flex-shrink-0 text-ink-400 hover:bg-black/5"
            title={todayLog?.note ? '修改备注' : '添加备注'}
          >
            <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none">
              <path d="M8.4 1.9l1.7 1.7-5.9 5.9-2.3.6.6-2.3 5.9-5.9z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        <div className="flex-1" />
        {/* 最近 7 天：只用来回看，不可点击（避免和「今天」两套编辑入口打架） */}
        <div className="flex items-end gap-1" title="最近 7 天">
          {week.map(d => {
            const lg = logs.find(l => l.date === d);
            const color = lg?.tag ? (TAG_MAP[lg.tag]?.color || BLANK_COLOR) : BLANK_COLOR;
            return (
              <div key={d} className="flex flex-col items-center gap-0.5">
                <span
                  className="w-[11px] h-[11px] rounded-[3px] block"
                  style={{
                    background: color,
                    boxShadow: d === todayStr ? '0 0 0 1.5px var(--surface-card), 0 0 0 2.5px var(--m-life)' : 'none',
                  }}
                  title={`${Number(d.slice(5, 7))}.${d.slice(8)} 周${weekdayOf(d)}${lg?.note ? ` · ${lg.note}` : ''}`}
                />
                <span className="text-[9px] text-ink-300 leading-none">{weekdayOf(d)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 备注：有内容时常驻一行，点铅笔编辑 */}
      {(noteOpen || todayLog?.note) && (
        <div className="flex items-center gap-2">
          {noteOpen ? (
            <>
              <input
                autoFocus
                value={noteDraft}
                onChange={e => setNoteDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') saveNote();
                  if (e.key === 'Escape') setNoteOpen(false);
                }}
                placeholder="今天发生了什么（写事件，不写评价）"
                maxLength={200}
                className="flex-1 h-[26px] px-2 rounded-md text-[12px] text-ink-800 outline-none"
                style={{ background: 'rgba(120,120,128,0.08)', border: '1px solid rgba(60,60,67,0.1)' }}
              />
              <button type="button" onClick={saveNote} className="text-[11px] font-semibold" style={{ color: 'var(--m-life)' }}>保存</button>
            </>
          ) : (
            <button
              type="button"
              onClick={openNote}
              className="flex-1 text-left text-[12px] text-ink-600 truncate hover:underline"
              title={todayLog?.note}
            >{todayLog.note}</button>
          )}
        </div>
      )}

      <RelationStatsModal open={statsOpen} onClose={() => setStatsOpen(false)} />
    </div>
  );
}
