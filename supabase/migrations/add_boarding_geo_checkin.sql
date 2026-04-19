-- ============================================================
-- BOARDING GEO CHECK-IN — Migration Script (FINAL)
-- ============================================================
-- Trạng thái: CHƯA CHẠY — Lưu lại để triển khai sau
-- Ngày cập nhật: 2026-04-19
-- Phương án: docs/BOARDING_CHECKIN_FINAL.md
-- ============================================================
-- HƯỚNG DẪN: Copy toàn bộ và chạy trên Supabase SQL Editor
-- ============================================================

-- ══════════════════════════════════════════════════════════
-- 0. FIX STATUS CONSTRAINT (phải chạy trước)
-- ══════════════════════════════════════════════════════════
-- Constraint cũ chỉ cho 'on_time','late'. Cần thêm 'excused' cho GV tick có phép
-- Bước 1: Xóa constraint cũ (an toàn — không mất dữ liệu)
ALTER TABLE boarding_attendance DROP CONSTRAINT IF EXISTS boarding_attendance_status_check;
-- Bước 2: Thêm constraint mới bao gồm 'excused'
ALTER TABLE boarding_attendance ADD CONSTRAINT boarding_attendance_status_check 
  CHECK (status IN ('on_time', 'late', 'excused'));

-- ══════════════════════════════════════════════════════════
-- 1. BOARDING_ATTENDANCE — Thêm cột GPS + phương thức
-- ══════════════════════════════════════════════════════════

-- GPS vị trí (sẽ bị xóa tự động sau X ngày để tiết kiệm dung lượng)
ALTER TABLE boarding_attendance ADD COLUMN IF NOT EXISTS checkin_latitude DOUBLE PRECISION;
ALTER TABLE boarding_attendance ADD COLUMN IF NOT EXISTS checkin_longitude DOUBLE PRECISION;
ALTER TABLE boarding_attendance ADD COLUMN IF NOT EXISTS checkin_accuracy DOUBLE PRECISION;
ALTER TABLE boarding_attendance ADD COLUMN IF NOT EXISTS gps_suspicious BOOLEAN DEFAULT FALSE;

-- Phương thức check-in (giữ vĩnh viễn)
ALTER TABLE boarding_attendance ADD COLUMN IF NOT EXISTS checkin_mode TEXT;
-- Giá trị: 'qr' | 'face' | 'geo' | 'manual'

ALTER TABLE boarding_attendance ADD COLUMN IF NOT EXISTS face_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE boarding_attendance ADD COLUMN IF NOT EXISTS device_info TEXT;
ALTER TABLE boarding_attendance ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE boarding_attendance ADD COLUMN IF NOT EXISTS checked_by UUID REFERENCES users(id);

-- Comment mô tả
COMMENT ON COLUMN boarding_attendance.checkin_latitude IS 'Vĩ độ GPS khi check-in (tự xóa sau X ngày)';
COMMENT ON COLUMN boarding_attendance.checkin_longitude IS 'Kinh độ GPS khi check-in (tự xóa sau X ngày)';
COMMENT ON COLUMN boarding_attendance.checkin_accuracy IS 'Độ chính xác GPS (mét). >100m = nghi giả';
COMMENT ON COLUMN boarding_attendance.gps_suspicious IS 'GPS nghi giả (accuracy bất thường)';
COMMENT ON COLUMN boarding_attendance.checkin_mode IS 'Phương thức: qr / face / geo / manual';
COMMENT ON COLUMN boarding_attendance.face_verified IS 'Đã xác thực khuôn mặt khi GPS check-in';
COMMENT ON COLUMN boarding_attendance.device_info IS 'User Agent thiết bị';
COMMENT ON COLUMN boarding_attendance.notes IS 'Ghi chú của GV khi tick thủ công';
COMMENT ON COLUMN boarding_attendance.checked_by IS 'ID giáo viên nếu điểm danh thủ công';

-- ══════════════════════════════════════════════════════════
-- 2. BOARDING_CONFIG — Cấu hình GPS check-in
-- ══════════════════════════════════════════════════════════

-- Tọa độ KTX/trường
INSERT INTO boarding_config (key, value, description) VALUES 
  ('boarding_latitude', '0', 'Vĩ độ tọa độ ký túc xá / trường')
ON CONFLICT (key) DO NOTHING;

INSERT INTO boarding_config (key, value, description) VALUES 
  ('boarding_longitude', '0', 'Kinh độ tọa độ ký túc xá / trường')
ON CONFLICT (key) DO NOTHING;

INSERT INTO boarding_config (key, value, description) VALUES 
  ('boarding_radius', '100', 'Bán kính cho phép check-in GPS (mét)')
ON CONFLICT (key) DO NOTHING;

-- Bật/tắt GPS check-in
INSERT INTO boarding_config (key, value, description) VALUES 
  ('boarding_allow_geo', 'false', 'Cho phép HS tự điểm danh bằng GPS từ điện thoại')
ON CONFLICT (key) DO NOTHING;

INSERT INTO boarding_config (key, value, description) VALUES 
  ('boarding_geo_face', 'false', 'Yêu cầu quét khuôn mặt khi GPS check-in (chống gian lận)')
ON CONFLICT (key) DO NOTHING;

-- ══════════════════════════════════════════════════════════
-- 3. BOARDING_CONFIG — Quản lý dung lượng bản đồ
-- ══════════════════════════════════════════════════════════

INSERT INTO boarding_config (key, value, description) VALUES 
  ('map_retention_days', '7', 'Số ngày giữ dữ liệu GPS bản đồ (sau đó tự xóa lat/lng)')
ON CONFLICT (key) DO NOTHING;

INSERT INTO boarding_config (key, value, description) VALUES 
  ('map_cleanup_notify_days', '2', 'Thông báo Admin trước bao nhiêu ngày khi sắp xóa GPS data')
ON CONFLICT (key) DO NOTHING;

INSERT INTO boarding_config (key, value, description) VALUES 
  ('map_allow_export', 'true', 'Cho phép tải xuống dữ liệu bản đồ trước khi xóa')
ON CONFLICT (key) DO NOTHING;

-- ══════════════════════════════════════════════════════════
-- 4. FUNCTION — Tự động dọn dẹp GPS data cũ
-- ══════════════════════════════════════════════════════════

-- Function xóa GPS data cũ hơn X ngày
-- Chỉ xóa lat/lng/accuracy, GIỮ NGUYÊN checkin_time/status/mode/notes
CREATE OR REPLACE FUNCTION cleanup_old_gps_data()
RETURNS INTEGER AS $$
DECLARE
  v_retention_days INTEGER;
  v_deleted_count INTEGER;
  v_cutoff_date DATE;
BEGIN
  -- Lấy số ngày từ config
  SELECT COALESCE(value::INTEGER, 7) INTO v_retention_days
  FROM boarding_config WHERE key = 'map_retention_days';
  
  -- Tính ngày cutoff
  v_cutoff_date := CURRENT_DATE - (v_retention_days || ' days')::INTERVAL;
  
  -- Xóa GPS data (SET NULL) cho records cũ hơn retention_days
  UPDATE boarding_attendance ba
  SET 
    checkin_latitude = NULL,
    checkin_longitude = NULL,
    checkin_accuracy = NULL
  WHERE 
    ba.date < v_cutoff_date
    AND ba.checkin_latitude IS NOT NULL;
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_old_gps_data() IS 
  'Xóa dữ liệu GPS bản đồ cũ hơn map_retention_days. Giữ nguyên dữ liệu điểm danh.';

-- ============================================================
-- KIỂM TRA SAU KHI CHẠY:
-- ============================================================
-- 1. Kiểm tra cột mới:
-- SELECT column_name, data_type 
-- FROM information_schema.columns 
-- WHERE table_name = 'boarding_attendance' 
--   AND column_name IN ('checkin_latitude','checkin_longitude','checkin_mode','face_verified','notes','checked_by');
-- → Kết quả: 6 cột mới
--
-- 2. Kiểm tra config:  
-- SELECT * FROM boarding_config WHERE key LIKE 'boarding_%' OR key LIKE 'map_%';
-- → Kết quả: 8 config keys
--
-- 3. Kiểm tra function:
-- SELECT cleanup_old_gps_data();
-- → Kết quả: 0 (chưa có data cũ)
-- ============================================================
