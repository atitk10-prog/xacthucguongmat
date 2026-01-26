-- =====================================================
-- EDUCHECK SUPABASE COMPLETE SETUP - ALL-IN-ONE
-- Phiên bản: 3.7 (ULTIMATE COMPATIBILITY - Fixed Storage & Realtime)
-- Sửa lỗi thiếu cột: phone, address, birth_date, updated_at, qr_code, etc.
-- Thêm cấu hình Storage Bucket 'avatars' và chính sách bảo mật.
-- Run this in Supabase SQL Editor
-- =====================================================

-- 0. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. USERS TABLE
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  full_name TEXT NOT NULL,
  role TEXT DEFAULT 'user' CHECK (role IN ('admin', 'teacher', 'student', 'guest', 'user')),
  class_id TEXT, -- For legacy compatibility
  room_id TEXT,
  zone TEXT,
  avatar_url TEXT,
  face_vector TEXT,
  face_descriptor TEXT, -- Stored as string JSON
  student_code TEXT,
  organization TEXT,
  qr_code TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  birth_date DATE,
  phone TEXT,
  address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  total_points INTEGER DEFAULT 0
);

-- 2. EVENTS TABLE
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
  checkin_mode TEXT DEFAULT 'standard',
  enable_popup BOOLEAN DEFAULT true,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  radius_meters INTEGER,
  created_by UUID REFERENCES users(id),
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. EVENT_PARTICIPANTS TABLE (External Participants)
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
  student_code TEXT,
  qr_code TEXT,
  face_descriptor TEXT,
  user_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. CHECKINS TABLE (Event check-ins)
CREATE TABLE IF NOT EXISTS checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  participant_id UUID REFERENCES event_participants(id) ON DELETE CASCADE, -- Linked to event_participants
  checkin_time TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'on_time' CHECK (status IN ('on_time', 'late', 'absent')),
  face_confidence REAL DEFAULT 0,
  face_verified BOOLEAN DEFAULT false,
  points_earned INTEGER DEFAULT 0,
  photo_url TEXT,
  device_info TEXT,
  ip_address TEXT
);

-- 4. BOARDING SYSTEM
CREATE TABLE IF NOT EXISTS boarding_time_slots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_active BOOLEAN DEFAULT true,
    order_index INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS boarding_attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    slot_id UUID NOT NULL REFERENCES boarding_time_slots(id) ON DELETE CASCADE,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    checkin_time TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'on_time' CHECK (status IN ('on_time', 'late')),
    UNIQUE(user_id, slot_id, date)
);

CREATE TABLE IF NOT EXISTS boarding_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS exit_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    reason_detail TEXT,
    destination TEXT NOT NULL,
    parent_contact TEXT,
    exit_time TIMESTAMPTZ NOT NULL,
    return_time TIMESTAMPTZ NOT NULL,
    actual_return_time TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    rejection_reason TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4.5 STORAGE BUCKET (For Student Photos)
-- Run this to create the bucket and policies
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Storage Policies
-- Note: Split individual actions because 'UPDATE OR DELETE' is not supported in one command
DROP POLICY IF EXISTS "Cho phep tai anh len" ON storage.objects;
CREATE POLICY "Cho phep tai anh len" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Cho phep xem anh cong khai" ON storage.objects;
CREATE POLICY "Cho phep xem anh cong khai" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Cho phep sua anh" ON storage.objects;
CREATE POLICY "Cho phep sua anh" ON storage.objects FOR UPDATE USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Cho phep xoa anh" ON storage.objects;
CREATE POLICY "Cho phep xoa anh" ON storage.objects FOR DELETE USING (bucket_id = 'avatars');

-- 5. NOTIFICATION SYSTEM
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type TEXT DEFAULT 'info' CHECK (type IN ('info', 'success', 'warning', 'error', 'points', 'event', 'certificate', 'permission', 'request')),
  title TEXT NOT NULL,
  message TEXT,
  data JSONB,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. CERTIFICATES & CONFIGS
CREATE TABLE IF NOT EXISTS certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  type TEXT DEFAULT 'participation',
  title TEXT NOT NULL,
  issued_date TIMESTAMPTZ DEFAULT NOW(),
  qr_verify TEXT,
  pdf_url TEXT,
  status TEXT DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS certificate_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    template_id TEXT NOT NULL,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- 7. TEACHER PERMISSIONS
CREATE TABLE IF NOT EXISTS teacher_permissions (
    module_id TEXT PRIMARY KEY,
    module_name TEXT NOT NULL,
    is_enabled BOOLEAN DEFAULT false,
    can_edit BOOLEAN DEFAULT false,
    can_delete BOOLEAN DEFAULT false,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 8. OTHER TABLES
CREATE TABLE IF NOT EXISTS point_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  points INTEGER NOT NULL,
  reason TEXT,
  type TEXT DEFAULT 'manual', -- 'manual_add', 'manual_deduct', 'checkin', etc
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  zone TEXT NOT NULL,
  capacity INTEGER DEFAULT 8,
  manager_id UUID REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS system_configs (
  key TEXT PRIMARY KEY,
  value TEXT,
  description TEXT
);


-- 9. RLS & SECURITY HELPER
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text AS $$
BEGIN
  RETURN (SELECT role FROM public.users WHERE id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND lower(role) = 'admin');
END;
$$;

-- Enable RLS and Create Policies (Idempotent)
DO $$
DECLARE table_name TEXT;
BEGIN
    FOR table_name IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
        EXECUTE 'ALTER TABLE public.' || table_name || ' ENABLE ROW LEVEL SECURITY';
    END LOOP;
END $$;

-- Policies for USERS
DROP POLICY IF EXISTS "Public Read Users" ON users;
CREATE POLICY "Public Read Users" ON users FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admin All Access Users" ON users;
CREATE POLICY "Admin All Access Users" ON users FOR ALL TO authenticated USING (get_my_role() = 'admin') WITH CHECK (get_my_role() = 'admin');
DROP POLICY IF EXISTS "Self Update Users" ON users;
CREATE POLICY "Self Update Users" ON users FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- All other tables public for easy transition
DROP POLICY IF EXISTS "Public Events" ON events;
CREATE POLICY "Public Events" ON events FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public Checkins" ON checkins;
CREATE POLICY "Public Checkins" ON checkins FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public Boarding" ON boarding_attendance;
CREATE POLICY "Public Boarding" ON boarding_attendance FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public Notifications" ON notifications;
CREATE POLICY "Public Notifications" ON notifications FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public Points" ON point_logs;
CREATE POLICY "Public Points" ON point_logs FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public Configs" ON system_configs;
CREATE POLICY "Public Configs" ON system_configs FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public Exit Permissions" ON exit_permissions;
CREATE POLICY "Public Exit Permissions" ON exit_permissions FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public Certificates" ON certificates;
CREATE POLICY "Public Certificates" ON certificates FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public Boarding Config" ON boarding_config;
CREATE POLICY "Public Boarding Config" ON boarding_config FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public Certificate Configs" ON certificate_configs;
CREATE POLICY "Public Certificate Configs" ON certificate_configs FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public Teacher Permissions" ON teacher_permissions;
CREATE POLICY "Public Teacher Permissions" ON teacher_permissions FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public Participants" ON event_participants;
CREATE POLICY "Public Participants" ON event_participants FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public Rooms" ON rooms;
CREATE POLICY "Public Rooms" ON rooms FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public Boarding Time Slots" ON boarding_time_slots;
CREATE POLICY "Public Boarding Time Slots" ON boarding_time_slots FOR ALL USING (true) WITH CHECK (true);


-- 10. SECURE FUNCTIONS & RPC
CREATE OR REPLACE FUNCTION public.add_user_points(p_user_id UUID, p_points INTEGER)
RETURNS VOID AS $$
BEGIN
    UPDATE public.users
    SET total_points = COALESCE(total_points, 0) + p_points
    WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.update_teacher_module_permission(
    target_id TEXT,
    updates JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Bạn không có quyền Admin.';
    END IF;

    UPDATE public.teacher_permissions
    SET 
        is_enabled = COALESCE((updates->>'is_enabled')::boolean, is_enabled),
        can_edit = COALESCE((updates->>'can_edit')::boolean, can_edit),
        can_delete = COALESCE((updates->>'can_delete')::boolean, can_delete),
        updated_at = now()
    WHERE module_id = target_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_user_points TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_user_points TO service_role;
GRANT EXECUTE ON FUNCTION public.update_teacher_module_permission TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_teacher_module_permission TO service_role;


-- 11. TRIGGERS
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_certificates_updated_at ON certificates;
-- (Add triggers for each table as needed)

-- 12. REALTIME PUBLICATION
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    DROP PUBLICATION supabase_realtime;
  END IF;
  
  CREATE PUBLICATION supabase_realtime FOR ALL TABLES;
END $$;

-- 13. DEFAULT DATA
INSERT INTO users (email, full_name, password_hash, role, status)
VALUES ('admin@educheck.com', 'Quản trị viên', 'admin123', 'admin', 'active')
ON CONFLICT (email) DO NOTHING;

INSERT INTO boarding_time_slots (name, start_time, end_time, order_index)
VALUES 
    ('Điểm danh Sáng', '05:00', '10:00', 1),
    ('Điểm danh Trưa', '11:00', '13:00', 2),
    ('Điểm danh Tối', '21:00', '23:00', 3)
ON CONFLICT DO NOTHING;

INSERT INTO system_configs (key, value, description) VALUES
  ('school_name', 'Trường THPT ABC', 'Tên trường'),
  ('points_late_boarding', '2', 'Điểm trừ nội trú muộn'),
  ('late_threshold_default', '15', 'Phút tính đi muộn'),
  ('face_threshold_default', '60', 'Ngưỡng nhận diện (%)')
ON CONFLICT DO NOTHING;

INSERT INTO boarding_config (key, value, description) VALUES
    ('morning_curfew', '07:00', 'Giờ giới nghiêm buổi sáng'),
    ('noon_curfew', '12:30', 'Giờ giới nghiêm buổi trưa'),
    ('evening_curfew', '22:00', 'Giờ giới nghiêm buổi tối'),
    ('checkin_mode', 'both', 'Chế độ check-in: face, qr, hoặc both')
ON CONFLICT (key) DO NOTHING;

INSERT INTO teacher_permissions (module_id, module_name, is_enabled) VALUES 
    ('dashboard', 'Bảng điều khiển', true),
    ('events', 'Quản lý Sự kiện', false),
    ('boarding', 'Quản lý Nội trú', false),
    ('reports', 'Báo cáo & Thống kê', false),
    ('users', 'Quản lý Người dùng', false),
    ('points', 'Quản lý Điểm', false),
    ('certificates', 'Cấp Chứng nhận', false),
    ('cards', 'Tạo Thẻ học sinh', false),
    ('faceid', 'Quản lý Face ID', false),
    ('permissions', 'Phân quyền', false),
    ('settings', 'Cấu hình hệ thống', false),
    ('help', 'Trung tâm Hướng dẫn', true)
ON CONFLICT (module_id) DO UPDATE SET module_name = EXCLUDED.module_name;
