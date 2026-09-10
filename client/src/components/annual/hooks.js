import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { ABILITY, BOOKS, CATEGORIES, HABITS, LIFE, WORK } from './data.js';
import { pct, uid } from './utils.js';
import { WorkView } from './WorkView.jsx';
import { LifeView } from './LifeView.jsx';
import { syncKey, cloudPush, cloudMergePush } from '../../utils/cloudKV.js'
import { API } from '../../api/client.js'
import { inferGrowthType } from '../../utils/uiConstants.js'

const ENERGY_HABITS_CACHE = () => {
  try {
    const raw = localStorage.getItem('pw_user');
    const uid = raw ? (JSON.parse(raw)?.id ?? 'anon') : 'anon';
    return `energy_habits_cache_${uid}`;
  } catch { return 'energy_habits_cache_anon'; }
};
function readEnergyHabitsCache() {
  try {
    const raw = localStorage.getItem(ENERGY_HABITS_CACHE());
    if (!raw) return null;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return null;
    // monthDates 的 Set 不可序列化 → 从 allDates 重建
    return arr.map(h => {
      const monthDateSet = {};
      (h.allDates || []).forEach(d => {
        const m = parseInt(d.split('-')[1], 10);
        const day = parseInt(d.split('-')[2], 10);
        if (!monthDateSet[m]) monthDateSet[m] = new Set();
        monthDateSet[m].add(day);
      });
      return { ...h, monthDates: monthDateSet };
    });
  } catch { return null; }
}
function writeEnergyHabitsCache(mapped) {
  try { localStorage.setItem(ENERGY_HABITS_CACHE(), JSON.stringify(mapped)); } catch { /* ignore */ }
}

export function useEnergyHabits() {
  const [realHabits, setRealHabits] = useState(() => readEnergyHabitsCache()); // null = 未获取/失败；[] = 获取到空列表
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0); // 手动刷新触发

  const refresh = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const year = new Date().getFullYear();
        const from = `${year}-01-01`;
        const to   = `${year}-12-31`;
        const today = new Date().toISOString().slice(0, 10);

        // 1. 获取所有习惯（含当天打卡状态）
        const habitsRes = await API.habits.list({ date: today });
        const allHabits = habitsRes.habits || [];

        // 2. 筛选精力类习惯
        const energyHabits = allHabits.filter(h => inferGrowthType(h) === 'energy');
        if (energyHabits.length === 0) {
          if (!cancelled) { setRealHabits([]); setLoading(false); }
          return;
        }

        // 3. 获取年度统计
        const statsRes = await API.habits.stats(from, to);
        const statsMap = {};
        (statsRes.stats || []).forEach(s => { statsMap[s.habit_id] = s; });

        // 4. 映射为年度规划格式
        const mapped = energyHabits.map(h => {
            const st = statsMap[h.id] || { done_days: 0, dates: [] };
            // 按月统计打卡天数
            const monthData = {};
            const dates = st.dates || [];
            dates.forEach(d => {
              const m = parseInt(d.split('-')[1], 10);
              monthData[m] = (monthData[m] || 0) + 1;
            });
            // 按月份归类实际打卡日期集合（用于打卡日历）
            const monthDateSet = {};
            dates.forEach(d => {
              const m = parseInt(d.split('-')[1], 10);
              const day = parseInt(d.split('-')[2], 10);
              if (!monthDateSet[m]) monthDateSet[m] = new Set();
              monthDateSet[m].add(day);
            });
            // 智能推断年度目标：运动类 120 次，其余 230 天
            const name = (h.name || '').toLowerCase();
            const isExercise = /运动|exercise|sport|健身|跑步|run|workout/.test(name);
            const annualTarget = isExercise ? 120 : 230;
            return {
              id: h.id,
              key: h.id,
              // 习惯标题不附带 emoji — 统一用 KR 风格的有序号展示，避免 emoji 字形/色值不一致
              label: h.name || '未命名习惯',
              name: h.name,
              emoji: h.emoji || '',
              unit: isExercise ? '次' : (h.target_unit || '天'),
              target: annualTarget,
              val: st.done_days || 0,
              month: monthData,
              monthDates: monthDateSet,
              allDates: dates,
            };
          });

        if (!cancelled) {
          setRealHabits(mapped);
          writeEnergyHabitsCache(mapped); // 写穿缓存：下次首屏直接显示真实数据
          setLoading(false);
        }
      } catch (e) {
        // 未登录或 API 异常 → 回退 mock 数据
        if (!cancelled) { setRealHabits(null); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [refreshKey]);

  return { realHabits, loading, refresh };
}

/* ---------- 3. 视图数据计算 · Overview ---------- */
export function useOverviewStats(realHabits, dynamicBooks, dynamicAbilities, dynamicWork, dynamicLife) {
  return useMemo(() => {
    const habits = realHabits || HABITS;
    // 精力：各习惯 val/target 完成率平均 → 与精力页 Hero 胶囊一致
    const energyVal = habits.length > 0
      ? habits.reduce((s, h) => s + pct(h.val, h.target), 0) / habits.length
      : 0;
    const books = (!dynamicBooks || dynamicBooks.length === 0) ? BOOKS : dynamicBooks;
    const booksDone = books.filter(b => b.st === 'done').length;
    // 知力：已读完 / 年度目标 12 本 → 与知力页 KR1 数量口径一致
    const cogVal = pct(booksDone, 12);
    const abilities = dynamicAbilities || ABILITY;
    // 能力：每个能力下里程碑pct平均值 → 与能力页 Hero 胶囊 abPct 一致
    const abilityVal = abilities.length > 0
      ? abilities.reduce((s, a) => {
          const ms = a.mstones.length > 0 ? a.mstones.reduce((t, m) => t + m.pct, 0) / a.mstones.length : 0;
          return s + ms;
        }, 0) / abilities.length
      : 0;
    const work = dynamicWork || WORK;
    // 工作：主+副所有KR的v/tgt完成率平均 → 与 WorkView Hero 胶囊 totalPct 一致
    const allKrs = work.flatMap(o => o.krs || []);
    const wkVal = allKrs.length > 0 ? allKrs.reduce((s, k) => s + pct(k.v, k.tgt), 0) / allKrs.length : 0;
    const life = dynamicLife || LIFE;
    // 生活：有记录的类目数/总类目数*100 → 与 LifeView Hero 胶囊 lifePct 一致
    const lifeVal = life.length > 0 ? (life.filter(c => c.entries.length > 0).length / life.length) * 100 : 0;
    const vals = [energyVal, cogVal, abilityVal, wkVal, lifeVal];
    const weighted = Math.round(
      CATEGORIES.reduce((s, c, i) => s + vals[i] * c.weight, 0)
    );
    return { perCat: vals, weighted };
  }, [realHabits, dynamicBooks, dynamicAbilities, dynamicWork, dynamicLife]);
}

/* ---------- 4. 子组件 · 顶部 Nav 条 ---------- */
export function usePersistentState(key, initial) {
  const [state, setState] = useState(() => {
    try {
      const saved = localStorage.getItem(key);
      if (saved) return JSON.parse(saved);
    } catch {}
    return typeof initial === 'function' ? initial() : initial;
  });
  const cloudSyncedRef = useRef(false);
  const prevRef = useRef(state);          // 上一次推送时的状态快照（用于 diff 出变化的顶层字段）
  const suppressPushRef = useRef(false);  // 云端拉取覆盖本地后跳过一次推送，避免反馈循环
  useEffect(() => {
    let alive = true;
    syncKey(key, localStorage.getItem(key), (cloudStr) => {
      if (!alive) return;
      try {
        const parsed = JSON.parse(cloudStr);
        // envelope 形态：云端是字段级合并的 envelope，逐字段合并回本地（不丢本地未同步字段）
        if (parsed && parsed.__mv !== undefined && parsed.fields && typeof parsed.fields === 'object') {
          setState((prev) => {
            const base = (prev && typeof prev === 'object' && !Array.isArray(prev)) ? { ...prev } : {};
            for (const [f, info] of Object.entries(parsed.fields)) {
              if (info && info.v !== undefined) base[f] = info.v;
            }
            try { localStorage.setItem(key, JSON.stringify(base)); } catch {}
            return base;
          });
        } else {
          // 非 envelope（老数据 / 简单 LWW 值）：原样覆盖
          localStorage.setItem(key, cloudStr);
          setState(parsed);
        }
        suppressPushRef.current = true; // 跳过本次 state 变更触发的推送
      } catch {}
    }).then(() => { if (alive) { cloudSyncedRef.current = true; prevRef.current = state; } });
    return () => { alive = false; };
  }, [key]);
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(state)); } catch {}
    // 云端拉取未完成期间的本地写入不推（避免用旧值覆盖云端；拉取完成后如有差异会在下次加载纠正）
    if (!cloudSyncedRef.current || suppressPushRef.current) {
      suppressPushRef.current = false;
      prevRef.current = state;
      return;
    }
    // 结构化对象 → 字段级合并（只推变化的顶层字段）；数组 / 原始值 → LWW 全量推送
    const isPlainObj = state && typeof state === 'object' && !Array.isArray(state);
    const prev = prevRef.current;
    const prevPlain = prev && typeof prev === 'object' && !Array.isArray(prev);
    if (isPlainObj && prevPlain) {
      const partial = {};
      let hasChange = false;
      for (const k of Object.keys(state)) {
        if (JSON.stringify(prev[k]) !== JSON.stringify(state[k])) {
          partial[k] = state[k];
          hasChange = true;
        }
      }
      if (hasChange) cloudMergePush(key, partial);
    } else {
      cloudPush(key, JSON.stringify(state));
    }
    prevRef.current = state;
  }, [key, state]);
  return [state, setState];
}

/* ---------- 14. 入口组件 ---------- */
