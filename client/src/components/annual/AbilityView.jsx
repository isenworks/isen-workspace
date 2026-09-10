import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { ABILITY } from './data.js';
import { calcRisk, calcTimeAnchor, daysLabel, pct } from './utils.js';
import { EditableTitle } from './ui.jsx';
import { usePersistentState } from './hooks.js';
import { moduleColor, moduleRgba } from '../../utils/color.js'
import DualMarkerBar from '../DualMarkerBar.jsx'

export function AbilityView({ abilities, onMsAdd, onMsEdit, onMsToggleDone, onAbilityAdd, onAbilityEdit, onAbilityRemove, onAbilityMarkDone, onAbilityRestore, scoreHistory, onStartAssessment }) {
  const dynAb = abilities || ABILITY;
  const year = new Date().getFullYear();
  const AB_COLOR = 'var(--m-ability)';
  const AB_DARK = 'var(--m-ability)';

  /* ===== 状态判定：混合式 —— status 字段优先（手动标记），
     无 status 的旧数据按里程碑派生（全部 done → 已完成），零迁移成本 ===== */
  const _statusOf = (a) => {
    if (a?.status === 'done') return 'done';
    const ms = a?.mstones || [];
    return ms.length > 0 && ms.every(m => m.st === 'done') ? 'done' : 'active';
  };

  /* ===== 2 Tab（进行中/已完成）+ ⋮ 菜单开合状态 ===== */
  const [abTab, setAbTab] = useState('active');
  const [openMenuId, setOpenMenuId] = useState(null);
  // 页头标题：右键可编辑（usePersistentState 持久化，清空回落默认文案）
  const [abilityTitle, setAbilityTitle] = usePersistentState('annual_ability_title', () => '');
  useEffect(() => {
    if (!openMenuId) return;
    const close = () => setOpenMenuId(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [openMenuId]);

  /* ===== 能力级派生统计 ===== */
  const abilityStats = useMemo(() => {
    return dynAb.map((a, idx) => {
      const mstones = a.mstones || [];
      const mDone = mstones.filter(m => m.st === 'done').length;
      const mTotal = mstones.length;
      const avgPct = mTotal ? Math.round(mDone / mTotal * 100) : 0;
      const { days, timePct } = calcTimeAnchor(a.deadline, a.createdAt);
      const rm = calcRisk(avgPct, timePct, mTotal && mstones.every(m => m.st === 'done'));
      return { idx, avgPct, rm, days, timePct, mDone, mTotal, dl: daysLabel(days) };
    });
  }, [dynAb]);

  /* ===== Hero 全局风险锚点 ===== */
  const heroStats = useMemo(() => {
    let risk = 0, warn = 0, overdue = 0;
    let earliest = null;
    abilityStats.forEach(as => {
      if (as.rm.q === 'risk') risk++;
      if (as.rm.q === 'warn') warn++;
      if (as.dl.overdue) overdue++;
      if (as.days !== null && as.days >= 0) {
        if (earliest === null || as.days < earliest) earliest = as.days;
      }
    });
    return { risk, warn, overdue, earliest };
  }, [abilityStats]);

  /* ===== 状态分区（对齐工作 tab 书架结构；能力页无归档概念，砍掉第三 Tab）===== */
  const partitioned = useMemo(() => {
    const active = [], done = [];
    dynAb.forEach((a, i) => {
      const entry = { a, as: abilityStats[i], idx: i };
      (_statusOf(a) === 'done' ? done : active).push(entry);
    });
    return { active, done };
  }, [dynAb, abilityStats]);

  /* ===== 卡片右上角 ⋮ 菜单（对齐工作页）：编辑 / 标记完成·回到进行中 / 删除 ===== */
  const renderCardMenu = (a, as) => {
    const st = _statusOf(a);
    const isOpen = openMenuId === a.id;
    const close = () => setOpenMenuId(null);
    const stop = (e) => e.stopPropagation();
    return (
      <div className="relative" onMouseDown={stop} onClick={stop}>
        <button
          onClick={(e) => { e.stopPropagation(); setOpenMenuId(prev => prev === a.id ? null : a.id); }}
          className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-ink-50 active:bg-ink-100/70 transition-colors"
          style={{ color: AB_COLOR }}
          title="更多操作"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/>
          </svg>
        </button>
        {isOpen && (
          <div className="absolute right-0 top-8 z-50 bg-white rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-ink-100 py-1.5 w-36 overflow-hidden animate-[fadeIn_0.12s_ease-out]">
            <button onClick={() => { close(); onAbilityEdit?.(as.idx); }}
              className="w-full text-left px-3.5 py-2 text-[13px] text-[#1d1d1f] hover:bg-[#f2f2f7] hover:rounded-md transition-colors">编辑</button>
            {st === 'active' ? (
              <button onClick={() => { close(); onAbilityMarkDone?.(a.id); }}
                className="w-full text-left px-3.5 py-2 text-[13px] text-[#34C759] font-medium hover:bg-[#f2f2f7] hover:rounded-md transition-colors">标记完成</button>
            ) : (
              <button onClick={() => { close(); onAbilityRestore?.(a.id); }}
                className="w-full text-left px-3.5 py-2 text-[13px] text-[#1d1d1f] hover:bg-[#f2f2f7] hover:rounded-md transition-colors">回到进行中</button>
            )}
            <button onClick={() => { close(); onAbilityRemove?.(as.idx); }}
              className="w-full text-left px-3.5 py-2 text-[13px] text-[#FA503E] hover:bg-[#f2f2f7] hover:rounded-md transition-colors">删除</button>
          </div>
        )}
      </div>
    );
  };

  /* ===== 能力卡片（色条+标题+胶囊+加号 / 进度条 / 复选框列表） ===== */
  const renderCard = (a, as) => {
    const AB = AB_COLOR;
    const lagBehind = as.timePct !== null && as.avgPct < as.timePct;
    const mstones = a.mstones || [];
    const st = _statusOf(a);

    return (
      <div key={a.id || a.title} className="bg-white rounded-2xl border border-ink-100 hover:shadow-md transition-shadow p-4 flex flex-col group">
        {/* 标题行：色条 + 16px 可编辑标题 | 删除(悬停) + 已勾选/总数胶囊 + 26×26 加号 */}
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-[5px] h-[18px] rounded-full flex-shrink-0" style={{ background: AB }}></span>
            <span
              className="text-[16px] font-bold leading-tight text-ink-900 truncate cursor-pointer hover:text-ink-700 transition-colors"
              onClick={() => onAbilityEdit?.(as.idx)}
              title="编辑能力目标">{a.title}</span>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* 已勾选/总数胶囊 */}
            <span
              className="inline-flex items-center px-3 h-[26px] rounded-full text-[11px] font-semibold tabular-nums leading-none"
              style={{ background: `${moduleRgba('ability', 0.08)}`, color: AB_DARK }}
            >
              <span className="font-extrabold">{as.mDone}</span>
              <span className="mx-0.5 opacity-50">/</span>
              <span className="opacity-70">{as.mTotal}</span>
            </span>
            {/* 添加里程碑：仅进行中显示（已完成卡不再加子项） */}
            {st === 'active' && (
              <button
                onClick={(e) => { e.stopPropagation(); onMsAdd?.(as.idx); }}
                title="添加里程碑"
                className="w-[26px] h-[26px] rounded-lg grid place-items-center transition hover:brightness-105 active:scale-95 flex-shrink-0"
                style={{ background: `${moduleRgba('ability', 0.10)}` }}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke={AB} strokeWidth="2.5" viewBox="0 0 24 24" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
              </button>
            )}
            {/* ⋮ 更多操作：编辑 / 标记完成·回到进行中 / 删除 */}
            {renderCardMenu(a, as)}
          </div>
        </div>

        {/* 进度条：双标记（实际 avgPct / 计划 timePct）— 工作页同款 DualMarkerBar
            zoom 0.92 整体缩一档，视觉层级次于标题行 */}
        {(() => {
          const remainTxt = (as.days !== null && as.days !== undefined && as.days > 0)
            ? (() => { const mo = Math.floor(as.days / 30); const dy = as.days % 30;
                return mo === 0 ? `剩余 ${dy} 天` : (dy === 0 ? `剩余 ${mo} 月` : `剩余 ${mo} 月 ${dy} 天`); })()
            : null;
          if (as.timePct === null || as.timePct === undefined) {
            return (
              <div className="mb-2.5">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-semibold text-ink-500 leading-none">总体完成度</span>
                  <span className="text-[11px] font-extrabold tabular-nums leading-none" style={{ color: AB_DARK }}>{as.avgPct}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-ink-100 overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${as.avgPct}%`, background: AB }}></div>
                </div>
              </div>
            );
          }
          return (
            <div className="-mt-0.5" style={{ }}>
              <DualMarkerBar
                actual={as.avgPct}
                plan={as.timePct}
                color={AB_COLOR}
                showBadge={false}
                actualDetail={`里程碑完成 ${as.mDone}/${as.mTotal}（${as.avgPct}%）`}
                planDetail={`时间锚点 ${as.timePct}%${remainTxt ? ' · ' + remainTxt : ''}`}
              />
            </div>
          );
        })()}

        {/* KR 列表：复选框 + 主文字 13px + 子说明 11px；max-h 限高对齐三卡 */}
        {mstones.length === 0 ? (
          <div className="py-4 text-center rounded-xl" style={{ background: 'rgba(15,23,42,0.03)' }}>
            <div className="text-[12px] font-semibold text-ink-400">还没有 KR</div>
            <div className="text-[11px] text-ink-400 mt-1 opacity-80">点击右上角 + 添加</div>
          </div>
        ) : (
          <div className="flex flex-col max-h-[240px] overflow-y-auto">
            {mstones.map((m, i) => {
              const isDone = m.st === 'done';
              const isDoing = m.st === 'doing';
              /* 需求 3：状态徽章 — 未开始（灰）/ 进行中（橙·带进度）/ 已完成（绿）*/
              const STATUS_META = isDone
                ? { label: '已完成', color: '#34C759' }
                : isDoing
                  ? { label: '进行中', color: AB }
                  : { label: '未开始', color: '#8E8E93' };
              return (
                <div
                  key={m.id || i}
                  className="flex items-center gap-2 px-1 py-2 rounded-lg hover:bg-ink-50/50 transition-colors group"
                >
                  {/* 复选框：未勾白底橙边，已勾橙底白勾 —— 与主文字 items-center 居中对齐 */}
                  <button
                    onClick={(e) => { e.stopPropagation(); onMsToggleDone?.({ abilityIdx: as.idx, msIdx: i }); }}
                    className="w-4 h-4 rounded-full grid place-items-center flex-shrink-0 transition-all"
                    style={{
                      background: isDone ? AB : '#fff',
                      border: `1.5px solid ${AB}`,
                    }}
                  >
                    {isDone && (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7"/></svg>
                    )}
                  </button>
                  {/* 文字区：主文字 13px semibold ink-700 —— 对齐知力页 OKR KR 规格；长标题 2 行截断 */}
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={(e) => { e.stopPropagation(); onMsEdit?.(as.idx, i, m); }}>
                    <div className="flex items-center gap-1.5">
                      <div className={`text-[13px] font-semibold leading-snug line-clamp-2 ${isDone ? 'text-ink-400 line-through' : 'text-[#48484A]'}`}>
                        {m.lb}
                      </div>
                      {/* 需求 3：状态徽章 */}
                      <span
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 select-none"
                        style={{ background: `${STATUS_META.color}15`, color: STATUS_META.color }}
                      >
                        {STATUS_META.label}{isDoing && m.pct != null ? ` ${Math.round(Number(m.pct))}%` : ''}
                      </span>
                    </div>
                    {m.dueBy && (
                      <div className="text-[11px] text-ink-500 mt-0.5 leading-tight">
                        {m.dueBy}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {/* ========== Header · 书架风（对齐工作 tab 横条）：色条 + 标题·计数 | 2 Tab | + 新建 ========== */}
      <div className="w-full glass-card rounded-2xl p-4">
        <div className="flex items-center gap-3 flex-wrap">
          {/* 左：色条 + 标题 + 计数（对齐工作页左端 33px 视觉线） */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <span className="w-[5px] h-[18px] rounded-full flex-shrink-0" style={{ background: AB_COLOR }}></span>
            <EditableTitle value={abilityTitle} onChange={setAbilityTitle} fallback={`${year}年 · 能力目标`}
              className="text-[15.5px] font-bold text-ink-900 leading-none whitespace-nowrap" inputClassName="text-[15.5px] font-bold text-ink-900" />
            <span className="text-[11px] text-ink-400 tabular-nums leading-none whitespace-nowrap">能力 · {dynAb.length}</span>
          </div>

          {/* 中：2 Tab（标题右边）—— 工作页同款 pill 样式 */}
          <div className="flex items-center gap-1 ml-auto flex-shrink-0">
            {(() => {
              const TABS = [
                { key: 'active', lb: '进行中', col: AB_COLOR,  n: partitioned.active.length },
                { key: 'done',   lb: '已完成', col: '#34C759', n: partitioned.done.length },
              ];
              return TABS.map(t => {
                const active = abTab === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => setAbTab(t.key)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[10px] transition-all duration-150"
                    style={{
                      background: active ? AB_COLOR : 'transparent',
                      color: active ? '#ffffff' : '#64748b',
                      fontWeight: active ? 700 : 500,
                      fontSize: '11.5px',
                      boxShadow: active ? 'none' : 'inset 0 0 0 1px rgba(15,23,42,0.05)',
                    }}>
                    <span className="relative w-[11px] h-[11px] rounded-full flex-shrink-0 flex items-center justify-center"
                      style={{ background: active ? 'rgba(255,255,255,0.25)' : (t.col + '22') }}>
                      <span className="w-[5.5px] h-[5.5px] rounded-full" style={{ background: active ? '#ffffff' : t.col }}></span>
                    </span>
                    <span>{t.lb}</span>
                    <span className="inline-flex items-center justify-center min-w-[17px] h-[15px] px-1 rounded-full text-[10px] font-bold tabular-nums leading-none"
                      style={{
                        background: active ? 'rgba(255,255,255,0.28)' : 'rgba(15,23,42,0.05)',
                        color: active ? '#ffffff' : '#64748b',
                      }}>
                      {t.n}
                    </span>
                  </button>
                );
              });
            })()}
          </div>

          {/* 右：新建能力按钮（26×26，能力橙底） */}
          <div className="flex items-center gap-1 ml-3 flex-shrink-0">
            <button
              onClick={() => onAbilityAdd?.()}
              className="inline-flex items-center justify-center w-[26px] h-[26px] rounded-lg transition flex-shrink-0"
              style={{ color: AB_COLOR, background: `${moduleRgba('ability', 0.10)}` }}
              title="新建能力">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" strokeLinecap="round"/></svg>
            </button>
          </div>
        </div>
      </div>

      {/* ===== Tab 1：进行中 → 现有卡片网格（原布局不动） ===== */}
      {abTab === 'active' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
          {partitioned.active.map(en => renderCard(en.a, en.as))}
          {partitioned.active.length === 0 && (
            <div className="col-span-full rounded-2xl border border-dashed border-ink-200 flex flex-col items-center justify-center gap-2 py-12" style={{ background: 'rgba(15,23,42,0.02)' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#c7c7cc" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="5"/><path d="M15.5 13a6 6 0 1 0-7 0M12 13v6M8 22h8"/></svg>
              <div className="text-[12px] text-ink-400 font-medium">还没有进行中的能力目标</div>
              <button
                onClick={() => onAbilityAdd?.()}
                className="inline-flex items-center gap-1 rounded-xl text-[11px] font-bold px-3 py-1.5 transition hover:brightness-105 active:scale-[0.98]"
                style={{ background: `${moduleRgba('ability', 0.15)}`, color: AB_DARK }}>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
                添加第一个能力
              </button>
            </div>
          )}
        </div>
      )}

      {/* ===== Tab 2：已完成 → 简化网格（复用完整卡，进度 100%，⋮ 可回退） ===== */}
      {abTab === 'done' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
          {partitioned.done.map(en => renderCard(en.a, en.as))}
          {partitioned.done.length === 0 && (
            <div className="col-span-full w-full glass-card rounded-2xl p-10 flex flex-col items-center justify-center text-center">
              <div className="text-[15px] font-semibold text-[#1d1d1f] mb-1">暂无已完成能力</div>
              <div className="text-[12.5px] text-[#8e8e93]">任意能力卡片右上角 ⋮ → 标记完成</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- 10. 视图 · 工作 (OKR) ---------- */
