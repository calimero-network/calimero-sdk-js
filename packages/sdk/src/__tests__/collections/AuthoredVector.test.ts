/**
 * AuthoredVector tests
 */

import '../setup';
import { AuthoredVector } from '../../collections/AuthoredVector';
import { clearStorage, setExecutorId, resetExecutorId } from '../setup';

// Default mock executor is a 32-byte key of 0x01; a second member is 0x02.
const PUSHER = new Uint8Array(32).fill(1);
const OTHER = new Uint8Array(32).fill(2);

describe('AuthoredVector', () => {
  beforeEach(() => {
    clearStorage();
  });

  describe('basic operations', () => {
    it('should push and get values, returning the new index', () => {
      const vec = new AuthoredVector<string>();

      expect(vec.push('a')).toBe(0);
      expect(vec.push('b')).toBe(1);

      expect(vec.get(0)).toBe('a');
      expect(vec.get(1)).toBe('b');
      expect(vec.len()).toBe(2);
    });

    it('should return null for out-of-bounds index', () => {
      const vec = new AuthoredVector<string>();
      expect(vec.get(0)).toBeNull();
    });

    it('should read all values via iter/toArray', () => {
      const vec = new AuthoredVector<number>();
      vec.push(1);
      vec.push(2);
      vec.push(3);

      expect(vec.iter()).toEqual([1, 2, 3]);
      expect(vec.toArray()).toEqual([1, 2, 3]);
    });
  });

  describe('authorship', () => {
    it('ownerOf returns the pushing executor', () => {
      const vec = new AuthoredVector<string>();
      vec.push('a');

      expect(vec.ownerOf(0)).toEqual(PUSHER);
    });

    it('ownerOf returns null for an out-of-bounds slot', () => {
      const vec = new AuthoredVector<string>();
      expect(vec.ownerOf(5)).toBeNull();
    });

    it('ownedByMe is true for the pusher and false for others', () => {
      const vec = new AuthoredVector<string>();
      vec.push('a');

      expect(vec.ownedByMe(0)).toBe(true);

      setExecutorId(OTHER);
      try {
        expect(vec.ownedByMe(0)).toBe(false);
      } finally {
        resetExecutorId();
      }
    });

    it('update by a non-owner throws (owner-only)', () => {
      const vec = new AuthoredVector<string>();
      vec.push('a');

      setExecutorId(OTHER);
      try {
        expect(() => vec.update(0, 'hijacked')).toThrow();
      } finally {
        resetExecutorId();
      }

      expect(vec.get(0)).toBe('a');
    });

    it('tombstone by the owner removes the value', () => {
      const vec = new AuthoredVector<string>();
      vec.push('a');
      vec.push('b');

      vec.tombstone(0);

      expect(vec.get(0)).toBeNull();
      expect(vec.get(1)).toBe('b');
      // Tombstoned slots are excluded from iteration.
      expect(vec.iter()).toEqual(['b']);
    });

    it('tombstone by a non-owner throws (owner-only)', () => {
      const vec = new AuthoredVector<string>();
      vec.push('a');

      setExecutorId(OTHER);
      try {
        expect(() => vec.tombstone(0)).toThrow();
      } finally {
        resetExecutorId();
      }

      expect(vec.get(0)).toBe('a');
    });

    it('owner can update in place', () => {
      const vec = new AuthoredVector<string>();
      vec.push('a');

      vec.update(0, 'A');
      expect(vec.get(0)).toBe('A');
    });
  });

  describe('persistence', () => {
    it('should persist across instances', () => {
      const vec1 = new AuthoredVector<string>();
      vec1.push('a');

      const vec2 = AuthoredVector.fromId<string>(vec1.id());
      expect(vec2.get(0)).toBe('a');
      expect(vec2.ownerOf(0)).toEqual(PUSHER);
    });
  });
});
