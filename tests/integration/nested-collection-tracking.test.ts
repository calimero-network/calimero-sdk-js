/**
 * Integration tests for nested collection change propagation
 *
 * Tests the nested collection tracking system in `packages/sdk/src/runtime/nested-tracking.ts`
 * which handles automatic change propagation for patterns like Map<K, Set<V>>.
 *
 * Coverage:
 * - Nested map/set/vector combinations
 * - Modification detection
 * - State persistence
 */

import { nestedTracker } from '../../packages/sdk/src/runtime/nested-tracking';
import {
  registerCollectionType,
  hasRegisteredCollection,
  snapshotCollection,
} from '../../packages/sdk/src/runtime/collections';

// Mock collection ID counter - use random prefix to ensure unique IDs across test runs
// This avoids cross-test pollution in the global nestedTracker without modifying production code
let testRunId = '';
let mockIdCounter = 0;

// In-memory storage for mock collections
const mockStorage = new Map<string, Map<string, unknown>>();
const mockVectorStorage = new Map<string, unknown[]>();
const mockSetStorage = new Map<string, Set<string>>();

// Track modifications for testing propagation
const modificationLog: Array<{ type: string; id: string; operation: string }> = [];

// Helper to generate unique IDs - uses test run ID to ensure uniqueness across tests
function generateId(): string {
  mockIdCounter += 1;
  return `mock-${testRunId}-${mockIdCounter}`;
}

// Helper to clear test state
function clearTestState(): void {
  // Generate a new test run ID to ensure all collections in this test have unique IDs
  // This avoids conflicts with any lingering state in the global nestedTracker
  testRunId = Math.random().toString(36).substring(2, 10);
  mockIdCounter = 0;
  mockStorage.clear();
  mockVectorStorage.clear();
  mockSetStorage.clear();
  modificationLog.length = 0;
}

// Mock UnorderedMap class for testing
class MockUnorderedMap<K, V> {
  private id_: string;
  private store: Map<string, V>;

  constructor() {
    this.id_ = generateId();
    this.store = new Map();
    mockStorage.set(this.id_, this.store as Map<string, unknown>);

    // Register with nested tracker
    nestedTracker.registerCollection(this);
  }

  id(): string {
    return this.id_;
  }

  get(key: K): V | null {
    const keyStr = JSON.stringify(key);
    return this.store.get(keyStr) ?? null;
  }

  set(key: K, value: V): void {
    const keyStr = JSON.stringify(key);
    this.store.set(keyStr, value);

    // Register nested collections
    if (hasRegisteredCollection(value)) {
      nestedTracker.registerCollection(value, this, key);
    }

    // Log modification and notify tracker
    modificationLog.push({ type: 'UnorderedMap', id: this.id_, operation: 'set' });
    nestedTracker.notifyCollectionModified(this);
  }

  remove(key: K): void {
    const keyStr = JSON.stringify(key);
    this.store.delete(keyStr);

    // Log modification and notify tracker
    modificationLog.push({ type: 'UnorderedMap', id: this.id_, operation: 'remove' });
    nestedTracker.notifyCollectionModified(this);
  }

  has(key: K): boolean {
    const keyStr = JSON.stringify(key);
    return this.store.has(keyStr);
  }

  entries(): Array<[K, V]> {
    return Array.from(this.store.entries()).map(([k, v]) => [JSON.parse(k), v]);
  }

  toJSON(): Record<string, unknown> {
    return {
      __calimeroCollection: 'UnorderedMap',
      id: this.id_,
    };
  }
}

// Mock UnorderedSet class for testing
class MockUnorderedSet<T> {
  private id_: string;
  private store: Set<string>;

  constructor() {
    this.id_ = generateId();
    this.store = new Set();
    mockSetStorage.set(this.id_, this.store);

    // Register with nested tracker
    nestedTracker.registerCollection(this);
  }

  id(): string {
    return this.id_;
  }

  add(value: T): boolean {
    const valueStr = JSON.stringify(value);
    const existed = this.store.has(valueStr);
    this.store.add(valueStr);

    // Register nested collections
    if (hasRegisteredCollection(value)) {
      nestedTracker.registerCollection(value, this, value);
    }

    // Log modification and notify tracker
    modificationLog.push({ type: 'UnorderedSet', id: this.id_, operation: 'add' });
    nestedTracker.notifyCollectionModified(this);

    return !existed;
  }

  delete(value: T): boolean {
    const valueStr = JSON.stringify(value);
    const existed = this.store.has(valueStr);
    this.store.delete(valueStr);

    // Log modification and notify tracker
    modificationLog.push({ type: 'UnorderedSet', id: this.id_, operation: 'delete' });
    nestedTracker.notifyCollectionModified(this);

    return existed;
  }

  has(value: T): boolean {
    const valueStr = JSON.stringify(value);
    return this.store.has(valueStr);
  }

  size(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();

    // Log modification and notify tracker
    modificationLog.push({ type: 'UnorderedSet', id: this.id_, operation: 'clear' });
    nestedTracker.notifyCollectionModified(this);
  }

  toArray(): T[] {
    return Array.from(this.store).map(v => JSON.parse(v));
  }

  toJSON(): Record<string, unknown> {
    return {
      __calimeroCollection: 'UnorderedSet',
      id: this.id_,
    };
  }
}

// Mock Vector class for testing
class MockVector<T> {
  private id_: string;
  private store: T[];

  constructor() {
    this.id_ = generateId();
    this.store = [];
    mockVectorStorage.set(this.id_, this.store as unknown[]);

    // Register with nested tracker
    nestedTracker.registerCollection(this);
  }

  id(): string {
    return this.id_;
  }

  push(value: T): void {
    // Register nested collections with index as key
    if (hasRegisteredCollection(value)) {
      nestedTracker.registerCollection(value, this, this.store.length);
    }

    this.store.push(value);

    // Log modification and notify tracker
    modificationLog.push({ type: 'Vector', id: this.id_, operation: 'push' });
    nestedTracker.notifyCollectionModified(this);
  }

  get(index: number): T | null {
    return this.store[index] ?? null;
  }

  pop(): T | null {
    const value = this.store.pop();

    // Log modification and notify tracker
    modificationLog.push({ type: 'Vector', id: this.id_, operation: 'pop' });
    nestedTracker.notifyCollectionModified(this);

    return value ?? null;
  }

  len(): number {
    return this.store.length;
  }

  toArray(): T[] {
    return [...this.store];
  }

  toJSON(): Record<string, unknown> {
    return {
      __calimeroCollection: 'Vector',
      id: this.id_,
    };
  }
}

// Register mock collection types
registerCollectionType('UnorderedMap', () => new MockUnorderedMap());
registerCollectionType('UnorderedSet', () => new MockUnorderedSet());
registerCollectionType('Vector', () => new MockVector());

describe('Nested Collection Change Propagation', () => {
  beforeEach(() => {
    clearTestState();
  });

  describe('Collection Registration', () => {
    it('should register a single collection', () => {
      const map = new MockUnorderedMap<string, string>();

      const snapshot = snapshotCollection(map);
      expect(snapshot).not.toBeNull();
      expect(snapshot?.type).toBe('UnorderedMap');
      expect(snapshot?.id).toBe(map.id());
    });

    it('should identify registered collections', () => {
      const map = new MockUnorderedMap<string, string>();
      const set = new MockUnorderedSet<string>();
      const vector = new MockVector<string>();

      expect(hasRegisteredCollection(map)).toBe(true);
      expect(hasRegisteredCollection(set)).toBe(true);
      expect(hasRegisteredCollection(vector)).toBe(true);
      expect(hasRegisteredCollection({ foo: 'bar' })).toBe(false);
      expect(hasRegisteredCollection(null)).toBe(false);
      expect(hasRegisteredCollection('string')).toBe(false);
    });
  });

  describe('Nested Map<K, Set<V>> Pattern', () => {
    it('should track nested set inside map', () => {
      const outerMap = new MockUnorderedMap<string, MockUnorderedSet<string>>();
      const innerSet = new MockUnorderedSet<string>();

      // Set nested collection
      outerMap.set('group1', innerSet);

      // Verify registration
      expect(outerMap.get('group1')).toBe(innerSet);

      // Modify nested set
      innerSet.add('member1');
      innerSet.add('member2');

      // Verify modifications were tracked
      const setModifications = modificationLog.filter(
        m => m.type === 'UnorderedSet' && m.id === innerSet.id()
      );
      expect(setModifications.length).toBe(2);
      expect(setModifications.every(m => m.operation === 'add')).toBe(true);
    });

    it('should handle multiple nested sets', () => {
      const outerMap = new MockUnorderedMap<string, MockUnorderedSet<string>>();
      const set1 = new MockUnorderedSet<string>();
      const set2 = new MockUnorderedSet<string>();

      outerMap.set('group1', set1);
      outerMap.set('group2', set2);

      // Modify both sets
      set1.add('alice');
      set2.add('bob');

      // Both should be tracked
      expect(modificationLog.filter(m => m.type === 'UnorderedSet').length).toBe(2);
    });

    it('should track set deletion operations', () => {
      const outerMap = new MockUnorderedMap<string, MockUnorderedSet<string>>();
      const innerSet = new MockUnorderedSet<string>();

      outerMap.set('group1', innerSet);

      innerSet.add('member1');
      innerSet.add('member2');
      innerSet.delete('member1');

      const deleteOps = modificationLog.filter(
        m => m.type === 'UnorderedSet' && m.operation === 'delete'
      );
      expect(deleteOps.length).toBe(1);
    });

    it('should track set clear operations', () => {
      const outerMap = new MockUnorderedMap<string, MockUnorderedSet<string>>();
      const innerSet = new MockUnorderedSet<string>();

      outerMap.set('group1', innerSet);

      innerSet.add('member1');
      innerSet.add('member2');
      innerSet.clear();

      const clearOps = modificationLog.filter(
        m => m.type === 'UnorderedSet' && m.operation === 'clear'
      );
      expect(clearOps.length).toBe(1);
      expect(innerSet.size()).toBe(0);
    });
  });

  describe('Nested Map<K, Vector<V>> Pattern', () => {
    it('should track nested vector inside map', () => {
      const outerMap = new MockUnorderedMap<string, MockVector<string>>();
      const innerVector = new MockVector<string>();

      outerMap.set('list1', innerVector);

      innerVector.push('item1');
      innerVector.push('item2');
      innerVector.push('item3');

      // Verify modifications
      const vectorMods = modificationLog.filter(
        m => m.type === 'Vector' && m.id === innerVector.id()
      );
      expect(vectorMods.length).toBe(3);
      expect(vectorMods.every(m => m.operation === 'push')).toBe(true);
    });

    it('should track vector pop operations', () => {
      const outerMap = new MockUnorderedMap<string, MockVector<string>>();
      const innerVector = new MockVector<string>();

      outerMap.set('list1', innerVector);

      innerVector.push('item1');
      innerVector.push('item2');
      const popped = innerVector.pop();

      expect(popped).toBe('item2');
      expect(innerVector.len()).toBe(1);

      const popOps = modificationLog.filter(m => m.type === 'Vector' && m.operation === 'pop');
      expect(popOps.length).toBe(1);
    });
  });

  describe('Nested Vector<Map<K, V>> Pattern', () => {
    it('should track nested map inside vector', () => {
      const outerVector = new MockVector<MockUnorderedMap<string, string>>();
      const innerMap = new MockUnorderedMap<string, string>();

      outerVector.push(innerMap);

      innerMap.set('key1', 'value1');
      innerMap.set('key2', 'value2');

      // Verify the map is stored in the vector
      expect(outerVector.get(0)).toBe(innerMap);

      // Verify map modifications were tracked
      const mapMods = modificationLog.filter(
        m => m.type === 'UnorderedMap' && m.id === innerMap.id()
      );
      expect(mapMods.length).toBe(2);
    });

    it('should handle multiple nested maps in vector', () => {
      const outerVector = new MockVector<MockUnorderedMap<string, number>>();
      const map1 = new MockUnorderedMap<string, number>();
      const map2 = new MockUnorderedMap<string, number>();

      outerVector.push(map1);
      outerVector.push(map2);

      map1.set('count', 1);
      map2.set('count', 2);

      expect(outerVector.len()).toBe(2);
      expect(outerVector.get(0)?.get('count')).toBe(1);
      expect(outerVector.get(1)?.get('count')).toBe(2);
    });
  });

  describe('Nested Set<Map<K, V>> Pattern', () => {
    it('should track nested map inside set', () => {
      const outerSet = new MockUnorderedSet<MockUnorderedMap<string, string>>();
      const innerMap = new MockUnorderedMap<string, string>();

      innerMap.set('id', 'map1');
      outerSet.add(innerMap);

      // The set contains the map (by JSON representation)
      expect(outerSet.size()).toBe(1);

      // Verify modifications
      const setMods = modificationLog.filter(m => m.type === 'UnorderedSet');
      expect(setMods.length).toBe(1);
    });
  });

  describe('Three-Level Nesting: Map<K, Map<K2, Set<V>>> Pattern', () => {
    it('should track deeply nested collections', () => {
      const level1Map = new MockUnorderedMap<
        string,
        MockUnorderedMap<string, MockUnorderedSet<string>>
      >();
      const level2Map = new MockUnorderedMap<string, MockUnorderedSet<string>>();
      const level3Set = new MockUnorderedSet<string>();

      // Build nested structure
      level1Map.set('outer', level2Map);
      level2Map.set('inner', level3Set);

      // Modify the deepest level
      level3Set.add('value1');
      level3Set.add('value2');

      // Verify structure
      expect(level1Map.get('outer')).toBe(level2Map);
      expect(level2Map.get('inner')).toBe(level3Set);
      expect(level3Set.toArray()).toEqual(['value1', 'value2']);

      // Verify all modifications were tracked
      const level3Mods = modificationLog.filter(
        m => m.type === 'UnorderedSet' && m.id === level3Set.id()
      );
      expect(level3Mods.length).toBe(2);
    });

    it('should handle modifications at multiple levels', () => {
      const level1Map = new MockUnorderedMap<
        string,
        MockUnorderedMap<string, MockUnorderedSet<string>>
      >();
      const level2Map = new MockUnorderedMap<string, MockUnorderedSet<string>>();
      const level3Set = new MockUnorderedSet<string>();

      level1Map.set('outer', level2Map);
      level2Map.set('inner', level3Set);
      level3Set.add('value1');

      // Add another set at level 2
      const anotherSet = new MockUnorderedSet<string>();
      level2Map.set('another', anotherSet);
      anotherSet.add('value2');

      // Verify both sets are tracked
      expect(level2Map.get('inner')).toBe(level3Set);
      expect(level2Map.get('another')).toBe(anotherSet);
    });
  });

  describe('Modification Detection', () => {
    it('should detect modifications through notifyCollectionModified', () => {
      const map = new MockUnorderedMap<string, string>();
      const initialLogLength = modificationLog.length;

      map.set('key1', 'value1');

      expect(modificationLog.length).toBe(initialLogLength + 1);
      expect(modificationLog[modificationLog.length - 1]).toEqual({
        type: 'UnorderedMap',
        id: map.id(),
        operation: 'set',
      });
    });

    it('should detect remove operations', () => {
      const map = new MockUnorderedMap<string, string>();
      map.set('key1', 'value1');

      const beforeRemove = modificationLog.length;
      map.remove('key1');

      expect(modificationLog.length).toBe(beforeRemove + 1);
      expect(modificationLog[modificationLog.length - 1].operation).toBe('remove');
    });

    it('should snapshot collections correctly for tracking', () => {
      const map = new MockUnorderedMap<string, string>();
      const set = new MockUnorderedSet<string>();
      const vector = new MockVector<string>();

      const mapSnapshot = snapshotCollection(map);
      const setSnapshot = snapshotCollection(set);
      const vectorSnapshot = snapshotCollection(vector);

      expect(mapSnapshot).toEqual({ type: 'UnorderedMap', id: map.id() });
      expect(setSnapshot).toEqual({ type: 'UnorderedSet', id: set.id() });
      expect(vectorSnapshot).toEqual({ type: 'Vector', id: vector.id() });
    });

    it('should return null snapshot for non-collections', () => {
      expect(snapshotCollection(null)).toBeNull();
      expect(snapshotCollection(undefined)).toBeNull();
      expect(snapshotCollection('string')).toBeNull();
      expect(snapshotCollection(123)).toBeNull();
      expect(snapshotCollection({ foo: 'bar' })).toBeNull();
    });
  });

  describe('State Persistence', () => {
    it('should persist nested map values', () => {
      const outerMap = new MockUnorderedMap<string, MockUnorderedSet<string>>();
      const innerSet = new MockUnorderedSet<string>();

      outerMap.set('group', innerSet);
      innerSet.add('alice');
      innerSet.add('bob');

      // Verify data persists in the mock storage
      const storedSet = mockSetStorage.get(innerSet.id());
      expect(storedSet).toBeDefined();
      expect(storedSet?.has(JSON.stringify('alice'))).toBe(true);
      expect(storedSet?.has(JSON.stringify('bob'))).toBe(true);
    });

    it('should persist vector contents', () => {
      const vector = new MockVector<string>();

      vector.push('item1');
      vector.push('item2');
      vector.push('item3');

      // Verify data persists
      const storedVector = mockVectorStorage.get(vector.id());
      expect(storedVector).toEqual(['item1', 'item2', 'item3']);
    });

    it('should persist nested vector contents', () => {
      const outerMap = new MockUnorderedMap<string, MockVector<number>>();
      const innerVector = new MockVector<number>();

      outerMap.set('numbers', innerVector);
      innerVector.push(1);
      innerVector.push(2);
      innerVector.push(3);

      // Verify structure and data
      expect(outerMap.get('numbers')?.toArray()).toEqual([1, 2, 3]);
    });

    it('should maintain data integrity across operations', () => {
      const map = new MockUnorderedMap<string, MockUnorderedSet<string>>();
      const set1 = new MockUnorderedSet<string>();
      const set2 = new MockUnorderedSet<string>();

      // Create initial structure
      map.set('set1', set1);
      map.set('set2', set2);

      set1.add('a');
      set1.add('b');
      set2.add('x');
      set2.add('y');

      // Modify
      set1.delete('a');
      set2.add('z');

      // Verify final state
      expect(set1.toArray()).toEqual(['b']);
      expect(set2.toArray().sort()).toEqual(['x', 'y', 'z']);
    });
  });

  describe('Collection Scanning', () => {
    it('should scan and register nested collections in objects', () => {
      const map = new MockUnorderedMap<string, string>();
      const set = new MockUnorderedSet<string>();
      const vector = new MockVector<string>();

      const container = {
        myMap: map,
        mySet: set,
        myVector: vector,
        plainValue: 'string',
        nested: {
          innerMap: new MockUnorderedMap<string, number>(),
        },
      };

      // Scan should identify all nested collections
      nestedTracker.scanForNestedCollections(container);

      // Verify all collections are identified
      expect(hasRegisteredCollection(container.myMap)).toBe(true);
      expect(hasRegisteredCollection(container.mySet)).toBe(true);
      expect(hasRegisteredCollection(container.myVector)).toBe(true);
      expect(hasRegisteredCollection(container.nested.innerMap)).toBe(true);
    });

    it('should scan arrays with collections', () => {
      const collections = [
        new MockUnorderedMap<string, string>(),
        new MockUnorderedSet<string>(),
        new MockVector<string>(),
      ];

      nestedTracker.scanForNestedCollections(collections);

      // All should be identified as collections
      expect(collections.every(hasRegisteredCollection)).toBe(true);
    });

    it('should handle null and undefined gracefully', () => {
      // Should not throw
      expect(() => {
        nestedTracker.scanForNestedCollections(null);
        nestedTracker.scanForNestedCollections(undefined);
      }).not.toThrow();
    });

    it('should handle primitive values gracefully', () => {
      // Should not throw
      expect(() => {
        nestedTracker.scanForNestedCollections('string');
        nestedTracker.scanForNestedCollections(123);
        nestedTracker.scanForNestedCollections(true);
      }).not.toThrow();
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle replacing nested collection', () => {
      const outerMap = new MockUnorderedMap<string, MockUnorderedSet<string>>();
      const set1 = new MockUnorderedSet<string>();
      const set2 = new MockUnorderedSet<string>();

      // Set initial
      outerMap.set('group', set1);
      set1.add('member1');

      // Replace with new set
      outerMap.set('group', set2);
      set2.add('member2');

      // Verify replacement
      expect(outerMap.get('group')).toBe(set2);
      expect(set2.toArray()).toEqual(['member2']);
    });

    it('should handle removing parent with nested collections', () => {
      const outerMap = new MockUnorderedMap<string, MockUnorderedSet<string>>();
      const innerSet = new MockUnorderedSet<string>();

      outerMap.set('group', innerSet);
      innerSet.add('member1');

      // Remove from parent
      outerMap.remove('group');

      // Verify removal
      expect(outerMap.get('group')).toBeNull();
      expect(outerMap.has('group')).toBe(false);
    });

    it('should handle mixed collection types', () => {
      // Map containing both sets and vectors
      const map = new MockUnorderedMap<string, MockUnorderedSet<string> | MockVector<string>>();
      const set = new MockUnorderedSet<string>();
      const vector = new MockVector<string>();

      map.set('members', set);
      map.set('history', vector);

      set.add('alice');
      vector.push('event1');
      vector.push('event2');

      // Verify types are preserved
      const membersCollection = map.get('members');
      const historyCollection = map.get('history');

      expect(membersCollection).toBe(set);
      expect(historyCollection).toBe(vector);
    });

    it('should handle concurrent modifications to sibling collections', () => {
      const parent = new MockUnorderedMap<string, MockUnorderedSet<string>>();
      const child1 = new MockUnorderedSet<string>();
      const child2 = new MockUnorderedSet<string>();

      parent.set('child1', child1);
      parent.set('child2', child2);

      // Modify both children
      child1.add('a');
      child2.add('x');
      child1.add('b');
      child2.add('y');

      // Both should have their data
      expect(child1.toArray().sort()).toEqual(['a', 'b']);
      expect(child2.toArray().sort()).toEqual(['x', 'y']);
    });
  });
});
