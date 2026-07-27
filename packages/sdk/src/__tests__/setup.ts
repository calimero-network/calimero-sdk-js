/**
 * Test setup and mocks
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

// Attributed (authored) CRDT stores. Each entry/slot records its owner so the
// mock can enforce owner-only update/remove/tombstone semantics.
type AuthoredMapStore = {
  entries: Map<string, StoredValue>;
  owners: Map<string, Uint8Array>;
};

type AuthoredSlot = {
  value: Uint8Array;
  owner: Uint8Array;
  tombstoned: boolean;
};

type AuthoredVectorStore = {
  slots: AuthoredSlot[];
};

// In-memory backing stores
const storage = new Map<string, Uint8Array>();
const maps = new Map<string, MapStore>();
const vectors = new Map<string, VectorStore>();
const sets = new Map<string, SetStore>();
const counters = new Map<string, CounterStore>();
const lwwRegisters = new Map<string, LwwStore>();
const authoredMaps = new Map<string, AuthoredMapStore>();
const authoredVectors = new Map<string, AuthoredVectorStore>();

// Register buffer
let currentRegister: Uint8Array | null = null;

// Executor & context IDs
const mockExecutorId = new Uint8Array(32).fill(1);
const mockContextId = new Uint8Array(32).fill(2);

// Mutable "current executor" so tests can simulate a different caller and
// exercise the owner-only paths of the authored collections.
let currentExecutorId = mockExecutorId;

/**
 * Override the executor identity returned by the mock host. Tests use this to
 * simulate a second member acting on an authored collection.
 */
export function setExecutorId(id: Uint8Array): void {
  currentExecutorId = new Uint8Array(id);
}

/**
 * Restore the default mock executor identity.
 */
export function resetExecutorId(): void {
  currentExecutorId = mockExecutorId;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

function setRegisterError(message: string): void {
  setRegister(new TextEncoder().encode(message));
}

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
  const id = executor ?? currentExecutorId;
  return Array.from(id).join(',');
}

// Mock env
(global as any).env = {
  log_utf8: (_msg: Uint8Array) => {
    // Silent in tests, could console.log if needed
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
      return 1n; // true
    }
    setRegister(null);
    return 0n; // false
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
    currentRegister = new Uint8Array(currentExecutorId);
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
    // Return current timestamp
    const now = BigInt(Date.now() * 1000000); // Convert to nanoseconds
    new DataView(buf.buffer).setBigUint64(0, now, true);
  },

  blob_create: (): bigint => 1n,
  blob_open: (_blob_id: Uint8Array): bigint => 0n,
  blob_read: (_fd: bigint, _buffer: Uint8Array): bigint => 0n,
  blob_write: (_fd: bigint, data: Uint8Array): bigint => BigInt(data.length),
  blob_close: (_fd: bigint, _blob_id_buf: Uint8Array): boolean => true,

  register_js_sdk_root_merge: (): void => {
    // no-op in tests
  },

  js_crdt_map_new: (_register_id: bigint): number => {
    const id = generateId();
    maps.set(idToKey(id), { entries: new Map() });
    setRegister(id);
    return 1;
  },

  // Deterministic-id constructors: register a backing store at the supplied id.
  js_crdt_map_new_with_id: (id: Uint8Array, _register_id: bigint): number => {
    maps.set(idToKey(id), { entries: new Map() });
    setRegister(new Uint8Array(id));
    return 1;
  },

  js_crdt_vector_new_with_id: (id: Uint8Array, _register_id: bigint): number => {
    vectors.set(idToKey(id), { values: [] });
    setRegister(new Uint8Array(id));
    return 1;
  },

  js_crdt_set_new_with_id: (id: Uint8Array, _register_id: bigint): number => {
    sets.set(idToKey(id), { values: new Set() });
    setRegister(new Uint8Array(id));
    return 1;
  },

  js_crdt_lww_new_with_id: (id: Uint8Array, _register_id: bigint): number => {
    lwwRegisters.set(idToKey(id), {
      value: null,
      timestamp: 0n,
      nodeId: mockExecutorId.slice(0, 16),
    });
    setRegister(new Uint8Array(id));
    return 1;
  },

  js_crdt_counter_new_with_id: (id: Uint8Array, _register_id: bigint): number => {
    counters.set(idToKey(id), { totalsByExecutor: new Map() });
    setRegister(new Uint8Array(id));
    return 1;
  },

  js_user_storage_new_with_id: (id: Uint8Array, _register_id: bigint): number => {
    setRegister(new Uint8Array(id));
    return 1;
  },

  js_frozen_storage_new_with_id: (id: Uint8Array, _register_id: bigint): number => {
    setRegister(new Uint8Array(id));
    return 1;
  },

  js_crdt_authored_map_new_with_id: (id: Uint8Array, _register_id: bigint): number => {
    authoredMaps.set(idToKey(id), { entries: new Map(), owners: new Map() });
    setRegister(new Uint8Array(id));
    return 0;
  },

  js_crdt_authored_vector_new_with_id: (id: Uint8Array, _register_id: bigint): number => {
    authoredVectors.set(idToKey(id), { slots: [] });
    setRegister(new Uint8Array(id));
    return 0;
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
    const values = Array.from(store.values).map(value =>
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

  // --- AuthoredMap (attributed map) ----------------------------------------

  js_crdt_authored_map_new: (_register_id: bigint): number => {
    const id = generateId();
    authoredMaps.set(idToKey(id), { entries: new Map(), owners: new Map() });
    setRegister(id);
    return 0;
  },

  js_crdt_authored_map_insert: (
    mapId: Uint8Array,
    key: Uint8Array,
    value: Uint8Array,
    _register_id: bigint
  ): number => {
    const store = authoredMaps.get(idToKey(mapId));
    if (!store) {
      setRegisterError('authored map not found');
      return -1;
    }
    const entryKey = Array.from(key).join(',');
    if (store.entries.has(entryKey)) {
      // `insert` rejects an already-present key.
      setRegisterError('key already exists');
      return -1;
    }
    store.entries.set(entryKey, new Uint8Array(value));
    // Stamp the current executor as the entry owner.
    store.owners.set(entryKey, new Uint8Array(currentExecutorId));
    setRegister(null);
    return 0;
  },

  js_crdt_authored_map_update: (
    mapId: Uint8Array,
    key: Uint8Array,
    value: Uint8Array,
    _register_id: bigint
  ): number => {
    const store = authoredMaps.get(idToKey(mapId));
    if (!store) {
      setRegisterError('authored map not found');
      return -1;
    }
    const entryKey = Array.from(key).join(',');
    const owner = store.owners.get(entryKey);
    if (!owner) {
      setRegisterError('key not found');
      return -1;
    }
    // Owner-only: reject a non-owner executor (ActionNotAllowed).
    if (!bytesEqual(owner, currentExecutorId)) {
      setRegisterError('ActionNotAllowed: not the entry owner');
      return -1;
    }
    store.entries.set(entryKey, new Uint8Array(value));
    return 1;
  },

  js_crdt_authored_map_remove: (
    mapId: Uint8Array,
    key: Uint8Array,
    _register_id: bigint
  ): number => {
    const store = authoredMaps.get(idToKey(mapId));
    if (!store) {
      setRegisterError('authored map not found');
      return -1;
    }
    const entryKey = Array.from(key).join(',');
    const previous = store.entries.get(entryKey);
    if (!previous) {
      setRegister(null);
      return 0;
    }
    const owner = store.owners.get(entryKey);
    // Owner-only: reject a non-owner executor (ActionNotAllowed).
    if (owner && !bytesEqual(owner, currentExecutorId)) {
      setRegisterError('ActionNotAllowed: not the entry owner');
      return -1;
    }
    store.entries.delete(entryKey);
    store.owners.delete(entryKey);
    setRegister(previous);
    return 1;
  },

  js_crdt_authored_map_get: (mapId: Uint8Array, key: Uint8Array, _register_id: bigint): number => {
    const store = authoredMaps.get(idToKey(mapId));
    if (!store) {
      setRegisterError('authored map not found');
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

  js_crdt_authored_map_contains: (mapId: Uint8Array, key: Uint8Array): number => {
    const store = authoredMaps.get(idToKey(mapId));
    if (!store) {
      return -1;
    }
    return store.entries.has(Array.from(key).join(',')) ? 1 : 0;
  },

  js_crdt_authored_map_owner_of: (
    mapId: Uint8Array,
    key: Uint8Array,
    _register_id: bigint
  ): number => {
    const store = authoredMaps.get(idToKey(mapId));
    if (!store) {
      setRegisterError('authored map not found');
      return -1;
    }
    const owner = store.owners.get(Array.from(key).join(','));
    if (!owner) {
      setRegister(null);
      return 0;
    }
    setRegister(new Uint8Array(owner));
    return 1;
  },

  js_crdt_authored_map_owned_by_me: (mapId: Uint8Array, key: Uint8Array): number => {
    const store = authoredMaps.get(idToKey(mapId));
    if (!store) {
      return -1;
    }
    const owner = store.owners.get(Array.from(key).join(','));
    if (!owner) {
      return 0;
    }
    return bytesEqual(owner, currentExecutorId) ? 1 : 0;
  },

  js_crdt_authored_map_iter: (mapId: Uint8Array, _register_id: bigint): number => {
    const store = authoredMaps.get(idToKey(mapId));
    if (!store) {
      setRegisterError('authored map not found');
      return -1;
    }
    const entries = Array.from(store.entries.entries()).map(([key, value]) => {
      const keyBytes = Uint8Array.from(key.split(',').map(Number));
      return [keyBytes, value] as [Uint8Array, Uint8Array];
    });
    setRegister(serializeMapEntries(entries));
    return 1;
  },

  js_crdt_authored_map_len: (mapId: Uint8Array, _register_id: bigint): number => {
    const store = authoredMaps.get(idToKey(mapId));
    if (!store) {
      return -1;
    }
    writeU64ToRegister(BigInt(store.entries.size));
    return 1;
  },

  // --- AuthoredVector (attributed ordered list) ----------------------------

  js_crdt_authored_vector_new: (_register_id: bigint): number => {
    const id = generateId();
    authoredVectors.set(idToKey(id), { slots: [] });
    setRegister(id);
    return 0;
  },

  js_crdt_authored_vector_push: (
    vectorId: Uint8Array,
    value: Uint8Array,
    _register_id: bigint
  ): number => {
    const store = authoredVectors.get(idToKey(vectorId));
    if (!store) {
      setRegisterError('authored vector not found');
      return -1;
    }
    store.slots.push({
      value: new Uint8Array(value),
      owner: new Uint8Array(currentExecutorId),
      tombstoned: false,
    });
    // `push` returns the new slot index (u64 LE) in the register.
    writeU64ToRegister(BigInt(store.slots.length - 1));
    return 1;
  },

  js_crdt_authored_vector_update: (
    vectorId: Uint8Array,
    index: number,
    value: Uint8Array,
    _register_id: bigint
  ): number => {
    const store = authoredVectors.get(idToKey(vectorId));
    if (!store) {
      setRegisterError('authored vector not found');
      return -1;
    }
    const slot = store.slots[index];
    if (!slot || slot.tombstoned) {
      setRegisterError('slot not found');
      return -1;
    }
    if (!bytesEqual(slot.owner, currentExecutorId)) {
      setRegisterError('ActionNotAllowed: not the slot owner');
      return -1;
    }
    slot.value = new Uint8Array(value);
    return 1;
  },

  js_crdt_authored_vector_tombstone: (
    vectorId: Uint8Array,
    index: number,
    _register_id: bigint
  ): number => {
    const store = authoredVectors.get(idToKey(vectorId));
    if (!store) {
      setRegisterError('authored vector not found');
      return -1;
    }
    const slot = store.slots[index];
    if (!slot || slot.tombstoned) {
      setRegisterError('slot not found');
      return -1;
    }
    if (!bytesEqual(slot.owner, currentExecutorId)) {
      setRegisterError('ActionNotAllowed: not the slot owner');
      return -1;
    }
    slot.tombstoned = true;
    return 1;
  },

  js_crdt_authored_vector_get: (
    vectorId: Uint8Array,
    index: number,
    _register_id: bigint
  ): number => {
    const store = authoredVectors.get(idToKey(vectorId));
    if (!store) {
      setRegisterError('authored vector not found');
      return -1;
    }
    const slot = store.slots[index];
    if (!slot) {
      setRegister(null);
      return 0;
    }
    // Match core: `tombstone` writes `V::default()`, so a tombstoned slot
    // round-trips as a 0-byte value (not an absent/null slot). The wrapper is
    // responsible for treating a 0-length value as tombstoned.
    setRegister(slot.tombstoned ? new Uint8Array(0) : slot.value);
    return 1;
  },

  js_crdt_authored_vector_owner_of: (
    vectorId: Uint8Array,
    index: number,
    _register_id: bigint
  ): number => {
    const store = authoredVectors.get(idToKey(vectorId));
    if (!store) {
      setRegisterError('authored vector not found');
      return -1;
    }
    const slot = store.slots[index];
    if (!slot) {
      setRegister(null);
      return 0;
    }
    setRegister(new Uint8Array(slot.owner));
    return 1;
  },

  js_crdt_authored_vector_owned_by_me: (vectorId: Uint8Array, index: number): number => {
    const store = authoredVectors.get(idToKey(vectorId));
    if (!store) {
      return -1;
    }
    const slot = store.slots[index];
    if (!slot) {
      return 0;
    }
    return bytesEqual(slot.owner, currentExecutorId) ? 1 : 0;
  },

  js_crdt_authored_vector_iter: (vectorId: Uint8Array, _register_id: bigint): number => {
    const store = authoredVectors.get(idToKey(vectorId));
    if (!store) {
      setRegisterError('authored vector not found');
      return -1;
    }
    // Match core: `iter` returns every slot including tombstoned ones, which
    // round-trip as 0-byte values (`V::default()`). The wrapper filters them.
    const values = store.slots.map(slot =>
      slot.tombstoned ? new Uint8Array(0) : new Uint8Array(slot.value)
    );
    setRegister(serializeVec(values));
    return 1;
  },

  js_crdt_authored_vector_len: (vectorId: Uint8Array, _register_id: bigint): number => {
    const store = authoredVectors.get(idToKey(vectorId));
    if (!store) {
      return -1;
    }
    writeU64ToRegister(BigInt(store.slots.length));
    return 1;
  },
};

// Helper to clear storage between tests
export function clearStorage() {
  storage.clear();
  maps.clear();
  vectors.clear();
  sets.clear();
  counters.clear();
  lwwRegisters.clear();
  authoredMaps.clear();
  authoredVectors.clear();
  resetExecutorId();
  currentRegister = null;
}

// Helper to get storage contents (for debugging)
export function getStorage() {
  return storage;
}
