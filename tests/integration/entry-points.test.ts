/**
 * The ABI emitter and the runtime method registry must agree on which logic
 * methods are callable entry points.
 */

import * as fs from 'fs';
import * as path from 'path';
import { AbiEmitter } from '../../packages/cli/src/abi/emitter';
import { runtimeLogicEntries } from '../../packages/sdk/src/runtime/method-registry';

const APP_SOURCE = `
import { Logic } from '../../../packages/sdk/src/decorators/logic';

export class VaultState {
  balance: number = 0;
}

@Logic(VaultState)
export class Vault extends VaultState {
  withdraw(amount: number): void {
    this.requireOwner();
    this.debit(amount);
  }

  private requireOwner(): void {}

  private debit(amount: number): void {
    this.balance -= amount;
  }

  protected audit(note: string): string {
    return note;
  }

  get peek(): number {
    return this.balance;
  }

  set peek(value: number) {
    this.balance = value;
  }

  static helper(): void {}

  private helper(): void {}

  _internal(): void {}
}
`;

describe('logic entry points', () => {
  const appDir = path.join(__dirname, 'entry-points-app');
  const appFile = path.join(appDir, 'app.ts');

  function emitFrom(name: string, source: string) {
    const file = path.join(appDir, name);
    fs.writeFileSync(file, source);
    const emitter = new AbiEmitter();
    emitter.analyzeFile(file);
    return emitter.generateManifestRustFormat();
  }

  beforeAll(() => {
    fs.mkdirSync(appDir, { recursive: true });
    fs.writeFileSync(appFile, APP_SOURCE);
  });

  afterAll(() => {
    fs.rmSync(appDir, { recursive: true, force: true });
    delete (globalThis as any).__CALIMERO_ABI_MANIFEST__;
  });

  it('exports only public methods, identically in the ABI and the runtime registry', () => {
    const emitter = new AbiEmitter();
    emitter.analyzeFile(appFile);
    const abi = emitter.generateManifestRustFormat();
    const abiMethods = abi.methods.map((m: { name: string }) => m.name).sort();

    (globalThis as any).__CALIMERO_ABI_MANIFEST__ = abi;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Vault } = require(appFile);
    const entry = runtimeLogicEntries().find(e => e.target === Vault);
    const registryMethods = Array.from(entry?.methods.keys() ?? []).sort();

    expect(abiMethods).toEqual(['withdraw']);
    expect(registryMethods).toEqual(abiMethods);
  });

  it('fails the build when a public method shares its name with a private one in another class', () => {
    expect(() =>
      emitFrom(
        'cross-class.ts',
        `
        @Logic(S)
        export class Admin { private reset(): void {} }

        @Logic(S)
        export class Public { reset(): void {} }
        `
      )
    ).toThrow(/reset/);
  });

  it('fails the build when the initializer shares its name with an instance method', () => {
    expect(() =>
      emitFrom(
        'init-clash.ts',
        `
        @Logic(S)
        export class App {
          @Init
          static setup(): S { return new S(); }
          private setup(): void {}
        }
        `
      )
    ).toThrow(/setup/);
  });

  it('lists a non-public initializer in the ABI', () => {
    const abi = emitFrom(
      'private-init.ts',
      `
      @Logic(S)
      export class App {
        @Init
        private static setup(): S { return new S(); }
        ping(): void {}
      }
      `
    );
    expect(abi.methods.map((m: { name: string }) => m.name).sort()).toEqual(['ping', 'setup']);
  });

  it('fails the build when two @Logic classes share a name', () => {
    const first = path.join(appDir, 'v1.ts');
    const second = path.join(appDir, 'v2.ts');
    fs.writeFileSync(first, `@Logic(S)\nexport class App { adminReset(): void {} }\n`);
    fs.writeFileSync(second, `@Logic(S)\nexport class App { private adminReset(): void {} }\n`);
    expect(() => new AbiEmitter().analyzeFiles([first, second])).toThrow(/App/);
  });

  it('checks string-literal method names like identifiers', () => {
    expect(() =>
      emitFrom(
        'string-key.ts',
        `
        @Logic(S)
        export class Admin { private ['reset'](): void {} }

        @Logic(S)
        export class Public { reset(): void {} }
        `
      )
    ).toThrow(/reset/);
  });

  it('fails the build on a computed method name', () => {
    expect(() =>
      emitFrom(
        'computed-key.ts',
        `
        const name = 'reset';
        @Logic(S)
        export class App { [name](): void {} }
        `
      )
    ).toThrow(/computed/);
  });

  it('fails the build on a @Logic class it cannot name', () => {
    for (const [name, source] of [
      [
        'class-expression.ts',
        `export const Hidden = @Logic(S) class { private reset(): void {} };`,
      ],
      ['anonymous.ts', `export default @Logic(S) class { reset(): void {} }`],
    ]) {
      expect(() => emitFrom(name, source)).toThrow(/@Logic/);
    }
  });
});
