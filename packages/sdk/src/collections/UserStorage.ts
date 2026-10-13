/**
 * UserStorage - User-owned, signed storage collection.
 *
 * Provides a per-user key-value store keyed by the 32-byte account id (`env.accountId()`).
 * Data written by a user is owned and verifiably signed by that user.
 *
 * Under the hood, this is implemented as an UnorderedMap<PublicKey, T> with StorageType::User.
 * When actions are created, Calimero Core's storage layer automatically:
 * - Signs the action with the executing device's identity private key
 * - Embeds a signature and nonce in the action metadata
 * - Verifies signatures on other nodes before applying actions
 * - Enforces replay protection by checking nonces are strictly increasing
 *
 * This SDK implementation provides the TypeScript API. The security features
 * (signature verification and replay protection) are automatically enforced by
 * Calimero Core's storage layer when processing UserStorage actions.
 */

import { serialize, deserialize } from '../utils/serialize';
import { bytesToHex, normalizeCollectionId } from '../utils/hex';
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

const SENTINEL_KEY = '__calimeroCollection';
const PUBLIC_KEY_LENGTH = 32;

/**
 * Alias for the 32-byte key of a user entry: the account id (`env.accountId()`).
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
 * Keys are 32-byte account ids, and values are user-owned data.
 * The current account can only insert data for its own id.
 *
 * @example
 * ```typescript
 * import { UserStorage, createUserStorage } from '@calimero-network/calimero-sdk-js/collections';
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
 * const otherProfile = profiles.getForUser(someAccountId);
 * ```
 */
export class UserStorage<V> {
  private readonly mapId: Uint8Array;

  constructor(options: UserStorageOptions = {}) {
    if (options.id) {
      this.mapId = normalizeCollectionId(options.id, 'UserStorage');
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
   * Inserts or updates data for the current account.
   *
   * This is the primary way to write to UserStorage. The key is automatically
   * set to the current account id.
   *
   * @param value - The value to store
   * @returns The previous value if it existed, null otherwise
   */
  insert(value: V): V | null {
    const accountKey = env.accountId();
    return this.setInternal(accountKey, value);
  }

  /**
   * Gets data for the current account.
   *
   * @returns The current user's stored value, or null if not found
   */
  get(): V | null {
    const raw = userStorageGet(this.mapId);
    if (!raw) return null;

    const accountKey = env.accountId();
    const value = deserialize<V>(raw);

    // Re-register nested collections with parent relationship when retrieving
    if (hasRegisteredCollection(value)) {
      nestedTracker.registerCollection(value, this, accountKey);
    }

    return value;
  }

  /**
   * Gets data for a specific user by their account id.
   *
   * @param userKey - The 32-byte account id of the user
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
   * Checks if data exists for the current account.
   *
   * @returns true if the current user has stored data
   */
  containsCurrentUser(): boolean {
    return userStorageContains(this.mapId);
  }

  /**
   * Checks if data exists for a specific user.
   *
   * @param userKey - The 32-byte account id of the user
   * @returns true if the user has stored data
   */
  containsUser(userKey: PublicKey): boolean {
    validatePublicKey(userKey, 'containsUser');
    return userStorageContainsUser(this.mapId, userKey);
  }

  /**
   * Sets data for a specific user by their account id.
   *
   * This method is primarily used internally by the nested collection tracking system
   * to propagate changes to nested collections. However, it can only be used for the
   * current account's data - nested collections belonging to other users (accessed
   * via `getForUser()`) are read-only and cannot be modified.
   *
   * @param userKey - The 32-byte account id of the user (must match the current account)
   * @param value - The value to store
   * @returns The previous value if it existed, null otherwise
   * @throws Error if userKey does not match the current account
   */
  setForUser(userKey: PublicKey, value: V): V | null {
    return this.setInternal(userKey, value);
  }

  /**
   * Removes data for the current account.
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
   * Returns all account ids that have stored data.
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
    const accountKey = env.accountId();

    // Only the current account's slot is writable; nested tracking relies on it.
    if (key.length !== accountKey.length || !key.every((byte, i) => byte === accountKey[i])) {
      throw new Error('UserStorage.setInternal: can only set data for the current account');
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
      nestedTracker.registerCollection(nextValue, this, accountKey);
    }

    // Notify tracker of modification
    nestedTracker.notifyCollectionModified(this);

    return previous ? deserialize<V>(previous) : null;
  }
}

function validatePublicKey(key: unknown, operation: string): asserts key is PublicKey {
  if (!(key instanceof Uint8Array)) {
    throw new TypeError(`UserStorage.${operation}: key must be a Uint8Array (PublicKey)`);
  }
  if (key.length !== PUBLIC_KEY_LENGTH) {
    throw new RangeError(
      `UserStorage.${operation}: key must be exactly ${PUBLIC_KEY_LENGTH} bytes (got ${key.length})`
    );
  }
}

registerCollectionType('UserStorage', (snapshot: CollectionSnapshot) =>
  UserStorage.fromId(snapshot.id)
);
