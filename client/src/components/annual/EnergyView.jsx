import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { HABITS } from './data.js';
import { pct } from './utils.js';
import { EditableTitle } from './ui.jsx';
import { usePersistentState } from './hooks.js';
import { Sparkline } from './OverviewView.jsx';
import { moduleColor, moduleRgba } from '../../utils/color.js'
import BookForm from '../forms/BookForm.jsx'
import DualMarkerBar from '../DualMarkerBar.jsx'

export function EnergyView({ realHabits, loading, onAction, onSetTarget }) {
  const months = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
  const habits = realHabits || HABITS;
  // 正在编辑目标的行 habit key，null = 不编辑
  const [editingTargetKey, setEditingTargetKey] = useState(null);
  const [targetDraft, setTargetDraft] = useState('');
  // 联动状态：L2各月数据点击月份 → L3日历切换到对应月
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  // ★ ② Card2「各月数据」折叠状态（默认折叠，只显示标题行）
  const [monthsCollapsed, setMonthsCollapsed] = useState(true);
  // 三卡标题：右键可编辑（usePersistentState 持久化，清空回落默认文案）
  const [yearTitle, setYearTitle] = usePersistentState('annual_energy_year_title', () => '');
  const [monthsTitle, setMonthsTitle] = usePersistentState('annual_energy_months_title', () => '');
  const [monthTitle, setMonthTitle] = usePersistentState('annual_energy_month_title', () => '');

  if (loading && !realHabits) {
    return (
      <div className="flex flex-col gap-4">
        <div className="glass-card p-16 flex flex-col items-center justify-center gap-4">
          <div className="relative w-10 h-10">
            <div className="absolute inset-0 rounded-full border-2 border-ink-100" />
            <div className="absolute inset-0 rounded-full border-2 border-brand-500 border-t-transparent" style={{ animation: 'spin 0.8s linear infinite' }} />
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="text-sm font-semibold text-ink-700">正在同步习惯数据...</span>
            <span className="text-xs text-ink-500">从工作台自动读取精力类习惯的年度打卡记录</span>
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }
  if (habits.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <div className="glass-card p-16 flex flex-col items-center justify-center gap-3 text-center">
          <div className="w-12 h-12 rounded-2xl bg-accent-green/10 grid place-items-center">
            <svg className="w-6 h-6 text-accent-green" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          </div>
          <div className="flex flex-col items-center gap-1">
            <p className="text-sm font-bold text-ink-900">还没有精力类习惯</p>
            <p className="text-xs text-ink-500 max-w-sm">前往工作台「习惯」面板创建睡眠、喝水、运动等打卡习惯，<br/>这里会自动同步年度打卡数据</p>
          </div>
        </div>
      </div>
    );
  }

  // 直接展示 1-12 月，不分上下半年
  const monthIndices = [1,2,3,4,5,6,7,8,9,10,11,12];
  const monthLabels = months;
  const monthMaxDays = [31,28,31,30,31,30,31,31,30,31,30,31];
  const today = new Date();
  const year = today.getFullYear();
  const curMonth = today.getMonth() + 1;
  const curDay = today.getDate();
  const isCurrentMonth = (m) => m === curMonth;
  const daysElapsedInCurMonth = curDay;

  // 计算习惯的月度分析
  const getMonthAnalysis = (habit) => {
    const curMonthVal = habit.month?.[curMonth] || 0;
    const prevMonthIdx = curMonth === 1 ? 12 : curMonth - 1;
    const prevMonthVal = habit.month?.[prevMonthIdx] || 0;
    const expectedCur = daysElapsedInCurMonth;
    const achievementRate = expectedCur > 0 ? Math.round((curMonthVal / expectedCur) * 100) : 0;
    const delta = prevMonthVal > 0 ? Math.round(((curMonthVal - prevMonthVal) / prevMonthVal) * 100) : null;
    return { curMonthVal, prevMonthVal, achievementRate, delta, expectedCur };
  };

  // 计算精力模块完成率
  const energyPct = habits.length > 0
    ? Math.round(habits.reduce((s, h) => s + pct(h.val, h.target), 0) / habits.length)
    : 0;

  // 开始编辑目标
  const startEditTarget = (h) => {
    setEditingTargetKey(h.id || h.key);
    setTargetDraft(String(h.target));
  };
  // 提交目标修改
  const commitTarget = (h) => {
    const key = h.id || h.key;
    const v = Math.round(Number(targetDraft) || 0);
    if (v > 0 && v !== h.target) {
      onSetTarget?.(key, v);
    }
    setEditingTargetKey(null);
    setTargetDraft('');
  };

  return (
    <div className="flex flex-col gap-4">
      {/* ========== Card 1 / 3：年度数据概览 ========== */}
      <div className="glass-card p-4 overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="w-[5px] h-[18px] rounded-full bg-accent-green flex-shrink-0"></span>
            <EditableTitle value={yearTitle} onChange={setYearTitle} fallback={`${year}年 · 年度数据`}
              className="text-[16px] font-bold text-ink-900" inputClassName="text-[16px] font-bold text-ink-900" />
          </div>
          <button onClick={() => onAction?.('addHabit')}
            className="w-[26px] h-[26px] rounded-lg grid place-items-center transition hover:brightness-105 active:scale-95 flex-shrink-0"
            style={{ background: moduleRgba('energy', 0.10), border: `1px solid ${moduleRgba('energy', 0.25)}`, color: 'var(--m-energy)' }}
            title="添加精力习惯">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {habits.map((h, hIdx) => {
            const yearlyPct = pct(h.val, h.target);
            const GREEN = 'var(--m-energy)';
            const padNum = String(hIdx + 1).padStart(2, '0');
            const isEditingYear = editingTargetKey === (h.id || h.key);
            const EMOJI_STRIP_RE = new RegExp(String.raw`^\s*[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{1F000}-\u{1F02F}✅\u{2700}-\u{27BF}✅]\s*`, 'gu');
            const cleanLabel = (h.label || '').replace(EMOJI_STRIP_RE, '').trim() || h.label || '';

            const yearCounts = [];
            const yearMonthLabels = [];
            for (let m = 1; m <= 12; m++) {                       // ★ 1..12 全年（不止当前月）
              yearCounts.push(h.month?.[m] || 0);
              yearMonthLabels.push(`${m}月`);
            }

            return (
              <div key={h.key}
                className="grid p-3 pb-1.5 rounded-2xl bg-white border border-ink-100 shadow-[0_1px_2px_rgba(17,24,39,0.03)] hover:shadow-[0_2px_6px_rgba(17,24,39,0.05)] transition-shadow h-[210px]"
                style={{ gridTemplateRows: 'auto auto 1fr' }}
                title="右击卡片修改年度目标"
                onContextMenu={(e) => { e.preventDefault(); startEditTarget(h); }}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <span
                      className="text-[12px] font-bold tabular-nums w-[24px] text-right flex-shrink-0 select-none leading-none"
                      style={{ color: GREEN }}>
                      {padNum}
                    </span>
                    <span className="text-[14px] font-semibold leading-none truncate flex-1 min-w-0 text-[#48484A]">
                      {cleanLabel}
                    </span>
                  </div>
                  <div className="flex items-center flex-shrink-0">
                    {/* ★ ③ 56/230天 改为能力页同款胶囊（L4894-4901 规格：px-2 h-[26px] rounded-lg 主题色10底/40框） */}
                    <span
                      className="inline-flex items-center px-3 h-[26px] rounded-full text-[11px] font-semibold tabular-nums leading-none"
                      style={{ background: `${moduleRgba('energy', 0.08)}`, color: GREEN }}
                    >
                      <span className="font-extrabold">{h.val}</span>
                      <span className="mx-0.5 opacity-50">/</span>
                      {isEditingYear ? (
                        <input
                          autoFocus
                          type="number"
                          min="1"
                          value={targetDraft}
                          onChange={(e) => setTargetDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitTarget(h);
                            if (e.key === 'Escape') { setEditingTargetKey(null); setTargetDraft(''); }
                          }}
                          onBlur={() => commitTarget(h)}
                          className="w-10 px-1 py-0 text-[11px] font-bold text-center border border-accent-green rounded outline-none focus:ring-2 focus:ring-accent-green/30 tabular-nums text-ink-900 bg-white"
                        />
                      ) : (
                        <span
                          className="opacity-70 cursor-pointer hover:opacity-100"
                          onClick={() => startEditTarget(h)}
                          title="点击或右击修改年度目标"
                        >
                          {h.target}{h.unit}
                        </span>
                      )}
                    </span>
                  </div>
                </div>
                {/* ★ ① 能力页同款 DualMarkerBar（实际完成率 vs 时间计划锚点）
                    zoom 0.92 整体缩一档：气泡/轨道/下方标签同步变小，视觉层级次于标题行 */}
                <div className="mt-1" style={{ }}>
                  <DualMarkerBar
                    actual={yearlyPct}
                    plan={Math.round(curMonth / 12 * 100)}
                    color={GREEN}
                    showBadge={false}
                    actualDetail={`累计打卡 ${h.val} / 年目标 ${h.target}${h.unit} = ${yearlyPct}%`}
                    planDetail={`时间锚点 ${Math.round(curMonth / 12 * 100)}%（${curMonth}/12 月）`}
                  />
                </div>
                {/* ★ 折线容器：grid 第 3 行 1fr，Sparkline 高度由父行实际分配（no 溢出） */}
                <div className="mt-2 w-full flex justify-center items-center overflow-hidden">
                  <Sparkline data={yearCounts} labels={yearMonthLabels} color={GREEN} width={420} height={90}
                    futureFrom={curMonth + 1} activeIdx={selectedMonth - 1}
                    currentIdx={curMonth - 1} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ========== Card 2 / 3：各月数据趋势（可折叠） ========== */}
      <div className="glass-card p-4 overflow-hidden">
        {/* ★ ② 标题行可点击折叠/展开：chevron 旋转指示状态 */}
        <div
          className="flex items-center justify-between cursor-pointer select-none group"
          onClick={() => setMonthsCollapsed(v => !v)}
          role="button"
          aria-expanded={!monthsCollapsed}
          aria-label={monthsCollapsed ? '展开各月数据' : '折叠各月数据'}>
          <div className="flex items-center gap-3">
            <span className="w-[5px] h-[18px] rounded-full bg-accent-green flex-shrink-0"></span>
            <EditableTitle value={monthsTitle} onChange={setMonthsTitle} fallback={`${year}年 · 各月数据`}
              className="text-[16px] font-bold text-ink-900" inputClassName="text-[16px] font-bold text-ink-900" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-ink-400 font-medium tabular-nums">{habits.length}项</span>
            <svg
              className={`w-[18px] h-[18px] text-ink-400 transition-transform duration-200 ${monthsCollapsed ? '' : 'rotate-180'}`}
              fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>
        {/* 折叠态：清空下方间距（标题与内容过渡紧凑）；展开态：微间距 */}
        <div className={monthsCollapsed ? '' : 'mt-2'}></div>
        {!monthsCollapsed && (
          <>
        <div className="grid habit-table px-0 py-1 bg-transparent text-[14px] font-semibold text-[#48484A]">
          <div className="grp-start whitespace-nowrap overflow-hidden text-ellipsis flex items-center gap-2">
          </div>
          <div className="text-center whitespace-nowrap rate-gap">完成率</div>
          <div className="text-center whitespace-nowrap cum-gap">累计</div>
          <div className="text-center whitespace-nowrap grp-end">目标</div>
          {monthLabels.map((m, idx) => {
            const monthNum = idx + 1;
            const isCur = isCurrentMonth(monthNum);
            const isSelected = selectedMonth === monthNum;
            const isFuture = monthNum > curMonth;
            const boldClass = isFuture ? '' : 'font-bold';
            return (
              <button
                key={m}
                onClick={() => !isFuture && setSelectedMonth(monthNum)}
                disabled={isFuture}
                className={[
                  'text-center whitespace-nowrap tabular-nums transition-colors rounded px-1 py-0.5',
                  boldClass,
                  isSelected
                    ? 'text-accent-green bg-accent-green/10 cursor-pointer'
                    : isFuture
                      ? 'text-ink-300 cursor-not-allowed'
                      : 'text-ink-600 hover:text-accent-green hover:bg-accent-green/5 cursor-pointer'
                ].join(' ')}
              >
                {m}
              </button>
            );
          })}
        </div>
        <div className="space-y-0.5">
        {habits.map((h, hIdx) => {
          const p = pct(h.val, h.target);
          const GREEN = 'var(--m-energy)';
          const hkey = h.id || h.key;
          const isEditing = editingTargetKey === hkey;
          const padNum = String(hIdx + 1).padStart(2, '0');
          const EMOJI_STRIP_RE = new RegExp(String.raw`^\s*[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{1F000}-\u{1F02F}✅\u{2700}-\u{27BF}✅]\s*`, 'gu');
          const cleanLabel = (h.label || '').replace(EMOJI_STRIP_RE, '').trim() || h.label || '';
          return (
            <div key={hkey} className="grid habit-table px-0 py-1.5 items-center transition-colors group rounded-xl hover:bg-ink-50/60"
              title="右击修改年度目标"
              onContextMenu={(e) => { e.preventDefault(); startEditTarget(h); }}>
              <div className="flex items-center gap-1.5 min-w-0 cursor-pointer grp-start whitespace-nowrap overflow-hidden text-ellipsis pl-0" onClick={() => onAction?.('editHabit', h)}>
                <span
                  className="text-[12px] font-bold tabular-nums w-[24px] text-right flex-shrink-0 select-none leading-none"
                  style={{ color: GREEN }}>
                  {padNum}
                </span>
                <span className="text-[14px] font-semibold truncate leading-none text-[#48484A]">{cleanLabel}</span>
              </div>
              <div className="flex justify-center items-center cursor-pointer rate-gap" onClick={() => onAction?.('editHabit', h)}>
                {h.target > 0 ? (
                  <span
                    className="relative flex-shrink-0 rounded-[6px] grid place-items-center select-none h-[28px]"
                    style={{
                      width: '56px',
                      background: GREEN,
                      color: '#fff',
                      boxShadow: '0 1px 2px rgba(52,199,89,0.25)',
                    }}>
                    <span className="flex items-baseline leading-none">
                      <span className="text-[12px] font-bold tabular-nums">{p}</span>
                      <span className="text-[9px] font-semibold opacity-85 ml-[1px]">%</span>
                    </span>
                  </span>
                ) : (
                  <span className="text-[11px] text-ink-300 font-medium leading-none">未设置</span>
                )}
              </div>
              <div className="text-center font-semibold tabular-nums text-ink-700 text-[14px] cum-gap">{h.val}</div>
              <div className="text-center tabular-nums font-medium grp-end" onClick={(e) => e.stopPropagation()}>
                {isEditing ? (
                  <input
                    autoFocus
                    type="number"
                    min="1"
                    value={targetDraft}
                    onChange={(e) => setTargetDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitTarget(h);
                      if (e.key === 'Escape') { setEditingTargetKey(null); setTargetDraft(''); }
                    }}
                    onBlur={() => commitTarget(h)}
                    className="w-16 mx-auto px-2 py-1 text-[14px] font-bold text-center border border-accent-green rounded-md outline-none focus:ring-2 focus:ring-accent-green/30 tabular-nums text-ink-900 bg-white"
                  />
                ) : (
                  <div onClick={() => startEditTarget(h)} title="点击或右击修改年度目标" className="inline-flex items-center justify-center gap-0 hover:bg-accent-green/8 rounded-md transition cursor-pointer px-2">
                    <span className="text-[14px] font-medium text-ink-500 tabular-nums text-center">{h.target}</span>
                    <span className="text-[12px] text-ink-500 ml-1">{h.unit}</span>
                  </div>
                )}
              </div>
              {monthIndices.map((monthIdx) => {
                const n = h.month?.[monthIdx] || 0;
                const isFuture = monthIdx > curMonth;
                const isCur = isCurrentMonth(monthIdx);
                let cellBg = '';
                let cellText = '';
                let cellBorder = '';
                let cellRing = '';
                if (n > 0) {
                  cellBg = 'bg-accent-green/15';
                  cellText = 'text-accent-green font-bold';
                } else if (isFuture) {
                  cellBg = 'bg-ink-50';
                  cellText = 'text-ink-300 font-semibold';
                  cellBorder = 'border border-ink-100';
                } else {
                  cellBg = 'bg-ink-100';
                  cellText = 'text-ink-400 font-semibold';
                }
                if (isCur) {
                  cellRing = n > 0
                    ? 'ring-2 ring-accent-green/40 ring-offset-1'
                    : 'ring-2 ring-ink-300/50 ring-offset-1';
                }
                return (
                  <div key={monthIdx} className="flex justify-center">
                    <span className={[
                      'text-[12px] tabular-nums text-center leading-none grid place-items-center transition-colors',
                      'aspect-square w-[30px] h-[30px] rounded-md',
                      cellBg, cellText, cellBorder, cellRing
                    ].join(' ')}>{n}</span>
                  </div>
                );
              })}
            </div>
          );
        })}
        </div>
        </>
        )}
      </div>

      {/* ========== Card 3 / 3：当月打卡日历 ========== */}
      <div className="glass-card p-4 overflow-hidden">
        {/* ★ ③ 标题行：标题居左，月份 Tab 移到同一行最右侧（书架 Tab 同款规格） */}
        <div className="flex items-center justify-between gap-3 mb-2.5">
          <span className="flex items-center gap-3 flex-shrink-0">
            <span className="w-[5px] h-[18px] rounded-full bg-accent-green flex-shrink-0"></span>
            <EditableTitle value={monthTitle} onChange={setMonthTitle} fallback={`${year}年 · ${selectedMonth}月数据`}
              className="text-[16px] font-bold text-ink-900" inputClassName="text-[16px] font-bold text-ink-900" />
          </span>
          {/* 12 月份 Tab · 书架 Tab 同款；左侧渐隐(避免溢出时生硬截断)+右侧内边距(保证最右月完整可见) */}
          <div className="flex items-center gap-1 min-w-0 flex-1 justify-end overflow-x-auto px-2 pr-1"
            style={{
              WebkitMaskImage: 'linear-gradient(to right, transparent, black 18px, black 100%)',
              maskImage: 'linear-gradient(to right, transparent, black 18px, black 100%)',
            }}>
            {monthIndices.map(m => {
              const isCurrent = m === curMonth;
              const isPast = m < curMonth;
              const selected = m === selectedMonth;
              const monthTotal = habits.reduce((s, hh) => s + (hh.month?.[m] || 0), 0);
              return (
                <button key={m} type="button" onClick={() => setSelectedMonth(m)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[10px] transition-all duration-150 whitespace-nowrap flex-shrink-0 cursor-pointer active:scale-[.96]"
                  style={{
                    background: selected ? 'var(--m-energy)' : 'transparent',
                    color: selected ? '#ffffff' : '#64748b',
                    fontWeight: selected ? 700 : 500,
                    fontSize: '11.5px',
                    boxShadow: selected ? 'none' : 'inset 0 0 0 1px rgba(15,23,42,0.05)',
                  }}
                  title={`${m}月 · 累计打卡 ${monthTotal}`}>
                  {isCurrent && !selected && (
                    <span className="w-[5px] h-[5px] rounded-full flex-shrink-0" style={{ background: 'var(--m-energy)' }} />
                  )}
                  <span>{m}月</span>
                  <span className="inline-flex items-center justify-center min-w-[17px] h-[15px] px-1 rounded-full text-[10px] font-bold tabular-nums leading-none"
                    style={{
                      background: selected ? 'rgba(255,255,255,0.28)' : 'rgba(15,23,42,0.05)',
                      color: selected ? '#ffffff' : (isPast ? 'var(--m-energy)' : '#64748b'),
                    }}>
                    {isCurrent || isPast ? monthTotal : 0}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ★ ③ 图例移到卡片最右边（flex 居右，与月份 Tab 同级第二行末尾；三态颜色语义保留） */}
        <div className="flex items-center justify-end text-[11px] text-ink-400 mb-3 ml-auto">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-[14px] h-[14px] rounded-md bg-accent-green/15 text-accent-green grid place-items-center" style={{border: '1px solid rgba(52,199,89,0.25)'}}>
                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </span>已打卡
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-[14px] h-[14px] rounded-md bg-ink-100 shadow-[0_0_0_1px_rgba(17,24,39,0.04)]"></span>未打卡
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-[14px] h-[14px] rounded-md bg-ink-50 border border-ink-200"></span>未开始
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-3.5">
          {habits.map((h, hidx) => {
            const daysTotal = monthMaxDays[selectedMonth - 1];
            const realDates = h.monthDates?.[selectedMonth];
            const completedDays = realDates
              ? realDates
              : new Set(Array.from({ length: h.month?.[selectedMonth] || 0 }, (_, i) => i + 1));
            const GREEN = 'var(--m-energy)';
            const padNum = String(hidx + 1).padStart(2, '0');
            const EMOJI_STRIP_RE = new RegExp(String.raw`^\s*[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{1F000}-\u{1F02F}✅\u{2700}-\u{27BF}✅]\s*`, 'gu');
            const cleanLabel = (h.label || '').replace(EMOJI_STRIP_RE, '').trim() || h.label || '';

            const YEAR_DAYS = 365;
            const monthWeight = daysTotal / YEAR_DAYS;
            const monthlyTarget = Math.max(1, Math.ceil((h.target || 0) * monthWeight));

            const doneCount = completedDays.size;
            const monthRate = monthlyTarget > 0 ? Math.min(100, Math.round((doneCount / monthlyTarget) * 100)) : 0;
            return (
              <div key={h.key}
                className="grid items-stretch"
                style={{ gridTemplateColumns: '145px 130px minmax(0, 1fr)', columnGap: '14px' }}>
                {/* 列①：标签列（145px 固定宽度） */}
                <div className="flex items-center gap-1.5 w-full">
                  <span
                    className="text-[12px] font-bold tabular-nums w-[24px] text-right flex-shrink-0 select-none leading-none"
                    style={{ color: GREEN }}>
                    {padNum}
                  </span>
                  <span className="text-[14px] font-semibold truncate leading-none text-[#48484A] min-w-0 flex-1">
                    {cleanLabel}
                  </span>
                </div>
                {/* 列②：KPI列（%胶囊 + 累计数字 左端对齐） */}
                <div className="flex items-center justify-start gap-[10px] w-full h-full">
                  {monthlyTarget > 0 ? (
                    <>
                      <span
                        className="relative flex-shrink-0 rounded-[6px] grid place-items-center select-none h-full"
                        style={{
                          width: '56px',
                          background: GREEN,
                          color: '#fff',
                          boxShadow: '0 1px 2px rgba(52,199,89,0.25)',
                        }}>
                        <span className="flex items-baseline leading-none">
                          <span className="text-[12px] font-bold tabular-nums">{monthRate}</span>
                          <span className="text-[9px] font-semibold opacity-85 ml-[1px]">%</span>
                        </span>
                      </span>
                      <div className="flex items-baseline leading-none flex-shrink-0">
                        <span className="text-[12.5px] font-semibold tabular-nums text-[#48484A]">{doneCount}</span>
                        <span className="text-[12.5px] font-medium tabular-nums text-ink-400 mx-[3px]">/</span>
                        <span className="text-[12.5px] font-medium tabular-nums text-ink-500">{monthlyTarget}</span>
                        <span className="text-[12.5px] font-medium tabular-nums text-ink-400 ml-[2px]">{h.unit || '天'}</span>
                      </div>
                    </>
                  ) : (
                    <span className="text-[11px] text-ink-300 font-medium leading-none pl-1 self-center">未设置</span>
                  )}
                </div>
                {/* 列③：日历 */}
                <div className="flex-1 grid" style={{gridTemplateColumns: `repeat(${daysTotal}, minmax(0, 1fr))`, gap: '3px'}}>
                  {Array.from({ length: daysTotal }, (_, d) => {
                    const day = d + 1;
                    const isPast = selectedMonth < curMonth ? true : selectedMonth === curMonth ? day <= daysElapsedInCurMonth : false;
                    const isToday = selectedMonth === curMonth && day === daysElapsedInCurMonth;
                    const checked = completedDays.has(day);
                    let cellBg = '';
                    let cellText = '';
                    let cellRing = '';
                    let cellBorder = '';
                    if (checked) {
                      cellBg = 'bg-accent-green/15 text-accent-green';
                      cellText = 'font-bold';
                    } else if (!isPast) {
                      cellBg = 'bg-ink-50 text-ink-300';
                      cellText = 'font-semibold';
                      cellBorder = 'border border-ink-100';
                    } else {
                      cellBg = 'bg-ink-100 text-ink-400';
                      cellText = 'font-semibold';
                    }
                    if (isToday) {
                      cellRing = checked
                        ? 'ring-2 ring-accent-green/40 ring-offset-[1px]'
                        : 'ring-2 ring-ink-300/50 ring-offset-[1px]';
                    }
                    return (
                      <div key={day}
                        title={`${selectedMonth}月${day}日 · ${h.label}${checked ? ' · 已打卡' : !isPast ? ' · 未开始' : ' · 未打卡'}`}
                        className={[
                          'aspect-square rounded-md grid place-items-center',
                          'text-[12px] tabular-nums leading-none transition-colors',
                          cellBg, cellText, cellRing, cellBorder
                        ].join(' ')}>
                        {day}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ---------- 7.4 表单 · KR（BookForm 风格共享组件：Section 分组 + 白底输入框） ---------- */
