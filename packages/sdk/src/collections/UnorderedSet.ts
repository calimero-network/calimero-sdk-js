/**
 * UnorderedSet - CRDT backed by the Rust host implementation.
 */

import { serialize, deserialize } from '../utils/serialize';
import { bytesToHex, hexToBytes } from '../utils/hex';
import {
  registerCollectionType,
  CollectionSnapshot,
  hasRegisteredCollection,
} from '../runtime/collections';
import {
  setNew,
  setInsert,
  setContains,
  setRemove,
  setLen,
  setValues,
  setClear,
} from '../runtime/storage-wasm';
import { nestedTracker } from '../runtime/nested-tracking';

export interface UnorderedSetOptions<T> {
  id?: Uint8Array | string;
  initialValues?: T[];
}

export class UnorderedSet<T> {
  private readonly setId: Uint8Array;

  constructor(options: UnorderedSetOptions<T> = {}) {
    if (options.id) {
      this.setId = normalizeId(options.id);
    } else {
      this.setId = setNew();
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

    const result = setInsert(this.setId, serialize(value));

    // Notify tracker of modification
    nestedTracker.notifyCollectionModified(this);

    return result;
  }

  has(value: T): boolean {
    return setContains(this.setId, serialize(value));
  }

  delete(value: T): boolean {
    const result = setRemove(this.setId, serialize(value));

    // Notify tracker of modification
    nestedTracker.notifyCollectionModified(this);

    return result;
  }

  clear(): void {
    setClear(this.setId);

    // Notify tracker of modification
    nestedTracker.notifyCollectionModified(this);
  }

  size(): number {
    return setLen(this.setId);
  }

  toArray(): T[] {
    const rawValues = setValues(this.setId);
    return rawValues.map(bytes => deserialize<T>(bytes));
  }

  toJSON(): Record<string, unknown> {
    return {
      __calimeroCollection: 'UnorderedSet',
      id: this.id(),
    };
  }
}

registerCollectionType(
  'UnorderedSet',
  (snapshot: CollectionSnapshot) => new UnorderedSet({ id: snapshot.id })
);

function normalizeId(id: Uint8Array | string): Uint8Array {
  if (id instanceof Uint8Array) {
    if (id.length !== 32) {
      throw new TypeError('UnorderedSet id must be 32 bytes');
    }
    return new Uint8Array(id);
  }

  const cleaned = id.trim().toLowerCase();
  if (cleaned.length !== 64) {
    throw new TypeError('UnorderedSet id hex string must be 64 hexadecimal characters');
  }
  return hexToBytes(cleaned);
}
