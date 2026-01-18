-- Add checkin_mode column with default value 'student'
ALTER TABLE public.events 
ADD COLUMN IF NOT EXISTS checkin_mode text DEFAULT 'student';

-- Add enable_popup column with default value true
ALTER TABLE public.events 
ADD COLUMN IF NOT EXISTS enable_popup boolean DEFAULT true;

-- Update existing records to have defaults (optional, but good for consistency)
UPDATE public.events 
SET checkin_mode = 'student' 
WHERE checkin_mode IS NULL;

UPDATE public.events 
SET enable_popup = true 
WHERE enable_popup IS NULL;
