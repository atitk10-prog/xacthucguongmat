-- =====================================================
-- REPAIR ALL TRIGGERS & FIX "NEW.title" ERROR
-- =====================================================

-- 1. FIX NEW.title ERROR (Events table uses 'name', not 'title')
-- Replacing broken trigger with correct column reference
CREATE OR REPLACE FUNCTION notify_new_event()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert notification for all active students
  INSERT INTO notifications (user_id, type, title, message, data)
  SELECT 
    id,
    'event',
    'Sự kiện mới',
    COALESCE(NEW.name, 'Sự kiện mới'),
    jsonb_build_object('event_id', NEW.id, 'title', NEW.name, 'start_time', NEW.start_time)
  FROM users 
  WHERE role = 'student' AND status = 'active';
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. FIX NEW.student_id ERROR (Exit permissions table uses 'user_id')
CREATE OR REPLACE FUNCTION notify_exit_permission()
RETURNS TRIGGER AS $$
DECLARE
  date_str TEXT;
BEGIN
  -- Only notify when status changes (approved or rejected)
  IF NEW.status IN ('approved', 'rejected') AND (OLD.status IS NULL OR OLD.status != NEW.status) THEN
    -- Format date: DD/MM/YYYY
    date_str := to_char(NEW.exit_time AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY');
    
    INSERT INTO notifications (user_id, type, title, message, data)
    VALUES (
      NEW.user_id,
      'permission',
      CASE 
        WHEN NEW.status = 'approved' THEN 'Đơn xin phép được DUYỆT'
        ELSE 'Đơn xin phép bị TỪ CHỐI'
      END,
      CASE 
        WHEN NEW.status = 'approved' THEN 'Đơn xin nghỉ ngày ' || date_str || ' của bạn đã được phê duyệt.'
        ELSE 'Đơn xin nghỉ ngày ' || date_str || ' đã bị từ chối. Lý do: ' || COALESCE(NEW.rejection_reason, 'Không đạt yêu cầu')
      END,
      jsonb_build_object('permission_id', NEW.id, 'status', NEW.status, 'reason', NEW.reason, 'rejection_reason', NEW.rejection_reason)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. UNIFY POINT NOTIFICATIONS (No Duplicates)
-- This trigger handles the notification creation. Frontend should NOT insert manually.
CREATE OR REPLACE FUNCTION notify_point_change()
RETURNS TRIGGER AS $$
DECLARE
  display_type TEXT;
BEGIN
  -- Map internal type to display text
  CASE NEW.type
    WHEN 'manual_add' THEN display_type := 'Cộng thủ công';
    WHEN 'manual_deduct' THEN display_type := 'Trừ thủ công';
    WHEN 'checkin' THEN display_type := 'Check-in đúng giờ';
    WHEN 'boarding_late' THEN display_type := 'Đi trễ nội trú';
    WHEN 'boarding_absent' THEN display_type := 'Vắng nội trú';
    WHEN 'event_attendance' THEN display_type := 'Tham gia sự kiện';
    ELSE display_type := 'Thay đổi điểm số';
  END CASE;

  INSERT INTO notifications (user_id, type, title, message, data)
  VALUES (
    NEW.user_id,
    'points',
    -- Title format: "+5 điểm" or "-3 điểm"
    CASE WHEN NEW.points > 0 THEN '+' || NEW.points || ' điểm' ELSE NEW.points || ' điểm' END,
    -- Message format: "Bạn được cộng..." or "Bạn bị trừ..."
    CASE 
      WHEN NEW.points > 0 THEN 'Bạn được cộng ' || NEW.points || ' điểm. Lý do: ' || COALESCE(NEW.reason, '')
      ELSE 'Bạn bị trừ ' || ABS(NEW.points) || ' điểm. Lý do: ' || COALESCE(NEW.reason, '')
    END,
    jsonb_build_object(
        'points', NEW.points, 
        'reason', NEW.reason, 
        'type', NEW.type,
        'display_type', display_type
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. CLEANUP OLD TRIGGERS (Prevent Double Triggers)
DROP TRIGGER IF EXISTS trigger_new_event ON events;
CREATE TRIGGER trigger_new_event AFTER INSERT ON events FOR EACH ROW EXECUTE FUNCTION notify_new_event();

DROP TRIGGER IF EXISTS trigger_exit_permission ON exit_permissions;
CREATE TRIGGER trigger_exit_permission AFTER UPDATE ON exit_permissions FOR EACH ROW EXECUTE FUNCTION notify_exit_permission();

DROP TRIGGER IF EXISTS trigger_point_notification ON point_logs;
CREATE TRIGGER trigger_point_notification AFTER INSERT ON point_logs FOR EACH ROW EXECUTE FUNCTION notify_point_change();

-- Drop potential duplicate/renamed triggers just in case
DROP TRIGGER IF EXISTS on_point_change ON point_logs;
DROP TRIGGER IF EXISTS on_exit_update ON exit_permissions;
