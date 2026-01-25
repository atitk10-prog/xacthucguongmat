-- =====================================================
-- ENABLE REALTIME FOR NOTIFICATIONS & EXIT PERMISSIONS
-- This ensures managers get immediate toast alerts 
-- and students get point/permission updates.
-- Run this in Supabase SQL Editor
-- =====================================================

-- 1. Ensure the publication exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;
END $$;

-- 2. Add notifications table to publication
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
EXCEPTION WHEN duplicate_object THEN
    -- Already added, ignore
END $$;

-- 3. Add exit_permissions table to publication
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE exit_permissions;
EXCEPTION WHEN duplicate_object THEN
    -- Already added, ignore
END $$;

-- 4. Add boarding_checkins (if missing)
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE boarding_checkins;
EXCEPTION WHEN duplicate_object THEN
    -- Already added, ignore
END $$;

-- 5. Add events (optional, but good for real-time dashboard)
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE events;
EXCEPTION WHEN duplicate_object THEN
    -- Already added, ignore
END $$;

-- Optional: Enable full replica identity to get old values if needed
-- ALTER TABLE notifications REPLICA IDENTITY FULL;
-- ALTER TABLE exit_permissions REPLICA IDENTITY FULL;
