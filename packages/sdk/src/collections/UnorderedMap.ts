/**
 * UnorderedMap - Last-Write-Wins CRDT Map
 *
 * A distributed key-value map that automatically resolves conflicts
 * using Last-Write-Wins (LWW) strategy based on timestamps.
 */

import { DeltaContext } from './internal/DeltaContext';
import { serialize, deserialize } from '../utils/serialize';
import * as env from '../env/api';

export class UnorderedMap<K, V> {
  private prefix: Uint8Array;

  /**
   * Creates a new UnorderedMap
   *
   * @param prefix - Optional prefix for storage keys
   */
  constructor(prefix: string = '') {
    const encoder = new TextEncoder();
    this.prefix = encoder.encode(prefix || this._generatePrefix());
  }

  private _generatePrefix(): string {
    // Generate unique prefix
    return `map_${Math.random().toString(36).substr(2, 9)}`;
  }

  private _key(k: K): Uint8Array {
    const keyBytes = serialize(k);
    const combined = new Uint8Array(this.prefix.length + keyBytes.length);
    combined.set(this.prefix, 0);
    combined.set(keyBytes, this.prefix.length);
    return combined;
  }

  /**
   * Sets a value for the given key
   *
   * @param key - Key to set
   * @param value - Value to store
   */
  set(key: K, value: V): void {
    const k = this._key(key);
    const v = serialize(value);

    env.storageWrite(k, v);

    // Track in delta context
    DeltaContext.addAction({
      type: 'Update',
      key: k,
      value: v,
      timestamp: Number(env.timeNow())
    });
  }

  /**
   * Gets the value for the given key
   *
   * @param key - Key to get
   * @returns Value if exists, null otherwise
   */
  get(key: K): V | null {
    const k = this._key(key);
    const raw = env.storageRead(k);
    if (!raw) return null;
    return deserialize<V>(raw);
  }

  /**
   * Checks if a key exists
   *
   * @param key - Key to check
   * @returns true if key exists
   */
  has(key: K): boolean {
    const k = this._key(key);
    return env.storageRead(k) !== null;
  }

  /**
   * Removes a key from the map
   *
   * @param key - Key to remove
   */
  remove(key: K): void {
    const k = this._key(key);
    env.storageRemove(k);

    // Track in delta context
    DeltaContext.addAction({
      type: 'Remove',
      key: k,
      timestamp: Number(env.timeNow())
    });
  }
}

