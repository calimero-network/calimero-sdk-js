import './setup';
import { Init } from '../decorators/init';
import { Logic } from '../decorators/logic';
import { serializeRootDocument } from '../runtime/root';
import { StateManager } from '../runtime/state-manager';

const ABI = {
  schema_version: 'wasm-abi/1',
  types: { TillState: { kind: 'record', fields: [] } },
  methods: [
    { name: 'setup', params: [] },
    { name: 'ping', params: [] },
  ],
  events: [],
  state_root: 'TillState',
};

describe('initializer re-entry', () => {
  it('refuses a second call to a non-public initializer', () => {
    (globalThis as any).__CALIMERO_ABI_MANIFEST__ = ABI;
    class TillState {}
    StateManager.setStateClass(TillState);

    @Logic(TillState)
    class Till extends TillState {
      @Init
      private static setup(): TillState {
        return new TillState();
      }
      ping(): void {}
    }
    void Till;

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('../runtime/dispatcher');
    const env = (globalThis as any).env;
    env.input = () => env.value_return(new Uint8Array(0));
    env.read_root_state = () => {
      env.value_return(
        serializeRootDocument({
          values: {},
          collections: {},
          metadata: { createdAt: 1, updatedAt: 2 },
        })
      );
      return 1;
    };

    expect(() => (globalThis as any).setup()).toThrow(/already initialized/);
    delete env.input;
    delete env.read_root_state;
  });
});
