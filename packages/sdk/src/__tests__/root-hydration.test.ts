import './setup';
import type { AbiManifest } from '../abi/types';
import { markMethodNonMutating, registerLogic } from '../runtime/method-registry';
import { StateManager } from '../runtime/state-manager';

const ABI: AbiManifest = {
  schema_version: '1.0.0',
  methods: [
    { name: 'init', params: [], is_init: true },
    { name: 'claim', params: [] },
    { name: 'getOwner', params: [], is_view: true },
  ],
  events: [],
  types: {
    Store: {
      kind: 'record',
      fields: [{ name: 'owner', type: { kind: 'scalar', scalar: 'string' } }],
    },
  },
  state_root: 'Store',
};

class Store {
  owner = '';
}

class StoreLogic extends Store {
  static init(): Store {
    const state = new Store();
    state.owner = 'alice';
    return state;
  }

  claim(): void {
    this.owner = 'mallory';
  }

  getOwner(): string {
    return this.owner;
  }
}

const UNDECODABLE_ROOTS: [string, Uint8Array][] = [
  ['an unknown format version', new Uint8Array([2, 0, 0, 0, 0])],
  ['an empty root', new Uint8Array(0)],
  ['a body truncated after the version byte', new Uint8Array([1, 5, 0, 0, 0, 1])],
];

let root: Uint8Array | null = null;
let register: Uint8Array | null = null;
let persists = 0;

Object.assign((globalThis as any).env, {
  input: () => {
    register = null;
  },
  register_len: () => BigInt(register?.length ?? 0),
  read_register: (_id: bigint, buf: Uint8Array) => {
    buf.set(register ?? []);
    return register !== null;
  },
  read_root_state: () => {
    register = root;
    return root ? 1 : 0;
  },
  persist_root_state: (doc: Uint8Array) => {
    root = doc.slice();
    persists++;
  },
  flush_delta: () => 1,
});

function call(method: string): void {
  (globalThis as any)[method]();
}

describe('root hydration', () => {
  beforeAll(() => {
    (globalThis as any).__CALIMERO_ABI_MANIFEST__ = ABI;
    (StoreLogic as any)._calimeroInitMethod = 'init';
    StateManager.setStateClass(Store);
    registerLogic(StoreLogic, ['claim', 'getOwner'], Store);
    markMethodNonMutating(StoreLogic, 'getOwner');
    require('../runtime/dispatcher');
  });

  beforeEach(() => {
    root = null;
    persists = 0;
  });

  it('initializes once and loads the persisted root afterwards', () => {
    call('init');
    expect(persists).toBe(1);

    call('claim');
    call('getOwner');
    expect(persists).toBe(2);
    expect(() => call('init')).toThrow('Contract state already initialized');
    expect(persists).toBe(2);
  });

  it.each(
    UNDECODABLE_ROOTS.flatMap(([name, bytes]) =>
      ['claim', 'getOwner'].map(method => [method, name, bytes] as const)
    )
  )('%s aborts on %s, leaving the root untouched', (method, _, bytes) => {
    root = bytes;

    expect(() => call(method)).toThrow();
    expect(persists).toBe(0);
    expect(root).toBe(bytes);
  });

  it.each(UNDECODABLE_ROOTS)('refuses init on %s', (_, bytes) => {
    root = bytes;

    expect(() => call('init')).toThrow('Contract state already initialized');
    expect(persists).toBe(0);
    expect(root).toBe(bytes);
  });
});
