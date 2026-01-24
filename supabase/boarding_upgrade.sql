-- =====================================================
-- BOARDING SYSTEM UPGRADE - DYNAMIC TIME SLOTS
-- Run this in Supabase SQL Editor to enable dynamic boarding
-- =====================================================

-- 1. Create Boarding Time Slots Table
CREATE TABLE IF NOT EXISTS boarding_time_slots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL, -- e.g., 'Điểm danh Sáng', 'Điểm danh Tối'
    start_time TIME NOT NULL, -- e.g., '06:30'
    end_time TIME NOT NULL, -- e.g., '07:00'
    is_active BOOLEAN DEFAULT true,
    order_index INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create Boarding Attendance Log Table (Slot-based)
CREATE TABLE IF NOT EXISTS boarding_attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    slot_id UUID NOT NULL REFERENCES boarding_time_slots(id) ON DELETE CASCADE,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    checkin_time TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'on_time' CHECK (status IN ('on_time', 'late')),
    UNIQUE(user_id, slot_id, date)
);

-- 3. Add face_descriptor to event_participants
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='event_participants' AND column_name='face_descriptor') THEN
        ALTER TABLE event_participants ADD COLUMN face_descriptor TEXT;
    END IF;
END $$;

-- 4. Add point configuration for boarding
INSERT INTO system_configs (key, value, description)
VALUES ('points_late_boarding', '2', 'Số điểm bị trừ khi điểm danh nội trú muộn')
ON CONFLICT (key) DO NOTHING;

-- 5. Add missing columns to users table
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='face_descriptor') THEN
        ALTER TABLE users ADD COLUMN face_descriptor TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='student_code') THEN
        ALTER TABLE users ADD COLUMN student_code TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='organization') THEN
        ALTER TABLE users ADD COLUMN organization TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='birth_date') THEN
        ALTER TABLE users ADD COLUMN birth_date DATE;
    END IF;
END $$;

-- 6. Ensure events table has checkin_method (for Event hybrid mode)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='events' AND column_name='checkin_method') THEN
        ALTER TABLE events ADD COLUMN checkin_method TEXT DEFAULT 'qr';
    END IF;
END $$;

-- 7. Fix FK constraint for point_logs to allow deleting events
ALTER TABLE point_logs 
DROP CONSTRAINT IF EXISTS point_logs_event_id_fkey;

ALTER TABLE point_logs 
ADD CONSTRAINT point_logs_event_id_fkey 
FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE;

-- 8. Enable Realtime for new tables (with safety check)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'boarding_time_slots') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE boarding_time_slots;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'boarding_attendance') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE boarding_attendance;
    END IF;
END $$;

-- 9. Sample Time Slots
INSERT INTO boarding_time_slots (name, start_time, end_time, order_index)
VALUES 
    ('Điểm danh Sáng', '06:30:00', '07:00:00', 1),
    ('Điểm danh Trưa', '11:45:00', '12:15:00', 2),
    ('Điểm danh Tối', '21:30:00', '22:00:00', 3)
ON CONFLICT DO NOTHING;
