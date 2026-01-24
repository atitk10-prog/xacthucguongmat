-- =====================================================
-- ENABLE REALTIME FOR BOARDING SYSTEM
-- Run this in Supabase SQL Editor
-- =====================================================

-- 1. Thêm bảng boarding_checkins vào publication supabase_realtime
-- Điều này cho phép client nhận thông báo khi có bản ghi mới hoặc cập nhật
ALTER PUBLICATION supabase_realtime ADD TABLE boarding_checkins;

-- 2. (Tùy chọn) Đảm bảo bảng có Full Replica Identity nếu bạn muốn nhận dữ liệu cũ khi UPDATE
-- ALTER TABLE boarding_checkins REPLICA IDENTITY FULL;
