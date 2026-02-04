/**
 * SDK Constants
 *
 * This file contains all magic numbers and constants used throughout the SDK.
 * Centralizing these values makes them easier to maintain and reduces errors.
 */

/**
 * Default register ID used for host function calls.
 * The Calimero runtime uses registers to pass data between host and guest.
 */
export const REGISTER_ID = 0n;

/**
 * Length of collection identifiers in bytes.
 * All CRDT collections (Map, Vector, Set, Counter, LWW, etc.) use 32-byte IDs.
 */
export const COLLECTION_ID_LENGTH = 32;

/**
 * Length of public keys in bytes.
 * Ed25519 public keys are 32 bytes.
 */
export const PUBLIC_KEY_LENGTH = 32;

/**
 * Length of context identifiers in bytes.
 */
export const CONTEXT_ID_LENGTH = 32;

/**
 * Length of executor identifiers in bytes.
 */
export const EXECUTOR_ID_LENGTH = 32;

/**
 * Length of application identifiers in bytes.
 */
export const APPLICATION_ID_LENGTH = 32;

/**
 * Length of blob identifiers in bytes.
 */
export const BLOB_ID_LENGTH = 32;

/**
 * Length of SHA256 hashes in bytes.
 * Used by FrozenStorage for content-addressable storage.
 */
export const SHA256_HASH_LENGTH = 32;

/**
 * Maximum length of context aliases in bytes.
 */
export const MAX_ALIAS_LENGTH = 64;

/**
 * Length of Ed25519 signatures in bytes.
 */
export const ED25519_SIGNATURE_LENGTH = 64;
