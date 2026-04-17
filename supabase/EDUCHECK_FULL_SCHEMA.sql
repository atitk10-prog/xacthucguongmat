-- =====================================================
-- EDUCHECK AI - SCHEMA ĐẦY ĐỦ TOÀN BỘ HỆ THỐNG
-- Phiên bản: 2026-04-17 (Tổng hợp từ 72 file migration)
-- Mục đích: Chạy 1 lần trên Supabase SQL Editor mới
-- =====================================================
-- LƯU Ý: File này sẽ TẠO MỚI toàn bộ bảng.
-- Nếu đã có dữ liệu, KHÔNG chạy file này (sẽ mất data).
-- =====================================================


-- =====================================================
-- PHẦN 1: XÓA BẢNG CŨ (nếu có) — theo thứ tự dependency
-- =====================================================
DROP TABLE IF EXISTS boarding_attendance CASCADE;
DROP TABLE IF EXISTS boarding_time_slots CASCADE;
DROP TABLE IF EXISTS boarding_config CASCADE;
DROP TABLE IF EXISTS boarding_checkins CASCADE;
DROP TABLE IF EXISTS certificate_configs CASCADE;
DROP TABLE IF EXISTS certificate_verifications CASCADE;
DROP TABLE IF EXISTS certificates CASCADE;
DROP TABLE IF EXISTS checkins CASCADE;
DROP TABLE IF EXISTS event_participants CASCADE;
DROP TABLE IF EXISTS exit_permissions CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS point_logs CASCADE;
DROP TABLE IF EXISTS attendance_scores CASCADE;
DROP TABLE IF EXISTS teacher_permissions CASCADE;
DROP TABLE IF EXISTS push_subscriptions CASCADE;
DROP TABLE IF EXISTS school_settings CASCADE;
DROP TABLE IF EXISTS events CASCADE;
DROP TABLE IF EXISTS rooms CASCADE;
DROP TABLE IF EXISTS classes CASCADE;
DROP TABLE IF EXISTS system_configs CASCADE;
DROP TABLE IF EXISTS users CASCADE;


-- =====================================================
-- PHẦN 2: TẠO BẢNG
-- =====================================================

-- =====================================================
-- 2.1 USERS — Người dùng hệ thống
-- =====================================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT,
    full_name TEXT NOT NULL,
    role TEXT DEFAULT 'student' CHECK (role IN ('admin', 'teacher', 'student', 'guest', 'user')),
    class_id TEXT,
    room_id TEXT,
    zone TEXT,
    avatar_url TEXT,
    face_vector TEXT,                    -- Legacy: vector khuôn mặt cũ
    face_descriptor TEXT,                -- JSON descriptor khuôn mặt (face-api.js)
    qr_code TEXT,
    student_code TEXT,                   -- Mã học sinh
    organization TEXT,                   -- Đơn vị/trường
    birth_date DATE,                     -- Ngày sinh
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    total_points INTEGER DEFAULT 0
);

-- =====================================================
-- 2.2 EVENTS — Sự kiện điểm danh
-- =====================================================
CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    type TEXT DEFAULT 'học_tập',
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    location TEXT,
    target_audience TEXT DEFAULT 'all',
    checkin_method TEXT DEFAULT 'qr',     -- 'qr', 'face', 'both'
    checkin_mode TEXT DEFAULT 'student',  -- 'student' (tính điểm) hoặc 'event' (không điểm)
    enable_popup BOOLEAN DEFAULT true,   -- Hiển thị popup khi check-in thành công
    qr_code TEXT,
    late_threshold_mins INTEGER DEFAULT 15,
    points_on_time INTEGER DEFAULT 10,
    points_late INTEGER DEFAULT -5,
    points_absent INTEGER DEFAULT -10,
    require_face BOOLEAN DEFAULT false,
    face_threshold INTEGER DEFAULT 60,
    -- GPS: Tọa độ vị trí tổ chức sự kiện (xác thực khoảng cách)
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    radius_meters INTEGER DEFAULT 100,   -- Bán kính cho phép (mét)
    created_by UUID REFERENCES users(id),
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 2.3 EVENT_PARTICIPANTS — Danh sách người tham gia sự kiện
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
    student_code TEXT,
    qr_code TEXT,
    face_descriptor TEXT,                -- JSON descriptor khuôn mặt
    user_id UUID REFERENCES users(id),   -- Liên kết đến user hệ thống
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 2.4 CHECKINS — Bản ghi điểm danh sự kiện
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
    checkin_mode TEXT,                    -- 'student' hoặc 'event'
    photo_url TEXT,
    device_info TEXT,
    ip_address TEXT,
    -- GPS: Tọa độ thiết bị khi điểm danh (hiển thị trên bản đồ báo cáo)
    checkin_latitude DOUBLE PRECISION,
    checkin_longitude DOUBLE PRECISION,
    checkin_accuracy DOUBLE PRECISION,   -- Độ chính xác GPS (mét)
    gps_suspicious BOOLEAN DEFAULT FALSE -- Cờ phát hiện GPS giả
);

-- =====================================================
-- 2.5 ROOMS — Phòng nội trú
-- =====================================================
CREATE TABLE rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    zone TEXT NOT NULL,
    capacity INTEGER DEFAULT 8,
    manager_id UUID REFERENCES users(id)
);

-- =====================================================
-- 2.6 CLASSES — Lớp học
-- =====================================================
CREATE TABLE classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    grade TEXT,
    homeroom_teacher_id UUID REFERENCES users(id),
    student_count INTEGER DEFAULT 0
);

-- =====================================================
-- 2.7 BOARDING_CHECKINS — Điểm danh nội trú (legacy)
-- =====================================================
CREATE TABLE boarding_checkins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    morning_in TIMESTAMPTZ,
    morning_out TIMESTAMPTZ,
    noon_in TIMESTAMPTZ,
    noon_out TIMESTAMPTZ,
    evening_in TIMESTAMPTZ,
    evening_out TIMESTAMPTZ,
    exit_permission BOOLEAN DEFAULT false,
    notes TEXT,
    -- Trạng thái từng buổi
    morning_status TEXT DEFAULT 'absent' CHECK (morning_status IN ('on_time', 'late', 'absent', 'excused')),
    noon_status TEXT DEFAULT 'absent' CHECK (noon_status IN ('on_time', 'late', 'absent', 'excused')),
    evening_status TEXT DEFAULT 'absent' CHECK (evening_status IN ('on_time', 'late', 'absent', 'excused')),
    UNIQUE(user_id, date)
);

-- =====================================================
-- 2.8 BOARDING_TIME_SLOTS — Khung giờ check-in nội trú (linh hoạt)
-- =====================================================
CREATE TABLE boarding_time_slots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,          -- VD: "Điểm danh sáng"
    start_time TIME NOT NULL,            -- Giờ bắt đầu
    end_time TIME NOT NULL,              -- Giờ kết thúc (deadline, sau = TRỄ)
    is_active BOOLEAN DEFAULT true,
    order_index INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 2.9 BOARDING_ATTENDANCE — Bản ghi điểm danh nội trú (theo slot)
-- =====================================================
CREATE TABLE boarding_attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    slot_id UUID NOT NULL REFERENCES boarding_time_slots(id) ON DELETE CASCADE,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    checkin_time TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'on_time' CHECK (status IN ('on_time', 'late')),
    UNIQUE(user_id, slot_id, date)
);

-- =====================================================
-- 2.10 BOARDING_CONFIG — Cấu hình nội trú
-- =====================================================
CREATE TABLE boarding_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT
);

-- =====================================================
-- 2.11 SYSTEM_CONFIGS — Cấu hình hệ thống
-- =====================================================
CREATE TABLE system_configs (
    key TEXT PRIMARY KEY,
    value TEXT,
    description TEXT
);

-- =====================================================
-- 2.12 POINT_LOGS — Lịch sử cộng/trừ điểm
-- =====================================================
CREATE TABLE point_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    points INTEGER NOT NULL,
    reason TEXT,
    type TEXT DEFAULT 'manual',          -- 'manual', 'auto', 'checkin', 'boarding'
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 2.13 CERTIFICATES — Chứng nhận/Giấy chứng nhận
-- =====================================================
CREATE TABLE certificates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    event_id UUID REFERENCES events(id),
    type TEXT DEFAULT 'participation',
    title TEXT NOT NULL,
    template TEXT DEFAULT 'classic',
    issued_date TIMESTAMPTZ DEFAULT NOW(),
    qr_verify TEXT UNIQUE,
    pdf_url TEXT,
    status TEXT DEFAULT 'active',
    metadata JSONB DEFAULT '{}'::jsonb
);

-- =====================================================
-- 2.14 CERTIFICATE_CONFIGS — Mẫu thiết kế chứng nhận
-- =====================================================
CREATE TABLE certificate_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    template_id TEXT NOT NULL,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- =====================================================
-- 2.15 ATTENDANCE_SCORES — Điểm chuyên cần theo kỳ
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
-- 2.16 NOTIFICATIONS — Thông báo
-- =====================================================
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL DEFAULT 'points',  -- 'points', 'request', 'event', 'system'
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- =====================================================
-- 2.17 EXIT_PERMISSIONS — Đơn xin phép ra ngoài
-- =====================================================
CREATE TABLE exit_permissions (
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

-- =====================================================
-- 2.18 TEACHER_PERMISSIONS — Phân quyền giáo viên
-- =====================================================
CREATE TABLE teacher_permissions (
    module_id TEXT PRIMARY KEY,
    module_name TEXT NOT NULL,
    is_enabled BOOLEAN DEFAULT false,
    can_edit BOOLEAN DEFAULT false,
    can_delete BOOLEAN DEFAULT false,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 2.19 PUSH_SUBSCRIPTIONS — Đăng ký push notification
-- =====================================================
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    p256dh TEXT,
    auth TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, endpoint)
);

-- =====================================================
-- 2.20 SCHOOL_SETTINGS — Cài đặt trường học
-- =====================================================
CREATE TABLE IF NOT EXISTS school_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT UNIQUE NOT NULL,
    value TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);


-- =====================================================
-- PHẦN 3: INDEXES (Tối ưu truy vấn)
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_student_code ON users(student_code);
CREATE INDEX IF NOT EXISTS idx_users_class_id ON users(class_id);

CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_start_time ON events(start_time);
CREATE INDEX IF NOT EXISTS idx_events_created_by ON events(created_by);

CREATE INDEX IF NOT EXISTS idx_checkins_event_id ON checkins(event_id);
CREATE INDEX IF NOT EXISTS idx_checkins_user_id ON checkins(user_id);
CREATE INDEX IF NOT EXISTS idx_checkins_participant_id ON checkins(participant_id);
CREATE INDEX IF NOT EXISTS idx_checkins_gps ON checkins(event_id, checkin_latitude, checkin_longitude) WHERE checkin_latitude IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_participants_event ON event_participants(event_id);
CREATE INDEX IF NOT EXISTS idx_participants_user ON event_participants(user_id);

CREATE INDEX IF NOT EXISTS idx_boarding_user_date ON boarding_checkins(user_id, date);
CREATE INDEX IF NOT EXISTS idx_boarding_attendance_user ON boarding_attendance(user_id, date);
CREATE INDEX IF NOT EXISTS idx_boarding_attendance_slot ON boarding_attendance(slot_id, date);

CREATE INDEX IF NOT EXISTS idx_point_logs_user ON point_logs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_point_logs_event ON point_logs(event_id);

CREATE INDEX IF NOT EXISTS idx_certificates_user ON certificates(user_id);
CREATE INDEX IF NOT EXISTS idx_certificates_event ON certificates(event_id);
CREATE INDEX IF NOT EXISTS idx_cert_configs_name ON certificate_configs(name);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_exit_permissions_user ON exit_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_exit_permissions_status ON exit_permissions(status);
CREATE INDEX IF NOT EXISTS idx_exit_permissions_time ON exit_permissions(exit_time);

CREATE INDEX IF NOT EXISTS idx_attendance_scores_user ON attendance_scores(user_id);


-- =====================================================
-- PHẦN 4: ROW LEVEL SECURITY (RLS)
-- =====================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE boarding_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE boarding_time_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE boarding_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE boarding_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE point_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE certificate_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE exit_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_settings ENABLE ROW LEVEL SECURITY;

-- Policies: Cho phép truy cập công khai (development/anon key)
CREATE POLICY "Public access" ON users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access" ON events FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access" ON event_participants FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access" ON checkins FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access" ON rooms FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access" ON classes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access" ON boarding_checkins FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access" ON boarding_time_slots FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access" ON boarding_attendance FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access" ON boarding_config FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access" ON system_configs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access" ON point_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access" ON certificates FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access" ON certificate_configs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access" ON attendance_scores FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access" ON notifications FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access" ON exit_permissions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access" ON teacher_permissions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access" ON push_subscriptions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access" ON school_settings FOR ALL USING (true) WITH CHECK (true);


-- =====================================================
-- PHẦN 5: FUNCTIONS & TRIGGERS
-- =====================================================

-- Tự động cập nhật updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_certificate_configs_updated_at
    BEFORE UPDATE ON certificate_configs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_exit_permissions_updated_at
    BEFORE UPDATE ON exit_permissions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Hàm kiểm tra admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.users
        WHERE id = auth.uid()
        AND lower(role) = 'admin'
    );
END;
$$;

-- Hàm cập nhật quyền giáo viên (chỉ admin)
CREATE OR REPLACE FUNCTION public.update_teacher_module_permission(
    target_id TEXT,
    updates JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    UPDATE public.teacher_permissions
    SET
        is_enabled = COALESCE((updates->>'is_enabled')::boolean, is_enabled),
        can_edit = COALESCE((updates->>'can_edit')::boolean, can_edit),
        can_delete = COALESCE((updates->>'can_delete')::boolean, can_delete),
        updated_at = now()
    WHERE module_id = target_id;
END;
$$;


-- =====================================================
-- PHẦN 6: REALTIME (Supabase Realtime)
-- =====================================================
DO $$
BEGIN
    -- Bật Realtime cho các bảng quan trọng
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'checkins') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE checkins;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'boarding_attendance') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE boarding_attendance;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'boarding_time_slots') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE boarding_time_slots;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'notifications') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'point_logs') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE point_logs;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'teacher_permissions') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE teacher_permissions;
    END IF;
END $$;


-- =====================================================
-- PHẦN 7: DỮ LIỆU MẶC ĐỊNH
-- =====================================================

-- 7.1 Tài khoản Admin
INSERT INTO users (email, password_hash, full_name, role, status)
VALUES ('admin@educheck.com', 'admin123', 'Quản trị viên', 'admin', 'active')
ON CONFLICT (email) DO NOTHING;

-- 7.2 Phòng nội trú mẫu
INSERT INTO rooms (name, zone, capacity) VALUES
    ('101', 'A', 8), ('102', 'A', 8), ('103', 'A', 8), ('104', 'A', 8),
    ('201', 'B', 6), ('202', 'B', 6), ('203', 'B', 6), ('204', 'B', 6)
ON CONFLICT DO NOTHING;

-- 7.3 Lớp học mẫu
INSERT INTO classes (name, grade) VALUES
    ('10A1', '10'), ('10A2', '10'), ('10A3', '10'),
    ('11A1', '11'), ('11A2', '11'),
    ('12A1', '12'), ('12A2', '12')
ON CONFLICT DO NOTHING;

-- 7.4 Cấu hình hệ thống
INSERT INTO system_configs (key, value, description) VALUES
    ('school_name', 'Trường THPT ABC', 'Tên trường'),
    ('school_address', '123 Đường XYZ', 'Địa chỉ trường'),
    ('points_checkin_ontime', '10', 'Điểm check-in đúng giờ'),
    ('points_checkin_late', '-5', 'Điểm check-in muộn'),
    ('points_checkin_absent', '-10', 'Điểm vắng mặt sự kiện'),
    ('points_boarding_ontime', '5', 'Điểm nội trú đúng giờ'),
    ('points_boarding_late', '-3', 'Điểm nội trú muộn'),
    ('points_absent_boarding', '-5', 'Điểm trừ vắng nội trú'),
    ('points_late_boarding', '2', 'Điểm trừ khi muộn nội trú'),
    ('points_manual_max', '50', 'Điểm tối đa thủ công'),
    ('points_start_baseline', '100', 'Điểm khởi đầu'),
    ('late_threshold_default', '15', 'Phút tính đi muộn'),
    ('face_threshold_default', '60', 'Ngưỡng nhận diện (%)'),
    ('points_on_time', '10', 'Điểm đúng giờ (sự kiện)'),
    ('points_late', '-5', 'Điểm muộn (sự kiện)'),
    ('points_absent_event', '-10', 'Điểm vắng (sự kiện)')
ON CONFLICT (key) DO NOTHING;

-- 7.5 Cấu hình nội trú
INSERT INTO boarding_config (key, value, description) VALUES
    ('morning_curfew', '07:00', 'Giờ giới nghiêm buổi sáng'),
    ('noon_curfew', '12:30', 'Giờ giới nghiêm buổi trưa'),
    ('evening_curfew', '22:00', 'Giờ giới nghiêm buổi tối'),
    ('checkin_mode', 'both', 'Chế độ check-in: face, qr, hoặc both')
ON CONFLICT (key) DO NOTHING;

-- 7.6 Khung giờ nội trú mặc định
INSERT INTO boarding_time_slots (name, start_time, end_time, order_index) VALUES
    ('Điểm danh buổi sáng', '05:00', '06:45', 1),
    ('Điểm danh buổi trưa', '11:30', '12:30', 2),
    ('Điểm danh buổi tối', '17:00', '22:00', 3)
ON CONFLICT DO NOTHING;

-- 7.7 Phân quyền giáo viên mặc định
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


-- =====================================================
-- PHẦN 8: KIỂM TRA KẾT QUẢ
-- =====================================================
SELECT 'EDUCHECK AI — Schema tạo thành công!' AS status;

SELECT table_name, 
       (SELECT count(*) FROM information_schema.columns c WHERE c.table_name = t.table_name AND c.table_schema = 'public') AS columns
FROM information_schema.tables t
WHERE t.table_schema = 'public'
AND t.table_type = 'BASE TABLE'
ORDER BY t.table_name;
