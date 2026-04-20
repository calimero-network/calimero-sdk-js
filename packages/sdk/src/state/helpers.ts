/**
 * Helper factories for stateful CRDT collections.
 *
 * Prefer these helpers over invoking constructors inside state class constructors.
 *
 * Counter Helpers:
 * - createGCounter(): Creates a GCounter (grow-only, increment only)
 * - createPNCounter(): Creates a PNCounter (supports both increment and decrement)
 */
import { UnorderedMap } from '../collections/UnorderedMap';
import { UnorderedSet } from '../collections/UnorderedSet';
import { Vector } from '../collections/Vector';
import { GCounter } from '../collections/GCounter';
import { PNCounter } from '../collections/PNCounter';
import { Rga } from '../collections/Rga';
import { LwwRegister } from '../collections/LwwRegister';
import { UserStorage } from '../collections/UserStorage';
import { FrozenStorage } from '../collections/FrozenStorage';

import type { UnorderedMapOptions } from '../collections/UnorderedMap';
import type { UnorderedSetOptions } from '../collections/UnorderedSet';
import type { VectorOptions } from '../collections/Vector';
import type { GCounterOptions } from '../collections/GCounter';
import type { PNCounterOptions } from '../collections/PNCounter';
import type { RgaOptions } from '../collections/Rga';
import type { LwwRegisterOptions } from '../collections/LwwRegister';
import type { UserStorageOptions } from '../collections/UserStorage';
import type { FrozenStorageOptions } from '../collections/FrozenStorage';

export function createUnorderedMap<K, V>(options?: UnorderedMapOptions): UnorderedMap<K, V> {
  return new UnorderedMap<K, V>(options);
}

export function createUnorderedSet<T>(options?: UnorderedSetOptions<T>): UnorderedSet<T> {
  return new UnorderedSet<T>(options);
}

export function createVector<T>(options?: VectorOptions): Vector<T> {
  return new Vector<T>(options);
}

/**
 * Creates a GCounter (grow-only counter).
 *
 * The counter supports only increment operations; value can never decrease.
 * Corresponds to Rust's `CrdtType::GCounter`.
 *
 * @example
 * ```typescript
 * const counter = createGCounter();
 * counter.increment();
 * counter.incrementBy(5);
 * console.log(counter.value()); // 6n
 * ```
 */
export function createGCounter(
  options?: GCounterOptions & { initialValue?: number | bigint }
): GCounter {
  const { initialValue = 0, ...rest } = options ?? {};
  const counter = new GCounter(rest);
  if (initialValue !== 0) {
    counter.incrementBy(initialValue);
  }
  return counter;
}

/**
 * Creates a PNCounter (positive-negative counter).
 *
 * The counter supports both increment and decrement operations; value can go negative.
 * Corresponds to Rust's `CrdtType::PnCounter`.
 *
 * @example
 * ```typescript
 * const counter = createPNCounter();
 * counter.increment();
 * counter.incrementBy(5);
 * counter.decrement();
 * console.log(counter.value()); // 5n
 * ```
 */
export function createPNCounter(
  options?: PNCounterOptions & { initialValue?: number | bigint }
): PNCounter {
  const { initialValue = 0, ...rest } = options ?? {};
  const counter = new PNCounter(rest);
  if (initialValue !== 0) {
    if (typeof initialValue === 'bigint') {
      if (initialValue > 0n) {
        counter.incrementBy(initialValue);
      } else if (initialValue < 0n) {
        counter.decrementBy(-initialValue);
      }
    } else {
      if (initialValue > 0) {
        counter.incrementBy(initialValue);
      } else if (initialValue < 0) {
        counter.decrementBy(-initialValue);
      }
    }
  }
  return counter;
}

/**
 * Creates an Rga (Replicated Growable Array) for collaborative text editing.
 *
 * Supports concurrent editing with automatic conflict resolution.
 * Corresponds to Rust's `CrdtType::Rga`.
 *
 * @example
 * ```typescript
 * const doc = createRga();
 * doc.insert(0, 'Hello');
 * console.log(doc.getText()); // "Hello"
 * ```
 */
export function createRga(
  options?: RgaOptions & { initialText?: string }
): Rga {
  const { initialText, ...rest } = options ?? {};
  const rga = new Rga(rest);
  if (initialText && initialText.length > 0) {
    rga.insert(0, initialText);
  }
  return rga;
}

export function createLwwRegister<T>(options?: LwwRegisterOptions<T>): LwwRegister<T> {
  return new LwwRegister<T>(options);
}

export function createUserStorage<V>(options?: UserStorageOptions): UserStorage<V> {
  return new UserStorage<V>(options);
}

export function createFrozenStorage<T>(options?: FrozenStorageOptions): FrozenStorage<T> {
  return new FrozenStorage<T>(options);
}
