/**
 * Hex encoding/decoding utilities for byte arrays.
 *
 * These functions are used throughout the SDK for converting between
 * Uint8Array byte arrays and hexadecimal string representations.
 */

/**
 * Converts a byte array to a hexadecimal string.
 *
 * @param bytes - The byte array to convert
 * @returns A lowercase hexadecimal string representation
 *
 * @example
 * ```typescript
 * const bytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
 * bytesToHex(bytes); // "deadbeef"
 * ```
 */
export function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

/**
 * Converts a hexadecimal string to a byte array.
 *
 * @param hex - The hexadecimal string to convert (must have even length)
 * @returns A Uint8Array containing the decoded bytes
 * @throws TypeError if the hex string has odd length or contains invalid characters
 *
 * @example
 * ```typescript
 * const bytes = hexToBytes("deadbeef");
 * // bytes is Uint8Array([0xde, 0xad, 0xbe, 0xef])
 * ```
 */
export function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.trim().toLowerCase();
  if (normalized.length % 2 !== 0) {
    throw new TypeError('Hex string must have even length');
  }
  if (!/^[0-9a-f]*$/.test(normalized)) {
    throw new TypeError('Hex string contains invalid characters');
  }

  const bytes = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < normalized.length; i += 2) {
    bytes[i / 2] = parseInt(normalized.slice(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Normalizes a collection ID from either a Uint8Array or hex string to a Uint8Array.
 *
 * Collection IDs are 32 bytes (256 bits), represented as 64 hexadecimal characters
 * when in string form.
 *
 * @param id - The collection ID as either a 32-byte Uint8Array or 64-character hex string
 * @param collectionName - The name of the collection type for error messages
 * @returns A new Uint8Array containing the normalized ID bytes
 * @throws TypeError if the ID is not exactly 32 bytes or 64 hex characters
 *
 * @example
 * ```typescript
 * // From hex string
 * const id1 = normalizeCollectionId("ab".repeat(32), "Counter");
 *
 * // From Uint8Array
 * const id2 = normalizeCollectionId(new Uint8Array(32), "Vector");
 * ```
 */
export function normalizeCollectionId(id: Uint8Array | string, collectionName: string): Uint8Array {
  if (id instanceof Uint8Array) {
    if (id.length !== 32) {
      throw new TypeError(`${collectionName} id must be 32 bytes`);
    }
    return new Uint8Array(id);
  }

  const cleaned = id.trim().toLowerCase();
  if (cleaned.length !== 64 || !/^[0-9a-f]+$/.test(cleaned)) {
    throw new TypeError(`${collectionName} id hex string must be 64 hexadecimal characters`);
  }
  return hexToBytes(cleaned);
}
