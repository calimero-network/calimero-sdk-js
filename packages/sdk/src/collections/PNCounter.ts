/**
 * PNCounter - PN-Counter (Positive-Negative Counter) CRDT backed by the Rust
 * host implementation.
 *
 * Unlike {@link Counter} (a grow-only G-Counter), a PN-Counter supports both
 * increments and decrements, so its value is **signed**: it is the sum of all
 * increments minus the sum of all decrements across every executor.
 */

import { bytesToHex, normalizeCollectionId } from '../utils/hex';
import {
  pncounterNew,
  pncounterIncrement,
  pncounterDecrement,
  pncounterValue,
  pncounterGetExecutorCount,
} from '../runtime/storage-wasm';
import { registerCollectionType, CollectionSnapshot } from '../runtime/collections';

export interface PNCounterOptions {
  id?: Uint8Array | string;
}

export class PNCounter {
  private readonly counterId: Uint8Array;

  constructor(options: PNCounterOptions = {}) {
    if (options.id) {
      this.counterId = normalizeCollectionId(options.id, 'PNCounter');
    } else {
      this.counterId = pncounterNew();
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
    pncounterIncrement(this.counterId);
  }

  /**
   * Decrements the counter for the current executor.
   */
  decrement(): void {
    pncounterDecrement(this.counterId);
  }

  /**
   * Increments the counter by the provided (non-negative) amount.
   *
   * @param amount - Non-negative integer amount to add
   */
  incrementBy(amount: number | bigint): void {
    const steps = normalizeAmount(amount);
    for (let i = 0; i < steps; i++) {
      pncounterIncrement(this.counterId);
    }
  }

  /**
   * Decrements the counter by the provided (non-negative) amount.
   *
   * @param amount - Non-negative integer amount to subtract
   */
  decrementBy(amount: number | bigint): void {
    const steps = normalizeAmount(amount);
    for (let i = 0; i < steps; i++) {
      pncounterDecrement(this.counterId);
    }
  }

  /**
   * Gets the signed total count across all executors
   * (sum of increments minus sum of decrements).
   */
  value(): bigint {
    return pncounterValue(this.counterId);
  }

  /**
   * Gets the signed net count (positive - negative) for a specific executor.
   * If no executor ID is provided, the current executor is used.
   */
  getExecutorCount(executorId?: string): number {
    const executorIdBytes = executorId ? normalizeCollectionId(executorId, 'Executor') : undefined;
    const value = pncounterGetExecutorCount(this.counterId, executorIdBytes);
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

function normalizeAmount(amount: number | bigint): number {
  if (typeof amount === 'bigint') {
    if (amount < 0n) {
      throw new RangeError('PNCounter amount must be non-negative');
    }
    if (amount > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new RangeError('PNCounter amount exceeds safe integer range');
    }
    return Number(amount);
  }

  if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount < 0) {
    throw new RangeError('PNCounter amount must be a non-negative integer');
  }

  return amount;
}
