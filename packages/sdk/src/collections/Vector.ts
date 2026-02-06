/**
 * Vector - Ordered list CRDT backed by the Rust host implementation.
 */

import { serialize, deserialize } from '../utils/serialize';
import { bytesToHex, normalizeCollectionId } from '../utils/hex';
import { vectorNew, vectorLen, vectorPush, vectorGet, vectorPop } from '../runtime/storage-wasm';
import {
  registerCollectionType,
  CollectionSnapshot,
  hasRegisteredCollection,
} from '../runtime/collections';
import { nestedTracker } from '../runtime/nested-tracking';

export interface VectorOptions {
  id?: Uint8Array | string;
}

export class Vector<T> {
  private readonly vectorId: Uint8Array;

  constructor(options: VectorOptions = {}) {
    if (options.id) {
      this.vectorId = normalizeCollectionId(options.id, 'Vector');
    } else {
      this.vectorId = vectorNew();
    }

    // Register with nested tracker for automatic change propagation
    nestedTracker.registerCollection(this);
  }

  /**
   * Create a vector populated with the provided values.
   */
  static fromArray<U>(values: U[], options: VectorOptions = {}): Vector<U> {
    const vector = new Vector<U>(options);
    for (const value of values) {
      vector.push(value);
    }
    return vector;
  }

  /**
   * Returns the identifier of this vector as a hex string.
   */
  id(): string {
    return bytesToHex(this.vectorId);
  }

  /**
   * Returns a copy of the identifier bytes.
   */
  idBytes(): Uint8Array {
    return new Uint8Array(this.vectorId);
  }

  /**
   * Appends a value to the end of the vector.
   */
  push(value: T): void {
    // Register nested collections for automatic tracking
    if (hasRegisteredCollection(value)) {
      nestedTracker.registerCollection(value, this, this.len());
    }

    vectorPush(this.vectorId, serialize(value));

    // Notify tracker of modification
    nestedTracker.notifyCollectionModified(this);
  }

  /**
   * Gets the value at the given index.
   */
  get(index: number): T | null {
    // Validate index is a non-negative integer
    if (!Number.isInteger(index) || index < 0) {
      throw new RangeError(`Vector index must be a non-negative integer, got ${index}`);
    }

    // Validate index is within bounds
    const length = this.len();
    if (index >= length) {
      throw new RangeError(`Vector index ${index} is out of bounds (length: ${length})`);
    }

    const raw = vectorGet(this.vectorId, index, 0n);
    return raw ? deserialize<T>(raw) : null;
  }

  /**
   * Gets the length of the vector.
   */
  len(): number {
    return vectorLen(this.vectorId);
  }

  /**
   * Removes and returns the last element.
   */
  pop(): T | null {
    const raw = vectorPop(this.vectorId);

    // Notify tracker of modification
    nestedTracker.notifyCollectionModified(this);

    return raw ? deserialize<T>(raw) : null;
  }

  /**
   * Reads the entire vector into a JavaScript array.
   */
  toArray(): T[] {
    const length = vectorLen(this.vectorId);
    const values: T[] = [];
    for (let index = 0; index < length; index++) {
      const raw = vectorGet(this.vectorId, index, 0n);
      if (raw) {
        values.push(deserialize<T>(raw));
      }
    }
    return values;
  }

  toJSON(): Record<string, unknown> {
    return {
      __calimeroCollection: 'Vector',
      id: this.id(),
    };
  }
}

registerCollectionType('Vector', (snapshot: CollectionSnapshot) => new Vector({ id: snapshot.id }));
