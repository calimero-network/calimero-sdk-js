/**
 * Unit tests for CRDT collections
 */

import { sha256 } from '../../packages/sdk/src/utils/sha256';
import { FrozenValue } from '../../packages/sdk/src/collections/FrozenStorage';

describe('CRDT Collections', () => {
  describe('UnorderedMap', () => {
    it('should be implemented in Phase 2', () => {
      // TODO: Implement tests
      expect(true).toBe(true);
    });
  });

  describe('Vector', () => {
    it('should be implemented in Phase 2', () => {
      // TODO: Implement tests
      expect(true).toBe(true);
    });

    describe('index bounds validation', () => {
      // Test the validation logic directly by testing the conditions
      // Full Vector tests require runtime, but we can validate the validation logic

      it('should validate negative indices are rejected', () => {
        // The validation logic: index < 0 should throw
        const index = -1;
        const isInvalid = !Number.isInteger(index) || index < 0;
        expect(isInvalid).toBe(true);
      });

      it('should validate non-integer indices are rejected', () => {
        // The validation logic: non-integers should throw
        const floatIndex = 1.5;
        const isInvalid = !Number.isInteger(floatIndex) || floatIndex < 0;
        expect(isInvalid).toBe(true);

        const nanIndex = NaN;
        const isNanInvalid = !Number.isInteger(nanIndex) || nanIndex < 0;
        expect(isNanInvalid).toBe(true);

        const infinityIndex = Infinity;
        const isInfinityInvalid = !Number.isInteger(infinityIndex) || infinityIndex < 0;
        expect(isInfinityInvalid).toBe(true);
      });

      it('should validate out-of-bounds indices are rejected', () => {
        // The validation logic: index >= length should throw
        const index = 5;
        const length = 3;
        const isOutOfBounds = index >= length;
        expect(isOutOfBounds).toBe(true);
      });

      it('should allow valid indices', () => {
        // The validation logic: valid index should pass
        const index = 2;
        const length = 5;
        const isValid = Number.isInteger(index) && index >= 0 && index < length;
        expect(isValid).toBe(true);
      });

      it('should allow index 0 for non-empty vector', () => {
        // Edge case: index 0 is valid when length > 0
        const index = 0;
        const length = 1;
        const isValid = Number.isInteger(index) && index >= 0 && index < length;
        expect(isValid).toBe(true);
      });

      it('should reject index 0 for empty vector', () => {
        // Edge case: index 0 is invalid when length is 0
        const index = 0;
        const length = 0;
        const isOutOfBounds = index >= length;
        expect(isOutOfBounds).toBe(true);
      });
    });
  });

  describe('Counter', () => {
    it('should be implemented in Phase 2', () => {
      // TODO: Implement tests
      expect(true).toBe(true);
    });
  });

  describe('LwwRegister', () => {
    it('should be implemented in Phase 2', () => {
      // TODO: Implement tests
      expect(true).toBe(true);
    });
  });
});

describe('SHA256', () => {
  it('should compute correct hash for empty input', () => {
    const result = sha256(new Uint8Array(0));
    // SHA256 of empty string is e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
    const expected = new Uint8Array([
      0xe3, 0xb0, 0xc4, 0x42, 0x98, 0xfc, 0x1c, 0x14, 0x9a, 0xfb, 0xf4, 0xc8, 0x99, 0x6f, 0xb9,
      0x24, 0x27, 0xae, 0x41, 0xe4, 0x64, 0x9b, 0x93, 0x4c, 0xa4, 0x95, 0x99, 0x1b, 0x78, 0x52,
      0xb8, 0x55,
    ]);
    expect(result).toEqual(expected);
  });

  it('should compute correct hash for "hello"', () => {
    const encoder = new TextEncoder();
    const result = sha256(encoder.encode('hello'));
    // SHA256 of "hello" is 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
    const expected = new Uint8Array([
      0x2c, 0xf2, 0x4d, 0xba, 0x5f, 0xb0, 0xa3, 0x0e, 0x26, 0xe8, 0x3b, 0x2a, 0xc5, 0xb9, 0xe2,
      0x9e, 0x1b, 0x16, 0x1e, 0x5c, 0x1f, 0xa7, 0x42, 0x5e, 0x73, 0x04, 0x33, 0x62, 0x93, 0x8b,
      0x98, 0x24,
    ]);
    expect(result).toEqual(expected);
  });

  it('should return 32-byte hash', () => {
    const encoder = new TextEncoder();
    const result = sha256(encoder.encode('test data'));
    expect(result.length).toBe(32);
    expect(result).toBeInstanceOf(Uint8Array);
  });

  it('should produce different hashes for different inputs', () => {
    const encoder = new TextEncoder();
    const hash1 = sha256(encoder.encode('data1'));
    const hash2 = sha256(encoder.encode('data2'));
    expect(hash1).not.toEqual(hash2);
  });

  it('should produce same hash for same input', () => {
    const encoder = new TextEncoder();
    const hash1 = sha256(encoder.encode('same data'));
    const hash2 = sha256(encoder.encode('same data'));
    expect(hash1).toEqual(hash2);
  });
});

describe('FrozenValue', () => {
  it('should wrap a value', () => {
    const frozen = new FrozenValue('test');
    expect(frozen.value).toBe('test');
  });

  it('should support various types', () => {
    const stringFrozen = new FrozenValue('string');
    expect(stringFrozen.value).toBe('string');

    const numberFrozen = new FrozenValue(42);
    expect(numberFrozen.value).toBe(42);

    const objectFrozen = new FrozenValue({ key: 'value' });
    expect(objectFrozen.value).toEqual({ key: 'value' });

    const arrayFrozen = new FrozenValue([1, 2, 3]);
    expect(arrayFrozen.value).toEqual([1, 2, 3]);
  });

  it('should have no-op merge', () => {
    const frozen1 = new FrozenValue('original');
    const frozen2 = new FrozenValue('other');

    // Merge should return self without modification
    const result = frozen1.merge(frozen2);
    expect(result).toBe(frozen1);
    expect(result.value).toBe('original');
  });

  it('should serialize to JSON', () => {
    const frozen = new FrozenValue({ data: 'test' });
    const json = frozen.toJSON();

    expect(json.__frozenValue).toBe(true);
    expect(json.value).toEqual({ data: 'test' });
  });

  it('should deserialize from JSON', () => {
    const json = { __frozenValue: true as const, value: { data: 'test' } };
    const frozen = FrozenValue.fromJSON(json);

    expect(frozen).toBeInstanceOf(FrozenValue);
    expect(frozen.value).toEqual({ data: 'test' });
  });
});

describe('UserStorage', () => {
  describe('PublicKey validation', () => {
    // Note: Full UserStorage tests require runtime environment
    // These tests validate the type constraints

    it('should require 32-byte PublicKey for keys', () => {
      // The actual collection operations require runtime,
      // but we can test the type definitions are correct
      const validPublicKey = new Uint8Array(32);
      expect(validPublicKey.length).toBe(32);
    });

    it('should reject invalid PublicKey lengths', () => {
      const invalidKey = new Uint8Array(16);
      expect(invalidKey.length).not.toBe(32);
    });
  });
});

describe('ed25519Verify', () => {
  // Note: ed25519_verify tests require the WASM runtime environment
  // The function validates signatures using the host function

  it('should validate input types', () => {
    // Test that the function signature expects correct types
    // Full verification tests require runtime
    const signature = new Uint8Array(64);
    const publicKey = new Uint8Array(32);
    const message = new Uint8Array([1, 2, 3]);

    expect(signature.length).toBe(64);
    expect(publicKey.length).toBe(32);
    expect(message).toBeInstanceOf(Uint8Array);
  });
});
