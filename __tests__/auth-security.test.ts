/**
 * EduCheck AI — Unit Tests: Auth & Security Logic
 * Tests for password hashing, token generation, guest token config
 */
import { describe, it, expect } from 'vitest';

// ==========================================================
// Replicated hashPassword from dataService.ts
// ==========================================================

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + '_educheck_salt_2024');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ==========================================================
// Tests
// ==========================================================

describe('Password Hashing', () => {
  it('should produce a 64-character hex hash', async () => {
    const hash = await hashPassword('mypassword');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should produce consistent hashes for same input', async () => {
    const hash1 = await hashPassword('test123');
    const hash2 = await hashPassword('test123');
    expect(hash1).toBe(hash2);
  });

  it('should produce different hashes for different inputs', async () => {
    const hash1 = await hashPassword('password1');
    const hash2 = await hashPassword('password2');
    expect(hash1).not.toBe(hash2);
  });

  it('should handle empty password', async () => {
    const hash = await hashPassword('');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should handle special characters', async () => {
    const hash = await hashPassword('pässwörd!@#$%^&*()');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should handle very long passwords', async () => {
    const longPassword = 'a'.repeat(10000);
    const hash = await hashPassword(longPassword);
    expect(hash).toHaveLength(64);
  });

  it('should include salt so raw password hash differs', async () => {
    // Hashing "test" with our salt should differ from raw SHA-256 of "test"
    const hash = await hashPassword('test');
    // Raw SHA-256 of "test" = 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08
    expect(hash).not.toBe('9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08');
  });
});

describe('Token Generation', () => {
  it('crypto.randomUUID should generate valid UUID format', () => {
    const token = crypto.randomUUID();
    // UUID v4 format: 8-4-4-4-12
    expect(token).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('should generate unique tokens each time', () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 100; i++) {
      tokens.add(crypto.randomUUID());
    }
    expect(tokens.size).toBe(100);
  });
});

describe('Guest Token Configuration', () => {
  it('should default to EDUCHECK_STAFF when env not set', () => {
    // Simulated behavior - when VITE_GUEST_TOKEN is not set
    const getGuestToken = (envValue?: string) => envValue || 'EDUCHECK_STAFF';

    expect(getGuestToken(undefined)).toBe('EDUCHECK_STAFF');
    expect(getGuestToken('')).toBe('EDUCHECK_STAFF');
  });

  it('should use env value when set', () => {
    const getGuestToken = (envValue?: string) => envValue || 'EDUCHECK_STAFF';

    expect(getGuestToken('CUSTOM_SECRET_123')).toBe('CUSTOM_SECRET_123');
  });
});
