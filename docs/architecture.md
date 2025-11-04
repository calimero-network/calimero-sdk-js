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
DeltaContext.addAction({
  type: 'Update',
  key: 'key',
  value: 'value',
  timestamp: now()
})
       ↓
On method completion:
  env.commit(rootHash, artifact)
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

