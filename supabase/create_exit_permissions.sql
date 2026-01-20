-- ============================================
-- TẠO BẢNG exit_permissions (Đơn xin phép ra ngoài)
-- Chạy script này trong Supabase SQL Editor
-- ============================================

-- 1. Tạo bảng
CREATE TABLE IF NOT EXISTS exit_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    reason_detail TEXT,
    destination TEXT NOT NULL,
    parent_contact TEXT,
    exit_time TIMESTAMPTZ NOT NULL,
    return_time TIMESTAMPTZ NOT NULL,
    actual_return_time TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    rejection_reason TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tạo indexes
CREATE INDEX IF NOT EXISTS idx_exit_permissions_user_id ON exit_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_exit_permissions_status ON exit_permissions(status);
CREATE INDEX IF NOT EXISTS idx_exit_permissions_exit_time ON exit_permissions(exit_time);

-- 3. Bật RLS
ALTER TABLE exit_permissions ENABLE ROW LEVEL SECURITY;

-- 4. Xóa policies cũ (nếu có)
DROP POLICY IF EXISTS "Allow read for all" ON exit_permissions;
DROP POLICY IF EXISTS "Allow insert for authenticated" ON exit_permissions;
DROP POLICY IF EXISTS "Allow update for authenticated" ON exit_permissions;
DROP POLICY IF EXISTS "Allow delete for authenticated" ON exit_permissions;

-- 5. Tạo policies mới
-- Cho phép đọc tất cả (hoặc có thể giới hạn theo user_id)
CREATE POLICY "Allow read for all" ON exit_permissions
    FOR SELECT USING (true);

-- Cho phép tạo mới khi đã đăng nhập
CREATE POLICY "Allow insert for authenticated" ON exit_permissions
    FOR INSERT TO authenticated
    WITH CHECK (true);

-- Cho phép cập nhật (duyệt đơn) khi đã đăng nhập
CREATE POLICY "Allow update for authenticated" ON exit_permissions
    FOR UPDATE TO authenticated
    USING (true)
    WITH CHECK (true);

-- Cho phép xóa khi đã đăng nhập
CREATE POLICY "Allow delete for authenticated" ON exit_permissions
    FOR DELETE TO authenticated
    USING (true);

-- 6. Kiểm tra
SELECT 'Bảng exit_permissions đã được tạo!' as status;
SELECT * FROM exit_permissions LIMIT 5;
