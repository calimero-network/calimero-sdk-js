# E2E Tests

End-to-end tests with real Calimero nodes.

## Requirements

- Running Calimero nodes (merod)
- Built example contracts
- meroctl CLI tool

## Running Tests

```bash
# Start test nodes
./scripts/start-test-nodes.sh

# Run E2E tests
pnpm test

# Cleanup
./scripts/stop-test-nodes.sh
```

## Test Scenarios

1. **Single Node Tests**
   - Contract deployment
   - Method execution
   - State persistence

2. **Multi-Node Sync**
   - State synchronization
   - Conflict resolution
   - Event propagation

3. **Event Handlers**
   - Handler execution
   - Cross-node handlers
   - Handler ordering

## Test Structure

```
e2e/
├── helpers/          # Test utilities
├── fixtures/         # Test data
└── scenarios/        # Test scenarios
```

