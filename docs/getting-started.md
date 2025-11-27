# Getting Started with Calimero JavaScript SDK

This guide will help you build your first Calimero P2P application using JavaScript/TypeScript.

## Prerequisites

- Node.js >= 18
- pnpm >= 8
- Calimero node (merod) running

## Installation

```bash
npm install @calimero-network/calimero-sdk-js @calimero-network/calimero-cli-js
# or
pnpm add @calimero-network/calimero-sdk-js @calimero-network/calimero-cli-js
```

## Create Your First App

### 1. Create Project Structure

```bash
mkdir my-calimero-app
cd my-calimero-app
pnpm init
pnpm add @calimero-network/calimero-sdk-js
pnpm add -D @calimero-network/calimero-cli-js typescript
```

### 2. Write Your Contract

Create `src/index.ts`:

```typescript
import { State, Logic, Init, View, createCounter } from '@calimero-network/calimero-sdk-js';
import type { Counter } from '@calimero-network/calimero-sdk-js/collections';
import * as env from '@calimero-network/calimero-sdk-js/env';

@State
export class CounterApp {
  count: Counter = createCounter();
}

@Logic(CounterApp)
export class CounterLogic {
  @Init
  static initialize(): CounterApp {
    env.log('Initializing counter');
    return new CounterApp();
  }

  increment(): void {
    this.count.increment();
    env.log('Counter incremented');
  }

  @View()
  getCount(): bigint {
    return this.count.value();
  }
}
```

Key points:

- Initialize CRDT fields inline (`createCounter()`) so the runtime hydrates persisted state without relying on constructor logic.
- Mark read-only entry points with `@View()` to skip persistence and avoid emitting redundant storage deltas when returning data.

### 3. Build Your Service

```bash
npx calimero-sdk build src/index.ts -o build/service.wasm
```

### 4. Deploy the Service

```bash
meroctl --node-name node1 app install \
  --path build/service.wasm \
  --context-id <YOUR_CONTEXT_ID>
```

### 5. Call Your Service

```bash
# Increment the counter
meroctl --node-name node1 call \
  --context-id <CONTEXT_ID> \
  --method increment

# Get the count
meroctl --node-name node1 call \
  --context-id <CONTEXT_ID> \
  --method getCount
```

## Next Steps

- [API Reference](./api-reference.md)
- [CRDT Collections Guide](./collections.md)
- [Events Guide](./events.md)
- [Example Applications](../examples/)

## Private Storage (Node-local Data)

Use the private storage helpers for data that should remain on the executing node (e.g. cached secrets, per-node counters):

```typescript
import { createPrivateEntry } from '@calimero-network/calimero-sdk-js';

const secrets = createPrivateEntry<{ token: string }>('private:secrets');

const current = secrets.getOrInit(() => ({ token: '' }));
secrets.modify(
  value => {
    value.token = 'rotated-token';
  },
  () => ({ token: '' })
);
```

Entries are stored via `storageRead` / `storageWrite` directly and are not replicated via CRDT deltas.

## Common Issues

### Build Errors

If you encounter build errors:

1. Ensure all dependencies are installed: `pnpm install`
2. Check TypeScript version: `pnpm list typescript`
3. Use `--verbose` flag for detailed output

### Runtime Errors

If your service fails at runtime:

1. Check logs with `meroctl logs`
2. Verify host functions are available
3. Ensure proper error handling in your code

## Support

- [GitHub Issues](https://github.com/calimero-network/calimero-sdk-js/issues)
- [Discord](https://discord.gg/calimero)
- [Documentation](https://docs.calimero.network)
