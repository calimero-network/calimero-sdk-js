/**
 * The build embeds the ABI as the `calimero_abi_v1` custom section, where the
 * node reads it.
 */

import { embedAbiSection } from '../../packages/cli/src/compiler/embed-abi';

const EMPTY_WASM = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);

// The integration tsconfig has no DOM lib, which is where the WebAssembly types live.
const { Module } = (globalThis as any).WebAssembly;

function abiSections(wasm: Uint8Array): string[] {
  return Module.customSections(new Module(wasm), 'calimero_abi_v1').map((section: ArrayBuffer) =>
    Buffer.from(section).toString('utf-8')
  );
}

describe('embedAbiSection', () => {
  const manifest = JSON.stringify({
    schema_version: 'wasm-abi/1',
    types: {},
    methods: [],
    events: [],
  });

  it('adds a calimero_abi_v1 custom section holding the manifest', () => {
    expect(abiSections(embedAbiSection(EMPTY_WASM, manifest))).toEqual([manifest]);
  });

  it('replaces an existing section instead of adding a second one', () => {
    const once = embedAbiSection(EMPTY_WASM, '{"stale":true}');
    expect(abiSections(embedAbiSection(once, manifest))).toEqual([manifest]);
  });

  it("keeps the module's other sections", () => {
    const withName = Uint8Array.from([...EMPTY_WASM, 0x00, 0x05, 0x04, 0x6e, 0x61, 0x6d, 0x65]);
    const out = embedAbiSection(withName, manifest);
    expect(Module.customSections(new Module(out), 'name')).toHaveLength(1);
  });

  it('rejects bytes that are not a wasm module', () => {
    expect(() => embedAbiSection(new Uint8Array([1, 2, 3]), manifest)).toThrow(/not a wasm module/);
  });
});
