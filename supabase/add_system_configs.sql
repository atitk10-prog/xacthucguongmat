-- =====================================================
-- THÊM CÁC CONFIGS MỚI CHO HỆ THỐNG
-- =====================================================
-- Chạy query này trong Supabase SQL Editor

-- Thêm configs cho nội trú
INSERT INTO system_configs (key, value, description) VALUES
    ('boarding_late_points', '-5', 'Điểm trừ khi check-in nội trú trễ'),
    ('boarding_on_time_points', '5', 'Điểm cộng khi check-in nội trú đúng giờ')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Thêm configs cho trường/chứng nhận
INSERT INTO system_configs (key, value, description) VALUES
    ('school_name', 'Trường THPT ABC', 'Tên trường hiển thị trên chứng nhận'),
    ('school_logo_url', '', 'URL logo trường'),
    ('school_address', '123 Đường XYZ, Quận 1, TP.HCM', 'Địa chỉ trường')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Thêm configs cho Face ID
INSERT INTO system_configs (key, value, description) VALUES
    ('face_threshold', '40', 'Ngưỡng độ tin cậy nhận diện khuôn mặt (%)'),
    ('require_face_default', 'false', 'Mặc định yêu cầu Face ID cho sự kiện mới')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Xem tất cả configs
SELECT * FROM system_configs ORDER BY key;
