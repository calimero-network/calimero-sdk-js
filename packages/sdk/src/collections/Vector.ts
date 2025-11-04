/**
 * Vector - Ordered list CRDT
 *
 * A distributed ordered list that maintains insertion order.
 */

import { serialize, deserialize } from '../utils/serialize';
import * as env from '../env/api';

export class Vector<T> {
  private prefix: Uint8Array;
  private lenKey: Uint8Array;

  /**
   * Creates a new Vector
   *
   * @param prefix - Optional prefix for storage keys
   */
  constructor(prefix: string = '') {
    const encoder = new TextEncoder();
    this.prefix = encoder.encode(prefix || this._generatePrefix());
    this.lenKey = new Uint8Array([...this.prefix, 0xFF]);
  }

  private _generatePrefix(): string {
    return `vec_${Math.random().toString(36).substr(2, 9)}`;
  }

  private _indexKey(index: number): Uint8Array {
    const indexBytes = new Uint8Array(4);
    new DataView(indexBytes.buffer).setUint32(0, index, true);
    const combined = new Uint8Array(this.prefix.length + 4);
    combined.set(this.prefix, 0);
    combined.set(indexBytes, this.prefix.length);
    return combined;
  }

  /**
   * Appends a value to the end of the vector
   *
   * @param value - Value to append
   */
  push(value: T): void {
    const len = this.len();
    const key = this._indexKey(len);
    env.storageWrite(key, serialize(value));
    this._setLen(len + 1);
  }

  /**
   * Gets the value at the given index
   *
   * @param index - Index to get
   * @returns Value if exists, null otherwise
   */
  get(index: number): T | null {
    if (index >= this.len()) return null;
    const key = this._indexKey(index);
    const raw = env.storageRead(key);
    if (!raw) return null;
    return deserialize<T>(raw);
  }

  /**
   * Gets the length of the vector
   *
   * @returns Current length
   */
  len(): number {
    const raw = env.storageRead(this.lenKey);
    if (!raw) return 0;
    return new DataView(raw.buffer).getUint32(0, true);
  }

  /**
   * Removes and returns the last element
   *
   * @returns Last element, or null if empty
   */
  pop(): T | null {
    const len = this.len();
    if (len === 0) return null;

    const lastIndex = len - 1;
    const value = this.get(lastIndex);

    const key = this._indexKey(lastIndex);
    env.storageRemove(key);
    this._setLen(lastIndex);

    return value;
  }

  private _setLen(len: number): void {
    const buf = new Uint8Array(4);
    new DataView(buf.buffer).setUint32(0, len, true);
    env.storageWrite(this.lenKey, buf);
  }
}

