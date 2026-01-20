-- ============================================
-- FIX HOÀN TOÀN QUYỀN TRUY CẬP BẢNG boarding_time_slots
-- Chạy script này trong Supabase SQL Editor
-- ============================================

-- 1. TẮT RLS TẠM THỜI để sửa
ALTER TABLE boarding_time_slots DISABLE ROW LEVEL SECURITY;

-- 2. XÓA TẤT CẢ POLICIES CŨ
DROP POLICY IF EXISTS "Allow read for authenticated users" ON boarding_time_slots;
DROP POLICY IF EXISTS "Allow all for admins" ON boarding_time_slots;
DROP POLICY IF EXISTS "Allow read for all" ON boarding_time_slots;
DROP POLICY IF EXISTS "Allow write for authenticated" ON boarding_time_slots;
DROP POLICY IF EXISTS "Public access" ON boarding_time_slots;
DROP POLICY IF EXISTS "Enable all for anon" ON boarding_time_slots;
DROP POLICY IF EXISTS "Enable all operations" ON boarding_time_slots;

-- 3. TẠO POLICY MỚI - CHO PHÉP MỌI THAO TÁC (tạm thời để test)
CREATE POLICY "Enable all operations" ON boarding_time_slots
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- 4. BẬT LẠI RLS
ALTER TABLE boarding_time_slots ENABLE ROW LEVEL SECURITY;

-- 5. KIỂM TRA KẾT QUẢ
SELECT 'Policies hiện tại:' as info;
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'boarding_time_slots';

SELECT 'Dữ liệu trong bảng:' as info;
SELECT * FROM boarding_time_slots ORDER BY order_index;
