import { useState, useEffect, useRef, Fragment } from 'react';
import { formatChineseDate, formatGreeting } from '../utils/date.js';
import { API } from '../api/client.js';
import { syncCloudNow, syncKey, cloudPush } from '../utils/cloudKV.js';
import { trySubmitTopForm } from '../utils/formSubmitBus.js';
import { useToast } from '../context/ToastContext.jsx';
import AvatarCropModal from './AvatarCropModal.jsx';
import { CategoryIcon } from './annual/ui.jsx';

const ICONS = {
  plan:    (<svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3.4" cy="6" r="1.3" fill="currentColor" stroke="none"/><circle cx="3.4" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="3.4" cy="18" r="1.3" fill="currentColor" stroke="none"/></svg>),
  calendar:(<svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>),
  annual:  (<svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/></svg>),
  inbox:   (<svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>),
  recycle: (<svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>),
  settings:(<svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"></path></svg>),
  bell:    (<svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 01-3.46 0"></path></svg>),
  msg:     (<svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"></path></svg>),
  sync:    (<svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"></path></svg>),
  check:   (<svg fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>),
  search:  (<svg fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>),
};

const NAV_MAIN = [
  { key: 'plan',     label: '计划总结' },
  { key: 'inbox',    label: '收集箱' },
  { key: 'calendar', label: '日历' },
  { key: 'annual',   label: '发展规划' }
];
const NAV_OTHER = [
  { key: 'recycle',  label: '回收站' },
  { key: 'settings', label: '设置' }
];

/* 发展规划 · 二级导航（原页面顶部 Tab 整合进侧边栏：图标+文字+加号）
   color/rgb 跟随五大模块主题色 CSS 变量；overview 为中性灰 */
const ANNUAL_SUB = [
  { key: 'overview',  label: '概览', color: null },
  { key: 'energy',    label: '精力', color: 'var(--m-energy)',    rgb: 'var(--m-energy-rgb)',    add: '习惯' },
  { key: 'cognition', label: '知力', color: 'var(--m-cognition)', rgb: 'var(--m-cognition-rgb)', add: '书籍' },
  { key: 'ability',   label: '能力', color: 'var(--m-ability)',   rgb: 'var(--m-ability-rgb)',   add: '能力' },
  { key: 'work',      label: '工作', color: 'var(--m-work)',      rgb: 'var(--m-work-rgb)',      add: '目标' },
  { key: 'finance',   label: '财务', color: 'var(--m-finance)',   rgb: 'var(--m-finance-rgb)',   add: '账目' },
  { key: 'life',      label: '生活', color: 'var(--m-life)',      rgb: 'var(--m-life-rgb)',      add: '记录' },
];

/* 侧边栏导航标题（右键编辑改文字）· localStorage 持久化，按用户隔离
 * 云端镜像 key：sidebar_nav_labels（user_settings 已按用户隔离，只存当前用户的标题 map）*/
const NAV_LABELS_LS = 'sidebar_nav_labels_v1';
const NAV_LABELS_CLOUD = 'sidebar_nav_labels';
function navLabelsUid(user) {
  return user?.id != null ? String(user.id) : 'anon';
}
function loadNavLabels(user) {
  try {
    const raw = localStorage.getItem(NAV_LABELS_LS);
    const obj = raw ? JSON.parse(raw) : null;
    if (!obj) return {};
    return obj[navLabelsUid(user)] || {};
  } catch { return {}; }
}
function saveNavLabel(user, key, label) {
  try {
    const raw = localStorage.getItem(NAV_LABELS_LS);
    const obj = raw ? JSON.parse(raw) : {};
    const uid = navLabelsUid(user);
    if (!obj[uid]) obj[uid] = {};
    if (label) obj[uid][key] = label; else delete obj[uid][key];
    localStorage.setItem(NAV_LABELS_LS, JSON.stringify(obj));
    cloudPush(NAV_LABELS_CLOUD, JSON.stringify(obj[uid] || {}));
  } catch { /* ignore */ }
}

export default function Sidebar({ user, onLogout, onSettingsClick, activeMenu = 'plan', onMenuChange, onBeforeLogout, onSync, syncSignal = 0, onUserUpdate, annualView = 'overview', onAnnualView, onAnnualAdd, inboxCount = 0, onQuickCapture }) {
  const toast = useToast();
  const [navLabels, setNavLabels] = useState(() => loadNavLabels(user));
  // 发展规划二级导航展开/收起态：纯持久化（与收集箱 inbox_layout 同模式）
  // —— 只在「已处于发展规划页时再次点击主菜单」切换；切换到其他页面、重新登录都保持当前状态
  const ANNUAL_SUB_LS = 'annual_sub_collapsed';
  const [annualSubManuallyClosed, setAnnualSubManuallyClosed] = useState(() => {
    try { return localStorage.getItem(ANNUAL_SUB_LS) === '1'; } catch { return false; }
  });
  const toggleAnnualSub = (closed) => {
    setAnnualSubManuallyClosed(closed);
    try { localStorage.setItem(ANNUAL_SUB_LS, closed ? '1' : '0'); } catch { /* ignore */ }
  };
  // 导航标题云端同步：云端较新则覆盖本地（换浏览器/清缓存后自动恢复自定义标题）
  useEffect(() => {
    const uid = navLabelsUid(user);
    syncKey(NAV_LABELS_CLOUD, JSON.stringify(loadNavLabels(user)), (cloudStr) => {
      try {
        const parsed = JSON.parse(cloudStr);
        const raw = localStorage.getItem(NAV_LABELS_LS);
        const obj = raw ? JSON.parse(raw) : {};
        obj[uid] = parsed || {};
        localStorage.setItem(NAV_LABELS_LS, JSON.stringify(obj));
        setNavLabels(parsed || {});
      } catch {}
    });
  }, [user?.id]);
  const labelOf = (item) => navLabels[item.key] || item.label;
  // 右键导航项 → 行内编辑标题（Enter 保存 / Esc 取消 / 失焦保存；空值回退默认）
  const [editingNav, setEditingNav] = useState(null); // { key }
  const handleNavContextMenu = (e, item) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingNav({ key: item.key });
  };
  const commitNavLabel = (item, value) => {
    const v = String(value || '').trim();
    const custom = v && v !== item.label ? v : '';
    setNavLabels(prev => {
      const next = { ...prev };
      if (custom) next[item.key] = custom; else delete next[item.key];
      return next;
    });
    saveNavLabel(user, item.key, custom);
    setEditingNav(null);
  };
  // 头像可能是图片 URL 或裁剪上传的 Base64 data URL，两者都按图片渲染
  const isImageAvatar = user?.avatar && /^(https?:|data:image\/)/i.test(user.avatar);
  const avatar = isImageAvatar
    ? user.avatar
    : (user?.avatar || user?.username?.[0] || 'U').toUpperCase();
  const now = new Date();
  const [syncState, setSyncState] = useState('synced'); // syncing | synced | error
  const [syncMsg, setSyncMsg] = useState('');
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const lastSignalRef = useRef(0);
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [showAvatarMenu, setShowAvatarMenu] = useState(false);
  const [cropFile, setCropFile] = useState(null); // 选中待裁剪的原文件

  function handleAvatarChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    if (!file.type.startsWith('image/')) { toast.error('请选择图片文件'); return; }
    if (file.size > 8 * 1024 * 1024) { toast.error('图片不能超过 8MB'); return; }
    setCropFile(file);
    setShowAvatarMenu(false);
  }

  async function handleCropConfirm(blob) {
    setCropFile(null);
    setUploading(true);
    try {
      // 包装裁剪好的 Blob 为 File（带文件名），便于上传 API 使用
      const croppedFile = new File([blob], 'avatar.png', { type: 'image/png' });
      const r = await API.auth.uploadAvatar(croppedFile);
      toast.success('头像更新成功');
      onUserUpdate?.({ ...user, avatar: r.avatar });
    } catch (err) {
      toast.error(err.message || '上传失败');
    } finally {
      setUploading(false);
    }
  }

  function handleResetAvatar() {
    setShowAvatarMenu(false);
    const defaultAvatar = (user?.username?.[0] || 'U').toUpperCase();
    API.auth.updateMe({ avatar: defaultAvatar })
      .then(() => {
        onUserUpdate?.({ ...user, avatar: defaultAvatar });
        toast.success('已恢复默认头像');
      })
      .catch(err => toast.error(err.message || '操作失败'));
  }

  // 格式化"最近同步"时间（相对时间）
  function formatLastSync(ts) {
    if (!ts) return '从未同步';
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 5) return '刚刚同步';
    if (diff < 60) return `${diff}s 前同步`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m 前同步`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h 前同步`;
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')} 同步`;
  }

  // 监听自动同步信号
  useEffect(() => {
    if (syncSignal === 0 || syncSignal === lastSignalRef.current) return;
    lastSignalRef.current = syncSignal;
    setSyncState('syncing');
    setSyncMsg('自动同步中...');
    const t = setTimeout(() => {
      setSyncState('synced');
      setSyncMsg('已自动同步');
      setLastSyncTime(Date.now());
      setTimeout(() => setSyncMsg(''), 1600);
    }, 500);
    return () => clearTimeout(t);
  }, [syncSignal]);

  // 云端 KV 同步状态（年度规划/主题/日程分类）：cloudKV 推送与拉取事件驱动同一指示器
  useEffect(() => {
    const onCloud = (e) => {
      const { status } = e.detail || {};
      if (status === 'syncing') {
        setSyncState('syncing');
        setSyncMsg('云端同步中...');
      } else if (status === 'synced') {
        setSyncState('synced');
        setSyncMsg('已保存到云端');
        setLastSyncTime(Date.now());
        setTimeout(() => setSyncMsg(''), 1600);
      } else if (status === 'pulled') {
        setSyncState('synced');
        setSyncMsg('已从云端更新');
        setLastSyncTime(Date.now());
        setTimeout(() => setSyncMsg(''), 1600);
      } else if (status === 'error') {
        setSyncState('error');
        setSyncMsg('云端同步失败，稍后自动重试');
        setTimeout(() => setSyncMsg(''), 2600);
      }
    };
    window.addEventListener('cloudkv', onCloud);
    return () => window.removeEventListener('cloudkv', onCloud);
  }, []);

  function handleLogoutClick() {
    if (onBeforeLogout) {
      onBeforeLogout();
    } else if (confirm('确定要退出登录吗？')) {
      onLogout?.();
    }
  }

  async function handleSync() {
    if (syncState === 'syncing') return;
    setSyncState('syncing');
    setSyncMsg('正在同步...');
    try {
      if (onSync) await onSync();           // API 数据刷新（日程/习惯/总结等）
      await syncCloudNow();                 // 云端KV：冲刷待推送 + 拉云端更新（年度规划/主题/分类）
      setSyncState('synced');
      setSyncMsg('已同步');
      setLastSyncTime(Date.now());
      setTimeout(() => setSyncMsg(''), 1600);
    } catch (e) {
      setSyncState('error');
      setSyncMsg('同步失败：' + (e.message || '未知错误'));
      setTimeout(() => setSyncMsg(''), 2600);
    }
  }

  // Ctrl+S / Cmd+S：有表单打开时优先提交表单（等同点击表单“保存”按钮，
  // 校验通过即保存并走各自同步管线）；无表单时才执行全局同步（跳过防抖）
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === 's') {
        e.preventDefault(); // 阻止浏览器“保存网页”对话框
        const formSubmitted = trySubmitTopForm();
        if (!formSubmitted) handleSync();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <>
    <aside className="sidebar-b">
      {/* 用户 + 日期问候 + 搜索 */}
      <div className="sb-user-card">
        <div className="sb-user-row">
          <div
            className="sb-avatar"
            style={{ cursor: 'pointer', position: 'relative', overflow: 'visible' }}
            onClick={() => setShowAvatarMenu(v => !v)}
            title="点击更换头像"
          >
            {isImageAvatar ? (
              <img
                src={avatar}
                alt="头像"
                style={{
                  width: '100%', height: '100%', borderRadius: '50%',
                  objectFit: 'cover', display: 'block'
                }}
                referrerPolicy="no-referrer"
              />
            ) : avatar}
            {uploading && (
              <div style={{
                position: 'absolute', inset: 0, borderRadius: '50%',
                background: 'rgba(0,0,0,0.5)', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: '12px', fontWeight: '600'
              }}>上传中</div>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleAvatarChange}
          />
          {showAvatarMenu && (
            <div style={{
              position: 'absolute', left: '0', top: '52px',
              background: '#fff', borderRadius: '12px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
              padding: '6px', minWidth: '140px', zIndex: 200,
              border: '1px solid rgba(0,0,0,0.06)'
            }} onClick={e => e.stopPropagation()}>
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  padding: '9px 12px', borderRadius: '8px', cursor: 'pointer',
                  fontSize: '13px', color: '#1c1c1e', fontWeight: '500',
                  display: 'flex', alignItems: 'center', gap: '8px',
                  transition: 'background .15s'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(120,120,128,0.1)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                上传新头像
              </div>
              {isImageAvatar && (
                <div
                  onClick={handleResetAvatar}
                  style={{
                    padding: '9px 12px', borderRadius: '8px', cursor: 'pointer',
                    fontSize: '13px', color: '#FF3B30', fontWeight: '500',
                    display: 'flex', alignItems: 'center', gap: '8px',
                    transition: 'background .15s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,59,48,0.1)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 105.64-11.36L1 10"></path></svg>
                  恢复默认
                </div>
              )}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="sb-date truncate">{formatChineseDate(now)}</div>
            <div className="sb-greet truncate">
              <span>{formatGreeting(now)}</span>
              <span style={{ marginLeft: '4px' }}>
                {now.getHours() < 11 ? '☕️' : now.getHours() < 14 ? '🌞' : now.getHours() < 18 ? '✨' : '🌙'}
              </span>
            </div>
          </div>
        </div>
        <div className="sb-iconrow">
          <div className="sb-search">
            {ICONS.search}
            <input type="text" placeholder="搜索..." />
          </div>
        </div>
      </div>

      {/* 导航卡片 */}
      <div className="sb-nav-card">
        <div className="sb-nav-scroll">
          {NAV_MAIN.map(item => (
            <Fragment key={item.key}>
              <div
                className={`sb-nav-item ${activeMenu === item.key ? 'active' : ''}`}
                style={{ cursor: 'pointer' }}
                onClick={() => {
                  // 发展规划：已处于该页时再次点击主菜单 → 切换二级导航展开/收起（持久化）；
                  // 从其他页面点入只做导航，不改动展开/收起状态
                  if (item.key === 'annual' && activeMenu === 'annual') {
                    toggleAnnualSub(!annualSubManuallyClosed);
                  }
                  onMenuChange?.(item.key);
                }}
                onContextMenu={(e) => handleNavContextMenu(e, item)}
                title="右键可修改标题文字"
              >
                <span style={{ flexShrink: 0 }}>{ICONS[item.key]}</span>
                {editingNav?.key === item.key ? (
                  <input
                    autoFocus
                    defaultValue={labelOf(item)}
                    className="flex-1 min-w-0 bg-transparent outline-none border-b border-[rgba(120,120,128,0.4)] text-sm py-0"
                    onClick={(e) => e.stopPropagation()}
                    onBlur={(e) => commitNavLabel(item, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitNavLabel(item, e.currentTarget.value);
                      if (e.key === 'Escape') setEditingNav(null);
                    }}
                  />
                ) : (
                  <span className="flex-1 min-w-0 truncate">{labelOf(item)}</span>
                )}
                {/* 收集箱：待分派数量徽标 + 快速捕获加号（默认浅灰中性色；激活时跟随主题蓝，与导航行同源） */}
                {item.key === 'inbox' && inboxCount > 0 && (
                  <span
                    className="flex-shrink-0 inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full text-[12px] font-semibold tabular-nums"
                    style={activeMenu === 'inbox'
                      ? { background: 'rgba(var(--s-rgb),0.16)', color: 'var(--s-main)' }
                      : { background: 'rgba(120,120,128,0.10)', color: 'var(--ink-500, #8e8e93)' }}
                  >{inboxCount}</span>
                )}
                {item.key === 'inbox' && (
                  <button
                    type="button"
                    aria-label="快速记一条"
                    title="快速记一条（快捷键 N）"
                    className="flex-shrink-0 w-5 h-5 rounded-[5px] flex items-center justify-center transition-colors"
                    style={activeMenu === 'inbox'
                      ? { background: 'rgba(var(--s-rgb),0.12)', color: 'var(--s-main)' }
                      : { background: 'rgba(120,120,128,0.08)', color: 'var(--ink-500, #8e8e93)' }}
                    onClick={(e) => { e.stopPropagation(); onQuickCapture?.(); }}
                  >
                    <svg fill="none" stroke="currentColor" strokeWidth="2.4" viewBox="0 0 24 24" strokeLinecap="round" width="10" height="10"><path d="M12 5v14M5 12h14"/></svg>
                  </button>
                )}
              </div>
              {/* 发展规划 · 二级导航：展开/收起纯跟随持久化状态，切到其他页面仍保持（年度概览/精力/知力/能力/工作/生活） */}
              {item.key === 'annual' && (
                <div className="sb-annual-subwrap" style={{ display: !annualSubManuallyClosed ? 'block' : 'none' }}>
                  {ANNUAL_SUB.map(sub => {
                    const on = activeMenu === 'annual' && (annualView || 'overview') === sub.key;
                    return (
                      <div
                        key={sub.key}
                        className={`sb-annual-sub ${on ? 'on' : ''}`}
                        style={on ? (sub.rgb
                          ? { background: `rgba(${sub.rgb},0.1)`, color: sub.color }
                          : { background: 'rgba(var(--s-rgb),0.1)', color: 'var(--s-main)' })
                          : undefined}
                        onClick={() => {
                          onMenuChange?.('annual');
                          onAnnualView?.(sub.key);
                        }}
                      >
                        <span className="sb-annual-sub-ic" style={{ color: on ? (sub.color || 'var(--s-main)') : undefined }}>
                          <CategoryIcon catKey={sub.key} />
                        </span>
                        <span className="flex-1 min-w-0 truncate">{sub.label}</span>
                        {sub.add && (
                          <button
                            type="button"
                            className={`sb-annual-sub-add ${on ? 'on' : ''}`}
                            aria-label={`添加${sub.add}`}
                            title={`添加${sub.add}`}
                            style={on ? { color: sub.color } : undefined}
                            onClick={(e) => {
                              e.stopPropagation();
                              onAnnualAdd?.(sub.key);
                            }}
                          >
                            <svg fill="none" stroke="currentColor" strokeWidth="2.4" viewBox="0 0 24 24" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Fragment>
          ))}

          <div className="sb-divider"></div>

          {NAV_OTHER.map(item => (
            <div
              key={item.key}
              className={`sb-nav-item ${activeMenu === item.key ? 'active' : ''}`}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', cursor: 'pointer' }}
              onClick={() => { if (item.key === 'settings') onSettingsClick?.(); else onMenuChange?.(item.key); }}
              onContextMenu={(e) => handleNavContextMenu(e, item)}
              title="右键可修改标题文字"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                <span style={{ flexShrink: 0 }}>{ICONS[item.key]}</span>
                {editingNav?.key === item.key ? (
                  <input
                    autoFocus
                    defaultValue={labelOf(item)}
                    className="flex-1 min-w-0 bg-transparent outline-none border-b border-[rgba(120,120,128,0.4)] text-sm py-0"
                    onClick={(e) => e.stopPropagation()}
                    onBlur={(e) => commitNavLabel(item, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitNavLabel(item, e.currentTarget.value);
                      if (e.key === 'Escape') setEditingNav(null);
                    }}
                  />
                ) : (
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{labelOf(item)}</span>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="hairline mx-2 my-3"></div>

        {/* 状态工具栏 */}
        <div className="sb-status-bar">
          <button className="sb-status-btn" title="通知">
            {ICONS.bell}
            <span className="sb-status-dot"></span>
          </button>
          <button className="sb-status-btn" title="消息">
            {ICONS.msg}
          </button>
          <button
            className={`sb-status-btn sync-icon-btn ${syncState}`}
            title={
              syncState === 'syncing'
                ? `正在同步数据...（上次：${formatLastSync(lastSyncTime)}）`
                : syncState === 'error'
                  ? `同步失败，点击重试（上次：${formatLastSync(lastSyncTime)}）`
                  : `最近同步：${formatLastSync(lastSyncTime)} · 点击手动刷新`
            }
            onClick={handleSync}
          >
            {syncState === 'synced' ? (
              ICONS.sync
            ) : syncState === 'error' ? (
              <svg fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
            ) : (
              <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ animation: 'spin 0.9s linear infinite' }}>
                <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
              </svg>
            )}
          </button>
          <div style={{ width: '1px', height: '20px', background: 'rgba(60,60,67,0.15)', margin: '0 4px' }}></div>
          <button 
            className="sb-status-btn" 
            title="退出登录"
            onClick={handleLogoutClick}
            style={{ color: '#FF3B30' }}
          >
            <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
          </button>
        </div>
      </div>
    </aside>

    <AvatarCropModal
      open={!!cropFile}
      file={cropFile}
      onClose={() => setCropFile(null)}
      onConfirm={handleCropConfirm}
    />
    </>
  );
}
