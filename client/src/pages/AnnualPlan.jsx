import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { ABILITY, ANNUAL_ADD_ACTIONS, BOOKS, COG_KRS, COG_O, HABITS, LIFE, WORK } from '../components/annual/data.js';
import { pct, uid } from '../components/annual/utils.js';
import { useEnergyHabits, useOverviewStats, usePersistentState } from '../components/annual/hooks.js';
import { AbilityAssessmentForm, LifeHighlightsForm, RiskBreakdownForm } from '../components/annual/Forms.jsx';
import { NavBar, Sidebar } from '../components/annual/Sidebar.jsx';
import { OverviewView } from '../components/annual/OverviewView.jsx';
import { EnergyView } from '../components/annual/EnergyView.jsx';
import { CognitionView } from '../components/annual/CognitionView.jsx';
import { AbilityView } from '../components/annual/AbilityView.jsx';
import { WorkView } from '../components/annual/WorkView.jsx';
import { LifeView } from '../components/annual/LifeView.jsx';
import { FinanceTxForm, FinanceGoalForm, FinanceDepositForm, FinanceManageForm, FinanceAccountForm, FinanceGoalDetail } from '../components/finance/FinanceForms.jsx'
import { API } from '../api/client.js'
import Modal from '../components/Modal.jsx'
import HabitForm from '../components/forms/HabitForm.jsx'
import BookForm from '../components/forms/BookForm.jsx'
import MilestoneForm from '../components/forms/MilestoneForm.jsx'
import AbilityForm from '../components/forms/AbilityForm.jsx'
import KrForm from '../components/forms/KrForm.jsx'
import WorkGoalForm from '../components/forms/WorkGoalForm.jsx'
import EntryForm from '../components/forms/EntryForm.jsx'
import FinanceView from '../components/finance/FinanceView.jsx'

/* ============================================================
   AnnualPlan · 个人成长年度规划 v1 · 工作台沙盒版
   - 所有间距/圆角/字号对齐工作台已有的 Tailwind tokens (8pt grid)
   - 语义色与品牌色分离 (解决 #4)
   - 去除玻璃/渐变背景，统一为纯白卡 + 细边 + 克制阴影 (解决 #5/#12)
   - 信息层级严格区分 (标题/数值/辅助 2 级差) (解决 #6/#2/#3)
   - 仅可点击容器有 hover 动效 (解决 #8)
   - View 切换 0.25s 淡入 (解决 #13)
   ============================================================ */

export default function AnnualPlan({ standalone = true, initialView, onViewChange, addRequest }) {
  const [view, setViewState] = useState(initialView || 'overview');
  // 受控切换：Workspace 可以从外部跳转（如日历点击标签），内部 tab 切换也同步回调
  const setView = (next) => {
    setViewState(next);
    if (typeof onViewChange === 'function') onViewChange(next);
  };
  // 侧边栏二级导航「加号」：Workspace 透传 addRequest={view,ts} → 切到对应模块并弹添加框
  const addReqTsRef = useRef(0);
  useEffect(() => {
    if (!addRequest || !addRequest.ts || addRequest.ts === addReqTsRef.current) return;
    addReqTsRef.current = addRequest.ts;
    const act = ANNUAL_ADD_ACTIONS[addRequest.view];
    if (!act) return;
    setViewState(addRequest.view);
    if (typeof onViewChange === 'function') onViewChange(addRequest.view);
    setModal({ ...act });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addRequest]);
  // initialView 变化（外部跳模块）时，内部 view 同步刷新
  useEffect(() => {
    if (initialView !== undefined && initialView !== null) setViewState(initialView);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialView]);
  const [toast, setToast] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const { realHabits, loading: energyLoading, refresh: refreshEnergy } = useEnergyHabits();

  // 可变数据（localStorage 持久化）
  const [books, setBooks] = usePersistentState('annual_books_v12', () => BOOKS.map(b => ({ ...b, id: uid() })));
  // 安全网：防止 books 被意外清空
  useEffect(() => {
    if (Array.isArray(books) && books.length === 0) {
      setBooks(BOOKS.map(b => ({ ...b, id: uid() })));
    }
  }, [books?.length]);
  const [abilities, setAbilities] = usePersistentState('annual_abilities_v2', () => ABILITY.map(a => ({ ...a, id: uid(), mstones: a.mstones.map(m => ({ ...m, id: uid() })) })));
  // 🎯 终极修复：在 usePersistentState 读 localStorage 之前先同步修 wk_xhs 的 archived
  // —— usePersistentState 内部先读 localStorage 有值就直接返回，initial 函数不会被调用！
  // —— 所以必须在 usePersistentState 之前手动修 localStorage
  (() => {
    try {
      const saved = localStorage.getItem('annual_work');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          let changed = false;
          const fixed = parsed.map(o => {
            // 小红书：强制进行中（仅拦 archived/shelf）
            if (o && String(o.title || '').includes('小红书') && (o.archived === true || o.status === 'shelf')) {
              changed = true;
              return { ...o, archived: false, status: 'active' };
            }
            // JL 离职：升级为 event 范式（mode + 清空旧 KR）
            if (o && String(o.title || '').includes('JL离职') && (o.mode !== 'event' || (o.krs || []).length > 0)) {
              changed = true;
              return { ...o, mode: 'event', krs: [] };
            }
            return o;
          });
          if (changed) localStorage.setItem('annual_work', JSON.stringify(fixed));
        }
      }
    } catch (_) { /* ignore */ }
  })();
  const [workGoals, setWorkGoals] = usePersistentState('annual_work', () => WORK.map(o => ({ ...o, krs: o.krs.map(k => ({ ...k, id: uid(), st: k.st === 'tg' ? 'pending' : k.st })) })));
  const [lifeData, setLifeData] = usePersistentState('annual_life', () => LIFE.map(c => ({ ...c, entries: c.entries.map(e => ({ ...e, id: uid() })) })));
  // 一次性迁移：类目「关系」改名「情感」（默认常量已改，历史 localStorage 数据未跟上）
  useEffect(() => {
    if (Array.isArray(lifeData) && lifeData.some(c => c?.lb === '关系')) {
      setLifeData(prev => prev.map(c => (c?.lb === '关系' ? { ...c, lb: '情感' } : c)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // 精力习惯 - 用户自定义年度目标（覆盖默认推断值 120/230）
  const [habitTargets, setHabitTargets] = usePersistentState('annual_habit_targets', () => ({}));
  // 能力自评历史 - 每月记录一次分数，key: ability.id, value: {[YYYY-MM]: score}
  const [abilityScoreHistory, setAbilityScoreHistory] = usePersistentState('annual_ability_score_history', () => ({}));
  // 工作 KR 微动作拆解 - key: kr.id, value: [{id, text, deadline, done, createdAt}]
  const [workKrMicroActions, setWorkKrMicroActions] = usePersistentState('annual_work_kr_microactions', () => ({}));
  // 生活·年度精选 - 收藏的条目ID列表
  const [lifeHighlightedIds, setLifeHighlightedIds] = usePersistentState('annual_life_highlights', () => []);
  // 生活·在线文档链接 - 右键菜单增删改（需求 2）
  const [lifeDocLinks, setLifeDocLinks] = usePersistentState('annual_life_doc_links', () => [
    { id: uid(), title: '飞书多维表格 · 全年计划', url: 'https://bytedance.larkoffice.com' },
  ]);
  // 知力 OKR - O 与 KR 列表均支持编辑增删
  const [cogObjective, setCogObjective] = usePersistentState('annual_cog_o', () => COG_O);
  const [cogKrs, setCogKrs] = usePersistentState('annual_cog_krs', () => COG_KRS.map(k => ({ ...k, id: k.id || uid() })));
  // KR 数据迁移：确保默认 5 个 KR（kr0-kr4）全部存在，旧用户可能只有 kr1-kr3
  React.useEffect(() => {
    const defaultIds = COG_KRS.map(k => k.id);
    const existingIds = (cogKrs || []).map(k => k.id);
    const missing = defaultIds.filter(id => !existingIds.includes(id));
    if (missing.length > 0) {
      const toAdd = COG_KRS.filter(k => missing.includes(k.id)).map(k => ({ ...k, id: k.id || uid() }));
      setCogKrs([...(cogKrs || []), ...toAdd]);
    }
  }, [cogKrs]);
  // ===== ID 兜底：兼容旧 localStorage 数据 —— 给缺失 id 的目标/能力/KR/里程碑补 uid =====
  React.useEffect(() => {
    let changed = false;
    const normAb = (abilities || []).map(a => {
      const aId = a.id || uid(); if (!a.id) changed = true;
      const ms = (a.mstones || []).map(m => {
        if (m.id) return m;
        changed = true; return { ...m, id: uid() };
      });
      if (ms.length !== (a.mstones || []).length || ms.some((m, i) => m.id !== (a.mstones || [])[i]?.id)) {
        // ids 已经被补（即使没 changed）也要用新数组
      }
      return (!a.id || (a.mstones || []).some((m, i) => ms[i]?.id && !m.id)) ? { ...a, id: aId, mstones: ms } : a;
    });
    const normWk = (workGoals || []).map(o => {
      const oId = o.id || uid(); if (!o.id) changed = true;
      const krs = (o.krs || []).map(k => {
        if (k.id) return k;
        changed = true; return { ...k, id: uid() };
      });
      return (!o.id || (o.krs || []).some((k, i) => krs[i]?.id && !k.id)) ? { ...o, id: oId, krs } : o;
    });
    if (changed) { setAbilities(normAb); setWorkGoals(normWk); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 知力 · 漏斗顶部标题与备注（主标题"转化漏斗"+右侧说明"阅读→笔记→践行"），支持点击编辑
  const [funnelHeader, setFunnelHeader] = usePersistentState('annual_cog_funnel_header', () => ({ title: '转化漏斗', sub: '输入→思考→行动→改变' }));
  // 知力 · 漏斗四层阶段的自定义文字（label/sub/convLabel），刷新不丢
  // — 结构：{ total: {label, sub, convLabel}, done: {...}, notes: {...}, changes: {...} }
  // — 仅存文字，count 从书架/KR数据联动，不保存在这里
  const [funnelStageLabels, setFunnelStageLabels] = usePersistentState('annual_cog_funnel_stages_labels', () => ({}));
  // 知力 · 书架标题（如"2026年 · 书架"），支持自定义
  const [bookshelfTitle, setBookshelfTitle] = usePersistentState('annual_cog_bookshelf_title', () => `${new Date().getFullYear()}年 · 书架`);
  // 知力 · 行动改变（承诺本）— {id, bookId, bookTitle, insightId, insightText, resonance, text, startDate, targetDays, checkIns[], status}
  const [cogChanges, setCogChanges] = usePersistentState('annual_cog_changes', () => []);
  // 知力 · 改变证明（结果区·改变）— {id, changeId, text, bookTitle, insightText, daysCompleted, beforeState, afterState, nextStep, tag, createdAt}
  const [cogReviews, setCogReviews] = usePersistentState('annual_cog_reviews', () => []);

  // 合并习惯数据：用 habitTargets 覆盖 target（同时兼容真实 API 返回 + Mock 回退）
  const mergedHabits = useMemo(() => {
    const src = realHabits || HABITS;
    return src.map(h => {
      const key = h.id || h.key;
      const custom = habitTargets?.[key];
      return custom ? { ...h, target: custom } : h;
    });
  }, [realHabits, habitTargets]);

  // 修改单个习惯的年度目标
  const setHabitTarget = useCallback((habitKeyOrId, newTarget) => {
    const t = Math.max(1, Math.round(Number(newTarget) || 0));
    setHabitTargets(prev => ({ ...prev, [habitKeyOrId]: t }));
  }, [setHabitTargets]);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }, []);

  // ---- 财务模块（服务端数据：进入 finance 视图时拉取 bootstrap，变更后 finTick 触发刷新） ----
  const [finData, setFinData] = useState(null);
  const [finLoading, setFinLoading] = useState(false);
  const [finMonth, setFinMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [finTick, setFinTick] = useState(0);
  const finRefresh = useCallback(() => setFinTick(t => t + 1), []);
  // 概览页也需要财务数据（攒钱目标卡），故 overview/finance 两视图都拉取 bootstrap
  useEffect(() => {
    if (view !== 'finance' && view !== 'overview') return;
    let alive = true;
    setFinLoading(true);
    API.finance.bootstrap(finMonth)
      .then(r => { if (alive) setFinData(r); })
      .catch(e => { if (alive) showToast('财务数据加载失败：' + e.message); })
      .finally(() => { if (alive) setFinLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, finMonth, finTick]);

  // 财务 · 删除类操作（统一走全局确认弹窗）
  const finGoalRemove = useCallback((g) => {
    setConfirmDialog({
      title: '删除攒钱目标',
      message: `确定删除「${g.name}」吗？\n已存入记录会解除关联，此操作不可撤销。`,
      confirmText: '删除',
      danger: true,
      onConfirm: async () => {
        try { await API.finance.goalRemove(g.id); showToast('目标已删除'); finRefresh(); }
        catch (e) { showToast('删除失败：' + e.message); }
        setConfirmDialog(null);
      },
      onCancel: () => setConfirmDialog(null),
    });
  }, [finRefresh, showToast]);
  const finTxRemove = useCallback((tx) => {
    setConfirmDialog({
      title: '删除流水',
      message: '确定删除这笔流水吗？\n账户余额与攒钱目标进度会同步回退。',
      confirmText: '删除',
      danger: true,
      onConfirm: async () => {
        try { await API.finance.txRemove(tx.id); showToast('流水已删除'); finRefresh(); }
        catch (e) { showToast('删除失败：' + e.message); }
        setConfirmDialog(null);
      },
      onCancel: () => setConfirmDialog(null),
    });
  }, [finRefresh, showToast]);
  const finAccountRemove = useCallback((a) => {
    setConfirmDialog({
      title: '删除账户',
      message: `确定删除账户「${a.name}」吗？\n关联流水将变为未指定账户，此操作不可撤销。`,
      confirmText: '删除',
      danger: true,
      onConfirm: async () => {
        try { await API.finance.accountRemove(a.id); showToast('账户已删除'); finRefresh(); }
        catch (e) { showToast('删除失败：' + e.message); }
        setConfirmDialog(null);
      },
      onCancel: () => setConfirmDialog(null),
    });
  }, [finRefresh, showToast]);

  // ---- 数据导入 / 导出 / 重置 ----
  const handleExport = useCallback(() => {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      // 核心4模块
      books, abilities, workGoals, lifeData,
      // 精力·习惯目标
      habitTargets,
      // Step2新增：能力/工作/生活3份牵引态数据
      abilityScoreHistory, workKrMicroActions, lifeHighlightedIds,
      // 知力·完整状态（目标/KR/漏斗文字/承诺本/改变）
      cogObjective, cogKrs, funnelHeader, funnelStageLabels, bookshelfTitle,
      cogChanges, cogReviews,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const y = new Date().getFullYear();
    a.href = url;
    a.download = `annual-plan-${y}-${new Date().toISOString().slice(5,10).replace('-','')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('✅ 年度数据已导出');
  }, [books, abilities, workGoals, lifeData, habitTargets, abilityScoreHistory, workKrMicroActions, lifeHighlightedIds, cogObjective, cogKrs, funnelHeader, funnelStageLabels, bookshelfTitle, cogChanges, cogReviews, showToast]);

  const handleImport = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setConfirmDialog({
      title: '确认导入数据？',
      message: '将覆盖当前所有年度规划数据（书籍/能力/工作/生活/习惯目标/自评历史/知力目标&承诺&改变/风险拆解/生活精选），此操作无法撤销。',
      confirmText: '确认导入',
      danger: true,
      onConfirm: async () => {
        try {
          const text = await file.text();
          const data = JSON.parse(text);
          if (data.books !== undefined) setBooks(data.books);
          if (data.abilities !== undefined) setAbilities(data.abilities);
          if (data.workGoals !== undefined) setWorkGoals(data.workGoals);
          if (data.lifeData !== undefined) setLifeData(data.lifeData);
          if (data.habitTargets !== undefined) setHabitTargets(data.habitTargets);
          // Step2新增：能力自评、工作拆解、生活精选
          if (data.abilityScoreHistory !== undefined) setAbilityScoreHistory(data.abilityScoreHistory);
          if (data.workKrMicroActions !== undefined) setWorkKrMicroActions(data.workKrMicroActions);
          if (data.lifeHighlightedIds !== undefined) setLifeHighlightedIds(data.lifeHighlightedIds);
          // 知力全量
          if (data.cogObjective !== undefined) setCogObjective(data.cogObjective);
          if (data.cogKrs !== undefined) setCogKrs(data.cogKrs);
          if (data.funnelHeader !== undefined) setFunnelHeader(data.funnelHeader);
          if (data.funnelStageLabels !== undefined) setFunnelStageLabels(data.funnelStageLabels);
          if (data.bookshelfTitle !== undefined) setBookshelfTitle(data.bookshelfTitle);
          if (data.cogChanges !== undefined) setCogChanges(data.cogChanges);
          if (data.cogReviews !== undefined) setCogReviews(data.cogReviews);
          showToast('✅ 年度数据已导入');
        } catch (err) {
          console.error(err);
          showToast('❌ 导入失败：文件格式不正确');
        }
        setConfirmDialog(null);
      },
      onCancel: () => setConfirmDialog(null),
    });
  }, [setBooks, setAbilities, setWorkGoals, setLifeData, setHabitTargets, setAbilityScoreHistory, setWorkKrMicroActions, setLifeHighlightedIds, setCogObjective, setCogKrs, setFunnelHeader, setFunnelStageLabels, setBookshelfTitle, setCogChanges, setCogReviews, showToast]);

  const handleReset = useCallback(() => {
    setConfirmDialog({
      title: '重置为初始模板？',
      message: '将清除当前所有自定义数据，恢复为示例模板。此操作无法撤销。',
      confirmText: '确认重置',
      danger: true,
      onConfirm: () => {
        setBooks(BOOKS.map(b => ({ ...b, id: uid() })));
        setAbilities(ABILITY.map(a => ({ ...a, id: uid(), mstones: a.mstones.map(m => ({ ...m, id: uid() })) })));
        setWorkGoals(WORK.map(o => ({ ...o, krs: o.krs.map(k => ({ ...k, id: uid(), st: k.st === 'tg' ? 'pending' : k.st })) })));
        setLifeData(LIFE.map(c => ({ ...c, entries: c.entries.map(e => ({ ...e, id: uid() })) })));
        setHabitTargets({});
        setAbilityScoreHistory({});
        showToast('✅ 已重置为初始模板');
        setConfirmDialog(null);
      },
      onCancel: () => setConfirmDialog(null),
    });
  }, [setBooks, setAbilities, setWorkGoals, setLifeData, setHabitTargets, setAbilityScoreHistory, showToast]);

  // ---- CRUD 操作 ----
  // 认知·书籍
  // 单一真理源：写入前统一规范化 st ↔ pct（防止编辑只改一个没改另一个，导致分组不变）
  //   · 规则优先级：用户【显式指定的 st】（例如从 done 拖回 reading）> 【st 与 pct 双向同步】
  //     （避免出现"已读完→拖回阅读中，但pct还是100被auto-升回done导致动不了"的问题）
  //   · pct 边界规则：
  //     done    → 强制 pct = 100
  //     pending → 强制 pct = 0
  //     reading → pct 必须在 (0, 100) 开区间：
  //                 · 0 进来默认 1%（表示"开始读了"）
  //                 · ≥ 100 进来压到 99%（尊重用户要放reading的意图）
  //     无 st / 老数据兼容 → 仅按 pct 反推
  const normalizeBook = (b) => {
    const out = { ...b };
    const pctNum = Math.min(100, Math.max(0, Number(out.pct) || 0));
    if (out.st === 'done') {
      out.pct = 100;
    } else if (out.st === 'pending') {
      out.pct = 0;
    } else if (out.st === 'reading') {
      if (pctNum >= 100) out.pct = 99;     // 用户显式要求reading：哪怕100%也压到99，防止被下面逻辑反弹回done
      else if (pctNum <= 0) out.pct = 1;
      else out.pct = pctNum;
    } else if (out.st === 'abandoned') {
      // 显式弃读：保留原值，不自动跳状态
      out.pct = pctNum;
    } else {
      out.pct = pctNum;
      if (out.pct >= 100) out.st = 'done';
      else if (out.pct > 0) out.st = 'reading';
      else out.st = 'pending';
    }
    return out;
  };
  const bookOps = {
    add: (data) => {
      const record = normalizeBook({ ...data });
      setBooks(prev => [...prev, { ...record, id: uid() }]);
      showToast('书籍已添加');
    },
    update: (data) => {
      if (!data?.id) return;
      const record = normalizeBook({ ...data });
      setBooks(prev => prev.map(b => b.id === record.id ? { ...b, ...record } : b));
      showToast('书籍已更新');
    },
    // 快速移动（仅改变 st，其他不动；pct 会被 normalizeBook 自动同步）
    move: (id, targetSt) => {
      setBooks(prev => prev.map(b => {
        if (b.id !== id) return b;
        return normalizeBook({ ...b, st: targetSt });
      }));
      const labelMap = { done: '已读完', reading: '阅读中', pending: '未开始', abandoned: '已归档' };
      showToast(`已移至「${labelMap[targetSt] || targetSt}」`);
    },
    remove: (id) => { setBooks(prev => prev.filter(b => b.id !== id)); showToast('书籍已删除'); },
  };
  // 知力 · 行动改变（承诺本）CRUD
  const changeOps = {
    add: (data) => {
      const record = {
        id: uid(),
        bookId: data.bookId || '',
        bookTitle: data.bookTitle || '',
        insightId: data.insightId || '',
        insightText: data.insightText || '',
        resonance: data.resonance || 5,
        text: data.text || '',
        startDate: data.startDate || new Date().toISOString().slice(0, 10),
        targetDays: data.targetDays || 30,
        checkIns: data.checkIns || [],
        status: 'active',
      };
      setCogChanges(prev => [...prev, record]);
      if (data.bookId) {
        setBooks(prev => prev.map(b => b.id === data.bookId ? { ...b, hasAction: true } : b));
      }
      showToast('行动改变已添加');
    },
    update: (data) => {
      if (!data?.id) return;
      setCogChanges(prev => prev.map(c => c.id === data.id ? { ...c, ...data } : c));
      showToast('行动改变已更新');
    },
    // 复选框 toggle：点击切换完成/未完成状态（不是打卡次数）
    // 支持两条路径：独立行动（cogChanges）和书籍内嵌行动（books[].actions）
    toggleComplete: (id) => {
      // 从书籍内嵌 action 的 id 里解析：格式 {bookId}_act_{actionIdOrIdx}
      const m = id.match(/^(.+)_act_(.+)$/);
      if (m) {
        // 书籍内嵌路径 → 改 books
        const bookId = m[1];
        const actionKey = m[2];
        const book = books.find(b => b.id === bookId);
        const acts = book?.actions || [];
        // 找到对应的 action（优先按 id 匹配，其次按 idx）
        let wasDone = false;
        acts.forEach((a, i) => {
          const match = String(a.id ?? i) === actionKey;
          if (match) {
            wasDone = !!a.done;
          }
        });
        setBooks(prev => prev.map(b => {
          if (b.id !== bookId) return b;
          return {
            ...b,
            actions: (b.actions || []).map((a, i) => {
              const match = String(a.id ?? i) === actionKey;
              if (!match) return a;
              const done = !!a.done;
              return done ? { ...a, done: false, status: 'active' } : { ...a, done: true, status: 'completed' };
            }),
          };
        }));
        showToast(wasDone ? '已取消完成' : '行动已完成');
      } else {
        // 独立行动路径 → 改 cogChanges
        let wasDone = false;
        const item = cogChanges.find(c => c.id === id);
        if (item) wasDone = !!(item.done || item.status === 'completed' || item.status === 'reviewed');
        setCogChanges(prev => prev.map(c => {
          if (c.id !== id) return c;
          const done = c.done || c.status === 'completed' || c.status === 'reviewed';
          return done
            ? { ...c, done: false, status: 'active' }
            : { ...c, done: true, status: 'completed' };
        }));
        showToast(wasDone ? '已取消完成' : '行动已完成');
      }
    },
    // 30天完成 → 生成改变（保留但不复用）
    completeAndReview: (id) => {
      const change = cogChanges.find(c => c.id === id);
      if (!change) return;
      // 标记改变已完成
      setCogChanges(prev => prev.map(c => c.id === id ? { ...c, status: 'reviewed' } : c));
      // 创建改变（草稿）
      const review = {
        id: uid(),
        changeId: id,
        text: change.text,
        bookTitle: change.bookTitle,
        insightText: change.insightText,
        daysCompleted: change.checkIns.length,
        beforeState: '',
        afterState: '',
        nextStep: '',
        tag: 'habit',
        createdAt: new Date().toISOString(),
      };
      setCogReviews(prev => [...prev, review]);
      showToast('改变已生成，请填写改变前后的对比');
    },
    remove: (id) => { setCogChanges(prev => prev.filter(c => c.id !== id)); showToast('行动改变已删除'); },
  };
  // 知力 · 改变（结果区）CRUD
  const reviewOps = {
    update: (data) => {
      if (!data?.id) return;
      setCogReviews(prev => {
        const exists = prev.find(r => r.id === data.id);
        if (exists) return prev.map(r => r.id === data.id ? { ...r, ...data } : r);
        return [...prev, data];
      });
      showToast('改变已更新');
    },
    remove: (id) => { setCogReviews(prev => prev.filter(r => r.id !== id)); showToast('改变已删除'); },
  };
  // 能力·里程碑
  const msOps = {
    add: (data) => {
      setAbilities(prev => prev.map((a, i) => i === data.abilityIdx ? { ...a, mstones: [...a.mstones, { ...data, id: uid() }] } : a));
      showToast('里程碑已添加');
    },
    update: (data) => {
      setAbilities(prev => prev.map((a, i) => i === data.abilityIdx ? { ...a, mstones: a.mstones.map((m, j) => j === data.msIdx ? { ...m, lb: data.lb, startDate: data.startDate || '', dueBy: data.dueBy, st: data.st, pct: data.pct } : m) } : a));
      showToast('里程碑已更新');
    },
    remove: ({ abilityIdx, msIdx }) => {
      setAbilities(prev => prev.map((a, i) => i === abilityIdx ? { ...a, mstones: a.mstones.filter((_, j) => j !== msIdx) } : a));
      showToast('里程碑已删除');
    },
    toggleDone: ({ abilityIdx, msIdx }) => {
      let becameDone = false;
      setAbilities(prev => prev.map((a, i) => {
        if (i !== abilityIdx) return a;
        return {
          ...a,
          mstones: a.mstones.map((m, j) => {
            if (j !== msIdx) return m;
            const isDone = m.st === 'done';
            becameDone = !isDone;
            // 勾选→done(pct=100)；取消→pending 但保留原中间进度（不销毁）
            return { ...m, st: isDone ? 'pending' : 'done', pct: isDone ? Math.min(m.pct || 0, 99) : 100 };
          }),
        };
      }));
      showToast(becameDone ? '已完成 1 条 KR' : '已取消完成');
    },
  };
  // 能力·增删改
  const abilityOps = {
    add: (data) => {
      setAbilities(prev => [...prev, {
        ...data, id: uid(),
        score: String(Number(data.score) || 5),
        mode: 'milestone',
        mstones: [],
      }]);
      showToast('能力已添加，点击右上角 + 添加 KR');
    },
    update: (data) => {
      setAbilities(prev => prev.map(a => a.id === data.id ? { ...a, ...data } : a));
      showToast('能力已更新');
    },
    remove: (id) => {
      setAbilities(prev => prev.filter(a => a.id !== id));
      showToast('能力已删除');
    },
    markDone: (id) => {
      const now = new Date().toISOString().slice(0, 10);
      setAbilities(prev => prev.map(a => a.id === id ? {
        ...a,
        status: 'done',
        completedAt: a.completedAt || now,
        // 自动清里程碑：未完成的一并置 done，保证卡片进度 100% 与状态一致；
        // 同时 doing 里程碑退出月周重点主线（CalendarPage 只聚合 st='doing'）
        mstones: (a.mstones || []).map(m => m.st === 'done' ? m : { ...m, st: 'done' }),
      } : a));
      showToast('能力已标记完成');
    },
    restore: (id) => {
      setAbilities(prev => prev.map(a => a.id === id ? { ...a, status: 'active', completedAt: null } : a));
      showToast('能力已回到进行中');
    },
  };
  // 工作·Objective（目标）
  const workGoalOps = {
    add: (data) => {
      setWorkGoals(prev => [...prev, {
        id: uid(),
        core: !!data.core,
        label: data.label || (data.core ? '主业' : '副业'),
        title: data.title?.trim() || '新目标',
        mode: ['funnel', 'dashboard', 'milestone', 'balance', 'event'].includes(data.mode) ? data.mode : 'funnel',
        createdAt: data.createdAt || new Date().toISOString().slice(0, 10),
        deadline: data.deadline || '',
        completedAt: null,
        krs: [],
      }]);
      showToast('目标已添加，点击卡片内 + 添加 KR');
    },
    update: (data) => {
      if (!data.id) return;
      setWorkGoals(prev => prev.map(o => o.id === data.id ? {
        ...o,
        core: data.core !== undefined ? !!data.core : o.core,
        label: data.label || (data.core !== undefined ? (data.core ? '主业' : '副业') : o.label),
        title: data.title !== undefined ? data.title.trim() || o.title : o.title,
        mode: ['funnel', 'dashboard', 'milestone', 'balance', 'event'].includes(data.mode) ? data.mode : o.mode,
        createdAt: data.createdAt || o.createdAt,
        deadline: data.deadline !== undefined ? data.deadline : o.deadline,
      } : o));
      showToast('目标已更新');
    },
    remove: (id) => {
      setWorkGoals(prev => prev.filter(o => o.id !== id));
      showToast('目标已删除');
    },
    markDone: (id) => {
      const now = new Date().toISOString().slice(0, 10);
      setWorkGoals(prev => prev.map(o => o.id === id ? { ...o, status: 'done', completedAt: o.completedAt || now, archived: false } : o));
      showToast('目标已标记为完成');
    },
    shelf: (id) => {
      setWorkGoals(prev => prev.map(o => o.id === id ? { ...o, status: 'shelf', archived: true, completedAt: null } : o));
      showToast('目标已归档搁置');
    },
    unarchive: (id) => {
      setWorkGoals(prev => prev.map(o => o.id === id ? { ...o, status: 'active', archived: false, completedAt: null } : o));
      showToast('目标已取消归档，回到进行中');
    },
  };
  // 工作·KR
  const krOps = {
    add: (data) => {
      setWorkGoals(prev => prev.map((o, i) => i === data.workIdx ? { ...o, krs: [...o.krs, { ...data, id: uid() }] } : o));
      showToast('KR 已添加');
    },
    update: (data) => {
      setWorkGoals(prev => prev.map((o, i) => i === data.workIdx ? { ...o, krs: o.krs.map((k, j) => j === data.krIdx ? { ...k, t: data.t, v: data.v, tgt: data.tgt, u: data.u, st: data.st } : k) } : o));
      showToast('KR 已更新');
    },
    remove: ({ workIdx, krIdx }) => {
      setWorkGoals(prev => prev.map((o, i) => i === workIdx ? { ...o, krs: o.krs.filter((_, j) => j !== krIdx) } : o));
      showToast('KR 已删除');
    },
  };
  // 生活·记录（类目匹配用 c.key === data.lifeKey；旧实现 i===data.lifeKey 会把 'relation' 当成 number index 永远 false）
  const entryOps = {
    add: (data) => {
      if (!data.lifeKey) { alert('请选择一个模块'); return; }
      setLifeData(prev => prev.map(c => c.key === data.lifeKey ? { ...c, entries: [...c.entries, { ...data, id: uid() }] } : c));
      showToast('记录已添加');
    },
    update: (data) => {
      setLifeData(prev => prev.map(c => c.key === data.lifeKey ? { ...c, entries: c.entries.map((e, j) => j === data.entryIdx ? { ...e, t: data.t, n: data.n, d: data.d } : e) } : c));
      showToast('记录已更新');
    },
    remove: ({ lifeKey, entryIdx }) => {
      setLifeData(prev => prev.map(c => c.key === lifeKey ? { ...c, entries: c.entries.filter((_, j) => j !== entryIdx) } : c));
      showToast('记录已删除');
    },
  };

  // 生活·模块（大类）：新增 / 改名改色 / 删除（删除带确认）
  const lifeCatOps = {
    add: ({ lb, color }) => {
      const key = uid();
      setLifeData(prev => [...prev, { key, lb: lb.trim(), color: color || 'var(--m-life)', entries: [] }]);
      showToast(`已新增模块「${lb.trim()}」`);
      return { key };
    },
  };

  // ---- Modal 状态 ----
  const [modal, setModal] = useState(null); // { type, initial, categoryLabel }
  const closeModal = () => setModal(null);

  // 精力习惯编辑（打开 HabitForm）
  const handleEnergyAction = useCallback(async (action, habit) => {
    if (action === 'addHabit') {
      // 新建精力类习惯
      setModal({ type: 'habit', initial: { growth_type: 'energy', accent_color: '#34C759' } });
    }
    if (action === 'editHabit' && habit) {
      const rawHabit = {
        id: habit.id,
        name: habit.name,
        emoji: habit.emoji,
        growth_type: 'energy',
        accent_color: '#34C759',
        target_mode: habit.unit === '次' ? 'count' : 'check',
        target_unit: habit.unit === '次' ? '次' : habit.unit,
        target_value: habit.unit === '次' ? '1' : null,
      };
      setModal({ type: 'habit', initial: rawHabit });
    }
    if (action === 'removeHabit' && habit?.id) {
      setConfirmDialog({
        title: '删除习惯',
        message: `确定删除习惯「${habit.name}」吗？\n年度统计会一并删除，此操作不可撤销。`,
        confirmText: '删除',
        danger: true,
        onConfirm: async () => {
          try {
            await API.habits.remove(habit.id);
            showToast(`已删除习惯「${habit.name}」`);
            refreshEnergy();
          } catch (e) {
            showToast('删除失败：' + e.message);
          }
          setConfirmDialog(null);
        },
        onCancel: () => setConfirmDialog(null),
      });
    }
  }, [refreshEnergy, showToast]);

  // ---- CRUD 回调 ----
  const onBookAdd = () => setModal({ type: 'book' });
  const onBookEdit = (book, tab) => setModal({ type: 'book', initial: book, tab: tab || 'basic' });
  const onMsAdd = (abilityIdx) => setModal({ type: 'milestone', initial: { abilityIdx } });
  const onMsEdit = (abilityIdx, msIdx, m) => setModal({ type: 'milestone', initial: { ...m, abilityIdx, msIdx, id: m.id } });
  const onKrAdd = (workIdx) => setModal({ type: 'kr', initial: { workIdx } });
  const onKrEdit = (workIdx, krIdx, k) => setModal({ type: 'kr', initial: { ...k, workIdx, krIdx, id: k.id } });
  const onKrRemove = (workIdx, krIdx, kr) => {
    setConfirmDialog({
      title: '删除 KR',
      message: `确定删除「${kr?.t || '此条 KR'}」吗？\n删除后不可恢复。`,
      confirmText: '删除',
      danger: true,
      onConfirm: () => { krOps.remove({ workIdx, krIdx }); setConfirmDialog(null); },
      onCancel: () => setConfirmDialog(null),
    });
  };
  const onAbilityEdit = (abilityIdx) => {
    const a = abilities[abilityIdx]; if (!a) return;
    setModal({ type: 'ability', initial: { ...a, id: a.id } });
  };
  const onAbilityRemove = (abilityIdx) => {
    const a = abilities[abilityIdx]; if (!a) return;
    setConfirmDialog({
      title: '删除能力目标',
      message: `确定删除「${a.title}」及其所有里程碑吗？\n删除后不可恢复。`,
      confirmText: '删除',
      danger: true,
      onConfirm: () => { abilityOps.remove(a.id); setConfirmDialog(null); },
      onCancel: () => setConfirmDialog(null),
    });
  };
  const onWorkGoalRemove = (goalIdx) => {
    const o = workGoals[goalIdx]; if (!o) return;
    setConfirmDialog({
      title: '删除工作目标',
      message: `确定删除「${o.title}」及其所有 KR 吗？\n删除后不可恢复。`,
      confirmText: '删除',
      danger: true,
      onConfirm: () => { workGoalOps.remove(o.id); setConfirmDialog(null); },
      onCancel: () => setConfirmDialog(null),
    });
  };
  const onEntryAdd = (lifeKey, label) => setModal({ type: 'entry', initial: { lifeKey }, categoryLabel: label });
  const onEntryEdit = (lifeKey, entryIdx, e) => setModal({ type: 'entry', initial: { ...e, lifeKey, entryIdx, id: e.id }, categoryLabel: lifeData[lifeKey]?.lb });

  // Modal 渲染
  const modalEl = modal && (() => {
    const props = { onSaved: closeModal, onCancel: closeModal };
    switch (modal.type) {
      case 'habit':
        const isHabitEdit = !!(modal.initial && modal.initial.id);
        return (
          <Modal open onClose={closeModal} title={isHabitEdit ? '编辑精力习惯' : '添加精力习惯'}>
            <HabitForm
              initial={modal.initial}
              onSaved={() => {
                closeModal();
                showToast(isHabitEdit ? '习惯已更新' : '习惯已添加');
                refreshEnergy();
              }}
              onCancel={closeModal}
            />
          </Modal>
        );
      case 'book': {
        const isBookEdit = !!(modal.initial && modal.initial.id);
        return (
          <Modal open onClose={closeModal} title={isBookEdit ? '编辑书籍' : '添加书籍'} maxWidth={640}>
            <BookForm
              initial={modal.initial}
              initialTab={modal.tab}
              onCancel={closeModal}
              onSaved={(data) => {
                if (isBookEdit) bookOps.update(data); else bookOps.add(data);
                closeModal();
                showToast(isBookEdit ? '书籍已更新' : '书籍已添加');
              }}
              onDelete={isBookEdit ? (id) => { bookOps.remove(id); closeModal(); showToast('书籍已删除'); } : undefined}
            />
          </Modal>
        );
      }
      case 'ability':
        return (
          <Modal open onClose={closeModal} title={modal.initial?.id ? '编辑能力' : '新增能力'}>
            <AbilityForm
              initial={modal.initial}
              onCancel={closeModal}
              onSaved={(data) => {
                modal.initial?.id ? abilityOps.update(data) : abilityOps.add(data);
                closeModal();
              }}
              onDelete={modal.initial?.id ? (id) => { abilityOps.remove(id); closeModal(); } : undefined}
            />
          </Modal>
        );
      case 'milestone':
        return (
          <Modal open onClose={closeModal} title={modal.initial?.id ? '编辑里程碑' : '添加里程碑'}>
            <MilestoneForm
              initial={modal.initial}
              onCancel={closeModal}
              onSaved={(data) => {
                modal.initial?.id ? msOps.update(data) : msOps.add(data);
                closeModal();
              }}
              onDelete={modal.initial?.id ? (idx) => { msOps.remove(idx); closeModal(); } : undefined}
            />
          </Modal>
        );
      case 'kr':
        return (
          <Modal open onClose={closeModal} title={modal.initial?.id ? '编辑 KR' : '添加 KR'}>
            <KrForm
              initial={modal.initial}
              onCancel={closeModal}
              onSaved={(data) => {
                modal.initial?.id ? krOps.update(data) : krOps.add(data);
                closeModal();
              }}
              onDelete={modal.initial?.id ? (idx) => { krOps.remove(idx); closeModal(); } : undefined}
            />
          </Modal>
        );
      case 'work_goal':
        return (
          <Modal open onClose={closeModal} title={modal.initial?.id ? '编辑目标' : '新增目标'}>
            <WorkGoalForm
              initial={modal.initial}
              onCancel={closeModal}
              onSaved={(data) => {
                modal.initial?.id ? workGoalOps.update(data) : workGoalOps.add(data);
                closeModal();
              }}
              onDelete={modal.initial?.id ? (id) => { workGoalOps.remove(id); closeModal(); } : undefined}
            />
          </Modal>
        );
      case 'entry':
        return (
          <Modal open onClose={closeModal} title={modal.initial?.id ? '编辑记录' : '添加记录'} maxWidth={480}>
            <EntryForm
              initial={modal.initial}
              categoryLabel={modal.categoryLabel}
              lifeCategories={lifeData.map(c => ({ key: c.key, lb: c.lb, color: c.color }))}
              onAddCategory={(d) => lifeCatOps.add(d)}
              onCancel={closeModal}
              onSaved={(data) => {
                modal.initial?.id ? entryOps.update(data) : entryOps.add(data);
                closeModal();
              }}
              onDelete={modal.initial?.id ? (idx) => { entryOps.remove(idx); closeModal(); } : undefined}
            />
          </Modal>
        );
      case 'ability_assess':
        return (
          <Modal open onClose={closeModal} title={`${new Date().getFullYear()}年${new Date().getMonth() + 1}月 · 能力自评`} maxWidth={460}>
            <AbilityAssessmentForm
              abilities={abilities}
              scoreHistory={abilityScoreHistory}
              onCancel={closeModal}
              onSave={(scoresMap) => {
                const ym = new Date().toISOString().slice(0, 7);
                setAbilityScoreHistory(prev => {
                  const next = { ...prev };
                  abilities.forEach((a, i) => {
                    const abId = a.id || a.title;
                    const sc = scoresMap[i];
                    if (sc !== undefined) {
                      next[abId] = { ...(next[abId] || {}), [ym]: Number(sc) };
                    }
                  });
                  return next;
                });
                setAbilities(prev => prev.map((a, i) => scoresMap[i] !== undefined ? { ...a, score: String(Number(scoresMap[i])) } : a));
                showToast(`${new Date().getMonth() + 1}月自评已保存`);
                closeModal();
              }}
            />
          </Modal>
        );
      case 'risk_breakdown': {
        const { workIdx, krIdx, kr, goal, risk } = modal.initial || {};
        const krId = kr?.id || `${workIdx}-${krIdx}`;
        const exist = workKrMicroActions?.[krId] || [];
        return (
          <Modal open onClose={closeModal} title="风险KR · 微动作拆解" maxWidth={480}>
            <RiskBreakdownForm
              kr={kr} goal={goal} riskInfo={risk} existingActions={exist}
              onCancel={closeModal}
              onKrProgressAdd={(inc) => {
                if (!kr) return;
                const curV = Number(kr.v) || 0;
                const tgt = Number(kr.tgt) || 0;
                const newV = Math.min(tgt, curV + Number(inc));
                krOps.update({ workIdx, krIdx, id: kr.id, t: kr.t, v: newV, tgt: kr.tgt, u: kr.u, st: newV >= tgt ? 'done' : (kr.st || 'doing') });
                showToast(`进度已推进 +${inc}`);
              }}
              onSave={(actions) => {
                setWorkKrMicroActions(prev => ({ ...prev, [krId]: actions }));
                const doneCount = actions.filter(a => a.done).length;
                if (actions.length > 0) showToast(`拆解方案已保存（${doneCount}/${actions.length}已完成）`);
                else showToast('拆解方案已清空');
                closeModal();
              }}
            />
          </Modal>
        );
      }
      case 'life_highlights':
        return (
          <Modal open onClose={closeModal} title={`${new Date().getFullYear()}年 · 年度精选 & 记忆卡`} maxWidth={520}>
            <LifeHighlightsForm
              lifeData={lifeData}
              highlightedIds={lifeHighlightedIds}
              onCancel={closeModal}
              onToggleHighlight={(id) => {
                setLifeHighlightedIds(prev => {
                  const set = new Set(prev || []);
                  if (set.has(id)) set.delete(id); else set.add(id);
                  return Array.from(set);
                });
              }}
              onSave={(ids) => {
                setLifeHighlightedIds(Array.isArray(ids) ? ids : []);
                if (ids.length > 0) showToast(`已收藏 ${ids.length} 条精选记忆`);
                else showToast('精选已清空');
                closeModal();
              }}
            />
          </Modal>
        );
      case 'finance_tx':
        return (
          <Modal open onClose={closeModal} title={modal.initial?.id ? '编辑这笔记录' : '记一笔'} maxWidth={480}>
            <FinanceTxForm
              initial={modal.initial}
              accounts={finData?.accounts || []}
              categories={finData?.categories || []}
              onCancel={closeModal}
              onSaved={() => { closeModal(); showToast(modal.initial?.id ? '流水已更新' : '已记一笔'); finRefresh(); }}
              onDelete={(tx) => finTxRemove(tx)}
            />
          </Modal>
        );
      case 'finance_goal':
        return (
          <Modal open onClose={closeModal} title={modal.initial?.id ? '编辑攒钱目标' : '新建攒钱目标'} maxWidth={460}>
            <FinanceGoalForm
              initial={modal.initial}
              accounts={finData?.accounts || []}
              onCancel={closeModal}
              onSaved={() => { closeModal(); showToast(modal.initial?.id ? '目标已更新' : '目标已创建'); finRefresh(); }}
              onDelete={(g) => finGoalRemove(g)}
            />
          </Modal>
        );
      case 'finance_deposit':
        return (
          <Modal open onClose={closeModal} title={`存入 · ${modal.initial?.name || ''}`} maxWidth={440}>
            <FinanceDepositForm
              goal={modal.initial}
              accounts={finData?.accounts || []}
              onCancel={closeModal}
              onSaved={() => { closeModal(); showToast('已存入，目标进度已更新'); finRefresh(); }}
            />
          </Modal>
        );
      case 'finance_manage':
        return (
          <Modal open onClose={closeModal} title="管理收支分类" maxWidth={480}>
            <FinanceManageForm
              categories={finData?.categories || []}
              onCancel={closeModal}
              onSaved={(close) => { finRefresh(); if (close !== false) closeModal(); }}
            />
          </Modal>
        );
      case 'finance_account':
        return (
          <Modal open onClose={closeModal} title={modal.initial?.id ? '编辑账户' : '新建账户'} maxWidth={460}>
            <FinanceAccountForm
              initial={modal.initial}
              onCancel={closeModal}
              onSaved={() => { closeModal(); showToast(modal.initial?.id ? '账户已更新' : '账户已创建'); finRefresh(); }}
              onDelete={(a) => finAccountRemove(a)}
            />
          </Modal>
        );
      case 'finance_goal_detail':
        return (
          <Modal open onClose={closeModal} title="目标详情" maxWidth={440}>
            <FinanceGoalDetail
              goal={modal.initial}
              onClose={closeModal}
              onEdit={() => setModal({ type: 'finance_goal', initial: modal.initial })}
            />
          </Modal>
        );
      default: return null;
    }
  })();

  const stats = useOverviewStats(mergedHabits, books, abilities, workGoals, lifeData, finData);

  // 主内容
  const mainContent = (
    <main key={view} className="flex-1 min-w-0 animate-fade-in">
      {view === 'overview'  && <OverviewView  onNav={setView} stats={stats} realHabits={mergedHabits} books={books} abilities={abilities} workGoals={workGoals} lifeData={lifeData} finData={finData} />}
      {view === 'energy'    && <EnergyView   realHabits={mergedHabits} loading={energyLoading} onAction={handleEnergyAction} onSetTarget={setHabitTarget} />}
      {view === 'cognition' && <CognitionView books={books} onBookAdd={onBookAdd} onBookEdit={onBookEdit} onBookMove={(id, st) => bookOps.move(id, st)}
        onBookUpdate={(id, patch) => { setBooks(prev => prev.map(b => b.id === id ? { ...b, ...patch } : b)); showToast('书籍已更新'); }}
        onBooksReplace={(updater) => { setBooks(prev => (typeof updater === 'function' ? updater(prev) : updater)); }}
        onBookContextMenu={(e, b) => {
          const opts = [
            { k: 'edit',     label: '✏️ 编辑书籍' },
            { k: 'reading',  label: '🔵 移到 阅读中' },
            { k: 'pending',  label: '⚪ 移到 未开始' },
            { k: 'done',     label: '🟢 移到 已读完' },
            { k: 'delete',   label: '🗑 删除这本书' },
          ];
          const txt = opts.map((o, i) => `${i+1}. ${o.label}`).join('\n');
          const raw = prompt(`${b.t}\n\n请输入操作序号（回车取消）：\n\n${txt}`, '1');
          const idx = Number(raw);
          if (!idx || idx < 1 || idx > opts.length) return;
          const pick = opts[idx - 1];
          if (pick.k === 'edit') onBookEdit(b);
          else if (pick.k === 'delete') {
            if (confirm(`确定删除《${b.t}》？`)) bookOps.remove(b.id);
          } else bookOps.move(b.id, pick.k);
        }}
        objective={cogObjective} onObjectiveChange={setCogObjective}
        krs={cogKrs} onKrAdd={(kr) => { setCogKrs(prev => [...prev, { ...kr, id: uid() }]); showToast('KR 已添加'); }}
        onKrEdit={(kr) => { setCogKrs(prev => prev.map(k => k.id === kr.id ? { ...k, ...kr } : k)); showToast('KR 已更新'); }}
        onKrRemove={(id) => { setCogKrs(prev => prev.filter(k => k.id !== id)); showToast('KR 已删除'); }}
        funnelHeader={funnelHeader} setFunnelHeader={setFunnelHeader}
        funnelStageLabels={funnelStageLabels} setFunnelStageLabels={setFunnelStageLabels}
        bookshelfTitle={bookshelfTitle} setBookshelfTitle={setBookshelfTitle}
        changes={cogChanges}
        onChangeAdd={changeOps.add} onChangeUpdate={changeOps.update} onChangeToggleComplete={changeOps.toggleComplete} onChangeComplete={changeOps.completeAndReview} onChangeRemove={changeOps.remove}
        reviews={cogReviews} onReviewUpdate={reviewOps.update} onReviewRemove={reviewOps.remove}
        showToast={showToast}
      />}
      {view === 'ability'   && <AbilityView  abilities={abilities} onMsAdd={onMsAdd} onMsEdit={onMsEdit}
        onMsToggleDone={({ abilityIdx, msIdx }) => {
          msOps.toggleDone({ abilityIdx, msIdx });
          // 完成态能力手动取消某里程碑 → 自动回到进行中（混合式判定的回退路径）
          const ab = abilities[abilityIdx];
          const m = ab && (ab.mstones || [])[msIdx];
          if (ab && ab.status === 'done' && m && m.st === 'done') abilityOps.restore(ab.id);
        }}
        onAbilityAdd={() => setModal({ type: 'ability' })}
        onAbilityEdit={onAbilityEdit}
        onAbilityRemove={onAbilityRemove}
        onAbilityMarkDone={(id) => abilityOps.markDone(id)}
        onAbilityRestore={(id) => abilityOps.restore(id)}
        scoreHistory={abilityScoreHistory} onSetScore={(abilityIdx, newScore) => {
          const ab = abilities[abilityIdx]; if (!ab) return;
          const ym = new Date().toISOString().slice(0,7);
          const abId = ab.id || ab.title;
          setAbilityScoreHistory(prev => ({ ...prev, [abId]: { ...(prev[abId] || {}), [ym]: newScore } }));
          setAbilities(prev => prev.map((a, i) => i === abilityIdx ? { ...a, score: String(newScore) } : a));
          showToast('自评已更新');
        }} onStartAssessment={() => setModal({ type: 'ability_assess' })} />}
      {view === 'work'      && <WorkView     workGoals={workGoals} onKrAdd={onKrAdd} onKrEdit={onKrEdit} onKrRemove={onKrRemove}
        onGoalAdd={() => setModal({ type: 'work_goal' })}
        onGoalEdit={(goalIdx) => setModal({ type: 'work_goal', initial: { ...workGoals[goalIdx], goalIdx } })}
        onGoalRemove={onWorkGoalRemove}
        onGoalMarkDone={(id) => workGoalOps.markDone(id)}
        onGoalShelf={(id) => workGoalOps.shelf(id)}
        onGoalUnarchive={(id) => workGoalOps.unarchive(id)}
        microActions={workKrMicroActions}
        onRiskTagClick={(workIdx, krIdx, kr, goal, risk) => setModal({ type: 'risk_breakdown', initial: { workIdx, krIdx, kr, goal, risk } })} />}
      {view === 'life'      && <LifeView     lifeData={lifeData} onEntryAdd={onEntryAdd} onEntryEdit={onEntryEdit}
        highlightedIds={lifeHighlightedIds}
        onStartHighlights={() => setModal({ type: 'life_highlights' })}
        docLinks={lifeDocLinks}
        onDocLinksChange={(next) => setLifeDocLinks(next)}
        onCatAdd={(d) => lifeCatOps.add(d)} />}
      {view === 'finance'   && (
        <FinanceView
          data={finData}
          loading={finLoading || !finData}
          month={finMonth}
          onMonthChange={setFinMonth}
          onTxAdd={() => setModal({ type: 'finance_tx' })}
          onTxEdit={(tx) => setModal({ type: 'finance_tx', initial: tx })}
          onTxRemove={finTxRemove}
          onGoalAdd={() => setModal({ type: 'finance_goal' })}
          onGoalEdit={(g) => setModal({ type: 'finance_goal', initial: g })}
          onGoalRemove={finGoalRemove}
          onGoalDetail={(g) => setModal({ type: 'finance_goal_detail', initial: g })}
          onDeposit={(g) => setModal({ type: 'finance_deposit', initial: g })}
          onManage={() => setModal({ type: 'finance_manage' })}
          onAccountAdd={() => setModal({ type: 'finance_account' })}
          onAccountEdit={(a) => setModal({ type: 'finance_account', initial: a })}
          onAccountRemove={finAccountRemove}
        />
      )}
    </main>
  );

  const toastEl = toast && (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2"
      style={{ background: '#fff', border: '1px solid rgba(15,23,42,0.08)', boxShadow: '0 8px 24px rgba(15,23,42,0.12)' }}>
      <svg className="w-4 h-4" fill="none" stroke="#34C759" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>
      <span className="text-ink-800">{toast}</span>
    </div>
  );

  const confirmEl = confirmDialog && (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink-900/40 backdrop-blur-sm" onClick={confirmDialog.onCancel}>
      <div className="bg-white rounded-2xl shadow-xl w-[360px] overflow-hidden animate-fade-in" onClick={e => e.stopPropagation()}>
        <div className="p-5 flex flex-col gap-1">
          <h3 className="text-base font-bold text-ink-900">{confirmDialog.title}</h3>
          <p className="text-sm text-ink-500 whitespace-pre-line leading-relaxed mt-1">{confirmDialog.message}</p>
        </div>
        <div className="flex border-t border-ink-100">
          <button onClick={confirmDialog.onCancel} className="flex-1 py-3.5 text-sm font-semibold text-ink-600 hover:bg-ink-100 transition">取消</button>
          <button onClick={confirmDialog.onConfirm}
            className={['flex-1 py-3.5 text-sm font-bold transition', confirmDialog.danger ? 'text-accent-red hover:bg-accent-red/10' : 'hover:bg-ink-100'].join(' ')}
            style={confirmDialog.danger ? undefined : { color: 'var(--s-main)' }}>
            {confirmDialog.confirmText || '确认'}
          </button>
        </div>
      </div>
    </div>
  );

  const styles = (
    <style>{`
      /* ---- 精力表格 grid 模板：[习惯名] [完成率 累计 目标] [月份×12] ---- 
         设计原则：完成率绿胶囊（56px）作为第一视觉焦点，与L3日历KPI设计一致
      */
      .habit-table {
        grid-template-columns: minmax(110px, 1.5fr) 68px 52px 64px repeat(12, minmax(32px, 0.28fr));
        gap: 0 0;
        align-items: center;
      }
      /* 分组间距：习惯名与统计区分组 */
      .habit-table > .grp-start {
        margin-right: 4px;
      }
      /* 分组间距：统计区与月份区分组（目标列是最后一个统计列） */
      .habit-table > .grp-end {
        padding-right: 12px;
      }
      /* 统计区内：完成率与累计之间间距 */
      .habit-table > .rate-gap {
        margin-right: 10px;
      }
      /* 统计区内：累计与目标之间间距 */
      .habit-table > .cum-gap {
        margin-right: 6px;
      }
      /* ---- P2-13: 视图淡入过渡 ---- */
      @keyframes fade-in-up {
        from { opacity: 0; transform: translateY(6px); }
        to   { opacity: 1; transform: none; }
      }
      .animate-fade-in { animation: fade-in-up 0.25s cubic-bezier(0.2, 0.8, 0.2, 1); }

      /* ---- P1-8: 响应式断点 ---- */
      /* 中等屏幕：5列 → 3列 */
      @media (max-width: 1200px) {
        .annual-cat-grid   { grid-template-columns: repeat(3, 1fr) !important; }
        .annual-life-grid  { grid-template-columns: repeat(3, 1fr) !important; }
        .annual-work-grid  { grid-template-columns: 1fr !important; }
      }
      /* 小屏幕：3列 → 2列 */
      @media (max-width: 900px) {
        .annual-cat-grid   { grid-template-columns: repeat(2, 1fr) !important; }
        .annual-life-grid  { grid-template-columns: repeat(2, 1fr) !important; }
        .annual-energy-grid,
        .annual-ability-grid { grid-template-columns: repeat(2, 1fr) !important; }
      }
      /* 极小屏幕：2列 → 1列 */
      @media (max-width: 640px) {
        .annual-cat-grid,
        .annual-life-grid,
        .annual-energy-grid,
        .annual-ability-grid { grid-template-columns: 1fr !important; }
      }
    `}</style>
  );

  // 嵌入式：工作台内使用。顶部 Tab 已整合到应用左侧边栏「发展规划」二级导航
  //（图标+文字+加号，由 Workspace 透传 annualView/onAnnualView/onAnnualAdd/addRequest 驱动）
  if (!standalone) {
    return (
      <div className="w-full">
        {mainContent}
        {styles}
        {toastEl}
        {modalEl}
        {confirmEl}
      </div>
    );
  }

  // 独立模式（沙盒 #annual 预览）：完整外壳 + 内部 Sidebar + 返回工作台
  return (
    <div className="min-h-screen bg-surface-base px-3 md:px-6 py-4 md:py-6">
      <div className="max-w-[1400px] mx-auto">
        <NavBar onExport={handleExport} onImport={handleImport} onReset={handleReset} />
        <div className="flex flex-col lg:flex-row gap-4 lg:gap-5 items-start annual-root-layout">
          <Sidebar active={view} onChange={setView} stats={stats} />
          {mainContent}
        </div>
      </div>
      {styles}
      {toastEl}
      {modalEl}
      {confirmEl}
    </div>
  );
}
