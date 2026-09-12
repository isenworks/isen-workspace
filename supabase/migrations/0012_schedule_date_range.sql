-- 0012: ethan_schedules 增加 start_date / end_date 列，支持多日事项（如旅游 6.12-13）
-- start_date: 开始日期（兼容旧数据 = date）；end_date: 截止日期（可选，单日事项为 NULL）

alter table public.ethan_schedules
  add column if not exists start_date text;

alter table public.ethan_schedules
  add column if not exists end_date text;

-- 旧数据回填：start_date 缺失时用 date 兜底
update public.ethan_schedules
  set start_date = date
  where start_date is null;

create index if not exists idx_ethan_schedules_user_start_date
  on public.ethan_schedules(user_id, start_date);
