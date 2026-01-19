-- =====================================================
-- TẠO BẢNG ROOMS (nếu chưa có)
-- Chạy script này trong Supabase SQL Editor
-- =====================================================

CREATE TABLE IF NOT EXISTS rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    zone TEXT NOT NULL DEFAULT 'A',
    capacity INTEGER NOT NULL DEFAULT 8,
    manager_id UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraint: Unique room name per zone
    UNIQUE(name, zone)
);

-- Enable RLS
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;

-- Public access policy
DROP POLICY IF EXISTS "Public access rooms" ON rooms;
CREATE POLICY "Public access rooms" ON rooms FOR ALL USING (true) WITH CHECK (true);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_rooms_zone ON rooms(zone);

-- Sample data (optional)
-- INSERT INTO rooms (name, zone, capacity) VALUES
--     ('101', 'A', 8),
--     ('102', 'A', 8),
--     ('201', 'B', 6),
--     ('202', 'B', 6)
-- ON CONFLICT DO NOTHING;

-- Verify
SELECT 'rooms table created successfully' as status;
