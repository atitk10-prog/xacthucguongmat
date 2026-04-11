-- ============================================================
-- Supabase Storage Bucket cho Certificate Assets
-- ============================================================
-- Chạy lệnh này trong SQL Editor của Supabase Dashboard
-- hoặc tạo bucket thủ công qua Dashboard > Storage
-- ============================================================

-- 1. Tạo bucket (public để img src có thể load trực tiếp)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'certificate-assets',
    'certificate-assets',
    true,  -- public bucket để <img src="..."> hoạt động không cần auth
    5242880,  -- 5MB max per file
    ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO NOTHING;

-- 2. Policy: Cho phép authenticated users upload
CREATE POLICY "Authenticated users can upload certificate assets"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'certificate-assets');

-- 3. Policy: Cho phép mọi người xem (public)
CREATE POLICY "Public can view certificate assets"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'certificate-assets');

-- 4. Policy: Cho phép authenticated users xóa
CREATE POLICY "Authenticated users can delete certificate assets"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'certificate-assets');

-- 5. Policy: Cho phép authenticated users update
CREATE POLICY "Authenticated users can update certificate assets"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'certificate-assets');
