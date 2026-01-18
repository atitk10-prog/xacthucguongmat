-- Create a view for easier reporting queries
CREATE OR REPLACE VIEW event_attendance_view AS
SELECT 
    c.id as checkin_id,
    c.event_id,
    c.checkin_time,
    c.status,
    c.points_earned,
    c.participant_id,
    ep.full_name as user_name,
    ep.organization as class_id,
    ep.avatar_url,
    e.name as event_name,
    e.start_time as event_start
FROM checkins c
JOIN events e ON c.event_id = e.id
LEFT JOIN event_participants ep ON c.participant_id = ep.id;

-- Function to get event stats efficiently
CREATE OR REPLACE FUNCTION get_event_stats(p_event_id UUID)
RETURNS TABLE (
    total_participants BIGINT,
    total_checkins BIGINT,
    on_time_count BIGINT,
    late_count BIGINT,
    avg_points NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        (SELECT COUNT(*) FROM event_participants WHERE event_id = p_event_id) as total_participants,
        COUNT(*) as total_checkins,
        COUNT(*) FILTER (WHERE status = 'on_time') as on_time_count,
        COUNT(*) FILTER (WHERE status = 'late') as late_count,
        COALESCE(AVG(points_earned), 0) as avg_points
    FROM checkins
    WHERE event_id = p_event_id;
END;
$$ LANGUAGE plpgsql;
