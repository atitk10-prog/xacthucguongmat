-- Add face_descriptor column to event_participants table
-- This column will store the 128-float array from face-api.js as a text string (JSON)
ALTER TABLE public.event_participants 
ADD COLUMN IF NOT EXISTS face_descriptor text;

-- Add comment
COMMENT ON COLUMN public.event_participants.face_descriptor IS 'JSON string of 128-float array for face recognition';
