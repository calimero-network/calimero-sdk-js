import './setup';
import { Mergeable } from '../decorators/mergeable';
import { serialize, deserialize } from '../utils/serialize';
import { getMergeableDescriptor, getMergeableType } from '../runtime/mergeable-registry';
import { UnorderedMap } from '../collections/UnorderedMap';

@Mergeable()
class SimpleRecord {
  name = 'alice';
  count = 1;
}

@Mergeable({
  type: 'CustomStats',
  merge: (local: any, remote: any) => ({
    wins: Math.max(local.wins ?? 0, remote.wins ?? 0),
    losses: Math.min(local.losses ?? 0, remote.losses ?? 0),
  }),
})
class StatsRecord {
  wins = 0;
  losses = 0;
}

describe('Mergeable decorator', () => {
  it('registers descriptors and annotates instances', () => {
    const descriptor = getMergeableDescriptor('SimpleRecord');
    expect(descriptor).toBeDefined();
    expect(descriptor?.type).toBe('SimpleRecord');

    const instance = new SimpleRecord();
    expect(getMergeableType(instance)).toBe('SimpleRecord');
  });

  it('persists mergeable type metadata through serialization', () => {
    const instance = new SimpleRecord();
    const bytes = serialize(instance);
    const restored = deserialize<any>(bytes);

    expect(restored).toMatchObject({ name: 'alice', count: 1 });
    expect(getMergeableType(restored)).toBe('SimpleRecord');
  });

  it('tracks custom merge handlers and explicit type names', () => {
    const descriptor = getMergeableDescriptor('CustomStats');
    expect(descriptor).toBeDefined();
    expect(descriptor?.merge).toBeInstanceOf(Function);

    const original = new StatsRecord();
    original.wins = 5;
    const bytes = serialize(original);
    const revived = deserialize<any>(bytes);
    expect(getMergeableType(revived)).toBe('CustomStats');

    const handler = descriptor?.merge;
    if (!handler) {
      throw new Error('Merge handler not found');
    }
    const merged = handler({ wins: 1, losses: 5 }, { wins: 3, losses: 2 });
    expect(merged).toEqual({ wins: 3, losses: 2 });
  });

  it('automatically merges when inserting into UnorderedMap', () => {
    const map = new UnorderedMap<string, StatsRecord>();
    const valueA = new StatsRecord();
    valueA.wins = 2;
    valueA.losses = 5;

    const valueB = new StatsRecord();
    valueB.wins = 4;
    valueB.losses = 3;

    map.set('alpha', valueA);
    map.set('alpha', valueB);

    const resolved = map.get('alpha');
    expect(resolved).not.toBeNull();
    expect(resolved?.wins).toBe(4);
    expect(resolved?.losses).toBe(3);
  });
});
