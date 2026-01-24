-- =====================================================
-- ENABLE REALTIME FOR POINT LOGS
-- Run this in Supabase SQL Editor to enable real-time updates
-- =====================================================

-- Add point_logs to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE point_logs;

-- (Optional) Enable Full Replica for getting OLD values on UPDATE
-- ALTER TABLE point_logs REPLICA IDENTITY FULL;
