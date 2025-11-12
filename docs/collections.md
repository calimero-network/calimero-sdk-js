# CRDT Collections Guide

Calimero provides conflict-free replicated data types (CRDTs) for automatic state synchronization. Values are serialized with Calimero's Borsh encoder, so data written from JavaScript matches the bytes produced by Rust services as long as both sides agree on the same Borsh schema. Complex/nested structures (maps of sets, vectors of maps, etc.) now hydrate automatically thanks to the Borsh migration.

## UnorderedMap<K, V>

Last-Write-Wins map for key-value storage. Keys and values are encoded via Borsh; make sure you share the same schema with any cross-language consumers.

```typescript
import { UnorderedMap } from '@calimero/sdk/collections';

const map = new UnorderedMap<string, string>();

map.set('key', 'value');
const value = map.get('key'); // 'value'
const exists = map.has('key'); // true
map.remove('key');

// Iterate over entries, keys, values
const entries = map.entries(); // [['key1', 'value1'], ['key2', 'value2']]
const keys = map.keys(); // ['key1', 'key2']
const values = map.values(); // ['value1', 'value2']

// Nested collections work transparently
const ownerTags = new UnorderedSet<string>();
ownerTags.add('urgent');
ownerTags.add('team-alpha');

const nested = new UnorderedMap<string, UnorderedSet<string>>();
nested.set('task:123', ownerTags);

const tags = nested.get('task:123')?.toArray(); // ['urgent', 'team-alpha']
```

When a map contains another collection (or any non-primitive value), the SDK captures the nested CRDT snapshot and rewinds it on load. Make sure custom objects embed only serializable fields or provide a `toJSON()` method.
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

## UnorderedSet<T>

Last-Write-Wins set for unique membership.

```typescript
import { UnorderedSet } from '@calimero/sdk/collections';

const set = new UnorderedSet<string>();

set.add('alice'); // true on first insert
set.add('alice'); // false when already present
const present = set.has('alice'); // true
set.delete('alice');
const count = set.size(); // 0
const allValues = set.toArray(); // []

// Nested inside another collection
const map = new UnorderedMap<string, UnorderedSet<string>>();
map.set('owners', set);
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

const register = new LwwRegister<string>();

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

### Combine with View Decorators

- Initialize CRDT fields inline using the helper factories exposed from `@calimero/sdk` (`createUnorderedMap`, `createVector`, etc.). Constructors run on every invocation, so inline defaults guarantee the runtime reuses the persisted collection IDs.
- Mark selectors (`get`, `list`, `len`, etc.) with `@View()` so the dispatcher skips persistence when you only read data. This keeps the storage DAG compact and reduces gossip traffic.

### Handles, Not Deep Copies

- `map.get('key')` for a CRDT value (vector, set, nested map) returns a lightweight handle that retains the underlying CRDT ID. The host does **not** deserialize the entire structure when you fetch it.
- Mutating that handle (`vector.push`, `set.add`, etc.) issues incremental host calls that touch only the affected entries. Nested CRDTs behave the same way: a conflict on `profiles['alice'].notes` merges just that inner collection.
- The only time a full structure is materialized in JS is when you explicitly call methods like `toArray()` or return the entire map from a view.
- Under the hood the serialized value contains a sentinel such as `{"__calimeroCollection":"Vector","id":"…hex…"}`. The Rust side stores that JSON as a `Vec<u8>`, but the CRDT’s real state is keyed by the ID. When you hydrate the handle the SDK reattaches the stored ID, so subsequent operations go straight to the host functions (no deep clone or replay of the entire collection on every call).

#### Example: `UnorderedMap<string, Vector<MyStruct>>`

```
Map entry "alice" ─┬─> { "__calimeroCollection": "Vector", "id": "caf3…" }
                   │        │
                   │        └─ host keeps Vector CRDT with ID caf3… (elements are serialized MyStruct)
                   │
Contract flow:
1. const vec = profiles.get('alice') ?? new Vector<MyStruct>();
2. vec.push({ score: 10, badge: 'gold' });
3. profiles.set('alice', vec);

- Step 1 rehydrates the vector handle (ID caf3…).
- Step 2 calls `js_crdt_vector_push`, mutating the same CRDT on the host.
- Step 3 persists only the small handle wrapper; the vector contents stay in the CRDT store.
```

#### Example: `UnorderedMap<string, UnorderedSet<LwwRegister<string>>>`

```
Map entry "project-x" ─┬─> { "__calimeroCollection": "UnorderedSet", "id": "dead…" }
                       │        │
                       │        └─ host keeps Set CRDT with ID dead…
                       │            each element is a serialized LWW register handle
                       │
Set element handle     └─> { "__calimeroCollection": "LwwRegister", "id": "beef…" }

Contract flow:
1. const set = tags.get('project-x') ?? new UnorderedSet<LwwRegister<string>>();
2. const register = new LwwRegister<string>();
   register.set('critical');
3. set.add(register);
4. tags.set('project-x', set);

- Step 1 rehydrates the set handle (ID dead…).
- Step 3 calls the host to add the LWW register (ID beef…) into that set.
- Step 4 persists only the set handle; both the set and the register keep their IDs in the CRDT store.

### Rehydration

- When you call `map.get('key')` and the value is a CRDT, the host returns a tiny JSON wrapper with the CRDT ID. The JS SDK **rehydrates** the CRDT by instantiating the corresponding class (`Vector`, `UnorderedSet`, `LwwRegister`, …) and attaching that ID.
- Subsequent operations on the rehydrated instance (`push`, `add`, `set`) invoke the host functions for that ID; the host does not resend the entire structure. Only on explicit full reads (`toArray`, view returning the whole map) is the entire data set streamed back.

### Best Practices by Type

- **UnorderedMap**  
  Hydrate the existing entry before mutating (`const value = map.get(key) ?? new …`). Setting a brand-new CRDT instance replaces the stored ID and falls back to last-write-wins.

- **Vector**  
  Use `Vector.fromArray` only for initialization. For updates use `push`, `pop`, `get`, `len` to keep the existing ID. For read-heavy paths prefer `len`/`get` instead of `toArray`.

- **UnorderedSet**  
  Call `add`, `remove`, `has` on the rehydrated set. Adding a fresh `UnorderedSet` each time replaces the CRDT ID; instead reuse the handle returned by `get`.

- **Counter**  
  Keep counters inline (`createCounter()`) and use `increment`, `incrementBy`. Avoid replacing the counter with a new instance; mutate the existing handle instead.

- **LwwRegister**  
  Rehydrate the register with `map.get(key)` (or `createPrivateEntry`) and call `set`. Registers capture the last-writer timestamp; replacing the register object skips merge semantics.

- **Nested Structures**  
  Work from the inside out: hydrate the outer map, hydrate the inner CRDT, mutate it, set it back on the parent, and finally persist the parent map. Example:
  ```ts
  const set = profiles.get('alice') ?? new UnorderedSet<string>();
  set.add('blue');
  profiles.set('alice', set);
  ```
  Each layer preserves its CRDT ID, so only the mutated structure emits a delta.
```

## Performance

| Collection | Get | Set | Remove | Memory |
|------------|-----|-----|--------|--------|
| UnorderedMap | O(1) | O(1) | O(1) | O(n) |
| UnorderedSet | O(1) | O(1) | O(1) | O(n) |
| Vector | O(1) | O(1) | O(1) | O(n) |
| Counter | O(1) | O(1) | - | O(nodes) |
| LwwRegister | O(1) | O(1) | O(1) | O(1) |

