/**
 * Helper factories for stateful CRDT collections.
 *
 * Prefer these helpers over invoking constructors inside state class constructors.
 */
import { UnorderedMap } from '../collections/UnorderedMap';
import { UnorderedSet } from '../collections/UnorderedSet';
import { Vector } from '../collections/Vector';
import { Counter } from '../collections/Counter';
import { LwwRegister } from '../collections/LwwRegister';
import { UserStorage } from '../collections/UserStorage';
import { FrozenStorage } from '../collections/FrozenStorage';

import type { UnorderedMapOptions } from '../collections/UnorderedMap';
import type { UnorderedSetOptions } from '../collections/UnorderedSet';
import type { VectorOptions } from '../collections/Vector';
import type { CounterOptions } from '../collections/Counter';
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

export function createCounter(
  options?: CounterOptions & { initialValue?: number | bigint }
): Counter {
  const { initialValue = 0, ...rest } = options ?? {};
  const counter = new Counter(rest);
  if (initialValue !== 0) {
    counter.incrementBy(initialValue);
  }
  return counter;
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
