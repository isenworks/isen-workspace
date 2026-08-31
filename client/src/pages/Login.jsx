import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { API } from '../api/client.js';
import { IS_D1_BACKEND } from '../api/client.js';

export default function Login() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  // D1 模式：【临时关闭解锁锁】个人私用工作台 = 永远免密码直进
  //      needUnlock = false → 永远渲染下方「点击进入」自动登录按钮
  const [needUnlock, setNeedUnlock] = useState(false);
  useEffect(() => {
    if (!IS_D1_BACKEND) return;
    // 强制关闭：不管后端 /auth/login 是否存在、UNLOCK_PASSWORD_HASH 是否设置，一律视为无需解锁
    setNeedUnlock(false);
    // 顺便存一个空解锁 token，服务端未设密码时会放行
    try {
      localStorage.setItem('pw_unlock_token', '');
      const existing = localStorage.getItem('pw_user');
      if (!existing) {
        localStorage.setItem('pw_user', JSON.stringify({ id: '50f12e1e-d561-423e-a424-d07a21d00cf2' }));
      }
    } catch (_) {}
  }, []);

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setMsg('');
    setBusy(true);
    try {
      if (IS_D1_BACKEND) {
        await login('', password);
        return;
      }
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

  // ============================================================
  // D1 模式：单人解锁页（免邮箱 / 免注册）
  // ============================================================
  if (IS_D1_BACKEND) {
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

          <form onSubmit={submit} className="card p-6 space-y-4">
            {needUnlock ? (
              <>
                <div>
                  <label className="block text-xs text-ink-500 mb-1">解锁密码</label>
                  <input
                    className="input"
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="请输入解锁密码"
                    autoFocus
                  />
                </div>
                <p className="text-xs text-ink-400">
                  密码由部署者在 Cloudflare Pages Variables 中设置 `UNLOCK_PASSWORD_HASH`。
                </p>
              </>
            ) : (
              <p className="text-sm text-ink-600">
                当前未设置解锁密码，点击按钮直接进入工作台。
              </p>
            )}

            {err && (
              <div className="text-sm text-accent-red bg-accent-red/5 px-3 py-2 rounded-lg">{err}</div>
            )}

            <button type="submit" disabled={busy} className="btn-primary w-full py-2.5 disabled:opacity-50">
              {busy ? '进入中...' : (needUnlock ? '解 锁' : '进入工作台')}
            </button>
          </form>

          <p className="text-center text-xs text-ink-300 mt-6">
            数据存储于 Cloudflare D1 · 多设备同步 · Powered by Cloudflare Pages
          </p>
        </div>
      </div>
    );
  }

  // ============================================================
  // Supabase 模式：原有登录 / 注册
  // ============================================================
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
          <div className="flex bg-brand-50 rounded-lg p-1 mb-5 text-sm">
            <button
              type="button"
              onClick={() => { setMode('login'); setErr(''); setMsg(''); }}
              className={`flex-1 py-1.5 transition ${mode === 'login' ? 'bg-white shadow-sm text-brand-700 font-medium rounded-full' : 'text-ink-500 rounded-md'}`}
            >登录</button>
            <button
              type="button"
              onClick={() => { setMode('register'); setErr(''); setMsg(''); }}
              className={`flex-1 py-1.5 transition ${mode === 'register' ? 'bg-white shadow-sm text-brand-700 font-medium rounded-full' : 'text-ink-500 rounded-md'}`}
            >注册</button>
          </div>

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
                  <input className="input" value={inviteCode} onChange={e => setInviteCode(e.target.value)} placeholder="请输入邀请码" maxLength={20} />
                </div>
              </>
            )}

            {err && (
              <div className="text-sm text-accent-red bg-accent-red/5 px-3 py-2 rounded-lg">{err}</div>
            )}
            {msg && (
              <div className="text-sm text-accent-green bg-accent-green/5 px-3 py-2 rounded-lg">{msg}</div>
            )}

            <button type="submit" disabled={busy} className="btn-primary w-full py-2.5 disabled:opacity-50">
              {busy ? '处理中...' : (mode === 'login' ? '登 录' : '注 册')}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-ink-300 mt-6">
          数据云端存储，多设备同步 · Powered by Supabase
        </p>
      </div>
    </div>
  );
}
