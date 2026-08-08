import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { API } from '../api/client.js';

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

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setMsg('');
    if (!email.trim()) return setErr('请输入邮箱');
    if (!password || password.length < 6) return setErr('密码至少 6 位');

    setBusy(true);
    try {
      if (mode === 'login') {
        await login(email.trim(), password);
      } else {
        // 注册流程：先预留邀请码
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

        // 执行注册
        const u = await register(email.trim(), password, {
          username: username.trim() || email.trim().split('@')[0],
        });

        // 注册成功后绑定邀请码使用者
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
              className={`flex-1 py-1.5 rounded-md transition ${mode === 'login' ? 'bg-white shadow-sm text-brand-700 font-medium' : 'text-ink-500'}`}
            >登录</button>
            <button
              type="button"
              onClick={() => { setMode('register'); setErr(''); setMsg(''); }}
              className={`flex-1 py-1.5 rounded-md transition ${mode === 'register' ? 'bg-white shadow-sm text-brand-700 font-medium' : 'text-ink-500'}`}
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
              <div className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{err}</div>
            )}
            {msg && (
              <div className="text-sm text-green-600 bg-green-50 px-3 py-2 rounded-lg">{msg}</div>
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
