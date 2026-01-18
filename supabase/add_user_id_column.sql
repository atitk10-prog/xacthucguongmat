-- Add user_id column to event_participants table to link with users table
ALTER TABLE public.event_participants 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

-- Notify
SELECT 'Migration completed: Added user_id to event_participants table' as status;
