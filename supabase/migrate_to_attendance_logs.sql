-- 1. Tạo bảng điểm danh mới (Dạng Logs - một dòng cho mỗi lượt điểm danh)
CREATE TABLE IF NOT EXISTS public.boarding_attendance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    slot_id UUID REFERENCES public.boarding_time_slots(id) ON DELETE SET NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    checkin_time TIMESTAMPTZ DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'on_time', -- 'on_time', 'late', 'excused'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Đảm bảo học sinh không điểm danh trùng lặp cho cùng 1 slot trong ngày
    CONSTRAINT unique_user_slot_date UNIQUE (user_id, slot_id, date)
);

-- 2. Tạo Index để tối ưu tìm kiếm
CREATE INDEX IF NOT EXISTS idx_boarding_attendance_date ON public.boarding_attendance(date);
CREATE INDEX IF NOT EXISTS idx_boarding_attendance_user_id ON public.boarding_attendance(user_id);

-- 3. ENABLE REALTIME cho bảng mới
ALTER PUBLICATION supabase_realtime ADD TABLE public.boarding_attendance;

-- 4. Chuyển đổi dữ liệu cũ từ boarding_checkins sang boarding_attendance (Optional migration)
-- Lưu ý: Cần biết ID của các slot Sáng, Trưa, Tối để migrade chính xác.
-- Thường các slot này có các ID cố định hoặc tên cố định.
DO $$
DECLARE
    morning_slot_id UUID;
    noon_slot_id UUID;
    evening_slot_id UUID;
BEGIN
    SELECT id INTO morning_slot_id FROM public.boarding_time_slots WHERE name ILIKE '%sáng%' LIMIT 1;
    SELECT id INTO noon_slot_id FROM public.boarding_time_slots WHERE name ILIKE '%trưa%' LIMIT 1;
    SELECT id INTO evening_slot_id FROM public.boarding_time_slots WHERE name ILIKE '%tối%' LIMIT 1;

    -- Migrate morning_in
    INSERT INTO public.boarding_attendance (user_id, slot_id, date, checkin_time, status)
    SELECT user_id, morning_slot_id, date::DATE, morning_in, COALESCE(morning_in_status, 'on_time')
    FROM public.boarding_checkins
    WHERE morning_in IS NOT NULL AND morning_slot_id IS NOT NULL
    ON CONFLICT DO NOTHING;

    -- Migrate noon_in
    INSERT INTO public.boarding_attendance (user_id, slot_id, date, checkin_time, status)
    SELECT user_id, noon_slot_id, date::DATE, noon_in, COALESCE(noon_in_status, 'on_time')
    FROM public.boarding_checkins
    WHERE noon_in IS NOT NULL AND noon_slot_id IS NOT NULL
    ON CONFLICT DO NOTHING;

    -- Migrate evening_in
    INSERT INTO public.boarding_attendance (user_id, slot_id, date, checkin_time, status)
    SELECT user_id, evening_slot_id, date::DATE, evening_in, COALESCE(evening_in_status, 'on_time')
    FROM public.boarding_checkins
    WHERE evening_in IS NOT NULL AND evening_slot_id IS NOT NULL
    ON CONFLICT DO NOTHING;
END $$;
