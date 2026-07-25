import './setup';
import { BorshWriter } from '../borsh/encoder';
import { BorshReader } from '../borsh/decoder';
import {
  decodeMergeRootStateRequest,
  encodeMergeRootStateResponseOk,
  encodeMergeRootStateResponseErr,
  computeMergeResponse,
  mergeField,
  mergeRootValues,
  mergeRootCollections,
  mergeRootMetadata,
} from '../runtime/merge';

function buildRequest(
  existing: Uint8Array,
  incoming: Uint8Array,
  existingCreatedAt: bigint,
  existingTs: bigint,
  incomingTs: bigint
): Uint8Array {
  const writer = new BorshWriter();
  writer.writeBytes(existing);
  writer.writeBytes(incoming);
  writer.writeU64(existingCreatedAt);
  writer.writeU64(existingTs);
  writer.writeU64(incomingTs);
  return writer.toBytes();
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

describe('MergeRootStateRequest / Response codec', () => {
  it('round-trips a request through borsh', () => {
    const existing = new Uint8Array([1, 2, 3]);
    const incoming = new Uint8Array([9, 8, 7, 6]);
    const bytes = buildRequest(existing, incoming, 10n, 20n, 30n);

    const decoded = decodeMergeRootStateRequest(bytes);
    expect(bytesEqual(decoded.existing, existing)).toBe(true);
    expect(bytesEqual(decoded.incoming, incoming)).toBe(true);
    expect(decoded.existingCreatedAt).toBe(10n);
    expect(decoded.existingTs).toBe(20n);
    expect(decoded.incomingTs).toBe(30n);
  });

  it('encodes Ok as [0][vec<u8>]', () => {
    const payload = new Uint8Array([4, 5, 6]);
    const encoded = encodeMergeRootStateResponseOk(payload);
    const reader = new BorshReader(encoded);
    expect(reader.readU8()).toBe(0);
    expect(bytesEqual(reader.readBytes(), payload)).toBe(true);
  });

  it('encodes Err as [1][string]', () => {
    const encoded = encodeMergeRootStateResponseErr('boom');
    const reader = new BorshReader(encoded);
    expect(reader.readU8()).toBe(1);
    expect(reader.readString()).toBe('boom');
  });
});

describe('computeMergeResponse bootstrap fast-path', () => {
  it('returns Ok(incoming) verbatim when existing_created_at == existing_ts', () => {
    const existing = new Uint8Array([1, 1, 1]);
    const incoming = new Uint8Array([2, 2, 2, 2]);
    // created_at == ts -> existing side created but never written
    const request = buildRequest(existing, incoming, 42n, 42n, 99n);

    const response = computeMergeResponse(request);
    const reader = new BorshReader(response);
    expect(reader.readU8()).toBe(0); // Ok
    expect(bytesEqual(reader.readBytes(), incoming)).toBe(true);
  });

  it('does NOT take the fast-path when timestamps differ (falls through to parse)', () => {
    // existing/incoming are not valid root docs -> parse fails -> Err response,
    // which proves the fast-path was skipped.
    const existing = new Uint8Array([1, 1, 1]);
    const incoming = new Uint8Array([2, 2, 2]);
    const request = buildRequest(existing, incoming, 42n, 43n, 99n);

    const response = computeMergeResponse(request);
    const reader = new BorshReader(response);
    expect(reader.readU8()).toBe(1); // Err (no ABI / invalid doc)
  });
});

describe('field-aware value merge', () => {
  it('keeps equal values', () => {
    expect(mergeField('x', 'x')).toBe('x');
  });

  it('prefers a non-default over a default', () => {
    expect(mergeField('', 'hello')).toBe('hello');
    expect(mergeField('hello', '')).toBe('hello');
    expect(mergeField(0n, 5n)).toBe(5n);
    expect(mergeField(5n, 0n)).toBe(5n);
  });

  it('is order-independent for two non-default values (converges)', () => {
    expect(mergeField('apple', 'banana')).toBe(mergeField('banana', 'apple'));
    expect(mergeField('apple', 'banana')).toBe('banana'); // deterministic byte-order winner
  });

  it('merges value records deterministically regardless of side', () => {
    const a = { title: 'A', count: 0n };
    const b = { title: 'B', count: 7n };
    const ab = mergeRootValues(a, b);
    const ba = mergeRootValues(b, a);
    expect(ab).toEqual(ba);
    expect(ab.count).toBe(7n); // non-default wins
  });
});

describe('collection reference merge', () => {
  it('unifies refs that share a deterministic id', () => {
    const local = { items: { type: 'UnorderedMap', id: 'aa'.repeat(32) } };
    const remote = { items: { type: 'UnorderedMap', id: 'aa'.repeat(32) } };
    const merged = mergeRootCollections(local, remote);
    expect(merged.items).toEqual({ type: 'UnorderedMap', id: 'aa'.repeat(32) });
  });

  it('picks the same ref on both nodes when ids differ (tiebreak)', () => {
    const idA = 'aa'.repeat(32);
    const idB = 'bb'.repeat(32);
    const local = { items: { type: 'UnorderedMap', id: idA } };
    const remote = { items: { type: 'UnorderedMap', id: idB } };
    const fromLocal = mergeRootCollections(local, remote);
    const fromRemote = mergeRootCollections(remote, local);
    expect(fromLocal).toEqual(fromRemote);
    expect(fromLocal.items.id).toBe(idA); // lexicographically smaller
  });

  it('keeps a ref present on only one side', () => {
    const local = { items: { type: 'UnorderedMap', id: 'aa'.repeat(32) } };
    const remote = {};
    const merged = mergeRootCollections(local, remote);
    expect(merged.items).toEqual({ type: 'UnorderedMap', id: 'aa'.repeat(32) });
  });
});

describe('metadata merge', () => {
  it('takes min(createdAt) and max(updatedAt)', () => {
    const merged = mergeRootMetadata(
      { createdAt: 100, updatedAt: 200 },
      { createdAt: 50, updatedAt: 400 }
    );
    expect(merged).toEqual({ createdAt: 50, updatedAt: 400 });
  });
});
