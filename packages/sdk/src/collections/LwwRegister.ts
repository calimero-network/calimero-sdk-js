/**
 * LwwRegister - Last-Write-Wins Register CRDT
 *
 * A distributed register that resolves conflicts using timestamps.
 * The value with the highest timestamp wins.
 */

import { serialize, deserialize } from '../utils/serialize';
import * as env from '../env/api';

interface RegisterValue<T> {
  value: T;
  timestamp: number;
}

export class LwwRegister<T> {
  private key: Uint8Array;

  /**
   * Creates a new LwwRegister
   *
   * @param key - Storage key for this register
   */
  constructor(key: string) {
    const encoder = new TextEncoder();
    this.key = encoder.encode(key);
  }

  /**
   * Sets the register value
   *
   * @param value - Value to set
   */
  set(value: T): void {
    const registerValue: RegisterValue<T> = {
      value,
      timestamp: Number(env.timeNow())
    };

    env.storageWrite(this.key, serialize(registerValue));
  }

  /**
   * Gets the current register value
   *
   * @returns Current value, or null if not set
   */
  get(): T | null {
    const raw = env.storageRead(this.key);
    if (!raw) return null;

    const registerValue = deserialize<RegisterValue<T>>(raw);
    return registerValue.value;
  }

  /**
   * Gets the timestamp of the current value
   *
   * @returns Timestamp in nanoseconds, or null if not set
   */
  timestamp(): number | null {
    const raw = env.storageRead(this.key);
    if (!raw) return null;

    const registerValue = deserialize<RegisterValue<T>>(raw);
    return registerValue.timestamp;
  }
}

