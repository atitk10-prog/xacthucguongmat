-- Add status columns to boarding_checkins table
ALTER TABLE public.boarding_checkins
ADD COLUMN IF NOT EXISTS morning_in_status text, -- 'on_time' | 'late'
ADD COLUMN IF NOT EXISTS noon_in_status text,
ADD COLUMN IF NOT EXISTS evening_in_status text;

-- Optional: Add constraint to restrict values
-- ALTER TABLE public.boarding_checkins 
-- ADD CONSTRAINT check_morning_status CHECK (morning_in_status IN ('on_time', 'late'));

-- Add comment
COMMENT ON COLUMN public.boarding_checkins.morning_in_status IS 'Status of checkin: on_time or late';
