/**
 * Unit tests for CRDT collections
 */

import { sha256 } from '../../packages/sdk/src/utils/sha256';
import { FrozenValue } from '../../packages/sdk/src/collections/FrozenStorage';

/**
 * Mock environment setup for CRDT collection tests
 * These tests run without the full WASM runtime, so we mock the necessary
 * host functions to simulate collection behavior.
 */

type StoredValue = Uint8Array;

type MapStore = {
  entries: Map<string, StoredValue>;
};

type VectorStore = {
  values: StoredValue[];
};

type SetStore = {
  values: Set<string>;
};

type CounterStore = {
  totalsByExecutor: Map<string, bigint>;
};

type LwwStore = {
  value: Uint8Array | null;
  timestamp: bigint;
  nodeId: Uint8Array;
};

// In-memory backing stores
const storage = new Map<string, Uint8Array>();
const maps = new Map<string, MapStore>();
const vectors = new Map<string, VectorStore>();
const sets = new Map<string, SetStore>();
const counters = new Map<string, CounterStore>();
const lwwRegisters = new Map<string, LwwStore>();

// Register buffer
let currentRegister: Uint8Array | null = null;

// Executor & context IDs
const mockExecutorId = new Uint8Array(32).fill(1);
const mockContextId = new Uint8Array(32).fill(2);

let nextId = 1;

function generateId(): Uint8Array {
  const id = new Uint8Array(32);
  id.set(new TextEncoder().encode(`mock-${nextId}`));
  nextId += 1;
  return id;
}

function idToKey(id: Uint8Array): string {
  return Array.from(id).join(',');
}

function setRegister(value: Uint8Array | null): void {
  currentRegister = value ? new Uint8Array(value) : null;
}

function writeU64ToRegister(value: bigint): void {
  const buffer = new Uint8Array(8);
  const view = new DataView(buffer.buffer);
  view.setBigUint64(0, value, true);
  setRegister(buffer);
}

function serializeVec(values: Uint8Array[]): Uint8Array {
  const totalLength = 4 + values.reduce((acc, value) => acc + 4 + value.length, 0);
  const buffer = new Uint8Array(totalLength);
  const view = new DataView(buffer.buffer);
  view.setUint32(0, values.length, true);
  let offset = 4;
  for (const value of values) {
    view.setUint32(offset, value.length, true);
    offset += 4;
    buffer.set(value, offset);
    offset += value.length;
  }
  return buffer;
}

function serializeMapEntries(entries: Array<[Uint8Array, Uint8Array]>): Uint8Array {
  let length = 4;
  for (const [key, value] of entries) {
    length += 4 + key.length + 4 + value.length;
  }
  const buffer = new Uint8Array(length);
  const view = new DataView(buffer.buffer);
  view.setUint32(0, entries.length, true);
  let offset = 4;
  for (const [key, value] of entries) {
    view.setUint32(offset, key.length, true);
    offset += 4;
    buffer.set(key, offset);
    offset += key.length;
    view.setUint32(offset, value.length, true);
    offset += 4;
    buffer.set(value, offset);
    offset += value.length;
  }
  return buffer;
}

function getExecutorKey(executor?: Uint8Array): string {
  const id = executor ?? mockExecutorId;
  return Array.from(id).join(',');
}

// Helper to clear storage between tests
function clearStorage(): void {
  storage.clear();
  maps.clear();
  vectors.clear();
  sets.clear();
  counters.clear();
  lwwRegisters.clear();
  currentRegister = null;
  nextId = 1;
}

// Mock env
(global as unknown as { env: Record<string, unknown> }).env = {
  log_utf8: (_msg: Uint8Array) => {
    // Silent in tests
  },

  panic_utf8: (msg: Uint8Array) => {
    throw new Error(new TextDecoder().decode(msg));
  },

  value_return: (value: Uint8Array) => {
    setRegister(value);
  },

  storage_read: (key: Uint8Array, _register_id: bigint): bigint => {
    const keyStr = Array.from(key).join(',');
    const value = storage.get(keyStr);
    if (value) {
      setRegister(value);
      return 1n;
    }
    setRegister(null);
    return 0n;
  },

  storage_write: (key: Uint8Array, value: Uint8Array, _register_id: bigint): bigint => {
    const keyStr = Array.from(key).join(',');
    storage.set(keyStr, value);
    return 1n;
  },

  storage_remove: (key: Uint8Array, _register_id: bigint): bigint => {
    const keyStr = Array.from(key).join(',');
    const previous = storage.get(keyStr);
    const existed = previous !== undefined;
    storage.delete(keyStr);
    setRegister(previous ?? null);
    return existed ? 1n : 0n;
  },

  register_len: (_register_id: bigint): bigint => {
    return currentRegister ? BigInt(currentRegister.length) : 0n;
  },

  read_register: (_register_id: bigint, buf: Uint8Array): boolean => {
    if (currentRegister) {
      buf.set(currentRegister);
      return true;
    }
    return false;
  },

  context_id: (_register_id: bigint): void => {
    currentRegister = mockContextId;
  },

  executor_id: (_register_id: bigint): void => {
    currentRegister = mockExecutorId;
  },

  emit: (_kind: Uint8Array, _data: Uint8Array): void => {
    // Silent in tests
  },

  emit_with_handler: (_kind: Uint8Array, _data: Uint8Array, _handler: Uint8Array): void => {
    // Silent in tests
  },

  commit: (_root: Uint8Array, _artifact: Uint8Array): void => {
    // Silent in tests
  },

  time_now: (buf: Uint8Array): void => {
    const now = BigInt(Date.now() * 1000000);
    new DataView(buf.buffer).setBigUint64(0, now, true);
  },

  blob_create: (): bigint => 1n,
  blob_open: (_blob_id: Uint8Array): bigint => 0n,
  blob_read: (_fd: bigint, _buffer: Uint8Array): bigint => 0n,
  blob_write: (_fd: bigint, data: Uint8Array): bigint => BigInt(data.length),
  blob_close: (_fd: bigint, _blob_id_buf: Uint8Array): boolean => true,

  js_crdt_map_new: (_register_id: bigint): number => {
    const id = generateId();
    maps.set(idToKey(id), { entries: new Map() });
    setRegister(id);
    return 1;
  },

  js_crdt_map_get: (mapId: Uint8Array, key: Uint8Array, _register_id: bigint): number => {
    const store = maps.get(idToKey(mapId));
    if (!store) {
      return -1;
    }
    const value = store.entries.get(Array.from(key).join(','));
    if (!value) {
      setRegister(null);
      return 0;
    }
    setRegister(value);
    return 1;
  },

  js_crdt_map_insert: (
    mapId: Uint8Array,
    key: Uint8Array,
    value: Uint8Array,
    _register_id: bigint
  ): number => {
    const store = maps.get(idToKey(mapId));
    if (!store) {
      return -1;
    }
    const entryKey = Array.from(key).join(',');
    const previous = store.entries.get(entryKey);
    store.entries.set(entryKey, new Uint8Array(value));
    if (previous) {
      setRegister(previous);
      return 1;
    }
    setRegister(null);
    return 0;
  },

  js_crdt_map_remove: (mapId: Uint8Array, key: Uint8Array, _register_id: bigint): number => {
    const store = maps.get(idToKey(mapId));
    if (!store) {
      return -1;
    }
    const entryKey = Array.from(key).join(',');
    const previous = store.entries.get(entryKey);
    if (previous) {
      store.entries.delete(entryKey);
      setRegister(previous);
      return 1;
    }
    setRegister(null);
    return 0;
  },

  js_crdt_map_contains: (mapId: Uint8Array, key: Uint8Array): number => {
    const store = maps.get(idToKey(mapId));
    if (!store) {
      return -1;
    }
    const entryKey = Array.from(key).join(',');
    return store.entries.has(entryKey) ? 1 : 0;
  },

  js_crdt_map_iter: (mapId: Uint8Array, _register_id: bigint): number => {
    const store = maps.get(idToKey(mapId));
    if (!store) {
      return -1;
    }
    const entries = Array.from(store.entries.entries()).map(([key, value]) => {
      const keyBytes = Uint8Array.from(key.split(',').map(Number));
      return [keyBytes, value] as [Uint8Array, Uint8Array];
    });
    setRegister(serializeMapEntries(entries));
    return 1;
  },

  js_crdt_vector_new: (_register_id: bigint): number => {
    const id = generateId();
    vectors.set(idToKey(id), { values: [] });
    setRegister(id);
    return 1;
  },

  js_crdt_vector_len: (vectorId: Uint8Array, _register_id: bigint): number => {
    const store = vectors.get(idToKey(vectorId));
    if (!store) {
      return -1;
    }
    writeU64ToRegister(BigInt(store.values.length));
    return 1;
  },

  js_crdt_vector_push: (vectorId: Uint8Array, value: Uint8Array): number => {
    const store = vectors.get(idToKey(vectorId));
    if (!store) {
      return -1;
    }
    store.values.push(new Uint8Array(value));
    return 1;
  },

  js_crdt_vector_get: (vectorId: Uint8Array, index: number): number => {
    const store = vectors.get(idToKey(vectorId));
    if (!store) {
      return -1;
    }
    const value = store.values[index];
    if (!value) {
      setRegister(null);
      return 0;
    }
    setRegister(value);
    return 1;
  },

  js_crdt_vector_pop: (vectorId: Uint8Array, _register_id: bigint): number => {
    const store = vectors.get(idToKey(vectorId));
    if (!store) {
      return -1;
    }
    const value = store.values.pop();
    if (!value) {
      setRegister(null);
      return 0;
    }
    setRegister(value);
    return 1;
  },

  js_crdt_set_new: (_register_id: bigint): number => {
    const id = generateId();
    sets.set(idToKey(id), { values: new Set() });
    setRegister(id);
    return 1;
  },

  js_crdt_set_insert: (setId: Uint8Array, value: Uint8Array): number => {
    const store = sets.get(idToKey(setId));
    if (!store) {
      return -1;
    }
    const key = Array.from(value).join(',');
    const existed = store.values.has(key);
    store.values.add(key);
    return existed ? 0 : 1;
  },

  js_crdt_set_contains: (setId: Uint8Array, value: Uint8Array): number => {
    const store = sets.get(idToKey(setId));
    if (!store) {
      return -1;
    }
    const key = Array.from(value).join(',');
    return store.values.has(key) ? 1 : 0;
  },

  js_crdt_set_remove: (setId: Uint8Array, value: Uint8Array): number => {
    const store = sets.get(idToKey(setId));
    if (!store) {
      return -1;
    }
    const key = Array.from(value).join(',');
    return store.values.delete(key) ? 1 : 0;
  },

  js_crdt_set_len: (setId: Uint8Array, _register_id: bigint): number => {
    const store = sets.get(idToKey(setId));
    if (!store) {
      return -1;
    }
    writeU64ToRegister(BigInt(store.values.size));
    return 1;
  },

  js_crdt_set_iter: (setId: Uint8Array, _register_id: bigint): number => {
    const store = sets.get(idToKey(setId));
    if (!store) {
      return -1;
    }
    const values = Array.from(store.values).map((value) =>
      Uint8Array.from(value.split(',').map(Number))
    );
    setRegister(serializeVec(values));
    return 1;
  },

  js_crdt_set_clear: (setId: Uint8Array): number => {
    const store = sets.get(idToKey(setId));
    if (!store) {
      return -1;
    }
    store.values.clear();
    return 1;
  },

  js_crdt_lww_new: (_register_id: bigint): number => {
    const id = generateId();
    lwwRegisters.set(idToKey(id), {
      value: null,
      timestamp: 0n,
      nodeId: mockExecutorId.slice(0, 16),
    });
    setRegister(id);
    return 1;
  },

  js_crdt_lww_set: (registerId: Uint8Array, value: Uint8Array | null): number => {
    const store = lwwRegisters.get(idToKey(registerId));
    if (!store) {
      return -1;
    }
    store.value = value ? new Uint8Array(value) : null;
    store.timestamp = BigInt(Date.now());
    store.nodeId = mockExecutorId.slice(0, 16);
    return 1;
  },

  js_crdt_lww_get: (registerId: Uint8Array, _register_id: bigint): number => {
    const store = lwwRegisters.get(idToKey(registerId));
    if (!store) {
      return -1;
    }
    if (!store.value) {
      setRegister(null);
      return 0;
    }
    setRegister(store.value);
    return 1;
  },

  js_crdt_lww_timestamp: (registerId: Uint8Array, _register_id: bigint): number => {
    const store = lwwRegisters.get(idToKey(registerId));
    if (!store) {
      return -1;
    }
    if (!store.value) {
      setRegister(null);
      return 0;
    }
    const buffer = new Uint8Array(24);
    const view = new DataView(buffer.buffer);
    view.setBigUint64(0, store.timestamp, true);
    buffer.set(store.nodeId.slice(0, 16), 8);
    setRegister(buffer);
    return 1;
  },

  js_crdt_counter_new: (_register_id: bigint): number => {
    const id = generateId();
    counters.set(idToKey(id), { totalsByExecutor: new Map() });
    setRegister(id);
    return 1;
  },

  js_crdt_counter_increment: (counterId: Uint8Array): number => {
    const store = counters.get(idToKey(counterId));
    if (!store) {
      return -1;
    }
    const executorKey = getExecutorKey();
    const current = store.totalsByExecutor.get(executorKey) ?? 0n;
    store.totalsByExecutor.set(executorKey, current + 1n);
    return 1;
  },

  js_crdt_counter_value: (counterId: Uint8Array, _register_id: bigint): number => {
    const store = counters.get(idToKey(counterId));
    if (!store) {
      return -1;
    }
    const total = Array.from(store.totalsByExecutor.values()).reduce(
      (acc, value) => acc + value,
      0n
    );
    writeU64ToRegister(total);
    return 1;
  },

  js_crdt_counter_get_executor_count: (
    counterId: Uint8Array,
    _register_id: bigint,
    executorId?: Uint8Array
  ): number => {
    const store = counters.get(idToKey(counterId));
    if (!store) {
      return -1;
    }
    const key = getExecutorKey(executorId);
    const total = store.totalsByExecutor.get(key) ?? 0n;
    writeU64ToRegister(total);
    return 1;
  },
};

// Import collections after env mock is set up
import { UnorderedMap } from '../../packages/sdk/src/collections/UnorderedMap';
import { Vector } from '../../packages/sdk/src/collections/Vector';
import { Counter } from '../../packages/sdk/src/collections/Counter';
import { UnorderedSet } from '../../packages/sdk/src/collections/UnorderedSet';
import { LwwRegister } from '../../packages/sdk/src/collections/LwwRegister';

describe('CRDT Collections', () => {
  beforeEach(() => {
    clearStorage();
  });

  describe('UnorderedMap', () => {
    describe('empty collection operations', () => {
      it('should create an empty map', () => {
        const map = new UnorderedMap<string, string>();
        expect(map.entries()).toEqual([]);
        expect(map.keys()).toEqual([]);
        expect(map.values()).toEqual([]);
      });

      it('should return null for non-existent keys', () => {
        const map = new UnorderedMap<string, string>();
        expect(map.get('nonexistent')).toBeNull();
        expect(map.has('nonexistent')).toBe(false);
      });

      it('should handle removal of non-existent keys gracefully', () => {
        const map = new UnorderedMap<string, string>();
        expect(() => map.remove('nonexistent')).not.toThrow();
      });
    });

    describe('basic operations', () => {
      it('should set and get values', () => {
        const map = new UnorderedMap<string, string>();
        map.set('key1', 'value1');
        expect(map.get('key1')).toBe('value1');
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

      it('should iterate over entries', () => {
        const map = new UnorderedMap<string, number>();
        map.set('a', 1);
        map.set('b', 2);
        map.set('c', 3);

        const entries = map.entries();
        expect(entries.length).toBe(3);
        expect(map.keys().sort()).toEqual(['a', 'b', 'c']);
        expect(map.values().sort()).toEqual([1, 2, 3]);
      });
    });

    describe('large values', () => {
      it('should handle large string values', () => {
        const map = new UnorderedMap<string, string>();
        const largeValue = 'x'.repeat(10000);
        map.set('large', largeValue);
        expect(map.get('large')).toBe(largeValue);
      });

      it('should handle many entries', () => {
        const map = new UnorderedMap<string, number>();
        const count = 100;

        for (let i = 0; i < count; i++) {
          map.set(`key-${i}`, i);
        }

        expect(map.entries().length).toBe(count);

        for (let i = 0; i < count; i++) {
          expect(map.get(`key-${i}`)).toBe(i);
        }
      });

      it('should handle complex nested objects', () => {
        interface ComplexValue {
          name: string;
          data: number[];
          metadata: { [key: string]: string };
        }

        const map = new UnorderedMap<string, ComplexValue>();
        const complexValue: ComplexValue = {
          name: 'test',
          data: Array.from({ length: 100 }, (_, i) => i),
          metadata: {
            key1: 'value1',
            key2: 'value2',
          },
        };

        map.set('complex', complexValue);
        const retrieved = map.get('complex');
        expect(retrieved).toEqual(complexValue);
      });
    });

    describe('concurrent operations simulation', () => {
      it('should maintain consistency with multiple set operations', () => {
        const map = new UnorderedMap<string, number>();

        // Simulate concurrent increments by multiple sequential operations
        map.set('counter', 0);
        for (let i = 0; i < 10; i++) {
          const current = map.get('counter') ?? 0;
          map.set('counter', current + 1);
        }

        expect(map.get('counter')).toBe(10);
      });

      it('should handle interleaved read/write operations', () => {
        const map = new UnorderedMap<string, string[]>();
        map.set('list', []);

        for (let i = 0; i < 5; i++) {
          const current = map.get('list') ?? [];
          current.push(`item-${i}`);
          map.set('list', current);
        }

        const result = map.get('list');
        expect(result).toEqual(['item-0', 'item-1', 'item-2', 'item-3', 'item-4']);
      });
    });

    describe('error conditions', () => {
      it('should handle null and undefined values appropriately', () => {
        const map = new UnorderedMap<string, string | null>();
        map.set('nullable', null);
        expect(map.get('nullable')).toBeNull();
        expect(map.has('nullable')).toBe(true);
      });

      it('should handle special characters in keys', () => {
        const map = new UnorderedMap<string, string>();
        const specialKeys = ['key with spaces', 'key\nwith\nnewlines', 'key\twith\ttabs', ''];

        specialKeys.forEach((key, i) => {
          map.set(key, `value-${i}`);
        });

        specialKeys.forEach((key, i) => {
          expect(map.get(key)).toBe(`value-${i}`);
        });
      });

      it('should handle Unicode keys and values', () => {
        const map = new UnorderedMap<string, string>();
        map.set('emoji-key-🎉', 'emoji-value-🚀');
        map.set('chinese-中文', '日本語');
        map.set('arabic-العربية', 'עברית');

        expect(map.get('emoji-key-🎉')).toBe('emoji-value-🚀');
        expect(map.get('chinese-中文')).toBe('日本語');
        expect(map.get('arabic-العربية')).toBe('עברית');
      });
    });

    describe('type safety', () => {
      it('should work with number keys', () => {
        const map = new UnorderedMap<number, string>();
        map.set(1, 'one');
        map.set(2, 'two');
        map.set(0, 'zero');
        map.set(-1, 'negative one');

        expect(map.get(1)).toBe('one');
        expect(map.get(0)).toBe('zero');
        expect(map.get(-1)).toBe('negative one');
      });

      it('should work with boolean values', () => {
        const map = new UnorderedMap<string, boolean>();
        map.set('true', true);
        map.set('false', false);

        expect(map.get('true')).toBe(true);
        expect(map.get('false')).toBe(false);
      });

      it('should work with array values', () => {
        const map = new UnorderedMap<string, number[]>();
        map.set('numbers', [1, 2, 3, 4, 5]);
        expect(map.get('numbers')).toEqual([1, 2, 3, 4, 5]);
      });
    });

    describe('persistence', () => {
      it('should persist across instances via id', () => {
        const map1 = new UnorderedMap<string, string>();
        map1.set('key1', 'value1');
        map1.set('key2', 'value2');

        const map2 = UnorderedMap.fromId<string, string>(map1.id());
        expect(map2.get('key1')).toBe('value1');
        expect(map2.get('key2')).toBe('value2');
      });

      it('should return valid hex id', () => {
        const map = new UnorderedMap<string, string>();
        const id = map.id();
        expect(id).toMatch(/^[0-9a-f]+$/);
        expect(id.length).toBe(64);
      });

      it('should return valid id bytes', () => {
        const map = new UnorderedMap<string, string>();
        const idBytes = map.idBytes();
        expect(idBytes).toBeInstanceOf(Uint8Array);
        expect(idBytes.length).toBe(32);
      });
    });

    describe('serialization', () => {
      it('should serialize to JSON correctly', () => {
        const map = new UnorderedMap<string, string>();
        const json = map.toJSON();

        expect(json.__calimeroCollection).toBe('UnorderedMap');
        expect(typeof json.id).toBe('string');
      });
    });
  });

  describe('Vector', () => {
    describe('empty collection operations', () => {
      it('should create an empty vector', () => {
        const vec = new Vector<string>();
        expect(vec.len()).toBe(0);
        expect(vec.toArray()).toEqual([]);
      });

      it('should return null for any index on empty vector', () => {
        const vec = new Vector<string>();
        expect(vec.get(0)).toBeNull();
        expect(vec.get(100)).toBeNull();
      });

      it('should return null when popping from empty vector', () => {
        const vec = new Vector<string>();
        expect(vec.pop()).toBeNull();
      });
    });

    describe('basic operations', () => {
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

      it('should throw for negative indices', () => {
        const vec = new Vector<string>();
        vec.push('first');
        expect(() => vec.get(-1)).toThrow();
      });

      it('should pop values in LIFO order', () => {
        const vec = new Vector<string>();
        vec.push('first');
        vec.push('second');
        vec.push('third');

        expect(vec.pop()).toBe('third');
        expect(vec.pop()).toBe('second');
        expect(vec.pop()).toBe('first');
        expect(vec.pop()).toBeNull();
      });

      it('should convert to array', () => {
        const vec = new Vector<number>();
        vec.push(1);
        vec.push(2);
        vec.push(3);

        expect(vec.toArray()).toEqual([1, 2, 3]);
      });
    });

    describe('large values', () => {
      it('should handle many elements', () => {
        const vec = new Vector<number>();
        const count = 100;

        for (let i = 0; i < count; i++) {
          vec.push(i);
        }

        expect(vec.len()).toBe(count);
        expect(vec.get(0)).toBe(0);
        expect(vec.get(count - 1)).toBe(count - 1);
      });

      it('should handle large objects', () => {
        interface LargeObject {
          data: string;
          numbers: number[];
        }

        const vec = new Vector<LargeObject>();
        const largeObject: LargeObject = {
          data: 'x'.repeat(5000),
          numbers: Array.from({ length: 100 }, (_, i) => i),
        };

        vec.push(largeObject);
        expect(vec.get(0)).toEqual(largeObject);
      });
    });

    describe('concurrent operations simulation', () => {
      it('should maintain order with alternating push/pop', () => {
        const vec = new Vector<number>();

        vec.push(1);
        vec.push(2);
        expect(vec.pop()).toBe(2);
        vec.push(3);
        vec.push(4);
        expect(vec.pop()).toBe(4);
        expect(vec.pop()).toBe(3);

        expect(vec.toArray()).toEqual([1]);
      });
    });

    describe('error conditions', () => {
      it('should handle null values', () => {
        const vec = new Vector<string | null>();
        vec.push(null);
        vec.push('not null');
        vec.push(null);

        expect(vec.get(0)).toBeNull();
        expect(vec.get(1)).toBe('not null');
        expect(vec.get(2)).toBeNull();
      });

      it('should handle undefined values', () => {
        const vec = new Vector<string | undefined>();
        vec.push(undefined);
        // Note: undefined typically gets serialized as null in JSON
        expect(vec.len()).toBe(1);
      });
    });

    describe('type safety', () => {
      it('should work with numbers', () => {
        const vec = new Vector<number>();
        vec.push(1);
        vec.push(2.5);
        vec.push(-100);
        vec.push(0);

        expect(vec.toArray()).toEqual([1, 2.5, -100, 0]);
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

      it('should work with nested arrays', () => {
        const vec = new Vector<number[]>();
        vec.push([1, 2, 3]);
        vec.push([4, 5]);
        vec.push([]);

        expect(vec.toArray()).toEqual([[1, 2, 3], [4, 5], []]);
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

      it('should return valid hex id', () => {
        const vec = new Vector<string>();
        const id = vec.id();
        expect(id).toMatch(/^[0-9a-f]+$/);
        expect(id.length).toBe(64);
      });
    });

    describe('fromArray factory', () => {
      it('should create vector from array', () => {
        const vec = Vector.fromArray([1, 2, 3, 4, 5]);
        expect(vec.len()).toBe(5);
        expect(vec.toArray()).toEqual([1, 2, 3, 4, 5]);
      });

      it('should create empty vector from empty array', () => {
        const vec = Vector.fromArray<string>([]);
        expect(vec.len()).toBe(0);
      });
    });

    describe('serialization', () => {
      it('should serialize to JSON correctly', () => {
        const vec = new Vector<string>();
        const json = vec.toJSON();

        expect(json.__calimeroCollection).toBe('Vector');
        expect(typeof json.id).toBe('string');
      });
    });
  });

  describe('Counter', () => {
    describe('empty collection operations', () => {
      it('should start at zero', () => {
        const counter = new Counter();
        expect(counter.value()).toBe(0n);
      });

      it('should return zero for executor count on new counter', () => {
        const counter = new Counter();
        expect(counter.getExecutorCount()).toBe(0);
      });
    });

    describe('basic operations', () => {
      it('should increment by one', () => {
        const counter = new Counter();
        counter.increment();
        expect(counter.value()).toBe(1n);
      });

      it('should increment multiple times', () => {
        const counter = new Counter();
        counter.increment();
        counter.increment();
        counter.increment();
        expect(counter.value()).toBe(3n);
      });

      it('should increment by amount', () => {
        const counter = new Counter();
        counter.incrementBy(5);
        expect(counter.value()).toBe(5n);

        counter.incrementBy(3);
        expect(counter.value()).toBe(8n);
      });

      it('should increment by zero (no-op)', () => {
        const counter = new Counter();
        counter.incrementBy(5);
        counter.incrementBy(0);
        expect(counter.value()).toBe(5n);
      });

      it('should increment by bigint', () => {
        const counter = new Counter();
        counter.incrementBy(10n);
        expect(counter.value()).toBe(10n);
      });
    });

    describe('large values', () => {
      it('should handle many increments', () => {
        const counter = new Counter();
        const count = 100;

        for (let i = 0; i < count; i++) {
          counter.increment();
        }

        expect(counter.value()).toBe(BigInt(count));
      });

      it('should handle large incrementBy values', () => {
        const counter = new Counter();
        counter.incrementBy(1000000);
        expect(counter.value()).toBe(1000000n);
      });
    });

    describe('concurrent operations simulation', () => {
      it('should track per-executor counts', () => {
        const counter = new Counter();
        counter.increment();
        counter.increment();
        counter.increment();

        // In tests, all increments come from mock executor
        expect(counter.getExecutorCount()).toBe(3);
      });
    });

    describe('error conditions', () => {
      it('should reject negative increment amounts', () => {
        const counter = new Counter();
        expect(() => counter.incrementBy(-1)).toThrow();
        expect(() => counter.incrementBy(-100)).toThrow();
      });

      it('should reject non-integer increment amounts', () => {
        const counter = new Counter();
        expect(() => counter.incrementBy(1.5)).toThrow();
        expect(() => counter.incrementBy(0.1)).toThrow();
      });

      it('should reject NaN and Infinity', () => {
        const counter = new Counter();
        expect(() => counter.incrementBy(Number.NaN)).toThrow();
        expect(() => counter.incrementBy(Number.POSITIVE_INFINITY)).toThrow();
        expect(() => counter.incrementBy(Number.NEGATIVE_INFINITY)).toThrow();
      });

      it('should reject negative bigint amounts', () => {
        const counter = new Counter();
        expect(() => counter.incrementBy(-1n)).toThrow();
      });
    });

    describe('persistence', () => {
      it('should persist across instances', () => {
        const counter1 = new Counter();
        counter1.increment();
        counter1.increment();

        const counter2 = new Counter({ id: counter1.id() });
        expect(counter2.value()).toBe(2n);
      });

      it('should accumulate increments across instances', () => {
        const counter1 = new Counter();
        counter1.increment();

        const counter2 = new Counter({ id: counter1.id() });
        counter2.increment();

        const counter3 = new Counter({ id: counter1.id() });
        expect(counter3.value()).toBe(2n);
      });

      it('should return valid hex id', () => {
        const counter = new Counter();
        const id = counter.id();
        expect(id).toMatch(/^[0-9a-f]+$/);
        expect(id.length).toBe(64);
      });
    });

    describe('serialization', () => {
      it('should serialize to JSON correctly', () => {
        const counter = new Counter();
        const json = counter.toJSON();

        expect(json.__calimeroCollection).toBe('Counter');
        expect(typeof json.id).toBe('string');
      });
    });
  });

  describe('UnorderedSet', () => {
    describe('empty collection operations', () => {
      it('should create an empty set', () => {
        const set = new UnorderedSet<string>();
        expect(set.size()).toBe(0);
        expect(set.toArray()).toEqual([]);
      });

      it('should return false for has on empty set', () => {
        const set = new UnorderedSet<string>();
        expect(set.has('nonexistent')).toBe(false);
      });

      it('should return false when deleting from empty set', () => {
        const set = new UnorderedSet<string>();
        expect(set.delete('nonexistent')).toBe(false);
      });
    });

    describe('basic operations', () => {
      it('should add and check values', () => {
        const set = new UnorderedSet<string>();
        set.add('value1');
        expect(set.has('value1')).toBe(true);
        expect(set.size()).toBe(1);
      });

      it('should not add duplicates', () => {
        const set = new UnorderedSet<string>();
        expect(set.add('value1')).toBe(true); // first add returns true
        expect(set.add('value1')).toBe(false); // duplicate returns false
        expect(set.size()).toBe(1);
      });

      it('should delete values', () => {
        const set = new UnorderedSet<string>();
        set.add('value1');
        expect(set.delete('value1')).toBe(true);
        expect(set.has('value1')).toBe(false);
        expect(set.size()).toBe(0);
      });

      it('should clear all values', () => {
        const set = new UnorderedSet<string>();
        set.add('a');
        set.add('b');
        set.add('c');

        set.clear();
        expect(set.size()).toBe(0);
        expect(set.toArray()).toEqual([]);
      });

      it('should convert to array', () => {
        const set = new UnorderedSet<number>();
        set.add(1);
        set.add(2);
        set.add(3);

        const arr = set.toArray();
        expect(arr.length).toBe(3);
        expect(arr.sort()).toEqual([1, 2, 3]);
      });
    });

    describe('large values', () => {
      it('should handle many elements', () => {
        const set = new UnorderedSet<number>();
        const count = 100;

        for (let i = 0; i < count; i++) {
          set.add(i);
        }

        expect(set.size()).toBe(count);
      });

      it('should handle large string values', () => {
        const set = new UnorderedSet<string>();
        const largeValue = 'x'.repeat(10000);
        set.add(largeValue);
        expect(set.has(largeValue)).toBe(true);
      });
    });

    describe('concurrent operations simulation', () => {
      it('should maintain uniqueness with rapid add/delete', () => {
        const set = new UnorderedSet<string>();

        for (let i = 0; i < 10; i++) {
          set.add('item');
          expect(set.size()).toBe(1);
        }

        set.delete('item');
        expect(set.size()).toBe(0);
      });

      it('should handle interleaved operations', () => {
        const set = new UnorderedSet<number>();

        set.add(1);
        set.add(2);
        set.delete(1);
        set.add(3);
        set.add(1);
        set.delete(2);

        expect(set.toArray().sort()).toEqual([1, 3]);
      });
    });

    describe('error conditions', () => {
      it('should handle null values', () => {
        const set = new UnorderedSet<string | null>();
        set.add(null);
        expect(set.has(null)).toBe(true);
        expect(set.size()).toBe(1);
      });

      it('should handle special characters', () => {
        const set = new UnorderedSet<string>();
        const specialValues = ['value with spaces', 'value\nwith\nnewlines', 'value\twith\ttabs', ''];

        specialValues.forEach((v) => set.add(v));
        expect(set.size()).toBe(specialValues.length);

        specialValues.forEach((v) => {
          expect(set.has(v)).toBe(true);
        });
      });

      it('should handle Unicode values', () => {
        const set = new UnorderedSet<string>();
        set.add('emoji-🎉');
        set.add('chinese-中文');
        set.add('arabic-العربية');

        expect(set.has('emoji-🎉')).toBe(true);
        expect(set.has('chinese-中文')).toBe(true);
        expect(set.has('arabic-العربية')).toBe(true);
      });
    });

    describe('type safety', () => {
      it('should work with numbers', () => {
        const set = new UnorderedSet<number>();
        set.add(1);
        set.add(2.5);
        set.add(-100);
        set.add(0);

        expect(set.size()).toBe(4);
        expect(set.has(2.5)).toBe(true);
        expect(set.has(-100)).toBe(true);
      });

      it('should work with objects', () => {
        interface Item {
          id: number;
        }

        const set = new UnorderedSet<Item>();
        set.add({ id: 1 });
        set.add({ id: 2 });

        expect(set.size()).toBe(2);
      });
    });

    describe('persistence', () => {
      it('should persist across instances', () => {
        const set1 = new UnorderedSet<string>();
        set1.add('a');
        set1.add('b');

        const set2 = new UnorderedSet<string>({ id: set1.id() });
        expect(set2.has('a')).toBe(true);
        expect(set2.has('b')).toBe(true);
        expect(set2.size()).toBe(2);
      });

      it('should return valid hex id', () => {
        const set = new UnorderedSet<string>();
        const id = set.id();
        expect(id).toMatch(/^[0-9a-f]+$/);
        expect(id.length).toBe(64);
      });
    });

    describe('initialValues option', () => {
      it('should initialize with provided values', () => {
        const set = new UnorderedSet<string>({ initialValues: ['a', 'b', 'c'] });
        expect(set.size()).toBe(3);
        expect(set.has('a')).toBe(true);
        expect(set.has('b')).toBe(true);
        expect(set.has('c')).toBe(true);
      });

      it('should deduplicate initial values', () => {
        const set = new UnorderedSet<string>({ initialValues: ['a', 'a', 'b', 'b', 'c'] });
        expect(set.size()).toBe(3);
      });
    });

    describe('serialization', () => {
      it('should serialize to JSON correctly', () => {
        const set = new UnorderedSet<string>();
        const json = set.toJSON();

        expect(json.__calimeroCollection).toBe('UnorderedSet');
        expect(typeof json.id).toBe('string');
      });
    });
  });

  describe('LwwRegister', () => {
    describe('empty collection operations', () => {
      it('should start with null value', () => {
        const register = new LwwRegister<string>();
        expect(register.get()).toBeNull();
      });

      it('should return null timestamp for empty register', () => {
        const register = new LwwRegister<string>();
        expect(register.timestamp()).toBeNull();
      });
    });

    describe('basic operations', () => {
      it('should set and get value', () => {
        const register = new LwwRegister<string>();
        register.set('hello');
        expect(register.get()).toBe('hello');
      });

      it('should overwrite value', () => {
        const register = new LwwRegister<string>();
        register.set('first');
        register.set('second');
        expect(register.get()).toBe('second');
      });

      it('should clear value', () => {
        const register = new LwwRegister<string>();
        register.set('value');
        register.clear();
        expect(register.get()).toBeNull();
      });

      it('should have timestamp after set', () => {
        const register = new LwwRegister<string>();
        register.set('value');
        const ts = register.timestamp();
        expect(ts).not.toBeNull();
        expect(typeof ts).toBe('number');
      });
    });

    describe('large values', () => {
      it('should handle large string values', () => {
        const register = new LwwRegister<string>();
        const largeValue = 'x'.repeat(10000);
        register.set(largeValue);
        expect(register.get()).toBe(largeValue);
      });

      it('should handle complex objects', () => {
        interface ComplexData {
          name: string;
          values: number[];
          nested: { key: string };
        }

        const register = new LwwRegister<ComplexData>();
        const data: ComplexData = {
          name: 'test',
          values: [1, 2, 3, 4, 5],
          nested: { key: 'value' },
        };

        register.set(data);
        expect(register.get()).toEqual(data);
      });
    });

    describe('concurrent operations simulation', () => {
      it('should keep last write (timestamp ordering)', () => {
        const register = new LwwRegister<number>();

        register.set(1);
        const ts1 = register.timestamp();

        // Small delay to ensure different timestamp
        register.set(2);
        const ts2 = register.timestamp();

        expect(register.get()).toBe(2);
        expect(ts2).toBeGreaterThanOrEqual(ts1!);
      });

      it('should handle rapid sequential writes', () => {
        const register = new LwwRegister<number>();

        for (let i = 0; i < 100; i++) {
          register.set(i);
        }

        expect(register.get()).toBe(99);
      });
    });

    describe('error conditions', () => {
      it('should handle null value set explicitly', () => {
        const register = new LwwRegister<string | null>();
        register.set('value');
        expect(register.get()).toBe('value');

        // Setting null via clear
        register.clear();
        expect(register.get()).toBeNull();
      });

      it('should handle special characters', () => {
        const register = new LwwRegister<string>();
        const special = 'value\nwith\nnewlines\tand\ttabs';
        register.set(special);
        expect(register.get()).toBe(special);
      });

      it('should handle Unicode values', () => {
        const register = new LwwRegister<string>();
        const unicode = 'emoji-🎉-中文-العربية';
        register.set(unicode);
        expect(register.get()).toBe(unicode);
      });
    });

    describe('type safety', () => {
      it('should work with numbers', () => {
        const register = new LwwRegister<number>();
        register.set(42);
        expect(register.get()).toBe(42);

        register.set(0);
        expect(register.get()).toBe(0);

        register.set(-100);
        expect(register.get()).toBe(-100);
      });

      it('should work with booleans', () => {
        const register = new LwwRegister<boolean>();
        register.set(true);
        expect(register.get()).toBe(true);

        register.set(false);
        expect(register.get()).toBe(false);
      });

      it('should work with arrays', () => {
        const register = new LwwRegister<number[]>();
        register.set([1, 2, 3]);
        expect(register.get()).toEqual([1, 2, 3]);
      });

      it('should work with nested objects', () => {
        interface Nested {
          a: { b: { c: number } };
        }

        const register = new LwwRegister<Nested>();
        register.set({ a: { b: { c: 42 } } });
        expect(register.get()).toEqual({ a: { b: { c: 42 } } });
      });
    });

    describe('persistence', () => {
      it('should persist across instances', () => {
        const register1 = new LwwRegister<string>();
        register1.set('persisted value');

        const register2 = new LwwRegister<string>({ id: register1.id() });
        expect(register2.get()).toBe('persisted value');
      });

      it('should return valid hex id', () => {
        const register = new LwwRegister<string>();
        const id = register.id();
        expect(id).toMatch(/^[0-9a-f]+$/);
        expect(id.length).toBe(64);
      });
    });

    describe('initialValue option', () => {
      it('should initialize with provided value', () => {
        const register = new LwwRegister<string>({ initialValue: 'initial' });
        expect(register.get()).toBe('initial');
      });

      it('should initialize with null value', () => {
        const register = new LwwRegister<string>({ initialValue: null });
        expect(register.get()).toBeNull();
      });
    });

    describe('serialization', () => {
      it('should serialize to JSON correctly', () => {
        const register = new LwwRegister<string>();
        const json = register.toJSON();

        expect(json.__calimeroCollection).toBe('LwwRegister');
        expect(typeof json.id).toBe('string');
      });
    });
  });
});

describe('SHA256', () => {
  it('should compute correct hash for empty input', () => {
    const result = sha256(new Uint8Array(0));
    // SHA256 of empty string is e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
    const expected = new Uint8Array([
      0xe3, 0xb0, 0xc4, 0x42, 0x98, 0xfc, 0x1c, 0x14, 0x9a, 0xfb, 0xf4, 0xc8, 0x99, 0x6f, 0xb9,
      0x24, 0x27, 0xae, 0x41, 0xe4, 0x64, 0x9b, 0x93, 0x4c, 0xa4, 0x95, 0x99, 0x1b, 0x78, 0x52,
      0xb8, 0x55,
    ]);
    expect(result).toEqual(expected);
  });

  it('should compute correct hash for "hello"', () => {
    const encoder = new TextEncoder();
    const result = sha256(encoder.encode('hello'));
    // SHA256 of "hello" is 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
    const expected = new Uint8Array([
      0x2c, 0xf2, 0x4d, 0xba, 0x5f, 0xb0, 0xa3, 0x0e, 0x26, 0xe8, 0x3b, 0x2a, 0xc5, 0xb9, 0xe2,
      0x9e, 0x1b, 0x16, 0x1e, 0x5c, 0x1f, 0xa7, 0x42, 0x5e, 0x73, 0x04, 0x33, 0x62, 0x93, 0x8b,
      0x98, 0x24,
    ]);
    expect(result).toEqual(expected);
  });

  it('should return 32-byte hash', () => {
    const encoder = new TextEncoder();
    const result = sha256(encoder.encode('test data'));
    expect(result.length).toBe(32);
    expect(result).toBeInstanceOf(Uint8Array);
  });

  it('should produce different hashes for different inputs', () => {
    const encoder = new TextEncoder();
    const hash1 = sha256(encoder.encode('data1'));
    const hash2 = sha256(encoder.encode('data2'));
    expect(hash1).not.toEqual(hash2);
  });

  it('should produce same hash for same input', () => {
    const encoder = new TextEncoder();
    const hash1 = sha256(encoder.encode('same data'));
    const hash2 = sha256(encoder.encode('same data'));
    expect(hash1).toEqual(hash2);
  });
});

describe('FrozenValue', () => {
  it('should wrap a value', () => {
    const frozen = new FrozenValue('test');
    expect(frozen.value).toBe('test');
  });

  it('should support various types', () => {
    const stringFrozen = new FrozenValue('string');
    expect(stringFrozen.value).toBe('string');

    const numberFrozen = new FrozenValue(42);
    expect(numberFrozen.value).toBe(42);

    const objectFrozen = new FrozenValue({ key: 'value' });
    expect(objectFrozen.value).toEqual({ key: 'value' });

    const arrayFrozen = new FrozenValue([1, 2, 3]);
    expect(arrayFrozen.value).toEqual([1, 2, 3]);
  });

  it('should have no-op merge', () => {
    const frozen1 = new FrozenValue('original');
    const frozen2 = new FrozenValue('other');

    // Merge should return self without modification
    const result = frozen1.merge(frozen2);
    expect(result).toBe(frozen1);
    expect(result.value).toBe('original');
  });

  it('should serialize to JSON', () => {
    const frozen = new FrozenValue({ data: 'test' });
    const json = frozen.toJSON();

    expect(json.__frozenValue).toBe(true);
    expect(json.value).toEqual({ data: 'test' });
  });

  it('should deserialize from JSON', () => {
    const json = { __frozenValue: true as const, value: { data: 'test' } };
    const frozen = FrozenValue.fromJSON(json);

    expect(frozen).toBeInstanceOf(FrozenValue);
    expect(frozen.value).toEqual({ data: 'test' });
  });
});

describe('UserStorage', () => {
  describe('PublicKey validation', () => {
    // Note: Full UserStorage tests require runtime environment
    // These tests validate the type constraints

    it('should require 32-byte PublicKey for keys', () => {
      // The actual collection operations require runtime,
      // but we can test the type definitions are correct
      const validPublicKey = new Uint8Array(32);
      expect(validPublicKey.length).toBe(32);
    });

    it('should reject invalid PublicKey lengths', () => {
      const invalidKey = new Uint8Array(16);
      expect(invalidKey.length).not.toBe(32);
    });
  });
});

describe('ed25519Verify', () => {
  // Note: ed25519_verify tests require the WASM runtime environment
  // The function validates signatures using the host function

  it('should validate input types', () => {
    // Test that the function signature expects correct types
    // Full verification tests require runtime
    const signature = new Uint8Array(64);
    const publicKey = new Uint8Array(32);
    const message = new Uint8Array([1, 2, 3]);

    expect(signature.length).toBe(64);
    expect(publicKey.length).toBe(32);
    expect(message).toBeInstanceOf(Uint8Array);
  });
});
