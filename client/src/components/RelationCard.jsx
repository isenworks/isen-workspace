import { useCallback, useEffect, useMemo, useState } from 'react';
import { API } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';
import { store } from '../utils/store.js';
import { today as getToday, addDaysISO } from '../utils/date.js';
import { hexToRgba } from '../utils/color.js';
import { REL_TAGS, TAG_MAP, BLANK_COLOR, cycleInfo, lastDays } from '../utils/relation.js';
import CardHead from './CardHead.jsx';
import RelationStatsModal from './RelationStatsModal.jsx';
import RelationCycleModal from './RelationCycleModal.jsx';

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
const weekdayOf = s => WEEK[new Date(`${s}T00:00:00`).getDay()];
const mdOf = s => `${Number(s.slice(5, 7))}.${s.slice(8, 10)}`;

/**
 * 首页「关系」卡（时间层第 4 张，与其他卡同规格）
 *   · 每天 20 秒：点一下状态即保存，再点一次取消；备注只写事件不写评价
 *   · 经期是区间：开始/结束/改日期/删除都在卡片头「周期设置」里，不在格子上逐日勾选
 *   · 空白天 = 未记录，不默认融洽
 */
export default function RelationCard({ onNav }) {
  const toast = useToast();
  const [logs, setLogs] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [statsOpen, setStatsOpen] = useState(false);
  const [cycleOpen, setCycleOpen] = useState(false);

  const todayStr = getToday();
  const from = addDaysISO(todayStr, -60);

  const load = useCallback(async () => {
    try {
      const r = await API.relation.list(from, todayStr);
      setLogs(r.logs || []);
      setPeriods(r.periods || []);
    } catch {
      /* 静默：不打扰首页，下次进页面会再拉 */
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
    setNoteOpen(false);
    if (!tag && !note) {
      setLogs(prev => prev.filter(l => l.date !== todayStr));
      try { await API.relation.log(todayStr, '', ''); } catch { load(); }
      return;
    }
    setLogs(prev => [...prev.filter(l => l.date !== todayStr), { date: todayStr, tag, note }]);
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

  return (
    <div className="glass-card p-4 flex flex-col min-h-0">
      <CardHead
        moduleKey="life"
        title="关系"
        sub={loading ? '加载中…' : cycle.label}
        onClick={() => setStatsOpen(true)}
        action={(
          <button
            type="button"
            onClick={() => setCycleOpen(true)}
            className="w-[26px] h-[26px] rounded-lg grid place-items-center flex-shrink-0 transition active:scale-95"
            style={{ color: 'var(--m-life)', background: 'rgba(var(--m-life-rgb),0.08)' }}
            title="周期设置"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M8 3v4M16 3v4M3 10h18" />
            </svg>
          </button>
        )}
      />

      <div className="flex flex-col gap-2.5 flex-1 min-h-0">
        {/* 今天：一键即存 */}
        <div>
          <div className="text-[11px] text-ink-400 mb-1.5">今天相处</div>
          <div className="grid grid-cols-2 gap-1.5">
            {REL_TAGS.map(t => {
              const on = todayLog?.tag === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => toggleTag(t.key)}
                  className="h-[27px] rounded-lg text-[12px] font-medium transition active:scale-[0.97] truncate px-1"
                  style={on
                    ? { color: t.color, background: hexToRgba(t.color, 0.13), border: `1px solid ${hexToRgba(t.color, 0.45)}` }
                    : { color: 'var(--text-2)', background: 'transparent', border: '1px solid rgba(60,60,67,0.14)' }}
                >{t.label}</button>
              );
            })}
          </div>
        </div>

        {/* 最近 7 天：只回看，不可点（避免和「今天」两套编辑入口打架） */}
        <div>
          <div className="text-[11px] text-ink-400 mb-1.5">最近 7 天</div>
          <div className="flex items-end gap-1">
            {week.map(d => {
              const lg = logs.find(l => l.date === d);
              const color = lg?.tag ? (TAG_MAP[lg.tag]?.color || BLANK_COLOR) : BLANK_COLOR;
              return (
                <div key={d} className="flex-1 min-w-0 flex flex-col items-center gap-1">
                  <span
                    className="w-full h-[22px] rounded-md block"
                    style={{
                      background: color,
                      boxShadow: d === todayStr ? '0 0 0 1.5px var(--surface-card), 0 0 0 2.5px var(--m-life)' : 'none',
                    }}
                    title={`${mdOf(d)} 周${weekdayOf(d)}${lg?.note ? ` · ${lg.note}` : ''}`}
                  />
                  <span className="text-[9.5px] text-ink-300 leading-none">{weekdayOf(d)}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 备注 + 写小记：有备注时常驻一行，点文字改备注 */}
        <div className="mt-auto pt-1">
          {noteOpen ? (
            <div className="flex items-center gap-1.5">
              <input
                autoFocus
                value={noteDraft}
                onChange={e => setNoteDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') saveNote();
                }}
                onBlur={saveNote}
                placeholder="今天发生了什么（写事件，不写评价）"
                maxLength={200}
                className="flex-1 min-w-0 h-[26px] px-2 rounded-md text-[12px] text-ink-800 outline-none"
                style={{ background: 'rgba(120,120,128,0.08)', border: '1px solid rgba(60,60,67,0.1)' }}
              />
            </div>
          ) : (
            <div className="flex items-center gap-1 min-w-0">
              <button
                type="button"
                onClick={openNote}
                className="flex items-center gap-1.5 min-w-0 text-[11.5px] text-ink-400 hover:text-ink-700 transition"
              >
                <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 12 12" fill="none">
                  <path d="M8.4 1.9l1.7 1.7-5.9 5.9-2.3.6.6-2.3 5.9-5.9z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                </svg>
                <span className="truncate">{todayLog?.note || '添加备注'}</span>
              </button>
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => onNav?.('inbox')}
                className="flex-shrink-0 text-[11px] text-ink-300 hover:text-[var(--m-life)] transition"
                title="去小记写完整复盘"
              >写小记</button>
            </div>
          )}
        </div>
      </div>

      <RelationStatsModal open={statsOpen} onClose={() => setStatsOpen(false)} />
      <RelationCycleModal
        open={cycleOpen}
        onClose={() => setCycleOpen(false)}
        onChanged={load}
      />
    </div>
  );
}
