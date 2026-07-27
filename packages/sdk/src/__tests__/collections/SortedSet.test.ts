/**
 * SortedSet tests
 */

import '../setup';
import { SortedSet } from '../../collections/SortedSet';
import { clearStorage } from '../setup';

describe('SortedSet', () => {
  beforeEach(() => {
    clearStorage();
  });

  describe('basic operations', () => {
    it('should start empty', () => {
      const set = new SortedSet<string>();
      expect(set.size()).toBe(0);
      expect(set.has('x')).toBe(false);
    });

    it('should add and check membership', () => {
      const set = new SortedSet<string>();

      expect(set.add('alice')).toBe(true);
      expect(set.has('alice')).toBe(true);
      // Adding an existing value returns false.
      expect(set.add('alice')).toBe(false);
      expect(set.size()).toBe(1);
    });

    it('should delete values', () => {
      const set = new SortedSet<string>();

      set.add('alice');
      expect(set.delete('alice')).toBe(true);
      expect(set.has('alice')).toBe(false);
      expect(set.delete('alice')).toBe(false);
    });

    it('should clear', () => {
      const set = new SortedSet<string>({ initialValues: ['a', 'b', 'c'] });
      expect(set.size()).toBe(3);

      set.clear();
      expect(set.size()).toBe(0);
    });
  });

  describe('iteration', () => {
    it('should iterate values in deterministic sorted order', () => {
      const set = new SortedSet<string>();

      // Single-character values keep serialized byte order == content order.
      set.add('c');
      set.add('a');
      set.add('b');

      expect(set.toArray()).toEqual(['a', 'b', 'c']);
    });
  });

  describe('persistence', () => {
    it('should persist across instances', () => {
      const set1 = new SortedSet<string>({ initialValues: ['x', 'y'] });

      const set2 = new SortedSet<string>({ id: set1.id() });
      expect(set2.toArray().sort()).toEqual(['x', 'y']);
    });
  });
});
