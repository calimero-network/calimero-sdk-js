import './setup';
import { Init } from '../decorators/init';
import { Logic } from '../decorators/logic';
import { registerInit, runtimeLogicEntries, snapshot } from '../runtime/method-registry';

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

  it('registers a non-public initializer the ABI manifest lists', () => {
    (globalThis as any).__CALIMERO_ABI_MANIFEST__ = abiWithMethods('deposit', 'setup');

    class TillState {}

    @Logic(TillState)
    class Till extends TillState {
      @Init
      private static setup(): TillState {
        return new TillState();
      }
      deposit(): void {}
    }

    expect(snapshot().logic['Till'].init).toBe('setup');
    expect(runtimeLogicEntries().find(e => e.target === Till)?.init).toBe('setup');
  });

  it('ignores an initializer registered under a non-string name', () => {
    (globalThis as any).__CALIMERO_ABI_MANIFEST__ = abiWithMethods('init');
    function init(): void {}
    // TC39 decorators hand a method decorator a context object, not a property key.
    expect(() => registerInit(init as any, { kind: 'method', name: 'init' } as any)).not.toThrow();
    expect(snapshot().logic['init']?.init).toBeUndefined();
  });

  it('refuses @Init applied as a TC39 decorator', () => {
    function init(): void {}
    expect(() =>
      Init(init as any, { kind: 'method', name: 'init' } as any, undefined as any)
    ).toThrow(/experimentalDecorators/);
  });

  it('refuses a method name another @Logic class already registered', () => {
    (globalThis as any).__CALIMERO_ABI_MANIFEST__ = abiWithMethods('reset');

    class DeskState {}

    @Logic(DeskState)
    class FrontDesk extends DeskState {
      reset(): void {}
    }
    void FrontDesk;

    expect(() => {
      @Logic(DeskState)
      class BackOffice extends DeskState {
        private reset(): void {}
      }
      void BackOffice;
    }).toThrow(/reset/);
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
