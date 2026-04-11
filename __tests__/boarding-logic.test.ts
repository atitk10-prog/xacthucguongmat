/**
 * EduCheck AI — Unit Tests: Boarding Check-in Logic
 * Tests for time slot matching, on_time vs late calculation
 */
import { describe, it, expect } from 'vitest';

// ==========================================================
// Replicated calculateCheckinStatus from dataService.ts 
// ==========================================================

interface TimeSlot {
  id: string;
  name: string;
  start_time: string; // "05:00" - Start of check-in window
  end_time: string;   // "06:45" - Deadline (after this = LATE)
  is_active: boolean;
  order_index: number;
}

/**
 * Calculate boarding check-in status based on time slot
 */
function calculateBoardingCheckinStatus(
  checkinTime: string, // "HH:mm" format
  slotEndTime: string  // "HH:mm" deadline
): 'on_time' | 'late' {
  const [checkinH, checkinM] = checkinTime.split(':').map(Number);
  const [endH, endM] = slotEndTime.split(':').map(Number);

  const checkinMinutes = checkinH * 60 + checkinM;
  const endMinutes = endH * 60 + endM;

  return checkinMinutes <= endMinutes ? 'on_time' : 'late';
}

/**
 * Find the current active time slot based on current time
 */
function findCurrentTimeSlot(
  slots: TimeSlot[],
  currentTime: string // "HH:mm"
): TimeSlot | null {
  const [h, m] = currentTime.split(':').map(Number);
  const currentMinutes = h * 60 + m;

  const activeSlots = slots
    .filter(s => s.is_active)
    .sort((a, b) => a.order_index - b.order_index);

  for (const slot of activeSlots) {
    const [startH, startM] = slot.start_time.split(':').map(Number);
    const [endH, endM] = slot.end_time.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    // Window extends 30 minutes after end_time for late check-ins
    if (currentMinutes >= startMinutes && currentMinutes <= endMinutes + 30) {
      return slot;
    }
  }

  return null;
}

// ==========================================================
// Tests
// ==========================================================

const sampleSlots: TimeSlot[] = [
  { id: '1', name: 'Sáng', start_time: '05:00', end_time: '06:45', is_active: true, order_index: 1 },
  { id: '2', name: 'Trưa', start_time: '11:30', end_time: '12:30', is_active: true, order_index: 2 },
  { id: '3', name: 'Chiều', start_time: '17:00', end_time: '17:30', is_active: true, order_index: 3 },
  { id: '4', name: 'Tối', start_time: '21:00', end_time: '22:00', is_active: true, order_index: 4 },
  { id: '5', name: 'Inactive', start_time: '08:00', end_time: '09:00', is_active: false, order_index: 5 },
];

describe('Boarding Check-in Status', () => {
  it('should be ON TIME when before deadline', () => {
    expect(calculateBoardingCheckinStatus('06:30', '06:45')).toBe('on_time');
  });

  it('should be ON TIME when exactly at deadline', () => {
    expect(calculateBoardingCheckinStatus('06:45', '06:45')).toBe('on_time');
  });

  it('should be LATE when after deadline', () => {
    expect(calculateBoardingCheckinStatus('06:46', '06:45')).toBe('late');
  });

  it('should be ON TIME when checking in early morning', () => {
    expect(calculateBoardingCheckinStatus('05:15', '06:45')).toBe('on_time');
  });

  it('should be LATE for evening slot when past 22:00', () => {
    expect(calculateBoardingCheckinStatus('22:01', '22:00')).toBe('late');
  });
});

describe('Find Current Time Slot', () => {
  it('should find morning slot at 06:00', () => {
    const slot = findCurrentTimeSlot(sampleSlots, '06:00');
    expect(slot?.name).toBe('Sáng');
  });

  it('should find noon slot at 12:00', () => {
    const slot = findCurrentTimeSlot(sampleSlots, '12:00');
    expect(slot?.name).toBe('Trưa');
  });

  it('should find evening slot at 21:30', () => {
    const slot = findCurrentTimeSlot(sampleSlots, '21:30');
    expect(slot?.name).toBe('Tối');
  });

  it('should return null when no active slot matches', () => {
    const slot = findCurrentTimeSlot(sampleSlots, '15:00');
    expect(slot).toBeNull();
  });

  it('should ignore inactive slots', () => {
    const slot = findCurrentTimeSlot(sampleSlots, '08:30');
    expect(slot).toBeNull(); // slot 5 is inactive
  });

  it('should find slot during grace period (30 min after end)', () => {
    const slot = findCurrentTimeSlot(sampleSlots, '07:00'); // 15 min after 06:45
    expect(slot?.name).toBe('Sáng');
  });

  it('should return null after grace period ends', () => {
    const slot = findCurrentTimeSlot(sampleSlots, '07:30'); // 45 min after 06:45, past 30 min grace
    expect(slot).toBeNull();
  });

  it('should handle empty slots array', () => {
    expect(findCurrentTimeSlot([], '08:00')).toBeNull();
  });
});
