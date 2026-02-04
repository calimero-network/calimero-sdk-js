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
