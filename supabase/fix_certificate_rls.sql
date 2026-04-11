-- ==========================================
-- FIX: Certificate RLS Policies
-- Chạy SQL này để HS có thể xem chứng nhận
-- ==========================================

-- 1. BẬT RLS trên bảng certificates
ALTER TABLE certificates ENABLE ROW LEVEL SECURITY;

-- 2. XÓA tất cả policies cũ (tránh conflict)
DROP POLICY IF EXISTS "Users can read own certificates" ON certificates;
DROP POLICY IF EXISTS "Admin can read all certificates" ON certificates;
DROP POLICY IF EXISTS "Admin can create certificates" ON certificates;
DROP POLICY IF EXISTS "Admin can delete certificates" ON certificates;
DROP POLICY IF EXISTS "Enable read access for all users" ON certificates;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON certificates;
DROP POLICY IF EXISTS "Enable delete for admin" ON certificates;
DROP POLICY IF EXISTS "certificates_select_policy" ON certificates;
DROP POLICY IF EXISTS "certificates_insert_policy" ON certificates;
DROP POLICY IF EXISTS "certificates_delete_policy" ON certificates;

-- 3. TẠO POLICIES MỚI

-- HS đọc certificates của mình
CREATE POLICY "student_read_own_certs"
ON certificates FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- Admin/Teacher đọc TẤT CẢ certificates
CREATE POLICY "admin_read_all_certs"
ON certificates FOR SELECT TO authenticated
USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'teacher'))
);

-- Admin/Teacher tạo certificates
CREATE POLICY "admin_create_certs"
ON certificates FOR INSERT TO authenticated
WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'teacher'))
);

-- Admin/Teacher xóa certificates
CREATE POLICY "admin_delete_certs"
ON certificates FOR DELETE TO authenticated
USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'teacher'))
);

-- 4. Verify
SELECT schemaname, tablename, policyname, cmd 
FROM pg_policies 
WHERE tablename = 'certificates';
