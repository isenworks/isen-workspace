-- 补充 energy_state / mood_state 字段到 habit_logs
-- 若 0008 已在生产环境执行过，此迁移用于补齐缺失字段
ALTER TABLE public.ethan_habit_logs
  ADD COLUMN IF NOT EXISTS energy_state text,  -- 精力状态: 'energized'|'normal'|'poor'
  ADD COLUMN IF NOT EXISTS mood_state   text;  -- 心情状态: 'positive'|'neutral'|'negative'
