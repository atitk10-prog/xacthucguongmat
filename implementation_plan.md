# Kế hoạch Nâng cấp Hệ thống Chứng nhận (Certificate System Upgrade)

## Hiện trạng & Vấn đề
- **Code quá tải**: File `CertificateGenerator.tsx` quá dài (>1000 dòng), khó bảo trì, dễ sinh lỗi khi sửa một chỗ hỏng chỗ khác.
- **Tính năng phân tán**: Logic xử lý ảnh, PDF, Word, và logic giao diện trộn lẫn.
- **Trải nghiệm người dùng**: Mỗi lần vào phải chỉnh lại từ đầu (font, màu, khổ giấy), chưa lưu được "Mẫu tủ" của riêng người dùng.
- **Chất lượng xuất**: Đã cải thiện nhưng cần chuẩn hóa DPI cao để in ấn nét hơn.

## Phương án Nâng cấp (Lộ trình 3 bước)

### Bước 1: Tái cấu trúc & Chia nhỏ (Refactoring) - **CẦN LÀM NGAY**
Để chấm dứt tình trạng "sửa mãi", code cần được chia module rõ ràng:
1.  **`CertificateConfigPanel.tsx`**: Chứa toàn bộ các nút bấm, chọn font, màu, cài đặt.
2.  **`CertificatePreview.tsx`**: Chỉ lo việc hiển thị, đảm bảo "nhìn sao in vậy" (WYSIWYG).
3.  **`ExportService.ts`**: Tách hoàn toàn logic xuất PDF/Word ra file riêng, xử lý lỗi tập trung.

### Bước 2: Tính năng "Lưu Cấu Hình Mẫu" (User Presets)
Người dùng sau khi chỉnh đẹp (A5, Font Times, Nền trống đồng...) có thể bấm nút **"Lưu mẫu này"**.
- Hệ thống sẽ lưu lại `customConfig` vào trình duyệt (hoặc database).
- Lần sau chỉ cần chọn "Mẫu của tôi: A5 Trống Đồng" là mọi thứ tự động chỉnh lại.

### Bước 3: Biến động & Placeholder (Nâng cao)
Cho phép chèn biến vào văn bản.
- Ví dụ nhập: *"Chứng nhận em {name} đã hoàn thành..."*
- Khi xuất hàng loạt, `{name}` sẽ tự thay bằng tên học sinh.
- Giúp người dùng tùy biến nội dung sâu hơn mà không cần code lại template.

## Đề xuất thực hiện ngay lập tức
Chúng ta sẽ thực hiện **Bước 1 (Chia nhỏ)** và **Bước 2 (Lưu mẫu)** trong phiên làm việc này.

### Cấu trúc file mới dự kiến:
```text
components/certificates/
├── CertificateGenerator.tsx (Wrapper chính, quản lý state chung)
├── panel/
│   ├── ConfigPanel.tsx (Giao diện cấu hình trái)
│   └── PreviewPanel.tsx (Giao diện hiển thị phải)
└── actions/
    └── exportActions.ts (Hàm xuất file)
```
