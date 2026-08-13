-- 习惯目标设置 + 坚持目标 + 量化打卡
-- habits 表新增：target_mode, target_value, target_unit, streak_goal, auto_log
-- habit_logs 表新增：actual_value, note

ALTER TABLE public.ethan_habits
  ADD COLUMN IF NOT EXISTS target_mode  text DEFAULT 'check',   -- 'check'=当天完成打卡 | 'count'=当天完成一定量
  ADD COLUMN IF NOT EXISTS target_value numeric,                 -- 目标数量（count模式）
  ADD COLUMN IF NOT EXISTS target_unit  text,                    -- 目标单位：次/杯/毫升/分钟/小时/米/页/自定义
  ADD COLUMN IF NOT EXISTS streak_goal  integer,                 -- 坚持天数目标：NULL=永远
  ADD COLUMN IF NOT EXISTS auto_log     integer DEFAULT 1;       -- 打卡时是否自动弹出日志：0/1

ALTER TABLE public.ethan_habit_logs
  ADD COLUMN IF NOT EXISTS actual_value numeric DEFAULT 0,       -- 当天实际达成数量（count模式累加）
  ADD COLUMN IF NOT EXISTS note        text;                     -- 打卡备注
