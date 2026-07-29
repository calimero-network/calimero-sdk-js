/**
 * SortedMap - backed by the Rust `JsSortedMap` CRDT via storage-wasm.
 * Keys and values are serialized using the SDK's JSON-based serialization.
 *
 * The API is identical to {@link UnorderedMap}; the only difference is that
 * iteration order ({@link SortedMap.entries}, {@link SortedMap.keys},
 * {@link SortedMap.values}) is deterministic — entries are yielded in sorted
 * key order rather than arbitrary hash order.
 */

import { serialize, deserialize } from '../utils/serialize';
import { bytesToHex, normalizeCollectionId } from '../utils/hex';
import * as env from '../env/api';
import {
  sortedMapNew,
  sortedMapGet,
  sortedMapInsert,
  sortedMapRemove,
  sortedMapContains,
  sortedMapEntries,
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

export interface SortedMapOptions {
  /**
   * Existing map identifier as a 32-byte Uint8Array or 64-character hex string.
   */
  id?: Uint8Array | string;
}

export class SortedMap<K, V> {
  private readonly mapId: Uint8Array;

  constructor(options: SortedMapOptions = {}) {
    if (options.id) {
      this.mapId = normalizeCollectionId(options.id, 'SortedMap');
    } else {
      try {
        this.mapId = sortedMapNew();
      } catch (error) {
        const message = `[collections::SortedMap] sortedMapNew failed: ${error instanceof Error ? error.message : String(error)}`;
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

  static fromId<K, V>(id: Uint8Array | string): SortedMap<K, V> {
    return new SortedMap<K, V>({ id });
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

  set(key: K, value: V): void {
    const keyBytes = serialize(key);
    let nextValue = value;

    const mergeableType = getMergeableType(value);
    if (mergeableType) {
      const current = this.get(key);
      if (current) {
        nextValue = mergeMergeableValues(current, value);
      }
    }

    const valueBytes = serialize(nextValue);
    sortedMapInsert(this.mapId, keyBytes, valueBytes);

    // Register nested collections for automatic tracking after storage
    if (hasRegisteredCollection(nextValue)) {
      nestedTracker.registerCollection(nextValue, this, key);
    }

    // Notify tracker of modification
    nestedTracker.notifyCollectionModified(this);
  }

  get(key: K): V | null {
    const keyBytes = serialize(key);
    const raw = sortedMapGet(this.mapId, keyBytes);
    return raw ? deserialize<V>(raw) : null;
  }

  has(key: K): boolean {
    const keyBytes = serialize(key);
    return sortedMapContains(this.mapId, keyBytes);
  }

  remove(key: K): void {
    const keyBytes = serialize(key);
    sortedMapRemove(this.mapId, keyBytes);

    // Notify tracker of modification
    nestedTracker.notifyCollectionModified(this);
  }

  /**
   * Returns entries in sorted key order.
   */
  entries(): Array<[K, V]> {
    const serializedEntries = sortedMapEntries(this.mapId);
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
      [SENTINEL_KEY]: 'SortedMap',
      id: this.id(),
    };
  }
}

registerCollectionType('SortedMap', (snapshot: CollectionSnapshot) =>
  SortedMap.fromId(snapshot.id)
);
