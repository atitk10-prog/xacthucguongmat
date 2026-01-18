-- =====================================================
-- VERIFY RELATIONSHIP (KIỂM TRA LIÊN KẾT)
-- Chạy lệnh này để xem dữ liệu check-in CÓ KÈM tên học sinh không
-- =====================================================

SELECT 
    c.created_at as time_checkin,          -- Thời gian check-in (hoặc checkin_time)
    c.status as trang_thai,                -- Trạng thái (đúng giờ/muộn)
    p.full_name as ten_nguoi_tham_gia,     -- Tên lấy từ bảng event_participants
    p.student_code as ma_hoc_sinh,         -- Mã HS lấy từ bảng event_participants
    p.organization as lop,                 -- Lớp
    c.participant_id                       -- ID liên kết
FROM 
    public.checkins c
JOIN 
    public.event_participants p ON c.participant_id = p.id
ORDER BY 
    c.created_at DESC
LIMIT 20;

-- Nếu kết quả trả về có tên học sinh thì liên kết đã THÀNH CÔNG!
