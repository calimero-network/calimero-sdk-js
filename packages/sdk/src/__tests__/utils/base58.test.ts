/**
 * base58 encode/decode round-trip tests.
 */

import { bytesToBase58, base58ToBytes } from '../../env/api';

describe('base58', () => {
  it('decodes known standard-base58 values', () => {
    expect(Array.from(base58ToBytes('1'))).toEqual([0]); // one leading '1' = one zero byte
    expect(Array.from(base58ToBytes('11'))).toEqual([0, 0]); // no over-count
    expect(Array.from(base58ToBytes('2'))).toEqual([1]);
    expect(Array.from(base58ToBytes('z'))).toEqual([57]);
  });

  it('is the exact inverse of bytesToBase58 (incl. all-zero and leading-zero keys)', () => {
    for (const bytes of [[0], [0, 0], [0, 0, 42], [0, 7, 0, 9], [0, 255, 0, 1]]) {
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

  it('decodes a 32-byte key with leading zero bytes to exactly 32 bytes', () => {
    // The externally-produced case: a key starting with 0x00 has one leading '1'
    // in standard base58 and must decode back to 32 bytes (not 33).
    const key = new Uint8Array(32);
    key[0] = 0x00;
    key[1] = 0x00;
    for (let i = 2; i < 32; i += 1) key[i] = (i * 53 + 7) & 0xff;
    const decoded = base58ToBytes(bytesToBase58(key));
    expect(decoded.length).toBe(32);
    expect(Array.from(decoded)).toEqual(Array.from(key));
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
