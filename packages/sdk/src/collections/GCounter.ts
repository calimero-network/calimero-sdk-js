/**
 * GCounter - Grow-only Counter CRDT backed by the Rust host implementation.
 *
 * This is a G-Counter (Grow-only Counter) that only supports increment operations.
 * The value can never decrease. For a counter that supports both increment and
 * decrement, use PNCounter.
 *
 * In the Rust SDK, this corresponds to `Counter<false>` or the `GCounter` type alias.
 * The CrdtType for this is `CrdtType::GCounter`.
 */

import { bytesToHex, normalizeCollectionId } from '../utils/hex';
import {
  gCounterNew,
  gCounterIncrement,
  gCounterValue,
  gCounterGetExecutorCount,
} from '../runtime/storage-wasm';
import { registerCollectionType, CollectionSnapshot } from '../runtime/collections';

export interface GCounterOptions {
  id?: Uint8Array | string;
}

/**
 * GCounter - Grow-only Counter CRDT.
 *
 * Supports only increment operations; value can never decrease.
 * Internally tracks increments per executor for proper CRDT merge semantics.
 *
 * @example
 * ```typescript
 * const counter = new GCounter();
 * counter.increment();
 * counter.incrementBy(5);
 * console.log(counter.value()); // 6n
 * ```
 */
export class GCounter {
  private readonly counterId: Uint8Array;

  constructor(options: GCounterOptions = {}) {
    if (options.id) {
      this.counterId = normalizeCollectionId(options.id, 'GCounter');
    } else {
      this.counterId = gCounterNew();
    }
  }

  id(): string {
    return bytesToHex(this.counterId);
  }

  idBytes(): Uint8Array {
    return new Uint8Array(this.counterId);
  }

  /**
   * Increments the counter for the current executor.
   */
  increment(): void {
    gCounterIncrement(this.counterId);
  }

  /**
   * Increments the counter by the provided amount.
   *
   * @param amount - Non-negative integer amount to add
   */
  incrementBy(amount: number | bigint): void {
    const steps = normalizeAmount(amount);
    for (let i = 0; i < steps; i++) {
      gCounterIncrement(this.counterId);
    }
  }

  /**
   * Gets the total count across all executors.
   * Always returns a non-negative value (bigint).
   */
  value(): bigint {
    return gCounterValue(this.counterId);
  }

  /**
   * Gets the count for a specific executor.
   * If no executor ID is provided, the current executor is used.
   */
  getExecutorCount(executorId?: string): number {
    const executorIdBytes = executorId ? normalizeCollectionId(executorId, 'Executor') : undefined;
    const value = gCounterGetExecutorCount(this.counterId, executorIdBytes);
    return Number(value);
  }

  toJSON(): Record<string, unknown> {
    return {
      __calimeroCollection: 'GCounter',
      id: this.id(),
    };
  }
}

registerCollectionType(
  'GCounter',
  (snapshot: CollectionSnapshot) => new GCounter({ id: snapshot.id })
);

function normalizeAmount(amount: number | bigint): number {
  if (typeof amount === 'bigint') {
    if (amount < 0n) {
      throw new RangeError('GCounter increment amount must be non-negative');
    }
    if (amount > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new RangeError('GCounter increment amount exceeds safe integer range');
    }
    return Number(amount);
  }

  if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount < 0) {
    throw new RangeError('GCounter increment amount must be a non-negative integer');
  }

  return amount;
}
