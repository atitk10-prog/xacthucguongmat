# 📍 Phân Tích & Phương Án: Geofencing Auto Check-in

> **Trạng thái:** 📋 Đã phân tích — Chưa triển khai  
> **Ngày tạo:** 2026-04-19  
> **File liên quan:**  
> - SQL Migration: `supabase/migrations/add_geo_checkin.sql`  
> - Code chi tiết: `docs/GEOFENCING_CHECKIN_PLAN.md`  

---

## 1. Bối cảnh & Vấn đề

Hệ thống EduCheck AI hiện đã có đầy đủ các phương thức điểm danh:
- ✅ QR Scanner (camera, html5-qrcode)
- ✅ Face ID (face-api.js, auto-detect)  
- ✅ In thẻ QR hàng loạt (PDF)
- ✅ Self check-in (HS tự điểm danh qua link)
- ✅ GPS xác thực vị trí (đã có trong SelfCheckinPage)
- ✅ Realtime đồng bộ đa thiết bị

**Vấn đề:** Tất cả phương thức trên đều yêu cầu HS phải thực hiện nhiều bước (quét QR, chụp Face, bấm nhiều nút). Cần phương thức **nhanh hơn, ít thao tác hơn**.

---

## 2. Các phương án đã phân tích

| # | Phương án | Tốc độ | Khả thi | Gian lận | Đánh giá |
|---|---|---|---|---|---|
| 1 | Zalo QR | Chậm | ❌ API hạn chế | TB | Loại |
| 2 | QR Cá nhân cố định | 1-2s | ✅ Đã có | Dễ chụp lại | Đã có |
| 3 | QR Động (TOTP) | 2-3s | ✅ | Tốt | Không cần thiết (đã có GPS) |
| 4 | NFC Tap | <0.5s | ⚠️ Android only | Tốt | Giới hạn thiết bị |
| 5 | **Geofencing GPS** | **~2s** | **✅ Tốt** | **Cấu hình được** | **✅ CHỌN** |
| 6 | Bảng LED Realtime | N/A | ✅ | N/A | Tính năng hiển thị, không check-in |
| 7 | Flow Mode (Face liên tục) | 1.5s/HS | ✅ | Tốt | Tối ưu UX cho GV |

### Tại sao chọn Geofencing GPS?

1. **Nhanh nhất cho HS:** Chỉ cần 1 nút bấm → xong
2. **Không cần thiết bị phụ:** Không cần thẻ, không cần camera (trừ khi bật Face verify)
3. **Tận dụng hạ tầng có sẵn:** GPS, tọa độ sự kiện, Haversine distance — tất cả đã có
4. **Chống gian lận linh hoạt:** Admin tùy chọn yêu cầu Face verify hoặc không

---

## 3. Phương án chi tiết: Geofencing Auto Check-in

### 3.1 Luồng hoạt động

```
📱 HS đăng nhập Cổng Học Sinh (session lưu vĩnh viễn sau lần đầu)
    ↓
📋 Dashboard hiển thị sự kiện đang diễn ra (có tên HS trong danh sách)
    ↓
👆 HS bấm nút "📍 Điểm danh" trên thẻ sự kiện
    ↓
📡 Yêu cầu bật GPS → Lấy tọa độ 1 LẦN DUY NHẤT
    ↓
🧮 So sánh: GPS của HS ←→ Tọa độ sự kiện (công thức Haversine)
    ↓
  ├─ ✅ Trong bán kính:
  │     ├─ Admin KHÔNG bật Face verify → AUTO CHECK-IN luôn! (~2 giây)
  │     └─ Admin CÓ bật Face verify → Mở camera, chụp 1 lần, so sánh
  │           ├─ Face khớp    → AUTO CHECK-IN (~5 giây)
  │           └─ Face không khớp → ❌ Cảnh báo gian lận
  │
  └─ ❌ Ngoài bán kính → "Bạn đang cách sự kiện X mét"
    ↓
🔇 TẮT GPS ngay lập tức (không theo dõi liên tục, tiết kiệm pin/sóng)
📳 Hiện kết quả thành công → Tự quay Dashboard sau 3 giây
```

### 3.2 Trường hợp KHÔNG đăng nhập

Người tham gia không có tài khoản hoặc chưa đăng nhập → Không dùng được Geofencing.  
**Fallback:** Dùng phương thức cũ (GV quét QR hoặc Face ID tại CheckinPage — đã có sẵn).

### 3.3 Chống gian lận — Cấu hình cho Admin

| Rủi ro | Giải pháp | Cấu hình |
|---|---|---|
| HS nhờ bạn mang ĐT đến trường | Face verify bắt buộc | Admin tích ☑️ `geo_require_face` |
| HS dùng GPS giả (mock location) | Kiểm tra `coords.accuracy` | Tự động: accuracy > 100m → `gps_suspicious = true` |
| HS check-in nhiều lần | Kiểm tra DB trước khi cho check-in | Tự động: `hasUserCheckedIn()` |
| HS dùng emulator | Ghi User Agent | Tự động: lưu `device_info` vào DB |

### 3.4 GPS tự tắt sau khi điểm danh

- Hệ thống dùng `getCurrentPosition()` (lấy 1 lần) thay vì `watchPosition()` (theo dõi liên tục)
- Sau khi check-in xong → camera (nếu có) tự tắt
- **Không** giữ GPS chạy nền → Tiết kiệm pin + không phát sóng dư

### 3.5 So sánh với SelfCheckinPage hiện tại

| Bước | SelfCheckinPage (hiện tại) | GeoCheckin (mới) |
|---|---|---|
| 1 | Mở link self-checkin | Mở Dashboard → Bấm "Điểm danh" |
| 2 | Bấm "BẮT ĐẦU NGAY" | ❌ Không cần |
| 3 | Chờ GPS xác thực | ✅ Tự động (ngầm) |
| 4 | Mở camera Face ID | ❌ Không cần (trừ khi bật) |
| 5 | Nhìn vào camera chờ | ❌ Không cần |
| **Tổng thời gian** | **~15-20 giây** | **~2-5 giây** |

---

## 4. Giới hạn kỹ thuật (trung thực)

| Giới hạn | Lý do | Giải pháp |
|---|---|---|
| HS phải MỞ app | Web app không chạy GPS ở background (trình duyệt không cho phép) | HS chỉ cần mở app 1 lần, bấm 1 nút |
| HS phải đăng nhập | Cần biết user_id để ghi check-in vào DB | Session lưu vĩnh viễn, chỉ đăng nhập lần đầu |
| Lần đầu cần cho phép GPS | Trình duyệt yêu cầu permission | Chỉ hỏi 1 lần, sau đó nhớ |
| Không tự động check-in khi đi ngang | Cần native app cho background geofencing | Phiên bản web → 1 nút bấm là đủ nhanh |

---

## 5. Thay đổi kỹ thuật cần làm

### Database (SQL)
→ File: `supabase/migrations/add_geo_checkin.sql`  
→ Thêm 2 cột vào bảng `events`:  
- `allow_geo_checkin` (BOOLEAN, default false)  
- `geo_require_face` (BOOLEAN, default false)  

### Code Frontend
→ File chi tiết: `docs/GEOFENCING_CHECKIN_PLAN.md`  

| File | Loại | Mô tả |
|---|---|---|
| `types.ts` | Sửa | +2 field Event interface |
| `EventForm.tsx` | Sửa | +2 checkbox cấu hình cho Admin |
| `GeoCheckinPage.tsx` | **Mới** | Component chính xử lý GPS check-in |
| `StudentDashboard.tsx` | Sửa | +Nút "📍 Điểm danh" trên thẻ sự kiện |
| `StudentLayout.tsx` | Sửa | +Route cho geo-checkin |
| `dataService.ts` | Sửa | +1 function `hasUserCheckedIn()` |

---

## 6. Thứ tự triển khai (checklist)

Khi quyết định làm, thực hiện theo thứ tự:

1. [ ] Chạy `supabase/migrations/add_geo_checkin.sql` trên Supabase SQL Editor  
2. [ ] Thêm 2 field vào `types.ts`  
3. [ ] Thêm cấu hình vào `EventForm.tsx`  
4. [ ] Tạo `components/checkin/GeoCheckinPage.tsx`  
5. [ ] Sửa `StudentDashboard.tsx` (thêm nút điểm danh)  
6. [ ] Sửa `StudentLayout.tsx` (thêm route + state)  
7. [ ] Thêm `hasUserCheckedIn()` vào `dataService.ts`  
8. [ ] Test đầy đủ (xem mục 7)

---

## 7. Kế hoạch kiểm thử

| Test case | Kết quả mong đợi |
|---|---|
| Tạo SK mới → Bật GPS → Bật "Cho phép GPS check-in" | Lưu thành công, 2 checkbox hoạt động |
| HS đăng nhập → Dashboard → SK đang diễn ra | Hiện nút "📍 Điểm danh" |
| HS bấm nút → Trong bán kính | ✅ Check-in thành công trong ~2 giây |
| HS bấm nút → Ngoài bán kính | ❌ Hiện "Bạn đang ở xa sự kiện" |
| Bật Face verify → HS bấm nút | Camera mở → Xác thực → Check-in |
| HS đã check-in → Bấm lại | Hiện "Bạn đã điểm danh rồi" |
| GPS accuracy > 100m | DB ghi `gps_suspicious = true` |
| Kiểm tra DB sau check-in | Có `checkin_latitude`, `checkin_longitude`, `checkin_accuracy` |

---

## 8. Thời gian ước tính

| Phần | Thời gian |
|---|---|
| Migration DB + Types | ~15 phút |
| EventForm cấu hình | ~30 phút |
| GeoCheckinPage (component chính) | ~1.5 giờ |
| StudentDashboard + Layout | ~30 phút |
| Test & debug | ~30 phút |
| **Tổng cộng** | **~3 giờ** |
