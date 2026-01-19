-- =====================================================
-- TẠO BẢNG BOARDING_CONFIG
-- Chạy script này trong Supabase SQL Editor
-- =====================================================

CREATE TABLE IF NOT EXISTS boarding_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT
);

-- Enable RLS
ALTER TABLE boarding_config ENABLE ROW LEVEL SECURITY;

-- Public access policy (like other tables)
DROP POLICY IF EXISTS "Public access boarding_config" ON boarding_config;
CREATE POLICY "Public access boarding_config" ON boarding_config FOR ALL USING (true) WITH CHECK (true);

-- Insert default values
INSERT INTO boarding_config (key, value, description) VALUES
    ('morning_curfew', '07:00', 'Giờ giới nghiêm buổi sáng'),
    ('noon_curfew', '12:30', 'Giờ giới nghiêm buổi trưa'),
    ('evening_curfew', '22:00', 'Giờ giới nghiêm buổi tối'),
    ('checkin_mode', 'both', 'Chế độ check-in: face, qr, hoặc both')
ON CONFLICT (key) DO NOTHING;

-- Verify
SELECT * FROM boarding_config;
