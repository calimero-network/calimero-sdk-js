/**
 * Serialization utilities
 *
 * Simple JSON-based serialization for MVP.
 * TODO: Implement proper Borsh serialization for compatibility with Rust SDK.
 */

/**
 * Serializes a value to bytes
 *
 * @param value - Value to serialize
 * @returns Serialized bytes
 */
export function serialize<T>(value: T): Uint8Array {
  const encoder = new TextEncoder();
  return encoder.encode(JSON.stringify(value));
}

/**
 * Deserializes bytes to a value
 *
 * @param data - Bytes to deserialize
 * @returns Deserialized value
 */
export function deserialize<T>(data: Uint8Array): T {
  const decoder = new TextDecoder();
  return JSON.parse(decoder.decode(data));
}

