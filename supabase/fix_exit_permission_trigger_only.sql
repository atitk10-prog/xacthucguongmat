-- =====================================================
-- FIX EXIT PERMISSION TRIGGER ONLY
-- Run this script to update ONLY the exit permission notification format
-- =====================================================

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
        WHEN NEW.status = 'approved' THEN 'Được duyệt: ' || NEW.reason || ' (' || date_str || ')'
        ELSE 'Từ chối: ' || NEW.reason || ' (' || date_str || ')'
      END,
      CASE 
        WHEN NEW.status = 'approved' THEN 'Đơn xin ra ngoài ngày ' || date_str || ' đã được giáo viên phê duyệt.'
        ELSE 'Đơn xin ra ngoài ngày ' || date_str || ' đã bị từ chối. Lý do: ' || COALESCE(NEW.rejection_reason, 'Không đạt yêu cầu')
      END,
      jsonb_build_object('permission_id', NEW.id, 'status', NEW.status, 'reason', NEW.reason, 'rejection_reason', NEW.rejection_reason)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Re-apply Trigger
DROP TRIGGER IF EXISTS trigger_exit_permission ON exit_permissions;
CREATE TRIGGER trigger_exit_permission
  AFTER UPDATE ON exit_permissions
  FOR EACH ROW EXECUTE FUNCTION notify_exit_permission();

-- Clean up any old duplicate trigger names if they exist
DROP TRIGGER IF EXISTS on_exit_update ON exit_permissions;
