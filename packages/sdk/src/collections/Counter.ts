/**
 * Counter - G-Counter (Grow-only Counter) CRDT backed by the Rust host implementation.
 */

import { bytesToHex, hexToBytes, normalizeCollectionId } from '../utils/hex';
import {
  counterNew,
  counterIncrement,
  counterValue,
  counterGetExecutorCount,
} from '../runtime/storage-wasm';
import { registerCollectionType, CollectionSnapshot } from '../runtime/collections';

export interface CounterOptions {
  id?: Uint8Array | string;
}

export class Counter {
  private readonly counterId: Uint8Array;

  constructor(options: CounterOptions = {}) {
    if (options.id) {
      this.counterId = normalizeCollectionId(options.id, 'Counter');
    } else {
      this.counterId = counterNew();
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
    counterIncrement(this.counterId);
  }

  /**
   * Increments the counter by the provided amount.
   *
   * @param amount - Non-negative integer amount to add
   */
  incrementBy(amount: number | bigint): void {
    const steps = normalizeAmount(amount);
    for (let i = 0; i < steps; i++) {
      counterIncrement(this.counterId);
    }
  }

  /**
   * Gets the total count across all executors.
   */
  value(): bigint {
    return counterValue(this.counterId);
  }

  /**
   * Gets the count for a specific executor.
   * If no executor ID is provided, the current executor is used.
   */
  getExecutorCount(executorId?: string): number {
    let executorIdBytes: Uint8Array | undefined;
    if (executorId) {
      const cleaned = executorId.trim().toLowerCase();
      if (cleaned.length !== 64 || !/^[0-9a-f]+$/.test(cleaned)) {
        throw new TypeError('Executor id hex string must be 64 hexadecimal characters');
      }
      executorIdBytes = hexToBytes(cleaned);
    }
    const value = counterGetExecutorCount(this.counterId, executorIdBytes);
    return Number(value);
  }

  toJSON(): Record<string, unknown> {
    return {
      __calimeroCollection: 'Counter',
      id: this.id(),
    };
  }
}

registerCollectionType(
  'Counter',
  (snapshot: CollectionSnapshot) => new Counter({ id: snapshot.id })
);

function normalizeAmount(amount: number | bigint): number {
  if (typeof amount === 'bigint') {
    if (amount < 0n) {
      throw new RangeError('Counter increment amount must be non-negative');
    }
    if (amount > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new RangeError('Counter increment amount exceeds safe integer range');
    }
    return Number(amount);
  }

  if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount < 0) {
    throw new RangeError('Counter increment amount must be a non-negative integer');
  }

  return amount;
}
