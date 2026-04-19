# 📍 Geofencing Auto Check-in — Phương Án Triển Khai

> **Trạng thái:** 📋 Đã lên kế hoạch — Chưa triển khai
> **Ngày tạo:** 2026-04-19
> **Ảnh hưởng:** KHÔNG ảnh hưởng code hiện tại. Khi triển khai sẽ thêm MỚI, không sửa logic cũ.

---

## 1. Mục tiêu

HS đăng nhập Cổng Học Sinh → Thấy sự kiện có tên mình → **Bấm "Điểm danh"** → Hệ thống bật GPS → Nếu trong bán kính → **Auto check-in** → Tắt GPS.

**Không cần QR, không cần Face ID, không cần quét gì cả.**

### Chống gian lận
Admin có thể tích chọn **"Yêu cầu Face verify khi điểm danh GPS"** trong cấu hình sự kiện → tránh HS nhờ người khác mang điện thoại đến trường.

---

## 2. Luồng hoạt động

```
📱 HS đăng nhập Cổng Học Sinh
    ↓
📋 Dashboard hiển thị sự kiện đang diễn ra (có tên HS trong danh sách)
    ↓
👆 HS bấm nút "📍 Điểm danh" trên thẻ sự kiện
    ↓
📡 Yêu cầu bật GPS → Lấy tọa độ 1 lần
    ↓
🧮 So sánh: GPS của HS ←→ Tọa độ sự kiện (Haversine distance)
    ↓
  ├─ ✅ Trong bán kính:
  │     ├─ geo_require_face = false → AUTO CHECK-IN luôn!
  │     └─ geo_require_face = true  → Mở camera, chụp 1 frame, so khuôn mặt
  │           ├─ Face khớp    → AUTO CHECK-IN
  │           └─ Face không khớp → ❌ Cảnh báo
  │
  └─ ❌ Ngoài bán kính → "Bạn đang ở xa sự kiện (150m)"
    ↓
🔇 Tắt GPS (chỉ dùng getCurrentPosition 1 lần, không watchPosition)
📳 Hiện kết quả → Tự quay Dashboard sau 3 giây
```

### Trường hợp không đăng nhập
Người tham gia không có tài khoản / chưa đăng nhập → dùng phương thức cũ:
- GV quét QR thẻ (CheckinPage — đã có)
- Nhận diện Face ID (CheckinPage — đã có)

---

## 3. Thay đổi cần làm

### 3.1 Database — Migration SQL

```sql
-- File: supabase/migrations/add_geo_checkin_columns.sql
-- Chạy file này trên Supabase SQL Editor TRƯỚC khi deploy code

ALTER TABLE events ADD COLUMN IF NOT EXISTS allow_geo_checkin BOOLEAN DEFAULT false;
ALTER TABLE events ADD COLUMN IF NOT EXISTS geo_require_face BOOLEAN DEFAULT false;

COMMENT ON COLUMN events.allow_geo_checkin IS 'Cho phép HS tự điểm danh bằng GPS từ Cổng Học Sinh';
COMMENT ON COLUMN events.geo_require_face IS 'Khi GPS check-in, yêu cầu xác thực khuôn mặt (chống gian lận)';
```

> ⚠️ Chạy migration này TRƯỚC khi deploy code frontend.

---

### 3.2 Types — `types.ts`

Thêm 2 field vào interface `Event`:

```typescript
// Thêm vào cuối interface Event
allow_geo_checkin?: boolean;  // Cho phép GPS check-in
geo_require_face?: boolean;   // Yêu cầu Face verify khi GPS check-in
```

---

### 3.3 EventForm.tsx — Cấu hình Admin

Thêm vào phần "Cài đặt Check-in", SAU section "Xác thực vị trí GPS":

```tsx
{/* Geofencing Auto Check-in Config */}
{formData.latitude && formData.longitude && (
  <div className="mt-4 p-4 bg-green-50 rounded-2xl border border-green-200">
    <label className="flex items-center justify-between cursor-pointer mb-3">
      <div>
        <p className="font-bold text-slate-900 flex items-center gap-2">
          📍 Cho phép HS tự điểm danh bằng GPS
        </p>
        <p className="text-sm text-slate-500">
          HS bấm nút trên app → GPS xác nhận vị trí → Tự động check-in
        </p>
      </div>
      <input
        type="checkbox"
        checked={formData.allow_geo_checkin}
        onChange={(e) => setFormData({
          ...formData,
          allow_geo_checkin: e.target.checked,
          geo_require_face: e.target.checked ? formData.geo_require_face : false
        })}
        className="w-6 h-6 rounded accent-green-600"
      />
    </label>

    {formData.allow_geo_checkin && (
      <label className="flex items-center justify-between cursor-pointer bg-orange-50 rounded-xl p-3 border border-orange-200">
        <div>
          <p className="font-bold text-slate-900 text-sm flex items-center gap-2">
            🔒 Yêu cầu xác thực khuôn mặt
          </p>
          <p className="text-xs text-slate-500">
            Chống gian lận: HS phải selfie nhanh sau khi GPS xác nhận
          </p>
        </div>
        <input
          type="checkbox"
          checked={formData.geo_require_face}
          onChange={(e) => setFormData({
            ...formData,
            geo_require_face: e.target.checked
          })}
          className="w-5 h-5 rounded accent-orange-600"
        />
      </label>
    )}
  </div>
)}
```

Thêm vào `formData` state:
```typescript
allow_geo_checkin: false,
geo_require_face: false,
```

Thêm vào `editingEvent` load (useEffect):
```typescript
allow_geo_checkin: (editingEvent as any).allow_geo_checkin || false,
geo_require_face: (editingEvent as any).geo_require_face || false,
```

---

### 3.4 GeoCheckinPage.tsx — Component MỚI (file mới)

Đây là component chính. Tạo file tại: `components/checkin/GeoCheckinPage.tsx`

```tsx
import React, { useState, useEffect, useRef } from 'react';
import { MapPin, CheckCircle, XCircle, Loader2, Camera, ArrowLeft, Shield } from 'lucide-react';
import { dataService } from '../../services/dataService';
import { faceService, compareFaces, stringToDescriptor } from '../../services/faceService';
import { soundService } from '../../services/soundService';
import { User, Event } from '../../types';

interface GeoCheckinPageProps {
  eventId: string;
  currentUser: User;
  onBack: () => void;
  onSuccess: () => void;
}

type GeoStatus = 'idle' | 'requesting_gps' | 'verifying_location' | 'verifying_face' | 'submitting' | 'success' | 'error' | 'already_checked';

export default function GeoCheckinPage({ eventId, currentUser, onBack, onSuccess }: GeoCheckinPageProps) {
  const [event, setEvent] = useState<Event | null>(null);
  const [status, setStatus] = useState<GeoStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [faceConfidence, setFaceConfidence] = useState<number | null>(null);

  // Camera refs for face verify
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  useEffect(() => {
    loadEvent();
    return () => {
      // Cleanup camera on unmount
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
      }
    };
  }, [eventId]);

  const loadEvent = async () => {
    const res = await dataService.getEvent(eventId);
    if (res.success && res.data) {
      setEvent(res.data);

      // Check if already checked in
      const checkRes = await dataService.hasUserCheckedIn(eventId, currentUser.id);
      if (checkRes) {
        setStatus('already_checked');
      }
    } else {
      setErrorMessage('Không tìm thấy sự kiện');
      setStatus('error');
    }
  };

  // Haversine distance (copy from SelfCheckinPage)
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371000; // meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const startGeoCheckin = async () => {
    if (!event) return;

    // ─── Step 1: Request GPS ───
    setStatus('requesting_gps');
    setErrorMessage(null);

    if (!event.latitude || !event.longitude) {
      setErrorMessage('Sự kiện chưa được cấu hình tọa độ GPS.');
      setStatus('error');
      return;
    }

    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000, // 15 giây timeout
          maximumAge: 0   // Luôn lấy vị trí mới
        });
      });

      const curLat = pos.coords.latitude;
      const curLng = pos.coords.longitude;
      const accuracy = pos.coords.accuracy;
      setLocation({ lat: curLat, lng: curLng });

      // ─── Step 2: Verify Distance ───
      setStatus('verifying_location');
      const dist = calculateDistance(curLat, curLng, event.latitude, event.longitude);
      setDistance(dist);

      const radius = event.radius_meters || 100;
      if (dist > radius) {
        setErrorMessage(
          `Bạn đang cách sự kiện ${Math.round(dist)}m. ` +
          `Vui lòng di chuyển vào trong bán kính ${radius}m.`
        );
        setStatus('error');
        soundService.play('error');
        return;
      }

      // ─── Step 3: Face Verify (if required) ───
      if (event.geo_require_face) {
        setStatus('verifying_face');

        if (!currentUser.face_descriptor) {
          setErrorMessage('Bạn chưa đăng ký Face ID. Liên hệ quản trị viên.');
          setStatus('error');
          soundService.play('error');
          return;
        }

        try {
          const mediaStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: 640, height: 480 }
          });
          setStream(mediaStream);
          if (videoRef.current) videoRef.current.srcObject = mediaStream;

          // Wait for camera to be ready
          await new Promise(resolve => setTimeout(resolve, 1500));

          if (videoRef.current) {
            const descriptor = await faceService.getFaceDescriptor(videoRef.current);
            if (descriptor) {
              const savedDescriptor = stringToDescriptor(currentUser.face_descriptor);
              const confidence = compareFaces(descriptor, savedDescriptor);
              setFaceConfidence(confidence);

              const threshold = event.face_threshold || 45;
              if (confidence < threshold) {
                setErrorMessage(`Khuôn mặt không khớp (${confidence}%). Vui lòng thử lại.`);
                setStatus('error');
                soundService.play('error');
                // Stop camera
                mediaStream.getTracks().forEach(t => t.stop());
                return;
              }
            } else {
              setErrorMessage('Không nhận diện được khuôn mặt. Nhìn thẳng vào camera.');
              setStatus('error');
              soundService.play('error');
              mediaStream.getTracks().forEach(t => t.stop());
              return;
            }
          }

          // Stop camera immediately after verify
          mediaStream.getTracks().forEach(t => t.stop());
          setStream(null);
        } catch (camErr) {
          setErrorMessage('Không thể mở camera. Vui lòng cấp quyền.');
          setStatus('error');
          return;
        }
      }

      // ─── Step 4: Submit Check-in ───
      setStatus('submitting');

      // Find participant record
      const { data: participants } = await dataService.getEventParticipants(eventId);
      const participant = participants?.find((p: any) => p.user_id === currentUser.id);

      const result = await dataService.checkin({
        event_id: eventId,
        user_id: currentUser.id,
        participant_id: participant?.id,
        face_confidence: faceConfidence || undefined,
        face_verified: event.geo_require_face ? true : false,
        checkin_mode: 'student',
        device_info: navigator.userAgent,
        checkin_latitude: curLat,
        checkin_longitude: curLng,
        checkin_accuracy: accuracy,
        // Flag nếu GPS accuracy quá lớn (nghi giả GPS)
        gps_suspicious: accuracy > 100
      });

      if (result.success) {
        setStatus('success');
        soundService.play('success');
        // Auto quay về Dashboard sau 3 giây
        setTimeout(() => onSuccess(), 3000);
      } else {
        setErrorMessage(result.error || 'Lỗi điểm danh.');
        setStatus('error');
        soundService.play('error');
      }

    } catch (gpsErr: any) {
      if (gpsErr.code === 1) {
        setErrorMessage('Bạn đã từ chối quyền vị trí. Vui lòng bật GPS trong cài đặt trình duyệt.');
      } else if (gpsErr.code === 2) {
        setErrorMessage('Không thể xác định vị trí. Vui lòng bật GPS thiết bị.');
      } else {
        setErrorMessage('Hết thời gian chờ GPS. Vui lòng thử lại.');
      }
      setStatus('error');
      soundService.play('error');
    }
  };

  // ─── RENDER ───
  if (!event) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center p-6 text-center">
      {/* Header */}
      <button onClick={onBack} className="self-start mb-6 flex items-center gap-2 text-slate-500 hover:text-slate-800">
        <ArrowLeft size={20} /> Quay lại
      </button>

      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border p-8">
        {/* Event Info */}
        <h2 className="text-xl font-black text-slate-800 mb-1">{event.name}</h2>
        <p className="text-sm text-slate-500 mb-6">{event.location}</p>

        {/* Status: Already checked */}
        {status === 'already_checked' && (
          <div className="text-center">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <p className="text-lg font-bold text-green-700">Bạn đã điểm danh rồi!</p>
            <p className="text-sm text-slate-500 mt-2">Không cần điểm danh lại.</p>
          </div>
        )}

        {/* Status: Idle - Ready to start */}
        {status === 'idle' && (
          <div>
            <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <MapPin className="w-10 h-10 text-blue-500" />
            </div>
            <p className="text-sm text-slate-600 mb-6">
              Bấm nút bên dưới để điểm danh bằng vị trí GPS.
              {event.geo_require_face && (
                <span className="block mt-1 text-orange-600 font-medium">
                  🔒 Sự kiện này yêu cầu xác thực khuôn mặt.
                </span>
              )}
            </p>
            <button
              onClick={startGeoCheckin}
              className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold rounded-2xl shadow-lg hover:shadow-xl transition-all active:scale-95 text-lg flex items-center justify-center gap-3"
            >
              <MapPin className="w-5 h-5" />
              Bắt đầu điểm danh
            </button>
          </div>
        )}

        {/* Status: Requesting GPS */}
        {status === 'requesting_gps' && (
          <div className="text-center">
            <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
              <MapPin className="w-10 h-10 text-blue-500" />
            </div>
            <p className="text-lg font-bold text-blue-700">Đang tìm vị trí...</p>
            <p className="text-sm text-slate-500 mt-2">Vui lòng cho phép truy cập GPS</p>
          </div>
        )}

        {/* Status: Verifying Location */}
        {status === 'verifying_location' && (
          <div className="text-center">
            <Loader2 className="w-12 h-12 text-blue-500 animate-spin mx-auto mb-4" />
            <p className="text-lg font-bold text-blue-700">Đang xác nhận vị trí...</p>
          </div>
        )}

        {/* Status: Verifying Face */}
        {status === 'verifying_face' && (
          <div className="text-center">
            <Camera className="w-12 h-12 text-orange-500 mx-auto mb-4 animate-pulse" />
            <p className="text-lg font-bold text-orange-700">Xác thực khuôn mặt...</p>
            <p className="text-sm text-slate-500 mt-2">Nhìn thẳng vào camera</p>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-48 h-48 rounded-full object-cover mx-auto mt-4 border-4 border-orange-200"
            />
          </div>
        )}

        {/* Status: Submitting */}
        {status === 'submitting' && (
          <div className="text-center">
            <Loader2 className="w-12 h-12 text-green-500 animate-spin mx-auto mb-4" />
            <p className="text-lg font-bold text-green-700">Đang ghi nhận...</p>
          </div>
        )}

        {/* Status: Success */}
        {status === 'success' && (
          <div className="text-center">
            <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-12 h-12 text-green-500" />
            </div>
            <p className="text-2xl font-black text-green-700">Điểm danh thành công!</p>
            {distance !== null && (
              <p className="text-sm text-slate-500 mt-2">
                Khoảng cách: {Math.round(distance)}m
                {faceConfidence && ` • Face: ${faceConfidence}%`}
              </p>
            )}
            <p className="text-xs text-slate-400 mt-3">Tự động quay lại sau 3 giây...</p>
          </div>
        )}

        {/* Status: Error */}
        {status === 'error' && (
          <div className="text-center">
            <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <XCircle className="w-12 h-12 text-red-500" />
            </div>
            <p className="text-lg font-bold text-red-700">Không thể điểm danh</p>
            <p className="text-sm text-red-600 mt-2">{errorMessage}</p>
            <button
              onClick={() => { setStatus('idle'); setErrorMessage(null); }}
              className="mt-4 px-6 py-3 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold text-sm transition-colors"
            >
              Thử lại
            </button>
          </div>
        )}
      </div>

      {/* Security Info */}
      <div className="mt-6 flex items-center gap-2 text-xs text-slate-400">
        <Shield size={14} />
        <span>Vị trí GPS được mã hóa và chỉ dùng để xác thực điểm danh</span>
      </div>
    </div>
  );
}
```

---

### 3.5 StudentDashboard.tsx — Thêm nút điểm danh

Trong phần `myEvents.map(event => ...)`, thêm nút bên dưới phần điểm:

```tsx
{/* Nút điểm danh GPS - chỉ hiện khi event cho phép và đang diễn ra */}
{event.allow_geo_checkin && event.eventStatus === 'ongoing' && (
  <button
    onClick={() => {
      // Set event ID rồi navigate sang geo-checkin
      onNavigate('geo-checkin');
      // Cần truyền eventId qua state hoặc context
    }}
    className="w-full mt-3 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 active:scale-95 transition-all shadow-md"
  >
    <MapPin size={16} />
    📍 Điểm danh ngay
  </button>
)}
```

---

### 3.6 StudentLayout.tsx — Thêm route

```typescript
// Thêm vào StudentTab type
export type StudentTab = 'dashboard' | 'card' | 'requests' | 'certificates'
  | 'profile' | 'ranking' | 'rules' | 'geo-checkin';

// Thêm state
const [geoEventId, setGeoEventId] = useState<string | null>(null);

// Thêm vào render
{activeTab === 'geo-checkin' && geoEventId && (
  <GeoCheckinPage
    eventId={geoEventId}
    currentUser={currentUser}
    onBack={() => setActiveTab('dashboard')}
    onSuccess={() => setActiveTab('dashboard')}
  />
)}
```

---

### 3.7 dataService.ts — Thêm function

```typescript
// Kiểm tra HS đã check-in chưa
async hasUserCheckedIn(eventId: string, userId: string): Promise<boolean> {
  const { data, error } = await this.supabase
    .from('checkins')
    .select('id')
    .eq('event_id', eventId)
    .eq('user_id', userId)
    .limit(1);

  return !error && data && data.length > 0;
}
```

---

## 4. Bảo mật & chống gian lận

| Rủi ro | Giải pháp |
|---|---|
| HS nhờ bạn mang ĐT đến trường | Admin bật `geo_require_face` → Face verify bắt buộc |
| HS dùng GPS giả (mock location) | Check `coords.accuracy` > 100m → flag `gps_suspicious` |
| HS check-in nhiều lần | `hasUserCheckedIn()` kiểm tra trước |
| HS dùng emulator | Ghi `device_info` (User Agent) vào DB |

---

## 5. Checklist triển khai

Khi quyết định triển khai, làm theo thứ tự:

- [ ] Chạy migration SQL trên Supabase
- [ ] Thêm 2 field vào `types.ts` (Event interface)
- [ ] Thêm cấu hình vào `EventForm.tsx`
- [ ] Tạo file `GeoCheckinPage.tsx`
- [ ] Sửa `StudentDashboard.tsx` (thêm nút)
- [ ] Sửa `StudentLayout.tsx` (thêm route + state)
- [ ] Thêm `hasUserCheckedIn()` vào `dataService.ts`
- [ ] Test: Tạo sự kiện → Bật GPS check-in → Đăng nhập HS → Điểm danh
- [ ] Test: Bật Face verify → Kiểm tra camera + xác thực
- [ ] Test: Ở ngoài bán kính → Kiểm tra báo lỗi

---

## 6. Giới hạn kỹ thuật (trung thực)

| Giới hạn | Lý do |
|---|---|
| HS phải MỞ app | Web app không chạy GPS ở background |
| HS phải đăng nhập | Cần biết user_id để ghi check-in |
| Lần đầu cần cho phép GPS | Trình duyệt yêu cầu permission |
| GPS lấy 1 lần rồi tắt | Tiết kiệm pin, không theo dõi liên tục |

---

## 7. Ước tính thời gian

| Phần | Thời gian |
|---|---|
| Migration DB + Types | 15 phút |
| EventForm cấu hình | 30 phút |
| GeoCheckinPage (component chính) | 1.5 giờ |
| StudentDashboard + Layout | 30 phút |
| Test & debug | 30 phút |
| **Tổng** | **~3 giờ** |
