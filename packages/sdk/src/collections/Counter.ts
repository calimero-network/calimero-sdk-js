/**
 * Counter - G-Counter (Grow-only Counter) CRDT
 *
 * A distributed counter that supports increment operations.
 * Each node tracks its own count, and the total is the sum of all counts.
 */

import { UnorderedMap } from './UnorderedMap';
import * as env from '../env/api';

export class Counter {
  private counts: UnorderedMap<string, bigint>;
  private prefix: string;

  /**
   * Creates a new Counter
   *
   * @param prefix - Optional prefix for storage
   */
  constructor(prefix: string = '') {
    this.prefix = prefix || `counter_${Math.random().toString(36).substr(2, 9)}`;
    this.counts = new UnorderedMap(`${this.prefix}_counts`);
  }

  /**
   * Increments the counter for the current executor
   */
  increment(): void {
    const executor = this._getExecutorKey();
    const current = this.counts.get(executor) || 0n;
    this.counts.set(executor, current + 1n);
  }

  /**
   * Gets the total count across all executors
   *
   * @returns Total count
   *
   * @remarks
   * Note: This is a simplified implementation.
   * Full implementation would need to iterate all keys.
   */
  value(): bigint {
    // TODO: Implement proper iteration over all executor counts
    // For now, return the current executor's count
    const executor = this._getExecutorKey();
    return this.counts.get(executor) || 0n;
  }

  private _getExecutorKey(): string {
    const id = env.executorId();
    return Array.from(id)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
}

