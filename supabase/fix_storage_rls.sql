-- Script cấp quyền Upload ảnh cho thư mục 'avatars'
-- Chạy script này trong SQL Editor của Supabase

-- 1. Cho phép Tải lên (Insert)
DROP POLICY IF EXISTS "Allow Public Upload Avatars" ON storage.objects;
CREATE POLICY "Allow Public Upload Avatars"
ON storage.objects FOR INSERT
WITH CHECK ( bucket_id = 'avatars' );

-- 2. Cho phép Cập nhật/Ghi đè (Update)
DROP POLICY IF EXISTS "Allow Public Update Avatars" ON storage.objects;
CREATE POLICY "Allow Public Update Avatars"
ON storage.objects FOR UPDATE
USING ( bucket_id = 'avatars' )
WITH CHECK ( bucket_id = 'avatars' );

-- 3. Cho phép Xem (Select) - (Dự phòng trường hợp chưa bật Public)
DROP POLICY IF EXISTS "Allow Public Select Avatars" ON storage.objects;
CREATE POLICY "Allow Public Select Avatars"
ON storage.objects FOR SELECT
USING ( bucket_id = 'avatars' );

-- 4. Cho phép Xóa (Delete)
DROP POLICY IF EXISTS "Allow Public Delete Avatars" ON storage.objects;
CREATE POLICY "Allow Public Delete Avatars"
ON storage.objects FOR DELETE
USING ( bucket_id = 'avatars' );
