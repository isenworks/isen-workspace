-- ============================================================
-- 个人工作台 · Supabase 初始化 SQL（带 ethan_ 表名前缀，避免与其他项目冲突）
-- 在 Supabase Dashboard → SQL Editor 中执行此文件
-- ============================================================

-- 1. ethan_profiles 表（扩展 auth.users，存头像/显示名）
create table if not exists public.ethan_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text,
  avatar text default '',
  created_at timestamptz default now()
);

-- 2. ethan_schedules 表（日程/事项）
create table if not exists public.ethan_schedules (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  date text not null,
  start_time text,
  end_time text,
  duration_min integer,
  is_key integer default 0,
  category integer default 3,
  is_done integer default 0,
  sort_order integer default 0,
  created_at timestamptz default now()
);
create index if not exists idx_ethan_schedules_user_date on public.ethan_schedules(user_id, date);

-- 3. ethan_tasks 表
create table if not exists public.ethan_tasks (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  date text not null,
  priority integer default 2,
  is_done integer default 0,
  due_time text,
  sort_order integer default 0,
  created_at timestamptz default now()
);
create index if not exists idx_ethan_tasks_user_date on public.ethan_tasks(user_id, date);

-- 4. ethan_habits 表
create table if not exists public.ethan_habits (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  emoji text default '✅',
  accent_color text default '#34c759',
  target_time text,
  duration_min integer,
  sort_order integer default 0,
  archived integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 5. ethan_habit_logs 表（打卡记录）
create table if not exists public.ethan_habit_logs (
  id bigint generated always as identity primary key,
  habit_id bigint not null references public.ethan_habits(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  date text not null,
  done integer default 1,
  unique(habit_id, date)
);
create index if not exists idx_ethan_habit_logs_user_date on public.ethan_habit_logs(user_id, date);

-- 6. ethan_summaries 表（每日复盘）
create table if not exists public.ethan_summaries (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  date text not null,
  content text not null,
  mood text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, date)
);
create index if not exists idx_ethan_summaries_user_date on public.ethan_summaries(user_id, date);

-- ============================================================
-- 授权：让 authenticated 角色可以访问这些表
-- ============================================================

grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on public.ethan_profiles to authenticated;
grant select, insert, update, delete on public.ethan_schedules to authenticated;
grant select, insert, update, delete on public.ethan_tasks to authenticated;
grant select, insert, update, delete on public.ethan_habits to authenticated;
grant select, insert, update, delete on public.ethan_habit_logs to authenticated;
grant select, insert, update, delete on public.ethan_summaries to authenticated;

-- 序列（用于 identity 列）授权
grant usage, select on all sequences in schema public to authenticated;

-- ============================================================
-- RLS（行级安全）策略：每个用户只能访问自己的数据
-- ============================================================

alter table public.ethan_profiles enable row level security;
alter table public.ethan_schedules enable row level security;
alter table public.ethan_tasks enable row level security;
alter table public.ethan_habits enable row level security;
alter table public.ethan_habit_logs enable row level security;
alter table public.ethan_summaries enable row level security;

-- ethan_profiles：自己可以读写
create policy "ethan_profiles_select_own" on public.ethan_profiles for select using (auth.uid() = id);
create policy "ethan_profiles_insert_own" on public.ethan_profiles for insert with check (auth.uid() = id);
create policy "ethan_profiles_update_own" on public.ethan_profiles for update using (auth.uid() = id);

-- ethan_schedules
create policy "ethan_schedules_select_own" on public.ethan_schedules for select using (auth.uid() = user_id);
create policy "ethan_schedules_insert_own" on public.ethan_schedules for insert with check (auth.uid() = user_id);
create policy "ethan_schedules_update_own" on public.ethan_schedules for update using (auth.uid() = user_id);
create policy "ethan_schedules_delete_own" on public.ethan_schedules for delete using (auth.uid() = user_id);

-- ethan_tasks
create policy "ethan_tasks_select_own" on public.ethan_tasks for select using (auth.uid() = user_id);
create policy "ethan_tasks_insert_own" on public.ethan_tasks for insert with check (auth.uid() = user_id);
create policy "ethan_tasks_update_own" on public.ethan_tasks for update using (auth.uid() = user_id);
create policy "ethan_tasks_delete_own" on public.ethan_tasks for delete using (auth.uid() = user_id);

-- ethan_habits
create policy "ethan_habits_select_own" on public.ethan_habits for select using (auth.uid() = user_id);
create policy "ethan_habits_insert_own" on public.ethan_habits for insert with check (auth.uid() = user_id);
create policy "ethan_habits_update_own" on public.ethan_habits for update using (auth.uid() = user_id);
create policy "ethan_habits_delete_own" on public.ethan_habits for delete using (auth.uid() = user_id);

-- ethan_habit_logs
create policy "ethan_habit_logs_select_own" on public.ethan_habit_logs for select using (auth.uid() = user_id);
create policy "ethan_habit_logs_insert_own" on public.ethan_habit_logs for insert with check (auth.uid() = user_id);
create policy "ethan_habit_logs_update_own" on public.ethan_habit_logs for update using (auth.uid() = user_id);
create policy "ethan_habit_logs_delete_own" on public.ethan_habit_logs for delete using (auth.uid() = user_id);

-- ethan_summaries
create policy "ethan_summaries_select_own" on public.ethan_summaries for select using (auth.uid() = user_id);
create policy "ethan_summaries_insert_own" on public.ethan_summaries for insert with check (auth.uid() = user_id);
create policy "ethan_summaries_update_own" on public.ethan_summaries for update using (auth.uid() = user_id);
create policy "ethan_summaries_delete_own" on public.ethan_summaries for delete using (auth.uid() = user_id);

-- ============================================================
-- 触发器：注册时自动创建 ethan_profiles
-- ============================================================
create or replace function public.ethan_handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.ethan_profiles (id, username, avatar)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'avatar', upper(left(coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1)), 1)))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_ethan_user_created on auth.users;
create trigger on_ethan_user_created
  after insert on auth.users
  for each row execute function public.ethan_handle_new_user();

-- ============================================================
-- ethan_habit_logs 触发器：打卡时自动更新 ethan_habits.updated_at
-- ============================================================
create or replace function public.ethan_touch_habit_updated()
returns trigger
language plpgsql
as $$
begin
  update public.ethan_habits set updated_at = now() where id = new.habit_id;
  return new;
end;
$$;

drop trigger if exists on_ethan_habit_log_change on public.ethan_habit_logs;
create trigger on_ethan_habit_log_change
  after insert or update or delete on public.ethan_habit_logs
  for each row execute function public.ethan_touch_habit_updated();

-- ============================================================
-- ethan_profiles 增加 is_banned 字段（用于禁用用户）
-- ============================================================
alter table public.ethan_profiles add column if not exists is_banned boolean default false;

-- ============================================================
-- ethan_invite_codes 表（邀请码管理）
-- ============================================================
create table if not exists public.ethan_invite_codes (
  id bigint generated always as identity primary key,
  code text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  used_by uuid references auth.users(id) on delete set null,
  used_at timestamptz,
  is_disabled boolean default false,
  disabled_at timestamptz,
  created_at timestamptz default now()
);

-- 授权
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.ethan_invite_codes to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- RLS
alter table public.ethan_invite_codes enable row level security;

-- 管理员（通过 RPC 判定）可读写，普通用户不可直接访问
create policy "ethan_invite_codes_admin_select" on public.ethan_invite_codes for select
  using (auth.uid() in (select id from public.ethan_profiles where is_banned = false));

-- ============================================================
-- RPC 函数：邀请码管理
-- ============================================================

-- 1. 生成邀请码（仅管理员邮箱 1429000825@qq.com 可调用）
create or replace function public.create_invite_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_uid uuid := auth.uid();
  v_email text;
  v_attempts int := 0;
begin
  if v_uid is null then
    raise exception '未登录';
  end if;
  select email into v_email from auth.users where id = v_uid;
  if v_email is distinct from '1429000825@qq.com' then
    raise exception '无权生成邀请码';
  end if;
  loop
    v_code := upper(substr(md5(random()::text || clock_timestamp()::text || v_uid::text), 1, 8));
    exit when not exists (select 1 from public.ethan_invite_codes where code = v_code);
    v_attempts := v_attempts + 1;
    if v_attempts > 10 then
      raise exception '生成邀请码失败';
    end if;
  end loop;
  insert into public.ethan_invite_codes(code, created_by) values (v_code, v_uid);
  return v_code;
end;
$$;

-- 2. 列出所有邀请码（仅管理员）
create or replace function public.list_invite_codes()
returns table (
  id bigint,
  code text,
  created_at timestamptz,
  is_used boolean,
  used_by_email text,
  is_disabled boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_email text;
begin
  select au.email into v_admin_email from auth.users au where au.id = auth.uid();
  if v_admin_email is distinct from '1429000825@qq.com' then
    raise exception '无权查看';
  end if;
  return query
    select
      c.id as id,
      c.code as code,
      c.created_at as created_at,
      (c.used_by is not null) as is_used,
      u.email as used_by_email,
      c.is_disabled as is_disabled
    from public.ethan_invite_codes c
    left join auth.users u on c.used_by = u.id
    order by c.created_at desc;
end;
$$;

-- 3. 禁用邀请码
create or replace function public.disable_invite_code(p_code_id bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  select email into v_email from auth.users where id = auth.uid();
  if v_email is distinct from '1429000825@qq.com' then
    raise exception '无权操作';
  end if;
  update public.ethan_invite_codes
  set is_disabled = true, disabled_at = now()
  where id = p_code_id and is_disabled = false;
  return found;
end;
$$;

-- 4. 预留邀请码（注册时调用，标记为已预留）
create or replace function public.reserve_invite_code(p_code text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code_id bigint;
  v_uid uuid := auth.uid();
begin
  if v_uid is not null then
    raise exception '请先退出当前账号再注册';
  end if;
  select id into v_code_id
  from public.ethan_invite_codes
  where code = upper(p_code)
    and is_disabled = false
    and used_by is null
  for update;

  if v_code_id is null then
    raise exception '邀请码无效或已被使用';
  end if;

  return v_code_id;
end;
$$;

-- 5. 绑定邀请码使用者（注册成功后调用）
create or replace function public.link_invite_user(p_code_id bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
begin
  if v_uid is null then
    raise exception '未登录';
  end if;
  select email into v_email from auth.users where id = v_uid;

  update public.ethan_invite_codes
  set used_by = v_uid, used_at = now()
  where id = p_code_id
    and used_by is null
    and is_disabled = false;

  return found;
end;
$$;

-- ============================================================
-- RPC 函数：用户管理
-- ============================================================

-- 6. 列出所有用户（仅管理员）
create or replace function public.list_all_users()
returns table (
  user_id uuid,
  email text,
  username text,
  is_banned boolean,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_email text;
begin
  select au.email into v_admin_email from auth.users au where au.id = auth.uid();
  if v_admin_email is distinct from '1429000825@qq.com' then
    raise exception '无权查看';
  end if;
  return query
    select
      au.id as user_id,
      au.email as email,
      coalesce(p.username, split_part(au.email, '@', 1)) as username,
      coalesce(p.is_banned, false) as is_banned,
      au.created_at as created_at
    from auth.users au
    left join public.ethan_profiles p on au.id = p.id
    order by au.created_at desc;
end;
$$;

-- 7. 禁用用户
create or replace function public.ban_user(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  select email into v_email from auth.users where id = auth.uid();
  if v_email is distinct from '1429000825@qq.com' then
    raise exception '无权操作';
  end if;
  update public.ethan_profiles
  set is_banned = true
  where id = p_user_id;
  return found;
end;
$$;

-- 8. 解禁用户
create or replace function public.unban_user(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  select email into v_email from auth.users where id = auth.uid();
  if v_email is distinct from '1429000825@qq.com' then
    raise exception '无权操作';
  end if;
  update public.ethan_profiles
  set is_banned = false
  where id = p_user_id;
  return found;
end;
$$;
