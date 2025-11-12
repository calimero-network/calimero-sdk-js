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

### QuickJS ↔ Host Data Flow

```
┌───────────────────────────┐
│ Contract Logic (QuickJS)  │
│   map.get / set           │
│   vector.push             │
│   privateEntry.set        │
└─────────────┬─────────────┘
              │ serialize via borsh-value
              ▼
┌───────────────────────────┐
│ storage-wasm bindings     │
│   js_crdt_* host calls    │
│   storage_{read,write}    │
└─────────────┬─────────────┘
              │ pass raw bytes + CRDT IDs
              ▼
┌───────────────────────────┐
│ Rust storage (crates/     │
│ storage::js, Interface)   │
│   UnorderedMap<Vec<u8>,   │
│   Vec<u8>> wrappers       │
│   CRDT delta emission     │
└─────────────┬─────────────┘
              │ write snapshot / delta
              ▼
┌───────────────────────────┐
│ Node state & Merkle DAG   │
│   persisted entries       │
│   broadcast deltas        │
└───────────────────────────┘
```

- Serialized CRDT values carry a sentinel such as `{"__calimeroCollection":"Vector","id":"…hex…"}`. The host persists this JSON as a byte array, but the actual CRDT is keyed by the 32-byte ID.
- `map.get(key)` rehydrates a lightweight handle that retains the ID; mutating the handle (`vector.push`, `set.add`, etc.) issues incremental host calls. Only when you explicitly request the full contents (`toArray()`, returning an entire map) does the SDK stream all entries back into QuickJS.
- Node-local helpers (`createPrivateEntry`) route through the same `storage_{read,write}` bindings, but their data never appears in CRDT deltas.

### Mutating vs View Dispatch

- During dispatch the SDK inspects decorator metadata to decide whether a method is mutating. Methods marked with `@View()` execute without touching the persistence pipeline—`StateManager.save` and `flush_delta` are skipped entirely.
- If a method lacks `@View()`, the dispatcher assumes it mutated state. Even if no fields changed, the runtime serialises the state snapshot, emits a `save_raw` call, and packages an empty-but-timestamped delta. This is why it is important to mark read-only entry points explicitly: it keeps the storage DAG small and avoids gossiping redundant updates.
- Views still run inside the same QuickJS instance and can read CRDT collections safely; they simply do not commit changes back to the host.

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

### Serialization Shapes (QuickJS → Host)

```
JS Value                ─┬─ serializeJsValue ──┬─ storage-wasm ──┬─ Host Storage
                         │                     │                 │
number / string / bool   │  Borsh scalar       │  raw Vec<u8>     │  stored inline
                         │  (e.g. F64, string) │                 │
─────────────────────────┼─────────────────────┼─────────────────┼────────────────
plain object             │  JSON-like map      │  Vec<u8> blob    │  deserialized
{ x: 1, y: 'ok' }        │  with primitive     │                  │  only when read
                         │  fields             │                  │
─────────────────────────┼─────────────────────┼─────────────────┼────────────────
UnorderedMap / Vector /  │  { "__calimeroCollection": "Vector",
UnorderedSet / Counter   │    "id": "…hex…" }  │  Vec<u8>         │  CRDT keyed by
                         │  (no entries)       │                  │  the 32-byte ID
─────────────────────────┼─────────────────────┼─────────────────┼────────────────
Nested CRDT (Map→Vector) │  Outer map entry    │  Vec<u8>         │  Each layer keeps
                         │  stores the vector  │                  │  its own CRDT ID
                         │  handle metadata    │                  │
─────────────────────────┼─────────────────────┼─────────────────┼────────────────
Private entry helper     │  Borsh-encoded user │  storage_write   │  key/value in
createPrivateEntry()     │  payload            │  (no delta)      │  node-local KV
```

- Primitives and plain structs are round-tripped as ordinary Borsh scalars or maps. They are only
  materialized when your contract reads them back.
- CRDT values are encoded as lightweight handles; the host stores the opaque metadata while retaining
  the real CRDT state inside the Rust collection. All CRDT methods (`push`, `add`, `merge`) operate on
  that ID.
- Nested CRDTs simply nest handles—each layer reuses the existing ID when you hydrate → mutate →
  persist.

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

