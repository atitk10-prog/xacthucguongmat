-- SCRIPT SIÊU CẤP: THÊM CỘT + LÀM MỚI CACHE
-- Chạy cái này chắc chắn được nha anh!

BEGIN;

-- 1. Thêm cột updated_at (Nếu chưa có thì thêm, có rồi thì thôi)
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 2. Ép hệ thống nhận diện cột mới ngay lập tức
NOTIFY pgrst, 'reload schema';

COMMIT;

-- 3. (Tùy chọn) Kiểm tra lại
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'users' AND column_name = 'updated_at';
