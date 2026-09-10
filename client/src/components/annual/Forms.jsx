import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { LIFE } from './data.js';
import { uid } from './utils.js';
import { moduleColor, moduleRgba } from '../../utils/color.js'

export function AbilityAssessmentForm({ abilities, scoreHistory, onSave, onCancel }) {
  const curYM = new Date().toISOString().slice(0, 7);
  const curMonth = Number(curYM.slice(5, 7));
  const curYear = Number(curYM.slice(0, 4));
  const dynAb = abilities || [];

  const [scores, setScores] = useState(() => {
    const s = {};
    dynAb.forEach((a, i) => {
      const abId = a.id || a.title;
      const hist = scoreHistory?.[abId] || {};
      s[i] = hist[curYM] !== undefined ? Number(hist[curYM]) : (Number(a.score) || 5);
    });
    return s;
  });
  const [notes, setNotes] = useState(() => {
    const n = {};
    dynAb.forEach((_, i) => { n[i] = ''; });
    return n;
  });

  const scoreColor = (n) => {
    n = Number(n) || 0;
    if (n >= 9) return '#34C759';
    if (n >= 6) return '#FF9500';
    return '#FF3B30';
  };
  const scoreLabel = (n) => {
    n = Number(n) || 0;
    if (n >= 9) return '优秀';
    if (n >= 7.5) return '良好';
    if (n >= 6) return '进行中';
    if (n >= 4) return '待提升';
    return '待启动';
  };

  const avg = Math.round((Object.values(scores).reduce((s, v) => s + Number(v), 0) / Math.max(1, Object.values(scores).length)) * 10) / 10;

  // 计算相比上月的变化
  const prevDelta = (idx) => {
    const a = dynAb[idx]; if (!a) return null;
    const abId = a.id || a.title;
    const hist = scoreHistory?.[abId] || {};
    const prevM = curMonth === 1 ? 12 : curMonth - 1;
    const prevY = curMonth === 1 ? curYear - 1 : curYear;
    const prevYM = `${prevY}-${String(prevM).padStart(2, '0')}`;
    const prev = hist[prevYM];
    if (prev === undefined || prev === null) return null;
    return Number(scores[idx]) - Number(prev);
  };

  const LABEL = { fontSize: 13, fontWeight: 600, color: '#1c1c1e', display: 'block', marginBottom: 4 };
  const BTN_P = { padding: '8px 16px', borderRadius: 9, border: 'none', background: '#FF9500', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
  const BTN_G = { padding: '8px 16px', borderRadius: 9, border: '1px solid rgba(15,23,42,0.1)', background: 'transparent', color: '#8e8e93', fontSize: 13, fontWeight: 500, cursor: 'pointer' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 顶部说明 */}
      <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(255,149,0,0.08)', border: '1px solid rgba(255,149,0,0.18)', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <svg style={{ width: 18, height: 18, color: '#FF9500', flexShrink: 0, marginTop: 1 }} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <div style={{ fontSize: 12, lineHeight: 1.55, color: '#804B00' }}>
          <b>{curYear}年{curMonth}月 · 能力自评</b>：客观评估本月自己在每项能力上的实际水平（0-10分），<br />对比上月看趋势，作为下月的行动锚点。
        </div>
      </div>

      {/* 能力列表 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {dynAb.map((a, i) => {
          const sc = Number(scores[i]) || 0;
          const c = scoreColor(sc);
          const delta = prevDelta(i);
          return (
            <div key={i} style={{ padding: '12px 12px 14px', borderRadius: 12, border: '1px solid rgba(15,23,42,0.08)', background: '#fff' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#1c1c1e', marginBottom: 3 }}>{a.title}</div>
                  <div style={{ fontSize: 11.5, color: '#6b7280', lineHeight: 1.45 }}>每日：{a.daily}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
                    <span style={{ fontSize: 22, fontWeight: 800, color: c, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{sc}</span>
                    <span style={{ fontSize: 12, color: c, opacity: .7 }}>/10</span>
                  </div>
                  <div style={{ marginTop: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: c }}>{scoreLabel(sc)}</span>
                    {delta !== null && (
                      <span style={{
                        fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                        color: delta > 0 ? '#34C759' : delta < 0 ? '#FF3B30' : '#8e8e93',
                      }}>
                        {delta > 0 ? '▲' : delta < 0 ? '▼' : '—'}{Math.abs(delta) > 0 ? Math.abs(delta) : ''}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {/* 滑块 */}
              <input
                type="range" min="0" max="10" step="0.5" value={sc}
                onChange={e => setScores(prev => ({ ...prev, [i]: Number(e.target.value) }))}
                style={{ width: '100%', accentColor: c }}
              />
              {/* 刻度标记 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3, fontSize: 10, color: '#8E8E93', fontWeight: 600, padding: '0 1px' }}>
                <span>0</span><span>2</span><span>4</span><span>6</span><span>8</span><span>10</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* 汇总 + 按钮 */}
      <div style={{ padding: '12px', borderRadius: 12, background: 'rgba(255,149,0,0.05)', border: '1px solid rgba(255,149,0,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#B36900', marginBottom: 2 }}>综合自评</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
            <span style={{ fontSize: 24, fontWeight: 800, color: '#FF9500', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{avg}</span>
            <span style={{ fontSize: 13, color: '#B36900', opacity: .8 }}>/10</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onCancel} style={BTN_G}>取消</button>
          <button onClick={() => onSave?.(scores, notes)} style={BTN_P}>确认 · 保存本月自评</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- 7.8 表单 · 工作风险KR→微动作拆解器 ---------- */
export function RiskBreakdownForm({ kr, goal, riskInfo, existingActions, onSave, onCancel, onKrProgressAdd }) {
  // kr: {t, v, tgt, ...}  goal: {title, deadline, start}  riskInfo: {q, label, color, diff, kPct, timePct, daysLeft}
  const curToday = new Date(); curToday.setHours(0,0,0,0);
  const formatDate = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
  const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };

  const gap = Math.max(0, Number(kr.tgt) - Number(kr.v));
  const urgencyDays = Math.max(1, Number(riskInfo.daysLeft) >= 0 ? Number(riskInfo.daysLeft) : 7);
  // 每日最低完成量（向上取整到保留1位）
  const perDayRaw = gap / urgencyDays;
  const perDay = perDayRaw >= 10 ? Math.ceil(perDayRaw) : perDayRaw >= 1 ? Math.ceil(perDayRaw * 10) / 10 : perDayRaw;

  // 自动生成微动作模板
  const genTemplates = () => {
    const tpls = [];
    const unit = (kr.t.match(/\(([^)]+)\)/) || [, ''])[1] || '次';
    // 接下来3天突击
    tpls.push({
      text: `未来3天每天完成 ${Math.max(1, Math.round(perDay * 1.5))}${unit}，追赶落后进度`,
      deadline: formatDate(addDays(curToday, 2)),
      ddlOffset: 2,
    });
    // 固定节律动作
    tpls.push({
      text: `之后每天稳定完成至少 ${perDay}${unit}，不低于时间进度（${riskInfo.timePct}%→${Math.min(100, riskInfo.timePct + 15)}%）`,
      deadline: formatDate(addDays(curToday, urgencyDays - 1)),
      ddlOffset: urgencyDays - 1,
    });
    // 周末加码
    const weekend = [0, 6].includes(curToday.getDay());
    tpls.push({
      text: `${weekend ? '本周末' : '下个周末'}额外冲刺 ${Math.max(1, Math.round(perDay * 4))}${unit}（补缺口）`,
      deadline: formatDate(addDays(curToday, (6 - curToday.getDay() + 7) % 7 || 7)),
      ddlOffset: (6 - curToday.getDay() + 7) % 7 || 7,
    });
    // 问责机制
    tpls.push({
      text: '设置每日晚10点闹钟改变当日进度，若未达标说明障碍并调整次日',
      deadline: formatDate(addDays(curToday, urgencyDays - 1)),
      ddlOffset: urgencyDays - 1,
    });
    return tpls;
  };

  const [actions, setActions] = useState(() => {
    if (existingActions && existingActions.length > 0) {
      return existingActions.map(a => ({ ...a }));
    }
    return genTemplates().map(t => ({ id: uid(), text: t.text, deadline: t.deadline, ddlOffset: t.ddlOffset, done: false, createdAt: Date.now() }));
  });

  const [newAct, setNewAct] = useState('');

  const doneCount = actions.filter(a => a.done).length;
  const donePct = actions.length > 0 ? Math.round((doneCount / actions.length) * 100) : 0;

  // 根据gap与urgency推算一条可以立即推进的建议增量（用于onKrProgressAdd快速推进v值）
  const quickBoost = Math.min(gap, Math.max(1, Math.round(perDay)));

  const LABEL = { fontSize: 13, fontWeight: 600, color: '#1c1c1e', display: 'block', marginBottom: 4 };
  const BTN_P = { padding: '8px 16px', borderRadius: 9, border: 'none', background: '#FF3B30', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
  const BTN_G = { padding: '8px 16px', borderRadius: 9, border: '1px solid rgba(15,23,42,0.1)', background: 'transparent', color: '#8e8e93', fontSize: 13, fontWeight: 500, cursor: 'pointer' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* 风险诊断头 */}
      <div style={{ padding: '12px', borderRadius: 12, background: `${riskInfo.color}0d`, border: `1px solid ${riskInfo.color}26`, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10, background: `${riskInfo.color}1a`, color: riskInfo.color,
          display: 'grid', placeItems: 'center', flexShrink: 0,
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 9v4m0 4h.01M10.3 3.86 1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 11.5, fontWeight: 800, letterSpacing: .3,
              padding: '3px 8px', borderRadius: 7, background: `${riskInfo.color}1a`, color: riskInfo.color,
            }}>{riskInfo.label} · 完成{riskInfo.kPct}% vs 时间{riskInfo.timePct}%</span>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: '#804B00' }}>
              差距 <b style={{ color: riskInfo.color }}>—{Math.abs(riskInfo.diff)}%</b>，剩余 <b>{riskInfo.daysLeft}</b> 天
            </span>
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1c1c1e', lineHeight: 1.4 }}>{kr.t}</div>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4, lineHeight: 1.45 }}>
            当前 <b style={{ color: '#1c1c1e' }}>{kr.v}</b> / 目标 <b style={{ color: '#1c1c1e' }}>{kr.tgt}</b>，
            还差 <b style={{ color: riskInfo.color }}>{gap}</b>，日均需至少 <b style={{ color: riskInfo.color }}>{perDay}</b>（建议 <b>×1.5</b> 留出缓冲）。
          </div>
        </div>
      </div>

      {/* 微动作清单 */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <label style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#1c1c1e' }}>微动作拆解 · 已完成 {doneCount}/{actions.length}（{donePct}%）</label>
          <button
            type="button"
            onClick={() => onKrProgressAdd?.(quickBoost)}
            style={{
              padding: '5px 10px', borderRadius: 8, border: `1px solid ${riskInfo.color}33`,
              background: `${riskInfo.color}0d`, color: riskInfo.color, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
            }}>
            +{quickBoost} 快速推进进度
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {actions.map((a, i) => (
            <div key={a.id} style={{
              padding: '9px 10px', borderRadius: 10,
              border: a.done ? '1px solid rgba(52,199,89,0.2)' : '1px solid rgba(15,23,42,0.08)',
              background: a.done ? 'rgba(52,199,89,0.04)' : '#fff',
              display: 'flex', alignItems: 'flex-start', gap: 9,
            }}>
              <input
                type="checkbox" checked={!!a.done}
                onChange={() => setActions(prev => prev.map(x => x.id === a.id ? { ...x, done: !x.done } : x))}
                style={{ width: 16, height: 16, marginTop: 1, accentColor: '#FF3B30', flexShrink: 0 }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 12.5, fontWeight: 600, lineHeight: 1.45,
                  color: a.done ? '#34C759' : '#1c1c1e',
                  textDecoration: a.done ? 'line-through' : 'none',
                }}>{a.text}</div>
                <div style={{ marginTop: 3, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 10.5, fontWeight: 600, color: '#8e8e93' }}>截止 {a.deadline}</span>
                </div>
              </div>
              <button
                type="button" title="删除"
                onClick={() => setActions(prev => prev.filter(x => x.id !== a.id))}
                style={{ background: 'transparent', border: 'none', color: '#cbd5e1', cursor: 'pointer', padding: 2, fontSize: 16, lineHeight: 1 }}
              >×</button>
            </div>
          ))}
        </div>
        {/* 新增一条 */}
        <div style={{ marginTop: 9, display: 'flex', gap: 8 }}>
          <input
            type="text" placeholder="或手动添加一个微动作..." value={newAct}
            onChange={e => setNewAct(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && newAct.trim()) {
                setActions(prev => [...prev, { id: uid(), text: newAct.trim(), deadline: formatDate(addDays(curToday, 3)), ddlOffset: 3, done: false, createdAt: Date.now() }]);
                setNewAct('');
              }
            }}
            style={{
              flex: 1, padding: '7px 10px', borderRadius: 9, border: '1px solid rgba(15,23,42,0.08)',
              fontSize: 12.5, outline: 'none', background: '#fff',
            }}
          />
          <button
            type="button"
            onClick={() => {
              if (!newAct.trim()) return;
              setActions(prev => [...prev, { id: uid(), text: newAct.trim(), deadline: formatDate(addDays(curToday, 3)), ddlOffset: 3, done: false, createdAt: Date.now() }]);
              setNewAct('');
            }}
            style={{ padding: '7px 12px', borderRadius: 9, border: 'none', background: 'rgba(15,23,42,0.06)', color: '#374151', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >添加</button>
        </div>
      </div>

      {/* 按钮 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, paddingTop: 2 }}>
        <div>
          {existingActions && existingActions.length > 0 && (
            <button
              type="button"
              onClick={() => setActions(genTemplates().map(t => ({ id: uid(), text: t.text, deadline: t.deadline, ddlOffset: t.ddlOffset, done: false, createdAt: Date.now() })))}
              style={{ padding: '8px 14px', borderRadius: 9, border: 'none', background: 'transparent', color: '#8e8e93', fontSize: 12, fontWeight: 500, cursor: 'pointer', textDecoration: 'underline' }}
            >重置为模板建议</button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onCancel} style={BTN_G}>取消</button>
          <button onClick={() => onSave?.(actions)} style={BTN_P}>保存拆解方案</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- 7.9 表单 · 生活年度精选 + 记忆卡预览 ---------- */
export function LifeHighlightsForm({ lifeData, highlightedIds, onToggleHighlight, onSave, onCancel }) {
  const year = new Date().getFullYear();
  const dynLife = lifeData || LIFE;
  const allEntries = useMemo(() => {
    const arr = [];
    dynLife.forEach((c, ci) => {
      (c.entries || []).forEach((e, ei) => {
        arr.push({ ...e, catKey: c.key, catLb: c.lb, catColor: c.color, ci, ei, catIdx: ci });
      });
    });
    // 默认排序：按日期字符串倒序（近的在前）
    return arr.sort((a, b) => String(b.d || '').localeCompare(String(a.d || '')));
  }, [dynLife]);

  const isHl = (id) => Array.isArray(highlightedIds) && highlightedIds.includes(id);
  const currentHl = allEntries.filter(e => isHl(e.id));
  const topAuto = allEntries.slice(0, 6); // 自动推荐前6条（按日期）

  const autoSelectRecommended = () => {
    const set = new Set(highlightedIds || []);
    topAuto.forEach(e => e.id && set.add(e.id));
    onSave?.(Array.from(set));
  };

  // 布局/字重走 className（见按钮 JSX），这里只保留动态色值
  const BTN_P = { background: 'linear-gradient(135deg,var(--m-life),var(--m-finance))', boxShadow: `0 1px 3px ${moduleRgba('life', 0.25)}` };
  const BTN_G = { border: '1px solid rgba(15,23,42,0.1)' };

  return (
    <div className="flex flex-col gap-3.5">
      {/* 顶部说明 */}
      <div className="p-3 rounded-xl flex items-start gap-2.5"
        style={{ background: `linear-gradient(135deg, ${moduleRgba('life', 0.08)} 0%, ${moduleRgba('finance', 0.08)} 100%)`, border: `1px solid ${moduleRgba('life', 0.18)}` }}>
        <div className="w-9 h-9 rounded-[10px] text-white grid place-items-center shrink-0"
          style={{ background: 'linear-gradient(135deg,var(--m-life),var(--m-finance))', boxShadow: `0 2px 6px ${moduleRgba('life', 0.3)}` }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-bold text-[#1c1c1e] mb-1">{year} 年度精选 · 记忆卡生成</div>
          <div className="text-[12px] text-[#6b7280] leading-normal">
            选择 <b style={{ color: moduleColor('life') }}>3–9 条</b> 最珍贵的生活片段，下面会实时生成一张今年的专属记忆卡预览。
            已选 <b>{currentHl.length}</b> / 共 <b>{allEntries.length}</b> 条可挑选。
          </div>
        </div>
      </div>

      {/* 记忆卡预览 */}
      <div>
        <div className="text-[12.5px] font-bold text-[#1c1c1e] mb-2">🪄 记忆卡预览</div>
        <div className="rounded-2xl p-5 relative overflow-hidden"
          style={{
            background: 'linear-gradient(160deg, #f5f3ff 0%, #fdf4ff 45%, #FFEEED 100%)',
            border: `1px solid ${moduleRgba('life', 0.15)}`,
            boxShadow: `0 4px 16px ${moduleRgba('life', 0.1)}`,
          }}>
          {/* 装饰光斑 */}
          <div className="absolute -top-10 -right-[30px] w-[180px] h-[180px] rounded-full" style={{ background: 'radial-gradient(circle, rgba(255,45,85,0.22), transparent 60%)' }} />
          <div className="absolute -bottom-[50px] -left-[30px] w-[180px] h-[180px] rounded-full" style={{ background: `radial-gradient(circle, ${moduleRgba('life', 0.22)}, transparent 60%)` }} />

          <div className="relative">
            <div className="flex items-center gap-2 mb-3.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill={moduleColor('life')}><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
              <span className="text-[12.5px] font-extrabold tracking-[1.5px]" style={{ color: moduleColor('life') }}>{year} · 我的珍藏年卡</span>
            </div>
            {currentHl.length === 0 ? (
              <div className="py-[22px] px-3.5 text-center rounded-xl text-[12px] font-semibold"
                style={{ border: `1px dashed ${moduleRgba('life', 0.35)}`, color: '#9C48C7' }}>
                还没有选中条目 · 点击下方卡片右下角的星号，或一键推荐。
              </div>
            ) : (
              <div className="flex flex-col gap-[9px]">
                {currentHl.slice(0, 9).map(e => (
                  <div key={e.id} className="py-[9px] px-2.5 rounded-[10px] flex items-start gap-[9px]"
                    style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.9)', backdropFilter: 'blur(4px)' }}>
                    <div className="w-[22px] h-[22px] rounded-[7px] grid place-items-center shrink-0 text-[10.5px] font-extrabold"
                      style={{ background: moduleRgba('life', 0.09), color: moduleColor('life') }}>
                      {e.catLb.slice(0, 1)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-semibold text-[#1c1c1e] leading-[1.45]">{e.t}</div>
                      {e.n && <div className="text-[10.5px] text-[#6b7280] mt-0.5 leading-[1.4]">{e.n}</div>}
                    </div>
                    <div className="text-[10px] font-semibold tabular-nums shrink-0" style={{ color: moduleColor('life') }}>{e.d}</div>
                  </div>
                ))}
              </div>
            )}
            {/* 底部签名 */}
            <div className="mt-3.5 pt-2.5 flex items-center justify-between"
              style={{ borderTop: `1px dashed ${moduleRgba('life', 0.2)}` }}>
              <span className="text-[10.5px] font-semibold text-[#9C48C7] tracking-[0.8px]">PERSONAL · ANNUAL · CARD</span>
              <span className="text-[10.5px] font-bold text-[#FF2D55]">{currentHl.length} memories</span>
            </div>
          </div>
        </div>
      </div>

      {/* 快速操作 */}
      <div className="flex items-center justify-between gap-2">
        <div className="text-[12.5px] font-bold text-[#1c1c1e]">📋 挑选条目（{currentHl.length}）</div>
        <div className="flex gap-2">
          <button type="button" onClick={autoSelectRecommended}
            className="py-[5px] px-2.5 rounded-lg text-[11.5px] font-bold cursor-pointer"
            style={{ border: `1px solid ${moduleRgba('life', 0.25)}`, background: moduleRgba('life', 0.06), color: '#9C48C7' }}>
            ★ 一键挑选前{topAuto.length}条
          </button>
          {currentHl.length > 0 && (
            <button type="button" onClick={() => onSave?.([])}
              className="py-[5px] px-2.5 rounded-lg border-none bg-transparent text-[#8e8e93] text-[11.5px] font-medium cursor-pointer underline">
              清空精选
            </button>
          )}
        </div>
      </div>

      {/* 条目列表 */}
      <div className="flex flex-col gap-[7px] max-h-[260px] overflow-y-auto pr-0.5">
        {allEntries.length === 0 && (
          <div className="p-5 text-center text-[12px] text-[#8a9491]">还没有生活记录，先去添加吧～</div>
        )}
        {allEntries.map(e => {
          const sel = isHl(e.id);
          return (
            <div key={e.id} className="py-[9px] px-2.5 rounded-[10px] flex items-start gap-2.5"
              style={{
                border: `1px solid ${sel ? moduleRgba('life', 0.33) : 'rgba(15,23,42,0.08)'}`,
                background: sel ? moduleRgba('life', 0.04) : '#fff',
              }}>
              <div className="w-[22px] h-[22px] rounded-[7px] grid place-items-center shrink-0 text-[10.5px] font-extrabold"
                style={{ background: moduleRgba('life', 0.09), color: moduleColor('life') }}>{e.catLb.slice(0, 1)}</div>
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-semibold text-[#1c1c1e] leading-[1.4]">{e.t}</div>
                {e.n && <div className="text-[10.5px] text-[#6b7280] mt-0.5 leading-[1.4]">{e.n}</div>}
              </div>
              <div className="flex flex-col items-end gap-[5px] shrink-0">
                <div className="text-[10.5px] font-semibold text-[#8e8e93] tabular-nums">{e.d}</div>
                <button
                  type="button"
                  onClick={() => onToggleHighlight?.(e.id)}
                  title={sel ? '取消精选' : '加入精选'}
                  className="w-6 h-6 rounded-lg border-none cursor-pointer grid place-items-center transition-transform duration-[120ms]"
                  style={{
                    background: sel ? 'linear-gradient(135deg,var(--m-life),#FF2D55)' : 'rgba(15,23,42,0.05)',
                    color: sel ? '#fff' : '#cbd5e1',
                    boxShadow: sel ? `0 1px 3px ${moduleRgba('life', 0.3)}` : 'none',
                  }}>
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* 按钮 */}
      <div className="flex justify-end gap-2 pt-0.5">
        <button onClick={onCancel} className="px-4 py-2 rounded-[9px] bg-transparent text-[#8e8e93] text-[13px] font-medium cursor-pointer" style={BTN_G}>关闭</button>
        <button onClick={() => onSave?.(highlightedIds)} className="px-4 py-2 rounded-[9px] border-none text-white text-[13px] font-semibold cursor-pointer" style={BTN_P}>确定 · 保存记忆卡</button>
      </div>
    </div>
  );
}

/* ---------- 8. 视图 · 知力 (OKR + 书架系统) ---------- */
