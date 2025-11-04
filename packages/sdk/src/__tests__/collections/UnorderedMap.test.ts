/**
 * UnorderedMap tests
 */

import '../setup';
import { UnorderedMap } from '../../collections/UnorderedMap';
import { clearStorage } from '../setup';

describe('UnorderedMap', () => {
  beforeEach(() => {
    clearStorage();
  });

  describe('basic operations', () => {
    it('should set and get values', () => {
      const map = new UnorderedMap<string, string>();

      map.set('key1', 'value1');
      expect(map.get('key1')).toBe('value1');
    });

    it('should return null for missing keys', () => {
      const map = new UnorderedMap<string, string>();
      expect(map.get('missing')).toBeNull();
    });

    it('should check if key exists', () => {
      const map = new UnorderedMap<string, string>();

      expect(map.has('key1')).toBe(false);
      map.set('key1', 'value1');
      expect(map.has('key1')).toBe(true);
    });

    it('should remove keys', () => {
      const map = new UnorderedMap<string, string>();

      map.set('key1', 'value1');
      expect(map.has('key1')).toBe(true);

      map.remove('key1');
      expect(map.has('key1')).toBe(false);
      expect(map.get('key1')).toBeNull();
    });

    it('should overwrite existing values', () => {
      const map = new UnorderedMap<string, string>();

      map.set('key1', 'value1');
      map.set('key1', 'value2');

      expect(map.get('key1')).toBe('value2');
    });
  });

  describe('type safety', () => {
    it('should work with numbers', () => {
      const map = new UnorderedMap<string, number>();

      map.set('count', 42);
      expect(map.get('count')).toBe(42);
    });

    it('should work with objects', () => {
      interface User {
        name: string;
        age: number;
      }

      const map = new UnorderedMap<string, User>();

      map.set('user1', { name: 'Alice', age: 30 });
      const user = map.get('user1');

      expect(user).toEqual({ name: 'Alice', age: 30 });
    });

    it('should work with number keys', () => {
      const map = new UnorderedMap<number, string>();

      map.set(1, 'one');
      map.set(2, 'two');

      expect(map.get(1)).toBe('one');
      expect(map.get(2)).toBe('two');
    });
  });

  describe('persistence', () => {
    it('should persist across instances', () => {
      const prefix = 'test_map';

      const map1 = new UnorderedMap<string, string>(prefix);
      map1.set('key1', 'value1');

      const map2 = new UnorderedMap<string, string>(prefix);
      expect(map2.get('key1')).toBe('value1');
    });
  });
});

