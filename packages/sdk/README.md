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
import { State, Logic, Init } from '@calimero/sdk';
import { UnorderedMap } from '@calimero/sdk/collections';

@State
export class MyApp {
  items: UnorderedMap<string, string>;

  constructor() {
    this.items = new UnorderedMap();
  }
}

@Logic(MyApp)
export class MyAppLogic {
  @Init
  static initialize(): MyApp {
    return new MyApp();
  }

  set(key: string, value: string): void {
    this.items.set(key, value);
  }
}
```

## Documentation

See the [main repository documentation](../../README.md) for complete guides and API reference.

## License

Apache-2.0

