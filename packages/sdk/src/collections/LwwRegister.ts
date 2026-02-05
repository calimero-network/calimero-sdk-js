/**
 * LwwRegister - Last-Write-Wins Register CRDT backed by the Rust host implementation.
 */

import { serialize, deserialize } from '../utils/serialize';
import { bytesToHex, normalizeCollectionId } from '../utils/hex';
import { lwwNew, lwwSet, lwwGet, lwwTimestamp } from '../runtime/storage-wasm';
import { registerCollectionType, CollectionSnapshot } from '../runtime/collections';

export interface LwwRegisterOptions<T> {
  id?: Uint8Array | string;
  initialValue?: T | null;
}

export class LwwRegister<T> {
  private readonly registerId: Uint8Array;

  constructor(options: LwwRegisterOptions<T> = {}) {
    if (options.id) {
      this.registerId = normalizeCollectionId(options.id, 'LwwRegister');
    } else {
      this.registerId = lwwNew();
    }

    if (options.initialValue !== undefined) {
      if (options.initialValue === null) {
        this.clear();
      } else {
        this.set(options.initialValue);
      }
    }
  }

  id(): string {
    return bytesToHex(this.registerId);
  }

  idBytes(): Uint8Array {
    return new Uint8Array(this.registerId);
  }

  set(value: T): void {
    lwwSet(this.registerId, serialize(value));
  }

  clear(): void {
    lwwSet(this.registerId, null);
  }

  get(): T | null {
    const raw = lwwGet(this.registerId);
    return raw ? deserialize<T>(raw) : null;
  }

  /**
   * Returns the timestamp of the current value as a number representing the physical time.
   */
  timestamp(): number | null {
    const payload = lwwTimestamp(this.registerId);
    return payload ? Number(payload.time) : null;
  }

  toJSON(): Record<string, unknown> {
    return {
      __calimeroCollection: 'LwwRegister',
      id: this.id(),
    };
  }
}

registerCollectionType(
  'LwwRegister',
  (snapshot: CollectionSnapshot) => new LwwRegister({ id: snapshot.id })
);
