-- =====================================================
-- OPTIMIZED FIX: CERTIFICATE SCHEMA & TRIGGERS
-- Designed to avoid "statement timeout" errors
-- =====================================================

-- Increase timeout for this session (1 minute)
SET statement_timeout = '60s';

-- 1. Ensure certificates table has columns (Fast ALTER)
ALTER TABLE public.certificates 
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS template_id TEXT DEFAULT 'custom';

-- Ensure qr_verify exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'certificates' AND column_name = 'qr_verify') THEN
        ALTER TABLE certificates ADD COLUMN qr_verify TEXT;
    END IF;
END $$;

-- 2. Optimize Notifications Update (Avoid full table lock if possible)
-- We only update if necessary and in a way that allows index hits if available
UPDATE notifications 
SET type = 'info' 
WHERE type IS NOT NULL 
  AND type NOT IN ('info', 'success', 'warning', 'error', 'points', 'event', 'certificate', 'permission');

-- Add constraint as NOT VALID first (This is INSTANT)
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check 
  CHECK (type IN ('info', 'success', 'warning', 'error', 'points', 'event', 'certificate', 'permission'))
  NOT VALID;

-- Validate it separately (This won't block the ALTER)
ALTER TABLE notifications VALIDATE CONSTRAINT notifications_type_check;

-- 3. Fix Certificate Notification Trigger (With safety)
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

-- 4. Enable Realtime with existence check
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' AND tablename = 'certificates'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE certificates;
    END IF;
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Ignore publication errors
END $$;

-- Reset timeout to default (optional but good practice)
RESET statement_timeout;
