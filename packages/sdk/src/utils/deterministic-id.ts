/**
 * Deterministic ID generation matching Rust's calimero-storage.
 *
 * CRITICAL: IDs must be identical to what Rust generates, otherwise
 * entities created on different nodes won't sync (Invariant I9).
 *
 * Domain separators prevent collision between:
 * - Collection field IDs (e.g., state.gCounters)
 * - Map entry IDs (e.g., gCounters["visits"])
 */

// Must match: core/crates/storage/src/collections.rs
const DOMAIN_SEPARATOR_ENTRY = new TextEncoder().encode('__calimero_entry__');
const DOMAIN_SEPARATOR_COLLECTION = new TextEncoder().encode('__calimero_collection__');

/**
 * SHA-256 implementation for deterministic IDs.
 * Implemented without DataView to avoid QuickJS buffer issues.
 */
export function sha256(data: Uint8Array): Uint8Array {
  // SHA-256 constants
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);

  // Read 4 bytes as big-endian uint32
  function readU32BE(arr: Uint8Array, offset: number): number {
    return (
      ((arr[offset] << 24) | (arr[offset + 1] << 16) | (arr[offset + 2] << 8) | arr[offset + 3]) >>>
      0
    );
  }

  // Write uint32 as big-endian
  function writeU32BE(arr: Uint8Array, offset: number, value: number): void {
    arr[offset] = (value >>> 24) & 0xff;
    arr[offset + 1] = (value >>> 16) & 0xff;
    arr[offset + 2] = (value >>> 8) & 0xff;
    arr[offset + 3] = value & 0xff;
  }

  // Rotate right
  function rotr(x: number, n: number): number {
    return ((x >>> n) | (x << (32 - n))) >>> 0;
  }

  // Initial hash values
  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  // Pre-processing: add padding
  const msgLen = data.length;
  const bitLen = msgLen * 8;

  // Calculate padded length (must be multiple of 64 bytes)
  // We need: msgLen + 1 (0x80 byte) + padding + 8 (length) ≡ 0 (mod 64)
  let paddedLen = msgLen + 1 + 8; // minimum: original + 1 byte + 8 byte length
  const remainder = paddedLen % 64;
  if (remainder !== 0) {
    paddedLen += 64 - remainder;
  }

  const padded = new Uint8Array(paddedLen);
  padded.set(data);
  padded[msgLen] = 0x80;

  // Append length in bits as 64-bit big-endian (we only use lower 32 bits for simplicity)
  // For messages up to 512MB, this is sufficient
  writeU32BE(padded, paddedLen - 4, bitLen >>> 0);

  // Process each 64-byte chunk
  const w = new Uint32Array(64);
  for (let i = 0; i < paddedLen; i += 64) {
    // Copy chunk into first 16 words
    for (let j = 0; j < 16; j++) {
      w[j] = readU32BE(padded, i + j * 4);
    }

    // Extend the first 16 words into the remaining 48 words
    for (let j = 16; j < 64; j++) {
      const s0 = rotr(w[j - 15], 7) ^ rotr(w[j - 15], 18) ^ (w[j - 15] >>> 3);
      const s1 = rotr(w[j - 2], 17) ^ rotr(w[j - 2], 19) ^ (w[j - 2] >>> 10);
      w[j] = (w[j - 16] + s0 + w[j - 7] + s1) >>> 0;
    }

    // Initialize working variables
    let a = h0,
      b = h1,
      c = h2,
      d = h3;
    let e = h4,
      f = h5,
      g = h6,
      h = h7;

    // Compression function main loop
    for (let j = 0; j < 64; j++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[j] + w[j]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    // Add the compressed chunk to the current hash value
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  // Produce the final hash value (big-endian)
  const result = new Uint8Array(32);
  writeU32BE(result, 0, h0);
  writeU32BE(result, 4, h1);
  writeU32BE(result, 8, h2);
  writeU32BE(result, 12, h3);
  writeU32BE(result, 16, h4);
  writeU32BE(result, 20, h5);
  writeU32BE(result, 24, h6);
  writeU32BE(result, 28, h7);

  return result;
}

/**
 * Concatenate multiple Uint8Arrays.
 */
function concat(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

/**
 * Compute deterministic ID for a map/set entry.
 * Matches Rust: compute_id(parent, key)
 *
 * Formula: SHA256(parent_bytes + "__calimero_entry__" + key_bytes)
 */
export function computeEntryId(parentId: Uint8Array, key: Uint8Array): Uint8Array {
  const data = concat(parentId, DOMAIN_SEPARATOR_ENTRY, key);
  return sha256(data);
}

/**
 * Compute deterministic ID for a collection field.
 * Matches Rust: compute_collection_id(parent_id, field_name)
 *
 * Formula: SHA256(parent_bytes (optional) + "__calimero_collection__" + field_name_bytes)
 */
export function computeCollectionId(parentId: Uint8Array | null, fieldName: string): Uint8Array {
  const fieldNameBytes = new TextEncoder().encode(fieldName);
  const data = parentId
    ? concat(parentId, DOMAIN_SEPARATOR_COLLECTION, fieldNameBytes)
    : concat(DOMAIN_SEPARATOR_COLLECTION, fieldNameBytes);
  return sha256(data);
}

/**
 * Convert string key to bytes for ID computation.
 */
export function keyToBytes(key: string): Uint8Array {
  return new TextEncoder().encode(key);
}

/**
 * Root entity ID - matches Rust's Id::root() which is all zeros.
 */
export const ROOT_ID = new Uint8Array(32);
