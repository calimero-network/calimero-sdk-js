/**
 * Environment API
 *
 * Provides access to Calimero host functions for logging, storage,
 * context information, and more.
 */

import '../polyfills/text-encoding';

import type { HostEnv } from './bindings';
import { getAbiManifest, getMethod, resolveTypeRef } from '../abi/helpers';
import type { TypeRef, AbiManifest, ScalarType } from '../abi/types';

// This will be provided by QuickJS runtime via builder.c
declare const env: HostEnv;

const REGISTER_ID = 0n;
const textEncoder = new TextEncoder();

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

/**
 * Converts a value to JSON-compatible format based on ABI type
 * Handles bigint conversion and other type-specific conversions
 */
function convertToJsonCompatible(value: unknown, typeRef: TypeRef, abi: AbiManifest): unknown {
  // Handle null/undefined
  if (value === null || value === undefined) {
    return null;
  }

  // Handle scalar types (both formats: {kind: "scalar", scalar: "u64"} and {kind: "u64"})
  const scalarType =
    typeRef.kind === 'scalar'
      ? typeRef.scalar
      : [
            'bool',
            'u8',
            'u16',
            'u32',
            'u64',
            'u128',
            'i8',
            'i16',
            'i32',
            'i64',
            'i128',
            'f32',
            'f64',
            'string',
            'bytes',
            'unit',
          ].includes(typeRef.kind)
        ? (typeRef.kind as ScalarType)
        : null;

  if (scalarType) {
    // Convert bigint types to string for JSON compatibility
    if (
      scalarType === 'u64' ||
      scalarType === 'i64' ||
      scalarType === 'u128' ||
      scalarType === 'i128'
    ) {
      if (typeof value === 'bigint') {
        return value.toString();
      }
      // If it's already a number, convert to string to preserve precision
      if (typeof value === 'number') {
        return value.toString();
      }
    }

    // Handle bytes - convert to base64 string
    if (scalarType === 'bytes') {
      if (value instanceof Uint8Array) {
        // Convert to base64 for JSON
        const binary = Array.from(value)
          .map(b => String.fromCharCode(b))
          .join('');
        return btoa(binary);
      }
    }

    // For other scalars, return as-is (JSON.stringify handles them)
    return value;
  }

  // Handle option types
  if (typeRef.kind === 'option') {
    if (value === null || value === undefined) {
      return null;
    }
    return convertToJsonCompatible(value, typeRef.inner!, abi);
  }

  // Handle vector/list types
  if (typeRef.kind === 'vector' || typeRef.kind === 'list') {
    if (!Array.isArray(value)) {
      throw new Error(`Expected array for ${typeRef.kind} type, got ${typeof value}`);
    }
    const innerType = typeRef.inner || typeRef.items;
    if (!innerType) {
      throw new Error(`Missing inner type for ${typeRef.kind}`);
    }
    return value.map(item => convertToJsonCompatible(item, innerType, abi));
  }

  // Handle map types
  if (typeRef.kind === 'map') {
    if (!(value instanceof Map) && typeof value !== 'object') {
      throw new Error(`Expected Map or object for map type, got ${typeof value}`);
    }
    const entries = value instanceof Map ? Array.from(value.entries()) : Object.entries(value);
    const result: Record<string, unknown> = {};
    for (const [key, val] of entries) {
      const jsonKey = typeof key === 'string' ? key : String(key);
      result[jsonKey] = convertToJsonCompatible(val, typeRef.value!, abi);
    }
    return result;
  }

  // Handle set types
  if (typeRef.kind === 'set') {
    if (!(value instanceof Set) && !Array.isArray(value)) {
      throw new Error(`Expected Set or array for set type, got ${typeof value}`);
    }
    const items = value instanceof Set ? Array.from(value) : value;
    const innerType = typeRef.inner || typeRef.items;
    if (!innerType) {
      throw new Error('Missing inner type for set');
    }
    return items.map(item => convertToJsonCompatible(item, innerType, abi));
  }

  // Handle reference types (records, variants, etc.)
  if (typeRef.kind === 'reference' || typeRef.$ref) {
    const typeName = typeRef.name || typeRef.$ref;
    if (!typeName) {
      throw new Error('Missing type name for reference');
    }
    const typeDef = abi.types[typeName];
    if (!typeDef) {
      throw new Error(`Type ${typeName} not found in ABI`);
    }

    // Handle record types
    if (typeDef.kind === 'record' && typeDef.fields) {
      if (typeof value !== 'object' || value === null) {
        throw new Error(`Expected object for record type ${typeName}, got ${typeof value}`);
      }
      const result: Record<string, unknown> = {};
      for (const field of typeDef.fields) {
        const fieldValue = (value as Record<string, unknown>)[field.name];
        if (fieldValue === undefined && !field.nullable) {
          continue; // Skip undefined fields
        }
        result[field.name] = convertToJsonCompatible(fieldValue, field.type, abi);
      }
      return result;
    }

    // Handle variant types
    if (typeDef.kind === 'variant' && typeDef.variants) {
      // Variants are typically represented as objects with a discriminator
      if (typeof value !== 'object' || value === null) {
        throw new Error(`Expected object for variant type ${typeName}, got ${typeof value}`);
      }
      // Return as-is for variants (they should already be JSON-compatible)
      return value;
    }

    // Handle alias types
    if (typeDef.kind === 'alias' && typeDef.target) {
      return convertToJsonCompatible(value, typeDef.target, abi);
    }
  }

  // Fallback: return value as-is (JSON.stringify will handle it)
  return value;
}

export function valueReturn(value: unknown, methodName?: string): void {
  // Return values should be JSON, not Borsh
  if (!methodName) {
    throw new Error('Method name is required for return value serialization');
  }

  const abi = getAbiManifest();
  if (!abi) {
    throw new Error('ABI manifest is required but not available');
  }

  const method = getMethod(abi, methodName);
  if (!method) {
    throw new Error(`Method ${methodName} not found in ABI`);
  }

  if (!method.returns) {
    // Method returns void/unit - return null JSON
    env.value_return(textEncoder.encode('null'));
    return;
  }

  // Convert value to JSON-compatible format based on ABI type
  const jsonValue = convertToJsonCompatible(value, method.returns, abi);
  const jsonString = JSON.stringify(jsonValue);
  env.value_return(textEncoder.encode(jsonString));
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
 * Gets the current executor ID as a hexadecimal string
 *
 * @returns Hex representation of the executor ID
 */
export function executorIdHex(): string {
  const id = executorId();
  return bytesToHex(id);
}

/**
 * Gets the current executor ID encoded as base58
 *
 * @returns Base58 representation of the executor ID
 */
export function executorIdBase58(): string {
  const id = executorId();
  return bytesToBase58(id);
}

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

function bytesToBase58(bytes: Uint8Array): string {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  if (bytes.length === 0) {
    return '';
  }

  const digits: number[] = [0];

  for (let i = 0; i < bytes.length; i += 1) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j += 1) {
      const value = (digits[j] << 8) + carry;
      digits[j] = value % 58;
      carry = Math.floor(value / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }

  // handle leading zeros
  for (let i = 0; i < bytes.length && bytes[i] === 0; i += 1) {
    digits.push(0);
  }

  return digits
    .reverse()
    .map(digit => alphabet[digit])
    .join('');
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
}

/**
 * Schedule a cross-context call to run once the current execution finishes.
 *
 * @param contextId - Target context identifier (32 bytes)
 * @param functionName - Function name to invoke in the target context
 * @param params - Serialized parameters for the call (defaults to empty payload)
 */
export function xcall(
  contextId: Uint8Array,
  functionName: string,
  params: Uint8Array = new Uint8Array()
): void {
  if (contextId.length !== 32) {
    throw new Error('contextId must be exactly 32 bytes');
  }

  const fnBytes = textEncoder.encode(functionName);
  env.xcall(contextId, fnBytes, params);
}

/**
 * Reads the serialized root state using the host interface.
 *
 * Falls back to the legacy storage key on older runtimes.
 */
export function readRootState(): Uint8Array | null {
  const host = env as unknown as { read_root_state?: (register: bigint) => number };
  if (typeof host.read_root_state === 'function') {
    const result = host.read_root_state(REGISTER_ID);
    if (!result) {
      return null;
    }

    const len = Number(env.register_len(REGISTER_ID));
    const buf = new Uint8Array(len);
    env.read_register(REGISTER_ID, buf);
    return buf;
  }

  throw new Error('read_root_state host function unavailable');
}

/**
 * Persists the serialized root state through the host interface.
 *
 * @param doc - Serialized root document
 * @param createdAt - Original creation timestamp
 * @param updatedAt - Last updated timestamp
 *
 * The Rust SDK updates Merkle state by invoking storage collections directly.
 * The JS SDK runs inside QuickJS and cannot touch the host storage index, so it
 * hands the serialized document back to the runtime via this call.
 */
export function persistRootState(doc: Uint8Array, createdAt: number, updatedAt: number): void {
  const host = env as unknown as {
    persist_root_state?: (doc: Uint8Array, createdAt: number, updatedAt: number) => void;
  };

  if (typeof host.persist_root_state !== 'function') {
    throw new Error('persist_root_state host function unavailable');
  }

  host.persist_root_state(doc, createdAt, updatedAt);
}

export function applyStorageDelta(delta: Uint8Array): void {
  const host = env as unknown as { apply_storage_delta?: (delta: Uint8Array) => void };

  if (typeof host.apply_storage_delta !== 'function') {
    throw new Error('apply_storage_delta host function unavailable');
  }

  host.apply_storage_delta(delta);
}

/**
 * Removes a value from storage
 *
 * @param key - Storage key
 * @returns true if key existed, false otherwise
 */
export function storageRemove(key: Uint8Array): boolean {
  const existed = Boolean(env.storage_remove(key, REGISTER_ID));
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

export function jsCrdtMapRemove(mapId: Uint8Array, key: Uint8Array, register: bigint): number {
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

export function jsCrdtVectorGet(vectorId: Uint8Array, index: number, register: bigint): number {
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
  if (typeof (env as unknown as { flush_delta?: unknown }).flush_delta !== 'function') {
    env.log_utf8(
      textEncoder.encode('[env] flush_delta missing on host, falling back to legacy commit')
    );
    env.commit(new Uint8Array(32), new Uint8Array(0));
    return true;
  }

  return Boolean(env.flush_delta());
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

/**
 * Announce a blob to peers inside the current context.
 *
 * @param blobId - Identifier produced by {@link blobClose}
 * @param targetContextId - Context to announce within (must match current context)
 * @returns true if the runtime accepted the announcement
 */
export function blobAnnounceToContext(blobId: Uint8Array, targetContextId: Uint8Array): boolean {
  if (blobId.length !== 32) {
    throw new Error('blobId must be exactly 32 bytes');
  }
  if (targetContextId.length !== 32) {
    throw new Error('targetContextId must be exactly 32 bytes');
  }

  if (typeof (env as HostEnv).blob_announce_to_context !== 'function') {
    throw new Error('blob_announce_to_context host function unavailable');
  }

  return Boolean(env.blob_announce_to_context(blobId, targetContextId));
}

/**
 * Fill the provided buffer with random bytes sourced from the host runtime.
 *
 * @param buffer - Target buffer to populate
 */
export function randomBytes(buffer: Uint8Array): void {
  if (!(buffer instanceof Uint8Array)) {
    throw new TypeError('randomBytes expects a Uint8Array buffer');
  }
  if (typeof (env as HostEnv).random_bytes !== 'function') {
    throw new Error('random_bytes host function unavailable');
  }
  env.random_bytes(buffer);
}
