/**
 * Serialization regression tests
 */

import './setup';
import { serialize, deserialize } from '../utils/serialize';
import { UnorderedMap } from '../collections/UnorderedMap';
import { UnorderedSet } from '../collections/UnorderedSet';


interface ComplexState {
  title: string;
  count: bigint;
  flags: Set<string>;
  metadata: Map<string, { score: number }>;
  nested: {
    owners: UnorderedSet<string>;
    additional: Array<{
      tags: string[];
      notes: Record<string, string>;
    }>;
  };
}

describe('Borsh serialization', () => {
  it('round-trips complex values', () => {
    const map = new Map<string, { score: number }>([
      ['alpha', { score: 10.5 }],
      ['beta', { score: -20.25 }]
    ]);
    const set = new Set(['ready', 'steady']);

    const nestedOwners = new UnorderedSet<string>({ initialValues: ['alice', 'bob'] });
    const nestedArray = [
      { tags: ['urgent'], notes: { description: 'critical', owner: 'alice' } },
      { tags: ['review'], notes: { description: 'needs review', owner: 'bob' } }
    ];

    const value: ComplexState = {
      title: 'snapshot',
      count: 1234567890123456789n,
      flags: set,
      metadata: map,
      nested: {
        owners: nestedOwners,
        additional: nestedArray
      }
    };

    const bytes = serialize(value);
    expect(bytes).toBeInstanceOf(Uint8Array);

    const restored = deserialize<ComplexState>(bytes);

    expect(restored.title).toBe('snapshot');
    expect(restored.count).toBe(1234567890123456789n);
    expect(restored.flags).toEqual(new Set(['ready', 'steady']));
    expect(restored.metadata).toEqual(
      new Map<string, { score: number }>([
        ['alpha', { score: 10.5 }],
        ['beta', { score: -20.25 }]
      ])
    );
    expect(restored.nested.additional).toEqual(nestedArray);
    expect(restored.nested.owners.toArray().sort()).toEqual(['alice', 'bob']);
  });

  it('preserves nested collections stored in maps', () => {
    const map = new UnorderedMap<string, UnorderedSet<string>>();
    map.set('admins', new UnorderedSet<string>({ initialValues: ['carol', 'dave'] }));
    map.set('guests', new UnorderedSet<string>({ initialValues: ['eve'] }));

    const encoded = serialize(map);
    const decoded = deserialize<UnorderedMap<string, UnorderedSet<string>>>(encoded);

    expect(decoded.get('admins')?.toArray().sort()).toEqual(['carol', 'dave']);
    expect(decoded.get('guests')?.toArray().sort()).toEqual(['eve']);
  });
});


