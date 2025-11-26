# Mergeable Support for JavaScript Services

## Background

Rust services rely on the `calimero_storage::collections::Mergeable` trait to reconcile concurrent
updates to the same root entity. When the runtime detects divergent deltas targeting an identical
root, it deserialises both snapshots, invokes `Mergeable::merge(&mut ours, &theirs)`, and persists
the reconciled result. CRDT collections (maps, sets, vectors, counters, registers) already provide
`Mergeable` implementations, and custom structs derive it via `#[derive(Mergeable)]` or hand-written
impls. JavaScript services currently lack an analogue, so conflicting updates degrade to
last-write-wins on the entire snapshot.

## Goals

- Enable JavaScript services to opt into deterministic conflict resolution instead of whole-root
  overwrite semantics.
- Provide a DX comparable to Rust’s `#[derive(Mergeable)]` (zero/low boilerplate for the common case).
- Allow custom merge strategies per field when the default CRDT recursion is insufficient.
- Preserve host/runtime convergence guarantees and reuse existing CRDT behaviour where possible.

## Non-Goals

- We will not implement per-field encryption or private-storage semantics here.
- We do not plan to expose arbitrary user-defined merge code to the host at replay time; merges must
  remain deterministic and validateable by the runtime.
- No attempt to retrofit legacy snapshots; the new metadata applies to services built with the
  updated SDK.

## Proposed API Surface

### 1. `@Mergeable` Decorator for Data Structs

```ts
import { Mergeable, State, createUnorderedMap, createLwwRegister } from '@calimero/sdk';

@Mergeable()
export class MemberProfile {
  displayName: string = '';
  roles: Vector<string> = createVector();
  contributions: Counter = createCounter();
}

@State
export class TeamMetricsState {
  memberProfiles: UnorderedMap<string, MemberProfile> = createUnorderedMap();
  version: bigint = 0n;
}
```

- `@Mergeable()` attaches merge metadata to the class and all fields it declares. The decorator is
  intended for structs stored inside CRDT collections (e.g. map values, register payloads).
- The root state references these mergeable structs through collections; the runtime uses the
  metadata when reconciling individual entries.
- Collection fields (maps, sets, vectors, counters, registers) inside a mergeable struct defer to the
  host CRDT merge semantics already in place.
- Non-collection fields default to last-writer-wins based on the entry’s `updatedAt` metadata.
- Future extensions may add custom strategies, but v1 keeps configuration implicit.

### Default Merge Behaviour

- If no custom `merge` handler is provided, the runtime:
  - Invokes the host CRDT merge for collection fields (`UnorderedMap`, `Vector`, `Counter`, etc.).
  - Applies last-writer-wins to scalar fields using the entry timestamps.
- This matches the historical behaviour while giving developers an opt-in path to override fields that
  need bespoke reconciliation (e.g. de-duping vectors). Today the merge is executed locally (on the node
  that invokes `set`). During delta replay other nodes simply write the merged snapshot they received.
  Conflict resolution across the network therefore still falls back to last-write-wins until the Rust
  runtime understands these descriptors _(see “Limitations & Future Work” below)_.

You can optionally provide a custom merge handler:

```ts
@Mergeable({ merge: mergeStats })
export class Stats {
  wins: number = 0;
  losses: number = 0;
}

export function mergeStats(local: Stats, remote: Stats): Stats {
  return {
    wins: Math.max(local.wins, remote.wins),
    losses: Math.min(local.losses, remote.losses),
  };
}
```

- When a `merge` function is supplied, QuickJS executes it during conflict resolution and persists the
  reconciled value. Followers replay the merged snapshot directly (no need to re-run the handler).
- Handlers must be pure and deterministic; throwing an error aborts the merge (mirrors Rust’s
  `MergeError`).

### 2. Build Metadata Emission

The bundler currently emits method registries in `__calimero_exports`. We will extend this blob with
`mergeMetadata`, containing per-class descriptors:

```json
{
  "class": "MemberProfile",
  "fields": {
    "displayName": { "strategy": "lastWriterWins" },
    "roles": { "strategy": "crdt" },
    "contributions": { "strategy": "crdt" }
  }
}

{
  "class": "Stats",
  "mergeHandler": "mergeStats",
  "fields": {
    "wins": { "strategy": "lastWriterWins" },
    "losses": { "strategy": "lastWriterWins" }
  }
}
```

The metadata is derived automatically (collection detection vs scalar) and serialised alongside the
collection snapshot that stores the objects (e.g. `doc.collections.memberProfiles.metadata.merge`).
The host can read it without spinning up QuickJS.

### 3. Custom Strategies (Future Work)

If we need bespoke merge behaviour, we can revisit targeted annotations or a policy DSL. The initial
version deliberately keeps behaviour implicit (CRDT recurse, otherwise last-writer-wins) so followers
can replay deltas without invoking QuickJS.

## Runtime & Host Changes

### A. Runtime (QuickJS)

1. **Collection Merge Hook** — When rehydrating or persisting `UnorderedMap`/`Vector` entries, check
   whether the value type carries merge metadata. On conflict, pull the persisted entry, call the
   merge pipeline, and write the reconciled value back before saving the root.
2. **Merge Pipeline** — Implement `mergeStruct(existing, incoming, descriptor)`:
   - If a `mergeHandler` is specified, invoke it and persist the returned payload.
   - Otherwise CRDT fields reuse their collection instances and scalar fields fall back to
     last-writer-wins using entry metadata (`updatedAt`).
3. **Metadata Persistence** — Ensure `snapshotCollection` and `instantiateCollection` carry the merge
   descriptor for value types so followers can apply the same logic.

### B. Host (Rust)

Even with QuickJS merging eagerly, follower nodes replay deltas without JS involvement. Therefore we
must extend the host runtime:

1. **Metadata Extraction** — When replaying deltas that touch JS collections, parse the value-type
   merge descriptor if present.
2. **Default Strategies** — Use existing CRDT merge implementations for collection fields and
   last-writer-wins for scalars based on per-entry timestamps. If a custom handler was applied on the
   leader, the persisted value already contains the reconciled result; followers do not re-run the
   handler. (Future work: allow registering Rust-side equivalents for custom handlers so conflicts can
   be resolved during replay as well.)

Given this constraint, v1 of the feature ships with two strategies: `crdt` (default for collections)
and `lastWriterWins`. Additional strategies can be added once we define a portable representation
(e.g. expression DSL).

## Compatibility & Migration

- Existing services continue working; absence of `@MergeableState` keeps legacy behaviour.
- Contracts adopting the decorator must recompile; persisted snapshots will include the new metadata.
- Nodes running older runtimes will ignore the metadata and fallback to last-write-wins; document this
  runtime requirement.

## Testing Plan

1. **Unit Tests (JS runtime)** — Cover descriptor generation, metadata persistence, and
   `mergeState()` logic using mocked storage.
2. **Integration (Rust storage)** — Add tests to `merge_integration.rs` exercising JS-style metadata to
   ensure `Root::sync` respects `lastWriterWins` vs `crdt`.
3. **Merobox Scenario** — Create a workflow with two JS nodes concurrently updating numeric and CRDT
   fields, verifying convergence across both nodes.

## Open Questions

- How to extend metadata so that future versions can opt into custom merge strategies without
  breaking older runtimes? (Proposal: store `doc.metadata.merge.version = 1`.)
- Do we need ergonomics for marking scalar fields as intentionally last-write-wins, or is the default
  sufficient?
- Do we need a migration tool for existing snapshots? Currently out of scope; services can add the
  decorator and redeploy with a fresh state.

## Limitations & Future Work (Experimental Status)

- **Leader-only merge:** The current implementation only merges on the node that makes the write. Other
  nodes replay the merged payload but do not perform conflict resolution themselves yet.
- **Host unaware of metadata:** The Rust storage layer ignores the merge descriptor today; last-write-wins
  still applies if two deltas for the same entry arrive concurrently.
- **Custom handlers:** Executed only on the writing node. There is no host-side registry to re-run them
  on followers.
- **Next steps:** carry merge descriptors through the storage delta and teach `Interface::save_internal`
  / `merge_root_state` to honour them, including a Rust-side registry for services that supply custom
  handlers. Until then, treat `@Mergeable` as an experimental helper that makes local writes safer and
  prepares metadata for future runtime support.
