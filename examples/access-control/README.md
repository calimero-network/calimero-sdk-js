# Access Control Example

Access control application demonstrating context management functions (PRs 1663 & 1686).

## Features

- Add/remove context members
- Check membership status
- List all members
- Create child contexts with aliases
- Resolve aliases to context IDs
- Delete contexts (self-destruct)

## Build

```bash
pnpm build
```

## Deploy

```bash
meroctl --node-name node1 app install \
  --path build/service.wasm \
  --context-id <YOUR_CONTEXT_ID>
```

## Usage

### Member Management

```bash
# Add a member (requires Base58-encoded 32-byte public key)
meroctl --node-name node1 call \
  --context-id <CONTEXT_ID> \
  --method addMember \
  --params '{"publicKeyBase58": "<PUBLIC_KEY_BASE58>"}'

# Check if a key is a member
meroctl --node-name node1 call \
  --context-id <CONTEXT_ID> \
  --method isMember \
  --params '{"publicKeyBase58": "<PUBLIC_KEY_BASE58>"}'

# Get all members
meroctl --node-name node1 call \
  --context-id <CONTEXT_ID> \
  --method getAllMembers

# Remove a member
meroctl --node-name node1 call \
  --context-id <CONTEXT_ID> \
  --method kickMember \
  --params '{"publicKeyBase58": "<PUBLIC_KEY_BASE58>"}'
```

### Context Lifecycle

```bash
# Create a child context with an alias
meroctl --node-name node1 call \
  --context-id <CONTEXT_ID> \
  --method createContextChild \
  --params '{"protocol": "near", "applicationIdBase58": "<APP_ID_BASE58>", "alias": "my-child-context"}'

# Resolve an alias to a context ID
meroctl --node-name node1 call \
  --context-id <CONTEXT_ID> \
  --method getChildId \
  --params '{"alias": "my-child-context"}'

# Delete the current context (self-destruct)
meroctl --node-name node1 call \
  --context-id <CONTEXT_ID> \
  --method deleteContextChild \
  --params '{"contextIdBase58": ""}'

# Delete a specific context
meroctl --node-name node1 call \
  --context-id <CONTEXT_ID> \
  --method deleteContextChild \
  --params '{"contextIdBase58": "<TARGET_CONTEXT_ID_BASE58>"}'
```

## Code

See `src/index.ts` for the complete implementation.

## Notes

- All public keys and context IDs are Base58-encoded strings
- Aliases are UTF-8 strings with a maximum length of 64 bytes
- Member additions/removals are asynchronous operations that take effect after successful execution
- Only self-deletion is supported (contexts can only delete themselves)
- Membership checks and member listing are synchronous read operations
