-- ===== 为 ethan_habits 添加开始/结束时间字段 =====
-- 习惯是长期存在的（跨天不消失），每天都按这个 start/end 时间在时间线上显示
-- start_time / end_time 作为时间线显示用；target_time 保留为单一目标时间字段兼容旧数据

ALTER TABLE public.ethan_habits
  ADD COLUMN IF NOT EXISTS start_time text;    -- 例：'07:30'

ALTER TABLE public.ethan_habits
  ADD COLUMN IF NOT EXISTS end_time text;      -- 例：'08:00'

-- 为已有数据填充：start_time = target_time（如果有）
UPDATE public.ethan_habits
SET   start_time = target_time
WHERE start_time IS NULL
AND   target_time IS NOT NULL;

-- 为已有数据填充：end_time = start_time + duration_min（如果有 duration_min）
UPDATE public.ethan_habits
SET   end_time = (
  SELECT to_char(
    to_timestamp(start_time, 'HH24:MI')::timestamp + (duration_min::text || ' minutes')::interval,
    'HH24:MI'
  )
)
WHERE end_time IS NULL
AND   start_time IS NOT NULL
AND   duration_min IS NOT NULL;
