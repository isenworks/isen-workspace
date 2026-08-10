import { supabase } from '../lib/supabase.js';

// 401/token 过期处理：登出并跳转到登录
async function handleAuthError(error) {
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

// 将 Supabase 错误转为友好消息
function wrap(promise) {
  return promise.then(async ({ data, error }) => {
    if (error) {
      await handleAuthError(error);
      throw new Error(error.message || '请求失败');
    }
    return data;
  });
}

// ============================================================
// Supabase API 层
// 保持 API 对象方法签名与旧版兼容，组件无需改动
// ============================================================

// 获取当前用户 ID（用于 insert 时设置 user_id）
async function uid() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('未登录');
  return user.id;
}

// 习惯连续天数计算（前端实现，替代后端循环）
function calcStreak(logs) {
  // logs: [{ date, done }] 按日期降序
  const doneDates = new Set(logs.filter(l => l.done).map(l => l.date));
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  // 今天还没打卡，从昨天开始算
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
// 导出 API 对象
// ============================================================
export const API = {
  auth: {
    // 注册：email + password，username/avatar 存入 user_metadata
    async register(email, password, { username, avatar } = {}) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username: username || email.split('@')[0],
            avatar: avatar || (username || email.split('@')[0]).charAt(0).toUpperCase(),
          },
        },
      });
      if (error) throw new Error(error.message);

      // 不再为新用户插入默认习惯，让习惯面板默认为空
      // 用户可自行创建自己的习惯

      return { user: data.user, session: data.session };
    },

    // 登录
    async login(email, password) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message);
      return { user: data.user, session: data.session };
    },

    // 当前用户信息
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

    // 更新头像
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

    // 上传头像到 Storage 并返回 URL
    async uploadAvatar(file) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('未登录');

      // 校验文件类型和大小
      if (!file.type.startsWith('image/')) throw new Error('请选择图片文件');
      if (file.size > 2 * 1024 * 1024) throw new Error('图片不能超过 2MB');

      const ext = file.name.split('.').pop() || 'png';
      const path = `${user.id}/avatar.${ext}`;

      // 删除旧头像（如果有）
      const { data: oldFiles } = await supabase.storage
        .from('avatars')
        .list(user.id, { prefix: 'avatar.' });

      if (oldFiles && oldFiles.length > 0) {
        await supabase.storage.from('avatars').remove(oldFiles.map(f => `${user.id}/${f.name}`));
      }

      // 上传新头像
      const { data, error } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true });

      if (error) throw new Error(error.message);

      // 获取公开 URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(path);

      // 更新 profile 表中的 avatar 字段
      await supabase
        .from('ethan_profiles')
        .update({ avatar: publicUrl })
        .eq('id', user.id);

      return { avatar: publicUrl };
    },

    // 登出
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
      const data = await wrap(q);
      return { schedules: data };
    },

    async create(data) {
      const userId = await uid();
      const cat = data.category !== undefined ? Number(data.category) : null;
      const syncIsKey = cat === null ? (data.is_key ? 1 : 0) : ((cat === 1 || cat === 2) ? 1 : 0);
      const finalCat = cat === null ? (syncIsKey ? 2 : 3) : cat;
      const row = await wrap(supabase.from('ethan_schedules').insert({
        user_id: userId,
        title: data.title, date: data.date,
        start_time: data.start_time || null, end_time: data.end_time || null,
        duration_min: data.duration_min || null,
        is_key: syncIsKey, category: finalCat, sort_order: data.sort_order || 0,
      }).select().single());
      return { schedule: row };
    },

    async update(id, data) {
      const update = {};
      if (data.title !== undefined) update.title = data.title;
      if (data.date !== undefined) update.date = data.date;
      if (data.start_time !== undefined) update.start_time = data.start_time || null;
      if (data.end_time !== undefined) update.end_time = data.end_time || null;
      if (data.duration_min !== undefined) update.duration_min = data.duration_min || null;
      if (data.is_done !== undefined) update.is_done = data.is_done ? 1 : 0;
      if (data.sort_order !== undefined) update.sort_order = data.sort_order;
      if (data.category !== undefined) {
        update.category = Number(data.category);
        update.is_key = (update.category === 1 || update.category === 2) ? 1 : 0;
      }
      const row = await wrap(supabase.from('ethan_schedules').update(update).eq('id', id).select().single());
      return { schedule: row };
    },

    async remove(id) {
      await wrap(supabase.from('ethan_schedules').delete().eq('id', id));
      return { ok: true };
    },

    async sync(date, items) {
      const userId = await uid();
      await wrap(supabase.from('ethan_schedules').delete().eq('user_id', userId).eq('date', date));
      if (items.length > 0) {
        const rows = items.map((it, i) => {
          const cat = it.category !== undefined ? Number(it.category) : null;
          const syncIsKey = cat === null ? (it.is_key ? 1 : 0) : ((cat === 1 || cat === 2) ? 1 : 0);
          const finalCat = cat === null ? (syncIsKey ? 2 : 3) : cat;
          return {
            user_id: userId, title: it.title, date,
            start_time: it.start_time || null, end_time: it.end_time || null,
            duration_min: it.duration_min || null,
            is_key: syncIsKey, category: finalCat, is_done: it.is_done ? 1 : 0, sort_order: it.sort_order ?? i,
          };
        });
        await wrap(supabase.from('ethan_schedules').insert(rows));
      }
      const data = await wrap(
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
      const data = await wrap(q);
      return { tasks: data };
    },

    async create(data) {
      const userId = await uid();
      const row = await wrap(supabase.from('ethan_tasks').insert({
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
      const row = await wrap(supabase.from('ethan_tasks').update(update).eq('id', id).select().single());
      return { task: row };
    },

    async remove(id) {
      await wrap(supabase.from('ethan_tasks').delete().eq('id', id));
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
        .order('sort_order')
        .order('id');
      if (error) throw new Error(error.message);

      // 如果有 date 参数，查当天打卡状态
      let logsByHabit = {};
      let allLogs = [];
      if (date) {
        const { data: dayLogs } = await supabase
          .from('ethan_habit_logs')
          .select('habit_id, done, sleep_start, sleep_end, wake_state, sleep_note, data_source')
          .eq('user_id', user.id)
          .eq('date', date);
        (dayLogs || []).forEach(l => { logsByHabit[l.habit_id] = l; });
      }

      // 查所有打卡记录用于计算 streak
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
              sleep_note: dayLog.sleep_note,
              data_source: dayLog.data_source,
            } : {}),
            streak: calcStreak(logsByHabitFull[h.id] || []),
          };
        }),
      };
    },

    async create(data) {
      const userId = await uid();
      const row = await wrap(supabase.from('ethan_habits').insert({
        user_id: userId,
        name: data.name, emoji: data.emoji || '✅', accent_color: data.accent_color || '#34c759',
        growth_type: data.growth_type || 'energy',
        target_time: data.target_time || null,
        start_time: data.start_time || data.target_time || null,
        end_time: data.end_time || null,
        duration_min: data.duration_min ? Number(data.duration_min) : null,
        sort_order: data.sort_order || 0,
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
      if (data.sort_order !== undefined) update.sort_order = data.sort_order;
      if (data.archived !== undefined) {
        update.archived = data.archived ? 1 : 0;
        update.updated_at = new Date().toISOString();
      }
      const row = await wrap(supabase.from('ethan_habits').update(update).eq('id', id).select().single());
      return { habit: row };
    },

    // 批量重排序：orderedIds 为期望的全局顺序，按此顺序赋 sort_order 0,1,2...
    async reorder(orderedIds) {
      await Promise.all(orderedIds.map((id, i) =>
        wrap(supabase.from('ethan_habits').update({ sort_order: i }).eq('id', id))
      ));
      return { ok: true };
    },

    async remove(id) {
      await wrap(supabase.from('ethan_habits').delete().eq('id', id));
      return { ok: true };
    },

    // 打卡/取消打卡
    // targetDone: 可选，传 0/1 表示明确要改成的目标状态；不传则按已有记录翻转
    async toggle(id, date, targetDone) {
      const userId = await uid();
      const today = date || new Date().toISOString().slice(0, 10);
      const { data: existing } = await supabase
        .from('ethan_habit_logs')
        .select('*')
        .eq('habit_id', id)
        .eq('date', today)
        .single();

      if (existing) {
        const done = targetDone !== undefined ? (targetDone ? 1 : 0) : (existing.done ? 0 : 1);
        await wrap(supabase.from('ethan_habit_logs').update({ done }).eq('id', existing.id));
        return { habit_id: id, date: today, done: !!done };
      } else {
        // 没有当天记录：只有目标是打卡（或未传 targetDone 保持旧兼容）时才插入
        const wantDone = targetDone !== undefined ? (targetDone ? 1 : 0) : 1;
        if (wantDone !== 1) {
          return { habit_id: id, date: today, done: false };
        }
        await wrap(supabase.from('ethan_habit_logs').insert({
          habit_id: id, user_id: userId, date: today, done: 1,
        }));
        return { habit_id: id, date: today, done: true };
      }
    },

    // 睡眠记录：记录实际入睡/起床时间 + 醒后状态，自动判定 done
    async logSleep(habitId, date, { sleep_start, sleep_end, wake_state, sleep_note }) {
      const userId = await uid();
      const today = date || new Date().toISOString().slice(0, 10);

      // 查 habit 的目标时长
      const { data: habit } = await supabase
        .from('ethan_habits')
        .select('duration_min')
        .eq('id', habitId)
        .single();

      // 计算实际睡眠时长（跨午夜补偿）
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

      // 自动判定 done：达到目标时长则打勾
      const targetMin = habit?.duration_min || 420;
      const done = actualMin != null && actualMin >= targetMin ? 1 : 0;

      // Upsert
      const { data: existing } = await supabase
        .from('ethan_habit_logs')
        .select('id')
        .eq('habit_id', habitId)
        .eq('date', today)
        .single();

      const payload = {
        habit_id: habitId,
        user_id: userId,
        date: today,
        done,
        sleep_start: sleep_start || null,
        sleep_end: sleep_end || null,
        wake_state: wake_state || null,
        sleep_note: sleep_note || null,
        data_source: 'manual',
      };

      if (existing) {
        await wrap(supabase.from('ethan_habit_logs').update(payload).eq('id', existing.id));
      } else {
        await wrap(supabase.from('ethan_habit_logs').insert(payload));
      }

      return { habit_id: habitId, date: today, done: !!done, actual_min: actualMin };
    },

    // 月度统计
    async stats(from, to) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('未登录');
      const { data: habits } = await supabase
        .from('ethan_habits')
        .select('id')
        .eq('user_id', user.id)
        .eq('archived', 0);

      const stats = [];
      for (const h of habits || []) {
        const { data: rows } = await supabase
          .from('ethan_habit_logs')
          .select('date, done')
          .eq('habit_id', h.id)
          .gte('date', from)
          .lte('date', to);
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

    // 归档列表
    async archivedList() {
      const { data, error } = await supabase
        .from('ethan_habits')
        .select('*')
        .eq('archived', 1)
        .order('updated_at', { ascending: false })
        .order('id', { ascending: false });
      if (error) throw new Error(error.message);
      return { habits: data };
    },

    // 归档
    async archive(id) {
      await wrap(supabase.from('ethan_habits').update({ archived: 1, updated_at: new Date().toISOString() }).eq('id', id));
      return { ok: true };
    },

    // 恢复
    async restore(id) {
      await wrap(supabase.from('ethan_habits').update({ archived: 0, updated_at: new Date().toISOString() }).eq('id', id));
      return { ok: true };
    },

    // 彻底删除
    async remove(id) {
      await wrap(supabase.from('ethan_habits').delete().eq('id', id));
      return { ok: true };
    },
  },

  summaries: {
    async get(date) {
      const { data, error } = await supabase
        .from('ethan_summaries')
        .select('*')
        .eq('date', date)
        .single();
      if (error && error.code !== 'PGRST116') throw new Error(error.message);
      return { summary: data };
    },

    async range(from, to) {
      const data = await wrap(
        supabase.from('ethan_summaries').select('*').gte('date', from).lte('date', to).order('date', { ascending: false })
      );
      return { summaries: data };
    },

    async upsert(data) {
      const userId = await uid();
      const row = await wrap(supabase.from('ethan_summaries').upsert({
        user_id: userId,
        date: data.date, content: data.content, mood: data.mood || null,
        updated_at: new Date().toISOString(),
      }).eq('user_id', userId).eq('date', data.date).select().single());
      return { summary: row };
    },

    async remove(date) {
      await wrap(supabase.from('ethan_summaries').delete().eq('date', date));
      return { ok: true };
    },
  },

  // 邀请码管理
  inviteCodes: {
    async create() {
      const { data, error } = await supabase.rpc('create_invite_code');
      if (error) { await handleAuthError(error); throw new Error(error.message); }
      return { code: data };
    },

    async list() {
      const { data, error } = await supabase.rpc('admin_invite_codes');
      if (error) { await handleAuthError(error); throw new Error(error.message); }
      return { codes: data || [] };
    },

    async disable(id) {
      const { data, error } = await supabase.rpc('disable_invite_code', { p_code_id: id });
      if (error) { await handleAuthError(error); throw new Error(error.message); }
      return { ok: !!data };
    },

    async reserve(code) {
      const { data, error } = await supabase.rpc('reserve_invite_code', { p_code: code });
      if (error) { await handleAuthError(error); throw new Error(error.message); }
      return { codeId: data };
    },

    async link(codeId) {
      const { data, error } = await supabase.rpc('link_invite_user', { p_code_id: codeId });
      if (error) { await handleAuthError(error); throw new Error(error.message); }
      return { ok: !!data };
    },
  },

  // 用户管理
  users: {
    async list() {
      const { data, error } = await supabase.rpc('admin_all_users');
      if (error) { await handleAuthError(error); throw new Error(error.message); }
      return { users: data || [] };
    },

    async ban(userId) {
      const { data, error } = await supabase.rpc('ban_user', { p_user_id: userId });
      if (error) { await handleAuthError(error); throw new Error(error.message); }
      return { ok: !!data };
    },

    async unban(userId) {
      const { data, error } = await supabase.rpc('unban_user', { p_user_id: userId });
      if (error) { await handleAuthError(error); throw new Error(error.message); }
      return { ok: !!data };
    },
  },
};
