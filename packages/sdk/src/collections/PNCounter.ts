/**
 * PNCounter - Positive-Negative Counter CRDT backed by the Rust host implementation.
 *
 * Unlike GCounter (grow-only), PNCounter supports both increment and decrement operations.
 * The value can go negative. This is a PN-Counter (Positive-Negative Counter).
 *
 * In the Rust SDK, this corresponds to `Counter<true>` or the `PNCounter` type alias.
 * The CrdtType for this is `CrdtType::PnCounter`.
 */

import { bytesToHex, normalizeCollectionId } from '../utils/hex';
import {
  pnCounterNew,
  pnCounterIncrement,
  pnCounterDecrement,
  pnCounterValue,
  pnCounterGetPositiveCount,
  pnCounterGetNegativeCount,
} from '../runtime/storage-wasm';
import { registerCollectionType, CollectionSnapshot } from '../runtime/collections';

export interface PNCounterOptions {
  id?: Uint8Array | string;
}

/**
 * PNCounter - Positive-Negative Counter CRDT.
 *
 * Supports both increment and decrement operations; value can go negative.
 * Internally tracks increments and decrements per executor for proper CRDT merge semantics.
 *
 * @example
 * ```typescript
 * const counter = new PNCounter();
 * counter.increment();
 * counter.incrementBy(5);
 * counter.decrement();
 * counter.decrementBy(2);
 * console.log(counter.value()); // 3n
 * ```
 */
export class PNCounter {
  private readonly counterId: Uint8Array;

  constructor(options: PNCounterOptions = {}) {
    if (options.id) {
      this.counterId = normalizeCollectionId(options.id, 'PNCounter');
    } else {
      this.counterId = pnCounterNew();
    }
  }

  /**
   * Create a PNCounter from an existing ID.
   */
  static fromId(id: Uint8Array | string): PNCounter {
    return new PNCounter({ id });
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
    pnCounterIncrement(this.counterId);
  }

  /**
   * Increments the counter by the provided amount.
   *
   * @param amount - Non-negative integer amount to add
   */
  incrementBy(amount: number | bigint): void {
    const steps = normalizePositiveAmount(amount);
    for (let i = 0; i < steps; i++) {
      pnCounterIncrement(this.counterId);
    }
  }

  /**
   * Decrements the counter for the current executor.
   */
  decrement(): void {
    pnCounterDecrement(this.counterId);
  }

  /**
   * Decrements the counter by the provided amount.
   *
   * @param amount - Non-negative integer amount to subtract
   */
  decrementBy(amount: number | bigint): void {
    const steps = normalizePositiveAmount(amount);
    for (let i = 0; i < steps; i++) {
      pnCounterDecrement(this.counterId);
    }
  }

  /**
   * Gets the total count across all executors.
   * Can be negative (bigint).
   */
  value(): bigint {
    return pnCounterValue(this.counterId);
  }

  /**
   * Gets the positive contribution count for a specific executor.
   * If no executor ID is provided, the current executor is used.
   */
  getPositiveCount(executorId?: string): number {
    const executorIdBytes = executorId ? normalizeCollectionId(executorId, 'Executor') : undefined;
    const value = pnCounterGetPositiveCount(this.counterId, executorIdBytes);
    return Number(value);
  }

  /**
   * Gets the negative contribution count for a specific executor.
   * If no executor ID is provided, the current executor is used.
   */
  getNegativeCount(executorId?: string): number {
    const executorIdBytes = executorId ? normalizeCollectionId(executorId, 'Executor') : undefined;
    const value = pnCounterGetNegativeCount(this.counterId, executorIdBytes);
    return Number(value);
  }

  toJSON(): Record<string, unknown> {
    return {
      __calimeroCollection: 'PNCounter',
      id: this.id(),
    };
  }
}

registerCollectionType(
  'PNCounter',
  (snapshot: CollectionSnapshot) => new PNCounter({ id: snapshot.id })
);

function normalizePositiveAmount(amount: number | bigint): number {
  if (typeof amount === 'bigint') {
    if (amount < 0n) {
      throw new RangeError('PNCounter increment/decrement amount must be non-negative');
    }
    if (amount > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new RangeError('PNCounter increment/decrement amount exceeds safe integer range');
    }
    return Number(amount);
  }

  if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount < 0) {
    throw new RangeError('PNCounter increment/decrement amount must be a non-negative integer');
  }

  return amount;
}
