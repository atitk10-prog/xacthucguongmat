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

-- Policy cho phép đọc cho tất cả authenticated users
CREATE POLICY "Allow read for authenticated users" ON boarding_time_slots
    FOR SELECT TO authenticated USING (true);

-- Policy cho phép admin CRUD
CREATE POLICY "Allow all for admins" ON boarding_time_slots
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role IN ('admin', 'teacher')
        )
    );

-- Thêm 3 khung giờ mặc định
INSERT INTO boarding_time_slots (name, start_time, end_time, order_index) VALUES
    ('Điểm danh buổi sáng', '05:00', '06:45', 1),
    ('Điểm danh buổi trưa', '11:30', '12:30', 2),
    ('Điểm danh buổi tối', '17:00', '22:00', 3)
ON CONFLICT DO NOTHING;

-- Comment
COMMENT ON TABLE boarding_time_slots IS 'Cấu hình các khung giờ check-in nội trú - người dùng có thể thêm/sửa/xóa';
COMMENT ON COLUMN boarding_time_slots.start_time IS 'Thời gian bắt đầu điểm danh';
COMMENT ON COLUMN boarding_time_slots.end_time IS 'Thời gian kết thúc - check-in sau giờ này = TRỄ';
