-- =====================================================
-- FIX NOTIFICATION TYPE CHECK CONSTRAINT
-- This script fixes the error: "new row for relation notifications 
-- violates check constraint notifications_type_check"
-- Run this in Supabase SQL Editor
-- =====================================================

-- 1. Ensure any non-compliant types are normalized to 'info' (safety step)
-- This includes 'request' if it was somehow inserted before constraint was active,
-- but the goal here is to explicitly ALLOW 'request'.
UPDATE public.notifications 
SET type = 'info' 
WHERE type IS NOT NULL 
  AND type NOT IN ('info', 'success', 'warning', 'error', 'points', 'event', 'certificate', 'permission', 'request');

-- 2. Drop and recreate the constraint with 'request' included
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check 
  CHECK (type IN ('info', 'success', 'warning', 'error', 'points', 'event', 'certificate', 'permission', 'request'));

-- 3. Verify columns exist (data vs metadata inconsistency fix)
DO $$
BEGIN
    -- Ensure 'data' column exists (used by most triggers)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'data') THEN
        ALTER TABLE public.notifications ADD COLUMN data JSONB DEFAULT '{}'::jsonb;
    END IF;
END $$;
