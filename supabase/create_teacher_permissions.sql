-- =====================================================
-- 1. CẬP NHẬT HÀM KIỂM TRA ADMIN (THÔNG MINH HƠN)
-- =====================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.users 
        WHERE id = auth.uid() 
        AND lower(role) = 'admin'
    );
END;
$$;


-- =====================================================
-- 2. TỰ CẤP QUYỀN ADMIN (CHẠY LỆNH NÀY NẾU BỊ TỪ CHỐI)
-- Thay 'email_cua_ban@vi-du.com' bằng email bạn đang dùng
-- =====================================================
-- UPDATE public.users SET role = 'admin' WHERE email = 'email_cua_ban@vi-du.com';

-- =====================================================
-- 3. CẬP NHẬT CHÍNH SÁCH BẢO MẬT (ỔN ĐỊNH HƠN)
-- =====================================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Người dùng tự xem thông tin của mình" ON public.users;
CREATE POLICY "Người dùng tự xem thông tin của mình" ON public.users
    FOR SELECT USING (auth.uid() = id);

-- Cho phép Admin xem tất cả bằng cách gọi hàm (không gây recursion)
DROP POLICY IF EXISTS "Admin có toàn quyền trên bảng users" ON public.users;
CREATE POLICY "Admin có toàn quyền trên bảng users" ON public.users
    FOR ALL USING (public.is_admin());

-- =====================================================
-- 4. KHỞI TẠO BẢNG PHÂN QUYỀN
-- =====================================================
CREATE TABLE IF NOT EXISTS public.teacher_permissions (
    module_id TEXT PRIMARY KEY,
    module_name TEXT NOT NULL,
    is_enabled BOOLEAN DEFAULT false,
    can_edit BOOLEAN DEFAULT false,
    can_delete BOOLEAN DEFAULT false,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Bật Realtime
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'teacher_permissions'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.teacher_permissions;
    END IF;
END $$;

ALTER TABLE public.teacher_permissions REPLICA IDENTITY FULL;

-- Dữ liệu chuẩn
INSERT INTO public.teacher_permissions (module_id, module_name, is_enabled)
VALUES 
    ('dashboard', 'Bảng điều khiển', true),
    ('events', 'Quản lý Sự kiện', false),
    ('boarding', 'Quản lý Nội trú', false),
    ('reports', 'Báo cáo & Thống kê', false),
    ('users', 'Quản lý Người dùng', false),
    ('points', 'Quản lý Điểm', false),
    ('certificates', 'Cấp Chứng nhận', false),
    ('cards', 'Tạo Thẻ học sinh', false),
    ('faceid', 'Quản lý Face ID', false),
    ('permissions', 'Phân quyền', false),
    ('settings', 'Cấu hình hệ thống', false),
    ('help', 'Trung tâm Hướng dẫn', true)
ON CONFLICT (module_id) DO UPDATE SET module_name = EXCLUDED.module_name;

-- =====================================================
-- 5. HÀM CẬP NHẬT QUYỀN (CHUẨN HÓA)
-- =====================================================
CREATE OR REPLACE FUNCTION public.update_teacher_module_permission(
    target_id TEXT,
    updates JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Bạn không có quyền Admin. Email hiện tại: %', (SELECT email FROM auth.users WHERE id = auth.uid());
    END IF;

    UPDATE public.teacher_permissions
    SET 
        is_enabled = COALESCE((updates->>'is_enabled')::boolean, is_enabled),
        can_edit = COALESCE((updates->>'can_edit')::boolean, can_edit),
        can_delete = COALESCE((updates->>'can_delete')::boolean, can_delete),
        updated_at = now()
    WHERE module_id = target_id;
END;
$$;

-- Policy Select cho App
DROP POLICY IF EXISTS "Cho phép mọi người xem quyền" ON public.teacher_permissions;
CREATE POLICY "Cho phép mọi người xem quyền" ON public.teacher_permissions
    FOR SELECT USING (true);
