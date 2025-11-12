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

`TeamMetrics` initializes its CRDT collections inline, and read-only methods such as `getMemberMetrics`, `getTotalContributions`, and `getMemberProfile` are marked with `@View()`. `ContributionNoteRecord` is decorated with `@Mergeable()` (default behaviour: CRDT fields recurse, scalars fall back to last-writer-wins), while `MemberProfileRecord` supplies a custom merge handler that deduplicates the roles/note vectors and keeps the larger contribution counter. This keeps constructors side-effect free, avoids redundant deltas for reads, and demonstrates how to control conflict resolution per record.

## Code

See `src/index.ts` for the complete implementation.

