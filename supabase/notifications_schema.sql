-- =====================================================
-- NOTIFICATIONS TABLE FOR PUSH SUBSCRIPTIONS
-- Run this in Supabase SQL Editor
-- =====================================================

-- Table to store push notification subscriptions
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, endpoint)
);

-- Table to store in-app notifications
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type TEXT DEFAULT 'info',
  title TEXT NOT NULL,
  message TEXT,
  data JSONB,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure columns exist (if table already existed without them)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'data') THEN
        ALTER TABLE notifications ADD COLUMN data JSONB;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'is_read') THEN
        ALTER TABLE notifications ADD COLUMN is_read BOOLEAN DEFAULT FALSE;
    END IF;
    
    -- Rename 'read' to 'is_read' if it exists (migration from old schema)
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'read') THEN
        ALTER TABLE notifications RENAME COLUMN "read" TO is_read;
    END IF;
END $$;

-- Update type constraint to include new types (safe for existing data)
-- First, normalize any existing types that don't match the new constraint
UPDATE notifications SET type = 'info' 
WHERE type NOT IN ('info', 'success', 'warning', 'error', 'points', 'event', 'certificate', 'permission');

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check 
  CHECK (type IN ('info', 'success', 'warning', 'error', 'points', 'event', 'certificate', 'permission'));

-- Enable RLS
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS "Public access push_subscriptions" ON push_subscriptions;
DROP POLICY IF EXISTS "Public access notifications" ON notifications;
CREATE POLICY "Public access push_subscriptions" ON push_subscriptions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access notifications" ON notifications FOR ALL USING (true) WITH CHECK (true);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read) WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);

-- Enable realtime for notifications (skip if already added)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
EXCEPTION WHEN duplicate_object THEN
  -- Already added, ignore
END $$;

-- =====================================================
-- TRIGGER 1: POINT CHANGES
-- =====================================================
CREATE OR REPLACE FUNCTION notify_point_change()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO notifications (user_id, type, title, message, data)
  VALUES (
    NEW.user_id,
    'points',
    CASE WHEN NEW.points > 0 THEN 'Điểm thưởng' ELSE 'Điểm trừ' END,
    COALESCE(NEW.reason, 'Thay đổi điểm số') || ' (' || 
      CASE WHEN NEW.points > 0 THEN '+' ELSE '' END || NEW.points || ' điểm)',
    jsonb_build_object('points', NEW.points, 'reason', NEW.reason, 'type', NEW.type)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_point_notification ON point_logs;
CREATE TRIGGER trigger_point_notification
  AFTER INSERT ON point_logs
  FOR EACH ROW EXECUTE FUNCTION notify_point_change();

-- =====================================================
-- TRIGGER 2: NEW EVENT CREATED
-- Notify all students when a new event is created
-- =====================================================
CREATE OR REPLACE FUNCTION notify_new_event()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert notification for all active students
  INSERT INTO notifications (user_id, type, title, message, data)
  SELECT 
    id,
    'event',
    'Sự kiện mới',
    NEW.title,
    jsonb_build_object('event_id', NEW.id, 'title', NEW.title, 'start_time', NEW.start_time)
  FROM users 
  WHERE role = 'student' AND status = 'active';
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_new_event ON events;
CREATE TRIGGER trigger_new_event
  AFTER INSERT ON events
  FOR EACH ROW EXECUTE FUNCTION notify_new_event();

-- =====================================================
-- TRIGGER 3: CERTIFICATE ISSUED
-- Notify student when they receive a certificate
-- =====================================================
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
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_certificate_notification ON certificates;
CREATE TRIGGER trigger_certificate_notification
  AFTER INSERT ON certificates
  FOR EACH ROW EXECUTE FUNCTION notify_certificate_issued();

-- =====================================================
-- TRIGGER 4: EXIT PERMISSION STATUS CHANGE
-- Notify student when their exit permission is approved/rejected
-- =====================================================
CREATE OR REPLACE FUNCTION notify_exit_permission()
RETURNS TRIGGER AS $$
BEGIN
  -- Only notify when status changes (approved or rejected)
  IF NEW.status IN ('approved', 'rejected') AND (OLD.status IS NULL OR OLD.status != NEW.status) THEN
    INSERT INTO notifications (user_id, type, title, message, data)
    VALUES (
      NEW.student_id,
      'permission',
      CASE 
        WHEN NEW.status = 'approved' THEN 'Đơn xin phép được duyệt'
        ELSE 'Đơn xin phép bị từ chối'
      END,
      CASE 
        WHEN NEW.status = 'approved' THEN 'Đơn xin ra ngoài của bạn đã được phê duyệt'
        ELSE 'Đơn xin ra ngoài của bạn không được chấp thuận'
      END,
      jsonb_build_object('permission_id', NEW.id, 'status', NEW.status, 'reason', NEW.reason)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_exit_permission ON exit_permissions;
CREATE TRIGGER trigger_exit_permission
  AFTER UPDATE ON exit_permissions
  FOR EACH ROW EXECUTE FUNCTION notify_exit_permission();
