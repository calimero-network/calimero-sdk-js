# Calimero JavaScript SDK

Build stateful peer-to-peer services for the Calimero Network using TypeScript. The SDK compiles your service bundle to WebAssembly, runs it inside QuickJS, and keeps state in sync with Calimero's CRDT layer.

Complex nested structures like `Map<K, Set<V>>` and `Map<K, Map<K2, V2>>` work seamlessly with automatic change propagation - no manual re-serialization required.

> ⚠️ **Experimental:** the JavaScript SDK is still evolving (mergeable metadata, host-side conflict resolution, and private storage APIs are in active development). Expect breaking changes while we stabilise the toolchain.

---

## Quick Links

- 📘 [Documentation index](docs/README.md) – roadmap of all guides
- 📚 **Docs** – see `docs/` for detailed guides:
  - [Getting Started](docs/getting-started.md)
  - [Architecture](docs/architecture.md)
  - [Collections & CRDTs](docs/collections.md)
  - [Mergeable (experimental)](docs/mergeable-js.md)
- 🧪 **Examples** – full services under `examples/`:
  - `examples/counter`
  - `examples/simple-store`
  - `examples/team-metrics`
  - `examples/private-data`
- ⚙️ **Workflows** – each example has a `workflows/*.yml` Merobox scenario you can run with `merobox bootstrap run …`.
- 🛠️ **Packages**
  - `packages/sdk` (`@calimero/sdk`) – decorators, collections, env bindings
  - `packages/cli` (`@calimero/cli`) – Rollup ➜ QuickJS ➜ WASM toolchain

---

## Getting Started

### Prerequisites

- Node.js 18+ with WASI support
- `pnpm` ≥ 8 (or npm/yarn)
- Access to a Calimero node (`merod`) and CLI (`meroctl`)

### Install

```bash
pnpm add @calimero/sdk
pnpm add -D @calimero/cli typescript
```

### Minimal Service

   ```typescript
import { State, Logic, Init, View, createCounter } from '@calimero/sdk';
import { Counter } from '@calimero/sdk/collections';

   @State
export class CounterState {
  value: Counter = createCounter();
   }

@Logic(CounterState)
export class CounterLogic extends CounterState {
     @Init
  static init(): CounterState {
    return new CounterState();
  }

  increment(): void {
    this.value.increment();
  }

  @View()
  getCount(): bigint {
    return this.value.value();
     }
   }
   ```

Build & deploy the service bundle:

   ```bash
npx calimero-sdk build src/index.ts -o build/service.wasm
   meroctl --node-name <NODE> app install \
  --path build/service.wasm \
     --context-id <CONTEXT_ID>
   ```

Call it:

   ```bash
   meroctl --node-name <NODE> call \
     --context-id <CONTEXT_ID> \
  --method increment
   meroctl --node-name <NODE> call \
     --context-id <CONTEXT_ID> \
  --method getCount
   ```

---

## Concepts in Practice

| Topic | Summary | Where to learn more |
| ----- | ------- | ------------------- |
| State & Logic | `@State` defines persisted data, `@Logic` exposes methods, `@Init` seeds the first snapshot. | [docs/collections.md](docs/collections.md#best-practices-by-type) |
| Views vs Mutations | Decorate read-only entry points with `@View()` to skip persistence. | [docs/collections.md](docs/collections.md#handles-not-deep-copies) |
| CRDT collections | `UnorderedMap`, `UnorderedSet`, `Vector`, `Counter`, `LwwRegister`. Hydrate → mutate → persist to reuse IDs. | [docs/collections.md](docs/collections.md) |
| Private storage | Use `createPrivateEntry()` for node-local secrets; stored via `storage_write`, never broadcast. | [docs/getting-started.md](docs/getting-started.md#private-storage-node-local-data) |
| Mergeable state (experimental) | `@Mergeable()` records merge hints. Full conflict resolution still requires host support. | [docs/mergeable-js.md](docs/mergeable-js.md) |
| Architecture | TypeScript → Rollup → QuickJS → WASI → Calimero runtime. | [docs/architecture.md](docs/architecture.md) |

---

## Examples & Workflows

| Example | Highlights | Workflow |
| ------- | ---------- | -------- |
| `examples/counter` | Basic `Counter` CRDT | `examples/counter/workflows/counter-js.yml` |
| `examples/simple-store` | KV store with `UnorderedMap` | `examples/simple-store/workflows/simple-store-js.yml` |
| `examples/team-metrics` | Nested CRDTs, events, mergeable structs | `examples/team-metrics/workflows/team-metrics-js.yml` |
| `examples/private-data` | Public vs node-local storage (`createPrivateEntry`) | `examples/private-data/workflows/private-data-js.yml` |

Run a workflow:

```bash
merobox bootstrap run examples/team-metrics/workflows/team-metrics-js.yml --log-level=trace
```

---

## Development & Testing

```bash
# Install dependencies
pnpm install

# Build SDK & CLI packages
pnpm --filter @calimero/sdk build
pnpm --filter @calimero/cli build

# Run unit tests
pnpm --filter @calimero/sdk exec jest --runInBand
```

Useful docs:

- [docs/troubleshooting.md](docs/troubleshooting.md) – common issues
- [docs/events.md](docs/events.md) – event patterns
- [docs/api-reference.md](docs/api-reference.md) – generated API listings

---

## Support & Feedback

- Issues & feature requests: [GitHub Issues](https://github.com/calimero-network/calimero-sdk-js/issues)
- Community chat: [Discord](https://discord.gg/calimero)
- Platform docs: [docs.calimero.network](https://docs.calimero.network)

---

## License

Apache-2.0
