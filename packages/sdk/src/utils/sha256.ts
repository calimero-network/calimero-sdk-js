/**
 * SHA256 hashing utility for content-addressable storage.
 *
 * Uses @noble/hashes - a well-audited, pure JavaScript crypto library
 * that works in all environments including QuickJS/WASM.
 */

import { sha256 as nobleSha256 } from '@noble/hashes/sha256';

/**
 * Computes SHA256 hash of the input data.
 * @param data - Input bytes to hash
 * @returns 32-byte hash as Uint8Array
 */
export function sha256(data: Uint8Array): Uint8Array {
  return nobleSha256(data);
}
