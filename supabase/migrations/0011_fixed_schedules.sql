-- ============================================================
-- 0011: 固定日程表（时间线每日重复的提醒，不进入重点/习惯面板，不可打卡）
-- 用途：12:00-13:00 吃午饭 / 13:00-14:00 午休 / 18:00-19:00 吃晚饭 等
-- ============================================================

create table if not exists public.ethan_fixed_schedules (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  emoji text default '📌',
  start_time text not null, -- 'HH:MM'
  end_time text not null,   -- 'HH:MM'
  sort_order integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 索引：按用户查询 + 排序
create index if not exists ethan_fixed_schedules_user_idx
  on public.ethan_fixed_schedules(user_id, sort_order);

-- 启用 RLS
alter table public.ethan_fixed_schedules enable row level security;

-- 策略：用户只能 CRUD 自己的固定日程
drop policy if exists "ethan_fixed_schedules_select_own" on public.ethan_fixed_schedules;
create policy "ethan_fixed_schedules_select_own"
  on public.ethan_fixed_schedules for select
  using (auth.uid() = user_id);

drop policy if exists "ethan_fixed_schedules_insert_own" on public.ethan_fixed_schedules;
create policy "ethan_fixed_schedules_insert_own"
  on public.ethan_fixed_schedules for insert
  with check (auth.uid() = user_id);

drop policy if exists "ethan_fixed_schedules_update_own" on public.ethan_fixed_schedules;
create policy "ethan_fixed_schedules_update_own"
  on public.ethan_fixed_schedules for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "ethan_fixed_schedules_delete_own" on public.ethan_fixed_schedules;
create policy "ethan_fixed_schedules_delete_own"
  on public.ethan_fixed_schedules for delete
  using (auth.uid() = user_id);

-- 自动更新 updated_at
create or replace function public.ethan_fixed_schedules_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists ethan_fixed_schedules_updated_at on public.ethan_fixed_schedules;
create trigger ethan_fixed_schedules_updated_at
  before update on public.ethan_fixed_schedules
  for each row execute function public.ethan_fixed_schedules_set_updated_at();
