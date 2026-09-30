/**
 * emitWithHandler warns at emit time when the ABI does not declare the handler,
 * since the node then runs nothing on the receiving peers.
 */

import './setup';
import { emitWithHandler } from '../events/emitter';
import type { AbiManifest } from '../abi/types';

class Pinged {}

function abiWith(methods: AbiManifest['methods']): AbiManifest {
  return { schema_version: 'wasm-abi/1', types: {}, methods, events: [{ name: 'Pinged' }] };
}

describe('emitWithHandler', () => {
  const env = (global as any).env;
  const originalLog = env.log_utf8;
  let logged: string[];

  beforeEach(() => {
    logged = [];
    env.log_utf8 = (msg: Uint8Array) => logged.push(new TextDecoder().decode(msg));
  });

  afterEach(() => {
    env.log_utf8 = originalLog;
    delete (globalThis as any).__CALIMERO_ABI_MANIFEST__;
  });

  it('warns when the named method is not a declared handler', () => {
    (globalThis as any).__CALIMERO_ABI_MANIFEST__ = abiWith([{ name: 'onPinged', params: [] }]);

    emitWithHandler(new Pinged(), 'onPinged');

    expect(logged).toEqual([expect.stringMatching(/'onPinged' is not declared with @Handler\(\)/)]);
  });

  it('stays quiet when the named method is a declared handler', () => {
    (globalThis as any).__CALIMERO_ABI_MANIFEST__ = abiWith([
      { name: 'onPinged', params: [], handler: true },
    ]);

    emitWithHandler(new Pinged(), 'onPinged');

    expect(logged).toEqual([]);
  });

  it('stays quiet for a tee: name whose method is a declared handler', () => {
    (globalThis as any).__CALIMERO_ABI_MANIFEST__ = abiWith([
      { name: 'onPinged', params: [], handler: true },
    ]);

    emitWithHandler(new Pinged(), 'tee:onPinged');

    expect(logged).toEqual([]);
  });
});
