/**
 * Counter - G-Counter (Grow-only Counter) CRDT
 *
 * A distributed counter that supports increment operations.
 * Each node tracks its own count, and the total is the sum of all counts.
 */

import { serialize, deserialize } from '../utils/serialize';
import * as env from '../env/api';
import { DeltaContext } from './internal/DeltaContext';

interface CounterData {
  // Map of executor_id -> count
  counts: Record<string, number>;
}

export class Counter {
  private prefix: Uint8Array;
  private data: CounterData;

  /**
   * Creates a new Counter
   *
   * @param prefix - Optional prefix for storage
   */
  constructor(prefix: string = '') {
    const encoder = new TextEncoder();
    this.prefix = encoder.encode(prefix || `counter_${Math.random().toString(36).substr(2, 9)}`);
    
    // Load existing data or initialize
    const raw = env.storageRead(this.prefix);
    if (raw) {
      this.data = deserialize<CounterData>(raw);
    } else {
      this.data = { counts: {} };
    }
  }

  /**
   * Increments the counter for the current executor
   */
  increment(): void {
    const executor = this._getExecutorKey();
    const current = this.data.counts[executor] || 0;
    this.data.counts[executor] = current + 1;

    // Save updated data
    const serialized = serialize(this.data);
    env.storageWrite(this.prefix, serialized);

    // Track in delta
    DeltaContext.addAction({
      type: 'Update',
      key: this.prefix,
      value: serialized,
      timestamp: Number(env.timeNow())
    });
  }

  /**
   * Gets the total count across all executors
   *
   * @returns Total count
   */
  value(): bigint {
    let total = 0;
    for (const count of Object.values(this.data.counts)) {
      total += count;
    }
    return BigInt(total);
  }

  /**
   * Gets the count for a specific executor
   */
  getExecutorCount(executorId?: string): number {
    const executor = executorId || this._getExecutorKey();
    return this.data.counts[executor] || 0;
  }

  private _getExecutorKey(): string {
    const id = env.executorId();
    return Array.from(id)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
}

