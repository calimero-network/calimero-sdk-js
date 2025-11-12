# Counter Example

Simple counter application demonstrating Calimero SDK basics.

## Features

- Increment/decrement counter
- Get current count
- Reset counter
- Demonstrates @State, @Logic, @Init, @View decorators
- Uses Counter CRDT

## Build

```bash
pnpm build
```

## Deploy

```bash
meroctl --node-name node1 app install \
  --path build/contract.wasm \
  --context-id <YOUR_CONTEXT_ID>
```

## Usage

```bash
# Increment
meroctl --node-name node1 call \
  --context-id <CONTEXT_ID> \
  --method increment

# Get count
meroctl --node-name node1 call \
  --context-id <CONTEXT_ID> \
  --method getCount
```

`getCount` is tagged with `@View()` in `src/index.ts`, so the runtime skips persistence when the method runs. Marking read-only entry points as views keeps the storage DAG compact and avoids emitting redundant deltas for simple reads.

## Code

See `src/index.ts` for the complete implementation.

