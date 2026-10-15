import './setup';
import { State } from '../decorators/state';
import { Logic } from '../decorators/logic';
import { View } from '../decorators/view';

const seen: unknown[] = [];

// @Logic registers only the methods the manifest lists, so it must be set before the classes.
(globalThis as any).__CALIMERO_ABI_MANIFEST__ = {
  schema_version: 'wasm-abi/1',
  types: {
    Rec: { kind: 'record', fields: [{ name: 'x', type: { kind: 'u8' } }] },
    Wide: { kind: 'record', fields: [{ name: 'x', type: { kind: 'u64' } }] },
  },
  methods: [
    { name: 'setTemp', params: [{ name: 'c', type: { kind: 'u32' } }], returns: null },
    {
      name: 'setTags',
      params: [
        { name: 'm', type: { kind: 'map', key: { kind: 'u32' }, value: { kind: 'string' } } },
      ],
      returns: null,
    },
    {
      name: 'two',
      params: [
        { name: 'a', type: { $ref: 'Rec' } },
        { name: 'b', type: { kind: 'u8' } },
      ],
      returns: null,
    },
    {
      name: 'wide',
      params: [
        { name: 'a', type: { $ref: 'Wide' } },
        { name: 'b', type: { kind: 'u8' } },
      ],
      returns: null,
    },
  ],
  events: [],
};

@State
class ReproState {}

@Logic(ReproState)
class ReproLogic extends ReproState {
  @View()
  setTemp(c: number): void {
    seen.push(c);
  }
  @View()
  setTags(m: Map<number, string>): void {
    seen.push(m);
  }
  @View()
  two(a: { x: number }, b: number): void {
    seen.push([a, b]);
  }
  @View()
  wide(a: { x: bigint }, b: number): void {
    seen.push([a, b]);
  }
}
void ReproLogic;

// Loading the dispatcher after the classes are registered installs globalThis[method].
// eslint-disable-next-line @typescript-eslint/no-var-requires
require('../runtime/dispatcher');

function call(method: string, json: string): unknown {
  const bytes = new TextEncoder().encode(json);
  const env = (global as any).env;
  env.input = () => {};
  env.read_root_state = () => 0;
  env.register_len = () => BigInt(bytes.length);
  env.read_register = (_r: bigint, buf: Uint8Array) => {
    buf.set(bytes);
    return true;
  };
  seen.length = 0;
  (globalThis as any)[method]();
  return seen[0];
}

describe('JSON arguments through the dispatcher', () => {
  it('passes narrow integers through; the serializer range-checks them on write', () => {
    expect(call('setTemp', '{"c": -5}')).toBe(-5);
    expect(call('setTemp', '{"c": 21.5}')).toBe(21.5);
    expect(call('setTemp', '{"c": 1760000000000}')).toBe(1760000000000);
  });

  it('accepts a narrow integer map key, which JSON writes as a string', () => {
    expect((call('setTags', '{"m": {"1": "a"}}') as Map<unknown, unknown>).size).toBe(1);
  });

  it('does not run the method when a wide integer argument is out of range', () => {
    expect(() => call('wide', '{"x": "-5"}')).toThrow();
    expect(seen).toEqual([]);
  });
});
