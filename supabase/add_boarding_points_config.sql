INSERT INTO system_configs (key, value)
VALUES ('points_late_boarding', '-2')
ON CONFLICT (key) DO NOTHING;
