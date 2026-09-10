import { useState, useEffect } from 'react';
import { API } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { THEMES, getAllThemes, getThemeKey, applyTheme, addCustomTheme, updateCustomTheme, deleteCustomTheme, saveThemeOrder, isValidHex } from '../utils/theme.js';
import { MODULE_COLORS, getModuleColors, saveModuleColor, resetModuleColor, resetAllModuleColors, applyModuleColors, isValidHex as isValidModuleHex } from '../utils/moduleTheme.js';

const ADMIN_EMAIL = '1429000825@qq.com';

function friendlyError(msg) {
  if (!msg) return '操作失败，请重试';
  if (msg.includes('无权')) return msg;
  if (msg.includes('not found') || msg.includes('does not exist')) return '数据不存在，请先在 SQL Editor 执行初始化脚本';
  if (msg.includes('structure of query')) return '数据库函数需要更新，请执行 SQL 修复脚本';
  if (msg.includes('policy') && msg.includes('already exists')) return '';
  if (msg.length > 80) return '操作失败，请检查数据库配置';
  return msg;
}

export default function SettingsModal({ open, onClose, user: propUser }) {
  const toast = useToast();
  const { user: authUser } = useAuth();
  const user = propUser || authUser;
  const [tab, setTab] = useState('appearance');
  const [themeKey, setThemeKey] = useState(() => getThemeKey());
  const [invites, setInvites] = useState([]);
  const [users, setUsers] = useState([]);
  const [newCode, setNewCode] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [confirmBan, setConfirmBan] = useState(null);
  const [copied, setCopied] = useState(false);
  // D1 迁移
  const [migrate, setMigrate] = useState({
    habits: '', habit_logs: '', schedules: '', tasks: '', summaries: '', fixed_schedules: '',
  });
  const [migrateResult, setMigrateResult] = useState(null);
  const [migrateBusy, setMigrateBusy] = useState(false);

  // 严格判定：只有 is_owner=true（或硬编码 ADMIN_EMAIL 兜底）才允许看到 invites/users Tab
  //  ❌ 不再用 IS_D1_BACKEND 做兜底（之前所有用户都会被错误判为管理员/或被意外漏掉）
  const isAdmin = user?.is_owner === true || user?.is_owner === 1 || user?.email === ADMIN_EMAIL;

  useEffect(() => {
    if (open && isAdmin) {
      loadInvites();
      loadUsers();
    }
  }, [open, isAdmin]);

  async function loadInvites() {
    try {
      const r = await API.inviteCodes.list();
      setInvites(r.codes || []);
    } catch (e) { setErr(friendlyError(e.message)); }
  }

  async function loadUsers() {
    try {
      const r = await API.users.list();
      setUsers(r.users || []);
    } catch (e) { setErr(friendlyError(e.message)); }
  }

  async function handleCreateCode() {
    setErr('');
    try {
      setBusy(true);
      const r = await API.inviteCodes.create();
      const fresh = String(r.code || '');
      setNewCode(fresh);
      // 🔧 方案 A 收尾：生成后立刻自动复制到剪贴板 + toast，省用户再点一次"复制"
      if (fresh) {
        copyCode(fresh);
        toast.success(`邀请码已生成并复制：${fresh}`);
      }
      loadInvites();
    } catch (e) { setErr(friendlyError(e.message)); }
    finally { setBusy(false); }
  }

  async function handleDisableCode(id) {
    setErr('');
    try {
      const ok = await API.inviteCodes.disable(id);
      if (ok) loadInvites();
      else setErr('操作失败');
    } catch (e) { setErr(friendlyError(e.message)); }
  }

  async function handleBanUser(userId) {
    try {
      setBusy(true);
      const ok = await API.users.ban(userId);
      if (ok) { loadUsers(); setConfirmBan(null); }
      else setErr('操作失败');
    } catch (e) { setErr(friendlyError(e.message)); }
    finally { setBusy(false); }
  }

  async function handleUnbanUser(userId) {
    try {
      setBusy(true);
      const ok = await API.users.unban(userId);
      if (ok) loadUsers();
      else setErr('操作失败');
    } catch (e) { setErr(friendlyError(e.message)); }
    finally { setBusy(false); }
  }

  async function handleMigrateRun() {
    setErr('');
    setMigrateResult(null);
    setMigrateBusy(true);
    try {
      const payload = {};
      for (const [k, v] of Object.entries(migrate)) {
        if (!v || !v.trim()) continue;
        try {
          payload[k] = JSON.parse(v);
        } catch (e) {
          throw new Error(`${k} JSON 解析失败：${e.message}`);
        }
      }
      if (Object.keys(payload).length === 0) throw new Error('请至少粘贴 1 张表的 JSON 数据');
      const r = await API.migrate.run(payload);
      setMigrateResult(r);
      toast.success('迁移完成！' + Object.entries(r.counts || {}).map(([k, v]) => `${k}=${v}`).join('，'));
    } catch (e) {
      setErr(friendlyError(e.message));
    } finally {
      setMigrateBusy(false);
    }
  }

  function copyCode(code) {
    const doCopy = (text) => {
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(
          () => { setCopied(code); setTimeout(() => setCopied(null), 1500); },
          () => fallbackCopy(text)
        );
      } else {
        fallbackCopy(text);
      }
    };
    function fallbackCopy(text) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        setCopied(code);
        setTimeout(() => setCopied(null), 1500);
      } catch {
        toast.info('复制失败,请手动复制: ' + text);
      }
    }
    doCopy(code);
  }

  if (!open) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.35)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 10002
    }} onClick={onClose}>
      <div style={{
        background: '#fff', borderRadius: '14px', width: '680px', maxWidth: '94vw',
        maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)'
      }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{
          padding: '18px 20px', borderBottom: '1px solid #e5e5ea',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1c1c1e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"></path>
            </svg>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#1c1c1e' }}>
              系统设置
            </h3>
          </div>
          <button onClick={onClose} style={{
            width: '28px', height: '28px', borderRadius: '50%', border: 'none',
            background: 'rgba(120,120,128,0.12)', cursor: 'pointer',
            fontSize: '16px', color: '#8e8e93', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s'
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {!isAdmin && (
          <>
            {/* Tabs（非管理员仅展示外观设置） */}
            <div style={{ display: 'flex', borderBottom: '1px solid #e5e5ea' }}>
              {[{ key: 'appearance', label: '外观' }].map(t => (
                <button key={t.key} onClick={() => setTab(t.key)} style={{
                  flex: 1, padding: '12px 20px', border: 'none', background: 'transparent',
                  cursor: 'pointer', fontSize: '14px',
                  fontWeight: tab === t.key ? '600' : '400',
                  color: tab === t.key ? 'var(--s-main)' : '#8e8e93',
                  borderBottom: tab === t.key ? '2px solid var(--s-main)' : '2px solid transparent',
                  transition: 'all 0.15s'
                }}>{t.label}</button>
              ))}
            </div>
            <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1 }}>
              <AppearanceTab themeKey={themeKey} onSelect={(k) => { applyTheme(k); setThemeKey(k); }} />
            </div>
          </>
        )}

        {isAdmin && (
          <>
            {/* Tabs（4 Tab → 3 Tab：邀请码管理 + 用户管理 合并为「邀请与用户」） */}
            <div style={{ display: 'flex', borderBottom: '1px solid #e5e5ea' }}>
              {[
                { key: 'appearance', label: '外观' },
                { key: 'admin', label: '邀请与用户' },
                { key: 'github', label: 'AI 推送授权' },
                { key: 'migrate', label: 'D1 数据迁移' },
              ].filter(Boolean).map(t => (
                <button key={t.key} onClick={() => { setTab(t.key); setNewCode(null); setErr(''); setMigrateResult(null); }} style={{
                  flex: 1, padding: '12px 20px', border: 'none', background: 'transparent',
                  cursor: 'pointer', fontSize: '14px',
                  fontWeight: tab === t.key ? '600' : '400',
                  color: tab === t.key ? 'var(--s-main)' : '#8e8e93',
                  borderBottom: tab === t.key ? '2px solid var(--s-main)' : '2px solid transparent',
                  transition: 'all 0.15s'
                }}>{t.label}</button>
              ))}
            </div>

            {/* Error */}
            {err && (
              <div style={{ 
                margin: '12px 20px 0', 
                padding: '10px 14px', 
                fontSize: '13px', 
                color: '#FF3B30', 
                background: '#FFEEED',
                borderRadius: '8px',
                border: '1px solid #FFD9D6',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span style={{ fontSize: '16px' }}>⚠️</span>
                <span>{err}</span>
              </div>
            )}

            {/* Tab content */}
            <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1 }}>
              {tab === 'appearance' ? (
                <AppearanceTab themeKey={themeKey} onSelect={(k) => { applyTheme(k); setThemeKey(k); }} />
              ) : tab === 'admin' ? (
                <AdminTab
                  invites={invites}
                  users={users}
                  newCode={newCode}
                  busy={busy}
                  copied={copied}
                  onCreate={handleCreateCode}
                  onDisable={handleDisableCode}
                  onCopy={copyCode}
                  onBan={(uid) => setConfirmBan({ userId: uid })}
                  onUnban={handleUnbanUser}
                  ownerId={user?.id}
                />
              ) : tab === 'github' ? (
                <GithubTab />
              ) : (
                <MigrateTab
                  value={migrate}
                  onChange={setMigrate}
                  busy={migrateBusy}
                  result={migrateResult}
                  onRun={handleMigrateRun}
                />
              )}
            </div>
          </>
        )}

        {/* Ban confirm dialog */}
        {confirmBan && (
          <div style={{
            position: 'absolute', inset: 0,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 10, borderRadius: '14px'
          }} onClick={() => setConfirmBan(null)}>
            <div style={{
              background: '#fff', borderRadius: '16px', width: '340px', padding: '28px 24px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
            }} onClick={(e) => e.stopPropagation()}>
              <div style={{ 
                textAlign: 'center', 
                marginBottom: '16px',
                width: '48px', height: '48px', borderRadius: '50%',
                background: '#FFEEED', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px'
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FF3B30" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="8" x2="12" y2="12"></line>
                  <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
              </div>
              <div style={{ fontSize: '17px', fontWeight: '600', textAlign: 'center', marginBottom: '8px' }}>
                禁用该用户？
              </div>
              <div style={{ fontSize: '13px', color: '#8e8e93', textAlign: 'center', marginBottom: '24px', lineHeight: 1.5 }}>
                禁用后该用户将无法登录工作台。<br/>此操作可随时恢复。
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => setConfirmBan(null)} style={{
                  flex: 1, padding: '11px', borderRadius: '10px',
                  background: '#f5f5f7', color: '#1c1c1e',
                  border: 'none', fontWeight: '600', fontSize: '14px', cursor: 'pointer',
                  transition: 'all 0.15s'
                }}>取消</button>
                <button onClick={() => handleBanUser(confirmBan.userId)} disabled={busy} style={{
                  flex: 1, padding: '11px', borderRadius: '10px',
                  background: busy ? '#ccc' : '#FF3B30', color: '#fff',
                  border: 'none', fontWeight: '600', fontSize: '14px', cursor: busy ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s'
                }}>{busy ? '处理中...' : '确认禁用'}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AppearanceTab({ themeKey, onSelect }) {
  const [editing, setEditing] = useState(null); // { mode: 'add'|'edit', key?, hex, label, moduleKey? }
  const [allThemes, setAllThemes] = useState(() => Object.values(getAllThemes()));
  const [confirmDel, setConfirmDel] = useState(null);
  const [moduleColorVersion, setModuleColorVersion] = useState(0);
  // 拖拽排序状态：拖起的 key / 悬停目标的 key
  const [dragKey, setDragKey] = useState(null);
  const [overKey, setOverKey] = useState(null);

  const refresh = () => setAllThemes(Object.values(getAllThemes()));

  // 拖拽落点：把 dragKey 移动到 overKey 的位置，保存顺序并刷新
  const handleDrop = (e) => {
    e.preventDefault();
    if (!dragKey || !overKey || dragKey === overKey) { setDragKey(null); setOverKey(null); return; }
    const list = allThemes.map(t => t.key);
    const from = list.indexOf(dragKey);
    const to = list.indexOf(overKey);
    if (from < 0 || to < 0) { setDragKey(null); setOverKey(null); return; }
    const next = [...list];
    next.splice(from, 1);
    next.splice(to, 0, dragKey);
    saveThemeOrder(next);
    setAllThemes(Object.values(getAllThemes()));
    setDragKey(null);
    setOverKey(null);
  };

  const handleSelect = (k) => { applyTheme(k); onSelect(k); };

  const handleSaveTheme = (hex, label, editKey) => {
    if (editKey) updateCustomTheme(editKey, hex, label);
    else addCustomTheme(hex, label);
    refresh();
    // 如果正在使用被编辑的主题，重新 apply
    if (editKey === themeKey) { applyTheme(editKey); }
    setEditing(null);
  };

  const handleDelete = (key) => {
    deleteCustomTheme(key);
    refresh();
    if (key === themeKey) { applyTheme('blue'); onSelect('blue'); }
    setConfirmDel(null);
  };

  const handleSaveModuleColor = (moduleKey, hex) => {
    saveModuleColor(moduleKey, hex);
    applyModuleColors();
    setEditing(null);
    setModuleColorVersion(v => v + 1);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '13px', fontWeight: '600', color: '#1c1c1e' }}>主题颜色</div>
          <div style={{ fontSize: '11px', color: '#8e8e93', marginTop: '2px' }}>点击切换配色，拖拽卡片可自定义排序，自动保存</div>
        </div>
        <button onClick={() => setEditing({ mode: 'add', hex: '#007AFF', label: '' })} style={{
          padding: '6px 14px', borderRadius: '8px', border: 'none',
          background: 'var(--s-main)', color: '#fff', fontSize: '12px', fontWeight: '600',
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
          boxShadow: '0 1px 4px rgba(var(--s-rgb),0.3)', transition: 'all 0.15s',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          新增
        </button>
      </div>

      {/* 4列网格主题列表 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
        {allThemes.map(t => {
          const active = t.key === themeKey;
          const dragging = dragKey === t.key;
          const dropping = overKey === t.key && dragKey && dragKey !== t.key;
          return (
            <div key={t.key}
              draggable
              onDragStart={(e) => { setDragKey(t.key); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', t.key); } catch { /* IE */ } }}
              onDragEnd={() => { setDragKey(null); setOverKey(null); }}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (overKey !== t.key) setOverKey(t.key); }}
              onDragLeave={() => { if (overKey === t.key) setOverKey(null); }}
              onDrop={handleDrop}
              onClick={() => handleSelect(t.key)} style={{
              display: 'flex', flexDirection: 'column', gap: '4px',
              padding: '6px 6px', borderRadius: '8px',
              background: active ? 'rgba(var(--s-rgb),0.06)' : '#f5f5f7',
              border: dropping ? '1.5px dashed var(--s-main)' : active ? '1.5px solid var(--s-main)' : '1.5px solid transparent',
              cursor: 'grab', transition: 'all 0.15s', position: 'relative',
              opacity: dragging ? 0.4 : 1,
            }}>
              {/* 色块 + 名称 + hex 横排 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <div style={{
                  width: '16px', height: '16px', borderRadius: '4px', flexShrink: 0,
                  background: `linear-gradient(135deg, ${t.gradFrom} 0%, ${t.gradTo} 100%)`,
                  boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.3)',
                }} />
                <span style={{ fontSize: '11.5px', fontWeight: '600', color: '#1c1c1e', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.label}</span>
              </div>
              {/* hex 码 */}
              <span style={{ fontSize: '11px', color: '#8e8e93', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {t.gradFrom === t.gradTo ? t.main.toUpperCase() : `${t.gradFrom.toUpperCase()}→${t.gradTo.toUpperCase()}`}
              </span>
              {/* 自定义操作按钮：右上角 */}
              {t.custom && (
                <div style={{ position: 'absolute', top: '3px', right: '3px', display: 'flex', gap: '2px' }}>
                  <button onClick={(e) => { e.stopPropagation(); setEditing({ mode: 'edit', key: t.key, hex: t.main, label: t.label }); }} style={{
                    width: '18px', height: '18px', borderRadius: '4px', border: 'none',
                    background: 'rgba(120,120,128,0.15)', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8e8e93',
                  }} title="编辑">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); setConfirmDel(t.key); }} style={{
                    width: '18px', height: '18px', borderRadius: '4px', border: 'none',
                    background: 'rgba(255,59,48,0.12)', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FF3B30',
                  }} title="删除">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  </button>
                </div>
              )}
              {/* 选中标记：右上角对勾 */}
              {active && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--s-main)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', top: '3px', right: t.custom ? '43px' : '3px' }}><polyline points="20 6 9 17 4 12"/></svg>
              )}
            </div>
          );
        })}
      </div>

      {/* 效果预览 */}
      <div style={{
        borderRadius: '10px', background: '#f5f5f7', padding: '10px 14px',
        display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: '11px', fontWeight: '600', color: '#8e8e93' }}>预览</span>
        <span style={{
          padding: '5px 14px', borderRadius: '8px', background: 'var(--s-grad-bg)',
          color: '#fff', fontSize: '12px', fontWeight: '600',
          boxShadow: '0 2px 6px rgba(var(--s-rgb),0.25)',
        }}>主按钮</span>
        <span style={{ fontSize: '12px', color: 'var(--s-main)', fontWeight: '500' }}>链接</span>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: '#1c1c1e', cursor: 'pointer' }}>
          <input type="checkbox" className="cb-square" defaultChecked readOnly />
          复选框
        </label>
      </div>

      {/* ===== 模块颜色分区 ===== */}
      <ModuleColorSection key={moduleColorVersion} onEdit={(hex, label, key) => setEditing({ mode: 'edit', hex, label, moduleKey: key })} />

      {/* 新增/编辑弹窗 */}
      {editing && (
        <ThemeEditorModal
          mode={editing.mode}
          initialHex={editing.hex}
          initialLabel={editing.label}
          editKey={editing.key}
          moduleKey={editing.moduleKey}
          onSave={editing.moduleKey
            ? (hex, label) => handleSaveModuleColor(editing.moduleKey, hex)
            : handleSaveTheme}
          onClose={() => setEditing(null)}
        />
      )}

      {/* 删除确认 */}
      {confirmDel && (
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 10, borderRadius: '14px',
        }} onClick={() => setConfirmDel(null)}>
          <div style={{
            background: '#fff', borderRadius: '14px', padding: '24px 20px', width: '300px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: '15px', fontWeight: '600', textAlign: 'center', marginBottom: '8px' }}>删除该主题色？</div>
            <div style={{ fontSize: '12px', color: '#8e8e93', textAlign: 'center', marginBottom: '18px' }}>删除后不可恢复</div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setConfirmDel(null)} style={{
                flex: 1, padding: '9px', borderRadius: '9px', border: 'none',
                background: '#f5f5f7', color: '#1c1c1e', fontWeight: '600', fontSize: '13px', cursor: 'pointer',
              }}>取消</button>
              <button onClick={() => handleDelete(confirmDel)} style={{
                flex: 1, padding: '9px', borderRadius: '9px', border: 'none',
                background: '#FF3B30', color: '#fff', fontWeight: '600', fontSize: '13px', cursor: 'pointer',
              }}>确认删除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---- 五大模块色分区 ---- */
function ModuleColorSection({ onEdit }) {
  const [colors, setColors] = useState(() => getModuleColors());

  const refresh = () => setColors(getModuleColors());

  const handleReset = (key) => {
    resetModuleColor(key);
    applyModuleColors();
    refresh();
  };

  const handleResetAll = () => {
    resetAllModuleColors();
    applyModuleColors();
    refresh();
  };

  return (
    <div style={{
      borderTop: '1px solid #e5e5ea', paddingTop: '12px', marginTop: '4px',
      display: 'flex', flexDirection: 'column', gap: '8px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: '13px', fontWeight: '600', color: '#1c1c1e' }}>模块颜色</div>
        <button onClick={handleResetAll} style={{
          padding: '4px 10px', borderRadius: '7px', border: 'none',
          background: 'rgba(120,120,128,0.12)', color: '#8e8e93',
          fontSize: '11px', fontWeight: '500', cursor: 'pointer',
        }}>全部重置</button>
      </div>

      {/* 单行横排 5 个模块 chip */}
      <div style={{ display: 'flex', gap: '5px' }}>
        {Object.values(colors).map(m => {
          const isDefault = m.hex === m.default;
          return (
            <div key={m.key} onClick={() => onEdit(m.hex, m.label, m.key)} style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px',
              padding: '6px 4px', borderRadius: '8px', background: '#f5f5f7',
              cursor: 'pointer', transition: 'all 0.15s', position: 'relative',
            }}>
              <div style={{
                width: '16px', height: '16px', borderRadius: '50%', flexShrink: 0,
                background: m.hex, boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.25)',
              }} />
              <span style={{ fontSize: '11px', fontWeight: '600', color: '#1c1c1e' }}>{m.label}</span>
              <span style={{
                fontSize: '10.5px', color: '#8e8e93',
                whiteSpace: 'nowrap',
              }}>{m.hex.toUpperCase()}</span>
              {/* 非默认色：右上角重置点 */}
              {!isDefault && (
                <button onClick={(e) => { e.stopPropagation(); handleReset(m.key); }} style={{
                  position: 'absolute', top: '2px', right: '2px',
                  width: '14px', height: '14px', borderRadius: '50%', border: 'none',
                  background: 'rgba(120,120,128,0.2)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8e8e93',
                }} title="重置">
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---- 主题新增/编辑弹窗 ---- */
function ThemeEditorModal({ mode, initialHex, initialLabel, editKey, moduleKey, onSave, onClose }) {
  const [hex, setHex] = useState(initialHex || '#007AFF');
  const [label, setLabel] = useState(initialLabel || '');
  const valid = isValidHex(hex);
  // 派生预览色（内联，不依赖 theme.js 内部函数）
  const previewBg = valid ? `linear-gradient(135deg, ${hex} 0%, ${hex} 100%)` : '#ccc';
  const previewMain = valid ? hex : '#ccc';
  const previewRgb = valid ? (() => {
    const h = hex.replace('#', '');
    return `${parseInt(h.slice(0,2),16)},${parseInt(h.slice(2,4),16)},${parseInt(h.slice(4,6),16)}`;
  })() : '0,0,0';

  const handleHexInput = (v) => {
    let s = v.trim();
    if (s && !s.startsWith('#')) s = '#' + s;
    setHex(s);
  };

  return (
    <div style={{
      position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 10, borderRadius: '14px',
    }} onClick={onClose}>
      <div style={{
        background: '#fff', borderRadius: '14px', padding: '22px 20px', width: '380px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <h4 style={{ margin: 0, fontSize: '15px', fontWeight: '600' }}>{moduleKey ? `编辑${initialLabel || '模块'}色` : (mode === 'edit' ? '编辑主题色' : '新增主题色')}</h4>
          <button onClick={onClose} style={{
            width: '24px', height: '24px', borderRadius: '50%', border: 'none',
            background: 'rgba(120,120,128,0.12)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8e8e93',
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* 颜色码输入 + 取色器 */}
        <div style={{ marginBottom: '12px' }}>
          <label style={{ fontSize: '11px', fontWeight: '600', color: '#8e8e93', display: 'block', marginBottom: '5px' }}>颜色码</label>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              value={hex}
              onChange={(e) => handleHexInput(e.target.value)}
              placeholder="#007AFF"
              style={{
                flex: 1, padding: '8px 10px', borderRadius: '8px',
                border: valid ? '1px solid #e5e5ea' : '1.5px solid #FF3B30',
                fontSize: '14px',
                outline: 'none', color: '#1c1c1e', background: '#fafafa',
              }}
            />
            <div style={{
              width: '34px', height: '34px', borderRadius: '8px',
              border: '1px solid #e5e5ea', overflow: 'hidden', flexShrink: 0,
            }}>
              <input
                type="color"
                value={valid ? hex : '#007AFF'}
                onChange={(e) => setHex(e.target.value)}
                style={{
                  width: '200%', height: '200%', border: 'none',
                  cursor: 'pointer', padding: 0, margin: '-50%',
                  background: 'none', display: 'block',
                }}
              />
            </div>
          </div>
          {!valid && <div style={{ fontSize: '11px', color: '#FF3B30', marginTop: '4px' }}>格式无效，需 # + 6位十六进制</div>}
        </div>

        {/* 名称输入（模块色模式隐藏） */}
        {!moduleKey && (
        <div style={{ marginBottom: '14px' }}>
          <label style={{ fontSize: '11px', fontWeight: '600', color: '#8e8e93', display: 'block', marginBottom: '5px' }}>名称</label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="如：克莱因蓝"
            style={{
              width: '100%', padding: '8px 10px', borderRadius: '8px',
              border: '1px solid #e5e5ea', fontSize: '13px',
              outline: 'none', color: '#1c1c1e', background: '#fafafa',
            }}
          />
        </div>
        )}

        {/* 效果预览（跟随输入 hex 实时渲染） */}
        <div style={{
          borderRadius: '10px', background: '#f5f5f7', padding: '12px 14px',
          marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: '11px', fontWeight: '600', color: '#8e8e93' }}>预览</span>
          <span style={{
            padding: '5px 14px', borderRadius: '8px', background: previewBg,
            color: '#fff', fontSize: '12px', fontWeight: '600',
            boxShadow: `0 2px 6px rgba(${previewRgb},0.25)`,
          }}>主按钮</span>
          <span style={{ fontSize: '12px', color: previewMain, fontWeight: '500' }}>链接</span>
          <span style={{
            width: '16px', height: '16px', borderRadius: '50%',
            background: previewMain, display: 'inline-flex',
            alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: '10px', fontWeight: '700',
          }}>✓</span>
        </div>

        {/* 按钮 */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={onClose} style={{
            flex: 1, padding: '9px', borderRadius: '9px', border: 'none',
            background: '#f5f5f7', color: '#1c1c1e', fontWeight: '600', fontSize: '13px', cursor: 'pointer',
          }}>取消</button>
          <button
            onClick={() => onSave(hex, label || hex.toUpperCase(), editKey)}
            disabled={!valid}
            style={{
              flex: 1, padding: '9px', borderRadius: '9px', border: 'none',
              background: valid ? previewMain : '#ccc', color: '#fff',
              fontWeight: '600', fontSize: '13px', cursor: valid ? 'pointer' : 'not-allowed',
            }}
          >{mode === 'edit' ? '保存' : '确认添加'}</button>
        </div>
      </div>
    </div>
  );
}

function AdminTab({
  invites, users, newCode, busy, copied,
  onCreate, onDisable, onCopy, onBan, onUnban, ownerId,
}) {
  // ====== 共用：卡片外壳（每张"邀请码管理/注册用户"外框） ======
  const card = {
    border: '1px solid #e5e5ea',
    borderRadius: '12px',
    background: '#ffffff',
    overflow: 'hidden',
  };
  const header = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 16px', borderBottom: '1px solid #e5e5ea',
    background: '#fafafa',
  };
  const title = { fontSize: '14px', fontWeight: '600', color: '#1c1c1e' };
  const primaryBtn = {
    padding: '8px 14px', borderRadius: '8px',
    background: busy ? '#ccc' : 'var(--s-main)',
    color: '#fff', border: 'none', fontWeight: '600', fontSize: '13px',
    cursor: busy ? 'not-allowed' : 'pointer',
    boxShadow: busy ? 'none' : '0 1px 3px rgba(var(--s-rgb),0.28)',
    transition: 'all 0.15s', display: 'inline-flex', alignItems: 'center', gap: '6px',
  };
  const thRow = {
    display: 'grid', alignItems: 'center', justifyItems: 'center',
    padding: '8px 16px',
    fontSize: '12px', color: '#8e8e93', fontWeight: '500',
    background: '#fafafa', borderBottom: '1px solid #f0f0f2',
    textAlign: 'center',
  };
  const tr = {
    display: 'grid', alignItems: 'center', justifyItems: 'center',
    padding: '10px 16px',
    borderBottom: '1px solid #f4f4f6',
    fontSize: '13px', color: '#1c1c1e',
    transition: 'background .12s',
    textAlign: 'center',
  };
  const codeMono = { fontFamily: 'SF Mono, Menlo, Consolas, monospace', fontWeight: 600, letterSpacing: '0.04em' };
  const pill = (color) => ({
    display: 'inline-flex', alignItems: 'center',
    fontSize: '11px', fontWeight: 600, color: '#fff',
    padding: '3px 10px', borderRadius: '999px', background: color,
  });
  const dangerBtn = {
    padding: '5px 12px', borderRadius: '7px', border: 'none',
    background: 'rgba(255,59,48,0.09)', color: '#FF3B30',
    fontSize: '12px', fontWeight: '600', cursor: 'pointer',
    transition: 'all 0.15s',
  };
  const successBtn = {
    padding: '5px 12px', borderRadius: '7px', border: 'none',
    background: 'rgba(52,199,89,0.10)', color: '#34C759',
    fontSize: '12px', fontWeight: '600', cursor: 'pointer',
    transition: 'all 0.15s',
  };
  const disabledBtn = {
    ...dangerBtn,
    opacity: 0.4, cursor: 'not-allowed', background: '#f5f5f7', color: '#8e8e93',
  };
  const empty = (emoji, line1, line2) => ({
    padding: '32px 24px', textAlign: 'center', color: '#8e8e93', fontSize: '13px',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* ===========================================================
            上半卡片：邀请码管理（标题 + 生成按钮同栏）
           =========================================================== */}
      <div style={card}>
        {/* Header：标题 + 「+ 生成邀请码」同栏，不再单独一行灰块（方案 A 要求） */}
        <div style={header}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={title}>邀请码管理</span>
            <span style={{ fontSize: '12px', color: '#8e8e93' }}>共 {invites.length} 条</span>
          </div>
          <button onClick={onCreate} disabled={busy} style={primaryBtn}>
            {busy ? '生成中...' : '+ 生成邀请码'}
          </button>
        </div>

        {/* 新邀请码成功条（压缩高度：padding 12px，字号 20px，紧跟 Header 下方） */}
        {newCode && (
          <div style={{
            padding: '12px 16px', background: '#EDFAF1',
            borderBottom: '1px solid #DCF5E4',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: '12px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
              <span style={{
                fontSize: '12px', color: '#34C759', fontWeight: 700, flexShrink: 0,
              }}>✨ 新邀请码 · 一次有效</span>
              <code style={{
                fontSize: '20px', fontWeight: 700, color: '#1c1c1e',
                letterSpacing: '3px',
                fontFamily: 'SF Mono, Menlo, monospace',
                whiteSpace: 'nowrap',
              }}>{newCode}</code>
            </div>
            <button onClick={() => onCopy(newCode)} style={{
              padding: '5px 12px', borderRadius: '7px', background: '#fff',
              border: '1px solid #34C759', color: '#34C759',
              fontSize: '12px', fontWeight: 700, cursor: 'pointer', flexShrink: 0,
            }}>{copied === newCode ? '✓ 已复制' : '复制'}</button>
          </div>
        )}

        {/* 表格头 + 行（5 列：邀请码 / 状态 / 使用人 / 创建时间 / 操作） */}
        {invites.length === 0 ? (
          <div style={empty()}>
            <div style={{ fontSize: '28px', marginBottom: '6px' }}>🎟️</div>
            <div style={{ fontWeight: 500, color: '#3c3c43' }}>还没有邀请码</div>
            <div style={{ marginTop: '4px', fontSize: '12px', color: '#8e8e93' }}>
              点击右上角「+ 生成邀请码」开始邀请朋友注册
            </div>
          </div>
        ) : (
          <div>
            <div style={{ ...thRow, gridTemplateColumns: '1.1fr 0.7fr 1.4fr 1fr 0.6fr' }}>
              <div>邀请码</div>
              <div>状态</div>
              <div>使用人</div>
              <div>创建时间</div>
              <div>操作</div>
            </div>
            {invites.map(c => {
              const isUsed = !!c.is_used;
              const isDisabled = !!c.is_disabled;
              const statusLabel = isDisabled ? '已禁用' : isUsed ? '已使用' : '未使用';
              const statusColor = isDisabled ? '#8e8e93' : isUsed ? '#007AFF' : '#34C759';
              return (
                <div
                  key={c.id}
                  style={{ ...tr, gridTemplateColumns: '1.1fr 0.7fr 1.4fr 1fr 0.6fr' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#fafafa')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}
                >
                  <code style={codeMono}>{c.code}</code>
                  <div><span style={pill(statusColor)}>{statusLabel}</span></div>
                  <div style={{
                    fontSize: '12px', color: c.used_by_email ? '#1c1c1e' : '#c7c7cc',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {c.used_by_email || '—'}
                  </div>
                  <div style={{ fontSize: '12px', color: '#8e8e93' }}>
                    {c.created_at
                      ? new Date(c.created_at).toLocaleString('zh-CN', {
                          month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
                        })
                      : '—'}
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    {!isUsed && !isDisabled
                      ? <button onClick={() => onDisable(c.id)} style={dangerBtn}>禁用</button>
                      : isDisabled
                        ? <span style={{ fontSize: '12px', color: '#8e8e93' }}>—</span>
                        : <span style={{ fontSize: '12px', color: '#8e8e93' }}>—</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ===========================================================
            下半卡片：注册用户（表格化 + owner 高亮不可禁用）
           =========================================================== */}
      <div style={card}>
        <div style={header}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={title}>注册用户</span>
            <span style={{ fontSize: '12px', color: '#8e8e93' }}>共 {users.length} 人</span>
          </div>
        </div>

        {users.length === 0 ? (
          <div style={empty()}>
            <div style={{ fontSize: '28px', marginBottom: '6px' }}>👥</div>
            <div style={{ fontWeight: 500, color: '#3c3c43' }}>还没有注册用户</div>
            <div style={{ marginTop: '4px', fontSize: '12px', color: '#8e8e93' }}>
              先在上方生成邀请码，朋友注册后会自动出现在这里
            </div>
          </div>
        ) : (
          <div>
            <div style={{ ...thRow, gridTemplateColumns: '36px 1.3fr 1fr 1fr 0.6fr 0.7fr' }}>
              <div />
              <div>账号</div>
              <div>昵称 / 注册时间</div>
              <div>最近登录</div>
              <div>状态</div>
              <div>操作</div>
            </div>
            {users.map(u => {
              const isOwner = ownerId && String(u.user_id || u.id) === String(ownerId);
              const banned = !!u.is_banned;
              const initial = ((u.username || u.email || '?')[0] || '?').toUpperCase();
              return (
                <div
                  key={u.user_id || u.id}
                  style={{
                    ...tr,
                    gridTemplateColumns: '36px 1.3fr 1fr 1fr 0.6fr 0.7fr',
                    background: banned ? 'rgba(255,59,48,0.04)' : '#fff',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = banned ? 'rgba(255,59,48,0.06)' : '#fafafa')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = banned ? 'rgba(255,59,48,0.04)' : '#fff')}
                >
                  <div style={{
                    width: '28px', height: '28px', borderRadius: '999px',
                    background: banned ? '#8e8e93' : 'var(--s-main)',
                    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '12px', fontWeight: 700,
                  }}>{initial}</div>
                  <div style={{ minWidth: 0, width: '100%' }}>
                    <span style={{
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block',
                      fontWeight: 500, color: '#1c1c1e',
                    }}>{u.email}</span>
                  </div>
                  <div style={{ minWidth: 0, width: '100%', overflow: 'hidden', fontSize: '12px', color: '#8e8e93' }}>
                    <div style={{ color: '#3c3c43', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {u.username || '—'}
                    </div>
                    <div>
                      {u.created_at
                        ? new Date(u.created_at).toLocaleDateString('zh-CN', {
                            year: 'numeric', month: '2-digit', day: '2-digit',
                          })
                        : '—'}
                    </div>
                  </div>
                  <div style={{ fontSize: '12px', color: '#8e8e93', width: '100%' }}>
                    {u.last_login
                      ? new Date(u.last_login).toLocaleString('zh-CN', {
                          month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
                        })
                      : '—'}
                  </div>
                  <div>
                    {isOwner
                      ? <span style={pill('#FF9500')}>所有者</span>
                      : banned
                        ? <span style={pill('#FF3B30')}>已禁用</span>
                        : <span style={pill('#34C759')}>正常</span>}
                  </div>
                  <div style={{ textAlign: 'center', width: '100%' }}>
                    {isOwner
                      ? <button disabled style={disabledBtn} title="所有者账号不可被禁用">禁用</button>
                      : banned
                        ? <button onClick={() => onUnban(u.user_id || u.id)} disabled={busy} style={successBtn}>解禁</button>
                        : <button onClick={() => onBan(u.user_id || u.id)} disabled={busy} style={dangerBtn}>禁用</button>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}


/* ---- AI 推送授权（GitHub PAT 托管，仅 owner）----
   布局原则：高频操作上浮——授权主卡置顶（Switch 状态即操作、分组展示授权码、
   全页唯一主按钮「复制推送指令」）；PAT 托管压缩为行卡（更新/删除为文字链接）；
   安全说明降为一行脚注（可展开）。 */
// 授权码有效期选项（与后端 GRANT_TTL_HOURS 对应：24 小时 / 1 个月 / 3 个月）
const TTL_OPTIONS = [
  { hours: 24, label: '1 天' },
  { hours: 720, label: '1 个月' },
  { hours: 2160, label: '3 个月' },
];

// 发给 AI 的完整推送指令（授权码已内含，AI 无需单独拿到 code 文本）
function buildGithubInstruction(code) {
  return `请通过我的工作台完成 GitHub 推送授权：\nPOST https://ethan-workspace.pages.dev/api/github/issueGrant\n{"grant_code":"${code}"}\n拿到 PAT 后请用 git credential helper 配置（勿内嵌到 URL/命令行），push 完成后我会自行关闭授权开关；若提示授权码无效或过期，请重新找我要新的推送指令。`;
}

function fmtRemain(ms) {
  if (ms <= 0) return '已过期';
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m} 分钟`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} 小时 ${m % 60} 分`;
  return `${Math.floor(h / 24)} 天 ${h % 24} 小时`;
}

function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

function GithubTab() {
  const toast = useToast();
  const [status, setStatus] = useState(null);
  const [pat, setPat] = useState('');
  const [patInputOpen, setPatInputOpen] = useState(false); // 「更新」点开才显示输入框，平时不占空间
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [grantCode, setGrantCode] = useState(null); // { code, expires_at } 仅开启那一刻持有
  const [ttlHours, setTtlHours] = useState(24);
  const [copied, setCopied] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [, setTick] = useState(0); // 授权窗口内每 30s 重渲染刷新剩余时间

  async function load() {
    try {
      const r = await API.github.status();
      setStatus(r);
      if (r.grant?.ttl_hours) setTtlHours(r.grant.ttl_hours);
      if (!r.grant?.enabled) setGrantCode(null);
    } catch (e) { setErr(e.message); }
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const t = setInterval(() => setTick(v => v + 1), 30000);
    return () => clearInterval(t);
  }, []);

  function copyText(text) {
    const done = () => { setCopied(true); setTimeout(() => setCopied(false), 1500); };
    const fallback = () => {
      try {
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); document.body.removeChild(ta);
        done();
      } catch { toast.info('复制失败，请手动复制'); }
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(fallback);
    } else fallback();
  }

  async function handleSavePat() {
    setErr('');
    const p = pat.trim();
    if (!p) return;
    try {
      setBusy(true);
      const r = await API.github.setToken(p);
      setPat('');
      setPatInputOpen(false);
      toast.success(`PAT 已验证并加密保存（GitHub 账号：${r.pat_login || '未知'}）`);
      load();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  // 开/关授权；开启时按 ttl 生成新授权码（切换时长 = 重新生成），并自动复制推送指令
  async function handleToggleGrant(enabled, ttl = ttlHours) {
    setErr('');
    try {
      setBusy(true);
      const r = await API.github.toggleGrant(enabled, ttl);
      if (r.grant?.enabled && r.grant?.code) {
        setGrantCode({ code: r.grant.code, expires_at: r.grant.expires_at });
        if (r.grant.ttl_hours) setTtlHours(r.grant.ttl_hours);
        copyText(buildGithubInstruction(r.grant.code));
        toast.success('授权码已生成，推送指令已复制');
      } else {
        setGrantCode(null);
        toast.info('推送授权已关闭');
      }
      load();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  async function handleClearPat() {
    setErr('');
    try {
      setBusy(true);
      await API.github.clearToken();
      setConfirmClear(false);
      setGrantCode(null);
      setPatInputOpen(false);
      toast.info('托管的 PAT 已彻底删除');
      load();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  const inputStyle = {
    flex: 1, padding: '9px 12px', borderRadius: '9px', minWidth: 0,
    border: '1px solid #e5e5ea', fontSize: '13px',
    outline: 'none', color: '#1c1c1e', background: '#fff',
    fontFamily: 'SF Mono, Menlo, monospace',
  };
  const saveBtnStyle = (disabled) => ({
    padding: '8px 16px', borderRadius: '9px', border: 'none', flexShrink: 0,
    background: disabled ? '#ccc' : 'var(--s-main)',
    color: '#fff', fontWeight: 600, fontSize: '13px',
    cursor: disabled ? 'not-allowed' : 'pointer',
  });
  const linkBtnStyle = {
    border: 'none', background: 'none', padding: 0,
    fontSize: '12px', fontWeight: 600, color: 'var(--s-main)', cursor: 'pointer',
  };

  const configured = !!status?.configured;
  const grantOn = !!status?.grant?.enabled;
  const remainMs = grantCode ? grantCode.expires_at - Date.now() : 0;
  const expired = grantCode && remainMs <= 0;
  const codeGroups = grantCode ? (grantCode.code.match(/.{1,8}/g) || []) : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {err && (
        <div style={{
          padding: '10px 14px', fontSize: '13px', color: '#FF3B30',
          background: '#FFEEED', borderRadius: '8px', border: '1px solid #FFD9D6',
        }}>{err}</div>
      )}

      {/* ============ 主卡：AI 推送授权（日常高频，置顶） ============ */}
      <div style={{
        border: '1.5px solid var(--s-main)', borderRadius: '12px',
        background: '#fff', padding: '16px',
        display: 'flex', flexDirection: 'column', gap: '12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '15px', fontWeight: 700, color: '#1c1c1e' }}>AI 推送授权</span>
          {/* Switch：状态即操作，替代「开启中」标签 + 「关闭授权」按钮的组合 */}
          <button
            role="switch" aria-checked={grantOn}
            disabled={!configured || busy}
            onClick={() => handleToggleGrant(!grantOn)}
            title={!configured ? '请先保存 GitHub PAT' : grantOn ? '关闭推送授权' : '开启推送授权'}
            style={{
              position: 'relative', width: '44px', height: '26px', borderRadius: '999px',
              border: 'none', padding: 0, flexShrink: 0,
              background: grantOn ? 'var(--s-main)' : '#e5e5ea',
              opacity: !configured || busy ? 0.5 : 1,
              cursor: !configured || busy ? 'not-allowed' : 'pointer',
              transition: 'background .12s',
            }}>
            <span style={{
              position: 'absolute', top: '3px', left: grantOn ? '21px' : '3px',
              width: '20px', height: '20px', borderRadius: '50%', background: '#fff',
              boxShadow: '0 1px 3px rgba(0,0,0,.2)', transition: 'left .12s',
            }} />
          </button>
        </div>

        {!configured ? (
          <div style={{ fontSize: '12px', color: '#8e8e93', lineHeight: 1.7 }}>
            先在下方保存 GitHub PAT，再回到这里开启推送授权。
          </div>
        ) : !grantOn ? (
          <div style={{ fontSize: '12px', color: '#8e8e93', lineHeight: 1.7 }}>
            打开开关生成授权码，点「复制推送指令」发给 AI 助手，即可在全新沙盒完成 git push；
            推送完成后关闭开关立即断电。
          </div>
        ) : (
          <>
            {/* 状态行（含审计） */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#1c1c1e' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#34C759', display: 'inline-block', flexShrink: 0 }} />
              授权中
              {grantCode && !expired ? ` · 剩余 ${fmtRemain(remainMs)}` : ''}
              {status?.grant?.issued_count > 0 ? ` · 已签发 ${status.grant.issued_count} 次` : ''}
            </div>

            {grantCode && !expired ? (
              <>
                {/* 授权码展示条：分组等宽，一眼可核对 */}
                <div style={{
                  padding: '12px 14px', borderRadius: '10px', background: '#fff8e6', border: '1px solid #f1d47a',
                  display: 'flex', flexDirection: 'column', gap: '6px',
                }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', justifyContent: 'center' }}>
                    {codeGroups.map((g, i) => (
                      <code key={i} style={{
                        fontSize: '14px', fontWeight: 700, color: '#1c1c1e',
                        fontFamily: 'SF Mono, Menlo, monospace', letterSpacing: '0.5px',
                      }}>{g}</code>
                    ))}
                  </div>
                  <div style={{ fontSize: '11px', color: '#7a5b00', fontWeight: 600, textAlign: 'center' }}>
                    ⏳ {fmtRemain(remainMs)}内有效 · 关闭开关立即作废
                  </div>
                </div>

                {/* 有效期选择（切换将重新生成授权码） */}
                <div>
                  <div style={{ fontSize: '11px', color: '#8e8e93', marginBottom: '6px' }}>授权码有效期（切换将重新生成授权码）</div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {TTL_OPTIONS.map((o) => (
                      <button key={o.hours} onClick={() => o.hours !== ttlHours && handleToggleGrant(true, o.hours)}
                        disabled={busy} style={{
                          flex: 1, padding: '6px 0', borderRadius: '8px',
                          border: o.hours === ttlHours ? 'none' : '1px solid #e5e5ea',
                          background: o.hours === ttlHours ? 'var(--s-main)' : '#fff',
                          color: o.hours === ttlHours ? '#fff' : '#3c3c43',
                          fontSize: '12px', fontWeight: 600,
                          cursor: busy ? 'not-allowed' : 'pointer',
                        }}>{o.label}</button>
                    ))}
                  </div>
                </div>

                {/* 全页唯一主按钮：推送指令已内含授权码，无需单独复制 code */}
                <button onClick={() => copyText(buildGithubInstruction(grantCode.code))} style={{
                  padding: '10px 16px', borderRadius: '10px', border: 'none',
                  background: 'var(--s-main)', color: '#fff', fontWeight: 600, fontSize: '13px',
                  cursor: 'pointer', boxShadow: '0 1px 3px rgba(var(--s-rgb),0.28)',
                }}>{copied ? '✓ 已复制，发给 AI 即可' : '📋 复制推送指令发给 AI'}</button>
              </>
            ) : expired ? (
              <div style={{ fontSize: '12px', color: '#8e8e93' }}>
                授权码已过期，请先关闭再重新开启，生成新授权码。
              </div>
            ) : (
              <div style={{ fontSize: '12px', color: '#8e8e93' }}>
                授权开启中，但授权码只在开启那一刻生成。如需给 AI 使用，请关闭后重新开启。
              </div>
            )}
          </>
        )}
      </div>

      {/* ============ 次卡：GitHub PAT 托管（一次性配置，压缩为一行） ============ */}
      <div style={{
        border: '1px solid #e5e5ea', borderRadius: '12px',
        background: '#fff', padding: '16px',
        display: 'flex', flexDirection: 'column', gap: '10px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '14px', fontWeight: 700, color: '#1c1c1e' }}>
            GitHub PAT{configured ? ' · 已托管' : ''}
          </span>
          {configured && (
            <div style={{ display: 'flex', gap: '14px' }}>
              <button onClick={() => setPatInputOpen(v => !v)} disabled={busy} style={linkBtnStyle}>
                {patInputOpen ? '收起' : '更新'}
              </button>
              <button
                onClick={() => { if (!confirmClear) { setConfirmClear(true); setTimeout(() => setConfirmClear(false), 3000); } else handleClearPat(); }}
                disabled={busy} style={{
                  ...linkBtnStyle,
                  color: confirmClear ? '#FF3B30' : 'rgba(255,59,48,0.75)',
                  fontWeight: confirmClear ? 700 : 600,
                }}>{confirmClear ? '确认删除？' : '删除'}</button>
            </div>
          )}
        </div>

        {configured ? (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
              <code style={{ fontSize: '13px', fontWeight: 600, color: '#1c1c1e', fontFamily: 'SF Mono, Menlo, monospace' }}>{status.mask}</code>
              <span style={{ fontSize: '11px', color: '#8e8e93' }}>
                {status.pat_login || '—'}{status.updated_at ? ` · ${fmtDate(status.updated_at)} 保存` : ''}
              </span>
            </div>
            {patInputOpen && (
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="password" value={pat} onChange={(e) => setPat(e.target.value)}
                  placeholder="粘贴新的 PAT 覆盖更新（会自动作废当前授权）"
                  style={inputStyle} autoComplete="off"
                />
                <button onClick={handleSavePat} disabled={busy || !pat.trim()} style={saveBtnStyle(busy || !pat.trim())}>
                  {busy ? '验证中...' : '验证并保存'}
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="password" value={pat} onChange={(e) => setPat(e.target.value)}
                placeholder="粘贴 GitHub PAT（建议 fine-grained，仅本仓库 + Contents 读写）"
                style={inputStyle} autoComplete="off"
              />
              <button onClick={handleSavePat} disabled={busy || !pat.trim()} style={saveBtnStyle(busy || !pat.trim())}>
                {busy ? '验证中...' : '验证并保存'}
              </button>
            </div>
            <div style={{ fontSize: '11px', color: '#8e8e93', lineHeight: 1.6 }}>
              保存后经 GitHub 验证并 AES-GCM 加密落库（密钥在 Cloudflare Secrets），界面只显示掩码。
            </div>
          </>
        )}
      </div>

      {/* ============ 脚注：三层防护（一行 + 可展开详情） ============ */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
        padding: '0 4px', fontSize: '11px', color: '#8e8e93',
      }}>
        <span>🔒 三层防护：加密存储 · 时限授权码 · 最小权限兜底</span>
        <button onClick={() => setShowDetails(v => !v)} style={{ ...linkBtnStyle, fontSize: '11px', flexShrink: 0 }}>
          {showDetails ? '收起 ▴' : '展开详情 ▾'}
        </button>
      </div>
      {showDetails && (
        <div style={{
          padding: '12px 14px', borderRadius: '10px', background: '#f5f5f7',
          fontSize: '11px', color: '#6b7280', lineHeight: 1.8,
        }}>
          1. <b style={{ color: '#3c3c43' }}>加密存储</b>：PAT 以 AES-GCM 密文落库，密钥在 Cloudflare Secrets，拖库拿到的只是密文；<br />
          2. <b style={{ color: '#3c3c43' }}>时限授权码</b>：发给 AI 的是有时效的随机授权码，过期或关闭开关立即作废（即使对话泄露，过时即废）；<br />
          3. <b style={{ color: '#3c3c43' }}>最小权限兜底</b>：建议 fine-grained PAT 仅授权本仓库 + Contents 读写，最坏情况泄露影响面可控。
        </div>
      )}
    </div>
  );
}

function MigrateTab({ value, onChange, busy, result, onRun }) {
  const TABLES = [
    { key: 'habits', label: '① ethan_habits（习惯，8 条）', placeholder: '粘贴从 Supabase 导出的 habits JSON 数组' },
    { key: 'habit_logs', label: '② ethan_habit_logs（习惯打卡，109 条）', placeholder: '粘贴 habit_logs JSON 数组（7月 / 8月分段的可一次性合并粘贴）' },
    { key: 'schedules', label: '③ ethan_schedules（日程，40 条）', placeholder: '粘贴 schedules JSON 数组' },
    { key: 'tasks', label: '④ ethan_tasks（任务，1 条）', placeholder: '粘贴 tasks JSON 数组' },
    { key: 'summaries', label: '⑤ ethan_summaries（日记/复盘，18 条）', placeholder: '粘贴 summaries JSON 数组' },
    { key: 'fixed_schedules', label: '⑥ ethan_fixed_schedules（固定日程，4 条）', placeholder: '粘贴 fixed_schedules JSON 数组' },
  ];

  const setField = (k, v) => onChange(prev => ({ ...prev, [k]: v }));
  const hasAny = Object.values(value).some(s => s && s.trim());

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{
        padding: '14px 16px', borderRadius: '10px', background: '#fff8e6',
        border: '1px solid #f1d47a', fontSize: '13px', color: '#7a5b00', lineHeight: 1.55,
      }}>
        <b>说明：</b>把之前从 Supabase SQL Editor 导出的 6 段 JSON，分别粘贴到下面对应的文本框中，
        再点「一键迁移写入 D1」即可。若某表为空可以留空（不会覆盖已有数据）。
        迁移使用 INSERT OR REPLACE，对相同主键数据为幂等操作，**重复点按钮不会重复写入**。
      </div>

      <div style={{ display: 'grid', gap: '12px' }}>
        {TABLES.map(t => (
          <div key={t.key}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: '6px',
            }}>
              <label style={{ fontSize: '12px', fontWeight: '600', color: '#1c1c1e' }}>{t.label}</label>
              {value[t.key] && (
                <button onClick={() => setField(t.key, '')} style={{
                  fontSize: '11px', color: '#8e8e93', background: 'none', border: 'none',
                  cursor: 'pointer', textDecoration: 'underline',
                }}>清空</button>
              )}
            </div>
            <textarea
              value={value[t.key]}
              onChange={e => setField(t.key, e.target.value)}
              placeholder={t.placeholder}
              style={{
                width: '100%', minHeight: '72px', padding: '10px 12px',
                border: '1px solid #e5e5ea', borderRadius: '10px',
                fontFamily: 'SF Mono, Menlo, monospace', fontSize: '12px',
                lineHeight: 1.5, resize: 'vertical', color: '#1c1c1e',
                background: '#fafafa', outline: 'none',
              }}
              onFocus={(e) => e.target.style.background = '#fff'}
              onBlur={(e) => e.target.style.background = '#fafafa'}
            />
          </div>
        ))}
      </div>

      {result && (
        <div style={{
          padding: '14px 16px', borderRadius: '10px', background: '#EDFAF1',
          border: '1px solid #34C759',
        }}>
          <div style={{ fontSize: '13px', fontWeight: '600', color: '#34C759', marginBottom: '8px' }}>
            ✅ 迁移成功（总 {result.total || 0} 条）
          </div>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '6px 14px', fontSize: '12px', color: '#333',
          }}>
            {Object.entries(result.counts || {}).sort().map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#666' }}>{k}</span>
                <b style={{ color: '#34C759' }}>{v}</b>
              </div>
            ))}
          </div>
          <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '8px' }}>
            下一步：刷新页面后进入工作台，验证精力页 8 个习惯、打卡热力图、任务/日程、复盘日记、固定日程都能正常显示。
          </div>
        </div>
      )}

      <button onClick={onRun} disabled={busy || !hasAny} style={{
        padding: '13px 22px', borderRadius: '10px',
        background: busy ? '#ccc' : (!hasAny ? '#B5D4FF' : 'var(--s-main)'),
        color: '#fff', border: 'none', fontWeight: '600', fontSize: '14px',
        cursor: busy || !hasAny ? 'not-allowed' : 'pointer',
        transition: 'all 0.15s',
        boxShadow: busy || !hasAny ? 'none' : '0 1px 3px rgba(var(--s-rgb),0.3)',
      }}>
        {busy ? '迁移中（写入 6 张表，约 10 秒）...' : '🚀 一键迁移写入 D1'}
      </button>
    </div>
  );
}