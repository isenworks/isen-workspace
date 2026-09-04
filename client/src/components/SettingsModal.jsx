import { useState, useEffect } from 'react';
import { API, IS_D1_BACKEND } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { THEMES, getAllThemes, getThemeKey, applyTheme, addCustomTheme, updateCustomTheme, deleteCustomTheme, isValidHex } from '../utils/theme.js';
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
      setNewCode(r.code);
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
            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid #e5e5ea' }}>
              {[
                { key: 'appearance', label: '外观' },
                { key: 'invites', label: '邀请码管理' },
                { key: 'users', label: '用户管理' },
                IS_D1_BACKEND && { key: 'migrate', label: 'D1 数据迁移' },
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
              ) : tab === 'invites' ? (
                <InviteCodesTab
                  invites={invites}
                  newCode={newCode}
                  busy={busy}
                  copied={copied}
                  onCreate={handleCreateCode}
                  onDisable={handleDisableCode}
                  onCopy={copyCode}
                />
              ) : tab === 'users' ? (
                <UsersTab
                  users={users}
                  busy={busy}
                  onBan={(uid) => setConfirmBan({ userId: uid })}
                  onUnban={handleUnbanUser}
                />
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
  const [editing, setEditing] = useState(null); // { mode: 'add'|'edit', key?, hex, label }
  const [allThemes, setAllThemes] = useState(() => Object.values(getAllThemes()));
  const [confirmDel, setConfirmDel] = useState(null);

  const refresh = () => setAllThemes(Object.values(getAllThemes()));

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
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '13px', fontWeight: '600', color: '#1c1c1e' }}>主题颜色</div>
          <div style={{ fontSize: '11px', color: '#8e8e93', marginTop: '2px' }}>点击切换结构模块配色，自动保存</div>
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

      {/* 紧凑主题列表 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {allThemes.map(t => {
          const active = t.key === themeKey;
          return (
            <div key={t.key} onClick={() => handleSelect(t.key)} style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '8px 10px', borderRadius: '9px',
              background: active ? 'rgba(var(--s-rgb),0.06)' : '#f5f5f7',
              border: active ? '1.5px solid var(--s-main)' : '1.5px solid transparent',
              cursor: 'pointer', transition: 'all 0.15s',
            }}>
              {/* 色块 */}
              <div style={{
                width: '22px', height: '22px', borderRadius: '6px', flexShrink: 0,
                background: `linear-gradient(135deg, ${t.gradFrom} 0%, ${t.gradTo} 100%)`,
                boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.3)',
              }} />
              {/* 名称 + hex */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#1c1c1e' }}>{t.label}</span>
                <span style={{ fontSize: '11px', color: '#8e8e93', marginLeft: '8px', fontFamily: 'SF Mono, Menlo, monospace' }}>
                  {t.gradFrom === t.gradTo ? t.main : `${t.gradFrom}→${t.gradTo}`}
                </span>
              </div>
              {/* 操作按钮 */}
              {t.custom && (
                <>
                  <button onClick={(e) => { e.stopPropagation(); setEditing({ mode: 'edit', key: t.key, hex: t.main, label: t.label }); }} style={{
                    width: '26px', height: '26px', borderRadius: '6px', border: 'none',
                    background: 'rgba(120,120,128,0.12)', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8e8e93',
                  }} title="编辑">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); setConfirmDel(t.key); }} style={{
                    width: '26px', height: '26px', borderRadius: '6px', border: 'none',
                    background: 'rgba(255,59,48,0.10)', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FF3B30',
                  }} title="删除">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  </button>
                </>
              )}
              {/* 选中标记 */}
              {active && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--s-main)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="20 6 9 17 4 12"/></svg>
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
      <ModuleColorSection onEdit={(hex, label, key) => setEditing({ mode: 'edit', hex, label, moduleKey: key })} />

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
        <div>
          <div style={{ fontSize: '13px', fontWeight: '600', color: '#1c1c1e' }}>模块颜色</div>
          <div style={{ fontSize: '11px', color: '#8e8e93', marginTop: '2px' }}>精力 / 知力 / 能力 / 工作 / 生活 五大模块分类色</div>
        </div>
        <button onClick={handleResetAll} style={{
          padding: '4px 10px', borderRadius: '7px', border: 'none',
          background: 'rgba(120,120,128,0.12)', color: '#8e8e93',
          fontSize: '11px', fontWeight: '500', cursor: 'pointer',
        }}>全部重置</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
        {Object.values(colors).map(m => {
          const isDefault = m.hex === m.default;
          return (
            <div key={m.key} style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '7px 10px', borderRadius: '8px', background: '#f5f5f7',
            }}>
              <div style={{
                width: '18px', height: '18px', borderRadius: '50%', flexShrink: 0,
                background: m.hex, boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.25)',
              }} />
              <span style={{ fontSize: '13px', fontWeight: '600', color: '#1c1c1e' }}>{m.label}</span>
              <span style={{
                fontSize: '11px', color: '#8e8e93', fontFamily: 'SF Mono, Menlo, monospace',
                flex: 1,
              }}>{m.hex.toUpperCase()}</span>
              <button onClick={() => onEdit(m.hex, m.label, m.key)} style={{
                width: '24px', height: '24px', borderRadius: '6px', border: 'none',
                background: 'rgba(120,120,128,0.12)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8e8e93',
              }} title="编辑">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
              {!isDefault && (
                <button onClick={() => handleReset(m.key)} style={{
                  width: '24px', height: '24px', borderRadius: '6px', border: 'none',
                  background: 'rgba(120,120,128,0.12)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8e8e93',
                }} title="重置">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
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
                fontSize: '13px', fontFamily: 'SF Mono, Menlo, monospace',
                outline: 'none', color: '#1c1c1e', background: '#fafafa',
              }}
            />
            <input
              type="color"
              value={valid ? hex : '#007AFF'}
              onChange={(e) => setHex(e.target.value)}
              style={{
                width: '34px', height: '34px', borderRadius: '8px',
                border: '1px solid #e5e5ea', cursor: 'pointer', padding: 0,
                background: 'none',
              }}
            />
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

function InviteCodesTab({ invites, newCode, busy, copied, onCreate, onDisable, onCopy }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Generate button */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px', borderRadius: '12px', background: '#f5f5f7'
      }}>
        <div style={{ fontSize: '13px', color: '#1c1c1e' }}>
          生成新的一次性邀请码，分享给朋友注册
        </div>
        <button onClick={onCreate} disabled={busy} style={{
          padding: '9px 18px', borderRadius: '8px', background: busy ? '#ccc' : 'var(--s-main)',
          color: '#fff', border: 'none', fontWeight: '600', fontSize: '13px',
          cursor: busy ? 'not-allowed' : 'pointer',
          boxShadow: busy ? 'none' : '0 1px 3px rgba(var(--s-rgb),0.3)',
          transition: 'all 0.15s'
        }}>{busy ? '生成中...' : '+ 生成邀请码'}</button>
      </div>

      {/* New code display */}
      {newCode && (
        <div style={{
          padding: '18px', borderRadius: '12px', background: '#EDFAF1',
          border: '1.5px solid #34C759'
        }}>
          <div style={{ fontSize: '12px', color: '#34C759', fontWeight: '600', marginBottom: '10px' }}>
            ✨ 新邀请码（仅一次有效）
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <code style={{
              fontSize: '24px', fontWeight: '700', color: '#1c1c1e',
              letterSpacing: '4px', fontFamily: 'SF Mono, Menlo, monospace'
            }}>{newCode}</code>
            <button onClick={() => onCopy(newCode)} style={{
              padding: '6px 14px', borderRadius: '8px', background: '#fff',
              border: '1px solid #34C759', color: '#34C759',
              fontSize: '12px', fontWeight: '600', cursor: 'pointer',
              transition: 'all 0.15s'
            }}>{copied === newCode ? '✓ 已复制' : '复制'}</button>
          </div>
        </div>
      )}

      {/* History list */}
      <div>
        <div style={{ fontSize: '13px', fontWeight: '600', color: '#1c1c1e', marginBottom: '12px' }}>
          邀请码历史（{invites.length}）
        </div>
        {invites.length === 0 ? (
          <div style={{ 
            textAlign: 'center', 
            padding: '40px 20px', 
            color: '#8e8e93', 
            fontSize: '13px',
            background: '#f5f5f7',
            borderRadius: '10px'
          }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>📋</div>
            暂无邀请码记录
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {invites.map(c => {
              const isUsed = c.is_used;
              const isDisabled = c.is_disabled;
              const statusLabel = isDisabled ? '已禁用' : isUsed ? '已使用' : '未使用';
              const statusColor = isDisabled ? '#8e8e93' : isUsed ? '#007AFF' : '#34C759';
              return (
                <div key={c.id} style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '12px 14px', borderRadius: '10px', background: '#f5f5f7',
                  fontSize: '13px',
                  transition: 'background 0.15s'
                }}>
                  <code style={{
                    fontFamily: 'SF Mono, Menlo, monospace', fontWeight: '600', color: '#1c1c1e',
                    minWidth: '100px', fontSize: '13px'
                  }}>{c.code}</code>
                  <span style={{
                    fontSize: '11px', color: '#fff', padding: '3px 10px',
                    borderRadius: '10px', background: statusColor,
                    fontWeight: '500'
                  }}>{statusLabel}</span>
                  {c.used_by_email && (
                    <span style={{ fontSize: '12px', color: '#8e8e93', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      → {c.used_by_email}
                    </span>
                  )}
                  <span style={{ fontSize: '12px', color: '#8e8e93' }}>
                    {new Date(c.created_at).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {!isUsed && !isDisabled && (
                    <button onClick={() => onDisable(c.id)} style={{
                      padding: '5px 12px', borderRadius: '7px', border: 'none',
                      background: 'rgba(255,59,48,0.1)', color: '#FF3B30',
                      fontSize: '12px', fontWeight: '600', cursor: 'pointer',
                      transition: 'all 0.15s'
                    }}>禁用</button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function UsersTab({ users, busy, onBan, onUnban }) {
  return (
    <div>
      <div style={{ fontSize: '13px', fontWeight: '600', color: '#1c1c1e', marginBottom: '12px' }}>
        注册用户列表（{users.length}）
      </div>
      {users.length === 0 ? (
        <div style={{ 
          textAlign: 'center', 
          padding: '40px 20px', 
          color: '#8e8e93', 
          fontSize: '13px',
          background: '#f5f5f7',
          borderRadius: '10px'
        }}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>👥</div>
          暂无注册用户
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {users.map(u => (
            <div key={u.user_id} style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              padding: '12px 14px', borderRadius: '10px',
              background: u.is_banned ? '#FFEEED' : '#f5f5f7',
              fontSize: '13px',
              transition: 'background 0.15s'
            }}>
              <div style={{
                width: '32px', height: '32px', borderRadius: '50%',
                background: u.is_banned ? '#8e8e93' : '#007AFF', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '13px', fontWeight: '600', flexShrink: 0
              }}>{(u.username || u.email || '?')[0].toUpperCase()}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: '500', color: '#1c1c1e' }}>{u.email}</div>
                <div style={{ fontSize: '12px', color: '#8e8e93' }}>
                  {u.username || '无昵称'} · 注册于 {new Date(u.created_at).toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' })}
                </div>
              </div>
              {u.is_banned ? (
                <>
                  <span style={{
                    fontSize: '11px', color: '#fff', padding: '3px 10px',
                    borderRadius: '10px', background: '#FF3B30', fontWeight: '500'
                  }}>已禁用</span>
                  <button onClick={() => onUnban(u.user_id)} disabled={busy} style={{
                    padding: '5px 12px', borderRadius: '7px', border: 'none',
                    background: 'rgba(52,199,89,0.1)', color: '#34C759',
                    fontSize: '12px', fontWeight: '600', cursor: busy ? 'not-allowed' : 'pointer',
                    transition: 'all 0.15s'
                  }}>解禁</button>
                </>
              ) : (
                <>
                  <span style={{
                    fontSize: '11px', color: '#fff', padding: '3px 10px',
                    borderRadius: '10px', background: '#34C759', fontWeight: '500'
                  }}>正常</span>
                  <button onClick={() => onBan(u.user_id)} disabled={busy} style={{
                    padding: '5px 12px', borderRadius: '7px', border: 'none',
                    background: 'rgba(255,59,48,0.1)', color: '#FF3B30',
                    fontSize: '12px', fontWeight: '600', cursor: busy ? 'not-allowed' : 'pointer',
                    transition: 'all 0.15s'
                  }}>禁用</button>
                </>
              )}
            </div>
          ))}
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