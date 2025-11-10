/**
 * Vector tests
 */

import '../setup';
import { Vector } from '../../collections/Vector';
import { clearStorage } from '../setup';

describe('Vector', () => {
  beforeEach(() => {
    clearStorage();
  });

  describe('basic operations', () => {
    it('should start empty', () => {
      const vec = new Vector<string>();
      expect(vec.len()).toBe(0);
    });

    it('should push and get values', () => {
      const vec = new Vector<string>();

      vec.push('first');
      vec.push('second');
      vec.push('third');

      expect(vec.len()).toBe(3);
      expect(vec.get(0)).toBe('first');
      expect(vec.get(1)).toBe('second');
      expect(vec.get(2)).toBe('third');
    });

    it('should return null for out of bounds', () => {
      const vec = new Vector<string>();

      vec.push('first');

      expect(vec.get(1)).toBeNull();
      expect(vec.get(10)).toBeNull();
    });

    it('should pop values', () => {
      const vec = new Vector<string>();

      vec.push('first');
      vec.push('second');

      expect(vec.pop()).toBe('second');
      expect(vec.len()).toBe(1);

      expect(vec.pop()).toBe('first');
      expect(vec.len()).toBe(0);

      expect(vec.pop()).toBeNull();
    });
  });

  describe('type safety', () => {
    it('should work with numbers', () => {
      const vec = new Vector<number>();

      vec.push(1);
      vec.push(2);
      vec.push(3);

      expect(vec.get(0)).toBe(1);
      expect(vec.get(1)).toBe(2);
      expect(vec.get(2)).toBe(3);
    });

    it('should work with objects', () => {
      interface Item {
        id: number;
        name: string;
      }

      const vec = new Vector<Item>();

      vec.push({ id: 1, name: 'Alice' });
      vec.push({ id: 2, name: 'Bob' });

      expect(vec.get(0)).toEqual({ id: 1, name: 'Alice' });
      expect(vec.get(1)).toEqual({ id: 2, name: 'Bob' });
    });
  });

  describe('persistence', () => {
    it('should persist across instances', () => {
      const vec1 = new Vector<string>();
      vec1.push('item1');
      vec1.push('item2');

      const vec2 = new Vector<string>({ id: vec1.id() });
      expect(vec2.len()).toBe(2);
      expect(vec2.get(0)).toBe('item1');
      expect(vec2.get(1)).toBe('item2');
    });
  });
});

