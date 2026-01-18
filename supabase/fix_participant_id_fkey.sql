-- =====================================================
-- FIX FOREIGN KEY CONSTRAINT
-- Chạy file này trong Supabase SQL Editor
-- =====================================================

-- 1. Bỏ constraint foreign key hiện tại (nếu có)
ALTER TABLE public.checkins 
DROP CONSTRAINT IF EXISTS checkins_participant_id_fkey;

-- 2. Thêm lại với NULLABLE và không bắt buộc
ALTER TABLE public.checkins 
ADD COLUMN IF NOT EXISTS participant_id UUID;

-- 3. Thêm foreign key constraint mới cho phép NULL
ALTER TABLE public.checkins 
ADD CONSTRAINT checkins_participant_id_fkey 
FOREIGN KEY (participant_id) 
REFERENCES event_participants(id) 
ON DELETE SET NULL;

-- =====================================================
-- HOÀN TẤT! F5 lại trang Check-in
-- =====================================================
