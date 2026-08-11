import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { today as getToday, toISODate, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addDaysISO, calcDurationMin } from '../utils/date.js';
import Sidebar from '../components/Sidebar.jsx';
import WeekCalendar from '../components/WeekCalendar.jsx';
import StatsBar from '../components/StatsBar.jsx';
import KeyTasks from '../components/KeyTasks.jsx';
import HabitsPanel from '../components/HabitsPanel.jsx';
import Timeline from '../components/Timeline.jsx';
import Modal from '../components/Modal.jsx';
import ScheduleForm from '../components/forms/ScheduleForm.jsx';
import TaskForm from '../components/forms/TaskForm.jsx';
import HabitForm from '../components/forms/HabitForm.jsx';
import SummaryPanel from '../components/SummaryPanel.jsx';
import { API } from '../api/client.js';
import SettingsModal from '../components/SettingsModal.jsx';
import { store } from '../utils/store.js';

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
  const [selectedDate, setSelectedDate] = useState(getToday());
  const [view, setView] = useState('today');
  const [refreshKey, setRefreshKey] = useState(0);
  const [modal, setModal] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // 右栏显示总结面板状态：默认显示时间线
  const [showSummary, setShowSummary] = useState(false);

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

  // 挂载时把显示菜单/习惯弹窗方法暴露给子组件调用
  useEffect(() => {
    window.__showContextMenu = (x, y, type, id) => {
      ctxMenuShownAt.current = Date.now();
      setCtxMenu({ x, y, type, id });
    };
    window.__openHabitModal = (habit) => {
      setModal(habit ? { type: 'habit', data: habit } : { type: 'habit', data: null });
    };
    return () => { delete window.__showContextMenu; delete window.__openHabitModal; };
  }, []);

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

  // 提供给子组件调起"删除/归档确认弹窗"的方法
  useEffect(() => {
    window.__archiveHabitConfirm = (id, name) => {
      setConfirm({
        title: '归档该习惯？',
        msg: `「${name}」将移至"归档"，可以从归档恢复。`,
        okText: '归档',
        okColor: '#ff9500',
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
    };
    window.__deleteScheduleConfirm = (id, title) => {
      setConfirm({
        title: '确认删除',
        msg: `「${title}」删除后无法恢复，确定要删除吗？`,
        okText: '确定删除',
        okColor: '#ff3b30',
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
    };
    return () => { delete window.__archiveHabitConfirm; delete window.__deleteScheduleConfirm; };
  }, [refresh]);

  // 提供给 Sidebar 打开归档面板的方法
  useEffect(() => {
    window.__openArchive = () => setArchiveOpen(true);
    return () => { delete window.__openArchive; };
  }, []);

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
          const list = await API.schedules.list({ from: '2000-01-01', to: '2100-01-01' });
          const sch = list.schedules.find(s => s.id === id);
          if (sch) setModal({ type: 'schedule', data: sch });
        } catch (e) { toast.error(e.message); }
      } else if (type === 'habit') {
        // 习惯编辑：通过统一入口打开，与新建习惯共用同一弹窗
        try {
          const r = await API.habits.list();
          const h = r.habits.find(x => x.id === id);
          if (h) window.__openHabitModal && window.__openHabitModal(h);
        } catch (e) { toast.error(e.message); }
      }
    }

    if (action === 'delete') {
      if (type === 'schedule') {
        setConfirm({
          title: '确认删除',
          msg: '删除后无法恢复，确定要删除该日程吗？',
          okText: '确定删除',
          okColor: '#ff3b30',
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
      } else if (type === 'habit') {
        setConfirm({
          title: '归档该习惯？',
          msg: '习惯将移至"归档"，可以从归档恢复。',
          okText: '归档',
          okColor: '#ff9500',
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
      okColor: '#34c759',
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
      okColor: '#ff3b30',
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
            okColor: '#ff3b30',
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
      />

      {/* 主内容区 */}
      <main className="flex-1 min-w-0 max-w-[1180px] flex flex-col gap-4">
        {/* 顶部日历条 */}
        <WeekCalendar
          selectedDate={selectedDate}
          onSelectDate={handleSelectDate}
          refreshSignal={refreshKey}
        />

        {/* Tab 栏 + 统计胶囊 */}
        <StatsBar
          date={selectedDate}
          range={range}
          view={view}
          refreshSignal={refreshKey}
          onViewChange={handleViewChange}
          onNew={(type) => setModal({ type: type || 'schedule' })}
          onSummaryToggle={() => setShowSummary(v => !v)}
          showSummary={showSummary}
        />

        {/* 主体：12 列网格（左 5 + 右 7） */}
        <div className="grid grid-cols-12 gap-4">
          {/* 左栏：重点事项 + 习惯 */}
          <div className="col-span-5 flex flex-col gap-4">
            <KeyTasks
              date={selectedDate}
              view={view}
              range={range}
              refreshSignal={refreshKey}
              onEdit={(sch) => setModal({ type: 'schedule', data: sch })}
              onNew={() => setModal({ type: 'schedule' })}
              onChange={refresh}
            />
            <HabitsPanel
              date={selectedDate}
              refreshSignal={refreshKey}
              onChange={refresh}
            />
          </div>

          {/* 右栏：时间轴 / 总结面板 */}
          <div className="col-span-7">
            {showSummary ? (
              <div className="glass-card p-5 h-full flex flex-col">
                <SummaryPanel
                  embed
                  userId={user?.id}
                  date={selectedDate}
                  refreshSignal={refreshKey}
                  onChange={refresh}
                  onBack={() => setShowSummary(false)}
                />
              </div>
            ) : (
              <Timeline
                date={selectedDate}
                view={view}
                range={range}
                refreshSignal={refreshKey}
                onEdit={(sch) => setModal({ type: 'schedule', data: sch })}
                onAdd={(info) => setModal({ type: 'schedule', data: { start_time: info.start_time } })}
                onChange={refresh}
              />
            )}
          </div>
        </div>
      </main>

      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={
          !modal ? '新建'
          : modal.type === 'summary' ? '每日总结'
          : modal.type === 'schedule' ? (modal.data?.id ? '编辑事项' : '新建事项')
          : modal.type === 'habit' ? (modal.data?.id ? '编辑习惯' : '新建习惯')
          : (modal.data?.id ? '编辑待办' : '新建待办')
        }
      >
        {modal?.type === 'schedule' && (
          <ScheduleForm
            initial={modal?.data}
            defaultDate={selectedDate}
            onSaved={() => { setModal(null); refresh(); }}
            onCancel={() => setModal(null)}
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

        {modal?.type === 'summary' && (
          <SummaryPanel
            userId={user?.id}
            date={selectedDate}
            onClose={() => setModal(null)}
          />
        )}
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
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0,122,255,0.08)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            onClick={() => handleCtxAction('edit')}
          >✏️ 编辑</div>
          <div style={{ height: '1px', background: '#e5e5ea', margin: '4px 2px' }}></div>
          <div
            style={{
              padding: '8px 12px',
              fontSize: '13px',
              color: '#ff3b30',
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
                  background: confirm.okColor || '#ff3b30',
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
                          {h.duration_min ? `${h.duration_min} 分钟` : '全天'}
                        </div>
                      </div>
                      <button
                        onClick={() => restoreHabit(h.id)}
                        style={{
                          padding: '6px 12px', borderRadius: '8px', border: 'none',
                          background: '#e5f6ea', color: '#34c759',
                          fontSize: '12px', fontWeight: '600', cursor: 'pointer',
                          transition: 'all 0.15s'
                        }}
                      >恢复</button>
                      <button
                        onClick={() => deleteHabit(h.id, h.name)}
                        style={{
                          padding: '6px 12px', borderRadius: '8px', border: 'none',
                          background: '#ffe8e8', color: '#ff3b30',
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
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} user={user} />
    </div>
  );
}
