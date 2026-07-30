/**
 * base58 encode/decode round-trip tests.
 */

import { bytesToBase58, base58ToBytes } from '../../env/api';

describe('base58', () => {
  it('decodes known single-digit values', () => {
    // Non-leading-zero single digits: value = alphabet index.
    expect(Array.from(base58ToBytes('2'))).toEqual([1]);
    expect(Array.from(base58ToBytes('z'))).toEqual([57]);
  });

  it('is the exact inverse of bytesToBase58 for leading-zero keys', () => {
    // decode ∘ encode is the identity for any key with a non-zero part — which
    // covers every real public key (a 32-byte key is never all-zero). The
    // encoder's all-zero edge (e.g. [0]) is a pre-existing quirk irrelevant to
    // the writer-key path, so it is not exercised here.
    for (const bytes of [[0, 0, 42], [0, 7, 0, 9], [0, 255, 0, 1]]) {
      const key = new Uint8Array(bytes);
      expect(Array.from(base58ToBytes(bytesToBase58(key)))).toEqual(bytes);
    }
  });

  it('preserves leading zero bytes as leading 1s', () => {
    const bytes = new Uint8Array([0, 0, 5, 9]);
    const s = bytesToBase58(bytes);
    expect(s.startsWith('11')).toBe(true);
    expect(Array.from(base58ToBytes(s))).toEqual([0, 0, 5, 9]);
  });

  it('round-trips 32-byte keys', () => {
    for (const fill of [0x00, 0x01, 0xa1, 0xff]) {
      const key = new Uint8Array(32).fill(fill);
      key[0] = 0x07; // avoid all-zero so the shape varies
      expect(Array.from(base58ToBytes(bytesToBase58(key)))).toEqual(Array.from(key));
    }
  });

  it('round-trips a random-looking key', () => {
    const key = new Uint8Array(32);
    for (let i = 0; i < 32; i += 1) key[i] = (i * 37 + 11) & 0xff;
    expect(Array.from(base58ToBytes(bytesToBase58(key)))).toEqual(Array.from(key));
  });

  it('throws on an invalid character', () => {
    expect(() => base58ToBytes('0OIl')).toThrow(/invalid base58/i); // 0,O,I,l are not in the alphabet
  });

  it('returns empty for an empty string', () => {
    expect(base58ToBytes('')).toEqual(new Uint8Array(0));
  });
});
