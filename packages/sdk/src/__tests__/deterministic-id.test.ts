import './setup';
import { computeCollectionId, computeEntryId, ROOT_ID } from '../utils/deterministic-id';
import { assignDeterministicIds } from '../runtime/deterministic-ids';
import { bytesToHex } from '../utils/hex';
import { UnorderedMap } from '../collections/UnorderedMap';
import { Vector } from '../collections/Vector';

function toHex(bytes: Uint8Array): string {
  return bytesToHex(bytes);
}

describe('deterministic id derivation', () => {
  it('is stable: the same field path yields the same id', () => {
    const a = computeCollectionId(ROOT_ID, 'items');
    const b = computeCollectionId(ROOT_ID, 'items');
    expect(a.length).toBe(32);
    expect(toHex(a)).toBe(toHex(b));
  });

  it('produces distinct ids for distinct field names', () => {
    const items = computeCollectionId(ROOT_ID, 'items');
    const notes = computeCollectionId(ROOT_ID, 'notes');
    expect(toHex(items)).not.toBe(toHex(notes));
  });

  it('separates collection ids from entry ids (domain separation)', () => {
    const key = new TextEncoder().encode('items');
    const collection = computeCollectionId(ROOT_ID, 'items');
    const entry = computeEntryId(ROOT_ID, key);
    expect(toHex(collection)).not.toBe(toHex(entry));
  });

  it('distinguishes parent scope from the null (root-less) scope', () => {
    const withParent = computeCollectionId(ROOT_ID, 'items');
    const withoutParent = computeCollectionId(null, 'items');
    expect(toHex(withParent)).not.toBe(toHex(withoutParent));
  });
});

describe('assignDeterministicIds', () => {
  it('re-opens top-level collection fields at their deterministic id', () => {
    const state: Record<string, unknown> = {
      items: new UnorderedMap<string, string>(),
      log: new Vector<string>(),
    };

    const itemsRandomId = (state.items as UnorderedMap<string, string>).id();
    assignDeterministicIds(state);

    const expectedItems = toHex(computeCollectionId(ROOT_ID, 'items'));
    const expectedLog = toHex(computeCollectionId(ROOT_ID, 'log'));

    expect((state.items as UnorderedMap<string, string>).id()).toBe(expectedItems);
    expect((state.log as Vector<string>).id()).toBe(expectedLog);
    // Field was actually re-keyed off its original random id.
    expect((state.items as UnorderedMap<string, string>).id()).not.toBe(itemsRandomId);
  });

  it('is idempotent (a second pass leaves ids unchanged)', () => {
    const state: Record<string, unknown> = { items: new UnorderedMap<string, string>() };
    assignDeterministicIds(state);
    const first = (state.items as UnorderedMap<string, string>).id();
    assignDeterministicIds(state);
    expect((state.items as UnorderedMap<string, string>).id()).toBe(first);
  });

  it('two independent nodes derive the same id per logical field', () => {
    const nodeA: Record<string, unknown> = { notes: new UnorderedMap<string, string>() };
    const nodeB: Record<string, unknown> = { notes: new UnorderedMap<string, string>() };
    assignDeterministicIds(nodeA);
    assignDeterministicIds(nodeB);
    expect((nodeA.notes as UnorderedMap<string, string>).id()).toBe(
      (nodeB.notes as UnorderedMap<string, string>).id()
    );
  });

  it('ignores non-collection fields', () => {
    const state: Record<string, unknown> = { owner: 'alice', count: 3 };
    expect(() => assignDeterministicIds(state)).not.toThrow();
    expect(state.owner).toBe('alice');
    expect(state.count).toBe(3);
  });
});
