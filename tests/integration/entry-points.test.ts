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

  _internal(): void {}
}
`;

describe('logic entry points', () => {
  const appDir = path.join(__dirname, 'entry-points-app');
  const appFile = path.join(appDir, 'app.ts');

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
});
