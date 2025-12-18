/**
 * FrozenStorage - Immutable, content-addressable storage collection.
 *
 * Data is keyed by the SHA256 hash of its serialized value, ensuring
 * content-addressability. Values are immutable once inserted - updates
 * and deletes are forbidden.
 *
 * Internally implemented as UnorderedMap<Hash, FrozenValue<T>> with StorageType::Frozen.
 */

import { serialize, deserialize } from '../utils/serialize';
import { sha256 } from '../utils/sha256';
import { BorshWriter } from '../borsh/encoder';
import * as env from '../env/api';
import { mapNew, mapGet, mapInsert, mapContains, mapEntries } from '../runtime/storage-wasm';
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
      try {
        this.mapId = mapNew();
      } catch (error) {
        const message = `[collections::FrozenStorage] mapNew failed: ${error instanceof Error ? error.message : String(error)}`;
        env.log(message);
        env.panic(message);
      }
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
    // Serialize the value using pure Borsh format (no ValueKind tags) 
    const valueBytes = serializeBorshForHash(value);
    const hash = sha256(valueBytes);

    // Wrap in FrozenValue for immutability semantics
    const frozenValue = new FrozenValue(value);
    const frozenValueBytes = serialize(frozenValue);

    // Insert using hash as key
    mapInsert(this.mapId, hash, frozenValueBytes);

    // Register nested collections if applicable
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

    const raw = mapGet(this.mapId, hash);
    if (!raw) {
      return null;
    }

    const frozenValue = deserialize<FrozenValue<T>>(raw);
    // Handle both class instances and plain objects from deserialization
    if (frozenValue && typeof frozenValue === 'object') {
      if (frozenValue instanceof FrozenValue) {
        return frozenValue.value;
      }
      // Handle plain object deserialization
      if ('value' in frozenValue) {
        return (frozenValue as { value: T }).value;
      }
    }
    return null;
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

    return mapContains(this.mapId, hash);
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
      const frozenValue = deserialize<FrozenValue<T>>(valueBytes);
      let value: T;
      if (frozenValue instanceof FrozenValue) {
        value = frozenValue.value;
      } else if (frozenValue && typeof frozenValue === 'object' && 'value' in frozenValue) {
        value = (frozenValue as { value: T }).value;
      } else {
        value = frozenValue as unknown as T;
      }
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
    return sha256(valueBytes);
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
 * Serializes a value using pure Borsh format (no ValueKind tags) to match Rust's borsh::to_vec.
 * This is used for computing hashes in FrozenStorage to ensure compatibility with Rust SDK.
 *
 * Rust serializes: borsh::to_vec(&value) then Sha256::digest(&data_bytes)
 * This function produces the same bytes as borsh::to_vec for primitive types.
 */
function serializeBorshForHash<T>(value: T): Uint8Array {
  const writer = new BorshWriter();

  // Handle primitive types using pure Borsh format (matching Rust)
  if (typeof value === 'string') {
    // Borsh string: u32 length + UTF-8 bytes
    writer.writeString(value);
  } else if (typeof value === 'number') {
    // For numbers, we need to determine the type. Default to f64 for now.
    // In practice, Rust would use a specific integer type, but for hash compatibility
    // we'll use f64 as a reasonable default.
    writer.writeF64(value);
  } else if (typeof value === 'boolean') {
    // Borsh bool: u8 (0 or 1)
    writer.writeU8(value ? 1 : 0);
  } else if (value instanceof Uint8Array) {
    // Borsh bytes: u32 length + bytes
    writer.writeBytes(value);
  } else if (value === null || value === undefined) {
    // For null/undefined, we can't serialize in pure Borsh without type info
    // This shouldn't happen for FrozenStorage, but handle gracefully
    throw new Error('Cannot serialize null/undefined for hash computation');
  } else {
    // For complex types, fall back to regular serialize (with ValueKind)
    // This maintains compatibility for complex nested structures
    // Note: This may produce different hashes than Rust for complex types
    return serialize(value);
  }

  return writer.toBytes();
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

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

registerCollectionType('FrozenStorage', (snapshot: CollectionSnapshot) =>
  FrozenStorage.fromId(snapshot.id)
);
