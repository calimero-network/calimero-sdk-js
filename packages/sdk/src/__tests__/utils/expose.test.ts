import '../setup';

import { exposeValue } from '../../utils/expose';
import { Vector } from '../../collections/Vector';
import { UnorderedSet } from '../../collections/UnorderedSet';
import { UnorderedMap } from '../../collections/UnorderedMap';
import { LwwRegister } from '../../collections/LwwRegister';

describe('exposeValue', () => {
  it('expands vectors to arrays recursively', () => {
    const vector = Vector.fromArray([1, 2, 3]);
    expect(exposeValue(vector)).toEqual([1, 2, 3]);

    const nested = Vector.fromArray([Vector.fromArray([1]), Vector.fromArray([2, 3])]);
    expect(exposeValue(nested)).toEqual([[1], [2, 3]]);
  });

  it('expands sets to arrays', () => {
    const set = new UnorderedSet({ initialValues: ['alpha', 'beta'] });
    const result = exposeValue(set);
    expect(Array.isArray(result)).toBe(true);
    if (!Array.isArray(result)) {
      throw new Error('Expected array from exposeValue for UnorderedSet');
    }
    expect(new Set(result)).toEqual(new Set(['alpha', 'beta']));
  });

  it('expands maps to plain objects when keys are strings', () => {
    const map = new UnorderedMap<string, number>();
    map.set('one', 1);
    map.set('two', 2);

    expect(exposeValue(map)).toEqual({ one: 1, two: 2 });
  });

  it('expands maps to entry arrays when keys are not strings', () => {
    const map = new UnorderedMap<number, number>();
    map.set(1, 10);
    map.set(2, 20);

    expect(exposeValue(map)).toEqual([
      [1, 10],
      [2, 20],
    ]);
  });

  it('unwraps LwwRegister values', () => {
    const register = new LwwRegister<string>({ initialValue: 'latest' });
    expect(exposeValue(register)).toBe('latest');
  });

  it('handles nested structures', () => {
    const first = new UnorderedMap<string, number>();
    first.set('year', 2023);
    const second = new UnorderedMap<string, number>();
    second.set('year', 2024);

    const profile = {
      name: 'Alice',
      tags: new UnorderedSet({ initialValues: ['lead', 'remote'] }),
      history: Vector.fromArray([first, second]),
    };

    const exposed = exposeValue(profile) as Record<string, unknown>;
    expect(exposed.name).toBe('Alice');
    expect(exposed.tags).toEqual(expect.arrayContaining(['lead', 'remote']));
    expect(exposed.history).toEqual([{ year: 2023 }, { year: 2024 }]);
  });
});
