import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { API } from '../api/client.js';
import { IS_D1_BACKEND } from '../api/client.js';

export default function Login() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState('login');          // login / register / bootstrap
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [bootstrapCode, setBootstrapCode] = useState('');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [modes, setModes] = useState({ ownerBootstrap: false, openRegister: false });

  // D1 模式：首次进入探测 modes（是否开放注册、是否有 bootstrap code）
  useEffect(() => {
    if (!IS_D1_BACKEND) return;
    (async () => {
      try {
        const res = await API.auth.login && typeof API.auth.login === 'function' ? null : null;
        // 直接 fetch /auth/login GET：API 封装里 auth.login 默认是 POST，这里走 fetchPages
        const r = await fetch('/api/auth/login', {
          method: 'GET',
          headers: { 'X-Unlock-Token': localStorage.getItem('pw_unlock_token') || '' },
        }).then(x => x.json()).catch(() => null);
        if (r && r.modes) setModes(r.modes);
      } catch (_) {}
    })();
  }, []);

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setMsg('');
    setBusy(true);
    try {
      // D1 模式：新多用户体系（邮箱+密码 登录/注册/bootstrapOwner）
      if (IS_D1_BACKEND) {
        if (mode === 'login') {
          if (!email.trim()) { setErr('请输入邮箱'); setBusy(false); return; }
          if (!password || password.length < 6) { setErr('密码至少 6 位'); setBusy(false); return; }
          await login(email.trim(), password);
          return;
        }
        if (mode === 'register') {
          if (!email.trim()) { setErr('请输入邮箱'); setBusy(false); return; }
          if (!password || password.length < 6) { setErr('密码至少 6 位'); setBusy(false); return; }
          if (!inviteCode.trim()) { setErr('请输入邀请码'); setBusy(false); return; }
          if (!modes.openRegister) { setErr('管理员暂未开放注册'); setBusy(false); return; }
          await register(email.trim(), password, {
            username: username.trim() || email.trim().split('@')[0],
            inviteCode: inviteCode.trim().toUpperCase(),
          });
          return;
        }
        if (mode === 'bootstrap') {
          if (!email.trim()) { setErr('请输入邮箱（作为 owner 账号邮箱，以后登录用）'); setBusy(false); return; }
          if (!password || password.length < 6) { setErr('密码至少 6 位'); setBusy(false); return; }
          if (!bootstrapCode.trim()) { setErr('请输入一次性初始化口令 BOOTSTRAP_OWNER_CODE'); setBusy(false); return; }
          const res = await fetch('/api/auth/bootstrapOwner', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Unlock-Token': localStorage.getItem('pw_unlock_token') || '',
            },
            body: JSON.stringify({
              bootstrap_code: bootstrapCode.trim(),
              email: email.trim().toLowerCase(),
              username: username.trim() || email.trim().split('@')[0],
              password: String(password),
            }),
          });
          const data = await res.json().catch(() => null);
          if (!res.ok || data?.error) throw new Error((data?.error) || `请求失败 (${res.status})`);
          if (data?.token) localStorage.setItem('pw_unlock_token', String(data.token));
          if (data?.user) localStorage.setItem('pw_user', JSON.stringify(data.user));
          // 完成后写入 React state（等同于 login 后的状态），下一轮 AuthProvider 自动识别 token 登录
          window.location.reload();
          return;
        }
        return;
      }

      // ====== Supabase 模式 ======
      if (!email.trim()) return setErr('请输入邮箱');
      if (!password || password.length < 6) return setErr('密码至少 6 位');
      if (mode === 'login') {
        await login(email.trim(), password);
      } else {
        if (!inviteCode.trim()) {
          setErr('请输入邀请码');
          setBusy(false);
          return;
        }
        const reserveResult = await API.inviteCodes.reserve(inviteCode.trim().toUpperCase());
        if (!reserveResult.codeId) {
          setErr('邀请码无效或已被使用');
          setBusy(false);
          return;
        }
        const codeId = reserveResult.codeId;
        const u = await register(email.trim(), password, {
          username: username.trim() || email.trim().split('@')[0],
        });
        await API.inviteCodes.link(codeId);
        if (!u) {
          setMsg('注册成功！请登录。');
          setMode('login');
        }
      }
    } catch (e) {
      setErr(e.message || '操作失败');
    } finally {
      setBusy(false);
    }
  }

  const tabs = (() => {
    const base = [{ key: 'login', label: '登录' }];
    if (IS_D1_BACKEND) {
      if (modes.openRegister) base.push({ key: 'register', label: '注册' });
      if (modes.ownerBootstrap) base.push({ key: 'bootstrap', label: '初始化管理员' });
    } else {
      base.push({ key: 'register', label: '注册' });
    }
    return base;
  })();

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-brand-50 via-white to-brand-100">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-brand-500 text-white text-2xl font-bold mb-3 shadow-card">
            ⌘
          </div>
          <h1 className="text-2xl font-semibold text-ink-900">个人工作台</h1>
          <p className="text-sm text-ink-500 mt-1">日程 · 任务 · 习惯 · 复盘，一站式管理</p>
        </div>

        <div className="card p-6">
          {tabs.length > 1 && (
            <div className="flex bg-brand-50 rounded-lg p-1 mb-5 text-sm">
              {tabs.map(t => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => { setMode(t.key); setErr(''); setMsg(''); }}
                  className={`flex-1 py-1.5 transition ${mode === t.key ? 'bg-white shadow-sm text-brand-700 font-medium rounded-full' : 'text-ink-500 rounded-md'}`}
                >{t.label}</button>
              ))}
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-xs text-ink-500 mb-1">邮箱</label>
              <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoFocus />
            </div>
            <div>
              <label className="block text-xs text-ink-500 mb-1">密码</label>
              <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="至少 6 位" />
            </div>
            {mode === 'register' && (
              <>
                <div>
                  <label className="block text-xs text-ink-500 mb-1">昵称（可选）</label>
                  <input className="input" value={username} onChange={e => setUsername(e.target.value)} placeholder="留空则用邮箱前缀" maxLength={20} />
                </div>
                <div>
                  <label className="block text-xs text-ink-500 mb-1">邀请码</label>
                  <input className="input" value={inviteCode} onChange={e => setInviteCode(e.target.value)} placeholder="请向管理员索取邀请码" maxLength={32} />
                </div>
              </>
            )}
            {mode === 'bootstrap' && (
              <>
                <div>
                  <label className="block text-xs text-ink-500 mb-1">昵称（可选）</label>
                  <input className="input" value={username} onChange={e => setUsername(e.target.value)} placeholder="留空则用邮箱前缀" maxLength={20} />
                </div>
                <div>
                  <label className="block text-xs text-ink-500 mb-1">一次性初始化口令 BOOTSTRAP_OWNER_CODE</label>
                  <input className="input" type="password" value={bootstrapCode} onChange={e => setBootstrapCode(e.target.value)} placeholder="在 Cloudflare Pages Secrets 中配置" maxLength={64} />
                  <p className="text-xs text-ink-400 mt-1 leading-relaxed">
                    仅当 ethan_users 为空时可用。成功后账号自动标记为 owner，并继承现有数据（习惯/日程…）。
                  </p>
                </div>
              </>
            )}

            {err && (
              <div className="text-sm text-accent-red bg-accent-red/5 px-3 py-2 rounded-lg">{err}</div>
            )}
            {msg && (
              <div className="text-sm text-accent-green bg-accent-green/5 px-3 py-2 rounded-lg">{msg}</div>
            )}
            {/* 非首次部署：已有 owner 但没有可用邀请码时，给登录 Tab 加一条友好说明，
                避免"为什么只有登录 Tab"的困惑。
                openRegister=false 会让注册 Tab 不显示，这里说明原因 + 让 owner 知道下一步该做什么。*/}
            {mode === 'login' && IS_D1_BACKEND && !modes.openRegister && !modes.ownerBootstrap && (
              <div className="text-xs text-ink-400 bg-ink-50 px-3 py-2 rounded-lg leading-relaxed">
                <b className="text-ink-600">💡 还没有可用邀请码</b>。
                管理员请先用邮箱登录，进入工作台 → 右上角 ⚙️ 设置 →
                <b className="text-ink-700">邀请码管理</b>生成邀请码后，注册入口会自动出现。
              </div>
            )}

            <button type="submit" disabled={busy} className="btn-primary w-full py-2.5 disabled:opacity-50">
              {busy ? '处理中...' : (mode === 'login' ? '登 录' : (mode === 'register' ? '注 册' : '创建管理员账号'))}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-ink-300 mt-6">
          {IS_D1_BACKEND
            ? '数据存储于 Cloudflare D1 · 多用户数据隔离 · Powered by Cloudflare Pages'
            : '数据云端存储，多设备同步 · Powered by Supabase'}
        </p>
      </div>
    </div>
  );
}
