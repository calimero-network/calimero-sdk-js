/**
 * Test setup and mocks
 */

// Mock storage
const storage = new Map<string, Uint8Array>();

// Mock register
let currentRegister: Uint8Array | null = null;

// Mock executor ID
const mockExecutorId = new Uint8Array(32);
mockExecutorId.fill(1); // All 1s for testing

// Mock context ID
const mockContextId = new Uint8Array(32);
mockContextId.fill(2); // All 2s for testing

// Mock the global env object that would be provided by QuickJS
(global as any).env = {
  log_utf8: (msg: Uint8Array) => {
    // Silent in tests, could console.log if needed
  },

  storage_read: (key: Uint8Array, register_id: bigint): bigint => {
    const keyStr = Array.from(key).join(',');
    const value = storage.get(keyStr);
    if (value) {
      currentRegister = value;
      return 1n; // true
    }
    currentRegister = null;
    return 0n; // false
  },

  storage_write: (key: Uint8Array, value: Uint8Array, register_id: bigint): bigint => {
    const keyStr = Array.from(key).join(',');
    storage.set(keyStr, value);
    return 1n;
  },

  storage_remove: (key: Uint8Array, register_id: bigint): bigint => {
    const keyStr = Array.from(key).join(',');
    const existed = storage.has(keyStr);
    storage.delete(keyStr);
    return existed ? 1n : 0n;
  },

  register_len: (register_id: bigint): bigint => {
    return currentRegister ? BigInt(currentRegister.length) : 0n;
  },

  read_register: (register_id: bigint, buf: Uint8Array): boolean => {
    if (currentRegister) {
      buf.set(currentRegister);
      return true;
    }
    return false;
  },

  context_id: (register_id: bigint): void => {
    currentRegister = mockContextId;
  },

  executor_id: (register_id: bigint): void => {
    currentRegister = mockExecutorId;
  },

  emit: (kind: Uint8Array, data: Uint8Array): void => {
    // Silent in tests
  },

  emit_with_handler: (kind: Uint8Array, data: Uint8Array, handler: Uint8Array): void => {
    // Silent in tests
  },

  commit: (root: Uint8Array, artifact: Uint8Array): void => {
    // Silent in tests
  },

  time_now: (buf: Uint8Array): void => {
    // Return current timestamp
    const now = BigInt(Date.now() * 1000000); // Convert to nanoseconds
    new DataView(buf.buffer).setBigUint64(0, now, true);
  },

  blob_create: (): bigint => 1n,
  blob_open: (blob_id: Uint8Array): bigint => 0n,
  blob_read: (fd: bigint, buffer: Uint8Array): bigint => 0n,
  blob_write: (fd: bigint, data: Uint8Array): bigint => BigInt(data.length),
  blob_close: (fd: bigint, blob_id_buf: Uint8Array): boolean => true
};

// Helper to clear storage between tests
export function clearStorage() {
  storage.clear();
  currentRegister = null;
}

// Helper to get storage contents (for debugging)
export function getStorage() {
  return storage;
}

