# Architecture

Deep dive into Calimero JavaScript SDK architecture.

## System Layers

```
┌─────────────────────────────────────────┐
│ JavaScript Application                  │
│ (Your code with decorators)             │
└──────────────┬──────────────────────────┘
               │
┌──────────────┴──────────────────────────┐
│ @calimero/sdk                           │
│ - Decorators (@State, @Logic, etc.)     │
│ - CRDT Collections                      │
│ - Event System                          │
└──────────────┬──────────────────────────┘
               │
┌──────────────┴──────────────────────────┐
│ QuickJS Runtime (in WASM)               │
│ - JavaScript interpreter                │
│ - ~450KB overhead                       │
└──────────────┬──────────────────────────┘
               │
┌──────────────┴──────────────────────────┐
│ Calimero Host Functions                 │
│ (calimero-sys)                          │
│ - storage_read/write                    │
│ - emit/commit                           │
│ - context_id/executor_id                │
└──────────────┬──────────────────────────┘
               │
┌──────────────┴──────────────────────────┐
│ Calimero Runtime (Wasmer)               │
│ - WASM execution                        │
│ - P2P synchronization                   │
│ - Storage (RocksDB)                     │
└─────────────────────────────────────────┘
```

## Build Pipeline

```
TypeScript Source
      ↓
 [TypeScript Compiler]
      ↓
 JavaScript (ES6 modules)
      ↓
 [Rollup] Bundle with dependencies
      ↓
 JavaScript Bundle
      ↓
 [QuickJS qjsc] Compile to C bytecode
      ↓
 code.h (C header)
      ↓
 [Extract Methods] Parse AST
      ↓
 methods.h (C header)
      ↓
 [Clang/WASI-SDK] Compile to WASM
      ↓
 WASM Binary
      ↓
 [wasi-stub + wasm-opt] Optimize
      ↓
 Final Contract (~500KB)
```

## Runtime Execution

### Method Call Flow

```
1. JSON-RPC call → Calimero node
2. Node loads WASM contract
3. WASM creates QuickJS runtime
4. QuickJS loads JavaScript bytecode
5. JavaScript calls env.* host functions
6. Host functions interact with storage
7. CRDT operations tracked in delta
8. Delta committed to storage
9. Delta broadcast to network
10. Response returned to caller
```

## CRDT Delta Tracking

```
Application calls:
  map.set('key', 'value')
       ↓
Host-backed CRDT collection records action in Rust delta context
       ↓
On method completion:
  env.flush_delta()
       ↓
Runtime serialises pending actions into StorageDelta and commits Merkle root
       ↓
Runtime creates CausalDelta:
  {
    id: hash(actions),
    parents: current_heads,
    payload: actions,
    timestamp: now()
  }
       ↓
Broadcast to network
```

### How this differs from the Rust SDK

Rust contracts are compiled into Wasm but they *execute the storage collections
inside the host runtime*. Every mutation goes through
`calimero_storage::Interface`, which updates Merkle hashes, records CRDT
actions, and eventually emits a causal delta. In other words, Rust never has to
“hand data back” to the host – it already lives there.

QuickJS, on the other hand, runs inside an isolated JS VM. Collection methods
execute in guest memory and can only interact with the host by calling `env.*`
functions. To keep the storage DAG and the execution outcome aligned we expose
three host calls:

- `env.persist_root_state(doc, created_at, updated_at)` stores the serialized
  root document through the same storage interface Rust uses, so Merkle hashes
  and CRDT actions update.
- `env.flush_delta()` asks the runtime to turn those recorded actions into a
  causal delta (just like the Rust SDK does automatically after a method
  returns).
- `env.commit(root_hash, artifact)` reports the execution result; the core node
  depends on this metadata for receipts, event handling, and network
  broadcasts—both the Rust and JS SDKs must provide it exactly once per
  execution.

These extra steps exist purely because QuickJS cannot mutate host data
structures directly. They ensure the JS SDK produces the same Merkle roots,
artifacts, and deltas that the core runtime expects from the Rust SDK.

## Why QuickJS?

### Pros
- Full JavaScript/TypeScript support
- npm ecosystem compatibility
- Proven by NEAR Protocol
- Smaller than V8/SpiderMonkey

### Cons
- ~450KB overhead (vs ~50KB for AssemblyScript)
- Slower than native WASM

### Alternative Considered: AssemblyScript

We chose QuickJS over AssemblyScript because:
1. Better developer experience (full TypeScript)
2. npm ecosystem access
3. Proven production use (NEAR)
4. Size overhead acceptable for DX gains

## Security

### Sandboxing

- QuickJS runs in WASM sandbox
- No access to filesystem
- No network access
- Only approved host functions

### Host Function Validation

All host functions validate inputs:
- Buffer bounds checking
- Register validation
- Type validation

## Performance

### Typical Overheads

- QuickJS initialization: ~5ms
- Method call: ~2-5ms vs Rust
- CRDT operation: Similar to Rust
- Network sync: Identical to Rust

### Optimization Tips

1. Minimize object allocations
2. Batch storage operations
3. Use appropriate CRDT types
4. Cache frequently accessed data

## Compatibility

### With Rust SDK

JavaScript and Rust contracts can:
- ✅ Run on same network
- ✅ Sync state via CRDTs
- ✅ Emit/receive events
- ✅ Call each other (xcall)

### Data Format

Uses same serialization format (Borsh) for:
- Storage keys/values
- Event payloads
- Delta artifacts

