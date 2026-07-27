/**
 * CRDT Collections
 *
 * Conflict-free Replicated Data Types for distributed state management
 */

export { UnorderedMap } from './UnorderedMap';
export { UnorderedSet } from './UnorderedSet';
export { Vector } from './Vector';
export { Counter } from './Counter';
export { LwwRegister } from './LwwRegister';

// Phase 1 CRDT-type expansion (wrap core#3318 host fns)
export { PNCounter, type PNCounterOptions } from './PNCounter';
export { Rga, type RgaOptions } from './Rga';
export { SortedMap, type SortedMapOptions } from './SortedMap';
export { SortedSet, type SortedSetOptions } from './SortedSet';

// Specialized Storage Collections
export { UserStorage, type UserStorageOptions, type PublicKey } from './UserStorage';
export { FrozenStorage, FrozenValue, type FrozenStorageOptions, type Hash } from './FrozenStorage';
