-- =====================================================
-- UPDATE EXISTING NOTIFICATIONS TABLE (SAFE MODE)
-- =====================================================

-- 1. Ensure columns exist (Safe updates only)
DO $$
BEGIN
    -- Add 'data' if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'data') THEN
        ALTER TABLE notifications ADD COLUMN data JSONB;
    END IF;

    -- Add 'is_read' if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'is_read') THEN
        ALTER TABLE notifications ADD COLUMN is_read BOOLEAN DEFAULT FALSE;
    END IF;
    
    -- Rename 'read' to 'is_read' if exists (fix reserved keyword)
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'read') THEN
        ALTER TABLE notifications RENAME COLUMN "read" TO is_read;
    END IF;
END $$;

-- 2. Relax constraints to safely allow new types AND keep old data
-- We drop the specific check constraint so any 'type' is allowed.
-- This prevents errors with existing data and allows new types (event, certificate...)
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

-- Optional: If you really want a constraint, we could add one that is very permissive, 
-- but for maximum safety with "old system data", we leave it as unrestricted TEXT.
