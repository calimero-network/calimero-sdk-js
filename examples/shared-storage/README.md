# SharedStorage Example

Demonstrates `SharedStorage<V>` — a **group-writable single value with a
rotatable writer set** (Phase 2b of the JS SDK CRDT-type expansion).

A `SharedStorage` cell holds one value that any member of its _writer set_ may
overwrite. Writes from different writers converge last-write-wins, the writer set
is managed at runtime, and the host rejects a non-writer's `set`/`rotateWriters`.

This app (`TeamConfig`) models a shared team configuration string:

- the context creator becomes the sole initial writer;
- any writer can `setConfig(value)`;
- a writer can `addWriter` to grant another member write access.

## Methods

| Method                    | Kind | Description                                      |
| ------------------------- | ---- | ------------------------------------------------ |
| `setConfig(value)`        | call | Overwrite the shared value (writer-gated).       |
| `getConfig()`             | view | Current value, or `null` before the first write. |
| `configWriters()`         | view | Current writer set as hex account ids.           |
| `myAccount()`             | view | Caller's account id (hex), what writers are.     |
| `canWrite()`              | view | Whether the caller may write.                    |
| `isConfigFrozen()`        | view | Whether the cell is frozen (immutable).          |
| `addWriter(publicKeyHex)` | call | Add a writer by hex account id (writer-gated).   |

## Build

```bash
pnpm --filter shared-storage-example build:manual
```

## Test (merobox)

```bash
# Single-node: creator sets/reads/overwrites the shared value.
merobox bootstrap run examples/shared-storage/workflows/shared-storage-js.yml

# Two-node: creator rotates a second node into the writer set, both write, and
# every replica converges on the shared value (last-write-wins).
merobox bootstrap run examples/shared-storage/workflows/shared-storage-concurrent.yml --image "$(bash scripts/merod-image.sh)"
```

Both require the `js_crdt_shared_*` host functions (calimero-network/core#3340)
in the `merod:edge` image. The concurrent workflow rotates the second node in
by passing its member key, which the node reports as hex, to `addWriter`.
