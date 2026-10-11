/**
 * Integration test for method extraction
 */

import { exportedMethods } from '../../packages/cli/src/compiler/methods';

const INTERNAL_EXPORTS = [
  '__calimero_merge_root_state',
  '__calimero_register_merge',
  '__calimero_sync_next',
];

describe('Method Extraction', () => {
  it('exports the registered methods and initializer plus the internal exports', () => {
    const methods = exportedMethods({
      logic: { CounterLogic: { methods: ['increment', 'getCount'], init: 'init' } },
      functions: [],
    });

    expect(methods).toEqual([...INTERNAL_EXPORTS, 'getCount', 'increment', 'init'].sort());
  });

  it('fails when the bundle registers no method registry', () => {
    expect(() => exportedMethods(null)).toThrow(/registry/);
  });

  it('exports an initializer-only app', () => {
    expect(
      exportedMethods({ logic: { SchemaLogic: { methods: [], init: 'init' } }, functions: [] })
    ).toEqual([...INTERNAL_EXPORTS, 'init'].sort());
  });

  it('fails when the registry holds no logic methods or initializer', () => {
    expect(() =>
      exportedMethods({ logic: { CounterLogic: { methods: [] } }, functions: [] })
    ).toThrow(/no logic methods/);
  });
});
