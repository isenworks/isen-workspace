import { useState, useCallback, useMemo, useEffect, useRef, lazy, Suspense } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { WorkspaceActionsProvider } from '../context/WorkspaceActionsContext.jsx';
import { today as getToday, toISODate, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addDaysISO, calcDurationMin } from '../utils/date.js';
import Sidebar from '../components/Sidebar.jsx';
import WeekCalendar from '../components/WeekCalendar.jsx';
import KeyTasks from '../components/KeyTasks.jsx';
import HabitsPanel from '../components/HabitsPanel.jsx';
import Timeline from '../components/Timeline.jsx';
import Modal from '../components/Modal.jsx';
import HabitForm from '../components/forms/HabitForm.jsx';
import BookForm from '../components/forms/BookForm.jsx';
import KrForm from '../components/forms/KrForm.jsx';
import MilestoneForm from '../components/forms/MilestoneForm.jsx';
import AbilityForm from '../components/forms/AbilityForm.jsx';
import AnnualPlan from './AnnualPlan.jsx';
import { API } from '../api/client.js';
import { store } from '../utils/store.js';
import { useSplitRatio, SplitDivider } from '../components/useSplitRatio.jsx';

// ===== 路由级 / 弹窗级懒加载：仅在对应菜单或弹窗打开时才拉取分块，减小首屏 JS =====
// 注：CalendarPage 内含 lunar 农历库（大），懒加载后随「日历」菜单按需加载，不进首屏；
//     日历为高频页面，挂载后空闲时后台预取分块（见组件内 warm 效果），首次点击即秒开
//     HabitForm/BookForm/KrForm/MilestoneForm/AbilityForm 被 AnnualPlan 静态引用（随其加载），懒加载无收益故保留静态
const CalendarPage = lazy(() => import('./CalendarPage.jsx'));
const RecycleBinPage = lazy(() => import('./RecycleBinPage.jsx'));
const InboxPage = lazy(() => import('./InboxPage.jsx'));
const ScheduleForm = lazy(() => import('../components/forms/ScheduleForm.jsx'));
const TaskForm = lazy(() => import('../components/forms/TaskForm.jsx'));
const FixedScheduleForm = lazy(() => import('../components/forms/FixedScheduleForm.jsx'));
const FixedSchedulesPanel = lazy(() => import('../components/FixedSchedulesPanel.jsx'));
const SummaryPanel = lazy(() => import('../components/SummaryPanel.jsx'));
const QuickCapture = lazy(() => import('../components/QuickCapture.jsx'));
const SettingsModal = lazy(() => import('../components/SettingsModal.jsx'));

// 懒加载分块拉取时的占位
const ChunkFallback = () => (
  <div className="flex items-center justify-center py-12 text-sm" style={{ color: '#8e8e93' }}>加载中…</div>
);

const VIEW_RANGES = {
  today: (d) => ({ from: d, to: d }),
  week: (d) => ({ from: toISODate(startOfWeek(d)), to: toISODate(endOfWeek(d)) }),
  month: (d) => ({ from: toISODate(startOfMonth(d)), to: toISODate(endOfMonth(d)) })
};

export default function Workspace({ user: propUser }) {
  const { user: authUser, logout: authLogout, updateUser } = useAuth();
  const toast = useToast();
  const user = propUser || authUser;
  const logout = authLogout || (() => {});
  const [activeMenu, setActiveMenu] = useState('plan');
  const [annualView, setAnnualView] = useState('overview');
  // 侧边栏「发展规划」二级导航加号请求：{ view, ts } → AnnualPlan 打开对应添加弹窗
  const [annualAdd, setAnnualAdd] = useState(null);
  const [selectedDate, setSelectedDate] = useState(getToday());
  const [view, setView] = useState('today');
  const [refreshKey, setRefreshKey] = useState(0);
  const [modal, setModal] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // 右栏显示总结面板状态：默认显示时间线
  const [showSummary, setShowSummary] = useState(false);

  // ===== 收集箱：待分派计数（侧边栏徽标 + 计划页提醒条）+ 快速捕获弹窗 =====
  const [inboxCount, setInboxCount] = useState(0);
  const [quickCaptureOpen, setQuickCaptureOpen] = useState(false);
  // 快速捕获「分派」：详细分派弹窗 { item, initial }（ScheduleForm 预填）
  const [dispatchDetail, setDispatchDetail] = useState(null);

  // ===== 今日计划左右分栏拖拽比例（与收集箱同款交互，独立记忆） =====
  const { leftStyle, rightStyle, bindRoot, bindDivider } = useSplitRatio('plan_split_ratio');

  // ===== 右键上下文菜单 =====
  const [ctxMenu, setCtxMenu] = useState(null); // {x, y, type, id}
  const [confirm, setConfirm] = useState(null); // {title, msg, okText, okColor, onOk, onCancel}
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archivedHabits, setArchivedHabits] = useState([]);

  const ctxRef = useRef(null);
  const ctxMenuShownAt = useRef(0);
  const lastSyncRef = useRef(Date.now()); // 防止过于频繁的自动同步

  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);
  const range = useMemo(() => VIEW_RANGES[view](selectedDate), [view, selectedDate]);

  // === 自动同步机制 ===
  // 1) 切回标签页时自动刷新（最常见场景：在手机改了数据，切回电脑）
  // 2) 定时轮询兜底（防止一直停在页面没切走）
  const [syncSignal, setSyncSignal] = useState(0);

  const doAutoSync = useCallback(() => {
    const now = Date.now();
    // 至少间隔 15 秒，避免频繁切换标签页导致 API 风暴
    if (now - lastSyncRef.current < 15000) return;
    lastSyncRef.current = now;
    refresh();
    setSyncSignal(s => s + 1);
  }, [refresh]);

  // 切回标签页时自动同步
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === 'visible') {
        doAutoSync();
      }
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [doAutoSync]);

  // 定时轮询：每 120 秒自动刷新一次（仅当页面可见时）
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        doAutoSync();
      }
    }, 120000);
    return () => clearInterval(timer);
  }, [doAutoSync]);

  // ===== 收集箱待分派计数：挂载 + 全局刷新（refreshKey）时同步 =====
  const loadInboxCount = useCallback(() => {
    API.inbox.list().then(r => setInboxCount((r.items || []).length)).catch(() => {});
  }, []);
  useEffect(() => { loadInboxCount(); }, [loadInboxCount, refreshKey]);

  // ===== 日历分块预取：高频页面，登录后空闲时后台拉取（含农历库），首次点击免「加载中」 =====
  // 与上方 lazy() 引用同一模块，预取后模块缓存命中，点击日历零网络等待
  useEffect(() => {
    const warm = () => { import('./CalendarPage.jsx'); };
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(warm, { timeout: 2000 });
      return () => window.cancelIdleCallback(id);
    }
    const timer = setTimeout(warm, 1500);
    return () => clearTimeout(timer);
  }, []);

  // ===== 快速捕获「分派」：条目已先收进收集箱，这里打开详细分派（与收集箱页同款流程） =====
  function openDispatchFor(item) {
    if (!item) return;
    setQuickCaptureOpen(false); // 关闭快速捕获弹窗，避免弹窗叠加
    // 首行作标题、其余行作正文（与收集箱页 splitContent 同规则）
    const s = String(item.content || '');
    const idx = s.indexOf('\n');
    setDispatchDetail({
      item,
      initial: {
        title: idx === -1 ? s : s.slice(0, idx),
        content: idx === -1 ? '' : s.slice(idx + 1).trim(),
        category: item.category != null ? Number(item.category) : 3,
        date: getToday(),
        start_time: '',
      },
    });
  }

  // 日程创建成功 → 回写收集箱条目分派去向
  async function onDispatchSaved() {
    const item = dispatchDetail?.item;
    setDispatchDetail(null);
    refresh();
    if (!item) return;
    try {
      await API.inbox.update(item.id, { processed_type: 'schedule' });
      loadInboxCount();
      store.broadcast({ type: 'reload' });
      toast.success('已转为日程');
    } catch (e) {
      // 日程已建好，仅回写失败：条目留在收集箱，用户可手动完成，避免产生重复日程
      toast.error('日程已创建，但收集箱状态回写失败');
    }
  }

  // ===== 快捷键 N：任意页面快速捕获（无输入框聚焦、无弹窗打开时） =====
  useEffect(() => {
    function onKey(e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (modal || settingsOpen || quickCaptureOpen || archiveOpen) return;
      const t = e.target;
      const tag = t?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable) return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        setQuickCaptureOpen(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modal, settingsOpen, quickCaptureOpen, archiveOpen]);

  // ===== 问题3a-3：历史脏数据一次性修复 =====
  // 遍历 schedules，按 start_time + end_time 重算 duration_min，与存储值不一致则写回
  // 用 localStorage + 用户 ID 做 flag 防止重复跑
  const repairRanRef = useRef(false);
  useEffect(() => {
    if (repairRanRef.current) return;
    const uid = user?.id || 'anon';
    const FLAG_KEY = `sched_duration_repaired:${uid}`;
    try {
      if (localStorage.getItem(FLAG_KEY) === '1') { repairRanRef.current = true; return; }
    } catch (_) {}
    repairRanRef.current = true;

    (async () => {
      try {
        const todayStr = getToday();
        // 扫描范围：过去 365 天 ~ 未来 365 天（足够覆盖绝大多数据）
        const from = addDaysISO(todayStr, -365);
        const to = addDaysISO(todayStr, 365);
        const r = await API.schedules.list({ from, to });
        const all = r?.schedules || [];
        const toFix = [];
        for (const s of all) {
          if (!s.start_time || !s.end_time) continue;
          const calc = calcDurationMin(s.start_time, s.end_time);
          if (calc == null) continue;
          const stored = Number(s.duration_min);
          if (!Number.isFinite(stored) || Math.abs(stored - calc) >= 1) {
            toFix.push({ id: s.id, title: s.title, stored, calc });
          }
        }
        if (toFix.length === 0) {
          try { localStorage.setItem(FLAG_KEY, '1'); } catch (_) {}
          return;
        }
        // 串行写回，避免并发打爆接口
        let ok = 0;
        for (const f of toFix) {
          try {
            await API.schedules.update(f.id, { duration_min: f.calc });
            ok++;
          } catch (e) {
            console.warn('[repair] update fail', f, e?.message || e);
          }
        }
        try { localStorage.setItem(FLAG_KEY, '1'); } catch (_) {}
        if (ok > 0) {
          console.info(`[repair] 修复历史 duration_min 脏数据：共 ${toFix.length} 条，成功 ${ok} 条`);
          // 触发一次全局 reload 让 UI 拿最新
          store.broadcast({ type: 'reload' });
          refresh();
        }
      } catch (e) {
        console.warn('[repair] 修复脚本出错，不影响主流程：', e?.message || e);
      }
    })();
  }, [user, refresh]);

  // ===== 跨组件动作（替代原 window.__* 全局函数）：通过 Context 注入给子组件 =====
  const showContextMenu = useCallback((x, y, type, id) => {
    ctxMenuShownAt.current = Date.now();
    setCtxMenu({ x, y, type, id });
  }, []);
  const openHabitModal = useCallback((habit) => {
    setModal(habit ? { type: 'habit', data: habit } : { type: 'habit', data: null });
  }, []);
  const openArchive = useCallback(() => setArchiveOpen(true), []);

  // 监听全局点击/滚动/按ESC，关闭上下文菜单
  useEffect(() => {
    function onDocMouseDown(e) {
      if (!ctxMenu) return;
      // 右键触发的 300ms 内的点击（同一次手势的 click/mouseup），忽略
      if (Date.now() - ctxMenuShownAt.current < 350) return;
      const el = ctxRef.current;
      if (!el || !el.contains(e.target)) setCtxMenu(null);
    }
    function onDocScroll() { ctxMenu && setCtxMenu(null); }
    function onDocKey(e) { if (e.key === 'Escape') setCtxMenu(null); }
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('scroll', onDocScroll, true);
    document.addEventListener('keydown', onDocKey);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('scroll', onDocScroll, true);
      document.removeEventListener('keydown', onDocKey);
    };
  }, [ctxMenu]);

  // 加载归档习惯
  const loadArchived = useCallback(async () => {
    try {
      const r = await API.habits.archivedList();
      setArchivedHabits(r.habits || []);
    } catch (e) { console.error(e); }
  }, []);
  useEffect(() => { if (archiveOpen) loadArchived(); }, [archiveOpen, loadArchived]);

  // 归档习惯确认 / 删除事项确认（注入给子组件，替代原 window.__* ）
  const archiveHabitConfirm = useCallback((id, name) => {
    setConfirm({
      title: '归档该习惯？',
      msg: `「${name}」将移至"归档"，可以从归档恢复。`,
      okText: '归档',
      okColor: '#FF9500',
      onOk: async () => {
        try {
          await API.habits.archive(id);
          store.broadcast({ type: 'reload' });
          refresh();
          setConfirm(null);
        } catch (e) { toast.error(e.message); }
      },
      onCancel: () => setConfirm(null)
    });
  }, [refresh, toast]);
  const deleteScheduleConfirm = useCallback((id, title) => {
    setConfirm({
      title: '确认删除',
      msg: `「${title}」删除后无法恢复，确定要删除吗？`,
      okText: '确定删除',
      okColor: '#FF3B30',
      onOk: async () => {
        try {
          await API.schedules.remove(id);
          store.broadcast({ type: 'reload' });
          refresh();
          setConfirm(null);
        } catch (e) { toast.error(e.message); }
      },
      onCancel: () => setConfirm(null)
    });
  }, [refresh, toast]);

  // 注入给子组件的动作集合（稳定引用，避免 Context 消费者无谓重渲染）
  const workspaceActions = useMemo(() => ({
    showContextMenu, openHabitModal, openArchive, archiveHabitConfirm, deleteScheduleConfirm,
  }), [showContextMenu, openHabitModal, openArchive, archiveHabitConfirm, deleteScheduleConfirm]);

  // === 联动逻辑（参考 demo：Tab 与日历双向联动）===
  // Tab 切换：重置 selectedDate 到今天
  const handleViewChange = useCallback((v) => {
    setView(v);
    setSelectedDate(getToday());
  }, []);

  // 日历点击：强制 view 切回 'today'
  const handleSelectDate = useCallback((d) => {
    setSelectedDate(d);
    setView('today');
  }, []);

  // ===== 上下文菜单操作 =====
  async function handleCtxAction(action) {
    if (!ctxMenu) return;
    const { type, id } = ctxMenu;
    setCtxMenu(null);

    if (action === 'edit') {
      if (type === 'schedule') {
        try {
          const r = await API.schedules.get(id);
          if (r?.schedule) setModal({ type: 'schedule', data: r.schedule });
        } catch (e) { toast.error(e.message); }
      } else if (type === 'habit') {
        // 习惯编辑：通过统一入口打开，与新建习惯共用同一弹窗
        try {
          const r = await API.habits.list();
          const h = r.habits.find(x => x.id === id);
          if (h) openHabitModal(h);
        } catch (e) { toast.error(e.message); }
      } else if (type === 'task') {
        try {
          const r = await API.tasks.get(id);
          if (r?.task) setModal({ type: 'task', data: r.task });
        } catch (e) { toast.error(e.message); }
      }
    }

    if (action === 'delete') {
      if (type === 'schedule') {
        setConfirm({
          title: '确认删除',
          msg: '删除后无法恢复，确定要删除该日程吗？',
          okText: '确定删除',
          okColor: '#FF3B30',
          onOk: async () => {
            try {
              await API.schedules.remove(id);
              store.broadcast({ type: 'reload' });
              refresh();
              setConfirm(null);
            } catch (e) { toast.error(e.message); }
          },
          onCancel: () => setConfirm(null)
        });
      } else if (type === 'task') {
        setConfirm({
          title: '删除该待办？',
          msg: '删除后可在回收站恢复，确定要删除该待办吗？',
          okText: '确定删除',
          okColor: '#FF3B30',
          onOk: async () => {
            try {
              await API.tasks.remove(id);
              store.broadcast({ type: 'reload' });
              refresh();
              setConfirm(null);
            } catch (e) { toast.error(e.message); }
          },
          onCancel: () => setConfirm(null)
        });
      } else if (type === 'habit') {
        setConfirm({
          title: '归档该习惯？',
          msg: '习惯将移至"归档"，可以从归档恢复。',
          okText: '归档',
          okColor: '#FF9500',
          onOk: async () => {
            try {
              await API.habits.archive(id);
              store.broadcast({ type: 'reload' });
              refresh();
              setConfirm(null);
            } catch (e) { toast.error(e.message); }
          },
          onCancel: () => setConfirm(null)
        });
      }
    }
  }

  async function restoreHabit(id) {
    setConfirm({
      title: '恢复该习惯？',
      msg: '将从归档中移出，回到习惯列表。',
      okText: '恢复',
      okColor: '#34C759',
      onOk: async () => {
        try {
          await API.habits.restore(id);
          store.broadcast({ type: 'reload' });
          refresh();
          await loadArchived();
          setConfirm(null);
        } catch (e) { toast.error(e.message); }
      },
      onCancel: () => setConfirm(null)
    });
  }

  async function deleteHabit(id, name) {
    setConfirm({
      title: '彻底删除？',
      msg: `「${name}」及其所有打卡记录将被永久删除，无法恢复。`,
      okText: '永久删除',
      okColor: '#FF3B30',
      onOk: async () => {
        try {
          await API.habits.remove(id);
          store.broadcast({ type: 'reload' });
          refresh();
          await loadArchived();
          setConfirm(null);
        } catch (e) { toast.error(e.message); }
      },
      onCancel: () => setConfirm(null)
    });
  }

  return (
    <WorkspaceActionsProvider value={workspaceActions}>
    <div className="max-w-[1440px] mx-auto px-6 py-6 flex gap-6 min-h-screen">
      {/* 左侧边栏 */}
      <Sidebar 
        user={user} 
        onLogout={logout} 
        onSettingsClick={() => setSettingsOpen(true)} 
        syncSignal={syncSignal}
        onSync={async () => {
          // 手动同步：立即刷新所有面板
          lastSyncRef.current = Date.now();
          refresh();
        }}
        onUserUpdate={(updatedUser) => {
          updateUser({ avatar: updatedUser.avatar });
        }}
        onBeforeLogout={() => {
          setConfirm({
            title: '退出登录？',
            msg: '退出后需要重新输入账号密码才能登录。',
            okText: '确认退出',
            okColor: '#FF3B30',
            onOk: async () => {
              try {
                await logout();
                setConfirm(null);
              } catch (e) {
                setConfirm(null);
                toast.error(e.message || '退出失败');
              }
            },
            onCancel: () => setConfirm(null)
          });
        }}
        activeMenu={activeMenu}
        onMenuChange={setActiveMenu}
        annualView={annualView}
        onAnnualView={setAnnualView}
        onAnnualAdd={(k) => {
          // 侧边栏二级导航加号：切到发展规划对应模块并弹出添加表单
          setAnnualView(k);
          setActiveMenu('annual');
          setAnnualAdd({ view: k, ts: Date.now() });
        }}
        inboxCount={inboxCount}
        onQuickCapture={() => setQuickCaptureOpen(true)}
      />

      {/* 主内容区（含懒加载页面，用 Suspense 兜底分块拉取） */}
      <Suspense fallback={<ChunkFallback />}>
      {activeMenu === 'annual' ? (
        <div className="flex-1 min-w-0">
          <AnnualPlan standalone={false} initialView={annualView} onViewChange={setAnnualView} addRequest={annualAdd} />
        </div>
      ) : activeMenu === 'inbox' ? (
        <InboxPage onCountChange={setInboxCount} />
      ) : activeMenu === 'recycle' ? (
        <RecycleBinPage />
      ) : activeMenu === 'calendar' ? (
        <div className="flex-1 min-w-0">
          <CalendarPage
            onEditSchedule={(payload, ctx) => {
              // 日历页回调：按 payload.type / ctx.module 分发到对应编辑面板（需求 4：书籍→书架同款 BookForm）
              //   新版 CalendarPage 直接在 payload 内携带 initial（book/milestone/kr）；兼容旧版字段 p.title/progress/color
              const p = payload || {};
              const type = p.type || 'schedule';
              switch (type) {
                case 'book': {
                  // 知力：书籍编辑面板 — 优先使用 payload.initial（CalendarPage 已从 BOOKS 常量或事件匹配注入全书数据）
                  //   确保点击《纳瓦尔宝典》直接看到 insights/行动/改变量（与 AnnualPlan 书架面板完全同构）
                  const fallback = { t: p.title || '', author: p.author || '', pct: Number(p.progress) || 0 };
                  setModal({
                    type: 'book',
                    initial: p.initial || fallback,
                    tab: p.tab || 'basic',
                  });
                  break;
                }
                case 'milestone': {
                  // 能力：里程碑 MilestoneForm（原生面板，initial 结构={lb, st, pct, dueBy, id}）
                  //   旧版兼容：若仅传 title/dueDate，转为 initial 结构
                  const fallback = {
                    lb: p.title || '', pct: 0,
                    dueBy: p.dueDate?.replace(/^截止 /, '').replace('/', '-'),
                    st: 'doing',
                  };
                  setModal({ type: 'milestone', initial: p.initial || fallback });
                  break;
                }
                case 'kr': {
                  // 工作：KR 关键结果 KrForm（原生面板，initial={t, v, tgt, u, st, id}）
                  //   旧版兼容：仅传 title/progress → initial.t/v 自动填入
                  const fallback = {
                    t: p.title || '',
                    v: Number(p.progress) || 0, tgt: 100, u: '%', st: 'doing',
                  };
                  setModal({ type: 'kr', initial: p.initial || fallback });
                  break;
                }
                case 'ability': {
                  setModal({ type: 'ability', initial: p.initial || { title: p.title || '' } });
                  break;
                }
                case 'task':
                case 'schedule':
                default: {
                  // 精力/生活/兜底：计划与总结同款 ScheduleForm
                  const initial = (p && typeof p === 'object' && !Array.isArray(p))
                    ? { ...(p || {}) }
                    : undefined;
                  if (initial && !initial.schedule_date) {
                    initial.schedule_date = ctx?.date || selectedDate;
                  }
                  setModal({ type: 'schedule', data: initial });
                }
              }
            }}
            onJumpToAnnualView={(viewKey) => {
              // 主线卡片：点击"习惯同步·作息 / 书架同步 / 能力项·XX / 工作目标 / 生活记录"
              // 等 srcTag 关联/同步标签 → 关闭所有 modal & 跳转年度规划对应模块页
              setModal(null);
              setAnnualView(viewKey);
              setActiveMenu('annual');
            }}
          />
        </div>
      ) : (
        <main className="flex-1 min-w-0 max-w-[1180px] flex flex-col gap-4">
          {/* 顶部日历条（含 今日/本周/本月 视图切换） */}
          <WeekCalendar
            selectedDate={selectedDate}
            onSelectDate={handleSelectDate}
            refreshSignal={refreshKey}
            view={view}
            onViewChange={handleViewChange}
          />

          {/* 主体：左右分栏（默认 38% + 62%，可拖拽调整并记忆） */}
          <div {...bindRoot} className="flex items-stretch">
            {/* 左栏：重点事项 + 习惯 */}
            <div className="flex flex-col gap-4 min-w-0" style={leftStyle}>
              <KeyTasks
                date={selectedDate}
                view={view}
                range={range}
                refreshSignal={refreshKey}
                onEdit={(sch) => setModal({ type: 'schedule', data: sch })}
                onNew={(info) => setModal({ type: 'schedule', data: info ? (typeof info === 'object' ? info : { category: info }) : undefined })}
                onChange={refresh}
              />
              <HabitsPanel
                date={selectedDate}
                refreshSignal={refreshKey}
                onChange={refresh}
              />
            </div>

            <SplitDivider bindDivider={bindDivider} />

            {/* 右栏：时间轴 / 总结面板 */}
            <div className="flex-1 min-w-0" style={rightStyle}>
              {showSummary ? (
                <div className="glass-card p-4 h-full flex flex-col">
                  <Suspense fallback={<ChunkFallback />}>
                    <SummaryPanel
                      embed
                      userId={user?.id}
                      date={selectedDate}
                      refreshSignal={refreshKey}
                      onChange={refresh}
                      onBack={() => setShowSummary(false)}
                    />
                  </Suspense>
                </div>
              ) : (
                <Timeline
                  date={selectedDate}
                  view={view}
                  range={range}
                  refreshSignal={refreshKey}
                  onEdit={(sch) => setModal({ type: 'schedule', data: sch })}
                  onAdd={(info) => setModal({ type: 'schedule', data: { start_time: info.start_time } })}
                  onManageFixedSchedules={() => setModal({ type: 'fixedSchedules' })}
                  onChange={refresh}
                  onSummaryToggle={() => setShowSummary(v => !v)}
                  showSummary={showSummary}
                />
              )}
            </div>
          </div>
        </main>
      )}
      </Suspense>

      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        maxWidth={modal?.type === 'book' ? 640 : undefined}
        title={
          !modal ? '新建'
          : modal.type === 'summary' ? '每日总结'
          : modal.type === 'book' ? ((modal.initial?.t ? `《${modal.initial.t}》· 编辑书籍` : '新增书籍'))
          : modal.type === 'kr' ? (modal.initial?.id ? '编辑 KR' : '新增 KR')
          : modal.type === 'milestone' ? (modal.initial?.id ? '编辑里程碑' : '新增里程碑')
          : modal.type === 'ability' ? (modal.initial?.id ? '编辑能力目标' : '新增能力目标')
          : modal.type === 'schedule' ? (modal.data?.id ? '编辑事项' : '新建事项')
          : modal.type === 'habit' ? (modal.data?.id ? '编辑习惯' : '新建习惯')
          : modal.type === 'fixedSchedules' ? '固定日程管理'
          : modal.type === 'fixedSchedule' ? (modal.data?.id ? '编辑固定日程' : '新建固定日程')
          : (modal.data?.id ? '编辑待办' : '新建待办')
        }
      >
        <Suspense fallback={<ChunkFallback />}>
        {modal?.type === 'schedule' && (
          <ScheduleForm
            initial={modal?.data}
            defaultDate={selectedDate}
            onSaved={() => { setModal(null); refresh(); }}
            onCancel={() => setModal(null)}
          />
        )}
        {/* ===== 需求 4：知力卡片点击《纳瓦尔宝典》→ 复用 AnnualPlan 书架同款 BookForm 面板 ===== */}
        {modal?.type === 'book' && (
          <BookForm
            initial={modal?.initial}
            initialTab={modal?.tab || 'basic'}
            onSaved={() => { setModal(null); refresh(); store?.broadcast?.({ type: 'reload' }); }}
            onCancel={() => setModal(null)}
            onDelete={() => { setModal(null); refresh(); store?.broadcast?.({ type: 'reload' }); }}
          />
        )}
        {modal?.type === 'kr' && (
          <KrForm
            initial={modal?.initial}
            onSaved={() => { setModal(null); refresh(); store?.broadcast?.({ type: 'reload' }); }}
            onCancel={() => setModal(null)}
            onDelete={() => { setModal(null); refresh(); }}
          />
        )}
        {modal?.type === 'milestone' && (
          <MilestoneForm
            initial={modal?.initial}
            onSaved={() => { setModal(null); refresh(); store?.broadcast?.({ type: 'reload' }); }}
            onCancel={() => setModal(null)}
            onDelete={() => { setModal(null); refresh(); }}
          />
        )}
        {modal?.type === 'ability' && (
          <AbilityForm
            initial={modal?.initial}
            onSaved={() => { setModal(null); refresh(); store?.broadcast?.({ type: 'reload' }); }}
            onCancel={() => setModal(null)}
            onDelete={() => { setModal(null); refresh(); }}
          />
        )}
        {modal?.type === 'task' && (
          <TaskForm
            initial={modal?.data}
            defaultDate={selectedDate}
            onSaved={() => { setModal(null); refresh(); }}
            onCancel={() => setModal(null)}
          />
        )}
        {(modal?.type === 'habit') && (
          <HabitForm
            initial={modal?.data}
            onSaved={() => { setModal(null); refresh(); }}
            onCancel={() => setModal(null)}
          />
        )}
        {modal?.type === 'fixedSchedules' && (
          <FixedSchedulesPanel
            onEdit={(data) => setModal({ type: 'fixedSchedule', data })}
          />
        )}
        {modal?.type === 'fixedSchedule' && (
          <FixedScheduleForm
            initial={modal?.data}
            onSaved={() => { setModal({ type: 'fixedSchedules' }); refresh(); }}
            onCancel={() => setModal({ type: 'fixedSchedules' })}
          />
        )}

        {modal?.type === 'summary' && (
          <SummaryPanel
            userId={user?.id}
            date={selectedDate}
            onClose={() => setModal(null)}
          />
        )}
        </Suspense>
      </Modal>

      {/* ===== 右键上下文菜单 ===== */}
      {ctxMenu && (
        <div
          ref={ctxRef}
          style={{
            position: 'fixed',
            left: ctxMenu.x,
            top: ctxMenu.y,
            zIndex: 10000,
            background: '#fff',
            borderRadius: '10px',
            padding: '6px',
            minWidth: '140px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08)',
            border: '1px solid rgba(0,0,0,0.06)'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            style={{
              padding: '8px 12px',
              fontSize: '13px',
              color: '#1c1c1e',
              cursor: 'pointer',
              borderRadius: '6px'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(var(--s-rgb),0.08)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            onClick={() => handleCtxAction('edit')}
          >✏️ 编辑</div>
          <div style={{ height: '1px', background: '#e5e5ea', margin: '4px 2px' }}></div>
          <div
            style={{
              padding: '8px 12px',
              fontSize: '13px',
              color: '#FF3B30',
              cursor: 'pointer',
              borderRadius: '6px'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,59,48,0.08)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            onClick={() => handleCtxAction('delete')}
          >{ctxMenu.type === 'habit' ? '📁 归档' : '🗑️ 删除'}</div>
        </div>
      )}

      {/* ===== 二次确认弹窗 ===== */}
      {confirm && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 10003
        }} onClick={confirm.onCancel}>
          <div
            style={{
              background: '#fff', borderRadius: '14px', width: '340px', maxWidth: '90vw',
              padding: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ textAlign: 'center', marginBottom: '12px' }}>
              <div style={{ fontSize: '32px' }}>⚠️</div>
            </div>
            <div style={{ fontSize: '17px', fontWeight: '600', color: '#1c1c1e', textAlign: 'center', marginBottom: '6px' }}>
              {confirm.title}
            </div>
            <div style={{ fontSize: '13px', color: '#8e8e93', textAlign: 'center', marginBottom: '20px', lineHeight: '1.5' }}>
              {confirm.msg}
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                style={{
                  flex: 1, padding: '10px 12px', borderRadius: '10px',
                  background: 'rgba(120,120,128,0.12)',
                  color: '#1c1c1e', border: 'none', fontWeight: '600',
                  fontSize: '14px', cursor: 'pointer'
                }}
                onClick={confirm.onCancel}
              >取消</button>
              <button
                style={{
                  flex: 1, padding: '10px 12px', borderRadius: '10px',
                  background: confirm.okColor || '#FF3B30',
                  color: '#fff', border: 'none', fontWeight: '600',
                  fontSize: '14px', cursor: 'pointer'
                }}
                onClick={confirm.onOk}
              >{confirm.okText || '确定'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== 归档面板 ===== */}
      {archiveOpen && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 10001
        }} onClick={() => setArchiveOpen(false)}>
          <div
            style={{
              background: '#fff', borderRadius: '16px', width: '520px', maxWidth: '92vw',
              maxHeight: '80vh', overflow: 'hidden',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              padding: '18px 20px', borderBottom: '1px solid #e5e5ea',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1c1c1e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                </svg>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#1c1c1e' }}>
                  习惯归档
                </h3>
              </div>
              <button
                onClick={() => setArchiveOpen(false)}
                style={{
                  width: '28px', height: '28px', borderRadius: '50%', border: 'none',
                  background: 'rgba(120,120,128,0.12)', cursor: 'pointer',
                  color: '#8e8e93', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.15s'
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            <div style={{ padding: '14px 16px', overflowY: 'auto', flex: 1 }}>
              {archivedHabits.length === 0 ? (
                <div style={{ 
                  textAlign: 'center', 
                  padding: '48px 20px', 
                  color: '#8e8e93', 
                  fontSize: '13px',
                  background: '#f5f5f7',
                  borderRadius: '10px'
                }}>
                  <div style={{ fontSize: '32px', marginBottom: '8px' }}>📭</div>
                  暂无归档的习惯
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {archivedHabits.map(h => (
                    <div
                      key={h.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        padding: '10px 12px', borderRadius: '10px',
                        background: '#f5f5f7'
                      }}
                    >
                      <div style={{ fontSize: '20px' }}>{h.emoji || '✅'}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '14px', fontWeight: '500', color: '#1c1c1e' }}>{h.name}</div>
                        <div style={{ fontSize: '11px', color: '#8e8e93', marginTop: '2px' }}>
                          {h.target_time ? `${h.target_time} · ` : ''}
                          {h.duration_min ? `${h.duration_min}m` : '全天'}
                        </div>
                      </div>
                      <button
                        onClick={() => restoreHabit(h.id)}
                        style={{
                          padding: '6px 12px', borderRadius: '8px', border: 'none',
                          background: '#e5f6ea', color: '#34C759',
                          fontSize: '12px', fontWeight: '600', cursor: 'pointer',
                          transition: 'all 0.15s'
                        }}
                      >恢复</button>
                      <button
                        onClick={() => deleteHabit(h.id, h.name)}
                        style={{
                          padding: '6px 12px', borderRadius: '8px', border: 'none',
                          background: '#FFEEED', color: '#FF3B30',
                          fontSize: '12px', fontWeight: '600', cursor: 'pointer',
                          transition: 'all 0.15s'
                        }}
                      >删除</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== 设置面板 ===== */}
      <Suspense fallback={null}>
        <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} user={user} />
      </Suspense>

      {/* ===== 快速捕获弹窗（快捷键 N / 侧边栏收集箱「＋」）===== */}
      <Modal open={quickCaptureOpen} onClose={() => setQuickCaptureOpen(false)} title="快速记录到收集箱">
        <Suspense fallback={<ChunkFallback />}>
          <QuickCapture onSaved={loadInboxCount} onDispatch={openDispatchFor} />
        </Suspense>
      </Modal>

      {/* ===== 快速捕获「分派」：复用 ScheduleForm（支持时长/重要性/重复） ===== */}
      <Modal open={!!dispatchDetail} onClose={() => setDispatchDetail(null)} title="详细分派 · 新建日程">
        <Suspense fallback={<ChunkFallback />}>
          {dispatchDetail && (
            <ScheduleForm
              initial={dispatchDetail.initial}
              defaultDate={dispatchDetail.initial.date}
              onSaved={onDispatchSaved}
              onCancel={() => setDispatchDetail(null)}
            />
          )}
        </Suspense>
      </Modal>
    </div>
    </WorkspaceActionsProvider>
  );
}
