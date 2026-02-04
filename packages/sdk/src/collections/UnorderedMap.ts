/**
 * UnorderedMap - backed by the Rust `JsUnorderedMap` CRDT via storage-wasm.
 * Keys and values are serialized using the SDK's JSON-based serialization.
 */

import { serialize, deserialize } from '../utils/serialize';
import { bytesToHex, hexToBytes } from '../utils/hex';
import * as env from '../env/api';
import {
  mapNew,
  mapGet,
  mapInsert,
  mapRemove,
  mapContains,
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

export interface UnorderedMapOptions {
  /**
   * Existing map identifier as a 32-byte Uint8Array or 64-character hex string.
   */
  id?: Uint8Array | string;
}

export class UnorderedMap<K, V> {
  private readonly mapId: Uint8Array;

  constructor(options: UnorderedMapOptions = {}) {
    if (options.id) {
      this.mapId = normalizeMapId(options.id);
    } else {
      try {
        this.mapId = mapNew();
      } catch (error) {
        const message = `[collections::UnorderedMap] mapNew failed: ${error instanceof Error ? error.message : String(error)}`;
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

  static fromId<K, V>(id: Uint8Array | string): UnorderedMap<K, V> {
    return new UnorderedMap<K, V>({ id });
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
    mapInsert(this.mapId, keyBytes, valueBytes);

    // Register nested collections for automatic tracking after storage
    if (hasRegisteredCollection(nextValue)) {
      nestedTracker.registerCollection(nextValue, this, key);
    }

    // Notify tracker of modification
    nestedTracker.notifyCollectionModified(this);
  }

  get(key: K): V | null {
    const keyBytes = serialize(key);
    const raw = mapGet(this.mapId, keyBytes);
    return raw ? deserialize<V>(raw) : null;
  }

  has(key: K): boolean {
    const keyBytes = serialize(key);
    return mapContains(this.mapId, keyBytes);
  }

  remove(key: K): void {
    const keyBytes = serialize(key);
    mapRemove(this.mapId, keyBytes);

    // Notify tracker of modification
    nestedTracker.notifyCollectionModified(this);
  }

  entries(): Array<[K, V]> {
    const serializedEntries = mapEntries(this.mapId);
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
      [SENTINEL_KEY]: 'UnorderedMap',
      id: this.id(),
    };
  }
}

function normalizeMapId(id: Uint8Array | string): Uint8Array {
  if (id instanceof Uint8Array) {
    if (id.length !== 32) {
      throw new TypeError('Map id must be 32 bytes');
    }
    return new Uint8Array(id);
  }

  const cleaned = id.trim().toLowerCase();
  if (cleaned.length !== 64 || !/^[0-9a-f]+$/.test(cleaned)) {
    throw new TypeError('Map id hex string must be 64 hexadecimal characters');
  }
  return hexToBytes(cleaned);
}

registerCollectionType('UnorderedMap', (snapshot: CollectionSnapshot) =>
  UnorderedMap.fromId(snapshot.id)
);
