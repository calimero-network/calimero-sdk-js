# Blobs Example (TypeScript)

This example mirrors the Rust `apps/blobs` contract and demonstrates how to:

- Persist file metadata in CRDT collections
- Use the blob streaming API
- Announce uploaded blobs to the current context
- Access environment information (executor/context IDs, timestamps, randomness)

The contract exposes helpers for uploading, listing, searching and deleting file metadata while keeping the blob payloads in the Calimero blob store.

## Commands

```bash
pnpm install
pnpm build
```

`build:manual` will output the compiled WASM artifact to `build/contract.wasm`.

Run the end-to-end workflow with Merobox:

```bash
merobox workflows run examples/blobs/workflows/blobs-js.yml
```

