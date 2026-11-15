import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { API } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';
import { store } from '../utils/store.js';
import { today as getToday, addDaysISO } from '../utils/date.js';
import { hexToRgba } from '../utils/color.js';
import { cycleInfo, lastDays, resolveMoods, resolveTags } from '../utils/relation.js';
import CardHead from './CardHead.jsx';
import RelationStatsModal from './RelationStatsModal.jsx';
import RelationCycleModal from './RelationCycleModal.jsx';
import RelationTagModal from './RelationTagModal.jsx';
import RelationDayModal from './RelationDayModal.jsx';
import { useLongPress } from './useLongPress.js';

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
  const [day, setDay] = useState(''); // 正在编辑的日期（点历史格子可回填）
  const [dlgDay, setDlgDay] = useState(''); // 单日记录弹窗（右击 / 长按格子）
  const [tip, setTip] = useState(null); // 悬浮提示 { date, field, x, y }
  const tipTimer = useRef(null);
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
  const moodList = useMemo(() => resolveMoods(tags), [tags]);
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

  // 悬浮提示：延迟 180ms 出现，避免横扫整行时反复闪
  function showTip(el, date, field) {
    if (!el) return;
    clearTimeout(tipTimer.current);
    const r = el.getBoundingClientRect();
    tipTimer.current = setTimeout(() => {
      setTip({ date, field, x: r.left + r.width / 2, y: r.top, bottom: r.bottom });
    }, 180);
  }
  function hideTip() {
    clearTimeout(tipTimer.current);
    setTip(null);
  }

  // 右击（桌面）/ 长按（触屏）= 打开当天的完整记录
  const lp = useLongPress();
  const openDayDialog = d => { hideTip(); setPicker(''); setDay(''); setDlgDay(d); };

  // 行内标签展开后，点卡片外任意位置或按 Esc 即收起（与本应用其他浮层同一套失焦关闭）
  const bodyRef = useRef(null);
  useEffect(() => {
    if (!picker) return;
    function onDown(e) {
      if (bodyRef.current && !bodyRef.current.contains(e.target)) {
        setPicker('');
        setDay('');
      }
    }
    function onKey(e) {
      if (e.key === 'Escape') { setPicker(''); setDay(''); }
    }
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [picker]);

  // 一行 = 名称 + 7 个日期格 + 当天状态/备注；点格选标签，右击（长按）开单日记录
  function renderRow({ name, valueKey, options, emptyText }) {
    const value = activeLog?.[valueKey] || '';
    const cur = options.find(o => o.key === value);
    const choosing = picker === valueKey;
    const isHist = activeDate !== todayStr;
    // 点格子 = 切到那一天并展开标签；历史日期用 day 记住回填目标
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
            const sel = d === activeDate && choosing;
            return (
              <button
                key={d}
                type="button"
                onClick={() => openDay(d)}
                {...lp.bind(() => openDayDialog(d))}
                onContextMenu={e => { e.preventDefault(); openDayDialog(d); }}
                onMouseEnter={e => showTip(e.currentTarget, d, valueKey)}
                onMouseLeave={hideTip}
                aria-label={`${mdOf(d)} 周${weekdayOf(d)}${o ? ` · ${o.label}` : ' · 未记录'}`}
                className={`rel-hcell editable${isTdy ? ' tdy' : ''}${o ? ' on' : ''}${sel ? ' sel' : ''}`}
                style={o
                  ? { background: o.color, ...(isTdy ? { '--cell-ring': hexToRgba(o.color, 0.45) } : {}) }
                  : undefined}
              >{dayNo(d)}</button>
            );
          })}
        </div>

        {isHist && (
          <button
            type="button"
            onClick={() => { setPicker(''); setDay(''); }}
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
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => setPicker(valueKey)}
              className="rel-val font-medium flex-shrink-0 rounded hover:opacity-70 transition"
              style={{ color: cur?.color || 'var(--text-3)' }}
              title="点击选择"
            >{cur?.label || emptyText}</button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="glass-card p-4 flex flex-col min-h-0 col-span-1 sm:col-span-2 lg:col-span-4">
      <CardHead
        moduleKey="life"
        title="关系"
        sub={loading ? '加载中…' : cycle.label}
        inlineAction
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

      <div className="rel-hb" ref={bodyRef}>
        {renderRow({
          name: '相处',
          valueKey: 'tag',
          options: tagList,
          emptyText: '未记录',
        })}
        {renderRow({
          name: '心情',
          valueKey: 'mood',
          options: moodList,
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
        >管理标签</button>
      </div>

      {/* 悬浮提示：日期 + 当天该行的状态与备注，最后一行教会右击编辑 */}
      {tip && (() => {
        const lg = logByDate[tip.date] || {};
        const opts = tip.field === 'tag' ? tagList : moodList;
        const o = opts.find(x => x.key === (lg[tip.field] || ''));
        const note = tip.field === 'tag' ? lg.note : lg.mood_note;
        const x = Math.min(Math.max(tip.x, 132), window.innerWidth - 132);
        // 上方空间不足时翻到格子下方，避免被视口顶部裁掉
        const below = tip.y < 130;
        return createPortal(
          <div
            className={`fixed z-[1050] pointer-events-none popover-enter w-[240px] -translate-x-1/2${below ? '' : ' -translate-y-full'}`}
            style={{ left: x, top: below ? tip.bottom + 8 : tip.y - 8 }}
          >
            <div
              className="rounded-xl px-2.5 py-2 shadow-lg"
              style={{ background: 'rgba(28,28,30,0.94)', color: '#fff' }}
            >
              <div className="flex items-center gap-1.5 text-[10.5px] opacity-70">
                <span className="tabular-nums">{mdOf(tip.date)} 周{weekdayOf(tip.date)}</span>
                {o && (
                  <span className="flex items-center gap-1">
                    <i className="w-1.5 h-1.5 rounded-full block" style={{ background: o.color }} />
                    {o.label}
                  </span>
                )}
              </div>
              <div className="text-[12px] leading-4 mt-1 whitespace-normal break-words">
                {note || <span className="opacity-50">还没有备注</span>}
              </div>
              <div className="text-[10px] opacity-45 mt-1">
                <span className="sm:hidden">长按编辑</span>
                <span className="hidden sm:inline">右击编辑</span>
              </div>
            </div>
          </div>,
          document.body
        );
      })()}

      <RelationStatsModal open={statsOpen} onClose={() => setStatsOpen(false)} />
      <RelationCycleModal open={cycleOpen} onClose={() => setCycleOpen(false)} onChanged={load} />
      <RelationTagModal open={tagOpen} onClose={() => setTagOpen(false)} tags={tags} onChanged={load} />
      <RelationDayModal
        open={!!dlgDay}
        date={dlgDay || todayStr}
        log={logByDate[dlgDay] || null}
        tags={tagList}
        moods={moodList}
        onPatch={patchDay}
        onClose={() => setDlgDay('')}
      />
    </div>
  );
}
