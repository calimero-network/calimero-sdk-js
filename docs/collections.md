# CRDT Collections Guide

Calimero provides conflict-free replicated data types (CRDTs) for automatic state synchronization.

## UnorderedMap<K, V>

Last-Write-Wins map for key-value storage.

```typescript
import { UnorderedMap } from '@calimero/sdk/collections';

const map = new UnorderedMap<string, string>();

map.set('key', 'value');
const value = map.get('key'); // 'value'
const exists = map.has('key'); // true
map.remove('key');
```

### Conflict Resolution

When two nodes update the same key simultaneously, the value with the higher timestamp wins.

```
Node A: map.set('key', 'A') at t=1000
Node B: map.set('key', 'B') at t=1001

Result: key = 'B' (higher timestamp)
```

## Vector<T>

Ordered list that maintains insertion order.

```typescript
import { Vector } from '@calimero/sdk/collections';

const vec = new Vector<string>();

vec.push('first');
vec.push('second');
const item = vec.get(0); // 'first'
const len = vec.len(); // 2
const last = vec.pop(); // 'second'
```

## Counter

Grow-only counter (G-Counter) for distributed counting.

```typescript
import { Counter } from '@calimero/sdk/collections';

const counter = new Counter();

counter.increment();
counter.increment();
const total = counter.value(); // 2n
```

### How It Works

Each node tracks its own count. The total is the sum across all nodes.

```
Node A increments: local_count_A = 1
Node B increments: local_count_B = 1
Total = local_count_A + local_count_B = 2
```

## LwwRegister<T>

Last-Write-Wins register for single values.

```typescript
import { LwwRegister } from '@calimero/sdk/collections';

const register = new LwwRegister<string>('my_value');

register.set('hello');
const value = register.get(); // 'hello'
const timestamp = register.timestamp(); // when it was set
```

## Best Practices

### Use the Right Collection

- **UnorderedMap**: Key-value data (users, items, configs)
- **Vector**: Ordered lists (logs, history, queues)
- **Counter**: Metrics, totals, counts
- **LwwRegister**: Single values (status, config value)

### Avoid Anti-Patterns

❌ Don't use regular objects:
```typescript
// BAD - loses concurrent updates
class BadApp {
  count: number = 0; // Not a CRDT!
}
```

✅ Use CRDT collections:
```typescript
// GOOD - handles concurrent updates
class GoodApp {
  count: Counter; // CRDT!
}
```

## Performance

| Collection | Get | Set | Remove | Memory |
|------------|-----|-----|--------|--------|
| UnorderedMap | O(1) | O(1) | O(1) | O(n) |
| Vector | O(1) | O(1) | O(1) | O(n) |
| Counter | O(1) | O(1) | - | O(nodes) |
| LwwRegister | O(1) | O(1) | O(1) | O(1) |

