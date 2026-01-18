-- Add student_code column to event_participants table
-- This column is required for displaying student IDs in the check-in list
ALTER TABLE public.event_participants 
ADD COLUMN IF NOT EXISTS student_code text;

-- Add comment
COMMENT ON COLUMN public.event_participants.student_code IS 'Student ID code (e.g. HS001)';
