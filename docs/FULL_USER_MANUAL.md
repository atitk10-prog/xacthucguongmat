# EduCheck Master Guide: Cẩm nang Sử dụng Toàn diện

Tài liệu này hướng dẫn chi tiết cách vận hành toàn bộ hệ thống EduCheck v3.0, từ thiết lập ban đầu đến quản lý nề nếp nâng cao.

---

## 1. TỔNG QUAN HỆ THỐNG
EduCheck là nền tảng quản lý học đường tập trung vào:
- **Định danh AI**: Quét mặt tự động thay thế thẻ giấy.
- **Nề nếp Realtime**: Theo dõi vi phạm và khen thưởng tức thì.
- **Dữ liệu tập trung**: Thống kê tự động, giảm thiểu sai sót thủ công.

---

## 2. QUY TRÌNH DÀNH CHO QUẢN TRỊ VIÊN (ADMIN)

### A. Thiết lập Dữ liệu Gốc
1. **Nhập Người dùng**: 
   - Truy cập `Nhân sự` -> `Người dùng`.
   - Sử dụng chức năng `Nhập Excel`.
   - **Mẹo**: Cung cấp Email đúng định dạng để học sinh nhận được thông báo qua Mail.
2. **Quản lý Face ID**:
   - Chọn `Tải ảnh thẻ hàng loạt`. 
   - **Yêu cầu**: Tên file ảnh `.jpg` hoặc `.png` phải khớp 100% với **Mã số định danh** (student_code) của học sinh đó.
   - Hệ thống sẽ tự động phân tích và tạo "Mẫu khuôn mặt" (Face Vector).

### B. Cấu hình Nề nếp
1. **Mức điểm mặc định**: 
   - Vào `Quản trị` -> `Cấu hình`.
   - Chỉnh sửa: Điểm khởi tạo (mặc định cho tân sinh viên), Điểm đi muộn, Điểm vắng mặt.
2. **Khung giờ Nội trú**:
   - Vào `Nội trú` -> `Quản lý Nội trú`.
   - Thiết lập các khung giờ: Ví dụ Sáng (6h00 - 6h30), Tối (22h00 - 22h30).
   - Hệ thống sẽ tự động quét trạng thái "Vắng" nếu học sinh không check-in trong khung giờ này.

### C. Quản lý Phòng & Cơ sở vật chất
- Thiết lập danh sách Phòng và Khu vực (Dãy nhà). 
- Gán quản lý phòng để giáo viên dễ theo dõi theo khu vực phụ trách.

---

## 3. QUY TRÌNH DÀNH CHO GIÁO VIÊN & VẬN HÀNH

### A. Điểm danh Sự kiện (Boarding & Event)
1. **Mở máy quét**: Vào `Sự kiện` hoặc `Điểm danh AI`.
2. **Quét mặt**: Học sinh chỉ cần đứng trước camera 1 giây.
3. **Phản hồi**: 
   - Màu xanh: Thành công.
   - Màu đỏ/Vàng: Cảnh báo Face ID chưa khớp hoặc sai người.

### B. Xử lý Vi phạm & Khen thưởng (Thủ công)
- Nếu thấy học sinh làm việc tốt (giúp đỡ bạn, nhặt được của rơi): Tìm tên -> `Cộng điểm`.
- Nếu học sinh vi phạm (trốn tiết, không trực nhật): Tìm tên -> `Trừ điểm`.
- **Lưu ý**: Phải ghi rõ `Lý do` để minh bạch trong báo cáo gửi phụ huynh.

### C. Duyệt Đơn xin phép
- Admin/Giáo viên nhận thông báo Realtime (Chuông báo) khi học sinh gửi đơn ra ngoài.
- `Duyệt` hoặc `Từ chối` kèm lý do. Hệ thống tự động ghi nhật ký ra/vào.

---

## 4. XUẤT BÁO CÁO & PHÂN TÍCH

### Bảng xếp hạng nề nếp
- Xem Top học sinh tích cực và Top lớp gương mẫu.
- Xuất PDF giấy chứng nhận "Ngôi sao nề nếp" cuối tháng.

### Báo cáo Excel 5 Sheet (Duy nhất tại EduCheck)
Khi xuất Excel từ mục `Thống kê điểm`, bạn nhận được:
1. **Tổng hợp**: Mọi lịch sử cộng/trừ điểm.
2. **Khen thưởng**: Danh sách vinh danh.
3. **Vi phạm**: Danh sách cần phê bình/nhắc nhở.
4. **Theo Lớp**: Xếp hạng nội bộ giữa các lớp.
5. **Theo Sự kiện**: Đánh giá hiệu quả các cuộc họp/phong trào.

---

## 5. CỔNG THÔNG TIN HỌC SINH (APP CÁ NHÂN)
Học sinh đăng nhập để:
- Xem lịch sử điểm số và lý do cụ thể.
- Kiểm tra thứ hạng của mình trong lớp/trường.
- Gửi đơn xin phép nghỉ/ra ngoài thuận tiện qua điện thoại.

---

## 6. LƯU Ý KỸ THUẬT & OFFLINE (QUAN TRỌNG)
Hệ thống EduCheck hỗ trợ **Chế độ đồng bộ ngoại tuyến thông minh**:
- **Mất mạng**: Dữ liệu check-in/điểm danh vẫn được lưu an toàn tại thiết bị.
- **Tự động đồng bộ**: Ngay khi thiết bị có mạng (Wifi/4G), hệ thống sẽ tự động đẩy các bản ghi chờ lên máy chủ. Bạn sẽ thấy thông báo "Đang đồng bộ..." và "Thành công".

---

## 7. QUẢN LÝ PHÂN QUYỀN GIÁO VIÊN
Admin có quyền chỉ định Giáo viên được làm gì:
1. Truy cập `Quản trị` &rarr; `Phân quyền`.
2. **Tích chọn**: Bật/Tắt module tương ứng (Ví dụ: Chỉ cho giáo viên xem Báo cáo nhưng không cho sửa Người dùng).
3. **Hiệu lực**: Các mục menu trên EduCheck của Giáo viên sẽ tự động ẩn/hiện theo cấu hình này.

