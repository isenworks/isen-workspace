import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';
import { API } from '../api/client.js';

const AuthContext = createContext(null);

const USER_KEY = 'pw_user';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const cached = localStorage.getItem(USER_KEY);
      return cached ? JSON.parse(cached) : null;
    } catch { return null; }
  });
  const [loading, setLoading] = useState(true);

  // Supabase Auth 会话监听：自动处理登录/登出/token 刷新
  useEffect(() => {
    // 先检查当前会话
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
              localStorage.setItem(USER_KEY, JSON.stringify(r.user));
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

    // 监听认证状态变化（登录/登出/token 过期）
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
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
              localStorage.setItem(USER_KEY, JSON.stringify(r.user));
            }
          })
          .catch(() => {
            localStorage.removeItem(USER_KEY);
            setUser(null);
          });
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const login = useCallback(async (email, password) => {
    const r = await API.auth.login(email, password);
    const me = await API.auth.me();
    if (me.user.is_banned) {
      await API.auth.logout();
      localStorage.removeItem(USER_KEY);
      setUser(null);
      throw new Error('账号已被禁用，请联系管理员');
    }
    localStorage.setItem(USER_KEY, JSON.stringify(me.user));
    setUser(me.user);
    return me.user;
  }, []);

  const register = useCallback(async (email, password, { username, avatar } = {}) => {
    await API.auth.register(email, password, { username, avatar });
    // signUp 后 Supabase 可能需要邮箱确认（取决于项目配置）
    // 如果开启了邮箱确认，session 为 null，用户需先验证邮箱
    const me = await API.auth.me().catch(() => null);
    if (me) {
      localStorage.setItem(USER_KEY, JSON.stringify(me.user));
      setUser(me.user);
      return me.user;
    }
    return null;
  }, []);

  const logout = useCallback(async () => {
    await API.auth.logout();
    localStorage.removeItem(USER_KEY);
    setUser(null);
  }, []);

  const updateUser = useCallback((patch) => {
    setUser(prev => {
      const next = { ...prev, ...patch };
      localStorage.setItem(USER_KEY, JSON.stringify(next));
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
