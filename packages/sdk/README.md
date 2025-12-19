# @calimero-network/calimero-sdk-js

Core SDK for building Calimero P2P applications with automatic CRDT-based state synchronization.

## Installation

```bash
npm install @calimero-network/calimero-sdk-js
# or
pnpm add @calimero-network/calimero-sdk-js
```

## Usage

```typescript
import { State, Logic, Init, View, createUnorderedMap } from '@calimero-network/calimero-sdk-js';
import type { UnorderedMap } from '@calimero-network/calimero-sdk-js/collections';

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

  @View()
  get(key: string): string | null {
    return this.items.get(key) ?? null;
  }
}
```

Use the helper factories (`createUnorderedMap`, `createVector`, `createCounter`, `createLwwRegister`, `createUnorderedSet`) to initialize CRDT collections directly on your state fields. Avoid constructor side effects; the decorators will hydrate the state instance on each call.

Decorate read-only methods with `@View()` so the runtime skips persistence for calls that do not mutate state. Views still run inside the same execution sandbox but won’t emit storage deltas, which keeps the DAG compact and avoids redundant writes.

All values, return payloads, and collection snapshots are serialized with Calimero’s Borsh encoder. Nested CRDTs or complex objects are supported as long as you keep data structures serializable (avoid functions, symbols, etc.).

### Private Storage

Use `createPrivateEntry` for node-local data that should not replicate across the network:

```typescript
import { createPrivateEntry } from '@calimero-network/calimero-sdk-js';

const secrets = createPrivateEntry<{ token: string }>('private:secrets');

secrets.getOrInit(() => ({ token: '' }));
secrets.modify(
  value => {
    value.token = 'latest-token';
  },
  () => ({ token: '' })
);
```

Values are serialized with the same helper as service state, but they are written via `storageRead`/`storageWrite` directly and never appear in CRDT deltas.

## Documentation

See the [main repository documentation](../../README.md) for complete guides and API reference.

## License

Apache-2.0
