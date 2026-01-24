-- =====================================================
-- NOTIFY ADMINS ON NEW EXIT PERMISSION REQUEST
-- =====================================================

CREATE OR REPLACE FUNCTION notify_admin_new_request()
RETURNS TRIGGER AS $$
DECLARE
  student_name TEXT;
  admin_record RECORD;
BEGIN
  -- Get student name
  SELECT full_name INTO student_name FROM users WHERE id = NEW.user_id;
  
  -- Notify ALL Admins and Teachers (Managers)
  FOR admin_record IN 
    SELECT id FROM users WHERE role IN ('admin', 'teacher') AND status = 'active'
  LOOP
    INSERT INTO notifications (user_id, type, title, message, data)
    VALUES (
      admin_record.id,
      'request', -- New type for requests
      'Đơn xin phép mới',
      'Học sinh ' || COALESCE(student_name, 'Unknown') || ' vừa gửi một đơn xin phép mới.',
      jsonb_build_object(
        'permission_id', NEW.id, 
        'student_id', NEW.user_id,
        'student_name', student_name,
        'reason', NEW.reason,
        'exit_time', NEW.exit_time
      )
    );
  END LOOP;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create Trigger
DROP TRIGGER IF EXISTS trigger_notify_admin_new_request ON exit_permissions;
CREATE TRIGGER trigger_notify_admin_new_request
  AFTER INSERT ON exit_permissions
  FOR EACH ROW EXECUTE FUNCTION notify_admin_new_request();
