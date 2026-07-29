# CRDT Collections Example (Phase 1)

Demonstrates the four JS Service SDK CRDT collection wrappers added in Phase 1 of
the CRDT-type expansion. Each wraps a core host function landed in
[calimero-network/core#3318](https://github.com/calimero-network/core/pull/3318):

| Wrapper     | Kind                         | Highlights                                  |
| ----------- | ---------------------------- | ------------------------------------------- |
| `PNCounter` | signed PN-Counter            | `increment()` / `decrement()`, signed value |
| `Rga`       | replicated growable array    | collaborative text: `insert` / `getText`    |
| `SortedMap` | map, deterministic iteration | same API as `UnorderedMap`, sorted order    |
| `SortedSet` | set, deterministic iteration | same API as `UnorderedSet`, sorted order    |

## State

```ts
@State
export class CrdtDemo {
  score: PNCounter = new PNCounter();
  doc: Rga = new Rga();
  leaderboard: SortedMap<string, number> = new SortedMap<string, number>();
  tags: SortedSet<string> = new SortedSet<string>();
}
```

## Build

```bash
pnpm build:manual   # -> build/service.wasm
```

## Run (merobox)

> **Pending core#3318.** The workflows require the PNCounter / RGA / SortedMap /
> SortedSet host functions from core#3318. They can only run once that PR merges
> and the `ghcr.io/calimero-network/merod:edge` image is rebuilt with those host
> functions. Until then the workflows are here for reference and are **not** run.

```bash
# single node, exercises all four types
merobox bootstrap run examples/crdt-collections/workflows/crdt-collections-js.yml

# bonus: two-node concurrent-writer convergence (needs SDK #86 + core#3315 too)
merobox bootstrap run examples/crdt-collections/workflows/crdt-collections-concurrent.yml
```
