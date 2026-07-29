/**
 * SortedSet - CRDT backed by the Rust host implementation.
 *
 * The API is identical to {@link UnorderedSet}; the only difference is that
 * iteration order ({@link SortedSet.toArray}) is deterministic — values are
 * yielded in sorted order rather than arbitrary hash order.
 */

import { serialize, deserialize } from '../utils/serialize';
import { bytesToHex, normalizeCollectionId } from '../utils/hex';
import {
  registerCollectionType,
  CollectionSnapshot,
  hasRegisteredCollection,
} from '../runtime/collections';
import {
  sortedSetNew,
  sortedSetInsert,
  sortedSetContains,
  sortedSetRemove,
  sortedSetLen,
  sortedSetValues,
  sortedSetClear,
} from '../runtime/storage-wasm';
import { nestedTracker } from '../runtime/nested-tracking';

export interface SortedSetOptions<T> {
  id?: Uint8Array | string;
  initialValues?: T[];
}

export class SortedSet<T> {
  private readonly setId: Uint8Array;

  constructor(options: SortedSetOptions<T> = {}) {
    if (options.id) {
      this.setId = normalizeCollectionId(options.id, 'SortedSet');
    } else {
      this.setId = sortedSetNew();
    }

    // Register with nested tracker for automatic change propagation
    nestedTracker.registerCollection(this);

    if (options.initialValues) {
      for (const value of options.initialValues) {
        this.add(value);
      }
    }
  }

  id(): string {
    return bytesToHex(this.setId);
  }

  idBytes(): Uint8Array {
    return new Uint8Array(this.setId);
  }

  add(value: T): boolean {
    // Register nested collections for automatic tracking
    if (hasRegisteredCollection(value)) {
      nestedTracker.registerCollection(value, this, value);
    }

    const result = sortedSetInsert(this.setId, serialize(value));

    // Notify tracker of modification
    nestedTracker.notifyCollectionModified(this);

    return result;
  }

  has(value: T): boolean {
    return sortedSetContains(this.setId, serialize(value));
  }

  delete(value: T): boolean {
    const result = sortedSetRemove(this.setId, serialize(value));

    // Notify tracker of modification
    nestedTracker.notifyCollectionModified(this);

    return result;
  }

  clear(): void {
    sortedSetClear(this.setId);

    // Notify tracker of modification
    nestedTracker.notifyCollectionModified(this);
  }

  size(): number {
    return sortedSetLen(this.setId);
  }

  /**
   * Returns values in sorted order.
   */
  toArray(): T[] {
    const rawValues = sortedSetValues(this.setId);
    return rawValues.map(bytes => deserialize<T>(bytes));
  }

  toJSON(): Record<string, unknown> {
    return {
      __calimeroCollection: 'SortedSet',
      id: this.id(),
    };
  }
}

registerCollectionType(
  'SortedSet',
  (snapshot: CollectionSnapshot) => new SortedSet({ id: snapshot.id })
);
