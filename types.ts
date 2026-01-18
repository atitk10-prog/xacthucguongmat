// EduCheck Type Definitions

export interface Attendee {
  id: string;
  name: string;
  code: string;
  department: string;
  role: string;
  imageUrl: string;
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
  face_vector?: string;
  qr_code?: string;
  status: UserStatus;
  created_at: string;
}

// Event types
export type EventType = string; // Allow custom event types
export type CheckinMethod = 'qr' | 'qr_face' | 'link';
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
  participants?: string[]; // Array of user IDs
}

export type CheckinStatus = 'on_time' | 'late' | 'absent';

export interface EventCheckin {
  id: string;
  event_id: string;
  user_id: string;
  checkin_time: string;
  status: CheckinStatus;
  face_confidence?: number;
  face_verified: boolean;
  points_earned: number;
  photo_url?: string;
  device_info?: string;
  ip_address?: string;
}

export interface BoardingCheckin {
  id: string;
  user_id: string;
  date: string;
  morning_in?: string;
  morning_out?: string;
  evening_in?: string;
  evening_out?: string;
  exit_permission: boolean;
  notes?: string;
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
