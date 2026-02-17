/**
 * CRDT Collections
 *
 * Conflict-free Replicated Data Types for distributed state management
 *
 * Counter Types:
 * - GCounter: Grow-only counter (increment only) - Rust CrdtType::GCounter
 * - PNCounter: Positive-Negative counter (supports decrement) - Rust CrdtType::PnCounter
 */

export { UnorderedMap } from './UnorderedMap';
export { UnorderedSet } from './UnorderedSet';
export { Vector } from './Vector';
export { GCounter, type GCounterOptions } from './GCounter';
export { PNCounter, type PNCounterOptions } from './PNCounter';
export { Rga, type RgaOptions } from './Rga';
export { LwwRegister } from './LwwRegister';

// Specialized Storage Collections
export { UserStorage, type UserStorageOptions, type PublicKey } from './UserStorage';
export { FrozenStorage, FrozenValue, type FrozenStorageOptions, type Hash } from './FrozenStorage';
