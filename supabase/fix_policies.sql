-- FIX QUYỀN TRUY CẬP (RLS POLICIES)
-- Chạy script này để sửa lỗi không Thêm/Sửa/Xóa được

-- 1. Xóa policies cũ (nếu có)
DROP POLICY IF EXISTS "Allow read for authenticated users" ON boarding_time_slots;
DROP POLICY IF EXISTS "Allow all for admins" ON boarding_time_slots;
DROP POLICY IF EXISTS "Allow read for all" ON boarding_time_slots;
DROP POLICY IF EXISTS "Allow write for authenticated" ON boarding_time_slots;

-- 2. Tạo policy mới: Ai cũng xem được
CREATE POLICY "Allow read for all" ON boarding_time_slots
    FOR SELECT USING (true);

-- 3. Tạo policy mới: User đăng nhập được phép Sửa/Xóa/Thêm
CREATE POLICY "Allow write for authenticated" ON boarding_time_slots
    FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);

-- 4. Bật RLS
ALTER TABLE boarding_time_slots ENABLE ROW LEVEL SECURITY;
