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
 * 首页「关系」卡（成长层第二行通栏，与精力同属「每天的状态」）
 *   三栏并列：相处（标签 + 原因备注）｜心情（标签 + 原因备注）｜最近 7 天
 *   · 点一下即存，再点取消；相处与心情各自有独立备注，不互相覆盖
 *   · 相处标签可增删改（行尾「+」），改 label/color 不改 key，统计口径不漂移
 *   · 经期是区间：开始/结束/改日期/删除都在「周期设置」；数据面板入口与精力同款柱状图标
 */
export default function RelationCard({ onNav }) {
  const toast = useToast();
  const [logs, setLogs] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editField, setEditField] = useState(''); // '' | 'note' | 'mood_note'
  const [draft, setDraft] = useState('');
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
      mood_note: todayLog?.mood_note || '',
      ...patch,
    };
    setLogs(prev => {
      const rest = prev.filter(l => l.date !== todayStr);
      if (!next.tag && !next.mood && !next.note && !next.mood_note) return rest;
      return [...rest, { date: todayStr, ...next }];
    });
    try {
      await API.relation.log(todayStr, next.tag, next.note, next.mood, next.mood_note);
    } catch (e) {
      toast.error(e.message || '保存失败');
      load();
    }
  }

  function toggleTag(key) { patchToday({ tag: todayLog?.tag === key ? '' : key }); }
  function toggleMood(key) { patchToday({ mood: todayLog?.mood === key ? '' : key }); }

  function openEdit(field) {
    setEditField(field);
    setDraft(todayLog?.[field] || '');
  }
  function saveEdit() {
    const field = editField;
    if (!field) return;
    const v = draft.trim();
    setEditField('');
    if (v === (todayLog?.[field] || '')) return;
    patchToday({ [field]: v });
  }

  // 一栏里的「标签 + 备注」块，相处与心情共用，只在文案与数据字段上不同
  // 用普通渲染函数而非内部组件：内部组件每次渲染都是新类型，会导致输入框重挂载、输入丢焦点
  function renderField({ label, chips, field, placeholder }) {
    const value = todayLog?.[field] || '';
    const editing = editField === field;
    return (
      <div className="flex flex-col min-w-0">
        <div className="text-[10.5px] text-ink-400 mb-1.5">{label}</div>
        {chips}
        <div className="mt-2 min-w-0">
          {editing ? (
            <input
              autoFocus
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveEdit(); }}
              onBlur={saveEdit}
              placeholder={placeholder}
              maxLength={200}
              className="w-full h-[24px] px-2 rounded-md text-[11.5px] text-ink-800 outline-none"
              style={{ background: 'rgba(120,120,128,0.08)', border: '1px solid rgba(60,60,67,0.1)' }}
            />
          ) : (
            <button
              type="button"
              onClick={() => openEdit(field)}
              className="flex items-center gap-1.5 w-full min-w-0 text-[11.5px] text-ink-400 hover:text-ink-700 transition text-left"
              title={value || placeholder}
            >
              <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 12 12" fill="none">
                <path d="M8.4 1.9l1.7 1.7-5.9 5.9-2.3.6.6-2.3 5.9-5.9z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
              </svg>
              <span className="truncate">{value || '添加备注'}</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  const chipCls = 'h-[22px] px-1.5 rounded-md text-[11px] font-medium transition active:scale-[0.97] whitespace-nowrap flex-shrink-0';
  const chipOff = { color: 'var(--text-2)', background: 'transparent', border: '1px solid rgba(60,60,67,0.14)' };

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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3 flex-1 min-h-0">

        {/* ---- 相处：标签 + 原因备注 ---- */}
        {renderField({
          label: '相处',
          field: 'note',
          placeholder: '今天发生了什么（写事件，不写评价）',
          chips: (
            <div className="flex items-center gap-1 min-w-0">
              <div className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto no-sb">
                {tagList.map(t => {
                  const on = todayLog?.tag === t.key;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => toggleTag(t.key)}
                      className={chipCls}
                      style={on
                        ? { color: t.color, background: hexToRgba(t.color, 0.14), border: `1px solid ${hexToRgba(t.color, 0.45)}` }
                        : chipOff}
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
          ),
        })}

        {/* ---- 心情：标签 + 原因备注（与相处独立存储，互不覆盖） ---- */}
        {renderField({
          label: '她的心情',
          field: 'mood_note',
          placeholder: '心情的原因，如「工作汇报被否」',
          chips: (
            <div className="flex items-center gap-1 min-w-0 overflow-x-auto no-sb">
              {MOODS.map(m => {
                const on = todayLog?.mood === m.key;
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => toggleMood(m.key)}
                    className={chipCls}
                    style={on
                      ? { color: m.color, background: hexToRgba(m.color, 0.14), border: `1px solid ${hexToRgba(m.color, 0.45)}` }
                      : chipOff}
                  >{m.label}</button>
                );
              })}
            </div>
          ),
        })}

        {/* ---- 最近 7 天：只回看，不可点（避免和「今天」两套编辑入口打架） ---- */}
        <div className="flex flex-col min-w-0">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10.5px] text-ink-400">最近 7 天</span>
            <button
              type="button"
              onClick={() => onNav?.('inbox')}
              className="text-[10.5px] text-ink-300 hover:text-[var(--m-life)] transition"
              title="去小记写完整复盘"
            >复盘</button>
          </div>
          <div className="flex items-center gap-1">
            {week.map(d => {
              const lg = logs.find(l => l.date === d);
              const t = lg?.tag ? tagOf(tagMap, lg.tag) : null;
              const moodLabel = lg?.mood ? MOOD_MAP[lg.mood]?.label : '';
              return (
                <div key={d} className="flex-1 min-w-0 flex flex-col items-center gap-1">
                  <span
                    className="w-full h-[20px] rounded-md block"
                    style={{
                      background: t ? t.color : BLANK_COLOR,
                      boxShadow: d === todayStr ? '0 0 0 1.5px var(--surface-card), 0 0 0 2.5px var(--m-life)' : 'none',
                    }}
                    title={`${mdOf(d)} 周${weekdayOf(d)}${t ? ` · ${t.label}` : ''}${moodLabel ? ` · ${moodLabel}` : ''}`}
                  />
                  <span className="text-[9.5px] text-ink-300 leading-none">{weekdayOf(d)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <RelationStatsModal open={statsOpen} onClose={() => setStatsOpen(false)} />
      <RelationCycleModal open={cycleOpen} onClose={() => setCycleOpen(false)} onChanged={load} />
      <RelationTagModal open={tagOpen} onClose={() => setTagOpen(false)} tags={tagList} onChanged={load} />
    </div>
  );
}
