// EduCheck Type Definitions

export interface Attendee {
  id: string;
  name: string;
  code: string;
  department: string;
  role: string;
  imageUrl: string;
  face_descriptor?: string; // JSON string of float array
}

export interface CheckInLog {
  id: string;
  attendeeId: string;
  timestamp: Date;
  confidence: number;
  status: 'success' | 'failed';
}

export type AppView = 'checkin' | 'dashboard' | 'registry';

export interface RecognitionResult {
  matchedId: string | null;
  confidence: number;
  reason?: string;
}

// ===========================================
// EduCheck Extended Types
// ===========================================

// User roles trong hệ thống
export type UserRole = 'admin' | 'teacher' | 'student' | 'guest';
export type UserStatus = 'active' | 'inactive';

// User đầy đủ cho EduCheck
export interface User {
  id: string;
  email: string;
  password_hash?: string;
  full_name: string;
  role: UserRole;
  class_id?: string;
  room_id?: string;
  zone?: string;
  avatar_url?: string;
  birth_date?: string; // Added field
  total_points?: number; // Added field
  phone?: string;
  address?: string;
  face_vector?: string;
  face_descriptor?: string; // New field for JSON array
  student_code?: string; // Mã học sinh / nhân viên
  organization?: string; // Lớp / Tổ chuyên môn
  qr_code?: string;
  status: UserStatus;
  created_at: string;
}

// Event types
export type EventType = string; // Allow custom event types
export type CheckinMethod = 'qr' | 'face' | 'both';
export type EventStatus = 'draft' | 'active' | 'completed';

export interface Event {
  id: string;
  name: string;
  type: EventType;
  start_time: string;
  end_time: string;
  location: string;
  target_audience: string;
  checkin_method: CheckinMethod;
  qr_code: string;
  late_threshold_mins: number;
  points_on_time: number;
  points_late: number;
  points_absent: number;
  require_face: boolean;
  face_threshold: number;
  created_by: string;
  status: EventStatus;
  latitude?: number;
  longitude?: number;
  radius_meters?: number;
  participants?: string[]; // Array of user IDs
  checkin_mode?: 'student' | 'event';
  enable_popup?: boolean;
}

export type CheckinStatus = 'on_time' | 'late' | 'absent' | 'excused';

export interface EventCheckin {
  id: string;
  event_id: string;
  user_id?: string;
  participant_id?: string; // New field to link with event_participants
  checkin_time: string;
  status: CheckinStatus;
  face_confidence?: number;
  face_verified: boolean;
  points_earned: number;
  photo_url?: string;
  device_info?: string;
  ip_address?: string;
  participants?: EventParticipant; // For join queries
}

export interface EventParticipant {
  id: string;
  event_id: string;
  full_name: string;
  avatar_url?: string;
  birth_date?: string;
  organization?: string;
  address?: string;
  phone?: string;
  email?: string;
  created_at?: string;
  user_id?: string; // Link to system user
  student_code?: string; // Added field
  qr_code?: string; // Added field
  face_descriptor?: string; // Cache field for faster check-in
}

export interface BoardingConfig {
  morning_curfew: string; // "07:00"
  noon_curfew: string; // "12:30"
  evening_curfew: string; // "22:00"
  [key: string]: string;
}

// NEW: Khung giờ check-in linh hoạt
export interface BoardingTimeSlot {
  id: string;
  name: string;          // "Điểm danh buổi sáng", "Điểm danh buổi trưa"
  start_time: string;    // "05:00" - Giờ bắt đầu điểm danh
  end_time: string;      // "06:45" - Giờ kết thúc (deadline) - sau giờ này = TRỄ
  is_active: boolean;    // Có đang bật không
  order_index: number;   // Thứ tự hiển thị
  created_at?: string;
  updated_at?: string;
}

export type CheckinType = 'morning_in' | 'morning_out' | 'noon_in' | 'noon_out' | 'afternoon_in' | 'afternoon_out' | 'evening_in' | 'evening_out';

export interface BoardingCheckin {
  id: string;
  user_id: string;
  date: string;
  morning_in?: string;
  morning_in_status?: 'on_time' | 'late';
  morning_out?: string;
  noon_in?: string;
  noon_in_status?: 'on_time' | 'late';
  noon_out?: string;
  afternoon_in?: string;
  afternoon_in_status?: 'on_time' | 'late';
  afternoon_out?: string;
  evening_in?: string;
  evening_in_status?: 'on_time' | 'late';
  evening_out?: string;
  exit_permission?: boolean;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export type AttendanceRank = 'Tốt' | 'Khá' | 'Trung bình' | 'Yếu';

export interface AttendanceScore {
  id: string;
  user_id: string;
  period: string;
  total_events: number;
  attended: number;
  on_time_count: number;
  late_count: number;
  absent_count: number;
  total_points: number;
  rank: AttendanceRank;
}

export type CertificateType = 'participation' | 'completion' | 'excellent';
export type CertificateStatus = 'issued' | 'revoked';

export interface Certificate {
  id: string;
  user_id: string;
  event_id?: string;
  type: CertificateType;
  title: string;
  issued_date: string;
  qr_verify: string;
  pdf_url?: string;
  status: CertificateStatus;
  template_id?: string;
  metadata?: any;
}

export interface Class {
  id: string;
  name: string;
  grade: number;
  homeroom_teacher_id: string;
  student_count: number;
}

export interface Room {
  id: string;
  name: string;
  zone: string;
  capacity: number;
  manager_id?: string;
}

export interface Config {
  key: string;
  value: string;
  description: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: User;
  token: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export type EduCheckView =
  | 'login'
  | 'dashboard'
  | 'events'
  | 'event-detail'
  | 'checkin'
  | 'boarding'
  | 'users'
  | 'reports'
  | 'certificates'
  | 'settings';

export interface AppState {
  currentView: EduCheckView;
  auth: AuthState;
  selectedEventId?: string;
}

export interface PointLog {
  id: string;
  user_id: string;
  points: number;
  reason: string;
  type: string;
  event_id?: string;
  created_by?: string;
  created_at: string;
  user?: User; // Joined user data
}
