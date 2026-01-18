-- =====================================================
-- EDUCHECK SUPABASE SCHEMA - COMPLETE v2.0
-- Dựa trên EduCheck_Complete.gs
-- Run this in Supabase SQL Editor
-- =====================================================

-- =====================================================
-- 1. USERS TABLE
-- Columns: id, email, password_hash, full_name, role, class_id, room_id, zone, avatar_url, face_vector, qr_code, status, created_at, total_points
-- =====================================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  full_name TEXT NOT NULL,
  role TEXT DEFAULT 'user' CHECK (role IN ('admin', 'teacher', 'student', 'guest', 'user')),
  class_id TEXT,
  room_id TEXT,
  zone TEXT,
  avatar_url TEXT,
  face_vector TEXT,
  qr_code TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  total_points INTEGER DEFAULT 0
);

-- =====================================================
-- 2. EVENTS TABLE
-- Columns: id, name, type, start_time, end_time, location, target_audience, checkin_method, qr_code, late_threshold_mins, points_on_time, points_late, points_absent, require_face, face_threshold, created_by, status, created_at
-- =====================================================
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT DEFAULT 'học_tập',
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  location TEXT,
  target_audience TEXT DEFAULT 'all',
  checkin_method TEXT DEFAULT 'qr',
  qr_code TEXT,
  late_threshold_mins INTEGER DEFAULT 15,
  points_on_time INTEGER DEFAULT 10,
  points_late INTEGER DEFAULT -5,
  points_absent INTEGER DEFAULT -10,
  require_face BOOLEAN DEFAULT false,
  face_threshold INTEGER DEFAULT 60,
  created_by UUID REFERENCES users(id),
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 3. CHECKINS TABLE
-- Columns: id, event_id, user_id, checkin_time, status, face_confidence, face_verified, points_earned, photo_url, device_info, ip_address
-- =====================================================
CREATE TABLE IF NOT EXISTS checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
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
-- 4. BOARDING_CHECKINS TABLE
-- Columns: id, user_id, date, morning_in, morning_out, evening_in, evening_out, exit_permission, notes
-- =====================================================
CREATE TABLE IF NOT EXISTS boarding_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  morning_in TIMESTAMPTZ,
  morning_out TIMESTAMPTZ,
  evening_in TIMESTAMPTZ,
  evening_out TIMESTAMPTZ,
  exit_permission BOOLEAN DEFAULT false,
  notes TEXT,
  UNIQUE(user_id, date)
);

-- =====================================================
-- 5. ATTENDANCE_SCORES TABLE
-- Columns: id, user_id, period, total_events, attended, on_time_count, late_count, absent_count, total_points, rank
-- =====================================================
CREATE TABLE IF NOT EXISTS attendance_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  total_events INTEGER DEFAULT 0,
  attended INTEGER DEFAULT 0,
  on_time_count INTEGER DEFAULT 0,
  late_count INTEGER DEFAULT 0,
  absent_count INTEGER DEFAULT 0,
  total_points INTEGER DEFAULT 0,
  rank INTEGER,
  UNIQUE(user_id, period)
);

-- =====================================================
-- 6. CERTIFICATES TABLE
-- Columns: id, user_id, event_id, type, title, issued_date, qr_verify, pdf_url, status
-- =====================================================
CREATE TABLE IF NOT EXISTS certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id UUID REFERENCES events(id),
  type TEXT DEFAULT 'participation',
  title TEXT NOT NULL,
  issued_date TIMESTAMPTZ DEFAULT NOW(),
  qr_verify TEXT,
  pdf_url TEXT,
  status TEXT DEFAULT 'active'
);

-- =====================================================
-- 7. CLASSES TABLE
-- Columns: id, name, grade, homeroom_teacher_id, student_count
-- =====================================================
CREATE TABLE IF NOT EXISTS classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  grade TEXT,
  homeroom_teacher_id UUID REFERENCES users(id),
  student_count INTEGER DEFAULT 0
);

-- =====================================================
-- 8. ROOMS TABLE
-- Columns: id, name, zone, capacity, manager_id
-- =====================================================
CREATE TABLE IF NOT EXISTS rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  zone TEXT NOT NULL,
  capacity INTEGER DEFAULT 8,
  manager_id UUID REFERENCES users(id)
);

-- =====================================================
-- 9. CONFIGS (system_configs) TABLE
-- Columns: key, value, description
-- =====================================================
CREATE TABLE IF NOT EXISTS system_configs (
  key TEXT PRIMARY KEY,
  value TEXT,
  description TEXT
);

-- =====================================================
-- 10. POINT_LOGS TABLE
-- Columns: id, user_id, points, reason, type, event_id, created_by, created_at
-- =====================================================
CREATE TABLE IF NOT EXISTS point_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  points INTEGER NOT NULL,
  reason TEXT,
  type TEXT DEFAULT 'manual',
  event_id UUID REFERENCES events(id),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 11. EVENT_PARTICIPANTS TABLE
-- Columns: id, event_id, full_name, birth_date, organization, address, email, phone, avatar_url, created_at, updated_at
-- =====================================================
CREATE TABLE IF NOT EXISTS event_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  birth_date DATE,
  organization TEXT,
  address TEXT,
  email TEXT,
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE boarding_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE point_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_participants ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Public access users" ON users;
DROP POLICY IF EXISTS "Public access events" ON events;
DROP POLICY IF EXISTS "Public access checkins" ON checkins;
DROP POLICY IF EXISTS "Public access boarding_checkins" ON boarding_checkins;
DROP POLICY IF EXISTS "Public access attendance_scores" ON attendance_scores;
DROP POLICY IF EXISTS "Public access certificates" ON certificates;
DROP POLICY IF EXISTS "Public access classes" ON classes;
DROP POLICY IF EXISTS "Public access rooms" ON rooms;
DROP POLICY IF EXISTS "Public access system_configs" ON system_configs;
DROP POLICY IF EXISTS "Public access point_logs" ON point_logs;
DROP POLICY IF EXISTS "Public access event_participants" ON event_participants;

-- Create public access policies (for development)
CREATE POLICY "Public access users" ON users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access events" ON events FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access checkins" ON checkins FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access boarding_checkins" ON boarding_checkins FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access attendance_scores" ON attendance_scores FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access certificates" ON certificates FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access classes" ON classes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access rooms" ON rooms FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access system_configs" ON system_configs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access point_logs" ON point_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access event_participants" ON event_participants FOR ALL USING (true) WITH CHECK (true);

-- =====================================================
-- INDEXES
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_start_time ON events(start_time);
CREATE INDEX IF NOT EXISTS idx_checkins_event_id ON checkins(event_id);
CREATE INDEX IF NOT EXISTS idx_checkins_user_id ON checkins(user_id);
CREATE INDEX IF NOT EXISTS idx_boarding_user_date ON boarding_checkins(user_id, date);
CREATE INDEX IF NOT EXISTS idx_point_logs_user ON point_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_certificates_user ON certificates(user_id);
CREATE INDEX IF NOT EXISTS idx_participants_event ON event_participants(event_id);

-- =====================================================
-- DEFAULT ADMIN USER
-- =====================================================
INSERT INTO users (email, full_name, password_hash, role, status)
VALUES ('admin@educheck.com', 'Quản trị viên', 'admin123', 'admin', 'active')
ON CONFLICT (email) DO NOTHING;

-- =====================================================
-- SAMPLE DATA
-- =====================================================
-- Phòng nội trú
INSERT INTO rooms (name, zone, capacity) VALUES
  ('101', 'A', 8), ('102', 'A', 8), ('103', 'A', 8), ('104', 'A', 8),
  ('201', 'B', 6), ('202', 'B', 6), ('203', 'B', 6), ('204', 'B', 6)
ON CONFLICT DO NOTHING;

-- Cấu hình mặc định
INSERT INTO system_configs (key, value, description) VALUES
  ('school_name', 'Trường THPT ABC', 'Tên trường'),
  ('school_address', '123 Đường XYZ', 'Địa chỉ'),
  ('points_checkin_ontime', '10', 'Điểm check-in đúng giờ'),
  ('points_checkin_late', '-5', 'Điểm check-in muộn'),
  ('points_checkin_absent', '-10', 'Điểm vắng mặt'),
  ('points_boarding_ontime', '5', 'Điểm nội trú đúng giờ'),
  ('points_boarding_late', '-3', 'Điểm nội trú muộn'),
  ('points_manual_max', '50', 'Điểm tối đa thủ công'),
  ('late_threshold_default', '15', 'Phút tính đi muộn'),
  ('face_threshold_default', '60', 'Ngưỡng nhận diện (%)')
ON CONFLICT (key) DO NOTHING;

-- Lớp mẫu
INSERT INTO classes (name, grade) VALUES
  ('10A1', '10'), ('10A2', '10'), ('10A3', '10'),
  ('11A1', '11'), ('11A2', '11'),
  ('12A1', '12'), ('12A2', '12')
ON CONFLICT DO NOTHING;
