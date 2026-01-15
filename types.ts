
export interface Attendee {
  id: string;
  name: string;
  code: string;
  department: string;
  role: string;
  imageUrl: string; // Base64 or URL for AI comparison
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
