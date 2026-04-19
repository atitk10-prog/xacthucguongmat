# 🏠 Phương Án Cuối Cùng: Điểm Danh Nội Trú

> **Trạng thái:** ✅ Đã chốt phương án  
> **Ngày:** 2026-04-19  
> **SQL:** `supabase/migrations/add_boarding_geo_checkin.sql`  
> **Chi tiết kỹ thuật:** `docs/BOARDING_GEO_CHECKIN_PLAN.md`  

---

## 1. Ba cách điểm danh + 1 dự phòng

```
┌───────────────────────────────────────────────────────────────────┐
│                     ĐIỂM DANH NỘI TRÚ                            │
│                                                                   │
│  CÁCH 1: TẠI MÁY QUÉT CỐ ĐỊNH (đã có)                           │
│  HS đưa thẻ QR / đứng trước camera Face ID                      │
│  → ✅ Check-in + GPS máy quét lưu vị trí lên bản đồ            │
│                                                                   │
│  CÁCH 2: QUA ĐIỆN THOẠI CỦA MÌNH                                │
│  HS đăng nhập → Bấm "📍 Điểm danh" → GPS xác nhận              │
│  → (Nếu Admin bật Face → chụp mặt 1 lần)                        │
│  → ✅ Check-in + GPS HS lưu vị trí lên bản đồ                  │
│                                                                   │
│  CÁCH 3: MƯỢN ĐIỆN THOẠI BẠN                                    │
│  HS mượn ĐT → Đăng nhập tài khoản mình → Bấm "📍 Điểm danh"   │
│  → GPS xác nhận + Face verify (nếu Admin bật)                    │
│  → ✅ Check-in → Đăng xuất                                      │
│  ⭐ Nếu Admin bật "quét mặt" → HS mượn ĐT vẫn phải chụp mặt   │
│     → Chống gian lận: không ai điểm danh hộ được                 │
│                                                                   │
│  DỰ PHÒNG: GV TICK THỦ CÔNG                                     │
│  HS mất hết → GV tìm tên → Tick ✅ + ghi chú lý do             │
│  → Vị trí = vị trí máy GV → Hiện trên bản đồ                   │
└───────────────────────────────────────────────────────────────────┘
```

---

## 2. Cấu hình Admin

```
☑️ Cho phép HS điểm danh bằng GPS (qua điện thoại)
    └─ ☑️ Yêu cầu quét khuôn mặt khi GPS check-in
         → Nếu KHÔNG tích: chỉ cần GPS là đủ (nhanh 2 giây)
         → Nếu CÓ tích: GPS + Face (chống gian lận, kể cả mượn ĐT)
```

---

## 3. Bản đồ điểm danh (MỚI)

### ⚠️ Mỗi khung giờ = 1 bản đồ riêng

Mỗi slot (Sáng / Trưa / Chiều / Tối) có **bản đồ riêng**, không chung nhau:

```
┌─────────────────────────────────────────────────────────┐
│  🗺️ Tab bản đồ:                                        │
│                                                         │
│  [ Sáng 06:00 ] [ Trưa 12:00 ] [ Chiều 14:00 ] [ Tối ] │
│       ↑ active                                          │
│                                                         │
│  Ngày: [ 19/04/2026 ▾ ]                                │
│                                                         │
│  → Mỗi tab = 1 bản đồ riêng với dữ liệu GPS riêng    │
│  → Click tab khác = load bản đồ của slot đó             │
└─────────────────────────────────────────────────────────┘
```

### Mọi phương thức đều hiện trên bản đồ:

| Phương thức | Vị trí lưu trên bản đồ | Marker |
|---|---|---|
| QR tại máy quét | GPS của máy quét (cố định) | 🟢 Xanh |
| Face ID tại máy quét | GPS của máy quét (cố định) | 🟢 Xanh |
| GPS qua ĐT (trong bán kính) | GPS của ĐT học sinh | 🔵 Xanh dương |
| GPS qua ĐT (mượn) + Face | GPS của ĐT mượn + Face xác thực | 🔵 Xanh dương |
| GV tick thủ công | GPS máy GV hoặc tọa độ trường | 🟠 Cam |

### Giao diện bản đồ cho GV/Admin:

```
┌──────────────────────────────────────────────────────────────┐
│  🗺️ Bản Đồ Điểm Danh                                       │
│                                                              │
│  Slot: [ Sáng ▾ ]  Ngày: [ 19/04/2026 ]  Lọc: [Tất cả ▾]  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐    │
│  │            🏫 Ký túc xá (bán kính 100m)             │    │
│  │           ╱ · · · · · · · · · ╲                      │    │
│  │         ╱  🟢 Nguyễn A (06:45)  ╲                    │    │
│  │        │  🟢 Trần B (06:50)      │                   │    │
│  │        │  🔵 Lê C (06:55) GPS    │                   │    │
│  │        │  🟡 Phạm D (07:05) TRỄ  │                   │    │
│  │         ╲ 🟠 Hoàng E (GV tick)  ╱                    │    │
│  │           ╲ · · · · · · · · · ╱                      │    │
│  │                                                      │    │
│  │                    🔴 Ngô F (07:30)                   │    │
│  │                    NGOÀI BÁN KÍNH!                   │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌─ Thống kê ────────────────────────────────────────────┐  │
│  │ 🟢 Đúng giờ: 42  │ 🟡 Trễ: 5  │ 🔴 Vắng: 8        │  │
│  │ 🟣 Có phép: 3     │ 🟠 GV tick: 2  │ Tổng: 60       │  │
│  └───────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

### Màu sắc marker trên bản đồ:

| Màu | Trạng thái | Ý nghĩa |
|---|---|---|
| 🟢 Xanh lá | `on_time` | Đúng giờ |
| 🟡 Vàng | `late` | Trễ |
| 🔴 Đỏ | `absent` | Vắng không phép |
| 🟣 Tím | `excused` | Có phép (đơn được duyệt) |
| 🟠 Cam | `manual` | GV tick thủ công |
| ⚫ Xám | Chưa điểm danh | Chưa có dữ liệu |
| 🔴 Đỏ nhấp nháy | `gps_suspicious` | GPS nghi giả |

### Click vào marker → Popup chi tiết:

```
┌─────────────────────────────┐
│ 📍 Nguyễn Văn A             │
│ Lớp 10A - Phòng P201       │
│                             │
│ Giờ: 06:45                  │
│ Trạng thái: ✅ Đúng giờ     │
│ Phương thức: GPS (ĐT)      │
│ Khoảng cách: 35m            │
│ Face verify: ✅ Đã xác thực │
│ Thiết bị: iPhone 15         │
└─────────────────────────────┘
```

---

## 3.1 Quản lý dung lượng bản đồ — Tự động dọn dẹp

### Vấn đề
Mỗi ngày × 4 slot = 4 bản đồ. Mỗi tháng = ~120 bản đồ. Dữ liệu GPS tích lũy → tốn dung lượng DB.

### Giải pháp: Cấu hình tự động xóa GPS map data

```
┌──────────────────────────────────────────────────────────────┐
│  ⚙️ Cấu hình — Quản lý dữ liệu bản đồ                      │
│                                                              │
│  Thời hạn giữ dữ liệu GPS:  [ 7 ] ngày  ▾                 │
│                                (Khuyến nghị: 7-30 ngày)      │
│                                                              │
│  ☑️ Thông báo trước khi xóa: [ 2 ] ngày trước               │
│     → Gửi thông báo cho Admin trước khi dọn dẹp             │
│                                                              │
│  ☑️ Cho phép tải xuống trước khi xóa                         │
│     → Hiện nút "📥 Xuất bản đồ" khi gần đến hạn            │
│                                                              │
│  ⚠️ LƯU Ý: Chỉ xóa dữ liệu GPS (lat/lng).                │
│  Dữ liệu điểm danh (giờ, trạng thái, phương thức)          │
│  vẫn GIỮ NGUYÊN mãi mãi.                                    │
└──────────────────────────────────────────────────────────────┘
```

### Luồng tự động dọn dẹp:

```
Hệ thống kiểm tra mỗi ngày (00:00):
    ↓
Tìm dữ liệu GPS cũ hơn [X] ngày
    ↓
  ├─ CÒN 2 NGÀY trước hạn xóa:
  │     → Gửi thông báo cho Admin:
  │       "📢 Dữ liệu bản đồ từ 10/04 - 12/04 sẽ bị xóa sau 2 ngày.
  │        Bấm để tải xuống nếu cần lưu lại."
  │     → Hiện banner cảnh báo trên Dashboard Admin
  │     → Hiện nút "📥 Xuất Excel + Bản đồ"
  │
  └─ ĐẾN NGÀY XÓA:
        → Xóa cột GPS: SET checkin_latitude = NULL,
          checkin_longitude = NULL, checkin_accuracy = NULL
        → GIỮ NGUYÊN: checkin_time, status, checkin_mode, notes
        → Log: "Đã dọn dẹp GPS data từ DD/MM đến DD/MM"
```

### Cấu hình trong boarding_config:

| Key | Mặc định | Mô tả |
|---|---|---|
| `map_retention_days` | `7` | Số ngày giữ dữ liệu GPS bản đồ |
| `map_cleanup_notify_days` | `2` | Thông báo trước bao nhiêu ngày |
| `map_allow_export` | `true` | Cho phép tải xuống trước khi xóa |

### Lưu ý quan trọng:

**CHỈ XÓA dữ liệu GPS (tọa độ)** — Dữ liệu điểm danh (giờ, trạng thái, phương thức, ghi chú) **KHÔNG BAO GIỜ bị xóa**. Bản đồ mất nhưng báo cáo vẫn đầy đủ.

---

## 4. Báo cáo điểm danh

### 4.1 Bảng báo cáo tổng hợp (theo slot/ngày)

```
┌──────────────────────────────────────────────────────────────────┐
│  📊 Báo Cáo Điểm Danh — Sáng 19/04/2026                        │
│                                                                  │
│  #   Họ tên         Lớp   Phòng  Giờ    Trạng thái  Cách DD    │
│  ────────────────────────────────────────────────────────────────│
│  1   Nguyễn Văn A   10A   P201   06:45  🟢 Đúng giờ  QR thẻ   │
│  2   Trần Thị B     10A   P201   06:50  🟢 Đúng giờ  Face ID  │
│  3   Lê Văn C       10B   P203   06:55  🟢 Đúng giờ  GPS ĐT   │
│  4   Phạm Thị D     11A   P305   07:05  🟡 Trễ       GPS ĐT   │
│  5   Hoàng Văn E    11B   P306   ---    🟠 GV tick    Thủ công │
│  6   Ngô Thị F      12A   P401   ---    🔴 Vắng      ---      │
│  7   Vũ Văn G       12B   P402   ---    🟣 Có phép   Về nhà   │
│                                                                  │
│  Tổng: 60 HS | Đúng giờ: 42 | Trễ: 5 | Vắng: 8 | Phép: 3     │
│  GV tick: 2                                                      │
└──────────────────────────────────────────────────────────────────┘
```

### 4.2 Các cột báo cáo

| Cột | Nguồn dữ liệu |
|---|---|
| Trạng thái | `boarding_attendance.status` (on_time / late / excused) hoặc absent nếu không có record |
| Cách điểm danh | `boarding_attendance.checkin_mode` (qr / face / geo / manual) |
| Giờ | `boarding_attendance.checkin_time` |
| Vị trí | `boarding_attendance.checkin_latitude/longitude` → hiện trên bản đồ |
| Face verify | `boarding_attendance.face_verified` (true/false) |
| GPS nghi vấn | `boarding_attendance.gps_suspicious` (true/false) → highlight đỏ |
| Lý do GV tick | `boarding_attendance.notes` (quên thẻ / hết pin / mất ĐT...) |
| Phép | Cross-check `exit_permissions` → status = excused |

### 4.3 Bộ lọc báo cáo

| Lọc theo | Giá trị |
|---|---|
| Trạng thái | Tất cả / Đúng giờ / Trễ / Vắng / Có phép / GV tick |
| Phương thức | Tất cả / QR / Face ID / GPS ĐT / Thủ công |
| Slot | Tất cả / Sáng / Trưa / Chiều / Tối |
| Ngày | Chọn ngày / Tuần này / Tháng này |
| Phòng | Tất cả / P201 / P202 / ... |
| Lớp | Tất cả / 10A / 10B / ... |

### 4.4 Xuất báo cáo

- Excel (.xlsx) — Toàn bộ dữ liệu + tọa độ GPS
- PDF — Bảng tóm tắt + bản đồ snapshot (nếu GPS chưa bị xóa)

---

## 5. Thay đổi Database

### boarding_attendance — Thêm cột

```sql
-- GPS vị trí khi check-in (cho bản đồ — sẽ bị xóa sau X ngày)
checkin_latitude    DOUBLE PRECISION
checkin_longitude   DOUBLE PRECISION
checkin_accuracy    DOUBLE PRECISION
gps_suspicious      BOOLEAN DEFAULT FALSE

-- Thông tin phương thức check-in (giữ vĩnh viễn)
checkin_mode        TEXT  -- 'qr' | 'face' | 'geo' | 'manual'
face_verified       BOOLEAN DEFAULT FALSE
device_info         TEXT
notes               TEXT  -- Ghi chú của GV khi tick thủ công
checked_by          UUID  -- ID GV nếu tick thủ công
```

### boarding_config — Thêm key

```sql
-- GPS check-in
boarding_latitude    → Vĩ độ KTX/trường
boarding_longitude   → Kinh độ KTX/trường
boarding_radius      → Bán kính (mét)
boarding_allow_geo   → true/false (bật GPS check-in)
boarding_geo_face    → true/false (yêu cầu Face khi GPS)

-- Quản lý dung lượng bản đồ
map_retention_days       → 7 (số ngày giữ GPS data)
map_cleanup_notify_days  → 2 (thông báo trước bao nhiêu ngày)
map_allow_export         → true (cho phép tải trước khi xóa)
```

---

## 6. Tóm tắt cần làm

| # | Việc | Loại | Cần thêm? |
|---|---|---|---|
| 1 | QR tại máy quét | Đã có | ❌ |
| 2 | Face ID tại máy quét | Đã có | ❌ |
| 3 | GPS check-in trên ĐT | **Mới** | ✅ |
| 4 | GV tick thủ công (tìm HS, tick) | **Mới** | ✅ |
| 5 | Bản đồ điểm danh (mỗi slot riêng) | **Mới** | ✅ |
| 6 | Báo cáo (lọc trạng thái + phương thức) | **Nâng cấp** | ✅ |
| 7 | Cấu hình: GPS + Face + map retention | **Mới** | ✅ |
| 8 | Lưu GPS cho QR/Face tại máy quét | **Nâng cấp** | ✅ |
| 9 | Tự động dọn dẹp GPS data + thông báo | **Mới** | ✅ |

