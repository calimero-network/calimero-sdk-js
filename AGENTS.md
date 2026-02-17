# calimero-sdk-js - JavaScript App Development SDK

JavaScript/TypeScript SDK for building Calimero P2P applications with automatic CRDT synchronization.

- **Type**: TypeScript monorepo (pnpm workspace)
- **Stack**: TypeScript 5.x, QuickJS (WASM), Borsh serialization
- **Related**: [core/crates/sdk](https://github.com/calimero-network/calimero/tree/main/crates/sdk) (Rust equivalent)

## Package Identity

- **Repository**: `calimero-sdk-js`
- **Entry**: `packages/sdk/src/index.ts`
- **Packages**:
  - `@calimero-network/calimero-sdk-js` – decorators, collections, env bindings
  - `@calimero-network/calimero-cli-js` – build toolchain (Rollup → QuickJS → WASM)

## Commands

```bash
# Install dependencies
pnpm install

# Build SDK & CLI packages
pnpm --filter @calimero-network/calimero-sdk-js build
pnpm --filter @calimero-network/calimero-cli-js build

# Test (includes unit tests)
pnpm --filter @calimero-network/calimero-sdk-js exec jest --runInBand

# Build example app
cd examples/counter && pnpm build
# Or use CLI directly:
npx calimero-sdk build src/index.ts -o build/service.wasm

# Lint
pnpm lint

# Format
pnpm format
```

## Universal Conventions

### Import Organization

```typescript
// 1. Node built-ins (if any)
import * as path from 'path';

// 2. External packages
import { someUtil } from 'external-package';

// 3. SDK imports
import { State, Logic, Init, View } from '@calimero-network/calimero-sdk-js';
import { Counter } from '@calimero-network/calimero-sdk-js/collections';
import * as env from '@calimero-network/calimero-sdk-js/env';

// 4. Local imports
import { MyType } from './types';
```

### Module Organization

- Use named exports, not default exports
- One class/interface per file for decorators and collections
- Group related functionality in directories (`decorators/`, `collections/`, etc.)

### Error Handling

- Use explicit error returns, not exceptions where possible
- CRDT operations may throw - always handle gracefully
- Use `env.log()` for debugging, not `console.log()`

### No Dead Code

- **All code in PRs must be used** - no unused functions, variables, imports, or types
- Remove commented-out code blocks before submitting
- If code is for future use, don't include it yet - add it when needed

### Commit Format

```
<type>(<scope>): <short summary>
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`, `build`, `ci`, `style`, `revert`

- Imperative present tense ("add" not "added")
- No period, no capitalization

## Security & Secrets

- **NEVER** commit tokens, keys, or credentials
- Use `createPrivateEntry()` for node-local secrets (never broadcast)
- No `.env` files with real secrets in repo
- API keys should be passed at runtime, not hardcoded

## Definition of Done

Before creating a PR:

1. `pnpm lint` passes
2. `pnpm format:check` passes
3. `pnpm test` passes
4. Example apps build successfully: `cd examples/counter && pnpm build`
5. **Update relevant documentation** – README, AGENTS.md, or docs/ as needed

## Data Flow Overview

```
JSON-RPC Call → Calimero Node → QuickJS Runtime → Your TypeScript Code
                                      ↓
                           CRDT Collections (Counter, Map, etc.)
                                      ↓
                           State Delta → Merkle DAG → P2P Network
                                      ↓
                           Other Nodes receive & apply delta
```

## Core Concepts (Summary)

- **State (`@State`)**: Persisted data class containing CRDT fields
- **Logic (`@Logic`)**: Entry points for JSON-RPC method calls
- **View (`@View()`)**: Read-only methods that skip persistence
- **CRDTs**: Automatic conflict resolution (`Counter`, `UnorderedMap`, `Vector`, `LwwRegister`)
- **Private Storage**: Node-local data via `createPrivateEntry()` (never broadcast)
- **Events**: Cross-node notifications via `emit()` / `emitWithHandler()`

## Sub-Package Documentation

| Directory            | Purpose                     | Documentation                                      |
| -------------------- | --------------------------- | -------------------------------------------------- |
| `packages/sdk/`      | Core SDK (decorators, CRDTs)| [packages/sdk/README.md](packages/sdk/README.md)   |
| `packages/cli/`      | Build toolchain             | [packages/cli/README.md](packages/cli/README.md)   |
| `docs/`              | Human documentation         | [docs/README.md](docs/README.md)                   |
| `examples/`          | Reference implementations   | Each example has its own README                    |

## File Organization

```
packages/
├── sdk/                      # Core SDK package
│   └── src/
│       ├── index.ts                    # Public exports
│       ├── decorators/
│       │   ├── state.ts                # @State decorator
│       │   ├── logic.ts                # @Logic decorator
│       │   ├── init.ts                 # @Init decorator
│       │   ├── view.ts                 # @View decorator
│       │   ├── event.ts                # @Event decorator
│       │   └── mergeable.ts            # @Mergeable decorator (experimental)
│       ├── collections/
│       │   ├── UnorderedMap.ts         # LWW Map CRDT
│       │   ├── UnorderedSet.ts         # LWW Set CRDT
│       │   ├── Vector.ts               # Ordered list CRDT
│       │   ├── Counter.ts              # G-Counter CRDT
│       │   ├── LwwRegister.ts          # Last-Write-Wins register
│       │   ├── UserStorage.ts          # User-owned signed storage
│       │   └── FrozenStorage.ts        # Immutable content-addressed storage
│       ├── env/
│       │   ├── api.ts                  # Environment functions (log, executor_id, etc.)
│       │   └── bindings.ts             # Host bindings
│       ├── events/
│       │   ├── emitter.ts              # emit(), emitWithHandler()
│       │   └── types.ts                # Event types
│       ├── runtime/
│       │   └── state-manager.ts        # State lifecycle
│       ├── state/
│       │   ├── helpers.ts              # createUnorderedMap, createVector, etc.
│       │   └── private.ts              # createPrivateEntry, PrivateEntryHandle
│       ├── borsh/
│       │   ├── encoder.ts              # Borsh serialization
│       │   ├── decoder.ts              # Borsh deserialization
│       │   └── index.ts                # Borsh exports
│       └── utils/                      # Internal utilities
├── cli/                      # Build toolchain
│   └── src/
│       ├── cli.ts                      # CLI entry point
│       ├── commands/
│       │   ├── build.ts                # Build command
│       │   └── validate.ts             # Validate command
│       └── compiler/
│           ├── rollup.ts               # TS → JS bundling
│           ├── quickjs.ts              # JS → C bytecode
│           ├── wasm.ts                 # C → WASM compilation
│           ├── optimize.ts             # WASM optimization (Binaryen)
│           └── abi.ts                  # ABI generation
examples/                     # Example applications
├── counter/                  # Basic Counter CRDT
├── kv-store/                 # UnorderedMap usage
├── team-metrics/             # Nested CRDTs, events
└── private-data/             # Private storage
docs/                         # Human documentation
tests/                        # Integration tests
```

## Key Decorators

### `@State`

Marks a class as application state (persisted):

```typescript
import { State } from '@calimero-network/calimero-sdk-js';
import { UnorderedMap, Counter } from '@calimero-network/calimero-sdk-js/collections';

@State
export class MyAppState {
  items: UnorderedMap<string, string> = new UnorderedMap();
  counter: Counter = new Counter();
}
```

### `@Logic(StateClass)`

Marks a class as the application logic (entry points):

```typescript
import { Logic, Init, View } from '@calimero-network/calimero-sdk-js';

@Logic(MyAppState)
export class MyAppLogic extends MyAppState {
  @Init
  static init(): MyAppState {
    return new MyAppState();
  }

  addItem(key: string, value: string): void {
    this.items.set(key, value);
  }

  @View()
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
}
```

### `@View()`

Marks a method as read-only (skips persistence):

```typescript
@View()
getCount(): bigint {
  return this.counter.value();
}
```

### `@Init`

Marks a static method as the state initializer:

```typescript
@Init
static init(): MyAppState {
  return new MyAppState();
}
```

## Patterns

### Basic Application

- ✅ DO: Follow pattern in `examples/counter/src/index.ts`

```typescript
import { State, Logic, Init, View } from '@calimero-network/calimero-sdk-js';
import { Counter } from '@calimero-network/calimero-sdk-js/collections';
import * as env from '@calimero-network/calimero-sdk-js/env';

@State
export class CounterApp {
  count: Counter = new Counter();
}

@Logic(CounterApp)
export class CounterLogic extends CounterApp {
  @Init
  static init(): CounterApp {
    env.log('Initializing CounterApp');
    return new CounterApp();
  }

  increment(): void {
    env.log('Incrementing counter');
    this.count.increment();
  }

  @View()
  getCount(): bigint {
    return this.count.value();
  }
}
```

**Key points:**

- `@State` class defines persisted data with CRDT fields
- `@Logic(StateClass)` extends the state class
- `@Init` static method seeds initial state
- `@View()` for read-only methods
- Methods without `@View()` are mutations
- Use `env.log()` for logging

### Environment Access

```typescript
import * as env from '@calimero-network/calimero-sdk-js/env';

// Get current executor's public key
const executorId = env.executorId(); // Uint8Array (32 bytes)

// Logging
env.log('Hello from WASM');
```

### Event Emission

```typescript
import { emit, emitWithHandler } from '@calimero-network/calimero-sdk-js';

// Simple event
emit({ type: 'ItemAdded', key: 'foo', value: 'bar' });

// Event with handler
emitWithHandler({ type: 'ItemAdded', key: 'foo' }, 'onItemAdded');
```

### CRDT Operations

```typescript
import {
  UnorderedMap,
  UnorderedSet,
  Vector,
  Counter,
  LwwRegister,
} from '@calimero-network/calimero-sdk-js/collections';

// Map operations
const map = new UnorderedMap<string, string>();
map.set('key', 'value');
const val = map.get('key'); // 'value' or undefined
map.has('key'); // true
map.remove('key');
const entries = map.entries(); // [['key', 'value'], ...]

// Set operations
const set = new UnorderedSet<string>();
set.add('item'); // true on first insert
set.has('item'); // true
set.delete('item');
const items = set.toArray();

// Vector operations
const vec = new Vector<string>();
vec.push('first');
const item = vec.get(0); // 'first'
const last = vec.pop();
const len = vec.len();

// Counter (G-Counter)
const counter = new Counter();
counter.increment();
counter.incrementBy(5n);
const total = counter.value(); // bigint

// LWW Register
const register = new LwwRegister<string>();
register.set('value');
const current = register.get();
```

### Nested Collections

```typescript
// Nested collections work automatically - no manual re-serialization!
const map = new UnorderedMap<string, UnorderedSet<string>>();

const tags = new UnorderedSet<string>();
tags.add('urgent');
map.set('task:123', tags);

// Modifying nested collection propagates automatically
map.get('task:123')?.add('high-priority'); // Just works!
```

### Private Storage (Node-Local)

```typescript
import { createPrivateEntry } from '@calimero-network/calimero-sdk-js';

// Create private entry (never broadcast to other nodes)
const privateKey = createPrivateEntry<string>();

// Set value (stored locally only)
privateKey.set('my-secret-value');

// Get value
const secret = privateKey.get();
```

### Error Handling

```typescript
import * as env from '@calimero-network/calimero-sdk-js/env';

// ✅ DO: Log errors for debugging
increment(): void {
  try {
    this.count.increment();
  } catch (error) {
    env.log(`Error incrementing counter: ${error}`);
    throw error; // Re-throw to propagate to caller
  }
}

// ✅ DO: Return null/undefined for missing data
@View()
getItem(key: string): string | null {
  return this.items.get(key) ?? null;
}

// ❌ DON'T: Use console.log (not available in WASM)
// ❌ DON'T: Silently swallow errors
```

## Key Files

| File                                  | Purpose                     |
| ------------------------------------- | --------------------------- |
| `packages/sdk/src/index.ts`           | Public API exports          |
| `packages/sdk/src/decorators/*.ts`    | Decorator implementations   |
| `packages/sdk/src/collections/*.ts`   | CRDT collection types       |
| `packages/sdk/src/env/api.ts`         | Environment functions       |
| `packages/cli/src/cli.ts`             | CLI entry point             |
| `packages/cli/src/commands/build.ts`  | Build command               |
| `examples/counter/src/index.ts`       | Example app (best reference)|

## JIT Index

```bash
# Find decorator implementations
rg -n "export.*function|export.*const" packages/sdk/src/decorators/

# Find collection implementations
rg -n "export class" packages/sdk/src/collections/

# Find public API exports
rg -n "^export" packages/sdk/src/index.ts

# Find environment functions
rg -n "export" packages/sdk/src/env/api.ts

# Find all @State decorated classes
rg -n "@State" examples/

# Find all @Logic decorated classes
rg -n "@Logic" examples/

# Find all @View decorated methods
rg -n "@View" examples/

# Find CRDT usage patterns
rg -n "new Counter|new UnorderedMap|new Vector" examples/

# Find event emissions
rg -n "emit\(|emitWithHandler\(" packages/sdk/src/ examples/

# Find test files
rg -l "describe\(|test\(|it\(" packages/sdk/src/__tests__/

# Find example apps entry points
rg -l "@Logic" examples/*/src/

# Find workflow files
rg -l "steps:" examples/*/workflows/
```

## Building Apps

```bash
# Install CLI
pnpm add -D @calimero-network/calimero-cli-js

# Build to WASM
npx calimero-sdk build src/index.ts -o build/service.wasm

# Deploy to node
meroctl --node-name <NODE> app install \
  --path build/service.wasm \
  --context-id <CONTEXT_ID>

# Call methods
meroctl --node-name <NODE> call \
  --context-id <CONTEXT_ID> \
  --method increment
```

## Common Gotchas

- All state fields must be CRDT types (`Counter`, `UnorderedMap`, etc.)
- `@State` class must have inline field initialization for CRDTs
- `@Logic(StateClass)` must extend the state class
- `@Init` method must be static and return the state class instance
- `@View()` decorator is required for read-only methods
- Methods without `@View()` trigger persistence (mutations)
- Counter values are `bigint`, not `number`
- Use `env.log()` not `console.log()` for logging
- Private storage (`createPrivateEntry`) is node-local, never broadcast
- Nested collections propagate changes automatically - no manual re-serialization
- Build requires QuickJS, WASI-SDK, and Binaryen (installed via CLI postinstall)
- Windows users must use WSL for building

## Build Pipeline

```
TypeScript → Rollup → QuickJS → WASI-SDK → Binaryen → .wasm
     ↓          ↓         ↓          ↓          ↓
  Source    Bundle   C bytecode   WASM     Optimized
```

## Testing

```bash
# Unit tests
pnpm --filter @calimero-network/calimero-sdk-js exec jest --runInBand

# Run specific test
pnpm --filter @calimero-network/calimero-sdk-js exec jest collections

# Run workflow (E2E with merobox)
merobox bootstrap run examples/counter/workflows/counter-js.yml --log-level=trace
```

## Dependencies

```json
// Required in app's package.json
{
  "dependencies": {
    "@calimero-network/calimero-sdk-js": "^0.1.0"
  },
  "devDependencies": {
    "@calimero-network/calimero-cli-js": "^0.1.0",
    "typescript": "^5.0.0"
  }
}
```

## Related Documentation

### Human Documentation (docs/)

| Document                                           | Purpose                           |
| -------------------------------------------------- | --------------------------------- |
| [docs/getting-started.md](docs/getting-started.md) | Setup guide, first app           |
| [docs/collections.md](docs/collections.md)         | CRDT collection details          |
| [docs/architecture.md](docs/architecture.md)       | Build pipeline & data flow       |
| [docs/events.md](docs/events.md)                   | Event patterns                   |
| [docs/troubleshooting.md](docs/troubleshooting.md) | Common issues & solutions        |
| [docs/api-reference.md](docs/api-reference.md)     | API listings                     |

### External References

- [Rust SDK AGENTS.md](https://github.com/calimero-network/calimero/blob/main/crates/sdk/AGENTS.md) - Rust equivalent
- [Calimero Core](https://github.com/calimero-network/calimero) - Runtime & node
- [Platform Docs](https://docs.calimero.network) - Official documentation

## Rust SDK Equivalents

| TypeScript                           | Rust                                       |
| ------------------------------------ | ------------------------------------------ |
| `@State`                             | `#[app::state]`                            |
| `@Logic(StateClass)`                 | `#[app::logic]`                            |
| `@Init`                              | `#[app::init]`                             |
| `@View()`                            | Method without `&mut self`                 |
| `Counter`                            | `Counter`                                  |
| `UnorderedMap<K, V>`                 | `UnorderedMap<K, LwwRegister<V>>`          |
| `UnorderedSet<T>`                    | `UnorderedSet<T>`                          |
| `Vector<T>`                          | `Vector<T>`                                |
| `LwwRegister<T>`                     | `LwwRegister<T>`                           |
| `env.log()`                          | `app::log!()`                              |
| `emit(event)`                        | `app::emit!(event)`                        |
| `createPrivateEntry<T>()`            | Private storage API                        |
