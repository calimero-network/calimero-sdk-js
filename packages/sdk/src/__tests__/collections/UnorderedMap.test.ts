/**
 * UnorderedMap tests
 */

import '../setup';
import { UnorderedMap } from '../../collections/UnorderedMap';
import { UnorderedSet } from '../../collections/UnorderedSet';
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
        preferences: Map<string, number>;
      }

      const map = new UnorderedMap<string, User>();
      const userPrefs = new Map<string, number>([
        ['tea', 5],
        ['coffee', 3]
      ]);

      map.set('user1', { name: 'Alice', age: 30, preferences: userPrefs });
      const user = map.get('user1');

      expect(user).toEqual({
        name: 'Alice',
        age: 30,
        preferences: new Map([
          ['tea', 5],
          ['coffee', 3]
        ])
      });
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
      const map1 = new UnorderedMap<string, string>();
      map1.set('key1', 'value1');

      const map2 = UnorderedMap.fromId<string, string>(map1.id());
      expect(map2.get('key1')).toBe('value1');
    });

    it('should handle nested collections and complex values', () => {
      const owners = new UnorderedSet<string>({ initialValues: ['alice', 'bob'] });
      const config = new Map<string, string>([
        ['region', 'eu'],
        ['tier', 'gold']
      ]);
      const metadata = {
        tags: new Set(['urgent', 'alpha']),
        config
      };

      const map1 = new UnorderedMap<string, typeof metadata>();
      map1.set('account:test', metadata);

      const map2 = UnorderedMap.fromId<string, typeof metadata>(map1.id());
      const restored = map2.get('account:test');

      expect(restored?.tags).toEqual(new Set(['urgent', 'alpha']));
      expect(restored?.config).toEqual(
        new Map<string, string>([
          ['region', 'eu'],
          ['tier', 'gold']
        ])
      );

      const nested = new UnorderedMap<string, UnorderedSet<string>>();
      nested.set('primary', owners);

      const nestedRestored = UnorderedMap.fromId<string, UnorderedSet<string>>(nested.id());
      const set = nestedRestored.get('primary');
      expect(set?.toArray().sort()).toEqual(['alice', 'bob']);
    });
  });
});

