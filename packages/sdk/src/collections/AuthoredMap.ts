/**
 * AuthoredMap - attributed map CRDT backed by the Rust `JsAuthoredMap` via
 * storage-wasm. Each entry records the executor that created it as its owner.
 *
 * The logical shape mirrors {@link UnorderedMap}; the difference is authorship:
 *  - `insert` (and `set` for a new key) stamps the current executor as the
 *    entry owner — no extra arguments.
 *  - `update`, `set` on an existing key, and `remove` are **owner-only**: the
 *    host returns `ActionNotAllowed` (surfaced as a thrown error) when the
 *    current executor is not the entry owner.
 *  - `ownerOf(key)` returns the 32-byte owner public key (or `null` when the
 *    key is absent); `ownedByMe(key)` reports whether the executor owns it.
 */

import { serialize, deserialize } from '../utils/serialize';
import { bytesToHex, normalizeCollectionId } from '../utils/hex';
import * as env from '../env/api';
import {
  authoredMapNew,
  authoredMapGet,
  authoredMapInsert,
  authoredMapUpdate,
  authoredMapRemove,
  authoredMapContains,
  authoredMapOwnerOf,
  authoredMapOwnedByMe,
  authoredMapEntries,
} from '../runtime/storage-wasm';
import {
  registerCollectionType,
  CollectionSnapshot,
  hasRegisteredCollection,
} from '../runtime/collections';
import { nestedTracker } from '../runtime/nested-tracking';

const SENTINEL_KEY = '__calimeroCollection';

export interface AuthoredMapOptions {
  /**
   * Existing map identifier as a 32-byte Uint8Array or 64-character hex string.
   */
  id?: Uint8Array | string;
}

export class AuthoredMap<K, V> {
  private readonly mapId: Uint8Array;

  constructor(options: AuthoredMapOptions = {}) {
    if (options.id) {
      this.mapId = normalizeCollectionId(options.id, 'AuthoredMap');
    } else {
      try {
        this.mapId = authoredMapNew();
      } catch (error) {
        const message = `[collections::AuthoredMap] authoredMapNew failed: ${error instanceof Error ? error.message : String(error)}`;
        try {
          env.log(message);
        } catch {
          if (typeof console !== 'undefined' && typeof console.error === 'function') {
            console.error(message);
          }
        }
        env.panic(message);
      }
    }

    // Register with nested tracker for automatic change propagation
    nestedTracker.registerCollection(this);
  }

  static fromId<K, V>(id: Uint8Array | string): AuthoredMap<K, V> {
    return new AuthoredMap<K, V>({ id });
  }

  /**
   * Returns the underlying map identifier as a hex string.
   */
  id(): string {
    return bytesToHex(this.mapId);
  }

  /**
   * Returns a copy of the map identifier bytes.
   */
  idBytes(): Uint8Array {
    return new Uint8Array(this.mapId);
  }

  /**
   * Inserts a new key, stamping the current executor as the entry owner.
   * Throws if the key already exists (use {@link AuthoredMap.update} or
   * {@link AuthoredMap.set} to modify an owned entry).
   */
  insert(key: K, value: V): void {
    const keyBytes = serialize(key);
    const valueBytes = serialize(value);
    authoredMapInsert(this.mapId, keyBytes, valueBytes);

    if (hasRegisteredCollection(value)) {
      nestedTracker.registerCollection(value, this, key);
    }
    nestedTracker.notifyCollectionModified(this);
  }

  /**
   * Updates the value at an existing key. **Owner-only**: throws when the
   * current executor is not the entry owner.
   */
  update(key: K, value: V): void {
    const keyBytes = serialize(key);
    const valueBytes = serialize(value);
    authoredMapUpdate(this.mapId, keyBytes, valueBytes);

    if (hasRegisteredCollection(value)) {
      nestedTracker.registerCollection(value, this, key);
    }
    nestedTracker.notifyCollectionModified(this);
  }

  /**
   * Upsert helper: inserts a new key (stamping the executor as owner) or, when
   * the key already exists, updates it (owner-only — throws for non-owners).
   */
  set(key: K, value: V): void {
    if (this.has(key)) {
      this.update(key, value);
    } else {
      this.insert(key, value);
    }
  }

  get(key: K): V | null {
    const keyBytes = serialize(key);
    const raw = authoredMapGet(this.mapId, keyBytes);
    return raw ? deserialize<V>(raw) : null;
  }

  has(key: K): boolean {
    const keyBytes = serialize(key);
    return authoredMapContains(this.mapId, keyBytes);
  }

  /**
   * Alias for {@link AuthoredMap.has}.
   */
  contains(key: K): boolean {
    return this.has(key);
  }

  /**
   * Removes a key. **Owner-only**: throws when the current executor is not the
   * entry owner.
   */
  remove(key: K): void {
    const keyBytes = serialize(key);
    authoredMapRemove(this.mapId, keyBytes);
    nestedTracker.notifyCollectionModified(this);
  }

  /**
   * Returns the 32-byte owner public key of a key, or `null` when the key is
   * absent.
   */
  ownerOf(key: K): Uint8Array | null {
    const keyBytes = serialize(key);
    return authoredMapOwnerOf(this.mapId, keyBytes);
  }

  /**
   * Reports whether the current executor owns the entry at `key`.
   */
  ownedByMe(key: K): boolean {
    const keyBytes = serialize(key);
    return authoredMapOwnedByMe(this.mapId, keyBytes);
  }

  entries(): Array<[K, V]> {
    const serializedEntries = authoredMapEntries(this.mapId);
    return serializedEntries.map(([keyBytes, valueBytes]) => [
      deserialize<K>(keyBytes),
      deserialize<V>(valueBytes),
    ]);
  }

  keys(): K[] {
    return this.entries().map(([key]) => key);
  }

  values(): V[] {
    return this.entries().map(([, value]) => value);
  }

  toJSON(): Record<string, unknown> {
    return {
      [SENTINEL_KEY]: 'AuthoredMap',
      id: this.id(),
    };
  }
}

registerCollectionType('AuthoredMap', (snapshot: CollectionSnapshot) =>
  AuthoredMap.fromId(snapshot.id)
);
