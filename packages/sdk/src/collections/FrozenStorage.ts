/**
 * FrozenStorage - Immutable, content-addressable storage collection.
 *
 * Data is keyed by the SHA256 hash of its serialized value, ensuring
 * content-addressability. Values are immutable once inserted - updates
 * and deletes are forbidden.
 *
 * Internally implemented as UnorderedMap<Hash, FrozenValue<T>> with StorageType::Frozen.
 */

import { serialize } from '../utils/serialize';
import { bytesToHex, hexToBytes } from '../utils/hex';
import { sha256 } from '../utils/sha256';
import { BorshWriter } from '../borsh/encoder';
import { deserializeBorshWithFallback } from '../utils/borsh-value';
import {
  frozenStorageNew,
  frozenStorageAdd,
  frozenStorageGet,
  frozenStorageContains,
  mapEntries,
} from '../runtime/storage-wasm';
import {
  registerCollectionType,
  CollectionSnapshot,
  hasRegisteredCollection,
} from '../runtime/collections';
import { nestedTracker } from '../runtime/nested-tracking';

const SENTINEL_KEY = '__calimeroCollection';

/** 32-byte SHA256 hash used as keys in FrozenStorage */
export type Hash = Uint8Array;

export interface FrozenStorageOptions {
  /**
   * Existing storage identifier as a 32-byte Uint8Array or 64-character hex string.
   */
  id?: Uint8Array | string;
}

/**
 * A wrapper for frozen (immutable) values.
 *
 * This type implements an empty merge operation, satisfying CRDT trait
 * bounds for values that cannot be changed after insertion.
 */
export class FrozenValue<T> {
  constructor(public readonly value: T) {}

  /**
   * Merging a frozen value does nothing - the value is immutable.
   */
  merge(_other: FrozenValue<T>): FrozenValue<T> {
    // Do nothing - frozen values are immutable
    return this;
  }

  toJSON(): { __frozenValue: true; value: T } {
    return {
      __frozenValue: true,
      value: this.value,
    };
  }

  static fromJSON<T>(data: { __frozenValue: true; value: T }): FrozenValue<T> {
    return new FrozenValue(data.value);
  }
}

/**
 * FrozenStorage provides immutable, content-addressable storage.
 *
 * - Values are keyed by the SHA256 hash of their serialized content
 * - Once inserted, values cannot be updated or deleted
 * - Ideal for storing immutable data like documents, certificates, or audit logs
 *
 * @example
 * ```typescript
 * import { FrozenStorage } from '@calimero-network/calimero-sdk';
 *
 * const storage = new FrozenStorage<string>();
 *
 * // Insert a value - returns its content hash
 * const hash = storage.add('Hello, World!');
 *
 * // Retrieve by hash
 * const value = storage.get(hash); // 'Hello, World!'
 *
 * // Attempting to remove will throw an error
 * // storage.remove(hash); // Error: FrozenStorage does not support remove
 * ```
 */
export class FrozenStorage<T> {
  private readonly mapId: Uint8Array;

  constructor(options: FrozenStorageOptions = {}) {
    if (options.id) {
      this.mapId = normalizeMapId(options.id);
    } else {
      // frozenStorageNew() will throw an error if it fails (via decodeError)
      // No need for try-catch - let the error propagate naturally
      this.mapId = frozenStorageNew();
    }

    nestedTracker.registerCollection(this);
  }

  static fromId<T>(id: Uint8Array | string): FrozenStorage<T> {
    return new FrozenStorage<T>({ id });
  }

  /**
   * Returns the underlying storage identifier as a hex string.
   */
  id(): string {
    return bytesToHex(this.mapId);
  }

  /**
   * Returns a copy of the storage identifier bytes.
   */
  idBytes(): Uint8Array {
    return new Uint8Array(this.mapId);
  }

  /**
   * Adds a value to frozen storage.
   *
   * The value is serialized and its SHA256 hash is computed. The hash
   * becomes the key in the underlying map. This operation is idempotent -
   * adding the same value twice will produce the same hash and not create
   * duplicates.
   *
   * @param value - The value to store
   * @returns The 32-byte SHA256 hash (key) of the stored value
   */
  add(value: T): Hash {
    const valueBytes = serializeBorshForHash(value);

    const hash = frozenStorageAdd(this.mapId, valueBytes);

    if (hasRegisteredCollection(value)) {
      nestedTracker.registerCollection(value, this, hash);
    }
    nestedTracker.notifyCollectionModified(this);

    return new Uint8Array(hash);
  }

  /**
   * Retrieves a value from frozen storage by its hash.
   *
   * @param hash - The 32-byte SHA256 hash (key) of the value
   * @returns The stored value, or null if not found
   */
  get(hash: Hash): T | null {
    if (!(hash instanceof Uint8Array) || hash.length !== 32) {
      throw new TypeError('FrozenStorage hash must be a 32-byte Uint8Array');
    }

    const raw = frozenStorageGet(this.mapId, hash);
    if (!raw) {
      return null;
    }

    return deserializeBorshWithFallback<T>(raw);
  }

  /**
   * Checks if a hash exists in frozen storage.
   *
   * @param hash - The 32-byte SHA256 hash to check
   * @returns true if the hash exists, false otherwise
   */
  has(hash: Hash): boolean {
    if (!(hash instanceof Uint8Array) || hash.length !== 32) {
      throw new TypeError('FrozenStorage hash must be a 32-byte Uint8Array');
    }

    return frozenStorageContains(this.mapId, hash);
  }

  /**
   * FrozenStorage does not support remove operations.
   * Calling this method will throw an error.
   *
   * @throws Error always - frozen storage is immutable
   */
  remove(_hash: Hash): never {
    throw new Error('FrozenStorage does not support remove operations - data is immutable');
  }

  /**
   * Returns all entries in frozen storage.
   *
   * @returns Array of [hash, value] pairs
   */
  entries(): Array<[Hash, T]> {
    const serializedEntries = mapEntries(this.mapId);
    return serializedEntries.map(([hashBytes, valueBytes]) => {
      const value = deserializeBorshWithFallback<T>(valueBytes);
      return [new Uint8Array(hashBytes), value];
    });
  }

  /**
   * Returns all hashes in frozen storage.
   */
  hashes(): Hash[] {
    return this.entries().map(([hash]) => hash);
  }

  /**
   * Returns all values in frozen storage.
   */
  values(): T[] {
    return this.entries().map(([, value]) => value);
  }

  /**
   * Computes the hash of a value without storing it.
   *
   * Useful for checking if a value exists before adding it,
   * or for computing hashes for external use.
   *
   * @param value - The value to hash
   * @returns The 32-byte SHA256 hash
   */
  static computeHash<T>(value: T): Hash {
    const valueBytes = serializeBorshForHash(value);
    const writer = new BorshWriter();
    writer.writeU32(valueBytes.length);
    const lengthPrefix = new Uint8Array(writer.toBytes());
    const combined = new Uint8Array(lengthPrefix.length + valueBytes.length);
    combined.set(lengthPrefix, 0);
    combined.set(valueBytes, lengthPrefix.length);
    return sha256(combined);
  }

  toJSON(): Record<string, unknown> {
    return {
      [SENTINEL_KEY]: 'FrozenStorage',
      id: this.id(),
    };
  }
}

// Helper functions

/**
 * Serializes a value for hash computation. Rust receives Vec<u8> and does borsh::to_vec(&value),
 * so we send raw bytes that Rust will serialize as u32 length + bytes.
 */
function serializeBorshForHash<T>(value: T): Uint8Array {
  // For strings, send raw UTF-8 bytes (Rust serializes Vec<u8> as u32 length + bytes)
  if (typeof value === 'string') {
    return new TextEncoder().encode(value);
  }
  // For Uint8Array, send raw bytes
  if (value instanceof Uint8Array) {
    return value;
  }
  // For numbers, serialize as Borsh f64 (8 bytes)
  if (typeof value === 'number') {
    const writer = new BorshWriter();
    writer.writeF64(value);
    return writer.toBytes();
  }
  // For booleans, serialize as Borsh u8 (1 byte)
  if (typeof value === 'boolean') {
    const writer = new BorshWriter();
    writer.writeU8(value ? 1 : 0);
    return writer.toBytes();
  }
  if (value === null || value === undefined) {
    throw new Error('Cannot serialize null/undefined for hash computation');
  }

  // For complex types, fall back to regular serialize (with ValueKind)
  return serialize(value);
}

function normalizeMapId(id: Uint8Array | string): Uint8Array {
  if (id instanceof Uint8Array) {
    if (id.length !== 32) {
      throw new TypeError('Storage id must be 32 bytes');
    }
    return new Uint8Array(id);
  }

  const cleaned = id.trim().toLowerCase();
  if (cleaned.length !== 64 || !/^[0-9a-f]+$/.test(cleaned)) {
    throw new TypeError('Storage id hex string must be 64 hexadecimal characters');
  }
  return hexToBytes(cleaned);
}

registerCollectionType('FrozenStorage', (snapshot: CollectionSnapshot) =>
  FrozenStorage.fromId(snapshot.id)
);
