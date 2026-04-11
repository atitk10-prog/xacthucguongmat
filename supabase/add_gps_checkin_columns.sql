-- =====================================================
-- GPS CHECK-IN VERIFICATION - Thêm cột GPS vào checkins
-- Chạy 1 lần trên Supabase SQL Editor
-- Ngày: 2026-04-04
-- =====================================================

-- 1. Thêm toạ độ GPS khi check-in
ALTER TABLE checkins ADD COLUMN IF NOT EXISTS checkin_latitude DOUBLE PRECISION;
ALTER TABLE checkins ADD COLUMN IF NOT EXISTS checkin_longitude DOUBLE PRECISION;

-- 2. Thêm độ chính xác GPS (mét)
ALTER TABLE checkins ADD COLUMN IF NOT EXISTS checkin_accuracy DOUBLE PRECISION;

-- 3. Cờ đánh dấu GPS đáng ngờ (fake GPS)
ALTER TABLE checkins ADD COLUMN IF NOT EXISTS gps_suspicious BOOLEAN DEFAULT FALSE;

-- 4. Index cho việc query báo cáo GPS nhanh hơn
CREATE INDEX IF NOT EXISTS idx_checkins_gps ON checkins (event_id, checkin_latitude, checkin_longitude) 
WHERE checkin_latitude IS NOT NULL;

-- =====================================================
-- DONE! Kiểm tra bằng lệnh:
-- SELECT column_name, data_type FROM information_schema.columns 
-- WHERE table_name = 'checkins' AND column_name LIKE 'checkin_%' OR column_name = 'gps_suspicious';
-- =====================================================
