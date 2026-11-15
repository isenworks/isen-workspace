import { useCallback, useEffect, useMemo, useState } from 'react';
import { API } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';
import { store } from '../utils/store.js';
import { today as getToday, addDaysISO } from '../utils/date.js';
import { hexToRgba } from '../utils/color.js';
import { MOODS, cycleInfo, lastDays, resolveTags } from '../utils/relation.js';
import CardHead from './CardHead.jsx';
import RelationStatsModal from './RelationStatsModal.jsx';
import RelationCycleModal from './RelationCycleModal.jsx';
import RelationTagModal from './RelationTagModal.jsx';

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
const weekdayOf = s => WEEK[new Date(`${s}T00:00:00`).getDay()];
const mdOf = s => `${Number(s.slice(5, 7))}.${s.slice(8, 10)}`;
const dayNo = s => parseInt(s.slice(8), 10);

/**
 * 首页「关系」卡（成长层第二行通栏）
 *   结构与精力卡对齐：每行 = 名称 + 7 个日期格 + 行内说明，格子同为 24px / 5px 圆角 / 10px 数字。
 *   两行分别是「相处」「心情」，今天是可编辑格（点开在行内选标签），历史格只回看。
 *   相处与心情各自有独立备注，不互相覆盖；经期区间与统计入口都在卡头。
 */
export default function RelationCard({ onNav }) {
  const toast = useToast();
  const [logs, setLogs] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [picker, setPicker] = useState(''); // '' | 'tag' | 'mood'
  const [editField, setEditField] = useState(''); // '' | 'note' | 'mood_note'
  const [draft, setDraft] = useState('');
  const [day, setDay] = useState(''); // 正在编辑的日期（点历史格子可回填）
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
      /* 静默：首页不因关系数据失败而报错 */
    } finally {
      setLoading(false);
    }
  }, [from, todayStr]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => store.subscribe(msg => {
    if (msg?.type === 'reload') load();
  }), [load]);

  const week = useMemo(() => lastDays(7, todayStr), [todayStr]);
  const logByDate = useMemo(() => Object.fromEntries(logs.map(l => [l.date, l])), [logs]);
  const cycle = useMemo(() => cycleInfo(periods, todayStr), [periods, todayStr]);
  const tagList = useMemo(() => resolveTags(tags), [tags]);
  const activeDate = day || todayStr;
  const activeLog = logByDate[activeDate] || null;

  // 任意一项变更都提交「该日完整状态」，避免后写的字段把先写的冲掉。
  // date 默认今天；点历史格子后传入那一天，用于漏记回填。
  async function patchDay(date, patch) {
    const base = logByDate[date] || {};
    const next = {
      tag: base.tag || '',
      mood: base.mood || '',
      note: base.note || '',
      mood_note: base.mood_note || '',
      ...patch,
    };
    setLogs(prev => {
      const rest = prev.filter(l => l.date !== date);
      if (!next.tag && !next.mood && !next.note && !next.mood_note) return rest;
      return [...rest, { date, ...next }];
    });
    try {
      await API.relation.log(date, next.tag, next.note, next.mood, next.mood_note);
    } catch (e) {
      toast.error(e.message || '保存失败');
      load();
    }
  }

  function pick(field, key) {
    const cur = activeLog?.[field] || '';
    setPicker('');
    setDay('');
    patchDay(activeDate, { [field]: cur === key ? '' : key });
  }

  function openEdit(field) {
    setPicker('');
    setEditField(field);
    setDraft(activeLog?.[field] || '');
  }
  function saveEdit() {
    const field = editField;
    if (!field) return;
    const v = draft.trim();
    setEditField('');
    const date = activeDate;
    setDay('');
    if (v === (logByDate[date]?.[field] || '')) return;
    patchDay(date, { [field]: v });
  }

  // 一行 = 名称 + 7 个日期格 + 行内状态/备注；tag/mood 共用，只是取色与文案不同
  function renderRow({ name, valueKey, noteField, options, placeholder, emptyText }) {
    const value = activeLog?.[valueKey] || '';
    const cur = options.find(o => o.key === value);
    const note = activeLog?.[noteField] || '';
    const choosing = picker === valueKey;
    const editing = editField === noteField;
    const isHist = activeDate !== todayStr;
    // 回填历史日期时把占位文案的「今天」换成「那天」，避免写成今天
    const ph = isHist ? placeholder.replace('今天', '那天') : placeholder;
    // 点格子 = 切到那一天：今天不额外标记，历史日期用 day 记住回填目标
    function openDay(d) {
      if (choosing && activeDate === d) { setPicker(''); setDay(''); return; }
      setDay(d === todayStr ? '' : d);
      setPicker(valueKey);
    }
    return (
      <div className="rel-hrow" key={valueKey}>
        <span className="rel-hname">{name}</span>
        <div className="rel-hcells">
          {week.map(d => {
            const lg = logByDate[d];
            const o = options.find(x => x.key === (lg?.[valueKey] || ''));
            const isTdy = d === todayStr;
            const sel = d === activeDate && (choosing || editing);
            return (
              <button
                key={d}
                type="button"
                onClick={() => openDay(d)}
                className={`rel-hcell editable${isTdy ? ' tdy' : ''}${o ? ' on' : ''}${sel ? ' sel' : ''}`}
                style={o ? { background: o.color } : undefined}
                title={`${mdOf(d)} 周${weekdayOf(d)}${o ? ` · ${o.label}` : ' · 未记录'}${isTdy ? '（今天）' : '（点击记录）'}`}
              >{dayNo(d)}</button>
            );
          })}
        </div>

        {isHist && (
          <button
            type="button"
            onClick={() => { setPicker(''); setEditField(''); setDay(''); }}
            className="rel-daychip"
            title="回到今天"
          >{mdOf(activeDate)}</button>
        )}

        {choosing ? (
          <div className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto no-sb">
            {options.map(o => {
              const on = value === o.key;
              return (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => pick(valueKey, o.key)}
                  className="rel-chip"
                  style={on
                    ? { color: o.color, background: hexToRgba(o.color, 0.14), border: `1px solid ${hexToRgba(o.color, 0.45)}` }
                    : undefined}
                >{o.label}</button>
              );
            })}
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <button
              type="button"
              onClick={() => setPicker(valueKey)}
              className="rel-val font-medium flex-shrink-0 rounded hover:opacity-70 transition"
              style={{ color: cur?.color || 'var(--text-3)' }}
              title="点击选择"
            >{cur?.label || emptyText}</button>
            {editing ? (
              <input
                autoFocus
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditField(''); }}
                onBlur={saveEdit}
                placeholder={ph}
                maxLength={200}
                className="rel-note-input flex-1 min-w-0"
              />
            ) : (
              <button
                type="button"
                onClick={() => openEdit(noteField)}
                className="rel-val text-ink-300 hover:text-ink-600 truncate text-left min-w-0 transition"
                title={note || ph}
              >{note || ph}</button>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => openEdit(noteField)}
          className="w-[20px] h-[20px] flex-shrink-0 grid place-items-center rounded-md text-ink-300 hover:text-[var(--m-life)] transition"
          title={note ? '修改备注' : '添加备注'}
        >
          <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none">
            <path d="M8.4 1.9l1.7 1.7-5.9 5.9-2.3.6.6-2.3 5.9-5.9z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="glass-card p-4 flex flex-col min-h-0 col-span-1 sm:col-span-2 lg:col-span-4">
      <CardHead
        moduleKey="life"
        title="关系"
        sub={loading ? '加载中…' : cycle.label}
        action={(
          <>
            <button
              type="button"
              onClick={() => setCycleOpen(true)}
              className="hp-more w-[26px] h-[26px] rounded-lg grid place-items-center flex-shrink-0 transition active:scale-95"
              style={{ color: 'var(--m-life)', background: 'rgba(var(--m-life-rgb),0.08)', '--hc': 'var(--m-life)' }}
              title="周期设置"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M8 3v4M16 3v4M3 10h18" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setStatsOpen(true)}
              className="hp-more w-[26px] h-[26px] rounded-lg grid place-items-center flex-shrink-0 transition active:scale-95"
              style={{ color: 'var(--m-life)', background: 'rgba(var(--m-life-rgb),0.08)', '--hc': 'var(--m-life)' }}
              title="打卡数据"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 20V11M12 20V5M19 20v-6" /></svg>
            </button>
          </>
        )}
      />

      <div className="rel-hb">
        {renderRow({
          name: '相处',
          valueKey: 'tag',
          noteField: 'note',
          options: tagList,
          placeholder: '今天发生了什么',
          emptyText: '未记录',
        })}
        {renderRow({
          name: '心情',
          valueKey: 'mood',
          noteField: 'mood_note',
          options: MOODS,
          placeholder: '心情的原因',
          emptyText: '未记录',
        })}
      </div>

      <div className="flex items-center gap-3 mt-1 pt-1.5" style={{ borderTop: '1px solid rgba(60,60,67,0.06)' }}>
        <button
          type="button"
          onClick={() => onNav?.('inbox')}
          className="text-[10.5px] text-ink-300 hover:text-[var(--m-life)] transition"
          title="去小记写完整复盘"
        >写复盘</button>
        <button
          type="button"
          onClick={() => setTagOpen(true)}
          className="text-[10.5px] text-ink-300 hover:text-[var(--m-life)] transition"
        >管理相处标签</button>
      </div>

      <RelationStatsModal open={statsOpen} onClose={() => setStatsOpen(false)} />
      <RelationCycleModal open={cycleOpen} onClose={() => setCycleOpen(false)} onChanged={load} />
      <RelationTagModal open={tagOpen} onClose={() => setTagOpen(false)} tags={tagList} onChanged={load} />
    </div>
  );
}
