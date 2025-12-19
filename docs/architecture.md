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
│ @calimero-network/calimero-sdk-js                           │
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
 [ABI Emitter] Extract types, methods, events
      ↓
 abi.json (ABI manifest)
      ↓
 [Rollup] Bundle with dependencies + inject ABI
      ↓
 JavaScript Bundle (with __CALIMERO_ABI_MANIFEST__)
      ↓
 [QuickJS qjsc] Compile to C bytecode
      ↓
 code.h (C header)
      ↓
 [Extract Methods] Parse AST
      ↓
 methods.h (C header)
      ↓
 [Inject ABI] Embed abi.json as C byte array
      ↓
 abi.h (C header with ABI bytes)
      ↓
 [Clang/WASI-SDK] Compile to WASM
      ↓
 WASM Binary (with embedded ABI)
      ↓
 [wasi-stub + wasm-opt] Optimize
      ↓
Final Service (~500KB + ABI)
```

**ABI Manifest**: The Application Binary Interface (ABI) is automatically generated during build and embedded in both the JavaScript bundle and WASM binary. It defines all types, methods, events, and state structure, enabling ABI-aware serialization for Rust compatibility.

## Runtime Execution

### Method Call Flow

```
1. JSON-RPC call → Calimero node (with JSON parameters)
2. Node loads the WASM service module
3. WASM creates QuickJS runtime
4. QuickJS loads JavaScript bytecode + ABI manifest
5. Host injects ABI manifest into JavaScript global
6. Method dispatcher reads JSON parameters
7. Parameters converted to ABI-compatible types (bigint, Uint8Array, etc.)
8. Method executes with converted parameters
9. JavaScript calls env.* host functions
10. CRDT operations tracked in delta
11. State saved using ABI-aware Borsh serialization
12. Delta flushed to host storage
13. Return value serialized to JSON using ABI types
14. Delta committed to storage
15. Delta broadcast to network
16. JSON response returned to caller
```

**ABI-Aware Serialization**: All serialization operations (method parameters, return values, state persistence, events) use the embedded ABI manifest to ensure compatibility with Rust services. Parameters are received as JSON and converted to ABI-compatible types; return values are converted from ABI types back to JSON.

### QuickJS ↔ Host Data Flow

```
┌───────────────────────────┐
│ Service Logic (QuickJS)   │
│   map.get / set           │
│   vector.push             │
│   privateEntry.set        │
└─────────────┬─────────────┘
              │ serialize via borsh-value
              ▼
┌───────────────────────────┐
│ Host Function Bridge      │
│   js_crdt_* host calls    │
│   js_user_storage_*       │
│   js_frozen_storage_*     │
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

#### Method Parameters (Host → QuickJS)

```
Host sends JSON          ─┬─ readPayload ──┬─ convertFromJsonCompatible ──┬─ Method receives
                         │                │                              │
{ "key": "value" }       │  Parse JSON    │  Convert using ABI types     │  ABI-compatible
                         │                │  - string → bigint (u64)     │  types
                         │                │  - number[] → Uint8Array      │
                         │                │  - object → Map (if map)    │
```

#### Return Values (QuickJS → Host)

```
Method returns           ─┬─ convertToJsonCompatible ──┬─ valueReturn ──┬─ Host receives
                         │                            │                 │
bigint (u64/i64/u128)    │  Convert to string          │  JSON.stringify │  JSON string
Uint8Array (bytes)       │  Convert to number[]        │                 │
Map                      │  Convert to object          │                 │
```

#### State Persistence (QuickJS → Host)

```
State Object             ─┬─ saveRootState ──┬─ serializeWithAbi ──┬─ Format
                         │                  │                     │
{ field1, field2, ... }  │  Extract values  │  Borsh serialize    │  [version: u8=1]
                         │  Filter by ABI   │  using ABI types    │  [state: borsh]
                         │  Provide defaults │                     │  [collections: legacy]
                         │                  │                     │  [metadata: legacy]
```

#### CRDT Collections (QuickJS → Host)

```
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

#### Event Payloads (QuickJS → Host)

```
Event object             ─┬─ emitWithHandler ──┬─ serializeWithAbi ──┬─ Host receives
                         │                   │                    │
{ field1, field2, ... }   │  Extract payload   │  Borsh serialize   │  Borsh bytes
                         │  from event        │  using ABI types    │  (for Rust compat)
```

- **Method Parameters**: Host sends parameters as JSON. The dispatcher converts them to ABI-compatible types (e.g., string bigints → BigInt, number arrays → Uint8Array) based on the ABI method definition. If JSON keys don't match ABI parameter names, the entire JSON object is passed as the first parameter (handles union types and object parameters).

- **Return Values**: Method return values are converted from ABI-compatible types to JSON-compatible formats (bigint → string, Uint8Array → number[]) before being serialized and returned to the host.

- **State Persistence**: State values are serialized using ABI-aware Borsh format. Only fields defined in the ABI `state_root` type are included. Missing non-nullable fields receive default values (empty maps/vectors, 0 for numbers, false for bools, '' for strings). Format: `[version: u8=1][state: borsh][collections: legacy][metadata: legacy]`.

- **Event Payloads**: Event payloads are serialized using ABI-aware Borsh format based on the event's payload type definition in the ABI.

- **CRDT Collections**: Collections are encoded as lightweight handles with IDs; the host stores the opaque metadata while retaining the real CRDT state inside the Rust collection. All CRDT methods (`push`, `add`, `merge`) operate on that ID.

- **Nested CRDTs**: Nested CRDTs nest handles—each layer reuses the existing ID when you hydrate → mutate → persist.

### How this differs from the Rust SDK

Rust services are compiled into Wasm but they _execute the storage collections
inside the host runtime_. Every mutation goes through
`calimero_storage::Interface`, which updates Merkle hashes, records CRDT
actions, and eventually emits a causal delta. In other words, Rust never has to
“hand data back” to the host – it already lives there.

QuickJS, on the other hand, runs inside an isolated JS VM. Service methods
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

JavaScript and Rust services can:

- ✅ Run on same network
- ✅ Sync state via CRDTs
- ✅ Emit/receive events
- ✅ Call each other (xcall)

### Data Format

Uses ABI-aware Borsh serialization for Rust compatibility:

- **State persistence**: ABI-aware Borsh format `[version: u8=1][state: borsh][collections: legacy][metadata: legacy]`
- **Method parameters**: JSON from host → converted to ABI-compatible types (bigint, Uint8Array, Map, etc.)
- **Return values**: ABI-compatible types → JSON (bigint → string, Uint8Array → number[])
- **Event payloads**: ABI-aware Borsh serialization based on event payload type
- **Storage keys/values**: Borsh format (for CRDT operations)
- **Delta artifacts**: Same format as Rust SDK

**ABI Requirement**: The ABI manifest is mandatory. Services without an embedded ABI will fail at runtime with clear error messages. The ABI is automatically generated during build and embedded in both JavaScript bundles and WASM binaries.
