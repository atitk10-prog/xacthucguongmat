-- SCRIPT SỬA TẤT CẢ LỖI (CHẠY 1 LẦN DUY NHẤT)
-- Copy toàn bộ nội dung và chạy trong Supabase SQL Editor

BEGIN;

-- 1. Thêm cột 'updated_at' vào bảng users (nếu chưa có)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'updated_at') THEN
        ALTER TABLE users ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
        RAISE NOTICE 'Đã thêm cột updated_at';
    ELSE
        RAISE NOTICE 'Cột updated_at đã tồn tại';
    END IF;
END $$;

-- 2. Đảm bảo các cột khác cũng tồn tại
DO $$
BEGIN
    -- student_code
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'student_code') THEN
        ALTER TABLE users ADD COLUMN student_code TEXT;
    END IF;
    -- organization
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'organization') THEN
        ALTER TABLE users ADD COLUMN organization TEXT;
    END IF;
     -- avatar_url
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'avatar_url') THEN
        ALTER TABLE users ADD COLUMN avatar_url TEXT;
    END IF;
END $$;

-- 3. SỬA LỖI UPLOAD ẢNH (Cấp quyền cho Storage)
-- Xóa các policy cũ để tránh trùng lặp
DROP POLICY IF EXISTS "Allow Public Upload Avatars" ON storage.objects;
DROP POLICY IF EXISTS "Allow Public Update Avatars" ON storage.objects;
DROP POLICY IF EXISTS "Allow Public Select Avatars" ON storage.objects;
DROP POLICY IF EXISTS "Allow Public Delete Avatars" ON storage.objects;

-- Tạo policy mới cho phép tất cả các thao tác với bucket 'avatars'
CREATE POLICY "Allow Public Upload Avatars" ON storage.objects FOR INSERT WITH CHECK ( bucket_id = 'avatars' );
CREATE POLICY "Allow Public Update Avatars" ON storage.objects FOR UPDATE USING ( bucket_id = 'avatars' ) WITH CHECK ( bucket_id = 'avatars' );
CREATE POLICY "Allow Public Select Avatars" ON storage.objects FOR SELECT USING ( bucket_id = 'avatars' );
CREATE POLICY "Allow Public Delete Avatars" ON storage.objects FOR DELETE USING ( bucket_id = 'avatars' );

COMMIT;
