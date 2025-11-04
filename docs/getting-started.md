# Getting Started with Calimero JavaScript SDK

This guide will help you build your first Calimero P2P application using JavaScript/TypeScript.

## Prerequisites

- Node.js >= 18
- pnpm >= 8
- Calimero node (merod) running

## Installation

```bash
npm install @calimero/sdk @calimero/cli
# or
pnpm add @calimero/sdk @calimero/cli
```

## Create Your First App

### 1. Create Project Structure

```bash
mkdir my-calimero-app
cd my-calimero-app
pnpm init
pnpm add @calimero/sdk
pnpm add -D @calimero/cli typescript
```

### 2. Write Your Contract

Create `src/index.ts`:

```typescript
import { State, Logic, Init } from '@calimero/sdk';
import { Counter } from '@calimero/sdk/collections';
import * as env from '@calimero/sdk/env';

@State
export class CounterApp {
  count: Counter;

  constructor() {
    this.count = new Counter();
  }
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

  getCount(): bigint {
    return this.count.value();
  }
}
```

### 3. Build Your Contract

```bash
npx calimero-sdk build src/index.ts -o build/contract.wasm
```

### 4. Deploy to Calimero

```bash
meroctl --node-name node1 app install \
  --path build/contract.wasm \
  --context-id <YOUR_CONTEXT_ID>
```

### 5. Call Your Contract

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

## Common Issues

### Build Errors

If you encounter build errors:
1. Ensure all dependencies are installed: `pnpm install`
2. Check TypeScript version: `pnpm list typescript`
3. Use `--verbose` flag for detailed output

### Runtime Errors

If your contract fails at runtime:
1. Check logs with `meroctl logs`
2. Verify host functions are available
3. Ensure proper error handling in your code

## Support

- [GitHub Issues](https://github.com/calimero-network/calimero-sdk-js/issues)
- [Discord](https://discord.gg/calimero)
- [Documentation](https://docs.calimero.network)

