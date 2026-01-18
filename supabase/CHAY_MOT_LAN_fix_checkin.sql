-- =====================================================
-- EDUCHECK - COMPREHENSIVE CHECK-IN FIX
-- Chạy file này MỘT LẦN trong Supabase SQL Editor
-- =====================================================

-- 1. Thêm cột checkin_mode và enable_popup vào bảng events
ALTER TABLE public.events 
ADD COLUMN IF NOT EXISTS checkin_mode text DEFAULT 'student';

ALTER TABLE public.events 
ADD COLUMN IF NOT EXISTS enable_popup boolean DEFAULT true;

-- 2. Thêm cột participant_id để liên kết check-in với event_participants
ALTER TABLE public.checkins 
ADD COLUMN IF NOT EXISTS participant_id UUID REFERENCES event_participants(id) ON DELETE CASCADE;

-- 3. Thêm cột face_descriptor để lưu mã khuôn mặt (tối ưu tốc độ)
ALTER TABLE public.event_participants 
ADD COLUMN IF NOT EXISTS face_descriptor text;

-- 4. Tạo index để tăng tốc truy vấn
CREATE INDEX IF NOT EXISTS idx_checkins_participant_id ON checkins(participant_id);

-- 5. Cập nhật giá trị mặc định cho các bản ghi cũ
UPDATE public.events SET checkin_mode = 'student' WHERE checkin_mode IS NULL;
UPDATE public.events SET enable_popup = true WHERE enable_popup IS NULL;

-- =====================================================
-- HOÀN TẤT! Sau khi chạy xong, F5 lại trang Check-in
-- =====================================================
