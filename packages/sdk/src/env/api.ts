/**
 * Environment API
 *
 * Provides access to Calimero host functions for logging, storage,
 * context information, and more.
 */

import '../polyfills/text-encoding';

import { bytesToHex } from '../utils/hex';
import type { HostEnv } from './bindings';
import { getAbiManifest, getMethod } from '../abi/helpers';
import type { TypeRef, AbiManifest, ScalarType, Variant } from '../abi/types';
import { BorshReader } from '../borsh/decoder';
import { safeJsonStringify } from '../utils/safe-json';
import {
  REGISTER_ID,
  PUBLIC_KEY_LENGTH,
  CONTEXT_ID_LENGTH,
  APPLICATION_ID_LENGTH,
  BLOB_ID_LENGTH,
  MAX_ALIAS_LENGTH,
  ED25519_SIGNATURE_LENGTH,
} from '../constants';

// This will be provided by QuickJS runtime via builder.c
declare const env: HostEnv;

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
 * @param visited - WeakSet to track visited objects and prevent circular references
 */
function convertToJsonCompatible(
  value: unknown,
  typeRef: TypeRef,
  abi: AbiManifest,
  path: Set<object> = new Set()
): unknown {
  // Handle null/undefined
  if (value === null || value === undefined) {
    return null;
  }

  // Handle circular references for objects
  // Only mark as circular if object is in current path (ancestor chain), not just visited
  if (value !== null && typeof value === 'object') {
    if (path.has(value)) {
      // Object is in current path - this is a true circular reference
      return '[Circular]';
    }
    // Add to path before processing children
    path.add(value);
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

    // Handle bytes - convert to array of numbers for JSON
    if (scalarType === 'bytes') {
      if (value instanceof Uint8Array) {
        // Convert to array of numbers for JSON compatibility
        path.delete(value);
        return Array.from(value);
      }
    }

    // For other scalars, return as-is (JSON.stringify handles them)
    if (value !== null && typeof value === 'object') {
      path.delete(value);
    }
    return value;
  }

  // Handle option types
  if (typeRef.kind === 'option') {
    if (value === null || value === undefined) {
      return null;
    }
    if (value !== null && typeof value === 'object') {
      path.delete(value);
    }
    const result = convertToJsonCompatible(value, typeRef.inner!, abi, path);
    return result;
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
    const result = value.map(item => convertToJsonCompatible(item, innerType, abi, path));
    // Remove from path after processing (backtrack)
    if (value !== null && typeof value === 'object') {
      path.delete(value);
    }
    return result;
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
      result[jsonKey] = convertToJsonCompatible(val, typeRef.value!, abi, path);
    }
    // Remove from path after processing (backtrack)
    if (value !== null && typeof value === 'object') {
      path.delete(value);
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
    const result = items.map(item => convertToJsonCompatible(item, innerType, abi, path));
    // Remove from path after processing (backtrack)
    if (value !== null && typeof value === 'object') {
      path.delete(value);
    }
    return result;
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
        result[field.name] = convertToJsonCompatible(fieldValue, field.type, abi, path);
      }
      // Remove from path after processing (backtrack)
      if (value !== null && typeof value === 'object') {
        path.delete(value);
      }
      return result;
    }

    // Handle variant types
    if (typeDef.kind === 'variant' && typeDef.variants) {
      // Variants can be represented as objects with a discriminator OR as strings (for TypeScript enums)
      // If value is a string, convert it to the expected object format
      if (typeof value === 'string') {
        // Check if the string matches a variant name (case-insensitive)
        const matchingVariant = typeDef.variants.find(
          (v: Variant) => v.name.toLowerCase() === value.toLowerCase()
        );
        if (matchingVariant) {
          // Convert string enum to object format: { type: "VariantName" }
          // If variant has a payload, we can't convert from string alone
          if (matchingVariant.payload) {
            // Variant has payload - can't convert from string alone (consistent with abi-serialize.ts)
            throw new Error(
              `Cannot convert string enum value "${value}" for variant "${matchingVariant.name}" with payload. Variants with payload must be provided as objects.`
            );
          }
          // Unit variant - convert to object format
          return { type: matchingVariant.name };
        }
        // If no match found, throw an error for invalid enum values (consistent with dispatcher.ts)
        throw new Error(
          `Invalid variant value "${value}" for variant type ${typeName}. Valid variants: ${typeDef.variants.map(v => v.name).join(', ')}`
        );
      }
      // If it's an object, return as-is (variants are typically represented as objects with a discriminator)
      if (typeof value === 'object' && value !== null) {
        // Remove from path before returning (was added at line 204)
        path.delete(value);
        return value;
      }
      throw new Error(
        `Expected object or string for variant type ${typeName}, got ${typeof value}`
      );
    }

    // Handle alias types
    if (typeDef.kind === 'alias' && typeDef.target) {
      if (value !== null && typeof value === 'object') {
        path.delete(value);
      }
      const result = convertToJsonCompatible(value, typeDef.target, abi, path);
      return result;
    }
  }

  // Fallback: return value as-is (JSON.stringify will handle it)
  // Remove from path if it was added
  if (value !== null && typeof value === 'object') {
    path.delete(value);
  }
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

  // Handle string return types: distinguish pre-stringified JSON from plain strings
  const isStringType =
    method.returns.kind === 'string' ||
    (method.returns.kind === 'scalar' && method.returns.scalar === 'string');

  if (isStringType && typeof value === 'string') {
    const trimmed = value.trim();
    const looksLikeJson =
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'));

    if (looksLikeJson) {
      try {
        JSON.parse(value);
        // Valid JSON object/array - return as-is to avoid double-stringification
        env.value_return(textEncoder.encode(value));
        return;
      } catch {
        // Invalid JSON, fall through to normal stringify
      }
    }
    // Plain string - fall through to JSON.stringify
  }

  // Convert value to JSON-compatible format based on ABI type
  const jsonValue = convertToJsonCompatible(value, method.returns, abi);
  // Use safe JSON.stringify to handle all problematic types and circular references
  // This handles cases where values appear in nested structures or aren't properly
  // handled by convertToJsonCompatible
  const jsonString = safeJsonStringify(jsonValue);
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
 * Adds a member to the current context.
 * This is an asynchronous operation - the member is added after successful execution.
 *
 * @param publicKey - 32-byte Ed25519 public key of the member to add
 * @throws TypeError if publicKey is not 32 bytes
 *
 * @example
 * ```typescript
 * import { contextAddMember } from '@calimero-network/calimero-sdk-js/env';
 *
 * const memberKey = new Uint8Array(32); // Member's public key
 * contextAddMember(memberKey);
 * ```
 */
export function contextAddMember(publicKey: Uint8Array): void {
  if (!(publicKey instanceof Uint8Array)) {
    throw new TypeError('contextAddMember: publicKey must be a Uint8Array');
  }
  if (publicKey.length !== PUBLIC_KEY_LENGTH) {
    throw new RangeError(`contextAddMember: publicKey must be exactly ${PUBLIC_KEY_LENGTH} bytes`);
  }
  env.context_add_member(publicKey);
}

/**
 * Removes a member from the current context.
 * This is an asynchronous operation - the member is removed after successful execution.
 *
 * @param publicKey - 32-byte Ed25519 public key of the member to remove
 * @throws TypeError if publicKey is not 32 bytes
 *
 * @example
 * ```typescript
 * import { contextRemoveMember } from '@calimero-network/calimero-sdk-js/env';
 *
 * const memberKey = new Uint8Array(32); // Member's public key
 * contextRemoveMember(memberKey);
 * ```
 */
export function contextRemoveMember(publicKey: Uint8Array): void {
  if (!(publicKey instanceof Uint8Array)) {
    throw new TypeError('contextRemoveMember: publicKey must be a Uint8Array');
  }
  if (publicKey.length !== PUBLIC_KEY_LENGTH) {
    throw new RangeError(
      `contextRemoveMember: publicKey must be exactly ${PUBLIC_KEY_LENGTH} bytes`
    );
  }
  env.context_remove_member(publicKey);
}

/**
 * Checks if a public key is a member of the current context.
 * This is a synchronous read operation that queries the committed local state.
 *
 * @param publicKey - 32-byte Ed25519 public key to check
 * @returns true if the public key is a member, false otherwise
 * @throws TypeError if publicKey is not 32 bytes
 *
 * @example
 * ```typescript
 * import { contextIsMember } from '@calimero-network/calimero-sdk-js/env';
 *
 * const memberKey = new Uint8Array(32); // Member's public key
 * const isMember = contextIsMember(memberKey);
 * if (isMember) {
 *   console.log('User is a member');
 * }
 * ```
 */
export function contextIsMember(publicKey: Uint8Array): boolean {
  if (!(publicKey instanceof Uint8Array)) {
    throw new TypeError('contextIsMember: publicKey must be a Uint8Array');
  }
  if (publicKey.length !== PUBLIC_KEY_LENGTH) {
    throw new RangeError(`contextIsMember: publicKey must be exactly ${PUBLIC_KEY_LENGTH} bytes`);
  }
  return Boolean(env.context_is_member(publicKey));
}

/**
 * Gets all members of the current context.
 * This is a synchronous read operation that queries the committed local state.
 *
 * @returns Array of 32-byte public keys representing context members
 *
 * @example
 * ```typescript
 * import { contextMembers } from '@calimero-network/calimero-sdk-js/env';
 *
 * const members = contextMembers();
 * console.log(`Context has ${members.length} members`);
 * for (const memberKey of members) {
 *   console.log('Member:', bytesToHex(memberKey));
 * }
 * ```
 */
export function contextMembers(): Uint8Array[] {
  env.context_members(REGISTER_ID);
  const len = Number(env.register_len(REGISTER_ID));
  if (len === 0) {
    return [];
  }

  // Read the serialized array of public keys
  const buf = new Uint8Array(len);
  env.read_register(REGISTER_ID, buf);

  // Deserialize: Rust returns Vec<PublicKey> as Borsh-serialized
  // Format: u32 length + [32 bytes] for each PublicKey (fixed-size array, no length prefix)
  const reader = new BorshReader(buf);
  const count = reader.readU32();
  const members: Uint8Array[] = [];

  for (let i = 0; i < count; i++) {
    // PublicKey is [u8; 32] in Rust, which is serialized as 32 bytes directly (no length prefix)
    const keyBytes = reader.readFixedArray(PUBLIC_KEY_LENGTH);
    members.push(keyBytes);
  }

  return members;
}

/**
 * Creates a new child context with the specified protocol, application ID, initialization arguments, and alias.
 * This is an asynchronous operation - the context is created after successful execution.
 *
 * @param protocol - Protocol identifier (e.g., "near", "icp", "stellar")
 * @param applicationId - 32-byte application ID for the new context
 * @param initArgs - Initialization arguments as JSON bytes (typically '{}' for default)
 * @param alias - Alias string for the context (max 64 bytes)
 * @throws TypeError if parameters are invalid
 * @throws RangeError if alias is too long
 *
 * @example
 * ```typescript
 * import { contextCreate } from '@calimero-network/calimero-sdk-js/env';
 *
 * const protocol = new TextEncoder().encode('near');
 * const appId = new Uint8Array(32); // Application ID
 * const initArgs = new TextEncoder().encode('{}');
 * const alias = new TextEncoder().encode('my-context');
 * contextCreate(protocol, appId, initArgs, alias);
 * ```
 */
export function contextCreate(
  protocol: Uint8Array,
  applicationId: Uint8Array,
  initArgs: Uint8Array,
  alias: Uint8Array
): void {
  if (!(protocol instanceof Uint8Array)) {
    throw new TypeError('contextCreate: protocol must be a Uint8Array');
  }
  if (!(applicationId instanceof Uint8Array)) {
    throw new TypeError('contextCreate: applicationId must be a Uint8Array');
  }
  if (applicationId.length !== APPLICATION_ID_LENGTH) {
    throw new RangeError(
      `contextCreate: applicationId must be exactly ${APPLICATION_ID_LENGTH} bytes`
    );
  }
  if (!(initArgs instanceof Uint8Array)) {
    throw new TypeError('contextCreate: initArgs must be a Uint8Array');
  }
  if (!(alias instanceof Uint8Array)) {
    throw new TypeError('contextCreate: alias must be a Uint8Array');
  }
  if (alias.length > MAX_ALIAS_LENGTH) {
    throw new RangeError(`contextCreate: alias must be at most ${MAX_ALIAS_LENGTH} bytes`);
  }
  env.context_create(protocol, applicationId, initArgs, alias);
}

/**
 * Deletes a context.
 * This is an asynchronous operation - the context is deleted after successful execution.
 *
 * @param contextId - 32-byte context ID to delete. Pass the current context ID for self-deletion.
 * @throws TypeError if contextId is not 32 bytes
 *
 * @example
 * ```typescript
 * import { contextDelete, contextId } from '@calimero-network/calimero-sdk-js/env';
 *
 * // Self-delete (delete current context)
 * const currentId = contextId();
 * contextDelete(currentId);
 * ```
 */
export function contextDelete(contextId: Uint8Array): void {
  if (!(contextId instanceof Uint8Array)) {
    throw new TypeError('contextDelete: contextId must be a Uint8Array');
  }
  if (contextId.length !== CONTEXT_ID_LENGTH) {
    throw new RangeError(`contextDelete: contextId must be exactly ${CONTEXT_ID_LENGTH} bytes`);
  }
  env.context_delete(contextId);
}

/**
 * Resolves a context alias to a context ID.
 * This is a synchronous read operation.
 *
 * @param alias - Alias string to resolve
 * @returns 32-byte context ID if alias exists, null otherwise
 *
 * @example
 * ```typescript
 * import { contextResolveAlias } from '@calimero-network/calimero-sdk-js/env';
 *
 * const alias = new TextEncoder().encode('my-context');
 * const contextId = contextResolveAlias(alias);
 * if (contextId) {
 *   console.log('Resolved context ID:', bytesToHex(contextId));
 * }
 * ```
 */
export function contextResolveAlias(alias: Uint8Array): Uint8Array | null {
  if (!(alias instanceof Uint8Array)) {
    throw new TypeError('contextResolveAlias: alias must be a Uint8Array');
  }
  const found = env.context_resolve_alias(alias, REGISTER_ID);
  if (found === 0) {
    return null;
  }
  const len = Number(env.register_len(REGISTER_ID));
  if (len === 0) {
    return null;
  }
  const buf = new Uint8Array(len);
  env.read_register(REGISTER_ID, buf);
  // Context ID is CONTEXT_ID_LENGTH bytes
  if (buf.length === CONTEXT_ID_LENGTH) {
    return buf;
  }
  return null;
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
  if (contextId.length !== CONTEXT_ID_LENGTH) {
    throw new Error(`contextId must be exactly ${CONTEXT_ID_LENGTH} bytes`);
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

export function jsUserStorageNew(register: bigint): number {
  return env.js_user_storage_new(register);
}

export function jsUserStorageInsert(
  storageId: Uint8Array,
  value: Uint8Array,
  register: bigint
): number {
  return env.js_user_storage_insert(storageId, value, register);
}

export function jsUserStorageGet(storageId: Uint8Array, register: bigint): number {
  return env.js_user_storage_get(storageId, register);
}

export function jsUserStorageGetForUser(
  storageId: Uint8Array,
  userKey: Uint8Array,
  register: bigint
): number {
  return env.js_user_storage_get_for_user(storageId, userKey, register);
}

export function jsUserStorageRemove(storageId: Uint8Array, register: bigint): number {
  return env.js_user_storage_remove(storageId, register);
}

export function jsUserStorageContains(storageId: Uint8Array): number {
  return env.js_user_storage_contains(storageId);
}

export function jsUserStorageContainsUser(storageId: Uint8Array, userKey: Uint8Array): number {
  return env.js_user_storage_contains_user(storageId, userKey);
}

export function jsFrozenStorageNew(register: bigint): number {
  return env.js_frozen_storage_new(register);
}

export function jsFrozenStorageAdd(
  storageId: Uint8Array,
  value: Uint8Array,
  register: bigint
): number {
  return env.js_frozen_storage_add(storageId, value, register);
}

export function jsFrozenStorageGet(
  storageId: Uint8Array,
  hash: Uint8Array,
  register: bigint
): number {
  return env.js_frozen_storage_get(storageId, hash, register);
}

export function jsFrozenStorageContains(storageId: Uint8Array, hash: Uint8Array): number {
  return env.js_frozen_storage_contains(storageId, hash);
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
    env.commit(new Uint8Array(CONTEXT_ID_LENGTH), new Uint8Array(0));
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
  const blobId = new Uint8Array(BLOB_ID_LENGTH);
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
  if (blobId.length !== BLOB_ID_LENGTH) {
    throw new Error(`blobId must be exactly ${BLOB_ID_LENGTH} bytes`);
  }
  if (targetContextId.length !== CONTEXT_ID_LENGTH) {
    throw new Error(`targetContextId must be exactly ${CONTEXT_ID_LENGTH} bytes`);
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

/**
 * Verifies an Ed25519 signature.
 *
 * @param signature - The 64-byte Ed25519 signature
 * @param publicKey - The 32-byte Ed25519 public key
 * @param message - The message that was signed
 * @returns true if the signature is valid, false otherwise
 *
 * @example
 * ```typescript
 * import { ed25519Verify } from '@calimero-network/calimero-sdk-js/env';
 *
 * const signature = new Uint8Array(64); // 64-byte signature
 * const publicKey = new Uint8Array(32); // 32-byte public key
 * const message = new TextEncoder().encode('Hello, World!');
 *
 * const isValid = ed25519Verify(signature, publicKey, message);
 * if (!isValid) {
 *   throw new Error('Invalid signature');
 * }
 * ```
 */
export function ed25519Verify(
  signature: Uint8Array,
  publicKey: Uint8Array,
  message: Uint8Array
): boolean {
  if (!(signature instanceof Uint8Array)) {
    throw new TypeError('ed25519Verify: signature must be a Uint8Array');
  }
  if (signature.length !== ED25519_SIGNATURE_LENGTH) {
    throw new RangeError(
      `ed25519Verify: signature must be exactly ${ED25519_SIGNATURE_LENGTH} bytes`
    );
  }
  if (!(publicKey instanceof Uint8Array)) {
    throw new TypeError('ed25519Verify: publicKey must be a Uint8Array');
  }
  if (publicKey.length !== PUBLIC_KEY_LENGTH) {
    throw new RangeError(`ed25519Verify: publicKey must be exactly ${PUBLIC_KEY_LENGTH} bytes`);
  }
  if (!(message instanceof Uint8Array)) {
    throw new TypeError('ed25519Verify: message must be a Uint8Array');
  }
  if (typeof (env as HostEnv).ed25519_verify !== 'function') {
    throw new Error('ed25519_verify host function unavailable');
  }

  return Boolean(env.ed25519_verify(signature, publicKey, message));
}
