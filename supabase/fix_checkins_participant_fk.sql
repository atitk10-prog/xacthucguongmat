-- Fix CHECK-IN Table: Add participant_id column to support event_participants
-- The current schema only has user_id (for users table), but we need participant_id (for event_participants)

-- 1. Add participant_id column if not exists
ALTER TABLE public.checkins 
ADD COLUMN IF NOT EXISTS participant_id UUID REFERENCES event_participants(id) ON DELETE CASCADE;

-- 2. Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_checkins_participant_id ON checkins(participant_id);

-- Note: The checkins table now supports BOTH:
-- - user_id: For check-ins linked to registered users (from users table)
-- - participant_id: For check-ins linked to event participants (from event_participants table)
