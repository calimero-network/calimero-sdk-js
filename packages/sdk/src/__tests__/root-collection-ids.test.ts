import './setup';
import '../collections/UnorderedSet';
import { BorshWriter } from '../borsh/encoder';
import { BorshReader } from '../borsh/decoder';
import { computeMergeResponse } from '../runtime/merge';
import { SharedStorage } from '../collections/SharedStorage';
import { UnorderedMap } from '../collections/UnorderedMap';
import { mapNewWithId, sharedNewWithId, sharedWriters } from '../runtime/storage-wasm';
import {
  loadRootState,
  parseRootDocument,
  saveRootState,
  serializeRootDocument,
  type RootDocument,
} from '../runtime/root';
import { StateManager } from '../runtime/state-manager';
import { computeCollectionId, ROOT_ID } from '../utils/deterministic-id';
import { bytesToHex, hexToBytes } from '../utils/hex';

const ABI = {
  schema_version: 'wasm-abi/1',
  types: {
    State: {
      kind: 'record',
      fields: [{ name: 'title', type: { kind: 'scalar', scalar: 'string' } }],
    },
  },
  methods: [],
  events: [],
  state_root: 'State',
};

// The same state, with a value field named like the collection field and shaped like its wrapper.
const SHADOWING_ABI = {
  ...ABI,
  types: {
    State: {
      kind: 'record',
      fields: [
        { name: 'title', type: { kind: 'scalar', scalar: 'string' } },
        { name: 'items', type: { kind: 'reference', name: 'Shadow' } },
      ],
    },
    Shadow: {
      kind: 'record',
      fields: [{ name: 'mapId', type: { kind: 'scalar', scalar: 'string' } }],
    },
  },
};

const OK = 0;
const REFUSED = 2;

const derivedId = (field: string) => bytesToHex(computeCollectionId(ROOT_ID, field));
const otherId = '00'.repeat(31) + '01';

function rootWith(
  items: { type?: string; id?: string },
  updatedAt: number,
  values: Record<string, unknown> = { title: 'notes' }
): Uint8Array {
  const doc: RootDocument = {
    values,
    collections: {
      items: { type: items.type ?? 'UnorderedMap', id: items.id ?? derivedId('items') },
    },
    metadata: { createdAt: 100, updatedAt },
  };
  return serializeRootDocument(doc);
}

function rootWithExtra(extra: Record<string, { type?: string; id: string }>): Uint8Array {
  return serializeRootDocument({
    values: { title: 'notes' },
    collections: { items: { type: 'UnorderedMap', id: derivedId('items') }, ...extra } as any,
    metadata: { createdAt: 100, updatedAt: 200 },
  });
}

function rootWithout(): Uint8Array {
  return serializeRootDocument({
    values: { title: 'notes' },
    collections: {},
    metadata: { createdAt: 100, updatedAt: 200 },
  });
}

function mergeRequest(
  existing: Uint8Array,
  incoming: Uint8Array,
  existingCreatedAt: bigint,
  existingTs: bigint
): Uint8Array {
  const writer = new BorshWriter();
  writer.writeBytes(existing);
  writer.writeBytes(incoming);
  writer.writeU64(existingCreatedAt);
  writer.writeU64(existingTs);
  writer.writeU64(300n);
  return writer.toBytes();
}

function responseTag(response: Uint8Array): number {
  return new BorshReader(response).readU8();
}

function hostHoldsRoot(bytes: Uint8Array): void {
  const env = (globalThis as any).env;
  env.read_root_state = () => {
    env.value_return(bytes);
    return 1;
  };
}

describe('top-level collections in the root document', () => {
  const persisted: Uint8Array[] = [];

  beforeAll(() => {
    (globalThis as any).__CALIMERO_ABI_MANIFEST__ = ABI;
    (globalThis as any).env.persist_root_state = (doc: Uint8Array) => persisted.push(doc);
  });

  beforeEach(() => {
    persisted.length = 0;
    (globalThis as any).__CALIMERO_STATE_FIELD_TYPES__ = { items: 'UnorderedMap' };
  });

  afterAll(() => {
    delete (globalThis as any).__CALIMERO_ABI_MANIFEST__;
    delete (globalThis as any).__CALIMERO_STATE_FIELD_TYPES__;
    delete (globalThis as any).env.read_root_state;
    delete (globalThis as any).env.persist_root_state;
  });

  it('merges documents whose collections match their fields', () => {
    const response = computeMergeResponse(
      mergeRequest(rootWith({}, 200), rootWith({}, 300), 100n, 200n)
    );
    expect(responseTag(response)).toBe(OK);
  });

  it('refuses to merge an incoming document that points a field at another collection', () => {
    const response = computeMergeResponse(
      mergeRequest(rootWith({}, 200), rootWith({ id: otherId }, 300), 100n, 200n)
    );
    expect(responseTag(response)).toBe(REFUSED);
  });

  it('refuses to merge an incoming document that gives a field another collection type', () => {
    const response = computeMergeResponse(
      mergeRequest(rootWith({}, 200), rootWith({ type: 'UnorderedSet' }, 300), 100n, 200n)
    );
    expect(responseTag(response)).toBe(REFUSED);
  });

  it('takes a valid incoming document verbatim on the bootstrap path', () => {
    const incoming = rootWith({}, 300);
    const response = new BorshReader(
      computeMergeResponse(mergeRequest(rootWith({}, 100), incoming, 100n, 100n))
    );
    expect(response.readU8()).toBe(OK);
    expect(Array.from(response.readBytes())).toEqual(Array.from(incoming));
  });

  it('refuses a mismatched document on the bootstrap path too', () => {
    for (const items of [{ id: otherId }, { type: 'UnorderedSet' }]) {
      const response = computeMergeResponse(
        mergeRequest(rootWith({}, 100), rootWith(items, 300), 100n, 100n)
      );
      expect(responseTag(response)).toBe(REFUSED);
    }
  });

  it('loads a field at the id derived from its name', () => {
    hostHoldsRoot(rootWith({}, 200));
    const state: any = loadRootState(class State {});
    expect(state.items.id()).toBe(derivedId('items'));
  });

  it('refuses to load a stored document that points a field at another collection', () => {
    hostHoldsRoot(rootWith({ id: otherId }, 200));
    expect(() => loadRootState(class State {})).toThrow(/items/);
  });

  it('refuses to load a stored document that gives a field another collection type', () => {
    hostHoldsRoot(rootWith({ type: 'UnorderedSet' }, 200));
    expect(() => loadRootState(class State {})).toThrow(/items/);
  });

  it('never copies stored values onto a collection field', () => {
    (globalThis as any).__CALIMERO_ABI_MANIFEST__ = SHADOWING_ABI;
    try {
      hostHoldsRoot(rootWith({}, 200, { title: 'notes', items: { mapId: otherId } }));
      const state: any = loadRootState(class State {});
      expect(state.items.mapId).not.toBe(otherId);
      expect(state.items.id()).toBe(derivedId('items'));
    } finally {
      (globalThis as any).__CALIMERO_ABI_MANIFEST__ = ABI;
    }
  });

  it('refuses to save a field that holds a collection created at another id', () => {
    const state = { title: 'notes', items: new UnorderedMap<string, string>() };

    expect(() => saveRootState(state)).toThrow(/items/);
    expect(persisted).toEqual([]);
  });

  it('refuses to merge an incoming document that lacks a declared collection field', () => {
    const response = computeMergeResponse(
      mergeRequest(rootWith({}, 200), rootWithout(), 100n, 200n)
    );
    expect(responseTag(response)).toBe(REFUSED);
  });

  it('surfaces a refused stored document instead of starting from fresh state', () => {
    class Notes {
      title = '';
      items = new UnorderedMap<string, string>();
    }
    hostHoldsRoot(rootWith({ id: otherId }, 200));
    StateManager.setStateClass(Notes);
    StateManager.setCurrent(null);

    expect(() => StateManager.load()).toThrow(/items/);
  });

  it('refuses a stored document that lacks a collection field added in an upgrade', () => {
    class NotesV2 {
      title = '';
      items = new UnorderedMap<string, string>();
      tags = new UnorderedMap<string, string>();
    }
    (globalThis as any).__CALIMERO_STATE_FIELD_TYPES__ = {
      items: 'UnorderedMap',
      tags: 'UnorderedMap',
    };
    hostHoldsRoot(rootWith({}, 200));
    StateManager.setStateClass(NotesV2);
    StateManager.setCurrent(null);

    expect(() => StateManager.load()).toThrow(/tags/);
  });

  it('refuses, without touching it, a missing field whose id a collection already holds', () => {
    class Notes {
      title = '';
      items = new UnorderedMap<string, string>();
    }
    mapNewWithId(hexToBytes(derivedId('items')));
    new UnorderedMap<string, string>({ id: derivedId('items') }).set('planted', 'yes');
    hostHoldsRoot(rootWithout());
    StateManager.setStateClass(Notes);
    StateManager.setCurrent(null);

    expect(() => StateManager.load()).toThrow(/items/);
    expect(new UnorderedMap<string, string>({ id: derivedId('items') }).get('planted')).toBe('yes');
  });

  it('refuses, without touching it, a missing shared field whose id a cell already holds', () => {
    const owner = new Uint8Array(32).fill(7);
    const caller = new Uint8Array(32).fill(9);
    class Settings {
      title = '';
      config = new SharedStorage<string>({ writers: [caller] });
    }
    (globalThis as any).__CALIMERO_STATE_FIELD_TYPES__ = { config: 'SharedStorage' };
    const cellId = hexToBytes(derivedId('config'));
    sharedNewWithId(cellId, owner, false);
    hostHoldsRoot(rootWithout());
    StateManager.setStateClass(Settings);
    StateManager.setCurrent(null);

    expect(() => StateManager.load()).toThrow(/config/);
    expect(sharedWriters(cellId)).toEqual([owner]);
  });

  it('keeps refusing when the stored root is refused, even with a valid incoming root', () => {
    const incoming = rootWith({}, 300);
    for (const existing of [rootWith({ id: otherId }, 200), new Uint8Array([1, 2, 3])]) {
      const response = computeMergeResponse(mergeRequest(existing, incoming, 100n, 200n));
      expect(responseTag(response)).toBe(REFUSED);
    }
  });

  it('never persists an undeclared collection a later version could adopt', () => {
    const squatted = rootWithExtra({ added: { type: 'UnorderedMap', id: derivedId('added') } });
    const persistedByV1 = [
      computeMergeResponse(mergeRequest(rootWith({}, 100), squatted, 100n, 100n)),
      computeMergeResponse(mergeRequest(rootWith({}, 200), squatted, 100n, 200n)),
    ].map(response => {
      const reader = new BorshReader(response);
      expect(reader.readU8()).toBe(OK);
      return reader.readBytes();
    });

    (globalThis as any).__CALIMERO_STATE_FIELD_TYPES__ = {
      items: 'UnorderedMap',
      added: 'UnorderedMap',
    };
    for (const stored of persistedByV1) {
      expect(() => parseRootDocument(stored)).toThrow(/added/);
    }
  });

  it('keeps the stored root when only the incoming one is refused', () => {
    const response = computeMergeResponse(
      mergeRequest(rootWith({}, 200), rootWith({ id: otherId }, 300), 100n, 200n)
    );
    expect(responseTag(response)).toBe(REFUSED);
  });

  it('drops stored collections whose field the app no longer declares', () => {
    const stored = rootWithExtra({
      removed: { type: 'UnorderedMap', id: derivedId('removed') },
      untyped: { id: otherId },
    });

    hostHoldsRoot(stored);
    const state: any = loadRootState(class State {});
    expect(state.items.id()).toBe(derivedId('items'));
    expect(state.removed).toBeUndefined();
    expect(state.untyped).toBeUndefined();

    const response = new BorshReader(
      computeMergeResponse(mergeRequest(stored, rootWith({}, 300), 100n, 200n))
    );
    expect(response.readU8()).toBe(OK);
    expect(Object.keys(parseRootDocument(response.readBytes()).collections)).toEqual(['items']);
  });

  it('refuses to save a collection field the app does not declare', () => {
    const state = {
      title: 'notes',
      items: new UnorderedMap<string, string>({ id: derivedId('items') }),
      extra: new UnorderedMap<string, string>({ id: derivedId('extra') }),
    };
    expect(() => saveRootState(state)).toThrow(/extra/);
    expect(persisted).toEqual([]);
  });
});
