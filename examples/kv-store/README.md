# KV Store Example

Key-value store application with CRDT UnorderedMap and events.

## Features

- Set/get/remove key-value pairs
- List all entries
- Event emission (ItemAdded, ItemRemoved)
- Demonstrates UnorderedMap CRDT
- Illustrates @View usage for read-only entry points
- Shows event system usage

## Build

```bash
pnpm build
```

## Usage

```bash
# Set a value
meroctl --node-name node1 call \
  --context-id <CONTEXT_ID> \
  --method set \
  --args '{"key": "name", "value": "Alice"}'

# Get a value
meroctl --node-name node1 call \
  --context-id <CONTEXT_ID> \
  --method get \
  --args '{"key": "name"}'

# Remove a value
meroctl --node-name node1 call \
  --context-id <CONTEXT_ID> \
  --method remove \
  --args '{"key": "name"}'
```

Read methods such as `get`, `entries`, and `len` are decorated with `@View()` in `src/index.ts`. This ensures the runtime skips `flushDelta` when servicing pure reads, preventing redundant storage updates while still returning the latest CRDT data.

## Code

See `src/index.ts` for the complete implementation.

