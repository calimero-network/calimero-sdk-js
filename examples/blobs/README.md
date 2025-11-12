# Blobs Example (TypeScript)

This example mirrors the Rust `apps/blobs` service and demonstrates how to:

- Persist file metadata in CRDT collections
- Use the blob streaming API
- Announce uploaded blobs to the current context
- Access environment information (executor/context IDs, timestamps, randomness)

The service exposes helpers for uploading, listing, searching and deleting file metadata while keeping the blob payloads in the Calimero blob store.

## State Initialization Pattern

State classes in Calimero JS services are reinstantiated for every method call. To avoid accidental state loss or unnecessary CRDT allocations:

- Declare persisted fields with inline defaults instead of using constructors.
- Initialize CRDT collections directly on the field (`files = createUnorderedMap()`), so the decorator runtime can persist and hydrate them automatically.
- Keep constructors free of side effects or logging; prefer helper accessors if you need derived data.
- Use the helper factories exported by `@calimero/sdk` (`createUnorderedMap`, `createVector`, etc.) to keep initialization consistent.

See `src/index.ts` for the canonical pattern.

> **Note:** If you change the Rust storage runtime while working on this example, regenerate the
> shared `storage_wasm.wasm` and header as documented in `packages/sdk/README.md` so the JS
> collections keep using the updated persistence shim.

## Commands

```bash
pnpm install
pnpm build
```

`build:manual` will output the compiled WASM artifact to `build/service.wasm`.

Run the end-to-end workflow with Merobox:

```bash
merobox workflows run examples/blobs/workflows/blobs-js.yml
```

