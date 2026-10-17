import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { API } from '../api/client.js';

const AuthContext = createContext(null);

const USER_KEY = 'pw_user';
const UNLOCKED_KEY = 'pw_unlocked_v1'; // 已弃用（保留用于清理老版本缓存）
const TOKEN_KEY = 'pw_unlock_token';   // HMAC token（前端不改键名，兼容老用户 localStorage）
const DEFAULT_D1_USER = Object.freeze({
  id: '50f12e1e-d561-423e-a424-d07a21d00cf2',
  email: '',
  username: '',
  avatar: '',
  is_owner: false,
  is_banned: false,
});

function readCachedUser() {
  try {
    const cached = localStorage.getItem(USER_KEY);
    return cached ? JSON.parse(cached) : null;
  } catch { return null; }
}
function writeCachedUser(u) {
  if (!u) localStorage.removeItem(USER_KEY);
  else localStorage.setItem(USER_KEY, JSON.stringify(u));
}
function readToken() {
  try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}
function writeToken(t) {
  if (!t) localStorage.removeItem(TOKEN_KEY);
  else localStorage.setItem(TOKEN_KEY, String(t));
}

// 把后端返回的 user 字段统一规范化（兼容 0/1/'1' 等历史存储）
function normalizeUser(u) {
  if (!u) return null;
  return {
    ...DEFAULT_D1_USER,
    ...u,
    is_owner: u.is_owner === true || u.is_owner === 1 || u.is_owner === '1',
    is_banned: u.is_banned === true || u.is_banned === 1 || u.is_banned === '1',
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readCachedUser);
  const [loading, setLoading] = useState(true);

  // 启动态：调 /auth/me 校验后端用户是否仍存在
  //   双通道凭证（根治移动端「重开浏览器就掉登录」）：
  //   - 首选 X-Unlock-Token 头（localStorage 里的 token）
  //   - localStorage 没了（移动端浏览器/WebView 关闭时被清）→ 同源请求自动携带
  //     登录时服务端 Set-Cookie 的 HttpOnly Cookie（pw_token），服务端兜底认证
  //   - me 成功会回传 token → client.me() 重建 localStorage，静默恢复会话
  //   因此这里不再因「本地无 token」直接判死，始终调一次 /auth/me
  useEffect(() => {
    let mounted = true;
    // 清理旧版本遗留的解锁标记（新体系不再使用）
    try { localStorage.removeItem(UNLOCKED_KEY); } catch (_) {}

    (async () => {
      let cached = readCachedUser();
      // 防御：老版本 pw_user 可能没有 is_owner 字段（迁移遗留），强制去后端拉一次 /auth/me 补齐
      //       避免出现"明明是 owner，但本地缓存缺字段 → 设置弹窗看不到 invites/users"的情况
      if (cached && cached.id) {
        const normalized = normalizeUser(cached);
        if (cached.is_owner !== false && cached.is_owner !== 0 && cached.is_owner !== true) {
          cached = null; // 字段缺失 → 强制走后端 /me
        } else {
          cached = normalized;
          writeCachedUser(normalized);
        }
      }
      try {
        const me = await API.auth.me();
        const u = me?.user;
        if (u) {
          const normalized = normalizeUser(u);
          writeCachedUser(normalized);
          if (mounted) { setUser(normalized); setLoading(false); }
        } else {
          writeCachedUser(null);
          writeToken('');
          if (mounted) { setUser(null); setLoading(false); }
        }
      } catch (err) {
        // 网络/超时/5xx 等非认证错误：保留登录态（乐观恢复会话，飞书/Notion 同款策略）。
        //   之前这里「catch 一切错误都清 token」是移动端频繁掉登录的根因之一：
        //   弱网下 /auth/me 超时（fetchPages 抛 TypeError，无 status）被误判为认证失效，
        //   手机每次弱网启动都被强制重新登录。真正的 token 失效由 client.js 统一处理
        //   （401 → 清存储 + 广播 pw:auth-expired → 下方监听器置空用户），不会走到这里。
        if (cached && cached.id) {
          if (mounted) { setUser(cached); setLoading(false); }
        } else {
          // 本地连用户缓存都没有（极端情况）：token 保留，仅进登录页
          if (mounted) { setUser(null); setLoading(false); }
        }
      }
    })();

    // 响应 API 层主动发起的"登出"（如 401 时的 pw:auth-expired）
    const onAuthExpired = () => {
      writeCachedUser(null);
      writeToken('');
      if (mounted) setUser(null);
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('pw:auth-expired', onAuthExpired);
    }
    return () => {
      mounted = false;
      if (typeof window !== 'undefined') {
        window.removeEventListener('pw:auth-expired', onAuthExpired);
      }
    };
  }, []);

  // 登录
  const login = useCallback(async (email, password) => {
    const r = await API.auth.login(email, password);
    const u = r?.user;
    if (!u) throw new Error('登录失败：未返回用户信息');
    // token 已经由 client.js 的 login 接口写入 pw_unlock_token（这里再次兜底）
    if (r?.token) writeToken(r.token);
    const normalized = normalizeUser(u);
    writeCachedUser(normalized);
    setUser(normalized);
    return normalized;
  }, []);

  // 注册
  const register = useCallback(async (email, password, { username, avatar, inviteCode } = {}) => {
    const r = await API.auth.register(email, password, { username, avatar, inviteCode });
    const u = r?.user;
    if (!u) throw new Error('注册失败：未返回用户信息');
    if (r?.token) writeToken(r.token);
    const normalized = normalizeUser(u);
    writeCachedUser(normalized);
    setUser(normalized);
    return normalized;
  }, []);

  // 登出（必须走服务端清 HttpOnly Cookie，否则重开浏览器会被 Cookie 自动登回）
  const logout = useCallback(async () => {
    try { await API.auth.logout(); } catch (_) {}
    writeCachedUser(null);
    writeToken('');
    setUser(null);
  }, []);

  const updateUser = useCallback((patch) => {
    setUser(prev => {
      const next = { ...prev, ...patch };
      writeCachedUser(next);
      return next;
    });
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, register, logout, loading, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
