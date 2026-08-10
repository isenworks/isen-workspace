-- 睡眠习惯增强：扩展 habit_logs 表，支持记录实际睡眠时间、醒后状态
-- 适用于所有习惯，sleep_* 字段为 NULL 时不影响其他习惯

ALTER TABLE public.ethan_habit_logs
  ADD COLUMN IF NOT EXISTS sleep_start   text,       -- 入睡时间 '23:30'
  ADD COLUMN IF NOT EXISTS sleep_end     text,       -- 起床时间 '07:15'
  ADD COLUMN IF NOT EXISTS wake_state    text,       -- 醒后状态: 'energized'|'okay'|'drowsy'|'exhausted'
  ADD COLUMN IF NOT EXISTS sleep_note    text,       -- 备注
  ADD COLUMN IF NOT EXISTS data_source   text;       -- 数据来源: 'manual' | 'huawei'

-- 补充 growth_type 字段到 ethan_habits（前端已使用但迁移缺失）
ALTER TABLE public.ethan_habits
  ADD COLUMN IF NOT EXISTS growth_type text default 'energy';
