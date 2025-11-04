/**
 * Common type definitions
 */

/**
 * Serialization options
 */
export interface SerializeOptions {
  /**
   * Whether to use compact encoding
   */
  compact?: boolean;
}

/**
 * Deserialization options
 */
export interface DeserializeOptions {
  /**
   * Whether to validate the data
   */
  validate?: boolean;
}

/**
 * Result type for operations that can fail
 */
export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

