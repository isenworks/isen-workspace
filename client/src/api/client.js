import { supabase } from '../lib/supabase.js';

// ============================================================
// 环境开关：VITE_BACKEND
//   - 未设置 或 'supabase'（默认）：走 Supabase SDK，兼容旧部署
//   - 'pages-d1'：走 Cloudflare Pages Functions + D1（无 Egress 限制）
// ============================================================
const BACKEND = (import.meta.env.VITE_BACKEND || 'supabase').toLowerCase();
export const IS_D1_BACKEND = BACKEND === 'pages-d1';

// 单人用户 ID（与 Pages Functions 中 DEFAULT_USER_ID 保持一致）
const DEFAULT_USER_ID = '50f12e1e-d561-423e-a424-d07a21d00cf2';

// D1 模式下统一从 localStorage 取解锁 token（可选，未设解锁密码则为空字符串，服务端放行）
function unlockToken() {
  return localStorage.getItem('pw_unlock_token') || '';
}

// D1 模式：通用 fetch 包装
async function fetchPages(path, body = {}, method = 'POST') {
  const res = await fetch('/api' + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Unlock-Token': unlockToken(),
    },
    body: JSON.stringify(body),
  });
  let data;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok || data?.error) {
    const msg = data?.error || (data?.message) || `请求失败 (${res.status})`;
    if (res.status === 401) {
      localStorage.removeItem('pw_user');
      localStorage.removeItem('pw_unlock_token');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('pw:auth-expired'));
      }
      throw new Error('登录已过期，请重新登录');
    }
    throw new Error(msg);
  }
  return data;
}

// ============================================================
// Supabase 模式：兼容原有
// ============================================================
async function handleAuthErrorSB(error) {
  if (error?.code === 'PGRST301' || error?.code === 'JWT_EXPIRED' ||
      (error?.message || '').toLowerCase().includes('jwt') ||
      (error?.message || '').toLowerCase().includes('unauthorized') ||
      error?.status === 401) {
    try {
      await supabase.auth.signOut();
      localStorage.removeItem('pw_user');
    } catch {}
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('pw:auth-expired'));
    }
    throw new Error('登录已过期，请重新登录');
  }
}
function wrapSB(promise) {
  return promise.then(async ({ data, error }) => {
    if (error) {
      await handleAuthErrorSB(error);
      throw new Error(error.message || '请求失败');
    }
    return data;
  });
}
async function uidSB() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('未登录');
  return user.id;
}

// 习惯连续天数计算（前后端都实现一份，保持一致）
export function calcStreak(logs) {
  const doneDates = new Set((logs || []).filter(l => l.done).map(l => l.date));
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  let cursor = doneDates.has(today) ? today : yesterday;
  let streak = 0;
  while (doneDates.has(cursor)) {
    streak++;
    const d = new Date(cursor);
    d.setDate(d.getDate() - 1);
    cursor = d.toISOString().slice(0, 10);
  }
  return streak;
}

// ============================================================
// 导出 API 对象（两套实现二选一，组件无感）
// ============================================================
export const API = IS_D1_BACKEND
  ? buildD1API()
  : buildSupabaseAPI();

function buildD1API() {
  return {
    auth: {
      // 单人模式：没有「注册」，但保持接口兼容（直接登录）
      async register() {
        return { user: { id: DEFAULT_USER_ID }, session: null };
      },
      // 单人模式：密码匹配 Pages Functions 侧校验（若设置），否则免登录直进
      async login(email, password) {
        const res = await fetchPages('/auth/login', { email, password });
        localStorage.setItem('pw_unlock_token', res.token || '');
        localStorage.setItem('pw_user', JSON.stringify(res.user || { id: DEFAULT_USER_ID }));
        return { user: res.user || { id: DEFAULT_USER_ID }, session: null };
      },
      async me() {
        const res = await fetchPages('/auth/me');
        localStorage.setItem('pw_user', JSON.stringify(res.user));
        return res;
      },
      async updateMe({ avatar }) {
        return fetchPages('/auth/updateMe', { avatar });
      },
      async uploadAvatar(file) {
        // D1 模式：头像用 Base64 localStorage 存（单人够用，避免 Storage 依赖）
        if (!file.type.startsWith('image/')) throw new Error('请选择图片文件');
        if (file.size > 2 * 1024 * 1024) throw new Error('图片不能超过 2MB');
        const reader = new FileReader();
        const dataUrl = await new Promise((resolve, reject) => {
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        await fetchPages('/auth/updateMe', { avatar: dataUrl });
        const prev = JSON.parse(localStorage.getItem('pw_user') || '{}');
        localStorage.setItem('pw_user', JSON.stringify({ ...prev, avatar: dataUrl }));
        return { avatar: dataUrl };
      },
      async logout() {
        localStorage.removeItem('pw_user');
        localStorage.removeItem('pw_unlock_token');
        return { ok: true };
      },
    },

    schedules: {
      async list(params) { return fetchPages('/schedules/list', params || {}); },
      async create(data) { return fetchPages('/schedules/create', data); },
      async update(id, data) { return fetchPages('/schedules/update', { id, ...data }); },
      async remove(id) { return fetchPages('/schedules/remove', { id }); },
      async sync(date, items) { return fetchPages('/schedules/sync', { date, items }); },
    },

    tasks: {
      async list(params) { return fetchPages('/tasks/list', params || {}); },
      async create(data) { return fetchPages('/tasks/create', data); },
      async update(id, data) { return fetchPages('/tasks/update', { id, ...data }); },
      async remove(id) { return fetchPages('/tasks/remove', { id }); },
    },

    habits: {
      async list(params) { return fetchPages('/habits/list', params || {}); },
      async create(data) { return fetchPages('/habits/create', data); },
      async update(id, data) { return fetchPages('/habits/update', { id, ...data }); },
      async reorder(orderedIds) { return fetchPages('/habits/reorder', { orderedIds }); },
      async remove(id) { return fetchPages('/habits/remove', { id }); },
      async toggle(id, date, targetDone) { return fetchPages('/habits/toggle', { id, date, targetDone }); },
      async logSleep(habitId, date, payload) { return fetchPages('/habits/logSleep', { habitId, date, ...payload }); },
      async logCount(habitId, date, payload) { return fetchPages('/habits/logCount', { habitId, date, ...payload }); },
      async stats(from, to) { return fetchPages('/habits/stats', { from, to }); },
      async archivedList() { return fetchPages('/habits/archivedList'); },
      async archive(id) { return fetchPages('/habits/archive', { id }); },
      async restore(id) { return fetchPages('/habits/restore', { id }); },
    },

    fixedSchedules: {
      async list() { return fetchPages('/fixedSchedules/list'); },
      async create(data) { return fetchPages('/fixedSchedules/create', data); },
      async update(id, data) { return fetchPages('/fixedSchedules/update', { id, ...data }); },
      async remove(id) { return fetchPages('/fixedSchedules/remove', { id }); },
    },

    summaries: {
      async get(date) { return fetchPages('/summaries/get', { date }); },
      async range(from, to) { return fetchPages('/summaries/range', { from, to }); },
      async upsert(data) { return fetchPages('/summaries/upsert', data); },
      async remove(date) { return fetchPages('/summaries/remove', { date }); },
    },

    migrate: {
      async run(payload) { return fetchPages('/migrate', payload); },
    },

    // 单人模式：管理员功能接口返回空数组兼容
    inviteCodes: {
      async create() { return { code: 'DISABLED' }; },
      async list() { return { codes: [] }; },
      async disable() { return { ok: false }; },
      async reserve() { return { codeId: null }; },
      async link() { return { ok: false }; },
    },
    users: {
      async list() { return { users: [] }; },
      async ban() { return { ok: false }; },
      async unban() { return { ok: false }; },
    },
  };
}

function buildSupabaseAPI() {
  return {
    auth: {
      async register(email, password, { username, avatar } = {}) {
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: {
            data: {
              username: username || email.split('@')[0],
              avatar: avatar || (username || email.split('@')[0]).charAt(0).toUpperCase(),
            },
          },
        });
        if (error) throw new Error(error.message);
        return { user: data.user, session: data.session };
      },

      async login(email, password) {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw new Error(error.message);
        return { user: data.user, session: data.session };
      },

      async me() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('未登录');
        const { data: profile } = await supabase
          .from('ethan_profiles')
          .select('username, avatar, is_banned')
          .eq('id', user.id)
          .single();
        return {
          user: {
            id: user.id,
            email: user.email,
            username: profile?.username || user.user_metadata?.username || user.email.split('@')[0],
            avatar: profile?.avatar || user.user_metadata?.avatar || '',
            is_banned: profile?.is_banned || false,
          },
        };
      },

      async updateMe({ avatar }) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('未登录');
        const { error } = await supabase
          .from('ethan_profiles')
          .update({ avatar })
          .eq('id', user.id);
        if (error) throw new Error(error.message);
        return { user: { id: user.id, avatar } };
      },

      async uploadAvatar(file) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('未登录');
        if (!file.type.startsWith('image/')) throw new Error('请选择图片文件');
        if (file.size > 2 * 1024 * 1024) throw new Error('图片不能超过 2MB');
        const ext = file.name.split('.').pop() || 'png';
        const path = `${user.id}/avatar.${ext}`;
        const { data: oldFiles } = await supabase.storage
          .from('avatars').list(user.id, { prefix: 'avatar.' });
        if (oldFiles && oldFiles.length > 0) {
          await supabase.storage.from('avatars').remove(oldFiles.map(f => `${user.id}/${f.name}`));
        }
        const { data, error } = await supabase.storage
          .from('avatars').upload(path, file, { upsert: true });
        if (error) throw new Error(error.message);
        const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
        await supabase.from('ethan_profiles').update({ avatar: publicUrl }).eq('id', user.id);
        return { avatar: publicUrl };
      },

      async logout() {
        await supabase.auth.signOut();
      },
    },

    schedules: {
      async list(params) {
        let q = supabase.from('ethan_schedules').select('*');
        if (params?.from && params?.to) {
          q = q.gte('date', params.from).lte('date', params.to).order('date').order('start_time', { nullsFirst: false }).order('sort_order').order('id');
        } else if (params?.date) {
          q = q.eq('date', params.date).order('start_time', { nullsFirst: false }).order('sort_order').order('id');
        } else {
          q = q.order('date', { ascending: false }).order('id', { ascending: false }).limit(200);
        }
        const data = await wrapSB(q);
        return { schedules: data };
      },

      async create(data) {
        const userId = await uidSB();
        const cat = data.category !== undefined ? Number(data.category) : null;
        const syncIsKey = cat === null ? (data.is_key ? 1 : 0) : ((cat === 1 || cat === 2) ? 1 : 0);
        const finalCat = cat === null ? (syncIsKey ? 2 : 3) : cat;
        const base = {
          user_id: userId,
          title: data.title,
          // start_date 语义化：优先 start_date，其次兼容旧字段 data.date
          date: data.start_date || data.date,
          start_date: data.start_date || data.date,
          start_time: data.start_time || null, end_time: data.end_time || null,
          duration_min: data.duration_min || null,
          is_key: syncIsKey, category: finalCat, sort_order: data.sort_order || 0,
        };
        // end_date 可选：Supabase schema 若无该列会直接 insert 忽略；若有则生效
        if (data.end_date) base.end_date = data.end_date;
        const row = await wrapSB(supabase.from('ethan_schedules').insert(base).select().single());
        return { schedule: row };
      },

      async update(id, data) {
        const update = {};
        if (data.title !== undefined) update.title = data.title;
        if (data.date !== undefined || data.start_date !== undefined) {
          const start = data.start_date !== undefined ? data.start_date : data.date;
          if (start !== undefined) { update.date = start; update.start_date = start; }
        }
        if (data.start_time !== undefined) update.start_time = data.start_time || null;
        if (data.end_time !== undefined) update.end_time = data.end_time || null;
        if (data.duration_min !== undefined) update.duration_min = data.duration_min || null;
        if (data.end_date !== undefined) {
          update.end_date = data.end_date || null;
        }
        if (data.is_done !== undefined) update.is_done = data.is_done ? 1 : 0;
        if (data.sort_order !== undefined) update.sort_order = data.sort_order;
        if (data.category !== undefined) {
          update.category = Number(data.category);
          update.is_key = (update.category === 1 || update.category === 2) ? 1 : 0;
        }
        const row = await wrapSB(supabase.from('ethan_schedules').update(update).eq('id', id).select().single());
        return { schedule: row };
      },

      async remove(id) {
        await wrapSB(supabase.from('ethan_schedules').delete().eq('id', id));
        return { ok: true };
      },

      async sync(date, items) {
        const userId = await uidSB();
        await wrapSB(supabase.from('ethan_schedules').delete().eq('user_id', userId).eq('date', date));
        if (items.length > 0) {
          const rows = items.map((it, i) => {
            const cat = it.category !== undefined ? Number(it.category) : null;
            const syncIsKey = cat === null ? (it.is_key ? 1 : 0) : ((cat === 1 || cat === 2) ? 1 : 0);
            const finalCat = cat === null ? (syncIsKey ? 2 : 3) : cat;
            const row = {
              user_id: userId, title: it.title, date,
              start_date: it.start_date || date,
              start_time: it.start_time || null, end_time: it.end_time || null,
              duration_min: it.duration_min || null,
              is_key: syncIsKey, category: finalCat, is_done: it.is_done ? 1 : 0, sort_order: it.sort_order ?? i,
            };
            if (it.end_date) row.end_date = it.end_date;
            return row;
          });
          await wrapSB(supabase.from('ethan_schedules').insert(rows));
        }
        const data = await wrapSB(
          supabase.from('ethan_schedules').select('*').eq('user_id', userId).eq('date', date)
            .order('start_time', { nullsFirst: false }).order('sort_order').order('id')
        );
        return { schedules: data };
      },
    },

    tasks: {
      async list(params) {
        let q = supabase.from('ethan_tasks').select('*');
        if (params?.from && params?.to) {
          q = q.gte('date', params.from).lte('date', params.to).order('is_done').order('due_time', { nullsFirst: false }).order('sort_order').order('id');
        } else if (params?.date) {
          q = q.eq('date', params.date).order('is_done').order('due_time', { nullsFirst: false }).order('sort_order').order('id');
        } else {
          q = q.order('date', { ascending: false }).order('id', { ascending: false }).limit(200);
        }
        const data = await wrapSB(q);
        return { tasks: data };
      },

      async create(data) {
        const userId = await uidSB();
        const row = await wrapSB(supabase.from('ethan_tasks').insert({
          user_id: userId,
          title: data.title, date: data.date,
          priority: data.priority ?? 2, due_time: data.due_time || null, sort_order: data.sort_order || 0,
        }).select().single());
        return { task: row };
      },

      async update(id, data) {
        const update = {};
        if (data.title !== undefined) update.title = data.title;
        if (data.date !== undefined) update.date = data.date;
        if (data.priority !== undefined) update.priority = data.priority;
        if (data.due_time !== undefined) update.due_time = data.due_time || null;
        if (data.is_done !== undefined) update.is_done = data.is_done ? 1 : 0;
        if (data.sort_order !== undefined) update.sort_order = data.sort_order;
        const row = await wrapSB(supabase.from('ethan_tasks').update(update).eq('id', id).select().single());
        return { task: row };
      },

      async remove(id) {
        await wrapSB(supabase.from('ethan_tasks').delete().eq('id', id));
        return { ok: true };
      },
    },

    habits: {
      async list(params) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('未登录');
        const date = params?.date;
        const { data: habits, error } = await supabase
          .from('ethan_habits')
          .select('*')
          .eq('user_id', user.id)
          .eq('archived', 0)
          .order('sort_order').order('id');
        if (error) throw new Error(error.message);

        let logsByHabit = {};
        if (date) {
          const { data: dayLogs } = await supabase
            .from('ethan_habit_logs')
            .select('habit_id, done, sleep_start, sleep_end, wake_state, energy_state, mood_state, sleep_note, data_source, actual_value, note')
            .eq('user_id', user.id)
            .eq('date', date);
          (dayLogs || []).forEach(l => { logsByHabit[l.habit_id] = l; });
        }

        const { data: allLogRows } = await supabase
          .from('ethan_habit_logs')
          .select('habit_id, date, done')
          .eq('user_id', user.id)
          .order('date', { ascending: false });
        const logsByHabitFull = {};
        (allLogRows || []).forEach(l => {
          if (!logsByHabitFull[l.habit_id]) logsByHabitFull[l.habit_id] = [];
          logsByHabitFull[l.habit_id].push(l);
        });

        return {
          habits: habits.map(h => {
            const dayLog = date ? logsByHabit[h.id] : null;
            return {
              ...h,
              done_today: dayLog ? dayLog.done === 1 : null,
              ...(dayLog ? {
                sleep_start: dayLog.sleep_start,
                sleep_end: dayLog.sleep_end,
                wake_state: dayLog.wake_state,
                energy_state: dayLog.energy_state,
                mood_state: dayLog.mood_state,
                sleep_note: dayLog.sleep_note,
                data_source: dayLog.data_source,
                actual_value: dayLog.actual_value,
                log_note: dayLog.note,
              } : {}),
              streak: calcStreak(logsByHabitFull[h.id] || []),
            };
          }),
        };
      },

      async create(data) {
        const userId = await uidSB();
        const row = await wrapSB(supabase.from('ethan_habits').insert({
          user_id: userId,
          name: data.name, emoji: data.emoji || '✅', accent_color: data.accent_color || '#34C759',
          growth_type: data.growth_type || 'energy',
          target_time: data.target_time || null,
          start_time: data.start_time || data.target_time || null,
          end_time: data.end_time || null,
          duration_min: data.duration_min ? Number(data.duration_min) : null,
          sort_order: data.sort_order || 0,
          target_mode: data.target_mode || 'check',
          target_value: data.target_value ? Number(data.target_value) : null,
          target_unit: data.target_unit || null,
          streak_goal: data.streak_goal !== undefined ? (data.streak_goal ? Number(data.streak_goal) : null) : null,
          auto_log: data.auto_log !== undefined ? (data.auto_log ? 1 : 0) : 1,
        }).select().single());
        return { habit: row };
      },

      async update(id, data) {
        const update = {};
        if (data.name !== undefined) update.name = data.name;
        if (data.emoji !== undefined) update.emoji = data.emoji;
        if (data.accent_color !== undefined) update.accent_color = data.accent_color;
        if (data.growth_type !== undefined) update.growth_type = data.growth_type;
        if (data.target_time !== undefined) update.target_time = data.target_time || null;
        if (data.start_time !== undefined) update.start_time = data.start_time || null;
        if (data.end_time !== undefined) update.end_time = data.end_time || null;
        if (data.duration_min !== undefined) update.duration_min = data.duration_min || null;
        if (data.target_mode !== undefined) update.target_mode = data.target_mode || 'check';
        if (data.target_value !== undefined) update.target_value = data.target_value ? Number(data.target_value) : null;
        if (data.target_unit !== undefined) update.target_unit = data.target_unit || null;
        if (data.streak_goal !== undefined) update.streak_goal = data.streak_goal ? Number(data.streak_goal) : null;
        if (data.auto_log !== undefined) update.auto_log = data.auto_log ? 1 : 0;
        if (data.sort_order !== undefined) update.sort_order = data.sort_order;
        if (data.archived !== undefined) {
          update.archived = data.archived ? 1 : 0;
          update.updated_at = new Date().toISOString();
        }
        const row = await wrapSB(supabase.from('ethan_habits').update(update).eq('id', id).select().single());
        return { habit: row };
      },

      async reorder(orderedIds) {
        await Promise.all(orderedIds.map((id, i) =>
          wrapSB(supabase.from('ethan_habits').update({ sort_order: i }).eq('id', id))
        ));
        return { ok: true };
      },

      async remove(id) {
        await wrapSB(supabase.from('ethan_habits').delete().eq('id', id));
        return { ok: true };
      },

      async toggle(id, date, targetDone) {
        const userId = await uidSB();
        const today = date || new Date().toISOString().slice(0, 10);
        const { data: existing } = await supabase
          .from('ethan_habit_logs').select('*').eq('habit_id', id).eq('date', today).single();
        if (existing) {
          const done = targetDone !== undefined ? (targetDone ? 1 : 0) : (existing.done ? 0 : 1);
          await wrapSB(supabase.from('ethan_habit_logs').update({ done }).eq('id', existing.id));
          return { habit_id: id, date: today, done: !!done };
        } else {
          const wantDone = targetDone !== undefined ? (targetDone ? 1 : 0) : 1;
          if (wantDone !== 1) return { habit_id: id, date: today, done: false };
          await wrapSB(supabase.from('ethan_habit_logs').insert({
            habit_id: id, user_id: userId, date: today, done: 1,
          }));
          return { habit_id: id, date: today, done: true };
        }
      },

      async logSleep(habitId, date, { sleep_start, sleep_end, energy_state, mood_state, sleep_note }) {
        const userId = await uidSB();
        const today = date || new Date().toISOString().slice(0, 10);
        const { data: habit } = await supabase
          .from('ethan_habits').select('duration_min').eq('id', habitId).single();
        let actualMin = null;
        if (sleep_start && sleep_end) {
          const [sh, sm] = sleep_start.split(':').map(Number);
          const [eh, em] = sleep_end.split(':').map(Number);
          if (![sh, sm, eh, em].some(v => Number.isNaN(v))) {
            let d = (eh * 60 + em) - (sh * 60 + sm);
            if (d <= 0) d += 1440;
            actualMin = d;
          }
        }
        const targetMin = habit?.duration_min || 420;
        const done = actualMin != null && actualMin >= targetMin ? 1 : 0;
        const { data: existing } = await supabase
          .from('ethan_habit_logs').select('id').eq('habit_id', habitId).eq('date', today).single();
        const payload = {
          habit_id: habitId, user_id: userId, date: today, done,
          sleep_start: sleep_start || null, sleep_end: sleep_end || null,
          wake_state: null, energy_state: energy_state || null, mood_state: mood_state || null,
          sleep_note: sleep_note || null, data_source: 'manual',
        };
        if (existing) {
          await wrapSB(supabase.from('ethan_habit_logs').update(payload).eq('id', existing.id));
        } else {
          await wrapSB(supabase.from('ethan_habit_logs').insert(payload));
        }
        return { habit_id: habitId, date: today, done: !!done, actual_min: actualMin };
      },

      async logCount(habitId, date, { add_value, note }) {
        const userId = await uidSB();
        const today = date || new Date().toISOString().slice(0, 10);
        const { data: habit } = await supabase
          .from('ethan_habits').select('target_value, target_unit, target_mode').eq('id', habitId).single();
        const { data: existing } = await supabase
          .from('ethan_habit_logs').select('*').eq('habit_id', habitId).eq('date', today).single();
        const prevValue = Number(existing?.actual_value) || 0;
        const addVal = Number(add_value) || 0;
        const newValue = prevValue + addVal;
        const targetVal = Number(habit?.target_value) || 0;
        const done = targetVal > 0 && newValue >= targetVal ? 1 : (existing?.done ? 1 : 0);
        const payload = {
          habit_id: habitId, user_id: userId, date: today, done,
          actual_value: newValue,
          note: note || existing?.note || null,
        };
        if (existing) {
          await wrapSB(supabase.from('ethan_habit_logs').update(payload).eq('id', existing.id));
        } else {
          await wrapSB(supabase.from('ethan_habit_logs').insert(payload));
        }
        return { habit_id: habitId, date: today, done: !!done, actual_value: newValue, target_value: targetVal, target_unit: habit?.target_unit };
      },

      async stats(from, to) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('未登录');
        const { data: habits } = await supabase
          .from('ethan_habits').select('id').eq('user_id', user.id).eq('archived', 0);
        const stats = [];
        for (const h of habits || []) {
          const { data: rows } = await supabase
            .from('ethan_habit_logs').select('date, done')
            .eq('habit_id', h.id).gte('date', from).lte('date', to);
          const doneRows = (rows || []).filter(r => r.done);
          stats.push({
            habit_id: h.id,
            total_days: (rows || []).length,
            done_days: doneRows.length,
            dates: doneRows.map(r => r.date),
          });
        }
        return { stats };
      },

      async archivedList() {
        const { data, error } = await supabase
          .from('ethan_habits').select('*')
          .eq('archived', 1)
          .order('updated_at', { ascending: false }).order('id', { ascending: false });
        if (error) throw new Error(error.message);
        return { habits: data };
      },

      async archive(id) {
        await wrapSB(supabase.from('ethan_habits').update({ archived: 1, updated_at: new Date().toISOString() }).eq('id', id));
        return { ok: true };
      },

      async restore(id) {
        await wrapSB(supabase.from('ethan_habits').update({ archived: 0, updated_at: new Date().toISOString() }).eq('id', id));
        return { ok: true };
      },
    },

    fixedSchedules: {
      async list() {
        const userId = await uidSB();
        const data = await wrapSB(supabase
          .from('ethan_fixed_schedules').select('*')
          .eq('user_id', userId).order('sort_order').order('id'));
        return { fixedSchedules: data };
      },
      async create(data) {
        const userId = await uidSB();
        const row = await wrapSB(supabase.from('ethan_fixed_schedules').insert({
          user_id: userId,
          name: data.name, emoji: data.emoji || '📌',
          start_time: data.startTime, end_time: data.endTime,
          sort_order: data.sortOrder || 0,
        }).select().single());
        return { fixedSchedule: row };
      },
      async update(id, data) {
        const update = {};
        if (data.name !== undefined) update.name = data.name;
        if (data.emoji !== undefined) update.emoji = data.emoji;
        if (data.startTime !== undefined) update.start_time = data.startTime;
        if (data.endTime !== undefined) update.end_time = data.endTime;
        if (data.sortOrder !== undefined) update.sort_order = data.sortOrder;
        const row = await wrapSB(supabase
          .from('ethan_fixed_schedules').update(update).eq('id', id).select().single());
        return { fixedSchedule: row };
      },
      async remove(id) {
        await wrapSB(supabase.from('ethan_fixed_schedules').delete().eq('id', id));
        return { ok: true };
      },
    },

    summaries: {
      async get(date) {
        const { data, error } = await supabase
          .from('ethan_summaries').select('*').eq('date', date).single();
        if (error && error.code !== 'PGRST116') throw new Error(error.message);
        return { summary: data };
      },
      async range(from, to) {
        const data = await wrapSB(
          supabase.from('ethan_summaries').select('*').gte('date', from).lte('date', to).order('date', { ascending: false })
        );
        return { summaries: data };
      },
      async upsert(data) {
        const userId = await uidSB();
        const row = await wrapSB(supabase.from('ethan_summaries').upsert({
          user_id: userId,
          date: data.date, content: data.content, mood: data.mood || null,
          updated_at: new Date().toISOString(),
        }).eq('user_id', userId).eq('date', data.date).select().single());
        return { summary: row };
      },
      async remove(date) {
        await wrapSB(supabase.from('ethan_summaries').delete().eq('date', date));
        return { ok: true };
      },
    },

    inviteCodes: {
      async create() {
        const { data, error } = await supabase.rpc('create_invite_code');
        if (error) { await handleAuthErrorSB(error); throw new Error(error.message); }
        return { code: data };
      },
      async list() {
        const { data, error } = await supabase.rpc('admin_invite_codes');
        if (error) { await handleAuthErrorSB(error); throw new Error(error.message); }
        return { codes: data || [] };
      },
      async disable(id) {
        const { data, error } = await supabase.rpc('disable_invite_code', { p_code_id: id });
        if (error) { await handleAuthErrorSB(error); throw new Error(error.message); }
        return { ok: !!data };
      },
      async reserve(code) {
        const { data, error } = await supabase.rpc('reserve_invite_code', { p_code: code });
        if (error) { await handleAuthErrorSB(error); throw new Error(error.message); }
        return { codeId: data };
      },
      async link(codeId) {
        const { data, error } = await supabase.rpc('link_invite_user', { p_code_id: codeId });
        if (error) { await handleAuthErrorSB(error); throw new Error(error.message); }
        return { ok: !!data };
      },
    },

    users: {
      async list() {
        const { data, error } = await supabase.rpc('admin_all_users');
        if (error) { await handleAuthErrorSB(error); throw new Error(error.message); }
        return { users: data || [] };
      },
      async ban(userId) {
        const { data, error } = await supabase.rpc('ban_user', { p_user_id: userId });
        if (error) { await handleAuthErrorSB(error); throw new Error(error.message); }
        return { ok: !!data };
      },
      async unban(userId) {
        const { data, error } = await supabase.rpc('unban_user', { p_user_id: userId });
        if (error) { await handleAuthErrorSB(error); throw new Error(error.message); }
        return { ok: !!data };
      },
    },
  };
}
