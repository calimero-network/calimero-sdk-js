# Team Metrics Example

Team metrics tracking with event handlers and distributed counters.

## Features

- Track team member contributions
- Automatic metric aggregation with event handlers
- Demonstrates Counter CRDT
- Shows event handler pattern
- Multi-node synchronization

## Build

```bash
pnpm build
```

## Usage

```bash
# Add contribution
meroctl --node-name node1 call \
  --context-id <CONTEXT_ID> \
  --method addContribution \
  --args '{"member": "alice", "points": 10}'

# Get member metrics
meroctl --node-name node1 call \
  --context-id <CONTEXT_ID> \
  --method getMemberMetrics \
  --args '{"member": "alice"}'

# Get total contributions
meroctl --node-name node1 call \
  --context-id <CONTEXT_ID> \
  --method getTotalContributions
```

`TeamMetrics` initializes its CRDT collections inline, and read-only methods such as `getMemberMetrics`, `getTotalContributions`, and `getMemberProfile` are marked with `@View()`. This keeps constructors side-effect free and prevents the runtime from emitting redundant deltas when callers fetch data.

## Code

See `src/index.ts` for the complete implementation.

