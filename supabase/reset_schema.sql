-- =====================================================
-- EDUCHECK - RESET VÀ TẠO LẠI TOÀN BỘ SCHEMA
-- Copy toàn bộ file này vào Supabase SQL Editor và Run
-- =====================================================

-- XÓA TOÀN BỘ BẢNG CŨ (theo thứ tự dependency)
DROP TABLE IF EXISTS checkins CASCADE;
DROP TABLE IF EXISTS event_participants CASCADE;
DROP TABLE IF EXISTS boarding_checkins CASCADE;
DROP TABLE IF EXISTS attendance_scores CASCADE;
DROP TABLE IF EXISTS certificates CASCADE;
DROP TABLE IF EXISTS point_logs CASCADE;
DROP TABLE IF EXISTS events CASCADE;
DROP TABLE IF EXISTS rooms CASCADE;
DROP TABLE IF EXISTS classes CASCADE;
DROP TABLE IF EXISTS system_configs CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- =====================================================
-- 1. USERS TABLE
-- =====================================================
CREATE TABLE users (
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
-- 2. EVENTS TABLE (ĐẦY ĐỦ CÁC CỘT)
-- =====================================================
CREATE TABLE events (
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
-- 3. EVENT_PARTICIPANTS TABLE
-- =====================================================
CREATE TABLE event_participants (
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
-- 4. CHECKINS TABLE
-- =====================================================
CREATE TABLE checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  participant_id UUID REFERENCES event_participants(id) ON DELETE CASCADE,
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
-- 5. ROOMS TABLE
-- =====================================================
CREATE TABLE rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  zone TEXT NOT NULL,
  capacity INTEGER DEFAULT 8,
  manager_id UUID REFERENCES users(id)
);

-- =====================================================
-- 6. BOARDING_CHECKINS TABLE
-- =====================================================
CREATE TABLE boarding_checkins (
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
-- 7. CLASSES TABLE
-- =====================================================
CREATE TABLE classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  grade TEXT,
  homeroom_teacher_id UUID REFERENCES users(id),
  student_count INTEGER DEFAULT 0
);

-- =====================================================
-- 8. SYSTEM_CONFIGS TABLE
-- =====================================================
CREATE TABLE system_configs (
  key TEXT PRIMARY KEY,
  value TEXT,
  description TEXT
);

-- =====================================================
-- 9. POINT_LOGS TABLE
-- =====================================================
CREATE TABLE point_logs (
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
-- 10. CERTIFICATES TABLE
-- =====================================================
CREATE TABLE certificates (
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
-- 11. ATTENDANCE_SCORES TABLE
-- =====================================================
CREATE TABLE attendance_scores (
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
-- ROW LEVEL SECURITY
-- =====================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE boarding_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE point_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access users" ON users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access events" ON events FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access event_participants" ON event_participants FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access checkins" ON checkins FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access rooms" ON rooms FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access boarding_checkins" ON boarding_checkins FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access classes" ON classes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access system_configs" ON system_configs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access point_logs" ON point_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access certificates" ON certificates FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access attendance_scores" ON attendance_scores FOR ALL USING (true) WITH CHECK (true);

-- =====================================================
-- ADMIN MẶC ĐỊNH
-- =====================================================
INSERT INTO users (email, full_name, password_hash, role, status)
VALUES ('admin@educheck.com', 'Quản trị viên', 'admin123', 'admin', 'active');

-- =====================================================
-- DỮ LIỆU MẪU
-- =====================================================
INSERT INTO rooms (name, zone, capacity) VALUES
  ('101', 'A', 8), ('102', 'A', 8), ('103', 'A', 8),
  ('201', 'B', 6), ('202', 'B', 6);

INSERT INTO classes (name, grade) VALUES
  ('10A1', '10'), ('10A2', '10'),
  ('11A1', '11'), ('12A1', '12');

INSERT INTO system_configs (key, value, description) VALUES
  ('school_name', 'Trường THPT ABC', 'Tên trường'),
  ('late_threshold_default', '15', 'Phút tính đi muộn'),
  ('points_checkin_ontime', '10', 'Điểm check-in đúng giờ'),
  ('points_checkin_late', '-5', 'Điểm check-in muộn');
