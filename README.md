# Calimero JavaScript SDK

Build stateful peer-to-peer applications for the Calimero Network using conventional TypeScript. The SDK compiles your application to WebAssembly, runs it inside an embedded QuickJS runtime, and synchronizes state over Calimero’s CRDT-based data layer.

---

## Why Use This SDK?

- **TypeScript-native authoring**: Write rich business logic with decorators instead of explicit boilerplate.
- **Conflict-free state replication**: Ship collaborative apps that stay consistent through CRDT collections.
- **Event-driven workflows**: Emit and react to network-wide events with strongly typed payloads.
- **Tooling included**: Build, optimize, and validate contracts with the `@calimero/cli` toolchain.

---

## Repository Layout

| Path | Purpose | npm package |
| --- | --- | --- |
| `packages/sdk` | Core runtime, decorators, collections, and host bindings | `@calimero/sdk` |
| `packages/cli` | Rollup ➔ QuickJS ➔ WASM build pipeline and utilities | `@calimero/cli` |
| `examples/*` | End-to-end sample contracts (counter, KV store, team metrics) | – |
| `tests/*` | Unit, integration, and e2e coverage for the SDK and CLI | – |
| `docs/*` | Expanded guides (getting started, architecture, events, CRDTs) | – |

Each folder is versioned as part of this monorepo but can be consumed independently.

---

## Prerequisites

- Node.js 18 or newer (WASI-enabled toolchain)
- `pnpm` ≥ 8 or your preferred Node package manager
- Access to a Calimero node (`merod`) and CLI (`meroctl`) for deployment

---

## Install

```bash
pnpm add @calimero/sdk
pnpm add -D @calimero/cli typescript
# npm / yarn equivalents work as well
```

---

## Quick Start

1. **Bootstrap a project**

   ```bash
   mkdir my-calimero-app
   cd my-calimero-app
   pnpm init
   pnpm add @calimero/sdk
   pnpm add -D @calimero/cli typescript
   ```

2. **Author state and logic**

   ```typescript
   // src/index.ts
   import { State, Logic, Init, Event } from '@calimero/sdk';
   import { UnorderedMap, Counter } from '@calimero/sdk/collections';
   import * as env from '@calimero/sdk/env';

   @Event('ItemStored')
   export class ItemStored {
     constructor(public key: string, public version: bigint) {}
   }

   @State
   export class KvStore {
     items = new UnorderedMap<string, string>();
     writes = new Counter();
   }

   @Logic(KvStore)
   export class KvStoreLogic {
     @Init
     static initialize(): KvStore {
       env.log('Initializing KV store');
       return new KvStore();
     }

     set(key: string, value: string): void {
       this.items.set(key, value);
       const writes = this.writes.increment();
       env.emit(new ItemStored(key, writes));
     }

     get(key: string): string | null {
       return this.items.get(key);
     }
   }
   ```

3. **Build to WebAssembly**

   ```bash
   npx calimero-sdk build src/index.ts -o build/contract.wasm
   # add --verbose for detailed output, --no-optimize to skip wasm-opt
   ```

4. **Deploy to a node**

   ```bash
   meroctl --node-name <NODE> app install \
     --path build/contract.wasm \
     --context-id <CONTEXT_ID>
   ```

5. **Invoke methods**

   ```bash
   meroctl --node-name <NODE> call \
     --context-id <CONTEXT_ID> \
     --method set \
     --args-json '{"key":"hello","value":"world"}'

   meroctl --node-name <NODE> call \
     --context-id <CONTEXT_ID> \
     --method get \
     --args-json '{"key":"hello"}'
   ```

---

## Core Concepts

### State & Logic Separation

- `@State` classes define persistent data. Fields can be primitive values, CRDT collections, or other serializable classes.
- `@Logic(StateClass)` binds runtime methods to the state instance. Methods are exposed as public contract entry points.
- `@Init` marks a static method that constructs the first state snapshot.

### Decorators & Metadata

- `@Event` classes produce strongly typed payloads that are serialized with Borsh.
- Additional decorators plug into the runtime to capture metadata for method discovery, serialization, and validation.

### Environment bindings (`@calimero/sdk/env`)

- `env.log(message)` writes structured logs.
- `env.emit(eventInstance)` emits events to other nodes.
- `env.context()` exposes caller, executor, block height, and timestamp metadata.
- `env.storage` helpers offer low-level access to raw key/value operations when you need to bypass CRDTs.

### CRDT Collections

| Collection | Type | Typical usage |
| --- | --- | --- |
| `UnorderedMap<K, V>` | LWW key-value map | Configuration, documents, user profiles |
| `UnorderedSet<T>` | LWW set | Membership tracking, unique tags |
| `Vector<T>` | Ordered grow-only list | Activity feeds, append-only logs |
| `Counter` | G-Counter | Reputation scores, vote tallies |
| `LwwRegister<T>` | Last-writer-wins register | Global settings, singletons |

All CRDTs coordinate through delta tracking, guaranteeing eventual consistency across your P2P network.

> ℹ️ Use `.entries()`, `.keys()`, `.values()` on `UnorderedMap` and `.toArray()` on `UnorderedSet` to iterate without sacrificing CRDT safety.

---

## Build & Runtime Architecture

```
TypeScript sources
   ↓ (tsc)
ES2019 JavaScript
   ↓ (Rollup)
Bundle (single file)
   ↓ (QuickJS qjsc)
C bytecode headers
   ↓ (WASI SDK / Clang)
WebAssembly module
   ↓ (optional wasm-opt)
Optimized contract (~450–550 KB)
```

At runtime the WASM module spins up QuickJS, loads your bytecode, rehydrates state from Calimero storage, and applies CRDT deltas. Host functions exposed by the Calimero runtime handle storage reads, writes, commits, and event propagation.

### Serialization & Interop

- Persistent state, collection payloads, and return values are encoded with Calimero’s Borsh schema so JavaScript and Rust contracts can interoperate byte-for-byte.
- Complex types—`Map`, `Set`, nested objects, CRDT snapshots—are normalized before encoding and rebuilt on load. Nested CRDTs and cross-references now hydrate automatically.
- Legacy JSON blobs (from SDK ≤0.1) are auto-migrated on first load: the SDK reads the JSON document, rehydrates state, and rewrites the root snapshot in Borsh format.
- When sharing schemas with Rust code, define a common Borsh struct layout (e.g. via `borsh-js` or TypeScript type definitions) so both sides agree on field ordering.

### TypeScript Struct Example

You can model rich state with TypeScript types and rely on the SDK to serialize it through Borsh:

```typescript
type ProjectSnapshot = {
  projectId: string;
  metadata: {
    title: string;
    tags: string[];
    notes?: string;
  };
  metrics: {
    completed: bigint;
    backlog: bigint;
    owners: Set<string>;
  };
};

const snapshot: ProjectSnapshot = {
  projectId: 'alpha-1',
  metadata: { title: 'Alpha Launch', tags: ['urgent', 'external'] },
  metrics: {
    completed: 42n,
    backlog: 7n,
    owners: new Set(['alice.near', 'bob.near'])
  }
};

const serialized = serialize(snapshot);
const restored = deserialize<ProjectSnapshot>(serialized);
```

The encoder automatically handles nested objects, `Set`, `Map`, `bigint`, and SDK collections, so you can focus on shaping your data rather than wiring codecs manually.

---

## CLI Reference (`@calimero/cli`)

```bash
calimero-sdk build <entry> [options]
  -o, --output <path>   Output WASM file (default: build/contract.wasm)
      --verbose         Print every pipeline step
      --no-optimize     Skip wasm-opt optimization pass

calimero-sdk validate <entry> [options]
      --verbose         Additional diagnostics

calimero-sdk init [name] --template <counter|kv-store>   # planned
```

- `build` orchestrates bundling, QuickJS compilation, WASM generation, and optimization.
- `validate` currently performs basic sanity checks (file existence and extension) and is the scaffold for deeper contract validation.
- `init` is a placeholder for a future project scaffolder.

For CI you can call the CLI directly or reference the helper scripts under `merobox-workflows/`.

---

## Testing & Local Development

- Run all tests: `pnpm test`
- Package-specific tests: `pnpm --filter @calimero/sdk test`
- Watch mode (Jest): `pnpm test -- --watch`
- Integration tests ensure the builder emits valid WASM (`tests/integration`) and e2e tests run contracts inside a simulated node (`tests/e2e`).

When editing the SDK itself, run `pnpm build` from the repository root to compile both packages.

---

## Examples

- `examples/counter`: Minimal counter with increment/read methods.
- `examples/kv-store`: Demonstrates `UnorderedMap` plus basic querying.
- `examples/team-metrics`: Showcases events and multi-collection state.

Each example includes a `build.sh` helper and can be built with `pnpm install && pnpm run build`.

---

## Troubleshooting

- **Build failures**: reinstall dependencies (`pnpm install`), add `--verbose`, and ensure WASI toolchain downloads during CLI post-install succeeded.
- **Large WASM size**: ensure optimizations are enabled (default) and prune unused dependencies from your Rollup bundle.
- **Runtime errors**: inspect logs with `meroctl logs`, and confirm host functions needed by your contract are available on the target node.

Refer to `docs/troubleshooting.md` for a full checklist.

---

## Further Reading & Support

- `docs/getting-started.md` – step-by-step tutorial
- `docs/architecture.md` – deep dive into the toolchain and runtime
- `docs/collections.md` – CRDT internals and API reference
- `docs/events.md` – event modelling patterns
- `docs/api-reference.md` – generated API surface
- [Calimero Docs](https://docs.calimero.network) – broader platform documentation
- [GitHub Issues](https://github.com/calimero-network/calimero-sdk-js/issues) – bug reports and feature requests
- [Discord](https://discord.gg/calimero) – community help

---

## Known Limitations & TODOs

- Introduce an event registry and typed payload encoding for `@Event`, `emit`, and handler routing.
- Expand `calimero-sdk validate` beyond file existence to cover decorator usage, method signatures, and host compatibility.
- Replace placeholder Jest suites with real unit, integration, and e2e coverage for the SDK and CLI.
- Flesh out collection internals (shared base helpers, deterministic hashing) once the serialization work lands.

> ℹ️ State, return values, and collection payloads are now encoded with Calimero's Borsh runtime. Legacy JSON state blobs are migrated automatically on first load. If you need deterministic interoperability with Rust contracts, make sure both sides agree on the same Borsh schema for shared data structures.

---

## License

Apache-2.0

