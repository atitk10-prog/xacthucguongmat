-- ADD AFTERNOON COLUMNS TO BOARDING_CHECKINS
ALTER TABLE public.boarding_checkins 
ADD COLUMN IF NOT EXISTS afternoon_in TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS afternoon_in_status TEXT CHECK (afternoon_in_status IN ('on_time', 'late')),
ADD COLUMN IF NOT EXISTS afternoon_out TIMESTAMPTZ;

-- Update comment
COMMENT ON COLUMN public.boarding_checkins.afternoon_in_status IS 'Trạng thái điểm danh buổi chiều: on_time hoặc late';
