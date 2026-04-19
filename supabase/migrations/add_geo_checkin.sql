-- ============================================================
-- GEOFENCING AUTO CHECK-IN — Migration Script
-- ============================================================
-- Trạng thái: CHƯA CHẠY — Lưu lại để triển khai sau
-- Ngày tạo: 2026-04-19
-- Mô tả: Thêm cấu hình cho phép HS tự điểm danh bằng GPS
--         từ Cổng Học Sinh (Geofencing Auto Check-in)
-- ============================================================
-- HƯỚNG DẪN: Copy toàn bộ nội dung này và chạy trên
--            Supabase SQL Editor TRƯỚC khi deploy code frontend
-- ============================================================

-- 1. Thêm cột cho phép GPS check-in vào bảng events
ALTER TABLE events 
ADD COLUMN IF NOT EXISTS allow_geo_checkin BOOLEAN DEFAULT false;

-- 2. Thêm cột yêu cầu Face verify khi GPS check-in (chống gian lận)
ALTER TABLE events 
ADD COLUMN IF NOT EXISTS geo_require_face BOOLEAN DEFAULT false;

-- 3. Comment mô tả cho DBA
COMMENT ON COLUMN events.allow_geo_checkin IS 
  'Cho phép HS tự điểm danh bằng GPS từ Cổng Học Sinh. Khi bật, HS chỉ cần mở app → bấm Điểm danh → GPS xác nhận → Check-in tự động.';

COMMENT ON COLUMN events.geo_require_face IS 
  'Khi GPS check-in, yêu cầu xác thực khuôn mặt nhanh (chống gian lận: tránh HS nhờ người khác mang điện thoại đến trường).';

-- ============================================================
-- KIỂM TRA SAU KHI CHẠY:
-- ============================================================
-- SELECT column_name, data_type, column_default 
-- FROM information_schema.columns 
-- WHERE table_name = 'events' 
--   AND column_name IN ('allow_geo_checkin', 'geo_require_face');
--
-- Kết quả mong đợi: 2 dòng, cả 2 đều boolean, default false
-- ============================================================
