import './setup';
import { BorshWriter } from '../borsh/encoder';
import { BorshReader } from '../borsh/decoder';
import { computeMergeResponse } from '../runtime/merge';
import { UnorderedMap } from '../collections/UnorderedMap';
import {
  loadRootState,
  saveRootState,
  serializeRootDocument,
  type RootDocument,
} from '../runtime/root';
import { computeCollectionId, ROOT_ID } from '../utils/deterministic-id';
import { bytesToHex } from '../utils/hex';

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

const derivedId = bytesToHex(computeCollectionId(ROOT_ID, 'items'));
const otherId = '00'.repeat(31) + '01';

function rootWithItemsAt(id: string, updatedAt: number): Uint8Array {
  const doc: RootDocument = {
    values: { title: 'notes' },
    collections: { items: { type: 'UnorderedMap', id } },
    metadata: { createdAt: 100, updatedAt },
  };
  return serializeRootDocument(doc);
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

describe('top-level collection ids in the root document', () => {
  beforeAll(() => {
    (globalThis as any).__CALIMERO_ABI_MANIFEST__ = ABI;
  });

  afterAll(() => {
    delete (globalThis as any).__CALIMERO_ABI_MANIFEST__;
    delete (globalThis as any).env.read_root_state;
    delete (globalThis as any).env.persist_root_state;
  });

  it('merges documents whose collection ids derive from the field name', () => {
    const response = computeMergeResponse(
      mergeRequest(rootWithItemsAt(derivedId, 200), rootWithItemsAt(derivedId, 300), 100n, 200n)
    );
    expect(responseTag(response)).toBe(0);
  });

  it('refuses to merge an incoming document that points a field at another collection', () => {
    const response = computeMergeResponse(
      mergeRequest(rootWithItemsAt(derivedId, 200), rootWithItemsAt(otherId, 300), 100n, 200n)
    );
    expect(responseTag(response)).toBe(1);
  });

  it('takes a valid incoming document verbatim on the bootstrap path', () => {
    const incoming = rootWithItemsAt(derivedId, 300);
    const response = new BorshReader(
      computeMergeResponse(mergeRequest(rootWithItemsAt(derivedId, 100), incoming, 100n, 100n))
    );
    expect(response.readU8()).toBe(0);
    expect(Array.from(response.readBytes())).toEqual(Array.from(incoming));
  });

  it('refuses such a document on the bootstrap path too', () => {
    const response = computeMergeResponse(
      mergeRequest(rootWithItemsAt(derivedId, 100), rootWithItemsAt(otherId, 300), 100n, 100n)
    );
    expect(responseTag(response)).toBe(1);
  });

  it('loads a field at the id derived from its name', () => {
    hostHoldsRoot(rootWithItemsAt(derivedId, 200));
    const state: any = loadRootState(class State {});
    expect(state.items.id()).toBe(derivedId);
  });

  it('refuses to load a stored document that points a field at another collection', () => {
    hostHoldsRoot(rootWithItemsAt(otherId, 200));
    expect(() => loadRootState(class State {})).toThrow(/items/);
  });

  it('refuses to save a field that holds a collection created at another id', () => {
    const persisted: Uint8Array[] = [];
    (globalThis as any).env.persist_root_state = (doc: Uint8Array) => persisted.push(doc);
    const state = { title: 'notes', items: new UnorderedMap<string, string>() };

    expect(() => saveRootState(state)).toThrow(/items/);
    expect(persisted).toEqual([]);
  });
});
