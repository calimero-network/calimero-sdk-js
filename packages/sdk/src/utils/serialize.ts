import { serializeJsValue, deserializeJsValue } from './borsh-value';

/**
 * Serializes a value to bytes using Calimero's Borsh encoding.
 *
 * @param value - Value to serialize
 */
export function serialize<T>(value: T): Uint8Array {
  return serializeJsValue(value);
}

/**
 * Deserializes bytes produced by {@link serialize}.
 *
 * @param data - Bytes to deserialize
 */
export function deserialize<T>(data: Uint8Array): T {
  return deserializeJsValue<T>(data);
}
