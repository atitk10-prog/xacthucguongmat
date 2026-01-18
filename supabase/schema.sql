-- =====================================================
-- EDUCHECK SUPABASE SCHEMA - COMPLETE
-- Run this in Supabase SQL Editor
-- =====================================================

-- Drop existing tables if needed (uncomment if re-running)
-- DROP TABLE IF EXISTS checkins CASCADE;
-- DROP TABLE IF EXISTS event_participants CASCADE;
-- DROP TABLE IF EXISTS events CASCADE;
-- DROP TABLE IF EXISTS users CASCADE;

-- =====================================================
-- USERS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  password_hash TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('admin', 'teacher', 'student', 'guest', 'user')),
  avatar_url TEXT,
  total_points INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  class_id UUID,
  room_id UUID,
  zone TEXT,
  face_vector TEXT,
  qr_code TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- EVENTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  type TEXT DEFAULT 'meeting',
  location TEXT,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  target_audience TEXT,
  checkin_method TEXT DEFAULT 'qr_face' CHECK (checkin_method IN ('qr', 'qr_face', 'link')),
  qr_code TEXT,
  require_face BOOLEAN DEFAULT true,
  face_threshold INTEGER DEFAULT 60,
  late_threshold_mins INTEGER DEFAULT 15,
  points_on_time INTEGER DEFAULT 10,
  points_late INTEGER DEFAULT -5,
  points_absent INTEGER DEFAULT -10,
  status TEXT DEFAULT 'active' CHECK (status IN ('draft', 'active', 'completed')),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- EVENT PARTICIPANTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS event_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  avatar_url TEXT,
  birth_date DATE,
  organization TEXT,
  address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(event_id, full_name)
);

-- =====================================================
-- CHECKINS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID,
  participant_id UUID REFERENCES event_participants(id),
  checkin_time TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'on_time' CHECK (status IN ('on_time', 'late', 'absent')),
  face_confidence REAL DEFAULT 0,
  face_verified BOOLEAN DEFAULT false,
  points_earned INTEGER DEFAULT 0,
  photo_url TEXT,
  device_info TEXT,
  ip_address TEXT
);

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkins ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Public access users" ON users;
DROP POLICY IF EXISTS "Public access events" ON events;
DROP POLICY IF EXISTS "Public access participants" ON event_participants;
DROP POLICY IF EXISTS "Public access checkins" ON checkins;

-- Create public access policies (for development - restrict in production)
CREATE POLICY "Public access users" ON users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access events" ON events FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access participants" ON event_participants FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access checkins" ON checkins FOR ALL USING (true) WITH CHECK (true);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_events_start_time ON events(start_time);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_participants_event_id ON event_participants(event_id);
CREATE INDEX IF NOT EXISTS idx_checkins_event_id ON checkins(event_id);
CREATE INDEX IF NOT EXISTS idx_checkins_participant_id ON checkins(participant_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- =====================================================
-- DEFAULT ADMIN USER
-- =====================================================
INSERT INTO users (email, full_name, password_hash, role, status)
VALUES ('admin@educheck.com', 'Quản trị viên', 'admin123', 'admin', 'active')
ON CONFLICT (email) DO NOTHING;

-- =====================================================
-- SAMPLE DATA (Optional - uncomment to insert)
-- =====================================================
/*
-- Sample event
INSERT INTO events (name, description, location, start_time, end_time, require_face, created_by)
SELECT 
  'Sự kiện Test', 
  'Sự kiện để test hệ thống', 
  'Phòng họp A',
  NOW(),
  NOW() + INTERVAL '2 hours',
  true,
  id
FROM users WHERE email = 'admin@educheck.com';

-- Sample participants
INSERT INTO event_participants (event_id, full_name, organization)
SELECT 
  e.id,
  'Nguyễn Văn A',
  'Công ty ABC'
FROM events e WHERE e.name = 'Sự kiện Test';

INSERT INTO event_participants (event_id, full_name, organization)
SELECT 
  e.id,
  'Trần Thị B',
  'Trường XYZ'
FROM events e WHERE e.name = 'Sự kiện Test';
*/
