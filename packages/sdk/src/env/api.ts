/**
 * Environment API
 *
 * Provides access to Calimero host functions for logging, storage,
 * context information, and more.
 */

import '../polyfills/text-encoding';

import type { HostEnv } from './bindings';
import { DeltaContext } from '../collections/internal/DeltaContext';
import { exposeValue } from '../utils/expose';

// This will be provided by QuickJS runtime via builder.c
declare const env: HostEnv;

const REGISTER_ID = 0n;
const textEncoder = new TextEncoder();

DeltaContext.setCommitHandler((rootHash, artifact) => {
  env.commit(rootHash, artifact);
});

export function registerLen(register: bigint = REGISTER_ID): bigint {
  return env.register_len(register);
}

export function readRegister(register: bigint, buffer: Uint8Array): void {
  env.read_register(register, buffer);
}

export function input(register: bigint = REGISTER_ID): void {
  env.input(register);
}

export function panic(message: string): never {
  env.panic_utf8(textEncoder.encode(message));
}

export function valueReturn(value: unknown): void {
  if (value instanceof Uint8Array) {
    env.value_return(value);
    return;
  }

  if (typeof value === 'bigint') {
    env.value_return(textEncoder.encode(value.toString()));
    return;
  }

  if (typeof value === 'string') {
    env.value_return(textEncoder.encode(value));
    return;
  }

  const exposed = exposeValue(value);
  const json =
    exposed === undefined
      ? 'null'
      : JSON.stringify(exposed, (_key, val) =>
          typeof val === 'bigint' ? val.toString() : val
        );
  env.value_return(textEncoder.encode(json ?? 'null'));
}

/**
 * Logs a message to the runtime
 *
 * @param message - Message to log
 *
 * @example
 * ```typescript
 * env.log('Application started');
 * env.log(`Processing item: ${itemId}`);
 * ```
 */
export function log(message: string): void {
  env.log_utf8(textEncoder.encode(message));
}

/**
 * Gets the current context ID
 *
 * @returns 32-byte context ID
 */
export function contextId(): Uint8Array {
  env.context_id(REGISTER_ID);
  const len = Number(env.register_len(REGISTER_ID));
  const buf = new Uint8Array(len);
  env.read_register(REGISTER_ID, buf);
  return buf;
}

/**
 * Gets the current executor ID
 *
 * @returns 32-byte executor ID
 */
export function executorId(): Uint8Array {
  env.executor_id(REGISTER_ID);
  const len = Number(env.register_len(REGISTER_ID));
  const buf = new Uint8Array(len);
  env.read_register(REGISTER_ID, buf);
  return buf;
}

/**
 * Reads a value from storage
 *
 * @param key - Storage key
 * @returns Value if exists, null otherwise
 */
export function storageRead(key: Uint8Array): Uint8Array | null {
  const exists = env.storage_read(key, REGISTER_ID);
  if (!exists) return null;

  const len = Number(env.register_len(REGISTER_ID));
  const buf = new Uint8Array(len);
  env.read_register(REGISTER_ID, buf);
  return buf;
}

/**
 * Writes a value to storage
 *
 * @param key - Storage key
 * @param value - Value to store
 */
export function storageWrite(key: Uint8Array, value: Uint8Array): void {
  env.storage_write(key, value, REGISTER_ID);
  DeltaContext.recordUpdate(key.slice(), value.slice(), timeNow());
}

/**
 * Removes a value from storage
 *
 * @param key - Storage key
 * @returns true if key existed, false otherwise
 */
export function storageRemove(key: Uint8Array): boolean {
  const existed = Boolean(env.storage_remove(key, REGISTER_ID));
  if (existed) {
    DeltaContext.recordRemove(key.slice(), timeNow());
  }
  return existed;
}

export function jsCrdtMapNew(register: bigint): number {
  return env.js_crdt_map_new(register);
}

export function jsCrdtMapGet(mapId: Uint8Array, key: Uint8Array, register: bigint): number {
  return env.js_crdt_map_get(mapId, key, register);
}

export function jsCrdtMapInsert(
  mapId: Uint8Array,
  key: Uint8Array,
  value: Uint8Array,
  register: bigint
): number {
  return env.js_crdt_map_insert(mapId, key, value, register);
}

export function jsCrdtMapRemove(
  mapId: Uint8Array,
  key: Uint8Array,
  register: bigint
): number {
  return env.js_crdt_map_remove(mapId, key, register);
}

export function jsCrdtMapContains(mapId: Uint8Array, key: Uint8Array): number {
  return env.js_crdt_map_contains(mapId, key);
}

export function jsCrdtMapIter(mapId: Uint8Array, register: bigint): number {
  return env.js_crdt_map_iter(mapId, register);
}

export function jsCrdtVectorNew(register: bigint): number {
  return env.js_crdt_vector_new(register);
}

export function jsCrdtVectorLen(vectorId: Uint8Array, register: bigint): number {
  return env.js_crdt_vector_len(vectorId, register);
}

export function jsCrdtVectorPush(vectorId: Uint8Array, value: Uint8Array): number {
  return env.js_crdt_vector_push(vectorId, value);
}

export function jsCrdtVectorGet(vectorId: Uint8Array, index: bigint, register: bigint): number {
  return env.js_crdt_vector_get(vectorId, index, register);
}

export function jsCrdtVectorPop(vectorId: Uint8Array, register: bigint): number {
  return env.js_crdt_vector_pop(vectorId, register);
}

export function jsCrdtSetNew(register: bigint): number {
  return env.js_crdt_set_new(register);
}

export function jsCrdtSetInsert(setId: Uint8Array, value: Uint8Array): number {
  return env.js_crdt_set_insert(setId, value);
}

export function jsCrdtSetContains(setId: Uint8Array, value: Uint8Array): number {
  return env.js_crdt_set_contains(setId, value);
}

export function jsCrdtSetRemove(setId: Uint8Array, value: Uint8Array): number {
  return env.js_crdt_set_remove(setId, value);
}

export function jsCrdtSetLen(setId: Uint8Array, register: bigint): number {
  return env.js_crdt_set_len(setId, register);
}

export function jsCrdtSetIter(setId: Uint8Array, register: bigint): number {
  return env.js_crdt_set_iter(setId, register);
}

export function jsCrdtSetClear(setId: Uint8Array): number {
  return env.js_crdt_set_clear(setId);
}

export function jsCrdtLwwNew(register: bigint): number {
  return env.js_crdt_lww_new(register);
}

export function jsCrdtLwwSet(registerId: Uint8Array, value: Uint8Array | null): number {
  return env.js_crdt_lww_set(registerId, value);
}

export function jsCrdtLwwGet(registerId: Uint8Array, register: bigint): number {
  return env.js_crdt_lww_get(registerId, register);
}

export function jsCrdtLwwTimestamp(registerId: Uint8Array, register: bigint): number {
  return env.js_crdt_lww_timestamp(registerId, register);
}

export function jsCrdtCounterNew(register: bigint): number {
  return env.js_crdt_counter_new(register);
}

export function jsCrdtCounterIncrement(counterId: Uint8Array): number {
  return env.js_crdt_counter_increment(counterId);
}

export function jsCrdtCounterValue(counterId: Uint8Array, register: bigint): number {
  return env.js_crdt_counter_value(counterId, register);
}

export function jsCrdtCounterGetExecutorCount(
  counterId: Uint8Array,
  register: bigint,
  executorId?: Uint8Array
): number {
  return env.js_crdt_counter_get_executor_count(counterId, register, executorId);
}

/**
 * Flush pending delta actions to the host.
 *
 * Returns true if a commit occurred.
 */
export function flushDelta(): boolean {
  return DeltaContext.commit();
}

/**
 * Commits the current delta to storage
 *
 * @param rootHash - Root hash of the Merkle tree
 * @param artifact - Serialized delta artifact
 */
export function commitDelta(rootHash: Uint8Array, artifact: Uint8Array): void {
  env.commit(rootHash, artifact);
}

/**
 * Gets the current timestamp
 *
 * @returns Current timestamp in nanoseconds
 */
export function timeNow(): bigint {
  const buf = new Uint8Array(8);
  env.time_now(buf);
  return new DataView(buf.buffer).getBigUint64(0, true);
}

/**
 * Creates a new blob for writing
 *
 * @returns File descriptor
 */
export function blobCreate(): bigint {
  return env.blob_create();
}

/**
 * Opens a blob for reading
 *
 * @param blobId - 32-byte blob ID
 * @returns File descriptor, or 0 if not found
 */
export function blobOpen(blobId: Uint8Array): bigint {
  return env.blob_open(blobId);
}

/**
 * Reads data from a blob
 *
 * @param fd - File descriptor
 * @param buffer - Buffer to read into
 * @returns Number of bytes read
 */
export function blobRead(fd: bigint, buffer: Uint8Array): bigint {
  return env.blob_read(fd, buffer);
}

/**
 * Writes data to a blob
 *
 * @param fd - File descriptor
 * @param data - Data to write
 * @returns Number of bytes written
 */
export function blobWrite(fd: bigint, data: Uint8Array): bigint {
  return env.blob_write(fd, data);
}

/**
 * Closes a blob
 *
 * @param fd - File descriptor
 * @returns Blob ID (32 bytes)
 */
export function blobClose(fd: bigint): Uint8Array {
  const blobId = new Uint8Array(32);
  const success = env.blob_close(fd, blobId);
  if (!success) {
    throw new Error('Failed to close blob');
  }
  return blobId;
}

