import { useState, useEffect, useRef } from 'react';
import { formatChineseDate, formatGreeting } from '../utils/date.js';
import { API } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';
import AvatarCropModal from './AvatarCropModal.jsx';

const ICONS = {
  plan:    (<svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"></path><rect x="9" y="3" width="6" height="4" rx="1"></rect><path d="M9 12l2 2 4-4"></path></svg>),
  calendar:(<svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>),
  goal:    (<svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>),
  dashboard:(<svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>),
  diary:   (<svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>),
  habit:   (<svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"></path></svg>),
  project: (<svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 00-3-3.87"></path><path d="M16 3.13a4 4 0 010 7.75"></path></svg>),
  settings:(<svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"></path></svg>),
  bell:    (<svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 01-3.46 0"></path></svg>),
  msg:     (<svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"></path></svg>),
  sync:    (<svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"></path></svg>),
  check:   (<svg fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>),
  search:  (<svg fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>),
};

const NAV_MAIN = [
  { key: 'plan',     label: '计划总结' },
  { key: 'calendar', label: '日历' },
  { key: 'goal',     label: '目标' },
  { key: 'dashboard',label: '数据看板' },
  { key: 'diary',    label: '日记 / 复盘' }
];
const NAV_OTHER = [
  { key: 'habit',    label: '习惯追踪' },
  { key: 'project',  label: '项目管理' },
  { key: 'settings', label: '设置' }
];

export default function Sidebar({ user, onLogout, onSettingsClick, activeMenu = 'plan', onBeforeLogout, onSync, syncSignal = 0, onUserUpdate }) {
  const toast = useToast();
  const isImageAvatar = user?.avatar && /^https?:/.test(user.avatar);
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
    if (diff < 60) return `${diff} 秒前同步`;
    if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前同步`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前同步`;
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
    setSyncMsg('正在刷新数据...');
    try {
      if (onSync) await onSync();
      await new Promise(r => setTimeout(r, 400));
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

  return (
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
                    fontSize: '13px', color: '#ff3b30', fontWeight: '500',
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
          <div className="hairline mx-2 mb-3"></div>

          <div className="sb-label">主要功能</div>
          {NAV_MAIN.map(item => (
            <div
              key={item.key}
              className={`sb-nav-item ${activeMenu === item.key ? 'active' : ''}`}
            >
              {ICONS[item.key]}
              {item.label}
            </div>
          ))}

          <div className="sb-divider"></div>
          <div className="sb-label">其他</div>

          {NAV_OTHER.map(item => (
            <div
              key={item.key}
              className={`sb-nav-item ${activeMenu === item.key ? 'active' : ''}`}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', cursor: item.key === 'settings' ? 'pointer' : 'default' }}
              onClick={() => { if (item.key === 'settings') onSettingsClick?.(); }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                <span style={{ flexShrink: 0 }}>{ICONS[item.key]}</span>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
              </div>
              {item.key === 'habit' && (
                <button
                  title="打开习惯归档"
                  onClick={(e) => { e.stopPropagation(); window.__openArchive?.(); }}
                  className="sb-status-btn"
                  style={{ color: '#8e8e93', width: '26px', height: '26px' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,122,255,0.08)'; e.currentTarget.style.color = '#007aff'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#8e8e93'; }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                  </svg>
                </button>
              )}
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
              <svg fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
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
            style={{ color: '#ff3b30' }}
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
  );
}
