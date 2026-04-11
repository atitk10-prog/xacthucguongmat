/**
 * EduCheck AI — Unit Tests: Face Matching Utils
 * Tests for face descriptor conversion and comparison
 */
import { describe, it, expect } from 'vitest';

// ==========================================================
// Replicated pure utility functions from faceService.ts
// ==========================================================

function descriptorToString(descriptor: Float32Array): string {
  return JSON.stringify(Array.from(descriptor));
}

function stringToDescriptor(str: string): Float32Array {
  try {
    if (!str || str === 'undefined' || str === 'null') {
      return new Float32Array(0);
    }
    const arr = JSON.parse(str);
    if (!Array.isArray(arr)) {
      return new Float32Array(0);
    }
    return new Float32Array(arr);
  } catch (e) {
    return new Float32Array(0);
  }
}

function compareFaces(descriptor1: Float32Array, descriptor2: Float32Array): number {
  // Euclidean distance
  let sum = 0;
  for (let i = 0; i < descriptor1.length; i++) {
    const diff = descriptor1[i] - descriptor2[i];
    sum += diff * diff;
  }
  const distance = Math.sqrt(sum);
  const confidence = Math.max(0, Math.min(100, (1 - distance / 0.8) * 100));
  return Math.round(confidence);
}

// ==========================================================
// Tests
// ==========================================================

describe('Descriptor Serialization', () => {
  it('should round-trip a Float32Array through string conversion', () => {
    const original = new Float32Array([0.1, 0.2, 0.3, -0.5, 0.99]);
    const str = descriptorToString(original);
    const restored = stringToDescriptor(str);

    expect(restored.length).toBe(original.length);
    for (let i = 0; i < original.length; i++) {
      expect(restored[i]).toBeCloseTo(original[i], 5);
    }
  });

  it('should handle empty Float32Array', () => {
    const empty = new Float32Array(0);
    const str = descriptorToString(empty);
    const restored = stringToDescriptor(str);
    expect(restored.length).toBe(0);
  });

  it('should handle null/undefined strings gracefully', () => {
    expect(stringToDescriptor(null as any).length).toBe(0);
    expect(stringToDescriptor(undefined as any).length).toBe(0);
    expect(stringToDescriptor('undefined').length).toBe(0);
    expect(stringToDescriptor('null').length).toBe(0);
  });

  it('should handle invalid JSON gracefully', () => {
    expect(stringToDescriptor('not-json').length).toBe(0);
    expect(stringToDescriptor('{bad}').length).toBe(0);
  });

  it('should handle non-array JSON gracefully', () => {
    expect(stringToDescriptor('{"a":1}').length).toBe(0);
    expect(stringToDescriptor('"string"').length).toBe(0);
  });
});

describe('Face Comparison', () => {
  it('should return 100% for identical descriptors', () => {
    const d = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5]);
    expect(compareFaces(d, d)).toBe(100);
  });

  it('should return 0% for very different descriptors', () => {
    const d1 = new Float32Array([1.0, 1.0, 1.0, 1.0]);
    const d2 = new Float32Array([-1.0, -1.0, -1.0, -1.0]);
    expect(compareFaces(d1, d2)).toBe(0);
  });

  it('should return higher confidence for closer descriptors', () => {
    const base = new Float32Array([0.5, 0.5, 0.5, 0.5]);
    const close = new Float32Array([0.51, 0.49, 0.52, 0.48]);
    const far = new Float32Array([0.8, 0.2, 0.9, 0.1]);

    const closeConfidence = compareFaces(base, close);
    const farConfidence = compareFaces(base, far);

    expect(closeConfidence).toBeGreaterThan(farConfidence);
  });

  it('should be symmetric', () => {
    const d1 = new Float32Array([0.1, 0.2, 0.3]);
    const d2 = new Float32Array([0.4, 0.5, 0.6]);

    expect(compareFaces(d1, d2)).toBe(compareFaces(d2, d1));
  });

  it('should be bounded between 0 and 100', () => {
    const d1 = new Float32Array([0.1, 0.2]);
    const d2 = new Float32Array([10.0, 20.0]); // Very far away

    const result = compareFaces(d1, d2);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(100);
  });
});
