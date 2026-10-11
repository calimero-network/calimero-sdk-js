import './setup';
import type { AbiManifest } from '../abi/types';
import { registerLogic } from '../runtime/method-registry';
import { StateManager } from '../runtime/state-manager';

const ABI: AbiManifest = {
  schema_version: '1.0.0',
  methods: [
    { name: 'init', params: [], is_init: true },
    { name: 'claim', params: [] },
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
}

const UNDECODABLE_ROOT = new Uint8Array([2, 0, 0, 0, 0]);

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
    registerLogic(StoreLogic, ['claim'], Store);
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
    expect(persists).toBe(2);
    expect(() => call('init')).toThrow('Contract state already initialized');
    expect(persists).toBe(2);
  });

  it('aborts a call when the stored root cannot be decoded, leaving it untouched', () => {
    root = UNDECODABLE_ROOT;

    expect(() => call('claim')).toThrow('Unsupported state format version');
    expect(persists).toBe(0);
    expect(root).toBe(UNDECODABLE_ROOT);
  });

  it('refuses init when a root exists, even an undecodable one', () => {
    root = UNDECODABLE_ROOT;

    expect(() => call('init')).toThrow('Contract state already initialized');
    expect(persists).toBe(0);
    expect(root).toBe(UNDECODABLE_ROOT);
  });
});
