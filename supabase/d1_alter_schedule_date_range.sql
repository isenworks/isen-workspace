-- D1: ethan_schedules 增加 start_date / end_date 列，支持多日事项
-- 注意：SQLite 的 ALTER TABLE ADD COLUMN 不支持 IF NOT EXISTS，重复执行会报错。
-- 应用层（functions）已通过 ensureScheduleRepeat 等机制做幂等保证，此处为一次性迁移。

ALTER TABLE ethan_schedules ADD COLUMN start_date TEXT;
ALTER TABLE ethan_schedules ADD COLUMN end_date TEXT;

-- 旧数据回填：start_date 缺失时用 date 兜底
UPDATE ethan_schedules SET start_date = date WHERE start_date IS NULL;

CREATE INDEX IF NOT EXISTS idx_ethan_schedules_user_start_date ON ethan_schedules(user_id, start_date);
