/**
 * AuthoredMap - attributed map CRDT backed by the Rust `JsAuthoredMap` via
 * storage-wasm. Keys are per owner: each member holds its own entry at a key,
 * so two members inserting one key hold two entries.
 *
 *  - `insert` stamps the current executor as owner; it throws only if the
 *    executor already holds the key.
 *  - `get`, `has`, `update`, `remove`, `ownerOf` and `ownedByMe` act on the
 *    executor's own entry. `update` throws when the executor holds no entry.
 *  - `entries`, `keys` and `values` span every owner, so a key appears once
 *    per owner holding it.
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
   * Registers a nested-collection value as a child of this map (keyed by
   * `key`) and marks this map dirty. Shared by insert/update so the tracking
   * sequence stays in one place.
   */
  private trackNested(key: K, value: V): void {
    if (hasRegisteredCollection(value)) {
      nestedTracker.registerCollection(value, this, key);
    }
    nestedTracker.notifyCollectionModified(this);
  }

  /**
   * Inserts the executor's entry at `key`, stamping it as owner. Throws if the
   * executor already holds `key` (use {@link AuthoredMap.update} or
   * {@link AuthoredMap.set}); other owners' entries do not conflict.
   */
  insert(key: K, value: V): void {
    const keyBytes = serialize(key);
    const valueBytes = serialize(value);
    authoredMapInsert(this.mapId, keyBytes, valueBytes);
    this.trackNested(key, value);
  }

  /**
   * Updates the executor's own entry at `key`. Throws when the executor holds
   * no entry there.
   */
  update(key: K, value: V): void {
    const keyBytes = serialize(key);
    const valueBytes = serialize(value);
    authoredMapUpdate(this.mapId, keyBytes, valueBytes);
    this.trackNested(key, value);
  }

  /**
   * Upsert helper: updates the executor's entry at `key`, or inserts it when
   * the executor holds none.
   */
  set(key: K, value: V): void {
    if (this.has(key)) {
      this.update(key, value);
    } else {
      this.insert(key, value);
    }
  }

  /**
   * The executor's own value at `key`, or `null`. Another owner's entry at the
   * same key is not visible here; read it through {@link AuthoredMap.entries}.
   */
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
   * Removes the executor's own entry at `key`; a no-op when it holds none.
   */
  remove(key: K): void {
    const keyBytes = serialize(key);
    authoredMapRemove(this.mapId, keyBytes);
    nestedTracker.notifyCollectionModified(this);
  }

  /**
   * Returns the executor's own public key when it holds `key`, or `null`.
   * Other owners' entries at `key` are not reported.
   */
  ownerOf(key: K): Uint8Array | null {
    const keyBytes = serialize(key);
    return authoredMapOwnerOf(this.mapId, keyBytes);
  }

  /**
   * Reports whether the current executor holds an entry at `key`.
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
