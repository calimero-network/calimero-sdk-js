/**
 * LwwRegister - Last-Write-Wins Register CRDT backed by the Rust host implementation.
 */

import { serialize, deserialize } from '../utils/serialize';
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
      this.registerId = normalizeId(options.id);
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
      id: this.id()
    };
  }
}

registerCollectionType('LwwRegister', (snapshot: CollectionSnapshot) => new LwwRegister({ id: snapshot.id }));

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.trim().toLowerCase();
  if (normalized.length !== 64 || !/^[0-9a-f]+$/.test(normalized)) {
    throw new TypeError('LwwRegister id hex string must be 64 hexadecimal characters');
  }

  const bytes = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < normalized.length; i += 2) {
    bytes[i / 2] = parseInt(normalized.slice(i, i + 2), 16);
  }
  return bytes;
}

function normalizeId(id: Uint8Array | string): Uint8Array {
  if (id instanceof Uint8Array) {
    if (id.length !== 32) {
      throw new TypeError('LwwRegister id must be 32 bytes');
    }
    return new Uint8Array(id);
  }

  return hexToBytes(id);
}
