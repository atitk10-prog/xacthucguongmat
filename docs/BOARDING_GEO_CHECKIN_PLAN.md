# 🏠 Nâng Cấp Check-in Nội Trú — Phân Tích & Phương Án

> **Trạng thái:** 📋 Đã phân tích — Chưa triển khai  
> **Ngày tạo:** 2026-04-19  
> **File liên quan:**  
> - SQL Migration: `supabase/migrations/add_boarding_geo_checkin.sql`  
> - Phương án sự kiện: `docs/GEOFENCING_ANALYSIS.md`  

---

## 1. Hệ thống nội trú hiện tại

### Đã có:
| Tính năng | File | Trạng thái |
|---|---|---|
| Điểm danh Face ID (tự động nhận diện) | `BoardingCheckin.tsx` | ✅ |
| Điểm danh QR (camera + máy quét HID) | `BoardingCheckin.tsx` | ✅ |
| Khung giờ linh hoạt (time slots) | `boarding_time_slots` | ✅ |
| Realtime sync đa thiết bị | Supabase channel | ✅ |
| Offline queue + sync | `dataService.ts` | ✅ |
| Quản lý phòng + khu vực | `RoomManagement.tsx` | ✅ |
| Xin phép ra ngoài | `ExitPermission.tsx` | ✅ |
| Dashboard thống kê | `BoardingDashboard.tsx` | ✅ |
| Báo cáo + xử lý vắng/trễ | `BoardingReport.tsx` | ✅ |
| Guest staff link (máy quét phụ) | `/boarding-run?token=` | ✅ |
| Night mode (bù sáng) | `BoardingCheckin.tsx` | ✅ |
| Fullscreen mode | `BoardingCheckin.tsx` | ✅ |
| Cooldown chống quét trùng | `checkinCooldownsRef` | ✅ |

### Chưa có:
| Tính năng | Ý tưởng |
|---|---|
| ❌ GPS check-in từ điện thoại HS | HS tự điểm danh nội trú bằng GPS |
| ❌ Bản đồ hiển thị vị trí HS đã điểm danh | Map view cho GV/Admin |
| ❌ Giám sát vị trí HS liên tục (GPS tracking) | Theo dõi HS trong khuôn viên |
| ❌ HS điểm danh qua điện thoại (không cần thẻ QR cứng) | Mở app → bấm → xong |

---

## 2. Câu hỏi của bạn — Trả lời thẳng

### Q1: "Có thể điểm danh nội trú bằng GPS giống sự kiện không?"
**✅ CÓ.** Logic gần giống Geofencing sự kiện, nhưng thay vì tọa độ sự kiện → dùng **tọa độ trường/ký túc xá** (cố định).

### Q2: "HS có thể check-in qua điện thoại thay vì thẻ QR không?"
**✅ CÓ.** HS mở Cổng Học Sinh → Dashboard → Bấm "Điểm danh" tại khung giờ đang mở → GPS xác nhận → Xong.

### Q3: "Hiển thị bản đồ ai đã điểm danh?"
**✅ CÓ.** Cần lưu `checkin_latitude/longitude` vào `boarding_attendance` (hiện chưa có) → Hiển thị bằng map library (Leaflet/OpenStreetMap).

### Q4: "Giám sát HS qua GPS nếu HS không tắt?"
**⚠️ CÓ GIỚI HẠN.**

| Trường hợp | Khả thi? | Chi tiết |
|---|---|---|
| HS đang mở app | ✅ Có | Dùng `watchPosition()` gửi GPS liên tục qua Supabase Realtime |
| HS tắt app / khóa màn hình | ❌ Không | Web app không chạy GPS ở background |
| HS mở app nhưng tắt GPS | ❌ Không | Cần quyền GPS từ người dùng |
| Muốn tracking 24/7 | ❌ Không | Cần native app (React Native / Flutter) |

**Phương án thực tế:** Khi HS mở app để điểm danh → Hệ thống lấy GPS → Lưu vào DB → GV xem trên bản đồ. Đây là **snapshot vị trí tại thời điểm điểm danh**, không phải tracking liên tục.

---

## 3. Phương án đề xuất — 3 tính năng mới

### 🔵 Tính năng A: GPS Check-in Nội Trú (HS tự điểm danh)

**Luồng:**
```
📱 HS mở app (đã đăng nhập sẵn)
    ↓
📋 Dashboard hiện khung giờ đang mở (VD: "Điểm danh sáng - trước 07:00")
    ↓
👆 HS bấm "📍 Điểm danh ngay" (nút chỉ hiện khi slot đang mở)
    ↓
📡 GPS bật → Lấy tọa độ 1 lần
    ↓
🧮 So sánh với tọa độ ký túc xá/trường (cấu hình trong boarding_config)
    ↓
  ├─ ✅ Trong bán kính:
  │     ├─ Không yêu cầu Face → AUTO CHECK-IN
  │     └─ Yêu cầu Face → Chụp selfie nhanh → Check-in
  │
  └─ ❌ Ngoài bán kính → "Bạn đang ở xa ký túc xá"
    ↓
🔇 Tắt GPS → Hiện kết quả → Done
```

**Khác biệt với sự kiện:** Sự kiện có tọa độ riêng từng event. Nội trú dùng **1 tọa độ cố định** (trường/KTX) lưu trong `boarding_config`.

**Chống gian lận:**
- Tùy chọn bắt buộc Face verify (cấu hình tổng, không theo từng slot)
- Kiểm tra GPS accuracy
- Ghi `device_info` + `checkin_latitude/longitude`
- KHÔNG thay thế máy quét GV — HS chỉ thêm 1 lựa chọn nhanh hơn

---

### 🟢 Tính năng B: Bản đồ điểm danh (Map View)

**Ý tưởng:** GV/Admin mở tab "Bản đồ" → Thấy vị trí từng HS đã điểm danh trên bản đồ.

**UI:**
```
┌─────────────────────────────────────────┐
│  🗺️ Bản đồ điểm danh - Sáng 19/04      │
│  ┌───────────────────────────────────┐  │
│  │                                   │  │
│  │     🏫 Ký túc xá                  │  │
│  │     (bán kính 100m)              │  │
│  │                                   │  │
│  │  📍 Nguyễn Văn A - 06:45        │  │
│  │   📍 Trần Thị B - 06:50         │  │
│  │     📍 Lê Văn C - 07:02 (TRỄ)   │  │
│  │                                   │  │
│  │               🔴 Phạm D - 07:30   │  │
│  │               (NGOÀI BÁN KÍNH!)   │  │
│  └───────────────────────────────────┘  │
│  Tổng: 47/60 HS  │ Trễ: 5  │ Vắng: 8  │
└─────────────────────────────────────────┘
```

**Thư viện:** Leaflet.js + OpenStreetMap (miễn phí, không cần API key).

**Dữ liệu:** Lấy từ `boarding_attendance` (cần thêm cột `checkin_latitude`, `checkin_longitude`).

**Màu sắc marker:**
- 🟢 Xanh: Đúng giờ + trong bán kính
- 🟡 Vàng: Trễ
- 🔴 Đỏ: GPS suspicious / ngoài bán kính

---

### 🟠 Tính năng C: Live GPS Tracking (giám sát thời gian thực)

**Giới hạn rõ ràng trước:**
- ❌ KHÔNG THỂ tracking khi HS tắt app
- ✅ CHỈ tracking khi HS đang mở app (Cổng Học Sinh)
- ⚠️ Cần HS ĐỒNG Ý (permission popup)

**Phương án thực tế:**

| Cách | Mô tả | Khả thi |
|---|---|---|
| **A. Snapshot GPS** | Lấy GPS 1 lần khi check-in → Lưu DB → Hiện trên map | ✅ Dễ nhất |
| **B. Periodic ping** | Khi HS mở app, cứ 30 giây gửi GPS 1 lần lên server | ✅ Khả thi |
| **C. Full live tracking** | `watchPosition()` realtime → Supabase Presence | ⚠️ Tốn pin/data |

**Đề xuất: Kết hợp A + B**

- **Khi HS điểm danh:** Lưu vị trí snapshot → Hiện trên bản đồ (Tính năng A)
- **Sau khi điểm danh:** Nếu HS vẫn mở app → Cứ 60 giây ping GPS 1 lần → GV thấy ai đang online + vị trí gần đúng
- **Khi HS tắt app:** Marker chuyển xám "Offline" (chỉ còn vị trí cuối cùng)

---

## 4. Thay đổi kỹ thuật

### Database

```sql
-- boarding_attendance: Thêm GPS cho mỗi lần check-in
ALTER TABLE boarding_attendance ADD COLUMN IF NOT EXISTS checkin_latitude DOUBLE PRECISION;
ALTER TABLE boarding_attendance ADD COLUMN IF NOT EXISTS checkin_longitude DOUBLE PRECISION;
ALTER TABLE boarding_attendance ADD COLUMN IF NOT EXISTS checkin_accuracy DOUBLE PRECISION;
ALTER TABLE boarding_attendance ADD COLUMN IF NOT EXISTS gps_suspicious BOOLEAN DEFAULT FALSE;
ALTER TABLE boarding_attendance ADD COLUMN IF NOT EXISTS device_info TEXT;

-- boarding_config: Thêm cấu hình GPS check-in
-- (Dùng bảng boarding_config key-value hiện có)
-- Keys mới:
--   boarding_latitude      → Vĩ độ KTX/trường
--   boarding_longitude     → Kinh độ KTX/trường
--   boarding_radius        → Bán kính cho phép (mét)
--   boarding_allow_geo     → true/false
--   boarding_geo_face      → true/false (yêu cầu Face khi GPS checkin)

-- student_locations: Bảng mới cho live tracking (optional)
CREATE TABLE IF NOT EXISTS student_locations (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    accuracy DOUBLE PRECISION,
    last_seen TIMESTAMPTZ DEFAULT NOW(),
    is_online BOOLEAN DEFAULT true
);
```

### Frontend

| File | Loại | Mô tả |
|---|---|---|
| `StudentDashboard.tsx` | Sửa | +Nút "📍 Điểm danh" trên khung giờ nội trú |
| `BoardingGeoCheckin.tsx` | **Mới** | Component GPS check-in nội trú (giống GeoCheckinPage nhưng dùng slot) |
| `BoardingMap.tsx` | **Mới** | Component bản đồ hiển thị vị trí HS |
| `BoardingConfigPage.tsx` | Sửa | +Cấu hình tọa độ KTX + bật/tắt GPS check-in |
| `StudentLayout.tsx` | Sửa | +Route cho boarding-geo-checkin |
| `dataService.ts` | Sửa | +Functions: `updateStudentLocation()`, `getStudentLocations()` |

---

## 5. So sánh 3 tính năng

| Tiêu chí | A. GPS Check-in | B. Bản đồ | C. Live Tracking |
|---|---|---|---|
| Giá trị | 🔥🔥🔥 Cao | 🔥🔥 TB-Cao | 🔥 TB |
| Khó | Dễ | Dễ-TB | TB-Khó |
| Thời gian | ~2 giờ | ~3 giờ | ~4 giờ |
| Cần thêm thư viện | Không | Leaflet.js | Leaflet.js |
| Ảnh hưởng code cũ | Không | Không | Ít |
| Pin HS | Ít (1 lần) | Không | Vừa |

---

## 6. Đề xuất thứ tự triển khai

### Giai đoạn 1: GPS Check-in + Bản đồ snapshot (~5 giờ)
1. [ ] Migration DB: thêm GPS columns vào `boarding_attendance`
2. [ ] Cấu hình tọa độ KTX trong `BoardingConfigPage`
3. [ ] Component `BoardingGeoCheckin.tsx` (HS tự điểm danh)
4. [ ] Nút "📍 Điểm danh" trên `StudentDashboard.tsx`
5. [ ] Component `BoardingMap.tsx` (bản đồ snapshot)
6. [ ] Tab "Bản đồ" trong `BoardingDashboard.tsx`

### Giai đoạn 2: Live Tracking (tùy chọn, thêm ~4 giờ)
7. [ ] Bảng `student_locations` + RLS policies
8. [ ] Service `locationService.ts` (ping GPS mỗi 60 giây)
9. [ ] Supabase Realtime subscribe cho `student_locations`
10. [ ] Live markers trên bản đồ (online/offline status)

---

## 7. Bảo mật & Quyền riêng tư

| Vấn đề | Giải pháp |
|---|---|
| **HS không muốn bị theo dõi** | Live tracking CHỈ khi HS mở app. Tắt app = tắt tracking |
| **Dữ liệu vị trí nhạy cảm** | Chỉ lưu tọa độ khi điểm danh. Live tracking xóa sau 24h |
| **GDPR / Quyền riêng tư** | Hiện popup xin phép GPS rõ ràng. HS có quyền từ chối → dùng QR/Face thay thế |
| **GPS giả** | Check `coords.accuracy` + flag `gps_suspicious` |
| **Nhờ người mang ĐT** | Tùy chọn bắt buộc Face verify |

---

## 8. Tổng kết phương án tốt nhất

> **Phương án được đề xuất: Giai đoạn 1 — GPS Check-in + Bản đồ snapshot**

**Lý do:**
1. HS có thêm 1 cách nhanh để điểm danh (bên cạnh QR/Face hiện có)
2. GV xem được bản đồ biết HS điểm danh ở đâu
3. Không ảnh hưởng hệ thống hiện tại (thêm mới, không sửa cũ)
4. Không tốn pin HS (lấy GPS 1 lần rồi tắt)
5. Live tracking để giai đoạn 2 nếu cần

**Luồng cuối cùng cho HS:**
```
HS mở app → Dashboard → Khung giờ sáng đang mở
    → Bấm "📍 Điểm danh" → GPS lấy 1 lần
    → Trong bán kính KTX → ✅ Check-in thành công
    → GPS tắt ngay → Done (2 giây)
```

**Luồng cho GV/Admin:**
```
GV mở Dashboard nội trú → Tab "Bản đồ"
    → Thấy vị trí từng HS đã điểm danh sáng nay
    → 🟢 Đúng giờ + trong KTX
    → 🔴 Ngoài bán kính (nghi vấn)
    → Click vào marker → Xem thông tin chi tiết
```

---

## 9. Các trường hợp dự phòng & Xử lý lỗi

### 9.1 Sơ đồ quyết định — HS không thể điểm danh

```
HS không thể điểm danh bình thường
    ↓
  ├─ Không có điện thoại?
  │     ├─ Có thẻ QR → GV quét thẻ (đã có)
  │     └─ Không có thẻ → GV điểm danh thủ công / Face ID
  │
  ├─ Mất thẻ QR?
  │     ├─ Có điện thoại → Dùng GPS check-in / QR trên app
  │     └─ Không có ĐT → GV quét Face ID / điểm danh thủ công
  │
  ├─ Hết pin điện thoại?
  │     ├─ Có thẻ → GV quét thẻ
  │     └─ Không có thẻ → GV quét Face / điểm danh thủ công
  │
  ├─ GPS bị lỗi / không bật được?
  │     → Fallback: Quét QR hoặc Face ID tại máy GV
  │
  ├─ Về nhà (đã xin phép)?
  │     → Tự động đánh dấu "Có phép" (excused) - không tính vắng
  │
  ├─ Về nhà (CHƯA xin phép)?
  │     → Đánh dấu "Vắng không phép" → GV xử lý sau
  │     → Gợi ý: HS có thể gửi đơn xin phép muộn từ app
  │
  └─ Face ID không nhận?
        → Thử lại (ánh sáng, góc chụp)
        → Fallback: GV quét QR thẻ / điểm danh thủ công
```

---

### 9.2 Bảng xử lý chi tiết — 25 trường hợp

#### 🔴 Nhóm A: Vấn đề thiết bị

| # | Trường hợp | Xử lý | Ai xử lý | Thông báo hiển thị |
|---|---|---|---|---|
| A1 | HS không có điện thoại | GV quét thẻ QR hoặc Face ID | GV tại máy quét | "Đưa thẻ QR hoặc nhìn vào camera" |
| A2 | ĐT hết pin | GV quét thẻ QR hoặc Face ID | GV | Không cần UI |
| A3 | ĐT không có GPS (máy cũ) | Dùng QR trên app (hiện QR code cá nhân từ Cổng HS) hoặc Face | HS tự hiện QR | "Thiết bị không hỗ trợ GPS. Hiện mã QR cá nhân." |
| A4 | ĐT bị hư/mất | GV điểm danh thủ công + ghi chú | GV | GV bấm nút "Điểm danh thủ công" |
| A5 | Trình duyệt từ chối quyền GPS | Hướng dẫn bật hoặc fallback QR/Face | HS | "Bạn đã từ chối GPS. Vào Cài đặt > Quyền > Vị trí để bật, hoặc dùng QR." |
| A6 | Trình duyệt từ chối quyền Camera | Fallback: quét QR thẻ tại máy GV | HS/GV | "Camera bị chặn. Dùng thẻ QR để điểm danh." |

#### 🟡 Nhóm B: Vấn đề GPS

| # | Trường hợp | Xử lý | Thông báo |
|---|---|---|---|
| B1 | GPS timeout (>15 giây) | Cho thử lại 1 lần, sau đó fallback QR | "Không thể xác định vị trí. Bấm 'Thử lại' hoặc dùng QR." |
| B2 | GPS accuracy > 100m | Ghi nhận nhưng flag `gps_suspicious` | "Vị trí không chính xác (±XXm). Thử ra ngoài trời." |
| B3 | HS ở ngoài bán kính | Không cho check-in GPS → hướng dẫn di chuyển | "Bạn cách KTX XXm. Vui lòng vào trong bán kính XXm." |
| B4 | HS dùng GPS giả (mock) | Flag `gps_suspicious` + yêu cầu Face verify | "Phát hiện GPS bất thường. Vui lòng xác thực khuôn mặt." |
| B5 | GPS trả về tọa độ 0,0 | Reject check-in, hướng dẫn bật GPS hệ thống | "GPS chưa bật. Vào Cài đặt > Vị trí để bật." |
| B6 | Chưa cấu hình tọa độ KTX | Admin chưa setup → Ẩn nút GPS check-in | Nút "📍 Điểm danh" không hiện |

#### 🟠 Nhóm C: Vấn đề thẻ QR

| # | Trường hợp | Xử lý | Thông báo |
|---|---|---|---|
| C1 | Mất thẻ QR | HS dùng GPS check-in hoặc Face ID | GV báo admin cấp lại thẻ |
| C2 | Thẻ QR bị hỏng/nhòe | GV dùng Face ID hoặc nhập mã HS thủ công | "Thẻ không đọc được. Nhập mã HS:" |
| C3 | Quên mang thẻ | GPS/Face ID fallback | HS dùng app hoặc đứng trước camera |
| C4 | Thẻ bị mượn/trộn thẻ | Face ID verify sẽ phát hiện không khớp | "Khuôn mặt không khớp với thẻ!" |

#### 🔵 Nhóm D: Vấn đề xin phép

| # | Trường hợp | Xử lý | Hệ thống |
|---|---|---|---|
| D1 | HS về nhà đã xin phép (duyệt) | Tự động đánh dấu "excused" → Không tính vắng | `exit_permissions.status = 'approved'` + thời gian phù hợp → `boarding_attendance.status = 'excused'` |
| D2 | HS về nhà CHƯA xin phép | Đánh dấu "absent" → GV kiểm tra | GV thấy trong danh sách vắng, liên hệ PH |
| D3 | HS xin phép nhưng bị từ chối | Vẫn phải điểm danh bình thường | Nếu vắng → "absent" + ghi chú "Đơn bị từ chối" |
| D4 | HS xin phép MUỘN (sau giờ) | Cho phép gửi đơn muộn → GV duyệt → Chuyển thành "excused" | Thêm nút "Gửi đơn bổ sung" trên app HS |
| D5 | HS về nhưng quay lại trễ (hết phép) | Slot tiếp theo sẽ đánh dấu "late" hoặc "absent" | Tự động theo giờ `return_time` trên đơn |
| D6 | HS đi ra ngoài (chưa đến giờ checkout) | Nếu GV bật Live Tracking → thấy HS rời khỏi KTX | Marker đỏ "Đang rời khỏi khuôn viên" |

#### ⚫ Nhóm E: Lỗi hệ thống / Mạng

| # | Trường hợp | Xử lý | Thông báo |
|---|---|---|---|
| E1 | Mất internet (cả trường) | Offline mode: GV quét → lưu local → sync sau | "⚡ Offline — đang lưu cục bộ, tự đồng bộ khi có mạng" |
| E2 | Supabase sập | Offline queue giữ checkin → retry tự động | Hiện badge "X đang chờ đồng bộ" |
| E3 | App bị crash giữa chừng | Data đã gửi thì có → Chưa gửi thì mất | HS check lại trạng thái trên Dashboard |
| E4 | Slot chưa mở (ngoài giờ) | Ẩn nút GPS check-in, hiện thông báo | "Chưa đến giờ điểm danh. Slot tiếp: Sáng (06:00)" |
| E5 | Slot đã đóng (quá giờ) | Nếu trong grace period → "late". Nếu hết → từ chối | "Đã quá giờ điểm danh. Liên hệ GV." |

#### 🟣 Nhóm F: Chống gian lận nâng cao

| # | Trường hợp | Phát hiện | Xử lý |
|---|---|---|---|
| F1 | HS nhờ bạn mang ĐT | GPS trong bán kính, nhưng Face không khớp | Reject + log cảnh báo cho GV |
| F2 | HS dùng ảnh để Face ID | Live detection check (chớp mắt/xoay đầu) | "Vui lòng nhìn trực tiếp vào camera" |
| F3 | 2 HS check-in bằng 1 ĐT | Kiểm tra `device_info` trùng trong 5 phút | Flag + cảnh báo GV |
| F4 | HS check-in rồi lẻn ra ngoài | Live tracking phát hiện rời KTX | Marker chuyển đỏ trên bản đồ GV |
| F5 | HS thay đổi GPS/VPN | `coords.accuracy` bất thường + `device_info` thay đổi | Flag `gps_suspicious` |

---

### 9.3 Ma trận phương thức dự phòng

Khi HS không dùng được phương thức chính → hệ thống tự gợi ý fallback:

| HS có gì? | Phương thức 1 (ưu tiên) | Phương thức 2 | Phương thức 3 (cuối) |
|---|---|---|---|
| ĐT + GPS + đăng nhập | 📍 GPS Check-in (tự động) | 📱 QR trên app | 🎭 Face ID tại máy GV |
| ĐT + KHÔNG có GPS | 📱 QR trên app | 🎭 Face ID tại máy GV | ✋ GV điểm danh thủ công |
| Thẻ QR (không ĐT) | 🪪 GV quét thẻ | 🎭 Face ID | ✋ GV thủ công |
| KHÔNG có gì cả | 🎭 Face ID tại máy GV | ✋ GV thủ công + ghi chú | 📝 GV ghi sổ → nhập sau |
| HS có phép về nhà | ✅ Tự động excused | — | — |

**Nguyên tắc vàng:** KHÔNG BAO GIỜ từ chối điểm danh HS hoàn toàn. Luôn có ít nhất 1 phương thức dự phòng. Trường hợp xấu nhất → GV điểm danh thủ công.

---

### 9.4 Nút "Điểm danh thủ công" cho GV

Thêm nút trên `BoardingCheckin.tsx` cho GV xử lý nhanh các trường hợp đặc biệt:

```
┌─────────────────────────────────────┐
│  ✋ Điểm danh thủ công              │
│                                     │
│  🔍 Tìm học sinh: [___________]    │
│                                     │
│  📋 Nguyễn Văn A - Lớp 10A - P201  │
│     [✅ Điểm danh] [📝 Ghi chú]   │
│                                     │
│  Lý do: ○ Quên thẻ                 │
│         ○ Hết pin ĐT               │
│         ○ Mất thẻ                   │
│         ○ ĐT hỏng                  │
│         ○ Lỗi GPS                   │
│         ○ Khác: [___________]       │
│                                     │
│  [✅ XÁC NHẬN ĐIỂM DANH]           │
└─────────────────────────────────────┘
```

**Dữ liệu ghi nhận:**
- `checkin_mode`: `'manual'`
- `notes`: Lý do cụ thể
- `checked_by`: ID của GV
- `device_info`: "Manual by Teacher"

---

### 9.5 Luồng xử lý "HS về nhà" tự động

```
Hệ thống kiểm tra exit_permissions lúc hết hạn slot:
    ↓
Lấy danh sách HS chưa check-in
    ↓
Đối chiếu từng HS:
  ├─ HS có đơn xin phép status='approved'
  │   VÀ ngày hôm nay nằm trong [exit_time, return_time]
  │     → Tự đánh dấu: status = 'excused'
  │     → GV thấy: "Có phép - Về nhà cuối tuần"
  │     → KHÔNG trừ điểm
  │
  ├─ HS có đơn status='pending' (chờ duyệt)
  │     → Đánh dấu: status = 'absent' (tạm)
  │     → GV thấy: "⚠️ Vắng — Có đơn đang chờ duyệt"
  │     → Nếu GV duyệt đơn → Tự chuyển thành 'excused'
  │
  └─ HS KHÔNG có đơn nào
        → Đánh dấu: status = 'absent'
        → GV thấy: "🔴 Vắng không phép"
        → Trừ điểm theo cấu hình
```

---

### 9.6 Thông báo / Message lỗi chuẩn hóa

Các message lỗi hiển thị cho HS phải **thân thiện, không gây khó dễ, và luôn có gợi ý giải pháp**:

| Lỗi kỹ thuật | ❌ KHÔNG hiện này | ✅ Hiện cái này |
|---|---|---|
| `GPS_PERMISSION_DENIED` | "Lỗi GPS" | "Bạn cần bật quyền Vị trí. Vào ⚙️ Cài đặt > Quyền > Vị trí, hoặc dùng QR thẻ." |
| `GPS_TIMEOUT` | "Hết thời gian" | "Không tìm được vị trí. Thử ra ngoài trời rồi bấm 'Thử lại' 🔄" |
| `GPS_OUT_OF_RANGE` | "Ngoài phạm vi" | "Bạn đang cách KTX XXm. Di chuyển vào trong bán kính XXm rồi thử lại. 📍" |
| `FACE_NOT_MATCH` | "Sai khuôn mặt" | "Khuôn mặt chưa khớp. Nhìn thẳng vào camera, đảm bảo đủ ánh sáng. 💡" |
| `FACE_NOT_FOUND` | "Null descriptor" | "Không phát hiện khuôn mặt. Hãy đưa mặt vào khung hình. 📷" |
| `ALREADY_CHECKED` | "Duplicate" | "Bạn đã điểm danh buổi sáng rồi! ✅ Không cần làm lại." |
| `SLOT_CLOSED` | "Error 403" | "Đã hết giờ điểm danh (XX:XX). Liên hệ giáo viên nếu cần. 🕐" |
| `NETWORK_ERROR` | "500 Internal" | "Mất kết nối mạng. Dữ liệu đã lưu tạm, tự đồng bộ khi có mạng. 📡" |
| `NO_CARD_NO_PHONE` | — | "Bạn có thể đến gặp GV trực để điểm danh bằng nhận diện khuôn mặt. 🎭" |
| `LOST_CARD` | — | "Thẻ bị mất? Dùng QR trên điện thoại hoặc Face ID. Báo Admin để cấp thẻ mới. 🪪" |

---

### 9.7 Checklist cho Admin cấu hình đúng

Trước khi bật GPS check-in cho nội trú, Admin cần kiểm tra:

- [ ] Đã nhập tọa độ KTX/trường (boarding_latitude, boarding_longitude)
- [ ] Đã đặt bán kính hợp lý (khuyến nghị: 50-200m tùy khuôn viên)
- [ ] Đã test thử GPS check-in trên thiết bị thật
- [ ] Đã quyết định bật/tắt Face verify (geo_require_face)
- [ ] Đã thông báo cho HS biết có thêm phương thức GPS
- [ ] Máy quét QR/Face tại KTX vẫn hoạt động (không tắt - đây là fallback chính)
- [ ] GV biết cách dùng nút "Điểm danh thủ công" cho trường hợp đặc biệt
