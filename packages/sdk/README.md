# @calimero/sdk

Core SDK for building Calimero P2P applications with automatic CRDT-based state synchronization.

## Installation

```bash
npm install @calimero/sdk
# or
pnpm add @calimero/sdk
```

## Usage

```typescript
import { State, Logic, Init, createUnorderedMap } from '@calimero/sdk';
import type { UnorderedMap } from '@calimero/sdk/collections';

@State
export class MyApp {
  items: UnorderedMap<string, string> = createUnorderedMap();
}

@Logic(MyApp)
export class MyAppLogic extends MyApp {
  @Init
  static initialize(): MyApp {
    return new MyApp();
  }

  set(key: string, value: string): void {
    this.items.set(key, value);
  }
}
```

Use the helper factories (`createUnorderedMap`, `createVector`, `createCounter`, `createLwwRegister`, `createUnorderedSet`) to initialize CRDT collections directly on your state fields. Avoid constructor side effects; the decorators will hydrate the state instance on each call.

All values, return payloads, and collection snapshots are serialized with Calimero’s Borsh encoder. Nested CRDTs or complex objects are supported as long as you keep data structures serializable (avoid functions, symbols, etc.).

## Documentation

### Updating the storage shim

`@calimero/sdk` ships a prebuilt `storage_wasm.wasm` that mirrors the Rust `storage-wasm` crate.
Whenever the Rust runtime or storage crate changes, regenerate the artifact and the C header that
embeds it. From the repository root:

1. Build the updated shim for WASI:
  ```bash
  cargo build --release --target wasm32-wasip1 -p storage-wasm
  ```
2. Copy the resulting WASM into the SDK package:
  ```bash
  cp target/wasm32-wasip1/release/storage_wasm.wasm calimero-sdk-js/packages/sdk/src/wasm/storage_wasm.wasm
  ```
3. Refresh the header used by the CLI builder:
  ```bash
  xxd -i calimero-sdk-js/packages/sdk/src/wasm/storage_wasm.wasm > calimero-sdk-js/packages/cli/builder/storage_wasm.h
  ```

Both the SDK and the Calimero runtime load this shim at build time, so keep the binary and header in
sync with the latest runtime changes before publishing packages or rebuilding Docker images.

See the [main repository documentation](../../README.md) for complete guides and API reference.

## License

Apache-2.0

