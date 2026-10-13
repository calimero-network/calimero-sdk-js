/**
 * Integer fields refuse values outside their ABI range instead of wrapping
 */

import './setup';
import { serializeWithAbi } from '../utils/abi-serialize';
import type { AbiManifest, ScalarType } from '../abi/types';

const abi = { types: {} } as unknown as AbiManifest;

const write = (scalar: ScalarType, value: unknown) =>
  serializeWithAbi(value, { kind: scalar } as never, abi);

describe('integer range checks', () => {
  it.each([
    ['u8', 255, 256],
    ['u8', 0, -1],
    ['u16', 65535, 65536],
    ['u32', 4294967295, 4294967296],
    ['u32', 0, -1],
    ['i8', 127, 128],
    ['i8', -128, -129],
    ['i16', 32767, 32768],
    ['i16', -32768, -32769],
    ['i32', 2147483647, 2147483648],
    ['i32', -2147483648, -2147483649],
  ] as [ScalarType, number, number][])('%s accepts %d and refuses %d', (scalar, ok, bad) => {
    expect(() => write(scalar, ok)).not.toThrow();
    expect(() => write(scalar, bad)).toThrow(/out of range/);
  });

  it.each([
    ['u64', 2n ** 64n - 1n, 2n ** 64n],
    ['u64', 0n, -1n],
    ['i64', 2n ** 63n - 1n, 2n ** 63n],
    ['i64', -(2n ** 63n), -(2n ** 63n) - 1n],
    ['u128', 2n ** 128n - 1n, 2n ** 128n],
    ['u128', 0n, -1n],
    ['i128', 2n ** 127n - 1n, 2n ** 127n],
    ['i128', -(2n ** 127n), -(2n ** 127n) - 1n],
  ] as [ScalarType, bigint, bigint][])('%s accepts %s and refuses %s', (scalar, ok, bad) => {
    expect(() => write(scalar, ok)).not.toThrow();
    expect(() => write(scalar, bad)).toThrow(/out of range/);
  });

  it('refuses a fractional or non-finite value for an integer field', () => {
    for (const bad of [1.5, NaN, Infinity]) {
      expect(() => write('u32', bad)).toThrow(/integer/);
    }
    expect(() => write('u64', 1.5)).toThrow();
  });

  it('does not stop a negative number reaching i64', () => {
    expect(write('i64', -1)).toEqual(new Uint8Array(8).fill(0xff));
  });
});
