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

  // 启动态：根据 token 调 /auth/me 校验后端用户是否仍存在
  //   - 有缓存 user 且有 token → 调 /auth/me 核对后端用户是否仍存在
  //   - 没有 token 或 me 返回 null → 清空，user=null 进入登录页
  useEffect(() => {
    let mounted = true;
    // 清理旧版本遗留的解锁标记（新体系不再使用）
    try { localStorage.removeItem(UNLOCKED_KEY); } catch (_) {}

    (async () => {
      const token = readToken();
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
      if (!token) {
        // 没有有效 token：不允许"默认进入"（多用户体系强制登录）
        writeCachedUser(null);
        if (mounted) { setUser(null); setLoading(false); }
        return;
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
        // 401 / 网络错误：清空登录态（避免死循环，下次进入登录）
        writeCachedUser(null);
        writeToken('');
        if (mounted) { setUser(null); setLoading(false); }
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

  // 登出
  const logout = useCallback(async () => {
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
