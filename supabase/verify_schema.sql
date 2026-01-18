-- Script kiểm tra và thêm các cột còn thiếu cho bảng users
-- Chạy script này trong SQL Editor của Supabase

DO $$
BEGIN
    -- 1. Thêm cột student_code (Mã số)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'student_code') THEN
        ALTER TABLE users ADD COLUMN student_code TEXT;
        RAISE NOTICE 'Đã thêm cột student_code';
    ELSE
        RAISE NOTICE 'Cột student_code đã tồn tại';
    END IF;

    -- 2. Thêm cột organization (Lớp/Tổ)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'organization') THEN
        ALTER TABLE users ADD COLUMN organization TEXT;
        RAISE NOTICE 'Đã thêm cột organization';
    ELSE
        RAISE NOTICE 'Cột organization đã tồn tại';
    END IF;

    -- 3. Thêm cột face_descriptor (Dữ liệu khuôn mặt)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'face_descriptor') THEN
        ALTER TABLE users ADD COLUMN face_descriptor TEXT;
        RAISE NOTICE 'Đã thêm cột face_descriptor';
    ELSE
        RAISE NOTICE 'Cột face_descriptor đã tồn tại';
    END IF;

    -- 4. Thêm cột avatar_url (Ảnh đại diện/thẻ) - Kiểm tra lại cho chắc
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'avatar_url') THEN
        ALTER TABLE users ADD COLUMN avatar_url TEXT;
        RAISE NOTICE 'Đã thêm cột avatar_url';
    ELSE
        RAISE NOTICE 'Cột avatar_url đã tồn tại';
    END IF;
END $$;
