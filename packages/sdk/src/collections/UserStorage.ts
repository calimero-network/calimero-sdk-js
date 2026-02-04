/**
 * UserStorage - User-owned, signed storage collection.
 *
 * Provides a per-user key-value store where keys are PublicKeys (32-byte identifiers).
 * Data written by a user is owned and verifiably signed by that user.
 *
 * Under the hood, this is implemented as an UnorderedMap<PublicKey, T> with StorageType::User.
 * When actions are created, Calimero Core's storage layer automatically:
 * - Signs the action with the executor's identity private key
 * - Embeds a signature and nonce in the action metadata
 * - Verifies signatures on other nodes before applying actions
 * - Enforces replay protection by checking nonces are strictly increasing
 *
 * This SDK implementation provides the TypeScript API. The security features
 * (signature verification and replay protection) are automatically enforced by
 * Calimero Core's storage layer when processing UserStorage actions.
 */

import { serialize, deserialize } from '../utils/serialize';
import * as env from '../env/api';
import {
  userStorageNew,
  userStorageGet,
  userStorageGetForUser,
  userStorageInsert,
  userStorageRemove,
  userStorageContains,
  userStorageContainsUser,
  mapEntries,
} from '../runtime/storage-wasm';
import {
  registerCollectionType,
  CollectionSnapshot,
  hasRegisteredCollection,
} from '../runtime/collections';
import { mergeMergeableValues } from '../runtime/mergeable';
import { getMergeableType } from '../runtime/mergeable-registry';
import { nestedTracker } from '../runtime/nested-tracking';
import { StorageError, ValidationError } from '../errors';

const SENTINEL_KEY = '__calimeroCollection';
const PUBLIC_KEY_LENGTH = 32;

/**
 * Type alias for a PublicKey - a 32-byte Uint8Array representing a user's identity.
 */
export type PublicKey = Uint8Array;

export interface UserStorageOptions {
  /**
   * Existing storage identifier as a 32-byte Uint8Array or 64-character hex string.
   */
  id?: Uint8Array | string;
}

/**
 * UserStorage provides per-user, key-value storage.
 *
 * Keys are PublicKeys (32-byte identifiers), and values are user-owned data.
 * The current executor can only insert data for their own PublicKey.
 *
 * @example
 * ```typescript
 * import { UserStorage, createUserStorage } from '@calimero-network/calimero-sdk-js/collections';
 * import { executorId } from '@calimero-network/calimero-sdk-js/env';
 *
 * interface UserProfile {
 *   displayName: string;
 *   bio: string;
 * }
 *
 * const profiles = createUserStorage<UserProfile>();
 *
 * // Insert data for the current user
 * profiles.insert({ displayName: 'Alice', bio: 'Hello!' });
 *
 * // Read current user's data
 * const myProfile = profiles.get();
 *
 * // Read any user's data
 * const otherProfile = profiles.getForUser(somePublicKey);
 * ```
 */
export class UserStorage<V> {
  private readonly mapId: Uint8Array;

  constructor(options: UserStorageOptions = {}) {
    if (options.id) {
      this.mapId = normalizeMapId(options.id);
    } else {
      // userStorageNew() will throw an error if it fails (via decodeError)
      // No need for try-catch - let the error propagate naturally
      this.mapId = userStorageNew();
    }

    // Register with nested tracker for automatic change propagation
    nestedTracker.registerCollection(this);
  }

  static fromId<V>(id: Uint8Array | string): UserStorage<V> {
    return new UserStorage<V>({ id });
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
   * Inserts or updates data for the current executor.
   *
   * This is the primary way to write to UserStorage. The key is automatically
   * set to the current executor's PublicKey.
   *
   * @param value - The value to store
   * @returns The previous value if it existed, null otherwise
   */
  insert(value: V): V | null {
    const executorKey = env.executorId();
    return this.setInternal(executorKey, value);
  }

  /**
   * Gets data for the current executor.
   *
   * @returns The current user's stored value, or null if not found
   */
  get(): V | null {
    const raw = userStorageGet(this.mapId);
    if (!raw) return null;

    const executorKey = env.executorId();
    const value = deserialize<V>(raw);

    // Re-register nested collections with parent relationship when retrieving
    if (hasRegisteredCollection(value)) {
      nestedTracker.registerCollection(value, this, executorKey);
    }

    return value;
  }

  /**
   * Gets data for a specific user by their PublicKey.
   *
   * @param userKey - The 32-byte PublicKey of the user
   * @returns The user's stored value, or null if not found
   */
  getForUser(userKey: PublicKey): V | null {
    validatePublicKey(userKey, 'getForUser');
    const raw = userStorageGetForUser(this.mapId, userKey);
    if (!raw) return null;

    const value = deserialize<V>(raw);

    // Re-register nested collections with parent relationship when retrieving
    // This is necessary because deserialization creates new instances that lose
    // their parent-child relationship with UserStorage
    if (hasRegisteredCollection(value)) {
      nestedTracker.registerCollection(value, this, userKey);
    }

    return value;
  }

  /**
   * Checks if data exists for the current executor.
   *
   * @returns true if the current user has stored data
   */
  containsCurrentUser(): boolean {
    return userStorageContains(this.mapId);
  }

  /**
   * Checks if data exists for a specific user.
   *
   * @param userKey - The 32-byte PublicKey of the user
   * @returns true if the user has stored data
   */
  containsUser(userKey: PublicKey): boolean {
    validatePublicKey(userKey, 'containsUser');
    return userStorageContainsUser(this.mapId, userKey);
  }

  /**
   * Sets data for a specific user by their PublicKey.
   *
   * This method is primarily used internally by the nested collection tracking system
   * to propagate changes to nested collections. However, it can only be used for the
   * current executor's data - nested collections belonging to other users (accessed
   * via `getForUser()`) are read-only and cannot be modified.
   *
   * @param userKey - The 32-byte PublicKey of the user (must match current executor)
   * @param value - The value to store
   * @returns The previous value if it existed, null otherwise
   * @throws Error if userKey does not match the current executor
   */
  setForUser(userKey: PublicKey, value: V): V | null {
    return this.setInternal(userKey, value);
  }

  /**
   * Removes data for the current executor.
   *
   * @returns The previous value if it existed, null otherwise
   */
  remove(): V | null {
    const raw = userStorageRemove(this.mapId);
    nestedTracker.notifyCollectionModified(this);
    return raw ? deserialize<V>(raw) : null;
  }

  /**
   * Returns all entries as an array of [PublicKey, Value] tuples.
   */
  entries(): Array<[PublicKey, V]> {
    const serializedEntries = mapEntries(this.mapId);
    return serializedEntries.map(([keyBytes, valueBytes]) => [
      deserialize<PublicKey>(keyBytes),
      deserialize<V>(valueBytes),
    ]);
  }

  /**
   * Returns all PublicKeys that have stored data.
   */
  keys(): PublicKey[] {
    return this.entries().map(([key]) => key);
  }

  /**
   * Returns all stored values.
   */
  values(): V[] {
    return this.entries().map(([, value]) => value);
  }

  /**
   * Returns the number of users with stored data.
   */
  size(): number {
    return this.entries().length;
  }

  toJSON(): Record<string, unknown> {
    return {
      [SENTINEL_KEY]: 'UserStorage',
      id: this.id(),
    };
  }

  private setInternal(key: PublicKey, value: V): V | null {
    validatePublicKey(key, 'insert');
    const executorKey = env.executorId();

    // Only allow setting for the current executor
    // The nested tracker's setForUser should only be called for the current executor
    if (key.length !== executorKey.length || !key.every((byte, i) => byte === executorKey[i])) {
      throw StorageError.operationForbidden(
        'UserStorage.setInternal',
        'can only set data for the current executor'
      );
    }

    let nextValue = value;

    const mergeableType = getMergeableType(value);
    if (mergeableType) {
      const current = this.get();
      if (current) {
        nextValue = mergeMergeableValues(current, value);
      }
    }

    const valueBytes = serialize(nextValue);
    const previous = userStorageInsert(this.mapId, valueBytes);

    // Register nested collections for automatic tracking after storage
    if (hasRegisteredCollection(nextValue)) {
      nestedTracker.registerCollection(nextValue, this, executorKey);
    }

    // Notify tracker of modification
    nestedTracker.notifyCollectionModified(this);

    return previous ? deserialize<V>(previous) : null;
  }
}

function validatePublicKey(key: unknown, operation: string): asserts key is PublicKey {
  if (!(key instanceof Uint8Array)) {
    throw ValidationError.invalidType(
      `UserStorage.${operation} key`,
      'Uint8Array (PublicKey)',
      typeof key
    );
  }
  if (key.length !== PUBLIC_KEY_LENGTH) {
    throw ValidationError.outOfRange(
      `UserStorage.${operation} key`,
      `must be exactly ${PUBLIC_KEY_LENGTH} bytes`,
      key.length
    );
  }
}

function normalizeMapId(id: Uint8Array | string): Uint8Array {
  if (id instanceof Uint8Array) {
    if (id.length !== 32) {
      throw StorageError.invalidId('UserStorage', 'id must be 32 bytes', {
        actualLength: id.length,
        expectedLength: 32,
      });
    }
    return new Uint8Array(id);
  }

  const cleaned = id.trim().toLowerCase();
  if (cleaned.length !== 64 || !/^[0-9a-f]+$/.test(cleaned)) {
    throw ValidationError.invalidFormat(
      'UserStorage id',
      '64 hexadecimal characters',
      `got ${cleaned.length} characters`
    );
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

registerCollectionType('UserStorage', (snapshot: CollectionSnapshot) =>
  UserStorage.fromId(snapshot.id)
);
