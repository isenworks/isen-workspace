-- ============================================================
-- 安全补丁：确保所有业务表已启用 RLS 并存在正确的行级策略
-- 幂等设计：重复执行不会报错；缺什么补什么
-- 在 Supabase Dashboard → SQL Editor 中执行
-- ============================================================

-- 1. ethan_profiles
alter table public.ethan_profiles enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'ethan_profiles' and policyname = 'ethan_profiles_select_own') then
    create policy "ethan_profiles_select_own" on public.ethan_profiles for select using (auth.uid() = id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'ethan_profiles' and policyname = 'ethan_profiles_insert_own') then
    create policy "ethan_profiles_insert_own" on public.ethan_profiles for insert with check (auth.uid() = id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'ethan_profiles' and policyname = 'ethan_profiles_update_own') then
    create policy "ethan_profiles_update_own" on public.ethan_profiles for update using (auth.uid() = id);
  end if;
end $$;

-- 2. ethan_schedules
alter table public.ethan_schedules enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'ethan_schedules' and policyname = 'ethan_schedules_select_own') then
    create policy "ethan_schedules_select_own" on public.ethan_schedules for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'ethan_schedules' and policyname = 'ethan_schedules_insert_own') then
    create policy "ethan_schedules_insert_own" on public.ethan_schedules for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'ethan_schedules' and policyname = 'ethan_schedules_update_own') then
    create policy "ethan_schedules_update_own" on public.ethan_schedules for update using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'ethan_schedules' and policyname = 'ethan_schedules_delete_own') then
    create policy "ethan_schedules_delete_own" on public.ethan_schedules for delete using (auth.uid() = user_id);
  end if;
end $$;

-- 3. ethan_tasks
alter table public.ethan_tasks enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'ethan_tasks' and policyname = 'ethan_tasks_select_own') then
    create policy "ethan_tasks_select_own" on public.ethan_tasks for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'ethan_tasks' and policyname = 'ethan_tasks_insert_own') then
    create policy "ethan_tasks_insert_own" on public.ethan_tasks for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'ethan_tasks' and policyname = 'ethan_tasks_update_own') then
    create policy "ethan_tasks_update_own" on public.ethan_tasks for update using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'ethan_tasks' and policyname = 'ethan_tasks_delete_own') then
    create policy "ethan_tasks_delete_own" on public.ethan_tasks for delete using (auth.uid() = user_id);
  end if;
end $$;

-- 4. ethan_habits
alter table public.ethan_habits enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'ethan_habits' and policyname = 'ethan_habits_select_own') then
    create policy "ethan_habits_select_own" on public.ethan_habits for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'ethan_habits' and policyname = 'ethan_habits_insert_own') then
    create policy "ethan_habits_insert_own" on public.ethan_habits for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'ethan_habits' and policyname = 'ethan_habits_update_own') then
    create policy "ethan_habits_update_own" on public.ethan_habits for update using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'ethan_habits' and policyname = 'ethan_habits_delete_own') then
    create policy "ethan_habits_delete_own" on public.ethan_habits for delete using (auth.uid() = user_id);
  end if;
end $$;

-- 5. ethan_habit_logs
alter table public.ethan_habit_logs enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'ethan_habit_logs' and policyname = 'ethan_habit_logs_select_own') then
    create policy "ethan_habit_logs_select_own" on public.ethan_habit_logs for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'ethan_habit_logs' and policyname = 'ethan_habit_logs_insert_own') then
    create policy "ethan_habit_logs_insert_own" on public.ethan_habit_logs for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'ethan_habit_logs' and policyname = 'ethan_habit_logs_update_own') then
    create policy "ethan_habit_logs_update_own" on public.ethan_habit_logs for update using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'ethan_habit_logs' and policyname = 'ethan_habit_logs_delete_own') then
    create policy "ethan_habit_logs_delete_own" on public.ethan_habit_logs for delete using (auth.uid() = user_id);
  end if;
end $$;

-- 6. ethan_summaries
alter table public.ethan_summaries enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'ethan_summaries' and policyname = 'ethan_summaries_select_own') then
    create policy "ethan_summaries_select_own" on public.ethan_summaries for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'ethan_summaries' and policyname = 'ethan_summaries_insert_own') then
    create policy "ethan_summaries_insert_own" on public.ethan_summaries for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'ethan_summaries' and policyname = 'ethan_summaries_update_own') then
    create policy "ethan_summaries_update_own" on public.ethan_summaries for update using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'ethan_summaries' and policyname = 'ethan_summaries_delete_own') then
    create policy "ethan_summaries_delete_own" on public.ethan_summaries for delete using (auth.uid() = user_id);
  end if;
end $$;

-- ============================================================
-- 附加：邀请码表 & storage.objects（如果用到）
-- ============================================================
alter table if exists public.ethan_invite_codes enable row level security;
