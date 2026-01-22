-- ==========================================
-- KÍCH HOẠT REALTIME CHO CÁC BẢNG QUAN TRỌNG
-- ==========================================

-- Thêm các bảng vào danh sách publication của Supabase Realtime
-- giúp ứng dụng nhận thông báo tức thì mà không cần F5.

DO $$
BEGIN
    -- 1. Kích hoạt cho bảng thông báo (Học sinh)
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'notifications'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
    END IF;

    -- 2. Kích hoạt cho bảng đơn xin phép (Admin)
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'exit_permissions'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE exit_permissions;
    END IF;
END $$;
