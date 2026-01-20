-- Remove redundant legacy keys
DELETE FROM system_configs 
WHERE key NOT IN (
    'school_name', 
    'school_address', 
    'late_threshold_mins', 
    'points_on_time', 
    'points_late', 
    'start_points',
    'face_threshold'
);
