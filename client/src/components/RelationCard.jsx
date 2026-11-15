import { useCallback, useEffect, useMemo, useState } from 'react';
import { API } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';
import { store } from '../utils/store.js';
import { today as getToday, addDaysISO } from '../utils/date.js';
import { hexToRgba } from '../utils/color.js';
import {
  MOODS, MOOD_MAP, BLANK_COLOR, cycleInfo, lastDays, resolveTags, tagOf,
} from '../utils/relation.js';
import CardHead from './CardHead.jsx';
import RelationStatsModal from './RelationStatsModal.jsx';
import RelationCycleModal from './RelationCycleModal.jsx';
import RelationTagModal from './RelationTagModal.jsx';

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
const weekdayOf = s => WEEK[new Date(`${s}T00:00:00`).getDay()];
const mdOf = s => `${Number(s.slice(5, 7))}.${s.slice(8, 10)}`;

/**
 * 首页「关系」卡（成长层，紧邻精力卡：两者都是「每天的状态」）
 *   · 一行相处标签 + 一行心情标签，点一下即存，再点取消
 *   · 相处标签可增删改（行尾「+」进入管理），改的是 label/color，key 不变以免统计口径漂移
 *   · 经期是区间：开始/结束/改日期/删除都在卡片头「周期设置」里
 *   · 空白天 = 未记录，不默认融洽
 */
export default function RelationCard({ onNav }) {
  const toast = useToast();
  const [logs, setLogs] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [statsOpen, setStatsOpen] = useState(false);
  const [cycleOpen, setCycleOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);

  const todayStr = getToday();
  const from = addDaysISO(todayStr, -60);

  const load = useCallback(async () => {
    try {
      const r = await API.relation.list(from, todayStr);
      setLogs(r.logs || []);
      setPeriods(r.periods || []);
      setTags(r.tags || []);
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
  const tagList = useMemo(() => resolveTags(tags), [tags]);
  const tagMap = useMemo(() => Object.fromEntries(tagList.map(t => [t.key, t])), [tagList]);

  // 任意一项变更都提交「当天完整状态」，避免后写的字段把先写的冲掉
  async function patchToday(patch) {
    const next = {
      tag: todayLog?.tag || '',
      mood: todayLog?.mood || '',
      note: todayLog?.note || '',
      ...patch,
    };
    setLogs(prev => {
      const rest = prev.filter(l => l.date !== todayStr);
      if (!next.tag && !next.mood && !next.note) return rest;
      return [...rest, { date: todayStr, ...next }];
    });
    try {
      await API.relation.log(todayStr, next.tag, next.note, next.mood);
    } catch (e) {
      toast.error(e.message || '保存失败');
      load();
    }
  }

  function toggleTag(key) { patchToday({ tag: todayLog?.tag === key ? '' : key }); }
  function toggleMood(key) { patchToday({ mood: todayLog?.mood === key ? '' : key }); }

  function openNote() {
    setNoteDraft(todayLog?.note || '');
    setNoteOpen(true);
  }
  function saveNote() {
    const note = noteDraft.trim();
    setNoteOpen(false);
    if (note === (todayLog?.note || '')) return;
    patchToday({ note });
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

      <div className="flex flex-col gap-2 flex-1 min-h-0">
        {/* 相处：一行标签，行尾「+」进入增删改 */}
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[10.5px] text-ink-400 flex-shrink-0 w-[22px]">相处</span>
          <div className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto no-sb">
            {tagList.map(t => {
              const on = todayLog?.tag === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => toggleTag(t.key)}
                  className="h-[22px] px-1.5 rounded-md text-[11px] font-medium transition active:scale-[0.97] whitespace-nowrap flex-shrink-0"
                  style={on
                    ? { color: t.color, background: hexToRgba(t.color, 0.14), border: `1px solid ${hexToRgba(t.color, 0.45)}` }
                    : { color: 'var(--text-2)', background: 'transparent', border: '1px solid rgba(60,60,67,0.14)' }}
                >{t.label}</button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => setTagOpen(true)}
            className="w-[18px] h-[18px] rounded-md grid place-items-center flex-shrink-0 transition"
            style={{ background: 'rgba(var(--m-life-rgb),0.08)', color: 'var(--m-life)' }}
            title="管理相处标签"
          >
            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="2.6" viewBox="0 0 24 24" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          </button>
        </div>

        {/* 心情：她的状态，一行四个 */}
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[10.5px] text-ink-400 flex-shrink-0 w-[22px]">心情</span>
          <div className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto no-sb">
            {MOODS.map(m => {
              const on = todayLog?.mood === m.key;
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => toggleMood(m.key)}
                  className="h-[22px] px-1.5 rounded-md text-[11px] font-medium transition active:scale-[0.97] whitespace-nowrap flex-shrink-0"
                  style={on
                    ? { color: m.color, background: hexToRgba(m.color, 0.14), border: `1px solid ${hexToRgba(m.color, 0.45)}` }
                    : { color: 'var(--text-2)', background: 'transparent', border: '1px solid rgba(60,60,67,0.14)' }}
                >{m.label}</button>
              );
            })}
          </div>
        </div>

        {/* 备注：给心情/摩擦留一个原因位，回车或失焦即存 */}
        <div className="min-w-0">
          {noteOpen ? (
            <input
              autoFocus
              value={noteDraft}
              onChange={e => setNoteDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveNote(); }}
              onBlur={saveNote}
              placeholder="今天发生了什么 / 心情的原因"
              maxLength={200}
              className="w-full h-[24px] px-2 rounded-md text-[11.5px] text-ink-800 outline-none"
              style={{ background: 'rgba(120,120,128,0.08)', border: '1px solid rgba(60,60,67,0.1)' }}
            />
          ) : (
            <button
              type="button"
              onClick={openNote}
              className="flex items-center gap-1.5 w-full min-w-0 text-[11.5px] text-ink-400 hover:text-ink-700 transition text-left"
            >
              <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 12 12" fill="none">
                <path d="M8.4 1.9l1.7 1.7-5.9 5.9-2.3.6.6-2.3 5.9-5.9z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
              </svg>
              <span className="truncate">{todayLog?.note || '添加备注'}</span>
            </button>
          )}
        </div>

        {/* 最近 7 天：只回看，不可点（避免和「今天」两套编辑入口打架） */}
        <div className="mt-auto">
          <div className="flex items-center gap-1">
            {week.map(d => {
              const lg = logs.find(l => l.date === d);
              const t = lg?.tag ? tagOf(tagMap, lg.tag) : null;
              const color = t ? t.color : BLANK_COLOR;
              const moodLabel = lg?.mood ? MOOD_MAP[lg.mood]?.label : '';
              return (
                <span
                  key={d}
                  className="flex-1 min-w-0 h-[18px] rounded-md block"
                  style={{
                    background: color,
                    boxShadow: d === todayStr ? '0 0 0 1.5px var(--surface-card), 0 0 0 2.5px var(--m-life)' : 'none',
                  }}
                  title={`${mdOf(d)} 周${weekdayOf(d)}${t ? ` · ${t.label}` : ''}${moodLabel ? ` · ${moodLabel}` : ''}${lg?.note ? ` · ${lg.note}` : ''}`}
                />
              );
            })}
            <button
              type="button"
              onClick={() => onNav?.('inbox')}
              className="flex-shrink-0 ml-0.5 text-[10.5px] text-ink-300 hover:text-[var(--m-life)] transition"
              title="去小记写完整复盘"
            >复盘</button>
          </div>
        </div>
      </div>

      <RelationStatsModal open={statsOpen} onClose={() => setStatsOpen(false)} />
      <RelationCycleModal open={cycleOpen} onClose={() => setCycleOpen(false)} onChanged={load} />
      <RelationTagModal
        open={tagOpen}
        onClose={() => setTagOpen(false)}
        tags={tagList}
        onChanged={load}
      />
    </div>
  );
}
