/**
 * EduCheck AI — Unit Tests: Event Filter & Data Utils
 * Tests for event filtering, caching logic, and data utilities
 */
import { describe, it, expect, beforeEach } from 'vitest';

// ==========================================================
// Replicated cache logic from dataService.ts
// ==========================================================

interface CacheItem<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

class TestCache {
  private cache = new Map<string, CacheItem<unknown>>();

  get<T>(key: string): T | null {
    const item = this.cache.get(key);
    if (!item) return null;
    if (Date.now() - item.timestamp > item.ttl) {
      this.cache.delete(key);
      return null;
    }
    return item.data as T;
  }

  set<T>(key: string, data: T, ttl: number): void {
    this.cache.set(key, { data, timestamp: Date.now(), ttl });
  }

  clear(prefix?: string): void {
    if (prefix) {
      for (const key of this.cache.keys()) {
        if (key.startsWith(prefix)) this.cache.delete(key);
      }
    } else {
      this.cache.clear();
    }
  }

  size(): number {
    return this.cache.size;
  }
}

// ==========================================================
// Replicated event filter logic
// ==========================================================

interface SimpleEvent {
  id: string;
  name: string;
  status: 'draft' | 'active' | 'completed';
  start_time: string;
}

function filterEvents(
  events: SimpleEvent[],
  filters?: { status?: string }
): SimpleEvent[] {
  if (!filters?.status || filters.status === 'all') return events;
  return events.filter(e => e.status === filters.status);
}

// ==========================================================
// Replicated offline queue duplication check
// ==========================================================

interface OfflineRecord {
  type: string;
  data: any;
}

function isDuplicateInQueue(queue: OfflineRecord[], newRecord: OfflineRecord): boolean {
  return queue.some(item => {
    if (item.type !== newRecord.type) return false;
    if (newRecord.type === 'attendance') {
      return item.data.userId === newRecord.data.userId && item.data.slotId === newRecord.data.slotId;
    }
    if (newRecord.type === 'checkin') {
      return (item.data.user_id && item.data.user_id === newRecord.data.user_id && item.data.event_id === newRecord.data.event_id) ||
        (item.data.participant_id && item.data.participant_id === newRecord.data.participant_id && item.data.event_id === newRecord.data.event_id);
    }
    return JSON.stringify(item.data) === JSON.stringify(newRecord.data);
  });
}

// ==========================================================
// Tests
// ==========================================================

describe('Cache System', () => {
  let cache: TestCache;

  beforeEach(() => {
    cache = new TestCache();
  });

  it('should store and retrieve values', () => {
    cache.set('key1', { name: 'test' }, 10000);
    expect(cache.get<{ name: string }>('key1')).toEqual({ name: 'test' });
  });

  it('should return null for missing keys', () => {
    expect(cache.get('nonexistent')).toBeNull();
  });

  it('should expire items after TTL', async () => {
    cache.set('expiring', 'data', 10); // 10ms TTL
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(cache.get('expiring')).toBeNull();
  });

  it('should clear all entries', () => {
    cache.set('a', 1, 10000);
    cache.set('b', 2, 10000);
    cache.clear();
    expect(cache.size()).toBe(0);
  });

  it('should clear by prefix', () => {
    cache.set('events_123', 1, 10000);
    cache.set('events_456', 2, 10000);
    cache.set('users_789', 3, 10000);
    cache.clear('events');
    expect(cache.get('events_123')).toBeNull();
    expect(cache.get('events_456')).toBeNull();
    expect(cache.get<number>('users_789')).toBe(3);
  });
});

describe('Event Filtering', () => {
  const events: SimpleEvent[] = [
    { id: '1', name: 'Họp đầu tuần', status: 'active', start_time: '2026-04-04T08:00:00' },
    { id: '2', name: 'Sinh hoạt lớp', status: 'completed', start_time: '2026-04-03T08:00:00' },
    { id: '3', name: 'Dự kiến', status: 'draft', start_time: '2026-04-05T08:00:00' },
    { id: '4', name: 'Họp GVCN', status: 'active', start_time: '2026-04-04T14:00:00' },
  ];

  it('should return all events with no filter', () => {
    expect(filterEvents(events)).toHaveLength(4);
  });

  it('should return all events with filter "all"', () => {
    expect(filterEvents(events, { status: 'all' })).toHaveLength(4);
  });

  it('should filter by active status', () => {
    const result = filterEvents(events, { status: 'active' });
    expect(result).toHaveLength(2);
    expect(result.every(e => e.status === 'active')).toBe(true);
  });

  it('should filter by completed status', () => {
    const result = filterEvents(events, { status: 'completed' });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Sinh hoạt lớp');
  });

  it('should filter by draft status', () => {
    const result = filterEvents(events, { status: 'draft' });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Dự kiến');
  });

  it('should return empty for non-matching status', () => {
    expect(filterEvents(events, { status: 'cancelled' })).toHaveLength(0);
  });
});

describe('Offline Queue Deduplication', () => {
  it('should detect duplicate attendance records', () => {
    const queue: OfflineRecord[] = [
      { type: 'attendance', data: { userId: 'user1', slotId: 'slot1' } }
    ];
    const newRecord = { type: 'attendance', data: { userId: 'user1', slotId: 'slot1' } };
    expect(isDuplicateInQueue(queue, newRecord)).toBe(true);
  });

  it('should not flag different attendance records as duplicate', () => {
    const queue: OfflineRecord[] = [
      { type: 'attendance', data: { userId: 'user1', slotId: 'slot1' } }
    ];
    const newRecord = { type: 'attendance', data: { userId: 'user2', slotId: 'slot1' } };
    expect(isDuplicateInQueue(queue, newRecord)).toBe(false);
  });

  it('should detect duplicate checkin by user_id + event_id', () => {
    const queue: OfflineRecord[] = [
      { type: 'checkin', data: { user_id: 'u1', event_id: 'e1' } }
    ];
    expect(isDuplicateInQueue(queue, { type: 'checkin', data: { user_id: 'u1', event_id: 'e1' } })).toBe(true);
  });

  it('should detect duplicate checkin by participant_id + event_id', () => {
    const queue: OfflineRecord[] = [
      { type: 'checkin', data: { participant_id: 'p1', event_id: 'e1' } }
    ];
    expect(isDuplicateInQueue(queue, { type: 'checkin', data: { participant_id: 'p1', event_id: 'e1' } })).toBe(true);
  });

  it('should not cross-match different event types', () => {
    const queue: OfflineRecord[] = [
      { type: 'attendance', data: { userId: 'u1', slotId: 's1' } }
    ];
    expect(isDuplicateInQueue(queue, { type: 'checkin', data: { userId: 'u1', slotId: 's1' } })).toBe(false);
  });

  it('should handle empty queue', () => {
    expect(isDuplicateInQueue([], { type: 'checkin', data: { user_id: 'u1', event_id: 'e1' } })).toBe(false);
  });
});
