-- Add boarding absent points config if not exists
-- Add boarding points config if not exists
INSERT INTO system_configs (key, value, description)
VALUES 
    ('points_absent_boarding', '10', 'Điểm trừ khi vắng điểm danh nội trú'),
    ('points_late_boarding', '2', 'Điểm trừ khi đi muộn nội trú')
ON CONFLICT (key) DO NOTHING;
