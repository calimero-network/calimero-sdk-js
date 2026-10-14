/**
 * AuthoredMap tests
 */

import '../setup';
import { AuthoredMap } from '../../collections/AuthoredMap';
import { clearStorage, setExecutorId, resetExecutorId } from '../setup';

// Default mock executor is a 32-byte key of 0x01; a second member is 0x02.
const INSERTER = new Uint8Array(32).fill(1);
const OTHER = new Uint8Array(32).fill(2);

describe('AuthoredMap', () => {
  beforeEach(() => {
    clearStorage();
  });

  describe('basic operations', () => {
    it('should insert and get values', () => {
      const map = new AuthoredMap<string, string>();

      map.insert('key1', 'value1');
      expect(map.get('key1')).toBe('value1');
    });

    it('should return null for missing keys', () => {
      const map = new AuthoredMap<string, string>();
      expect(map.get('missing')).toBeNull();
    });

    it('should check if key exists', () => {
      const map = new AuthoredMap<string, string>();

      expect(map.has('key1')).toBe(false);
      map.insert('key1', 'value1');
      expect(map.has('key1')).toBe(true);
      expect(map.contains('key1')).toBe(true);
    });

    it('should update an owned value via set', () => {
      const map = new AuthoredMap<string, string>();

      map.insert('key1', 'value1');
      map.set('key1', 'value2');

      expect(map.get('key1')).toBe('value2');
    });

    it('should iterate entries', () => {
      const map = new AuthoredMap<string, number>();

      map.insert('a', 1);
      map.insert('b', 2);

      expect(map.keys().sort()).toEqual(['a', 'b']);
      expect(map.values().sort()).toEqual([1, 2]);
    });
  });

  describe('authorship', () => {
    it('ownerOf returns the inserting executor', () => {
      const map = new AuthoredMap<string, string>();

      map.insert('key1', 'value1');

      expect(map.ownerOf('key1')).toEqual(INSERTER);
    });

    it('ownerOf returns null for a missing key', () => {
      const map = new AuthoredMap<string, string>();
      expect(map.ownerOf('missing')).toBeNull();
    });

    it('ownedByMe is true for the inserter', () => {
      const map = new AuthoredMap<string, string>();

      map.insert('key1', 'value1');

      expect(map.ownedByMe('key1')).toBe(true);
    });

    it('keyed reads are scoped to the calling executor', () => {
      const map = new AuthoredMap<string, string>();
      map.insert('key1', 'value1');

      setExecutorId(OTHER);
      try {
        expect(map.ownedByMe('key1')).toBe(false);
        expect(map.has('key1')).toBe(false);
        expect(map.get('key1')).toBeNull();
        expect(map.ownerOf('key1')).toBeNull();
      } finally {
        resetExecutorId();
      }
    });

    it('update and remove act on the caller entry only', () => {
      const map = new AuthoredMap<string, string>();
      map.insert('key1', 'value1');

      setExecutorId(OTHER);
      try {
        expect(() => map.update('key1', 'x')).toThrow();
        map.remove('key1');
      } finally {
        resetExecutorId();
      }

      expect(map.get('key1')).toBe('value1');
    });

    it('two executors inserting one key hold two entries', () => {
      const map = new AuthoredMap<string, string>();
      map.insert('key1', 'mine');

      setExecutorId(OTHER);
      try {
        map.insert('key1', 'theirs');
        expect(map.get('key1')).toBe('theirs');
        expect(map.ownerOf('key1')).toEqual(OTHER);
        expect(map.values().sort()).toEqual(['mine', 'theirs']);
      } finally {
        resetExecutorId();
      }

      expect(map.get('key1')).toBe('mine');
      expect(map.keys()).toEqual(['key1', 'key1']);
    });

    it('owner can update and remove', () => {
      const map = new AuthoredMap<string, string>();
      map.insert('key1', 'value1');

      map.update('key1', 'value2');
      expect(map.get('key1')).toBe('value2');

      map.remove('key1');
      expect(map.has('key1')).toBe(false);
    });
  });

  describe('persistence', () => {
    it('should persist across instances', () => {
      const map1 = new AuthoredMap<string, string>();
      map1.insert('key1', 'value1');

      const map2 = AuthoredMap.fromId<string, string>(map1.id());
      expect(map2.get('key1')).toBe('value1');
      expect(map2.ownerOf('key1')).toEqual(INSERTER);
    });
  });
});
