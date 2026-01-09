/**
 * Tests for JSON serialization in valueReturn
 *
 * This test verifies that problematic types (BigInt, TypedArrays, undefined, etc.)
 * are properly converted to JSON-compatible formats when returned via valueReturn,
 * preventing JSON.stringify errors.
 */

import './setup';
import { valueReturn, readRegister, registerLen } from '../env/api';
import type { AbiManifest } from '../abi/types';
import { Event as EventDecorator } from '../decorators/event';
import type { AppEvent } from '../events/types';

const REGISTER_ID = 0n;

// Helper to set up ABI manifest for testing
function setupAbi(abi: AbiManifest): void {
  (globalThis as any).__CALIMERO_ABI_MANIFEST__ = abi;
}

// Helper to create a minimal ABI manifest
function createAbi(overrides: Partial<AbiManifest>): AbiManifest {
  return {
    schema_version: '1.0.0',
    methods: [],
    events: [],
    types: {},
    ...overrides,
  };
}

// Helper to get the returned value from the register
function getReturnedValue(): string {
  const len = Number(registerLen());
  if (len === 0) {
    return '';
  }
  const buf = new Uint8Array(len);
  readRegister(REGISTER_ID, buf);
  return new TextDecoder().decode(buf);
}

describe('JSON serialization in valueReturn', () => {
  afterEach(() => {
    delete (globalThis as any).__CALIMERO_ABI_MANIFEST__;
  });

  it('should convert simple BigInt (u64) to string', () => {
    const abi = createAbi({
      methods: [
        {
          name: 'getValue',
          params: [],
          returns: { kind: 'scalar', scalar: 'u64' },
        },
      ],
    });

    setupAbi(abi);
    valueReturn(12345678901234567890n, 'getValue');

    const returned = getReturnedValue();
    expect(returned).toBe('"12345678901234567890"');
  });

  it('should convert BigInt (i64) to string', () => {
    const abi = createAbi({
      methods: [
        {
          name: 'getValue',
          params: [],
          returns: { kind: 'scalar', scalar: 'i64' },
        },
      ],
    });

    setupAbi(abi);
    valueReturn(-12345678901234567890n, 'getValue');

    const returned = getReturnedValue();
    expect(returned).toBe('"-12345678901234567890"');
  });

  it('should convert BigInt (u128) to string', () => {
    const abi = createAbi({
      methods: [
        {
          name: 'getValue',
          params: [],
          returns: { kind: 'scalar', scalar: 'u128' },
        },
      ],
    });

    setupAbi(abi);
    const largeValue = BigInt('340282366920938463463374607431768211455'); // Max u128
    valueReturn(largeValue, 'getValue');

    const returned = getReturnedValue();
    expect(returned).toBe('"340282366920938463463374607431768211455"');
  });

  it('should handle BigInt in nested objects', () => {
    const abi = createAbi({
      methods: [
        {
          name: 'getData',
          params: [],
          returns: {
            kind: 'reference',
            name: 'Data',
          },
        },
      ],
      types: {
        Data: {
          kind: 'record',
          fields: [
            { name: 'id', type: { kind: 'scalar', scalar: 'u64' } },
            { name: 'name', type: { kind: 'scalar', scalar: 'string' } },
            { name: 'timestamp', type: { kind: 'scalar', scalar: 'u64' } },
          ],
        },
      },
    });

    setupAbi(abi);
    const data = {
      id: 123n,
      name: 'test',
      timestamp: 9876543210n,
    };
    valueReturn(data, 'getData');

    const returned = getReturnedValue();
    const parsed = JSON.parse(returned);
    expect(parsed.id).toBe('123');
    expect(parsed.name).toBe('test');
    expect(parsed.timestamp).toBe('9876543210');
    expect(typeof parsed.id).toBe('string');
    expect(typeof parsed.timestamp).toBe('string');
  });

  it('should handle BigInt in arrays', () => {
    const abi = createAbi({
      methods: [
        {
          name: 'getValues',
          params: [],
          returns: {
            kind: 'vector',
            inner: { kind: 'scalar', scalar: 'u64' },
          },
        },
      ],
    });

    setupAbi(abi);
    const values = [1n, 2n, 3n, 1000000000000000000n];
    valueReturn(values, 'getValues');

    const returned = getReturnedValue();
    const parsed = JSON.parse(returned);
    expect(parsed).toEqual(['1', '2', '3', '1000000000000000000']);
    expect(parsed.every((v: string) => typeof v === 'string')).toBe(true);
  });

  it('should handle BigInt in complex nested structures', () => {
    const abi = createAbi({
      methods: [
        {
          name: 'getComplex',
          params: [],
          returns: {
            kind: 'reference',
            name: 'Complex',
          },
        },
      ],
      types: {
        Complex: {
          kind: 'record',
          fields: [
            { name: 'metadata', type: { kind: 'reference', name: 'Metadata' } },
            { name: 'values', type: { kind: 'vector', inner: { kind: 'scalar', scalar: 'u64' } } },
          ],
        },
        Metadata: {
          kind: 'record',
          fields: [
            { name: 'id', type: { kind: 'scalar', scalar: 'u64' } },
            { name: 'count', type: { kind: 'scalar', scalar: 'u64' } },
          ],
        },
      },
    });

    setupAbi(abi);
    const complex = {
      metadata: {
        id: 999n,
        count: 888n,
      },
      values: [111n, 222n, 333n],
    };
    valueReturn(complex, 'getComplex');

    const returned = getReturnedValue();
    const parsed = JSON.parse(returned);
    expect(parsed.metadata.id).toBe('999');
    expect(parsed.metadata.count).toBe('888');
    expect(parsed.values).toEqual(['111', '222', '333']);
  });

  it('should handle BigInt in map/object structures', () => {
    // Test that BigInt values in objects are properly converted
    const abi = createAbi({
      methods: [
        {
          name: 'getMap',
          params: [],
          returns: {
            kind: 'map',
            key: { kind: 'scalar', scalar: 'string' },
            value: { kind: 'scalar', scalar: 'u64' },
          },
        },
      ],
    });

    setupAbi(abi);
    const map = new Map([
      ['key1', 100n],
      ['key2', 200n],
    ]);
    valueReturn(map, 'getMap');

    const returned = getReturnedValue();
    const parsed = JSON.parse(returned);
    expect(parsed.key1).toBe('100');
    expect(parsed.key2).toBe('200');
    expect(typeof parsed.key1).toBe('string');
    expect(typeof parsed.key2).toBe('string');
  });

  it('should not throw when BigInt is in the return value', () => {
    const abi = createAbi({
      methods: [
        {
          name: 'getValue',
          params: [],
          returns: { kind: 'scalar', scalar: 'u64' },
        },
      ],
    });

    setupAbi(abi);

    // This should not throw
    expect(() => {
      valueReturn(12345678901234567890n, 'getValue');
    }).not.toThrow();

    const returned = getReturnedValue();
    expect(returned).toBe('"12345678901234567890"');
  });

  it('should handle TypedArrays (Int32Array, Float64Array, etc.)', () => {
    const abi = createAbi({
      methods: [
        {
          name: 'getData',
          params: [],
          returns: {
            kind: 'reference',
            name: 'Data',
          },
        },
      ],
      types: {
        Data: {
          kind: 'record',
          fields: [
            { name: 'intArray', type: { kind: 'scalar', scalar: 'string' } }, // Using string type to test fallback
            { name: 'floatArray', type: { kind: 'scalar', scalar: 'string' } },
          ],
        },
      },
    });

    setupAbi(abi);
    const data = {
      intArray: new Int32Array([1, 2, 3]),
      floatArray: new Float64Array([1.5, 2.5, 3.5]),
    };

    expect(() => {
      valueReturn(data, 'getData');
    }).not.toThrow();

    const returned = getReturnedValue();
    const parsed = JSON.parse(returned);
    expect(parsed.intArray).toEqual([1, 2, 3]);
    expect(parsed.floatArray).toEqual([1.5, 2.5, 3.5]);
  });

  it('should handle undefined values', () => {
    const abi = createAbi({
      methods: [
        {
          name: 'getData',
          params: [],
          returns: {
            kind: 'reference',
            name: 'Data',
          },
        },
      ],
      types: {
        Data: {
          kind: 'record',
          fields: [
            { name: 'value', type: { kind: 'scalar', scalar: 'string' } },
            { name: 'optional', type: { kind: 'scalar', scalar: 'string' }, nullable: true },
          ],
        },
      },
    });

    setupAbi(abi);
    const data = {
      value: 'test',
      optional: undefined,
    };

    expect(() => {
      valueReturn(data, 'getData');
    }).not.toThrow();

    const returned = getReturnedValue();
    const parsed = JSON.parse(returned);
    expect(parsed.value).toBe('test');
    expect(parsed.optional).toBe(null); // undefined should be converted to null
  });

  it('should handle NaN and Infinity', () => {
    const abi = createAbi({
      methods: [
        {
          name: 'getData',
          params: [],
          returns: {
            kind: 'reference',
            name: 'Data',
          },
        },
      ],
      types: {
        Data: {
          kind: 'record',
          fields: [
            { name: 'nanValue', type: { kind: 'scalar', scalar: 'f64' } },
            { name: 'infValue', type: { kind: 'scalar', scalar: 'f64' } },
          ],
        },
      },
    });

    setupAbi(abi);
    const data = {
      nanValue: NaN,
      infValue: Infinity,
    };

    expect(() => {
      valueReturn(data, 'getData');
    }).not.toThrow();

    const returned = getReturnedValue();
    const parsed = JSON.parse(returned);
    expect(parsed.nanValue).toBe(null);
    expect(parsed.infValue).toBe(null);
  });

  it('should handle Date objects', () => {
    const abi = createAbi({
      methods: [
        {
          name: 'getData',
          params: [],
          returns: {
            kind: 'reference',
            name: 'Data',
          },
        },
      ],
      types: {
        Data: {
          kind: 'record',
          fields: [{ name: 'timestamp', type: { kind: 'scalar', scalar: 'string' } }],
        },
      },
    });

    setupAbi(abi);
    const date = new Date('2024-01-01T00:00:00Z');
    const data = {
      timestamp: date,
    };

    expect(() => {
      valueReturn(data, 'getData');
    }).not.toThrow();

    const returned = getReturnedValue();
    const parsed = JSON.parse(returned);
    expect(parsed.timestamp).toBe(date.toISOString());
  });

  it('should handle invalid Date objects gracefully', () => {
    const abi = createAbi({
      methods: [
        {
          name: 'getData',
          params: [],
          returns: {
            kind: 'reference',
            name: 'Data',
          },
        },
      ],
      types: {
        Data: {
          kind: 'record',
          fields: [{ name: 'timestamp', type: { kind: 'scalar', scalar: 'string' } }],
        },
      },
    });

    setupAbi(abi);
    const invalidDate = new Date('invalid');
    const data = {
      timestamp: invalidDate,
    };

    // Should not throw even with invalid date
    expect(() => {
      valueReturn(data, 'getData');
    }).not.toThrow();

    const returned = getReturnedValue();
    const parsed = JSON.parse(returned);
    // Invalid dates should be converted to null (consistent with NaN/Infinity handling)
    expect(parsed.timestamp).toBe(null);
  });

  it('should handle RegExp objects', () => {
    const abi = createAbi({
      methods: [
        {
          name: 'getData',
          params: [],
          returns: {
            kind: 'reference',
            name: 'Data',
          },
        },
      ],
      types: {
        Data: {
          kind: 'record',
          fields: [{ name: 'pattern', type: { kind: 'scalar', scalar: 'string' } }],
        },
      },
    });

    setupAbi(abi);
    const regex = /test-pattern/gi;
    const data = {
      pattern: regex,
    };

    expect(() => {
      valueReturn(data, 'getData');
    }).not.toThrow();

    const returned = getReturnedValue();
    const parsed = JSON.parse(returned);
    expect(parsed.pattern).toBe('/test-pattern/gi');
  });

  it('should handle Uint8Array in events (via jsonStringifyReplacer)', () => {
    // Test that Uint8Array is handled by jsonStringifyReplacer
    // This is important for event serialization which doesn't use convertToJsonCompatible
    @EventDecorator
    class TestEvent {
      constructor(public data: Uint8Array) {}
    }

    const event: any = new TestEvent(new Uint8Array([1, 2, 3, 4, 5]));
    expect(event.serialize).toBeDefined();
    const serialized = event.serialize();
    const parsed = JSON.parse(serialized);

    // Uint8Array should be converted to array, not object with numeric keys
    expect(parsed.data).toEqual([1, 2, 3, 4, 5]);
    expect(Array.isArray(parsed.data)).toBe(true);
    expect(parsed.data).not.toEqual({ '0': 1, '1': 2, '2': 3, '3': 4, '4': 5 });
  });

  it('should handle circular references', () => {
    const abi = createAbi({
      methods: [
        {
          name: 'getData',
          params: [],
          returns: {
            kind: 'reference',
            name: 'Data',
          },
        },
      ],
      types: {
        Data: {
          kind: 'record',
          fields: [
            { name: 'name', type: { kind: 'scalar', scalar: 'string' } },
            { name: 'self', type: { kind: 'reference', name: 'Data' }, nullable: true },
          ],
        },
      },
    });

    setupAbi(abi);
    const data: any = {
      name: 'test',
    };
    // Create circular reference
    data.self = data;

    // Should not throw even with circular reference
    expect(() => {
      valueReturn(data, 'getData');
    }).not.toThrow();

    const returned = getReturnedValue();
    const parsed = JSON.parse(returned);
    expect(parsed.name).toBe('test');
    // Circular reference should be converted to '[Circular]'
    expect(parsed.self).toBe('[Circular]');
  });

  it('should NOT mark shared (non-circular) references as circular', () => {
    const abi = createAbi({
      methods: [
        {
          name: 'getData',
          params: [],
          returns: {
            kind: 'reference',
            name: 'Data',
          },
        },
      ],
      types: {
        Data: {
          kind: 'record',
          fields: [
            { name: 'a', type: { kind: 'reference', name: 'Shared' }, nullable: true },
            { name: 'b', type: { kind: 'reference', name: 'Shared' }, nullable: true },
          ],
        },
        Shared: {
          kind: 'record',
          fields: [{ name: 'value', type: { kind: 'scalar', scalar: 'string' } }],
        },
      },
    });

    setupAbi(abi);
    // Create a shared object (not circular, just referenced multiple times)
    const sharedObj = { value: 'shared' };
    const data = {
      a: sharedObj,
      b: sharedObj, // Same object, but NOT circular
    };

    // Should not throw
    expect(() => {
      valueReturn(data, 'getData');
    }).not.toThrow();

    const returned = getReturnedValue();
    const parsed = JSON.parse(returned);
    
    // Both references should be serialized correctly, NOT marked as [Circular]
    expect(parsed.a).toEqual({ value: 'shared' });
    expect(parsed.b).toEqual({ value: 'shared' });
    expect(parsed.a).not.toBe('[Circular]');
    expect(parsed.b).not.toBe('[Circular]');
  });
});
