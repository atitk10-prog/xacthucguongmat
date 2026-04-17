-- =====================================================
-- GPS cho bảng EVENTS - Tọa độ vị trí sự kiện
-- Chạy 1 lần trên Supabase SQL Editor
-- Ngày: 2026-04-17
-- =====================================================

-- 1. Tọa độ trung tâm sự kiện (nơi diễn ra)
ALTER TABLE events ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE events ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

-- 2. Bán kính cho phép (mét) - HS phải ở trong vòng bán kính này
ALTER TABLE events ADD COLUMN IF NOT EXISTS radius_meters INTEGER DEFAULT 100;

-- =====================================================
-- DONE! Kiểm tra:
-- SELECT column_name, data_type FROM information_schema.columns 
-- WHERE table_name = 'events' AND column_name IN ('latitude', 'longitude', 'radius_meters');
-- =====================================================
