/**
 * The node lets an xcall reach only methods the embedded ABI marks
 * `xcall_callable: true`, so the build records `@XCall()`.
 */

import { AbiEmitter } from '../../packages/cli/src/abi/emitter';

interface RustMethod {
  name: string;
  xcall_callable?: boolean;
  xcall_callers?: string;
}

function methodsByName(body: string): Record<string, RustMethod> {
  const emitter = new AbiEmitter();
  emitter.analyzeSource(`
    import { State, Logic, Init, XCall } from '@calimero-network/calimero-sdk-js';

    @State
    export class S {}

    @Logic(S)
    export class L extends S {
      @Init
      static init(): S {
        return new S();
      }

      ${body}
    }
  `);
  const abi = emitter.generateManifestRustFormat();
  return Object.fromEntries(abi.methods.map((m: RustMethod) => [m.name, m]));
}

describe('xcall entry points in the ABI', () => {
  it('marks an @XCall() method xcall_callable and leaves others unmarked', () => {
    const byName = methodsByName(`
      @XCall()
      pong(): void {}

      ping(): void {}
    `);

    expect(byName.pong.xcall_callable).toBe(true);
    expect(byName.pong).not.toHaveProperty('xcall_callers');
    expect(byName.ping).not.toHaveProperty('xcall_callable');
    expect(byName.init).not.toHaveProperty('xcall_callable');
  });

  it('records @XCall({ fromSameApp: true }) as xcall_callers same_app', () => {
    const byName = methodsByName(`
      @XCall({ fromSameApp: true })
      pong(): void {}
    `);

    expect(byName.pong.xcall_callable).toBe(true);
    expect(byName.pong.xcall_callers).toBe('same_app');
  });

  it.each([
    ['an unknown option', '@XCall({ fromSameAp: true })'],
    ['a non-literal value', '@XCall({ fromSameApp: someFlag })'],
    ['a non-boolean value', "@XCall({ fromSameApp: 'true' })"],
    ['a non-object argument', "@XCall('same_app')"],
    ['an uncalled decorator', '@XCall'],
  ])('fails the build on %s rather than widening access', (_name, decorator) => {
    expect(() => methodsByName(`${decorator}\n pong(): void {}`)).toThrow(/@XCall\(\) on 'pong'/);
  });

  it('fails the build on a private @XCall method', () => {
    expect(() => methodsByName('@XCall()\n private pong(): void {}')).toThrow(/public method/);
  });
});
