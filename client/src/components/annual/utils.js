import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { CATEGORIES } from './data.js';

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
export const pct = (v, t) => (t > 0 ? Math.min(100, Math.round((v / t) * 100)) : 0);
export const statusMeta = (st) => {
  switch (st) {
    case 'done':    return { lb: '已完成',  tagCls: 'bg-accent-green/10 text-accent-green',  numBg: 'bg-accent-green/10 text-accent-green',  bar: '#34C759'  };
    case 'doing':   return { lb: '进行中',  tagCls: 'bg-accent-blue/10 text-accent-blue',    numBg: 'bg-accent-blue/10 text-accent-blue',    bar: '#007AFF'   };
    case 'reading': return { lb: '阅读中',  tagCls: 'bg-accent-blue/10 text-accent-blue',    numBg: 'bg-accent-blue/10 text-accent-blue',    bar: '#007AFF'   };
    case 'tg':      return { lb: '待启动',  tagCls: 'bg-ink-100 text-ink-500',               numBg: 'bg-ink-100 text-ink-500',               bar: '#c7c7cc'       };
    case 'pending': return { lb: '未开始',  tagCls: 'bg-ink-100 text-ink-500',               numBg: 'bg-ink-100 text-ink-500',               bar: '#c7c7cc'       };
    default:        return { lb: '',        tagCls: '', numBg: '', bar: '' };
  }
};
export const catMeta = (key) => CATEGORIES.find(c => c.key === key) || CATEGORIES[0];

/* 时间解析：同时支持 '2026-09-30' (ISO) 和 '9月30日' (中文化) 以及 '09/30' 简写 */
export const parseDate = (s) => {
  if (!s) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  const year = today.getFullYear();
  // ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    const t = new Date(y, m - 1, d); t.setHours(0,0,0,0); return t;
  }
  // 中文 9月30日 / 9月30
  const m = String(s).match(/(\d{1,2})\s*月\s*(\d{1,2})/);
  if (m) {
    const mm = Number(m[1]) - 1, dd = Number(m[2]);
    let t = new Date(year, mm, dd); t.setHours(0,0,0,0);
    if (t < today - 86400000 * 180) t = new Date(year + 1, mm, dd);
    return t;
  }
  // MM/DD 或 MM.DD
  const m2 = String(s).match(/^(\d{1,2})[\/\.\-](\d{1,2})$/);
  if (m2) {
    const mm = Number(m2[1]) - 1, dd = Number(m2[2]);
    let t = new Date(year, mm, dd); t.setHours(0,0,0,0);
    if (t < today - 86400000 * 180) t = new Date(year + 1, mm, dd);
    return t;
  }
  return null;
};

/* 给定 createdAt/startedAt + deadline，返回剩余天数、时间进度百分比
 * 两者都不传或解析失败 → { days: null, timePct: null }（不显示时间锚点）
 */
export const calcTimeAnchor = (deadlineStr, createdStr) => {
  const today = new Date(); today.setHours(0,0,0,0);
  const target = parseDate(deadlineStr);
  const start = parseDate(createdStr) || (target ? new Date(target.getFullYear(), 0, 1) : null);
  if (!target || !start) return { days: null, timePct: null };
  const total = Math.max(1, target - start);
  const elapsed = Math.max(0, Math.min(total, today - start));
  const days = Math.ceil((target - today) / 86400000);
  return { days, timePct: Math.round((elapsed / total) * 100) };
};

/* 风险计算：actualPct (实际%) vs timePct (预期按时间推进%)
 *   已完成/满 = done 绿
 *   actual - time <= -20 → risk 严重落后红
 *   actual - time <= -5  → warn 略落后橙
 *   actual - time >= 20  → ahead 超前绿
 *   其余 normal 正常
 *   没有 timePct（无deadline/createdAt）→ 只基于 actual 区间判断
 */
export const calcRisk = (actualPct, timePct, isDone) => {
  if (isDone || actualPct >= 100) return { q: 'done', label: '已完成', color: '#34C759' };
  if (timePct !== null && timePct !== undefined) {
    const diff = actualPct - timePct;
    if (diff <= -20) return { q: 'risk', label: '严重落后', color: '#FF3B30' };
    if (diff <= -5)  return { q: 'warn', label: '略落后',   color: '#FF9500' };
    if (diff >= 20)  return { q: 'ahead',label: '超前',     color: '#34C759' };
    return { q: 'normal', label: '正常', color: '#007AFF' };
  }
  // 无时间锚点：退化到按 actual 粗判
  if (actualPct <= 20) return { q: 'risk', label: '严重落后', color: '#FF3B30' };
  if (actualPct <= 50) return { q: 'warn', label: '推进中',   color: '#FF9500' };
  if (actualPct >= 90) return { q: 'ahead',label: '超前',     color: '#34C759' };
  return { q: 'normal', label: '正常', color: '#007AFF' };
};

/* 剩余天数展示：剩X天 / 过期X天 / 长期（当 null） */
export const daysLabel = (days) => {
  if (days === null || days === undefined) return { text: '长期', cls: 'text-ink-400', urgent: false, overdue: false };
  if (days < 0)  return { text: `过期${Math.abs(days)}天`, cls: 'text-accent-red', urgent: false, overdue: true };
  if (days === 0) return { text: '今日截止', cls: 'text-accent-red', urgent: true, overdue: false };
  if (days <= 30) return { text: `剩${days}天`, cls: 'text-accent-amber', urgent: true, overdue: false };
  return { text: `剩${days}天`, cls: 'text-ink-500', urgent: false, overdue: false };
};

/* 工作页卡片日期副行：截止日期到今天的剩余时间 → 「剩余X个月X天」或「剩余X天」/「今日截止」/「过期X天」
 * 算法口径（与 calcTimeAnchor 一致，Date 本地时区 0 点对齐，避免跨时区 +-1 天）：
 *  - totalDays = ceil((deadline - today) / 86400000)，与 gs.days / daysLabel 使用同一口径
 *  - 月换算：按日历"同月同日差整月"原则；若 deadline 日份 < today 日份，借 1 月补该月天数
 *  - 输出格式：
 *      totalDays < 0   → 「过期 X 天」（红色）
 *      totalDays = 0   → 「今日截止」（红色）
 *      months >= 1     → 「剩余 N 个月 D 天」（月+天组合，D=0 时只写月）
 *      months = 0      → 「剩余 D 天」
 */
export const IOS_SANS = '"SF Pro Text","SF Pro Display",-apple-system,BlinkMacSystemFont,"PingFang SC","Helvetica Neue",Helvetica,Arial,sans-serif';
export const formatRemainDuration = (deadline, today) => {
  const t = new Date(today); t.setHours(0,0,0,0);
  const e = new Date(deadline); e.setHours(0,0,0,0);
  const totalDays = Math.ceil((e - t) / 86400000);
  if (totalDays < 0) return { text: `过期 ${Math.abs(totalDays)} 天`, cls: 'text-[#FF3B30]' };
  if (totalDays === 0) return { text: '今日截止', cls: 'text-[#FF3B30]' };
  // 日历月差（同月同日锚点整月判定）
  let months = (e.getFullYear() - t.getFullYear()) * 12 + (e.getMonth() - t.getMonth());
  const startDay = t.getDate(), endDay = e.getDate();
  let days = endDay - startDay;
  if (days < 0) {
    months -= 1;
    // 借 1 个月 → days = 月底剩下 + 日份
    const eom = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
    days = (eom - startDay) + endDay;
  }
  // 修：剩余天数 ≥ 借位的那个月天数 → 语义 = 差N天就整4个月，避免"3个月30天"这种近整月尴尬
  // 例：2026-09-01 至 2026-12-31，months=3, days=30 → 当前月(9月)有30天，days=30≥30 → 进1个月=4个月
  if (months > 0 && days > 0) {
    const todayMonthDays = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
    if (days >= todayMonthDays - 1) {
      months += 1;
      days = 0;
    }
  }
  // 修正：如果 months < 0（仅当总天数<0，但已在上面拦截，兜底）→ 退回纯天展示
  if (months < 0) months = 0;
  if (months === 0) {
    const cls = totalDays <= 30 ? 'text-[#FF9500]' : 'text-ink-500';
    return { text: `剩余 ${totalDays} 天`, cls };
  }
  // 月 + 天
  const cls = months <= 1 ? 'text-[#FF9500]' : 'text-ink-500';
  if (days === 0) return { text: `剩余 ${months} 个月`, cls };
  return { text: `剩余 ${months} 个月 ${days} 天`, cls };
};

/* 目标模式兜底：当 mode 缺失时基于关键字 & 内容自动推断
 * 工作默认 funnel（求职场景）；能力默认 milestone
 */
export const inferMode = (obj, type) => {
  if (obj?.mode) return obj.mode;
  if (type === 'ability') return 'milestone';
  // work
  const title = obj?.title || '';
  const krText = (obj?.krs || []).map(k => k.t).join(' ');
  const hay = `${title} ${krText}`;
  if (/试用|转正|入职|季度|绩效|KPI|业务指标/.test(title)) return 'dashboard';
  if (/第.?阶段|阶段.?门|专题|项目|里程碑|晋升|冲刺/.test(hay)) return 'milestone';
  if (/投递|面试|offer|简历|招聘|简历|销售|投放|漏斗/.test(hay)) return 'funnel';
  return 'funnel';
};

/* ---------- 共享组件 ---------- */
/* 图标体系：Lucide 风格（24 网格 / 2px 描边 / 圆头笔触），与侧边栏 ICONS 同族
 * overview=chart-column 柱状图 | energy=heart-pulse 心率 | cognition=eye 眼界
 * ability=star 技能星级 | work=laptop 笔电 | life=sun 太阳 | finance=coins 金币 */
/* 供侧边栏二级导航复用（图标+加号入口） */
