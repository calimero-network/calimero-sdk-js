# KV Store Example

Key-value store application with CRDT UnorderedMap and events.

## Features

- Set/get/remove key-value pairs
- List all entries
- Event emission (ItemAdded, ItemRemoved)
- Demonstrates UnorderedMap CRDT
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

## Code

See `src/index.ts` for the complete implementation.

