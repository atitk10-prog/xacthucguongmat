-- =====================================================
-- FIX CERTIFICATE SCHEMA & TRIGGERS
-- Run this in Supabase SQL Editor to fix 500 Internal Server Error
-- =====================================================

-- 1. Ensure certificates table has all new columns
ALTER TABLE public.certificates 
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS template_id TEXT DEFAULT 'custom';

-- Ensure qr_verify exist (was in reset_schema but just in case)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'certificates' AND column_name = 'qr_verify') THEN
        ALTER TABLE certificates ADD COLUMN qr_verify TEXT;
    END IF;
END $$;

-- 2. Fix Notifications Type Constraint (Critical for triggers)
-- First, normalize any existing types
UPDATE notifications SET type = 'info' 
WHERE type NOT IN ('info', 'success', 'warning', 'error', 'points', 'event', 'certificate', 'permission');

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check 
  CHECK (type IN ('info', 'success', 'warning', 'error', 'points', 'event', 'certificate', 'permission'));

-- 3. Restore/Fix Certificate Notification Trigger
CREATE OR REPLACE FUNCTION notify_certificate_issued()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO notifications (user_id, type, title, message, data)
  VALUES (
    NEW.user_id,
    'certificate',
    'Giấy chứng nhận mới',
    'Bạn đã được cấp giấy chứng nhận: ' || COALESCE(NEW.title, 'Chứng nhận'),
    jsonb_build_object('certificate_id', NEW.id, 'title', NEW.title)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Prevent trigger failure from blocking certificate creation
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_certificate_notification ON certificates;
CREATE TRIGGER trigger_certificate_notification
  AFTER INSERT ON certificates
  FOR EACH ROW EXECUTE FUNCTION notify_certificate_issued();

-- 4. Enable Realtime if not already enabled
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'certificates'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE certificates;
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Handle gracefully if publication doesn't exist
END $$;
