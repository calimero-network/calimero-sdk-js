import './setup';
import { Init } from '../decorators/init';
import { Logic } from '../decorators/logic';
import { runtimeLogicEntries, snapshot } from '../runtime/method-registry';

const abiWithMethods = (...names: string[]) => ({
  schema_version: 'wasm-abi/1',
  types: {},
  methods: names.map(name => ({ name, params: [] })),
  events: [],
});

function exportedMethods(logic: new (...args: any[]) => any): string[] {
  const entry = runtimeLogicEntries().find(e => e.target === logic);
  return entry ? Array.from(entry.methods.keys()).sort() : [];
}

describe('method registry', () => {
  afterEach(() => {
    delete (globalThis as any).__CALIMERO_ABI_MANIFEST__;
  });

  it('exports only the methods the ABI manifest lists', () => {
    (globalThis as any).__CALIMERO_ABI_MANIFEST__ = abiWithMethods('withdraw');

    class VaultState {}

    @Logic(VaultState)
    class Vault extends VaultState {
      withdraw(amount: number): void {
        this.requireOwner();
        this.debit(amount);
      }
      private requireOwner(): void {}
      private debit(_amount: number): void {}
    }

    expect(snapshot().logic['Vault'].methods).toEqual(['withdraw']);
    expect(exportedMethods(Vault)).toEqual(['withdraw']);
  });

  it('registers no initializer the ABI manifest does not list', () => {
    (globalThis as any).__CALIMERO_ABI_MANIFEST__ = abiWithMethods('deposit');

    class TillState {}

    @Logic(TillState)
    class Till extends TillState {
      @Init
      private static setup(): TillState {
        return new TillState();
      }
      deposit(): void {}
    }

    expect(snapshot().logic['Till'].init).toBeUndefined();
    expect(runtimeLogicEntries().find(e => e.target === Till)?.init).toBeUndefined();
  });

  it('exports nothing without an ABI manifest', () => {
    class LedgerState {}

    @Logic(LedgerState)
    class Ledger extends LedgerState {
      transfer(): void {}
    }

    expect(snapshot().logic['Ledger']?.methods ?? []).toEqual([]);
    expect(exportedMethods(Ledger)).toEqual([]);
  });
});
