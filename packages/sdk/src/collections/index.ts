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

// Phase 2a: attributed (authored) CRDT-type expansion (wrap core#3321 host fns)
export { AuthoredMap, type AuthoredMapOptions } from './AuthoredMap';
export { AuthoredVector, type AuthoredVectorOptions } from './AuthoredVector';

// Specialized Storage Collections
export { UserStorage, type UserStorageOptions, type PublicKey } from './UserStorage';
export { FrozenStorage, FrozenValue, type FrozenStorageOptions, type Hash } from './FrozenStorage';
