-- Xóa toàn bộ dữ liệu cũ để tránh duplicate
TRUNCATE TABLE boarding_time_slots;

-- Thêm các khung giờ mặc định
INSERT INTO boarding_time_slots (name, start_time, end_time, is_active, order_index) VALUES
    ('Điểm danh buổi sáng', '05:00', '06:45', true, 1),
    ('Điểm danh buổi trưa', '11:30', '12:30', true, 2),
    ('Điểm danh buổi tối', '17:00', '22:00', true, 3);
    
-- Kiểm tra lại dữ liệu
SELECT * FROM boarding_time_slots ORDER BY order_index;
