/**
 * AuthoredVector - attributed ordered-list CRDT backed by the Rust
 * `JsAuthoredVector` via storage-wasm. Each slot records the executor that
 * pushed it as its owner.
 *
 * The logical shape mirrors {@link Vector}; the difference is authorship:
 *  - `push` stamps the current executor as the slot owner — no extra arguments
 *    — and returns the new slot index.
 *  - `update` and `tombstone` are **owner-only**: the host returns
 *    `ActionNotAllowed` (surfaced as a thrown error) when the current executor
 *    is not the slot owner.
 *  - `ownerOf(index)` returns the 32-byte owner public key (or `null` when the
 *    slot is out of bounds); `ownedByMe(index)` reports whether the executor
 *    owns it.
 */

import { serialize, deserialize } from '../utils/serialize';
import { bytesToHex, normalizeCollectionId } from '../utils/hex';
import * as env from '../env/api';
import {
  authoredVectorNew,
  authoredVectorLen,
  authoredVectorPush,
  authoredVectorUpdate,
  authoredVectorTombstone,
  authoredVectorGet,
  authoredVectorOwnerOf,
  authoredVectorOwnedByMe,
  authoredVectorValues,
} from '../runtime/storage-wasm';
import {
  registerCollectionType,
  CollectionSnapshot,
  hasRegisteredCollection,
} from '../runtime/collections';
import { nestedTracker } from '../runtime/nested-tracking';

const SENTINEL_KEY = '__calimeroCollection';

export interface AuthoredVectorOptions {
  id?: Uint8Array | string;
}

export class AuthoredVector<T> {
  private readonly vectorId: Uint8Array;

  constructor(options: AuthoredVectorOptions = {}) {
    if (options.id) {
      this.vectorId = normalizeCollectionId(options.id, 'AuthoredVector');
    } else {
      try {
        this.vectorId = authoredVectorNew();
      } catch (error) {
        const message = `[collections::AuthoredVector] authoredVectorNew failed: ${error instanceof Error ? error.message : String(error)}`;
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

  static fromId<U>(id: Uint8Array | string): AuthoredVector<U> {
    return new AuthoredVector<U>({ id });
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
   * Appends a value at the tail, stamping the current executor as the slot
   * owner. Returns the index of the new slot.
   */
  push(value: T): number {
    if (hasRegisteredCollection(value)) {
      nestedTracker.registerCollection(value, this, this.len());
    }

    const index = authoredVectorPush(this.vectorId, serialize(value));
    nestedTracker.notifyCollectionModified(this);
    return index;
  }

  /**
   * Updates the value at a slot. **Owner-only**: throws when the current
   * executor is not the slot owner.
   */
  update(index: number, value: T): void {
    authoredVectorUpdate(this.vectorId, index, serialize(value));

    if (hasRegisteredCollection(value)) {
      nestedTracker.registerCollection(value, this, index);
    }
    nestedTracker.notifyCollectionModified(this);
  }

  /**
   * Tombstones (logically removes) the slot at `index`. **Owner-only**: throws
   * when the current executor is not the slot owner.
   */
  tombstone(index: number): void {
    authoredVectorTombstone(this.vectorId, index);
    nestedTracker.notifyCollectionModified(this);
  }

  /**
   * Gets the value at the given index, or `null` when the slot is absent or
   * tombstoned.
   */
  get(index: number): T | null {
    const raw = authoredVectorGet(this.vectorId, index);
    // A tombstoned slot round-trips as a 0-byte value (core `tombstone` writes
    // `V::default()`); a real serialized value is always >= 1 byte. An empty
    // `Uint8Array` is truthy, so length must be checked explicitly.
    return raw && raw.length > 0 ? deserialize<T>(raw) : null;
  }

  /**
   * Returns the 32-byte owner public key of the slot at `index`, or `null`
   * when the slot is out of bounds.
   */
  ownerOf(index: number): Uint8Array | null {
    return authoredVectorOwnerOf(this.vectorId, index);
  }

  /**
   * Reports whether the current executor owns the slot at `index`.
   */
  ownedByMe(index: number): boolean {
    return authoredVectorOwnedByMe(this.vectorId, index);
  }

  /**
   * Gets the number of slots in the vector.
   */
  len(): number {
    return authoredVectorLen(this.vectorId);
  }

  /**
   * Reads all live (non-tombstoned) values into a JavaScript array.
   */
  iter(): T[] {
    // Skip tombstoned slots: core `iter` returns every slot including
    // tombstones, which round-trip as 0-byte values. A real serialized value
    // is always >= 1 byte, so a 0-length slot is unambiguously a tombstone.
    return authoredVectorValues(this.vectorId)
      .filter(raw => raw.length > 0)
      .map(raw => deserialize<T>(raw));
  }

  /**
   * Alias for {@link AuthoredVector.iter}.
   */
  toArray(): T[] {
    return this.iter();
  }

  toJSON(): Record<string, unknown> {
    return {
      [SENTINEL_KEY]: 'AuthoredVector',
      id: this.id(),
    };
  }
}

registerCollectionType(
  'AuthoredVector',
  (snapshot: CollectionSnapshot) => new AuthoredVector({ id: snapshot.id })
);
