-- =====================================================
-- BOARDING TIME SLOTS - Khung giờ check-in linh hoạt
-- =====================================================

-- Tạo bảng time slots
CREATE TABLE IF NOT EXISTS boarding_time_slots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,           -- Tên: "Điểm danh sáng", "Điểm danh trưa"
    start_time TIME NOT NULL,             -- Giờ bắt đầu điểm danh
    end_time TIME NOT NULL,               -- Giờ kết thúc (deadline) - sau giờ này = TRỄ
    is_active BOOLEAN DEFAULT true,       -- Có đang bật không
    order_index INTEGER DEFAULT 0,        -- Thứ tự hiển thị
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE boarding_time_slots ENABLE ROW LEVEL SECURITY;

-- Drop existing policies (để tránh lỗi duplicate)
DROP POLICY IF EXISTS "Allow read for authenticated users" ON boarding_time_slots;
DROP POLICY IF EXISTS "Allow all for admins" ON boarding_time_slots;
DROP POLICY IF EXISTS "Public access boarding_time_slots" ON boarding_time_slots;

-- Policy cho phép đọc cho tất cả
DROP POLICY IF EXISTS "Allow read for all" ON boarding_time_slots;
CREATE POLICY "Allow read for all" ON boarding_time_slots
    FOR SELECT USING (true);

-- Policy cho phép INSERT/UPDATE/DELETE cho authenticated users
DROP POLICY IF EXISTS "Allow write for authenticated" ON boarding_time_slots;
CREATE POLICY "Allow write for authenticated" ON boarding_time_slots
    FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);

-- Thêm 3 khung giờ mặc định (nếu chưa có)
INSERT INTO boarding_time_slots (name, start_time, end_time, order_index) VALUES
    ('Điểm danh buổi sáng', '05:00', '06:45', 1),
    ('Điểm danh buổi trưa', '11:30', '12:30', 2),
    ('Điểm danh buổi tối', '17:00', '22:00', 3)
ON CONFLICT DO NOTHING;

-- Kiểm tra xem đã có data chưa
SELECT * FROM boarding_time_slots ORDER BY order_index;

