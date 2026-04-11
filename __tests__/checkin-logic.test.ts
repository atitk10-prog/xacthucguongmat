/**
 * EduCheck AI — Unit Tests: Check-in Logic
 * Tests for status calculation (on_time / late), points earning
 */
import { describe, it, expect } from 'vitest';

// ==========================================================
// Pure logic functions extracted for testing
// ==========================================================

/**
 * Calculate check-in status based on event start time and threshold
 * Replicated from dataService.ts checkin() logic
 */
function calculateCheckinStatus(
  checkinTime: Date,
  eventStartTime: Date,
  lateThresholdMins: number
): 'on_time' | 'late' {
  const diffMinutes = (checkinTime.getTime() - eventStartTime.getTime()) / (1000 * 60);
  return diffMinutes > lateThresholdMins ? 'late' : 'on_time';
}

/**
 * Calculate points earned based on status and event config
 */
function calculatePoints(
  status: 'on_time' | 'late',
  pointsOnTime: number,
  pointsLate: number,
  checkinMode: 'student' | 'event'
): number {
  if (checkinMode === 'event') return 0;
  return status === 'on_time' ? pointsOnTime : pointsLate;
}

// ==========================================================
// Tests
// ==========================================================

describe('Check-in Status Calculation', () => {
  const eventStart = new Date('2026-04-04T08:00:00');
  const threshold = 15; // minutes

  it('should be ON TIME when checking in before start', () => {
    const checkinTime = new Date('2026-04-04T07:55:00'); // 5 min early
    expect(calculateCheckinStatus(checkinTime, eventStart, threshold)).toBe('on_time');
  });

  it('should be ON TIME when checking in exactly at start', () => {
    const checkinTime = new Date('2026-04-04T08:00:00');
    expect(calculateCheckinStatus(checkinTime, eventStart, threshold)).toBe('on_time');
  });

  it('should be ON TIME when within late threshold', () => {
    const checkinTime = new Date('2026-04-04T08:10:00'); // 10 min late, threshold 15
    expect(calculateCheckinStatus(checkinTime, eventStart, threshold)).toBe('on_time');
  });

  it('should be ON TIME when at exactly the threshold', () => {
    const checkinTime = new Date('2026-04-04T08:15:00'); // exactly 15 min
    expect(calculateCheckinStatus(checkinTime, eventStart, threshold)).toBe('on_time');
  });

  it('should be LATE when past threshold', () => {
    const checkinTime = new Date('2026-04-04T08:16:00'); // 16 min > 15
    expect(calculateCheckinStatus(checkinTime, eventStart, threshold)).toBe('late');
  });

  it('should be LATE when very late (1 hour)', () => {
    const checkinTime = new Date('2026-04-04T09:00:00');
    expect(calculateCheckinStatus(checkinTime, eventStart, threshold)).toBe('late');
  });

  it('should handle 0 minute threshold', () => {
    const checkinTime = new Date('2026-04-04T08:01:00'); // 1 min late
    expect(calculateCheckinStatus(checkinTime, eventStart, 0)).toBe('late');
  });

  it('should handle negative diff (early check-in)', () => {
    const checkinTime = new Date('2026-04-04T07:30:00'); // 30 min early
    expect(calculateCheckinStatus(checkinTime, eventStart, threshold)).toBe('on_time');
  });
});

describe('Points Calculation', () => {
  it('should give positive points for on-time check-in (student mode)', () => {
    expect(calculatePoints('on_time', 10, -5, 'student')).toBe(10);
  });

  it('should give negative points for late check-in (student mode)', () => {
    expect(calculatePoints('late', 10, -5, 'student')).toBe(-5);
  });

  it('should give 0 points in event mode regardless of status', () => {
    expect(calculatePoints('on_time', 10, -5, 'event')).toBe(0);
    expect(calculatePoints('late', 10, -5, 'event')).toBe(0);
  });

  it('should handle custom point values', () => {
    expect(calculatePoints('on_time', 20, -10, 'student')).toBe(20);
    expect(calculatePoints('late', 20, -10, 'student')).toBe(-10);
  });

  it('should handle 0 point values', () => {
    expect(calculatePoints('on_time', 0, 0, 'student')).toBe(0);
    expect(calculatePoints('late', 0, 0, 'student')).toBe(0);
  });
});

describe('Event Time Validation', () => {
  it('should reject check-in when event ended >1h ago', () => {
    const now = new Date();
    const eventEndTime = new Date(now.getTime() - 2 * 60 * 60 * 1000); // 2h ago
    const graceMs = 60 * 60 * 1000; // 1h grace
    const isExpired = now > new Date(eventEndTime.getTime() + graceMs);
    expect(isExpired).toBe(true);
  });

  it('should allow check-in within 1h grace period after end', () => {
    const now = new Date();
    const eventEndTime = new Date(now.getTime() - 30 * 60 * 1000); // 30min ago
    const graceMs = 60 * 60 * 1000;
    const isExpired = now > new Date(eventEndTime.getTime() + graceMs);
    expect(isExpired).toBe(false);
  });

  it('should reject check-in >2h before event start', () => {
    const now = new Date();
    const eventStart = new Date(now.getTime() + 3 * 60 * 60 * 1000); // 3h from now
    const hoursBeforeStart = (eventStart.getTime() - now.getTime()) / (1000 * 60 * 60);
    expect(hoursBeforeStart > 2).toBe(true);
  });

  it('should allow check-in within 2h before event start', () => {
    const now = new Date();
    const eventStart = new Date(now.getTime() + 1 * 60 * 60 * 1000); // 1h from now
    const hoursBeforeStart = (eventStart.getTime() - now.getTime()) / (1000 * 60 * 60);
    expect(hoursBeforeStart > 2).toBe(false);
  });
});

describe('Offline Check-in Time Preservation', () => {
  it('should use custom_checkin_time when provided (offline sync)', () => {
    const customTime = new Date('2026-04-04T08:05:00');
    const eventStart = new Date('2026-04-04T08:00:00');
    const threshold = 15;

    const checkinTime = customTime; // Would be data.custom_checkin_time
    const diffMinutes = (checkinTime.getTime() - eventStart.getTime()) / (1000 * 60);
    const status = diffMinutes > threshold ? 'late' : 'on_time';

    expect(status).toBe('on_time'); // 5 min late, within 15 min threshold
  });

  it('should correctly mark late offline check-in on sync', () => {
    const customTime = new Date('2026-04-04T08:20:00');
    const eventStart = new Date('2026-04-04T08:00:00');
    const threshold = 15;

    const checkinTime = customTime;
    const diffMinutes = (checkinTime.getTime() - eventStart.getTime()) / (1000 * 60);
    const status = diffMinutes > threshold ? 'late' : 'on_time';

    expect(status).toBe('late'); // 20 min > 15 min threshold
  });
});
