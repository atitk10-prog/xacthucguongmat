-- ==========================================================
-- SCRIPT HỖ TRỢ DI CHUYỂN DỮ LIỆU (CHẠY TRÊN PROJECT CŨ)
-- Phiên bản: 3.5 (Đầy đủ nhất - Hỗ trợ Nội trú, Sự kiện, Cấu hình)
-- ==========================================================
-- Mục đích: Sinh ra các câu lệnh INSERT SQL từ dữ liệu hiện có để dán vào Project mới.

-- 1. BẢNG USERS (HỌC SINH, GIÁO VIÊN, ADMIN)
SELECT 'INSERT INTO users (id, email, password_hash, full_name, role, class_id, room_id, zone, avatar_url, face_vector, face_descriptor, student_code, organization, qr_code, status, birth_date, total_points) VALUES (' || 
    quote_nullable(id) || ',' || quote_nullable(email) || ',' || quote_nullable(password_hash) || ',' || 
    quote_nullable(full_name) || ',' || quote_nullable(role) || ',' || quote_nullable(class_id) || ',' || 
    quote_nullable(room_id) || ',' || quote_nullable(zone) || ',' || quote_nullable(avatar_url) || ',' || 
    quote_nullable(face_vector) || ',' || quote_nullable(face_descriptor) || ',' || quote_nullable(student_code) || ',' || 
    quote_nullable(organization) || ',' || quote_nullable(qr_code) || ',' || quote_nullable(status) || ',' || 
    quote_nullable(birth_date) || ',' || coalesce(total_points, 0) || ') ON CONFLICT (id) DO UPDATE SET total_points = EXCLUDED.total_points;'
FROM users;

-- 2. BẢNG EVENTS (DANH SÁCH SỰ KIỆN)
SELECT 'INSERT INTO events (id, name, type, start_time, end_time, location, target_audience, checkin_method, qr_code, late_threshold_mins, points_on_time, points_late, points_absent, require_face, face_threshold, checkin_mode, enable_popup, latitude, longitude, radius_meters, created_by, status) VALUES (' || 
    quote_nullable(id) || ',' || quote_nullable(name) || ',' || quote_nullable(type) || ',' || quote_nullable(start_time) || ',' || 
    quote_nullable(end_time) || ',' || quote_nullable(location) || ',' || quote_nullable(target_audience) || ',' || 
    quote_nullable(checkin_method) || ',' || quote_nullable(qr_code) || ',' || coalesce(late_threshold_mins, 15) || ',' || 
    coalesce(points_on_time, 10) || ',' || coalesce(points_late, -5) || ',' || coalesce(points_absent, -10) || ',' || 
    require_face || ',' || coalesce(face_threshold, 60) || ',' || quote_nullable(checkin_mode) || ',' || enable_popup || ',' || 
    quote_nullable(latitude) || ',' || quote_nullable(longitude) || ',' || quote_nullable(radius_meters) || ',' || 
    quote_nullable(created_by) || ',' || quote_nullable(status) || ') ON CONFLICT (id) DO NOTHING;'
FROM events;

-- 3. BẢNG EVENT_PARTICIPANTS (NGƯỜI THAM GIA)
SELECT 'INSERT INTO event_participants (id, event_id, full_name, birth_date, organization, address, email, phone, avatar_url, student_code, qr_code, face_descriptor, user_id) VALUES (' || 
    quote_nullable(id) || ',' || quote_nullable(event_id) || ',' || quote_nullable(full_name) || ',' || 
    quote_nullable(birth_date) || ',' || quote_nullable(organization) || ',' || quote_nullable(address) || ',' || 
    quote_nullable(email) || ',' || quote_nullable(phone) || ',' || quote_nullable(avatar_url) || ',' || 
    quote_nullable(student_code) || ',' || quote_nullable(qr_code) || ',' || quote_nullable(face_descriptor) || ',' || 
    quote_nullable(user_id) || ') ON CONFLICT (id) DO NOTHING;'
FROM event_participants;

-- 4. BẢNG ROOMS (PHÒNG NỘI TRÚ)
SELECT 'INSERT INTO rooms (id, name, zone, capacity) VALUES (' || 
    quote_nullable(id) || ',' || quote_nullable(name) || ',' || quote_nullable(zone) || ',' || coalesce(capacity, 8) || ') ON CONFLICT (id) DO NOTHING;'
FROM rooms;

-- 5. BẢNG SYSTEM_CONFIGS (CẤU HÌNH HỆ THỐNG)
SELECT 'INSERT INTO system_configs (key, value, description) VALUES (' || 
    quote_nullable(key) || ',' || quote_nullable(value) || ',' || quote_nullable(description) || ') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;'
FROM system_configs;

-- 6. BẢNG BOARDING_CONFIG (CẤU HÌNH NỘI TRÚ)
SELECT 'INSERT INTO boarding_config (key, value, description) VALUES (' || 
    quote_nullable(key) || ',' || quote_nullable(value) || ',' || quote_nullable(description) || ') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;'
FROM boarding_config;

-- 7. BẢNG BOARDING_TIME_SLOTS (KHUNG GIỜ ĐIỂM DANH)
SELECT 'INSERT INTO boarding_time_slots (id, name, start_time, end_time, is_active, order_index) VALUES (' || 
    quote_nullable(id) || ',' || quote_nullable(name) || ',' || quote_nullable(start_time::text) || ',' || quote_nullable(end_time::text) || ',' || is_active || ',' || order_index || ') ON CONFLICT (id) DO NOTHING;'
FROM boarding_time_slots;

-- 8. BẢNG TEACHER_PERMISSIONS (PHÂN QUYỀN)
SELECT 'INSERT INTO teacher_permissions (module_id, module_name, is_enabled, can_edit, can_delete) VALUES (' || 
    quote_nullable(module_id) || ',' || quote_nullable(module_name) || ',' || is_enabled || ',' || can_edit || ',' || can_delete || ') ON CONFLICT (module_id) DO UPDATE SET is_enabled = EXCLUDED.is_enabled;'
FROM teacher_permissions;

-- 9. BẢNG BOARDING_ATTENDANCE (DỮ LIỆU ĐIỂM DANH NỘI TRÚ)
-- Lưu ý: Lấy từ bảng boarding_checkins cũ nếu có, hoặc chính nó nếu đã đổi tên
SELECT 'INSERT INTO boarding_attendance (id, user_id, slot_id, date, checkin_time, status) VALUES (' || 
    quote_nullable(id) || ',' || quote_nullable(user_id) || ',' || quote_nullable(slot_id) || ',' || 
    quote_nullable(date::text) || ',' || quote_nullable(checkin_time::text) || ',' || quote_nullable(status) || ') ON CONFLICT (id) DO NOTHING;'
FROM boarding_attendance;
