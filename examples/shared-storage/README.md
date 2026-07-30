# SharedStorage Example

Demonstrates `SharedStorage<V>` — a **group-writable single value with a
rotatable writer set** (Phase 2b of the JS SDK CRDT-type expansion).

A `SharedStorage` cell holds one value that any member of its *writer set* may
overwrite. Writes from different writers converge last-write-wins, the writer set
is managed at runtime, and the host rejects a non-writer's `set`/`rotateWriters`.

This app (`TeamConfig`) models a shared team configuration string:

- the context creator becomes the sole initial writer;
- any writer can `setConfig(value)`;
- a writer can `addWriter(publicKeyHex)` to grant another member write access.

## Methods

| Method | Kind | Description |
| --- | --- | --- |
| `setConfig(value)` | call | Overwrite the shared value (writer-gated). |
| `getConfig()` | view | Current value, or `null` before the first write. |
| `configWriters()` | view | Current writer set as hex public keys. |
| `canWrite()` | view | Whether the caller may write. |
| `isConfigFrozen()` | view | Whether the cell is frozen (immutable). |
| `addWriter(publicKeyHex)` | call | Add a writer (writer-gated). |

## Build

```bash
pnpm --filter shared-storage-example build:manual
```

## Test (merobox)

```bash
merobox bootstrap run examples/shared-storage/workflows/shared-storage-js.yml
```

> **Gated on core#3340.** The `js_crdt_shared_*` host functions ship in
> calimero-network/core#3340; the workflow runs once that merges and the
> `merod:edge` image is rebuilt.
>
> A concurrent multi-writer convergence workflow is deferred: adding a second
> node as a writer needs its public key decoded in-guest, which the SDK does not
> yet expose.
