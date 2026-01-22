-- Add event absent points config if not exists
INSERT INTO system_configs (key, value, description)
VALUES 
    ('points_absent_event', '-10', 'Điểm trừ khi vắng mặt sự kiện')
ON CONFLICT (key) DO NOTHING;
