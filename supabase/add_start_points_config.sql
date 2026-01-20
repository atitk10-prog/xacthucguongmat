-- Add start_points config if it doesn't exist
INSERT INTO system_configs (key, value) 
VALUES ('start_points', '100') 
ON CONFLICT (key) DO NOTHING;
