/**
 * The build tells the runtime which collection type each state field holds.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';
import { AbiEmitter } from '../../packages/cli/src/abi/emitter';
import { bundlePrelude } from '../../packages/cli/src/compiler/rollup';

describe('state field types', () => {
  const dir = path.join(__dirname, 'state-field-types-app');

  beforeAll(() => fs.mkdirSync(dir, { recursive: true }));
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('records the annotated type of each state field', () => {
    const file = path.join(dir, 'app.ts');
    fs.writeFileSync(
      file,
      `
      @State
      export class Notes {
        title: string = '';
        items: UnorderedMap<string, string> = createUnorderedMap();
        owners: AuthoredMap<string, string> = new AuthoredMap();
      }
      `
    );
    const emitter = new AbiEmitter();
    emitter.analyzeFile(file);

    expect(emitter.stateFieldTypes()).toEqual({ items: 'UnorderedMap', owners: 'AuthoredMap' });
  });

  it('hands the ABI manifest and the state field types to the bundle', () => {
    const sandbox: Record<string, any> = {};
    sandbox.globalThis = sandbox;
    const abi = { schema_version: 'wasm-abi/1', types: {}, methods: [], events: [] };

    vm.runInNewContext(bundlePrelude(abi, { items: 'UnorderedMap' }), sandbox);

    expect(sandbox.__CALIMERO_ABI_MANIFEST__).toEqual(abi);
    expect(sandbox.__CALIMERO_STATE_FIELD_TYPES__).toEqual({ items: 'UnorderedMap' });
  });
});
