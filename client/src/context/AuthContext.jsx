import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';
import { API, IS_D1_BACKEND } from '../api/client.js';

const AuthContext = createContext(null);

const USER_KEY = 'pw_user';
const UNLOCKED_KEY = 'pw_unlocked_v1'; // D1 模式：本地解锁标记
const DEFAULT_D1_USER = Object.freeze({
  id: '50f12e1e-d561-423e-a424-d07a21d00cf2',
  email: '1429000825@qq.com',
  username: 'Ethan',
  avatar: '',
  is_banned: false,
});

function readCachedUser() {
  try {
    const cached = localStorage.getItem(USER_KEY);
    return cached ? JSON.parse(cached) : null;
  } catch { return null; }
}
function writeCachedUser(u) {
  localStorage.setItem(USER_KEY, JSON.stringify(u));
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readCachedUser);
  const [loading, setLoading] = useState(true);

  // ------------------------------------------------------------
  // D1 模式：本地单人解锁（无 Supabase Auth）
  // ------------------------------------------------------------
  useEffect(() => {
    if (!IS_D1_BACKEND) return;
    let mounted = true;

    (async () => {
      const cached = readCachedUser();
      const unlocked = localStorage.getItem(UNLOCKED_KEY) === '1';
      // 若有缓存用户，或者未设置解锁密码（默认免登录），直接进入
      if (cached || unlocked) {
        const u = cached || { ...DEFAULT_D1_USER };
        writeCachedUser(u);
        if (mounted) {
          setUser(u);
          setLoading(false);
        }
        return;
      }
      // 询问后端是否设置了解锁密码（没有则直接放行）
      try {
        const res = await API.auth.login('', '');
        if (res?.user) {
          writeCachedUser(res.user);
          localStorage.setItem(UNLOCKED_KEY, '1');
          if (mounted) setUser(res.user);
        }
      } catch {
        // 后端提示需要解锁密码：保持 user=null，loading=false
      }
      if (mounted) setLoading(false);
    })();

    return () => { mounted = false; };
  }, []);

  // ------------------------------------------------------------
  // Supabase 模式：保持原有会话监听逻辑
  // ------------------------------------------------------------
  useEffect(() => {
    if (IS_D1_BACKEND) return;

    let subscription;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        API.auth.me()
          .then(r => {
            if (r.user.is_banned) {
              API.auth.logout();
              localStorage.removeItem(USER_KEY);
              setUser(null);
            } else {
              setUser(r.user);
              writeCachedUser(r.user);
            }
          })
          .catch(() => {
            localStorage.removeItem(USER_KEY);
            setUser(null);
          })
          .finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const setup = async () => {
      const d = await supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT' || !session) {
          localStorage.removeItem(USER_KEY);
          setUser(null);
        } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          API.auth.me()
            .then(r => {
              if (r.user.is_banned) {
                API.auth.logout();
                localStorage.removeItem(USER_KEY);
                setUser(null);
              } else {
                setUser(r.user);
                writeCachedUser(r.user);
              }
            })
            .catch(() => {
              localStorage.removeItem(USER_KEY);
              setUser(null);
            });
        }
      });
      subscription = d.data.subscription;
    };
    setup();

    return () => subscription?.unsubscribe?.();
  }, []);

  // 登录
  const login = useCallback(async (email, password) => {
    const r = await API.auth.login(email, password);
    if (IS_D1_BACKEND) {
      const u = r?.user || { ...DEFAULT_D1_USER };
      writeCachedUser(u);
      localStorage.setItem(UNLOCKED_KEY, '1');
      setUser(u);
      return u;
    }
    const me = await API.auth.me();
    if (me.user.is_banned) {
      await API.auth.logout();
      localStorage.removeItem(USER_KEY);
      setUser(null);
      throw new Error('账号已被禁用，请联系管理员');
    }
    writeCachedUser(me.user);
    setUser(me.user);
    return me.user;
  }, []);

  // 注册（D1 模式：接口兼容，直接 setUser）
  const register = useCallback(async (email, password, { username, avatar } = {}) => {
    if (IS_D1_BACKEND) {
      const u = { ...DEFAULT_D1_USER, username: username || DEFAULT_D1_USER.username, avatar: avatar || DEFAULT_D1_USER.avatar };
      writeCachedUser(u);
      localStorage.setItem(UNLOCKED_KEY, '1');
      setUser(u);
      return u;
    }
    await API.auth.register(email, password, { username, avatar });
    const me = await API.auth.me().catch(() => null);
    if (me) {
      writeCachedUser(me.user);
      setUser(me.user);
      return me.user;
    }
    return null;
  }, []);

  // 登出
  const logout = useCallback(async () => {
    if (IS_D1_BACKEND) {
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem(UNLOCKED_KEY);
      setUser(null);
      return;
    }
    await API.auth.logout();
    localStorage.removeItem(USER_KEY);
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
