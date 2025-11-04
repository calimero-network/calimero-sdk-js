# Calimero JavaScript SDK

JavaScript/TypeScript SDK for building decentralized P2P applications on Calimero Network with automatic CRDT-based state synchronization.

## 🚀 Features

- **TypeScript First**: Full TypeScript support with type safety
- **CRDT Collections**: Automatic conflict-free data synchronization
  - `UnorderedMap` - Key-value store with Last-Write-Wins
  - `Vector` - Ordered list
  - `Counter` - Distributed counter (G-Counter)
  - `LwwRegister` - Last-Write-Wins register
- **Event System**: Emit and handle events across the network
- **Decorators**: Clean, intuitive API with `@State`, `@Logic`, `@Init`, `@Event`
- **QuickJS Powered**: Compiles to efficient WebAssembly (~500KB)
- **Full P2P Sync**: Automatic state synchronization across nodes

## 📦 Installation

```bash
npm install @calimero/sdk
# or
pnpm add @calimero/sdk
```

## 🎯 Quick Start

### 1. Create Your Application

```typescript
// src/app.ts
import { State, Logic, Init, emit } from '@calimero/sdk';
import { UnorderedMap, Counter } from '@calimero/sdk/collections';

@State
export class KvStore {
  items: UnorderedMap<string, string>;
  operationCount: Counter;

  constructor() {
    this.items = new UnorderedMap();
    this.operationCount = new Counter();
  }
}

@Logic(KvStore)
export class KvStoreLogic {
  @Init
  static initialize(): KvStore {
    return new KvStore();
  }

  set(key: string, value: string): void {
    this.items.set(key, value);
    this.operationCount.increment();
  }

  get(key: string): string | null {
    return this.items.get(key);
  }

  remove(key: string): void {
    this.items.remove(key);
  }
}
```

### 2. Build Your Contract

```bash
npx calimero-sdk build src/app.ts -o build/contract.wasm
```

### 3. Deploy to Calimero

```bash
meroctl --node-name node1 app install \
  --path build/contract.wasm \
  --context-id <YOUR_CONTEXT_ID>
```

## 📚 Documentation

- [Getting Started Guide](./docs/getting-started.md)
- [API Reference](./docs/api-reference.md)
- [CRDT Collections](./docs/collections.md)
- [Event System](./docs/events.md)
- [Migration from Rust](./docs/migration.md)

## 🏗️ Project Structure

```
calimero-sdk-js/
├── packages/
│   ├── sdk/              # Main SDK package
│   └── cli/              # Build tools
├── examples/             # Example applications
└── tests/                # Test suite
```

## 🛠️ Development

### Prerequisites

- Node.js >= 18
- pnpm >= 8
- Calimero node (for testing)

### Setup

```bash
# Clone repository
git clone https://github.com/calimero-network/calimero-sdk-js.git
cd calimero-sdk-js

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test
```

## 📖 Examples

Check out the [examples/](./examples/) directory for complete working examples:

- **[counter](./examples/counter/)** - Simple counter with increment/decrement
- **[kv-store](./examples/kv-store/)** - Key-value store with CRDT map
- **[team-metrics](./examples/team-metrics/)** - Team metrics with event handlers

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for details.

## 📝 License

Apache-2.0 - see [LICENSE](./LICENSE) for details.

## 🔗 Links

- [Calimero Network](https://calimero.network)
- [Core Repository](https://github.com/calimero-network/core)
- [Documentation](https://docs.calimero.network)
- [Discord](https://discord.gg/calimero)

## 🆚 Rust vs JavaScript

| Feature | Rust SDK | JavaScript SDK |
|---------|----------|----------------|
| Language | Rust | TypeScript/JavaScript |
| WASM Size | ~100KB | ~500KB |
| Build Time | 5-10s | 3-8s |
| Performance | Native | ~2x overhead |
| Developer Experience | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| npm Ecosystem | ❌ | ✅ |

Both SDKs are fully compatible and can interact with each other on the same Calimero network.

## ⚡ Status

**Current Version**: 0.1.0 (Alpha)

**Roadmap**:
- [x] Phase 1: Foundation & Build Pipeline
- [ ] Phase 2: Core SDK (Decorators & Events)
- [ ] Phase 3: CRDT Collections
- [ ] Phase 4: Testing & Documentation
- [ ] Phase 5: Production Release (1.0.0)

---

