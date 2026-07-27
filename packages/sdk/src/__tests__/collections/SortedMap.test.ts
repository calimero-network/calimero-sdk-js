/**
 * SortedMap tests
 */

import '../setup';
import { SortedMap } from '../../collections/SortedMap';
import { clearStorage } from '../setup';

describe('SortedMap', () => {
  beforeEach(() => {
    clearStorage();
  });

  describe('basic operations', () => {
    it('should set and get values', () => {
      const map = new SortedMap<string, string>();

      map.set('key1', 'value1');
      expect(map.get('key1')).toBe('value1');
    });

    it('should return null for missing keys', () => {
      const map = new SortedMap<string, string>();
      expect(map.get('missing')).toBeNull();
    });

    it('should check if key exists', () => {
      const map = new SortedMap<string, string>();

      expect(map.has('key1')).toBe(false);
      map.set('key1', 'value1');
      expect(map.has('key1')).toBe(true);
    });

    it('should remove keys', () => {
      const map = new SortedMap<string, string>();

      map.set('key1', 'value1');
      expect(map.has('key1')).toBe(true);

      map.remove('key1');
      expect(map.has('key1')).toBe(false);
      expect(map.get('key1')).toBeNull();
    });

    it('should overwrite existing values', () => {
      const map = new SortedMap<string, string>();

      map.set('key1', 'value1');
      map.set('key1', 'value2');

      expect(map.get('key1')).toBe('value2');
    });
  });

  describe('iteration', () => {
    it('should iterate entries in sorted key order', () => {
      const map = new SortedMap<string, number>();

      map.set('c', 3);
      map.set('a', 1);
      map.set('b', 2);

      expect(map.keys()).toEqual(['a', 'b', 'c']);
      expect(map.values()).toEqual([1, 2, 3]);
      expect(map.entries()).toEqual([
        ['a', 1],
        ['b', 2],
        ['c', 3],
      ]);
    });
  });

  describe('persistence', () => {
    it('should persist across instances', () => {
      const map1 = new SortedMap<string, string>();
      map1.set('key1', 'value1');

      const map2 = SortedMap.fromId<string, string>(map1.id());
      expect(map2.get('key1')).toBe('value1');
    });
  });
});
