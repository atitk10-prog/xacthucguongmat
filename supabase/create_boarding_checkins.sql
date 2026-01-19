-- =====================================================
-- TẠO BẢNG BOARDING_CHECKINS
-- Chạy script này trong Supabase SQL Editor
-- =====================================================

CREATE TABLE IF NOT EXISTS boarding_checkins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    
    -- Morning checkins
    morning_in TIMESTAMPTZ,
    morning_in_status TEXT CHECK (morning_in_status IN ('on_time', 'late')),
    morning_out TIMESTAMPTZ,
    
    -- Noon checkins  
    noon_in TIMESTAMPTZ,
    noon_in_status TEXT CHECK (noon_in_status IN ('on_time', 'late')),
    noon_out TIMESTAMPTZ,
    
    -- Evening checkins
    evening_in TIMESTAMPTZ,
    evening_in_status TEXT CHECK (evening_in_status IN ('on_time', 'late')),
    evening_out TIMESTAMPTZ,
    
    -- Additional fields
    exit_permission BOOLEAN DEFAULT FALSE,
    notes TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraint: One record per user per day
    UNIQUE(user_id, date)
);

-- Enable RLS
ALTER TABLE boarding_checkins ENABLE ROW LEVEL SECURITY;

-- Public access policy
DROP POLICY IF EXISTS "Public access boarding_checkins" ON boarding_checkins;
CREATE POLICY "Public access boarding_checkins" ON boarding_checkins FOR ALL USING (true) WITH CHECK (true);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_boarding_checkins_date ON boarding_checkins(date);
CREATE INDEX IF NOT EXISTS idx_boarding_checkins_user_date ON boarding_checkins(user_id, date);

-- Verify
SELECT 'boarding_checkins table created successfully' as status;
